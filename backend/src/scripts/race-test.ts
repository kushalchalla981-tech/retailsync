/**
 * Live concurrency proof against Aiven PostgreSQL (`npm run test:race`).
 *
 * Scenario `last-unit` (STOCK-03): reset ELEC-009 at Bangalore Central to
 * exactly 1 unit, prepare N carts holding it, then fire N checkouts at the same
 * instant over real HTTP. The verdict is read back from PostgreSQL: exactly one
 * 201, N-1 x 409 OUT_OF_STOCK, final stock 0, units sold == stock decrement,
 * and nothing else (any 5xx / 503 CHECKOUT_BUSY is a FAIL).
 *
 * Scenario `deadlock`: N two-item carts holding ELEC-001 + ELEC-010 in
 * OPPOSITE orders (even/odd workers), K = floor(N/2) units of each. Expect
 * K x 201, N-K x 409 OUT_OF_STOCK, both products at 0 with per-product
 * conservation, and zero 503 CHECKOUT_BUSY (no 40P01 deadlock).
 *
 * Scenario `double-submit`: N simultaneous checkouts of ONE cart (ELEC-007
 * x1). Expect one 201, N-1 x 200 `replayed: true`, a single order id, one
 * order row, and a stock decrement of exactly 1.
 *
 * Each scenario prints a per-worker table and a summary line with the
 * longest single request (the worst lock wait seen by a client) and the wall
 * time of the fired batch.
 *
 * The server is an in-process Fastify app listening on 127.0.0.1:0 (default)
 * or an already running API (`--base-url`). Cleanup (unless `--keep`) deletes
 * the run's orders, carts and customers in foreign-key order, re-queries them
 * and restores touched stock to its seed-catalog value - residue or an
 * unrestored row is a FAIL.
 *
 * Usage:  npm run test:race -- [--scenario last-unit|deadlock|double-submit|all]
 *                              [--concurrency 10] [--sku ELEC-009 (last-unit)]
 *                              [--location "Bangalore Central"] [--base-url URL] [--keep]
 *
 * Not a `*.test.ts` file on purpose: it needs live Aiven and must stay out of
 * the offline `npm test` glob. The pure exports are unit-tested offline.
 */
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { errorMessage, isMainModule, runCli } from '../cli.js';
import { getPostgresConfig } from '../config.js';
import { closePgPool, getPgPool, query } from '../services/postgres.js';
import {
  assertNotProduction,
  cleanupRun,
  resolveInventoryTarget,
  restoreCatalogStock,
  setStock,
  type InventoryTarget,
  type RunRecord,
} from './live-fixtures.js';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

export const RACE_SCENARIOS = ['last-unit', 'deadlock', 'double-submit'] as const;
export type RaceScenario = (typeof RACE_SCENARIOS)[number];

export interface RaceArgs {
  concurrency: number;
  sku: string;
  location: string;
  scenario: RaceScenario | 'all';
  baseUrl?: string;
  keep: boolean;
}

export const RACE_DEFAULTS = {
  concurrency: 10,
  sku: 'ELEC-009',
  location: 'Bangalore Central',
  scenario: 'all',
} as const;

const VALUE_FLAGS = new Set(['--concurrency', '--sku', '--location', '--scenario', '--base-url']);
const BOOLEAN_FLAGS = new Set(['--keep']);

export function parseRaceArgs(args: readonly string[]): RaceArgs {
  const parsed: RaceArgs = { ...RACE_DEFAULTS, keep: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    const eq = arg.indexOf('=');
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    if (BOOLEAN_FLAGS.has(flag)) {
      if (eq > 0) throw new Error(`${flag} takes no value`);
      parsed.keep = true;
      continue;
    }
    if (!VALUE_FLAGS.has(flag)) throw new Error(`unknown argument "${arg}"`);
    let value: string | undefined;
    if (eq > 0) {
      value = arg.slice(eq + 1);
    } else {
      value = args[index + 1];
      index += 1;
    }
    if (value === undefined || value.length === 0 || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    switch (flag) {
      case '--concurrency': {
        if (!/^\d+$/.test(value)) throw new Error('--concurrency must be an integer between 2 and 50');
        const concurrency = Number(value);
        if (concurrency < 2 || concurrency > 50) throw new Error('--concurrency must be an integer between 2 and 50');
        parsed.concurrency = concurrency;
        break;
      }
      case '--sku':
        parsed.sku = value;
        break;
      case '--location':
        parsed.location = value;
        break;
      case '--scenario': {
        const scenario = [...RACE_SCENARIOS, 'all'].find((name) => name === value);
        if (scenario === undefined) throw new Error(`--scenario must be one of ${[...RACE_SCENARIOS, 'all'].join(', ')}`);
        parsed.scenario = scenario as RaceArgs['scenario'];
        break;
      }
      case '--base-url': {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          throw new Error('--base-url must be an http(s) URL');
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('--base-url must be an http(s) URL');
        parsed.baseUrl = value.replace(/\/+$/, '');
        break;
      }
    }
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Pure verdict helpers
// ---------------------------------------------------------------------------

export interface WorkerResult {
  worker: number;
  status: number;
  code?: string;
  orderId?: string;
  replayed?: boolean;
  startedAt: number;
  endedAt: number;
}

/** Largest number of requests simultaneously in flight (a back-to-back end/start does not overlap). */
export function maxInFlight(results: readonly { startedAt: number; endedAt: number }[]): number {
  const points = results.flatMap((result) => [
    { at: result.startedAt, delta: 1 },
    { at: result.endedAt, delta: -1 },
  ]);
  points.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let max = 0;
  for (const point of points) {
    current += point.delta;
    max = Math.max(max, current);
  }
  return max;
}

export interface ProductObservation {
  sku: string;
  initial: number;
  final: number;
  /** Units of this product in the run's committed order_items. */
  unitsSold: number;
}

export interface ScenarioObservation {
  results: WorkerResult[];
  products: ProductObservation[];
  /** Committed orders for the run's carts (read from PostgreSQL). */
  orderCount: number;
}

export interface ScenarioExpectation {
  /** Exact number of 201 responses. */
  created: number;
  /** Exact number of 409 OUT_OF_STOCK responses. */
  outOfStock: number;
  /** Exact number of 200 `replayed: true` responses; 200 replays are only allowed when > 0 (default 0). */
  replayed?: number;
  /** Every 201/200 response must carry the same order id (double submit of one cart). */
  singleOrderId?: boolean;
  /** Final stock per SKU. */
  finalStock: Record<string, number>;
  /** Minimum observed overlap for the run to count as a race (default 2). */
  minInFlight?: number;
}

export interface ScenarioVerdict {
  pass: boolean;
  failures: string[];
}

function outcomeKey(result: WorkerResult): string {
  if (result.status === 200 && result.replayed === true) return '200 replayed';
  return result.code ? `${result.status} ${result.code}` : String(result.status);
}

const isReplay = (result: WorkerResult): boolean => result.status === 200 && result.replayed === true;

export function evaluateScenario(observation: ScenarioObservation, expectation: ScenarioExpectation): ScenarioVerdict {
  const failures: string[] = [];
  const { results } = observation;
  const expectedReplays = expectation.replayed ?? 0;
  const created = results.filter((result) => result.status === 201);
  const outOfStock = results.filter((result) => result.status === 409 && result.code === 'OUT_OF_STOCK');
  const replays = results.filter(isReplay);

  if (created.length !== expectation.created) {
    failures.push(`expected ${expectation.created} x 201, got ${created.length}`);
  }
  if (outOfStock.length !== expectation.outOfStock) {
    failures.push(`expected ${expectation.outOfStock} x 409 OUT_OF_STOCK, got ${outOfStock.length}`);
  }
  if (expectedReplays > 0 && replays.length !== expectedReplays) {
    failures.push(`expected ${expectedReplays} x 200 replayed, got ${replays.length}`);
  }

  // Anything other than the expected outcomes - in particular any 5xx, 503
  // CHECKOUT_BUSY (deadlock / lock timeout) or network error - fails the run.
  const unexpected = new Map<string, number>();
  for (const result of results) {
    const allowed =
      result.status === 201 ||
      (result.status === 409 && result.code === 'OUT_OF_STOCK') ||
      (expectedReplays > 0 && isReplay(result));
    if (!allowed) unexpected.set(outcomeKey(result), (unexpected.get(outcomeKey(result)) ?? 0) + 1);
  }
  for (const [key, count] of unexpected) {
    const label = key.startsWith('5') ? 'server error' : 'unexpected response';
    failures.push(`${label}: ${count} x ${key}`);
  }

  for (const product of observation.products) {
    const expectedFinal = expectation.finalStock[product.sku];
    if (expectedFinal !== undefined && product.final !== expectedFinal) {
      failures.push(`${product.sku} final stock ${product.final}, expected ${expectedFinal}`);
    }
    if (product.final < 0) failures.push(`${product.sku} stock went negative (${product.final})`);
    if (product.unitsSold !== product.initial - product.final) {
      failures.push(
        `${product.sku} units sold ${product.unitsSold} != stock decrement ${product.initial - product.final} (${product.initial} -> ${product.final})`,
      );
    }
  }

  if (observation.orderCount !== created.length) {
    failures.push(`order count ${observation.orderCount} != successful checkouts ${created.length}`);
  }

  if (expectation.singleOrderId) {
    const orderIds = new Set(
      results.filter((result) => result.status === 201 || isReplay(result)).map((result) => result.orderId),
    );
    if (orderIds.size !== 1) failures.push(`${orderIds.size} distinct order ids, expected exactly 1`);
  }

  const overlap = maxInFlight(results);
  const minInFlight = expectation.minInFlight ?? 2;
  if (overlap < minInFlight) {
    failures.push(`inconclusive: max in-flight ${overlap} < ${minInFlight}, the requests did not actually race`);
  }

  return { pass: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Live harness
// ---------------------------------------------------------------------------

interface Harness {
  baseUrl: string;
  inProcess: boolean;
  runId: string;
  record: RunRecord & { orderIds: string[] };
  targets: InventoryTarget[];
}

interface HttpResult {
  status: number;
  // Response bodies are untyped JSON.
  body: any;
}

async function http(harness: Harness, method: 'GET' | 'POST', path: string, payload?: unknown): Promise<HttpResult> {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method,
    headers: payload === undefined ? {} : { 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function createCartWith(
  harness: Harness,
  locationId: string,
  lines: readonly { productId: string; quantity: number }[],
): Promise<string> {
  const created = await http(harness, 'POST', '/api/carts', { locationId });
  const cartId: unknown = created.body?.cart?.id;
  if (typeof cartId === 'string') harness.record.cartIds.push(cartId);
  if (created.status !== 201 || typeof cartId !== 'string') {
    throw new Error(`setup: create cart returned HTTP ${created.status}`);
  }
  for (const line of lines) {
    const added = await http(harness, 'POST', `/api/carts/${cartId}/items`, line);
    if (added.status !== 200) throw new Error(`setup: add item returned HTTP ${added.status}`);
  }
  return cartId;
}

function checkoutThunk(harness: Harness, worker: number, cartId: string, email: string): () => Promise<WorkerResult> {
  return async () => {
    const startedAt = performance.now();
    try {
      const result = await http(harness, 'POST', `/api/carts/${cartId}/checkout`, {
        customer: { name: `Race Worker ${worker}`, email },
      });
      const endedAt = performance.now();
      const orderId: unknown = result.body?.order?.id;
      const code: unknown = result.body?.error?.code;
      if (typeof orderId === 'string') harness.record.orderIds.push(orderId);
      return {
        worker,
        status: result.status,
        ...(typeof code === 'string' ? { code } : {}),
        ...(typeof orderId === 'string' ? { orderId } : {}),
        ...(typeof result.body?.replayed === 'boolean' ? { replayed: result.body.replayed } : {}),
        startedAt,
        endedAt,
      };
    } catch (error) {
      return { worker, status: 0, code: `NETWORK_ERROR ${errorMessage(error)}`, startedAt, endedAt: performance.now() };
    }
  };
}

/** Open (and release) pool clients up front so the race measures locking, not TLS handshakes. */
async function prewarmPool(harness: Harness, concurrency: number): Promise<void> {
  if (!harness.inProcess) return;
  const poolMax = getPostgresConfig().pool.max;
  if (poolMax < concurrency) {
    console.warn(
      `WARN: PG_POOL_MAX=${poolMax} < concurrency ${concurrency}; extra checkouts will queue in the client pool (raise PG_POOL_MAX to race them all in PostgreSQL)`,
    );
  }
  const pool = getPgPool();
  const clients = await Promise.all(Array.from({ length: Math.min(concurrency, poolMax) }, () => pool.connect()));
  for (const client of clients) client.release();
}

/** Start every checkout in one synchronous map so they leave together. */
async function fire(thunks: readonly (() => Promise<WorkerResult>)[]): Promise<{ results: WorkerResult[]; wallMs: number }> {
  const started = performance.now();
  const results = await Promise.all(thunks.map((thunk) => thunk()));
  return { results, wallMs: Math.round(performance.now() - started) };
}

async function readOutcome(
  cartIds: readonly string[],
  targets: readonly { target: InventoryTarget; initial: number }[],
): Promise<{ products: ProductObservation[]; orderCount: number }> {
  const orders = await query<{ orders: number }>(
    'SELECT count(*)::int AS orders FROM orders WHERE cart_id = ANY($1::uuid[])',
    [cartIds],
  );
  const sold = await query<{ product_id: string; units: number }>(
    `SELECT oi.product_id::text AS product_id, sum(oi.quantity)::int AS units
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.cart_id = ANY($1::uuid[])
      GROUP BY oi.product_id`,
    [cartIds],
  );
  const stock = await query<{ id: string; stock_quantity: number }>(
    'SELECT id::text AS id, stock_quantity FROM inventory WHERE id = ANY($1::bigint[])',
    [targets.map(({ target }) => target.inventoryId)],
  );
  const unitsByProduct = new Map(sold.rows.map((row) => [String(row.product_id), Number(row.units)]));
  const stockById = new Map(stock.rows.map((row) => [String(row.id), Number(row.stock_quantity)]));
  return {
    orderCount: Number(orders.rows[0]?.orders ?? 0),
    products: targets.map(({ target, initial }) => ({
      sku: target.sku,
      initial,
      final: stockById.get(target.inventoryId) ?? Number.NaN,
      unitsSold: unitsByProduct.get(target.productId) ?? 0,
    })),
  };
}

function printTable(results: readonly WorkerResult[]): void {
  console.log('  worker  status  code                  ms');
  for (const result of [...results].sort((a, b) => a.worker - b.worker)) {
    const code = result.code ?? (result.replayed ? 'replayed' : result.status === 201 ? 'created' : '-');
    console.log(
      `  ${String(result.worker).padStart(6)}  ${String(result.status).padStart(6)}  ${code.padEnd(20)}  ${String(
        Math.round(result.endedAt - result.startedAt),
      ).padStart(6)}`,
    );
  }
}

function tally(results: readonly WorkerResult[]): string {
  const counts = new Map<string, number>();
  for (const result of results) counts.set(outcomeKey(result), (counts.get(outcomeKey(result)) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${count} x ${key}`)
    .join(', ');
}

export interface ScenarioOutcome {
  name: string;
  pass: boolean;
  failures: string[];
  summary: string;
}

function longestRequest(results: readonly WorkerResult[]): number {
  return Math.round(Math.max(0, ...results.map((result) => result.endedAt - result.startedAt)));
}

function report(
  name: string,
  observation: ScenarioObservation,
  verdict: ScenarioVerdict,
  wallMs: number,
): ScenarioOutcome {
  printTable(observation.results);
  const stock = observation.products
    .map((product) => `${product.sku} ${product.initial} -> ${product.final} (sold ${product.unitsSold})`)
    .join(', ');
  const summary = `${tally(observation.results)} | ${stock} | orders ${observation.orderCount} | max in-flight ${maxInFlight(
    observation.results,
  )} | longest request ${longestRequest(observation.results)} ms | wall ${wallMs} ms`;
  for (const failure of verdict.failures) console.log(`  FAIL: ${failure}`);
  console.log(`[${name}] ${summary} | ${verdict.pass ? 'PASS' : 'FAIL'}\n`);
  return { name, pass: verdict.pass, failures: verdict.failures, summary };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function lastUnit(harness: Harness, args: RaceArgs): Promise<ScenarioOutcome> {
  const name = 'last-unit';
  const target = await resolveInventoryTarget(args.sku, args.location);
  harness.targets.push(target);
  await setStock(target.inventoryId, 1);
  console.log(`[${name}] ${target.sku} @ ${target.locationName}: stock set to 1; preparing ${args.concurrency} carts`);

  const cartIds: string[] = [];
  for (let worker = 1; worker <= args.concurrency; worker += 1) {
    cartIds.push(await createCartWith(harness, target.locationId, [{ productId: target.productId, quantity: 1 }]));
  }
  const thunks = cartIds.map((cartId, index) => {
    const email = `race-${harness.runId}-${index + 1}@example.com`;
    harness.record.emails.push(email);
    return checkoutThunk(harness, index + 1, cartId, email);
  });

  await prewarmPool(harness, args.concurrency);
  console.log(`[${name}] firing ${args.concurrency} simultaneous checkouts`);
  const { results, wallMs } = await fire(thunks);
  const outcome = await readOutcome(cartIds, [{ target, initial: 1 }]);
  const observation: ScenarioObservation = { results, ...outcome };
  const verdict = evaluateScenario(observation, {
    created: 1,
    outOfStock: args.concurrency - 1,
    finalStock: { [target.sku]: 0 },
  });
  return report(name, observation, verdict, wallMs);
}

export const DEADLOCK_SKUS = ['ELEC-001', 'ELEC-010'] as const;
export const DOUBLE_SUBMIT_SKU = 'ELEC-007';

/**
 * Multi-item deadlock safety: every cart holds BOTH products, even workers
 * listing ELEC-001 first and odd workers ELEC-010 first. Locking per item in
 * cart order would deadlock (40P01 -> 503); locking ORDER BY id must not.
 * Stock is K = floor(N/2) of each, so exactly K checkouts can win.
 */
async function deadlock(harness: Harness, args: RaceArgs): Promise<ScenarioOutcome> {
  const name = 'deadlock';
  const [first, second] = await Promise.all(DEADLOCK_SKUS.map((sku) => resolveInventoryTarget(sku, args.location)));
  if (!first || !second) throw new Error('deadlock targets not resolved');
  const winners = Math.floor(args.concurrency / 2);
  for (const target of [first, second]) {
    harness.targets.push(target);
    await setStock(target.inventoryId, winners);
  }
  console.log(
    `[${name}] ${first.sku} + ${second.sku} @ ${first.locationName}: stock set to ${winners} each; preparing ${args.concurrency} carts in opposite item orders`,
  );

  const cartIds: string[] = [];
  for (let worker = 1; worker <= args.concurrency; worker += 1) {
    const ordered = worker % 2 === 0 ? [first, second] : [second, first];
    cartIds.push(
      await createCartWith(
        harness,
        first.locationId,
        ordered.map((target) => ({ productId: target.productId, quantity: 1 })),
      ),
    );
  }
  const thunks = cartIds.map((cartId, index) => {
    const email = `race-${harness.runId}-dl-${index + 1}@example.com`;
    harness.record.emails.push(email);
    return checkoutThunk(harness, index + 1, cartId, email);
  });

  await prewarmPool(harness, args.concurrency);
  console.log(`[${name}] firing ${args.concurrency} simultaneous two-item checkouts`);
  const { results, wallMs } = await fire(thunks);
  const outcome = await readOutcome(cartIds, [
    { target: first, initial: winners },
    { target: second, initial: winners },
  ]);
  const observation: ScenarioObservation = { results, ...outcome };
  const verdict = evaluateScenario(observation, {
    created: winners,
    outOfStock: args.concurrency - winners,
    finalStock: { [first.sku]: 0, [second.sku]: 0 },
  });
  return report(name, observation, verdict, wallMs);
}

/**
 * Double submit: N simultaneous checkouts of the SAME cart. The cart row lock
 * serializes them; exactly one places the order, the rest replay it.
 */
async function doubleSubmit(harness: Harness, args: RaceArgs): Promise<ScenarioOutcome> {
  const name = 'double-submit';
  const target = await resolveInventoryTarget(DOUBLE_SUBMIT_SKU, args.location);
  harness.targets.push(target);
  const before = target.stock;
  if (before < 1) throw new Error(`${target.sku} at ${target.locationName} has no stock - run \`npm run seed\``);
  console.log(`[${name}] ${target.sku} @ ${target.locationName}: stock ${before}; one cart, ${args.concurrency} submits`);

  const cartId = await createCartWith(harness, target.locationId, [{ productId: target.productId, quantity: 1 }]);
  const email = `race-${harness.runId}-ds@example.com`;
  harness.record.emails.push(email);
  const thunks = Array.from({ length: args.concurrency }, (_, index) => checkoutThunk(harness, index + 1, cartId, email));

  await prewarmPool(harness, args.concurrency);
  console.log(`[${name}] firing ${args.concurrency} simultaneous checkouts of cart ${cartId}`);
  const { results, wallMs } = await fire(thunks);
  const outcome = await readOutcome([cartId], [{ target, initial: before }]);
  const observation: ScenarioObservation = { results, ...outcome };
  const verdict = evaluateScenario(observation, {
    created: 1,
    outOfStock: 0,
    replayed: args.concurrency - 1,
    singleOrderId: true,
    finalStock: { [target.sku]: before - 1 },
  });
  return report(name, observation, verdict, wallMs);
}

const SCENARIO_RUNNERS: Record<RaceScenario, (harness: Harness, args: RaceArgs) => Promise<ScenarioOutcome>> = {
  'last-unit': lastUnit,
  deadlock,
  'double-submit': doubleSubmit,
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let activeApp: FastifyInstance | undefined;

async function main(argv: readonly string[]): Promise<void> {
  const args = parseRaceArgs(argv);
  // Fail fast with variable names (never values) when PostgreSQL is not configured.
  getPostgresConfig();
  assertNotProduction();

  let baseUrl = args.baseUrl;
  if (baseUrl === undefined) {
    const app = buildApp({ logLevel: 'warn' });
    activeApp = app;
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  const harness: Harness = {
    baseUrl,
    inProcess: args.baseUrl === undefined,
    runId: `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`,
    record: { cartIds: [], emails: [], orderIds: [] },
    targets: [],
  };
  console.log(
    `RetailSync live checkout race (run ${harness.runId}, ${harness.inProcess ? 'in-process API' : 'remote API'} ${baseUrl}, concurrency ${args.concurrency})\n`,
  );

  const outcomes: ScenarioOutcome[] = [];
  const problems: string[] = [];
  const selected: readonly RaceScenario[] = args.scenario === 'all' ? RACE_SCENARIOS : [args.scenario];
  try {
    for (const scenario of selected) {
      try {
        outcomes.push(await SCENARIO_RUNNERS[scenario](harness, args));
      } catch (error) {
        // A failed scenario never skips the others or the cleanup below.
        outcomes.push({ name: scenario, pass: false, failures: [errorMessage(error)], summary: `aborted: ${errorMessage(error)}` });
        console.log(`[${scenario}] FAIL: ${errorMessage(error)}\n`);
      }
    }
  } finally {
    if (args.keep) {
      console.log(
        `--keep: left ${harness.record.cartIds.length} cart(s), ${harness.record.orderIds.length} order(s) and the touched stock in place (npm run seed resets stock)`,
      );
    } else {
      try {
        const residue = await cleanupRun(harness.record);
        const restore = await restoreCatalogStock(harness.targets);
        problems.push(...residue, ...restore);
        const restored = harness.targets.map((target) => target.sku).join(', ') || 'none';
        console.log(
          `cleanup: ${harness.record.cartIds.length} cart(s), ${new Set(harness.record.orderIds).size} order(s), ${harness.record.emails.length} run email(s) -> ${
            residue.length === 0 ? '0 rows remain' : residue.join('; ')
          }; stock restored to seed values (${restored}) -> ${restore.length === 0 ? 'verified' : restore.join('; ')}`,
        );
      } catch (error) {
        problems.push(`cleanup failed: ${errorMessage(error)}`);
      }
    }
  }

  console.log('\nSummary');
  for (const outcome of outcomes) console.log(`  ${outcome.pass ? 'PASS' : 'FAIL'}  ${outcome.name}: ${outcome.summary}`);
  for (const problem of problems) console.log(`  FAIL  cleanup: ${problem}`);
  const failed = outcomes.filter((outcome) => !outcome.pass).length + (problems.length > 0 ? 1 : 0);
  console.log(failed === 0 ? '\nPASS: no oversell, no deadlock, no residue' : `\nFAIL: ${failed} check(s) failed`);
  if (failed > 0) throw new Error(`${failed} check(s) failed`);
}

if (isMainModule(import.meta.url)) {
  await runCli('test:race', main, async () => {
    if (activeApp) {
      // app.close() runs the onClose hook, which closes the pg pool.
      await activeApp.close();
    } else {
      await closePgPool();
    }
  });
}
