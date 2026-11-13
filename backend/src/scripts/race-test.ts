/**
 * Live concurrency proof against Aiven PostgreSQL (`npm run test:race`).
 *
 * Scenario `last-unit` (STOCK-03): reset ELEC-009 at Bangalore Central to
 * exactly 1 unit, prepare N carts holding it, then fire N checkouts at the same
 * instant over real HTTP. The verdict is read back from PostgreSQL: exactly one
 * 201, N-1 x 409 OUT_OF_STOCK, final stock 0, units sold == stock decrement,
 * and nothing else (any 5xx / 503 CHECKOUT_BUSY is a FAIL).
 *
 * The server is an in-process Fastify app listening on 127.0.0.1:0 (default)
 * or an already running API (`--base-url`). Cleanup (unless `--keep`) deletes
 * the run's orders, carts and customers in foreign-key order, re-queries them
 * and restores touched stock to its seed-catalog value - residue or an
 * unrestored row is a FAIL.
 *
 * Usage:  npm run test:race -- [--concurrency 10] [--sku ELEC-009]
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

export interface RaceArgs {
  concurrency: number;
  sku: string;
  location: string;
  baseUrl?: string;
  keep: boolean;
}

export const RACE_DEFAULTS = {
  concurrency: 10,
  sku: 'ELEC-009',
  location: 'Bangalore Central',
} as const;

const VALUE_FLAGS = new Set(['--concurrency', '--sku', '--location', '--base-url']);
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
  return result.code ? `${result.status} ${result.code}` : String(result.status);
}

export function evaluateScenario(observation: ScenarioObservation, expectation: ScenarioExpectation): ScenarioVerdict {
  const failures: string[] = [];
  const { results } = observation;
  const created = results.filter((result) => result.status === 201);
  const outOfStock = results.filter((result) => result.status === 409 && result.code === 'OUT_OF_STOCK');

  if (created.length !== expectation.created) {
    failures.push(`expected ${expectation.created} x 201, got ${created.length}`);
  }
  if (outOfStock.length !== expectation.outOfStock) {
    failures.push(`expected ${expectation.outOfStock} x 409 OUT_OF_STOCK, got ${outOfStock.length}`);
  }

  const unexpected = new Map<string, number>();
  for (const result of results) {
    const allowed = result.status === 201 || (result.status === 409 && result.code === 'OUT_OF_STOCK');
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
  for (const result of results) {
    const key = result.status === 200 && result.replayed ? '200 replayed' : outcomeKey(result);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
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
  try {
    try {
      outcomes.push(await lastUnit(harness, args));
    } catch (error) {
      outcomes.push({ name: 'last-unit', pass: false, failures: [errorMessage(error)], summary: 'aborted' });
      console.log(`[last-unit] FAIL: ${errorMessage(error)}\n`);
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
