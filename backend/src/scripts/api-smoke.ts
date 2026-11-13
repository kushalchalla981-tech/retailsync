/**
 * Live API smoke run against Aiven PostgreSQL (`npm run test:api`).
 *
 * Builds the real app (default pgDatabase) and drives it with `app.inject`, so
 * every route, validation and SQL path is exercised end to end without opening
 * a port. Prints one PASS / FAIL line per step; exit code 1 if any step fails.
 *
 * Steps are an ordered list of named async functions sharing a `SmokeState`
 * (ids discovered by earlier steps), so later plans append steps rather than
 * rewrite the runner. Every cart / customer id a step creates is recorded in
 * the state; cleanup deletes them with parameterized SQL (even after failures)
 * and then re-queries to prove no smoke rows remain - residue is a FAIL.
 *
 * Stock is only asserted as `>= 0`: the checkout race test legitimately
 * changes it. Credentials are never printed.
 *
 * Not a `*.test.ts` file on purpose: it needs live Aiven and must stay out of
 * the offline `npm test` glob.
 */
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { errorMessage, isMainModule, runCli } from '../cli.js';
import { getPostgresConfig } from '../config.js';
import type { Queryable } from '../store/db.js';
import { pgDatabase } from '../store/db.js';

// ---------------------------------------------------------------------------
// Step model
// ---------------------------------------------------------------------------

export interface SmokeState {
  ps5Id?: string;
  /** Store ids by name, from GET /api/locations. */
  locations: Record<string, string>;
  /** Product ids and prices by SKU, from catalog listings. */
  products: Record<string, { id: string; price: number }>;
  /** Every cart created by this run (deleted in cleanup). */
  cartIds: string[];
  /** Every customer created by this run (deleted in cleanup). */
  customerIds: string[];
}

export interface SmokeContext {
  app: FastifyInstance;
  state: SmokeState;
}

export interface SmokeStep {
  name: string;
  /** Throw (e.g. via `expect`) to fail; an optional returned string is printed as detail. */
  run(ctx: SmokeContext): Promise<string | void>;
}

export class SmokeFailure extends Error {
  override name = 'SmokeFailure';
}

export function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeFailure(message);
}

export function newSmokeState(): SmokeState {
  return { locations: {}, products: {}, cartIds: [], customerIds: [] };
}

// Response bodies are untyped JSON; steps assert on their shape.
export type Json = any;

export interface CallResult {
  status: number;
  body: Json;
}

export async function call(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
): Promise<CallResult> {
  const response = await app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  let body: Json = null;
  try {
    body = response.json();
  } catch {
    body = response.body;
  }
  return { status: response.statusCode, body };
}

function describeError(result: CallResult): string {
  const code = result.body?.error?.code;
  return code ? ` (${String(code)})` : '';
}

export function expectStatus(result: CallResult, status: number, what: string): void {
  expect(result.status === status, `${what}: expected HTTP ${status}, got ${result.status}${describeError(result)}`);
}

function requireValue<T>(value: T | undefined, what: string): T {
  expect(value !== undefined, `prerequisite missing: ${what} (an earlier step failed)`);
  return value;
}

// ---------------------------------------------------------------------------
// Catalog steps
// ---------------------------------------------------------------------------

export const catalogSteps: SmokeStep[] = [
  {
    name: 'GET /api/products?category=electronics',
    async run({ app, state }) {
      const result = await call(app, 'GET', '/api/products?category=electronics&limit=100');
      expectStatus(result, 200, 'list electronics');
      const items: Json[] = result.body.items;
      expect(Array.isArray(items) && items.length >= 1, 'expected at least 1 electronics product');
      expect(
        items.every((item) => item.category?.slug === 'electronics'),
        'every item must have category.slug electronics',
      );
      for (const item of items) state.products[item.sku] = { id: item.id, price: item.price };
      const ps5 = items.find((item) => item.sku === 'ELEC-009');
      expect(ps5, 'ELEC-009 not in the electronics listing');
      expect(Array.isArray(ps5.inventory) && ps5.inventory.length === 3, 'ELEC-009 must have 3 inventory entries');
      expect(typeof ps5.id === 'string', 'product ids must be strings');
      state.ps5Id = ps5.id;
      return `${items.length} item(s), ELEC-009 id ${ps5.id} stocked at ${ps5.inventory.length} store(s)`;
    },
  },
  {
    name: 'GET /api/products?city=Bangalore&inStock=true',
    async run({ app }) {
      const result = await call(app, 'GET', '/api/products?city=Bangalore&inStock=true&limit=100');
      expectStatus(result, 200, 'list in-stock Bangalore products');
      const items: Json[] = result.body.items;
      expect(Array.isArray(items) && items.length >= 1, 'expected at least 1 in-stock Bangalore product');
      const bad = items.filter(
        (item) =>
          !item.inventory.some((entry: Json) => entry.city === 'Bangalore' && entry.stockQuantity > 0),
      );
      expect(bad.length === 0, `${bad.length} item(s) lack Bangalore stock`);
      return `${items.length} item(s), total ${result.body.total}`;
    },
  },
  {
    name: 'GET /api/products?limit=0 -> 400 VALIDATION_FAILED',
    async run({ app }) {
      const result = await call(app, 'GET', '/api/products?limit=0');
      expectStatus(result, 400, 'limit=0');
      expect(result.body?.error?.code === 'VALIDATION_FAILED', 'error.code must be VALIDATION_FAILED');
      expect(typeof result.body.error.requestId === 'string', 'error.requestId missing');
      return `issues: ${result.body.error.details.issues.map((issue: Json) => issue.path).join(', ')}`;
    },
  },
  {
    name: 'GET /api/categories',
    async run({ app }) {
      const result = await call(app, 'GET', '/api/categories');
      expectStatus(result, 200, 'list categories');
      const items: Json[] = result.body.items;
      expect(Array.isArray(items) && items.length === 6, `expected 6 categories, got ${items?.length}`);
      const electronics = items.find((item) => item.slug === 'electronics');
      expect(electronics, 'electronics category missing');
      expect(typeof electronics.productCount === 'number' && electronics.productCount >= 1, 'electronics productCount must be >= 1');
      return `${items.length} categories, electronics has ${electronics.productCount} active product(s)`;
    },
  },
  {
    name: 'GET /api/locations',
    async run({ app, state }) {
      const result = await call(app, 'GET', '/api/locations');
      expectStatus(result, 200, 'list locations');
      const items: Json[] = result.body.items;
      expect(Array.isArray(items) && items.length === 3, `expected 3 locations, got ${items?.length}`);
      for (const item of items) state.locations[item.name] = item.id;
      expect(state.locations['Bangalore Central'], 'Bangalore Central missing');
      return items.map((item) => `${item.name} (${item.city}) #${item.id}`).join(', ');
    },
  },
  {
    name: 'GET /api/products/{ELEC-009}',
    async run({ app, state }) {
      const ps5Id = requireValue(state.ps5Id, 'ELEC-009 id');
      const result = await call(app, 'GET', `/api/products/${ps5Id}`);
      expectStatus(result, 200, 'product detail');
      expect(result.body.product?.sku === 'ELEC-009', 'expected sku ELEC-009');
      return `${result.body.product.name}, price ${result.body.product.price}, totalStock ${result.body.product.totalStock}`;
    },
  },
  {
    name: 'GET /api/products/999999999 -> 404 PRODUCT_NOT_FOUND',
    async run({ app }) {
      const result = await call(app, 'GET', '/api/products/999999999');
      expectStatus(result, 404, 'unknown product');
      expect(result.body?.error?.code === 'PRODUCT_NOT_FOUND', 'error.code must be PRODUCT_NOT_FOUND');
    },
  },
  {
    name: 'GET /api/inventory?productId={ELEC-009}&locationId={Bangalore Central}',
    async run({ app, state }) {
      const ps5Id = requireValue(state.ps5Id, 'ELEC-009 id');
      const bangaloreId = requireValue(state.locations['Bangalore Central'], 'Bangalore Central id');
      const result = await call(app, 'GET', `/api/inventory?productId=${ps5Id}&locationId=${bangaloreId}`);
      expectStatus(result, 200, 'inventory lookup');
      const items: Json[] = result.body.items;
      expect(Array.isArray(items) && items.length === 1, `expected exactly 1 inventory row, got ${items?.length}`);
      expect(Number.isInteger(items[0].stockQuantity) && items[0].stockQuantity >= 0, 'stockQuantity must be an integer >= 0');
      return `stockQuantity ${items[0].stockQuantity}`;
    },
  },
  {
    name: 'GET /api/products?locationId={Bangalore Central}',
    async run({ app, state }) {
      const bangaloreId = requireValue(state.locations['Bangalore Central'], 'Bangalore Central id');
      const result = await call(app, 'GET', `/api/products?locationId=${bangaloreId}&limit=100`);
      expectStatus(result, 200, 'list by location');
      const items: Json[] = result.body.items;
      expect(Array.isArray(items) && items.length >= 1, 'expected at least 1 product at Bangalore Central');
      expect(
        items.every((item) => item.inventory.some((entry: Json) => entry.locationId === bangaloreId)),
        'every item must carry an inventory entry for Bangalore Central',
      );
      for (const item of items) state.products[item.sku] = { id: item.id, price: item.price };
      return `${items.length} item(s)`;
    },
  },
];

// ---------------------------------------------------------------------------
// Cart steps (Bangalore Central; every created cart is recorded for cleanup)
// ---------------------------------------------------------------------------

function product(state: SmokeState, sku: string): { id: string; price: number } {
  return requireValue(state.products[sku], `${sku} id`);
}

function cartLine(cart: Json, productId: string): Json {
  return cart.items.find((item: Json) => item.productId === productId);
}

/** Id of the main smoke cart (first cart created by the run). */
function mainCartId(state: SmokeState): string {
  return requireValue(state.cartIds[0], 'smoke cart id');
}

export const cartSteps: SmokeStep[] = [
  {
    name: 'POST /api/carts {Bangalore Central} -> 201',
    async run({ app, state }) {
      const bangaloreId = requireValue(state.locations['Bangalore Central'], 'Bangalore Central id');
      const result = await call(app, 'POST', '/api/carts', { locationId: bangaloreId });
      if (typeof result.body?.cart?.id === 'string') state.cartIds.push(result.body.cart.id);
      expectStatus(result, 201, 'create cart');
      const { cart } = result.body;
      expect(cart.status === 'active', 'new cart must be active');
      expect(cart.items.length === 0 && cart.subtotal === 0 && cart.itemCount === 0, 'new cart must be empty');
      expect(cart.location?.name === 'Bangalore Central', 'cart location must be Bangalore Central');
      return `cart ${cart.id}`;
    },
  },
  {
    name: 'POST items ELEC-001 x2 then x1 -> line quantity 3',
    async run({ app, state }) {
      const cartId = mainCartId(state);
      const elec001 = product(state, 'ELEC-001');
      const first = await call(app, 'POST', `/api/carts/${cartId}/items`, { productId: elec001.id, quantity: 2 });
      expectStatus(first, 200, 'add ELEC-001 x2');
      const second = await call(app, 'POST', `/api/carts/${cartId}/items`, { productId: elec001.id, quantity: 1 });
      expectStatus(second, 200, 'add ELEC-001 x1');
      const line = cartLine(second.body.cart, elec001.id);
      expect(line?.quantity === 3, `expected line quantity 3, got ${line?.quantity}`);
      return `lineTotal ${line.lineTotal}, subtotal ${second.body.cart.subtotal}`;
    },
  },
  {
    name: 'POST items ELEC-001 x97 -> 422 QUANTITY_LIMIT_EXCEEDED (line would be 100)',
    async run({ app, state }) {
      const cartId = mainCartId(state);
      const elec001 = product(state, 'ELEC-001');
      const result = await call(app, 'POST', `/api/carts/${cartId}/items`, { productId: elec001.id, quantity: 97 });
      expectStatus(result, 422, 'add beyond 99');
      expect(result.body?.error?.code === 'QUANTITY_LIMIT_EXCEEDED', 'error.code must be QUANTITY_LIMIT_EXCEEDED');
    },
  },
  {
    name: 'PUT items/ELEC-001 {quantity: 1}',
    async run({ app, state }) {
      const cartId = mainCartId(state);
      const elec001 = product(state, 'ELEC-001');
      const result = await call(app, 'PUT', `/api/carts/${cartId}/items/${elec001.id}`, { quantity: 1 });
      expectStatus(result, 200, 'set ELEC-001 quantity');
      const line = cartLine(result.body.cart, elec001.id);
      expect(line?.quantity === 1, `expected quantity 1, got ${line?.quantity}`);
    },
  },
  {
    name: 'POST items ELEC-010, then DELETE items/ELEC-010',
    async run({ app, state }) {
      const cartId = mainCartId(state);
      const elec010 = product(state, 'ELEC-010');
      const added = await call(app, 'POST', `/api/carts/${cartId}/items`, { productId: elec010.id });
      expectStatus(added, 200, 'add ELEC-010');
      expect(cartLine(added.body.cart, elec010.id)?.quantity === 1, 'ELEC-010 must be in the cart with quantity 1');
      const removed = await call(app, 'DELETE', `/api/carts/${cartId}/items/${elec010.id}`);
      expectStatus(removed, 200, 'remove ELEC-010');
      expect(!cartLine(removed.body.cart, elec010.id), 'ELEC-010 must be gone');
    },
  },
  {
    name: 'GET /api/carts/{id} -> 1 item, subtotal = ELEC-001 price',
    async run({ app, state }) {
      const cartId = mainCartId(state);
      const elec001 = product(state, 'ELEC-001');
      const result = await call(app, 'GET', `/api/carts/${cartId}`);
      expectStatus(result, 200, 'read cart');
      const { cart } = result.body;
      expect(cart.items.length === 1, `expected 1 item, got ${cart.items.length}`);
      expect(cart.itemCount === 1, `expected itemCount 1, got ${cart.itemCount}`);
      expect(cart.subtotal === elec001.price, `subtotal ${cart.subtotal} must equal ELEC-001 price ${elec001.price}`);
      const line = cart.items[0];
      expect(Number.isInteger(line.availableQuantity) && line.availableQuantity >= 0, 'availableQuantity must be >= 0');
      expect(cart.orderId === null, 'an active cart has no order');
      return `subtotal ${cart.subtotal}, availableQuantity ${line.availableQuantity} at ${cart.location.name}`;
    },
  },
  {
    name: 'PATCH /api/carts/{id} {Mumbai Metro} -> location.city Mumbai',
    async run({ app, state }) {
      const cartId = mainCartId(state);
      const mumbaiId = requireValue(state.locations['Mumbai Metro'], 'Mumbai Metro id');
      const result = await call(app, 'PATCH', `/api/carts/${cartId}`, { locationId: mumbaiId });
      expectStatus(result, 200, 'switch store');
      expect(result.body.cart.location?.city === 'Mumbai', `expected city Mumbai, got ${result.body.cart.location?.city}`);
      expect(result.body.cart.items.length === 1, 'items must survive a store switch');
      return `availableQuantity at Mumbai Metro: ${result.body.cart.items[0].availableQuantity}`;
    },
  },
  {
    name: 'POST items on a checked_out cart -> 409 CART_NOT_ACTIVE',
    async run({ app, state }) {
      const bangaloreId = requireValue(state.locations['Bangalore Central'], 'Bangalore Central id');
      const elec001 = product(state, 'ELEC-001');
      const created = await call(app, 'POST', '/api/carts', { locationId: bangaloreId });
      if (typeof created.body?.cart?.id === 'string') state.cartIds.push(created.body.cart.id);
      expectStatus(created, 201, 'create second cart');
      const cartId: string = created.body.cart.id;
      // Simulate checkout's state change directly (checkout itself is plan 02-02).
      await pgDatabase().query("UPDATE carts SET status = 'checked_out' WHERE id = $1", [cartId]);
      const result = await call(app, 'POST', `/api/carts/${cartId}/items`, { productId: elec001.id });
      expectStatus(result, 409, 'add to checked_out cart');
      expect(result.body?.error?.code === 'CART_NOT_ACTIVE', 'error.code must be CART_NOT_ACTIVE');
      expect(result.body.error.details?.status === 'checked_out', 'details.status must be checked_out');
      const read = await call(app, 'GET', `/api/carts/${cartId}`);
      expectStatus(read, 200, 'read checked_out cart');
      expect(read.body.cart.items.length === 0, 'no item may be written to a checked_out cart');
    },
  },
  {
    name: 'GET /api/carts/not-a-uuid -> 400 VALIDATION_FAILED',
    async run({ app }) {
      const result = await call(app, 'GET', '/api/carts/not-a-uuid');
      expectStatus(result, 400, 'malformed cart id');
      expect(result.body?.error?.code === 'VALIDATION_FAILED', 'error.code must be VALIDATION_FAILED');
    },
  },
];

/** Every step, in order. Later plans append their steps here. */
export const smokeSteps: SmokeStep[] = [...catalogSteps, ...cartSteps];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export const STEP_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SmokeFailure(`timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function report(status: 'PASS' | 'FAIL', name: string, ms: number, detail?: string): void {
  const timing = `${String(ms).padStart(5)} ms`;
  console.log(`${status}  ${timing}  ${name}${detail ? ` - ${detail}` : ''}`);
}

export async function runSteps(ctx: SmokeContext, steps: readonly SmokeStep[]): Promise<number> {
  let failures = 0;
  for (const step of steps) {
    const started = performance.now();
    try {
      const detail = await withTimeout(step.run(ctx), STEP_TIMEOUT_MS);
      report('PASS', step.name, Math.round(performance.now() - started), detail ?? undefined);
    } catch (error) {
      failures += 1;
      report('FAIL', step.name, Math.round(performance.now() - started), errorMessage(error));
    }
  }
  return failures;
}

/**
 * Delete every cart / customer this run created (cart_items cascade), then
 * re-query the same ids. Returns a list of problems; empty means clean.
 */
export async function cleanupSmokeData(db: Queryable, state: SmokeState): Promise<string[]> {
  const problems: string[] = [];
  if (state.cartIds.length > 0) {
    await db.query('DELETE FROM carts WHERE id = ANY($1::uuid[])', [state.cartIds]);
  }
  if (state.customerIds.length > 0) {
    await db.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [state.customerIds]);
  }
  const { rows } = await db.query<{ carts: number; cart_items: number; customers: number }>(
    `SELECT (SELECT count(*) FROM carts WHERE id = ANY($1::uuid[]))::int AS carts,
            (SELECT count(*) FROM cart_items WHERE cart_id = ANY($1::uuid[]))::int AS cart_items,
            (SELECT count(*) FROM customers WHERE id = ANY($2::uuid[]))::int AS customers`,
    [state.cartIds, state.customerIds],
  );
  const remaining = rows[0];
  if (!remaining) {
    problems.push('residue check returned no row');
  } else {
    for (const [table, count] of Object.entries(remaining)) {
      if (Number(count) !== 0) problems.push(`${count} ${table} row(s) remain`);
    }
  }
  return problems;
}

async function main(): Promise<void> {
  // Fail fast with the variable names to fix (never values) instead of one
  // 500 per step when PostgreSQL is not configured.
  getPostgresConfig();
  const app = buildApp({ logLevel: 'warn' });
  activeApp = app;
  await app.ready();
  const state = newSmokeState();
  console.log('RetailSync live API smoke run (Aiven PostgreSQL via app.inject)\n');

  let failures = 0;
  try {
    failures += await runSteps({ app, state }, smokeSteps);
  } finally {
    const started = performance.now();
    const name = `cleanup: ${state.cartIds.length} cart(s), ${state.customerIds.length} customer(s) deleted, 0 rows remain`;
    try {
      const problems = await withTimeout(cleanupSmokeData(pgDatabase(), state), STEP_TIMEOUT_MS);
      if (problems.length === 0) {
        report('PASS', name, Math.round(performance.now() - started));
      } else {
        failures += 1;
        report('FAIL', name, Math.round(performance.now() - started), problems.join('; '));
      }
    } catch (error) {
      failures += 1;
      report('FAIL', name, Math.round(performance.now() - started), errorMessage(error));
    }
  }

  const total = smokeSteps.length + 1;
  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${total - failures}/${total} step(s) passed`);
  if (failures > 0) process.exitCode = 1;
}

let activeApp: FastifyInstance | undefined;

if (isMainModule(import.meta.url)) {
  await runCli('test:api', main, async () => {
    // app.close() runs the onClose hook, which closes the pg pool.
    await activeApp?.close();
  });
}
