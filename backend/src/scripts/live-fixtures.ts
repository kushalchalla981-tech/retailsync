/**
 * Live-database fixtures shared by the race test (`npm run test:race`) and the
 * API smoke run (`npm run test:api`). These helpers MUTATE the live Aiven
 * database, so:
 *
 *   - `assertNotProduction()` refuses NODE_ENV=production.
 *   - Writes only touch resolved target inventory rows and rows the run
 *     created (tracked cart / order ids, run-tagged customer emails). There are
 *     no broad patterns: nothing is ever deleted by LIKE or by table.
 *   - `restoreCatalogStock` resets each touched inventory row to its
 *     SEED-CATALOG value (`db/seed-data.json`), not to whatever it held before
 *     the run; `npm run seed` remains the full reset.
 *   - Both cleanup helpers re-query what they touched and return a list of
 *     problems (empty = verified clean), so callers can FAIL on residue.
 *
 * Every statement is parameterized.
 */
import { getServerConfig } from '../config.js';
import { inventoryRows, loadSeedCatalog } from '../db/seed-data.js';
import { query } from '../services/postgres.js';

export function assertNotProduction(): void {
  if (getServerConfig().nodeEnv === 'production') {
    throw new Error('refusing to run: this script mutates live stock and NODE_ENV is production');
  }
}

export interface InventoryTarget {
  inventoryId: string;
  productId: string;
  locationId: string;
  stock: number;
  sku: string;
  locationName: string;
}

export const RESOLVE_TARGET_SQL = `SELECT i.id::text AS inventory_id, p.id::text AS product_id, l.id::text AS location_id,
       i.stock_quantity, p.sku, l.name AS location_name
  FROM inventory i
  JOIN products p ON p.id = i.product_id
  JOIN store_locations l ON l.id = i.location_id
 WHERE p.sku = $1 AND l.name = $2`;

export async function resolveInventoryTarget(sku: string, locationName: string): Promise<InventoryTarget> {
  const { rows } = await query<{
    inventory_id: string;
    product_id: string;
    location_id: string;
    stock_quantity: number;
    sku: string;
    location_name: string;
  }>(RESOLVE_TARGET_SQL, [sku, locationName]);
  const row = rows[0];
  if (!row) {
    throw new Error(`no inventory row for ${sku} at "${locationName}" - run \`npm run seed\` to load the demo catalog`);
  }
  return {
    inventoryId: String(row.inventory_id),
    productId: String(row.product_id),
    locationId: String(row.location_id),
    stock: Number(row.stock_quantity),
    sku: row.sku,
    locationName: row.location_name,
  };
}

export async function setStock(inventoryId: string, quantity: number): Promise<void> {
  await query('UPDATE inventory SET stock_quantity = $2 WHERE id = $1', [inventoryId, quantity]);
}

export async function readStock(inventoryId: string): Promise<number> {
  const { rows } = await query<{ stock_quantity: number }>('SELECT stock_quantity FROM inventory WHERE id = $1', [
    inventoryId,
  ]);
  const row = rows[0];
  if (!row) throw new Error(`inventory row ${inventoryId} disappeared`);
  return Number(row.stock_quantity);
}

/** Stock quantity the seed catalog assigns to (sku, location). Throws if the catalog does not stock it. */
export function catalogQuantity(sku: string, locationName: string): number {
  const row = inventoryRows(loadSeedCatalog()).find((entry) => entry.sku === sku && entry.location_name === locationName);
  if (!row) throw new Error(`seed catalog has no stock entry for ${sku} at "${locationName}"`);
  return row.stock_quantity;
}

/**
 * Reset each target row to its seed-catalog quantity, then re-read it.
 * Returns problems (a row that does not hold its catalog value afterwards).
 */
export async function restoreCatalogStock(targets: readonly InventoryTarget[]): Promise<string[]> {
  const problems: string[] = [];
  const unique = new Map(targets.map((target) => [target.inventoryId, target]));
  for (const target of unique.values()) {
    const expected = catalogQuantity(target.sku, target.locationName);
    await setStock(target.inventoryId, expected);
    const actual = await readStock(target.inventoryId);
    if (actual !== expected) {
      problems.push(`${target.sku} at ${target.locationName} holds ${actual}, expected seed value ${expected}`);
    }
  }
  return problems;
}

export interface RunRecord {
  cartIds: string[];
  /** Run-tagged customer emails (matched case-insensitively). */
  emails: string[];
  /** Order ids seen in responses (orders are also found via cart_id). */
  orderIds?: string[];
  /** Customer ids seen in responses. */
  customerIds?: string[];
}

export interface Residue {
  orders: number;
  order_items: number;
  carts: number;
  cart_items: number;
  customers: number;
}

/**
 * Delete everything a run created, in foreign-key order (orders RESTRICT on
 * customers, so orders go first; order_items cascade from orders, cart_items
 * from carts), then re-query every tracked id. Returns problems; empty = clean.
 */
export async function cleanupRun(record: RunRecord): Promise<string[]> {
  const cartIds = [...new Set(record.cartIds)];
  const emails = [...new Set(record.emails.map((email) => email.toLowerCase()))];
  const customerIds = [...new Set(record.customerIds ?? [])];

  // Orders reachable from the run: tracked ids plus anything placed for a tracked cart.
  const found = await query<{ id: string }>(
    'SELECT id::text AS id FROM orders WHERE cart_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])',
    [cartIds, record.orderIds ?? []],
  );
  const orderIds = [...new Set([...(record.orderIds ?? []), ...found.rows.map((row) => String(row.id))])];

  await query('DELETE FROM orders WHERE id = ANY($1::uuid[]) OR cart_id = ANY($2::uuid[])', [orderIds, cartIds]);
  await query('DELETE FROM carts WHERE id = ANY($1::uuid[])', [cartIds]);
  await query(
    `DELETE FROM customers c
      WHERE (lower(c.email) = ANY($1::text[]) OR c.id = ANY($2::uuid[]))
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)`,
    [emails, customerIds],
  );

  const { rows } = await query<Residue>(
    `SELECT (SELECT count(*) FROM orders WHERE id = ANY($1::uuid[]) OR cart_id = ANY($2::uuid[]))::int AS orders,
            (SELECT count(*) FROM order_items WHERE order_id = ANY($1::uuid[]))::int AS order_items,
            (SELECT count(*) FROM carts WHERE id = ANY($2::uuid[]))::int AS carts,
            (SELECT count(*) FROM cart_items WHERE cart_id = ANY($2::uuid[]))::int AS cart_items,
            (SELECT count(*) FROM customers WHERE lower(email) = ANY($3::text[]) OR id = ANY($4::uuid[]))::int AS customers`,
    [orderIds, cartIds, emails, customerIds],
  );
  const residue = rows[0];
  if (!residue) return ['residue check returned no row'];
  const problems: string[] = [];
  for (const [table, count] of Object.entries(residue)) {
    if (Number(count) !== 0) problems.push(`${count} ${table} row(s) remain`);
  }
  return problems;
}
