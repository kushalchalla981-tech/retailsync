/**
 * Live storefront stock (v1.05), shared by every device.
 *
 * `storefront_stock` holds one row per storefront product (demo stores are
 * seeded by migration 0003; merchant stores when they are created or gain
 * products). Checkout decrements it after Razorpay verifies the payment, under
 * `SELECT ... FOR UPDATE` row locks with a `CHECK (stock >= 0)` backstop, and
 * `storefront_payments` makes the commit idempotent per payment id.
 */
import type { Database, Queryable } from './db.js';

export interface StockLine {
  storeId: string;
  productId: string;
  qty: number;
}

export interface StockRow {
  storeId: string;
  productId: string;
  stock: number;
}

export interface Shortfall extends StockRow {
  requested: number;
}

export interface CommittedLine extends StockLine {
  /** Units actually taken (less than qty only when a concurrent buyer took the rest). */
  taken: number;
  stockAfter: number;
}

export type CommitResult = { status: 'duplicate' } | { status: 'committed'; lines: CommittedLine[]; lockMs: number };

const key = (storeId: string, productId: string) => `${storeId}\u0000${productId}`;

/** Sum quantities per product and sort, so locks are always taken in the same order (no deadlocks). */
export function mergeLines(lines: readonly StockLine[]): StockLine[] {
  const byKey = new Map<string, StockLine>();
  for (const l of lines) {
    const k = key(l.storeId, l.productId);
    const prev = byKey.get(k);
    byKey.set(k, prev ? { ...prev, qty: prev.qty + l.qty } : { ...l });
  }
  return [...byKey.values()].sort((a, b) => (a.storeId === b.storeId ? (a.productId < b.productId ? -1 : 1) : a.storeId < b.storeId ? -1 : 1));
}

interface Row { store_id: string; product_id: string; stock: number }
const toRow = (r: Row): StockRow => ({ storeId: r.store_id, productId: r.product_id, stock: Number(r.stock) });

export async function listStock(db: Queryable): Promise<StockRow[]> {
  const { rows } = await db.query<Row>('SELECT store_id, product_id, stock FROM storefront_stock ORDER BY store_id, product_id');
  return rows.map(toRow);
}

const SELECT_LINES = `SELECT store_id, product_id, stock FROM storefront_stock
  WHERE (store_id, product_id) IN (SELECT * FROM unnest($1::text[], $2::text[]))
  ORDER BY store_id, product_id`;

/** Products whose tracked stock cannot cover the request (untracked products are not limited). */
export async function findShortfalls(db: Queryable, lines: readonly StockLine[]): Promise<Shortfall[]> {
  const merged = mergeLines(lines);
  if (!merged.length) return [];
  const { rows } = await db.query<Row>(SELECT_LINES, [merged.map((l) => l.storeId), merged.map((l) => l.productId)]);
  const stock = new Map(rows.map((r) => [key(r.store_id, r.product_id), Number(r.stock)]));
  return merged.flatMap((l) => {
    const have = stock.get(key(l.storeId, l.productId));
    return have !== undefined && have < l.qty ? [{ ...l, stock: have, requested: l.qty }] : [];
  });
}

/** Decrement stock for a verified payment, exactly once per payment id. */
export async function commitPaymentStock(db: Database, payment: { paymentId: string; orderId: string; lines: readonly StockLine[] }): Promise<CommitResult> {
  return db.transaction(async (tx) => {
    const first = await tx.query('INSERT INTO storefront_payments (payment_id, order_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING payment_id', [
      payment.paymentId,
      payment.orderId,
    ]);
    if (!first.rows.length) return { status: 'duplicate' } as const;

    const merged = mergeLines(payment.lines);
    if (!merged.length) return { status: 'committed', lines: [], lockMs: 0 } as const;
    const started = performance.now();
    const { rows } = await tx.query<Row>(`${SELECT_LINES} FOR UPDATE`, [merged.map((l) => l.storeId), merged.map((l) => l.productId)]);
    const lockMs = Math.round(performance.now() - started);
    const locked = new Map(rows.map((r) => [key(r.store_id, r.product_id), Number(r.stock)]));

    const out: CommittedLine[] = [];
    for (const l of merged) {
      const have = locked.get(key(l.storeId, l.productId));
      if (have === undefined) continue; // untracked product
      const taken = Math.min(have, l.qty);
      if (taken > 0) {
        await tx.query('UPDATE storefront_stock SET stock = stock - $3, updated_at = now() WHERE store_id = $1 AND product_id = $2', [l.storeId, l.productId, taken]);
      }
      out.push({ ...l, taken, stockAfter: have - taken });
    }
    return { status: 'committed', lines: out, lockMs } as const;
  });
}

/** Seed stock for products new to the table; never overwrites live stock. */
export async function seedStock(db: Queryable, storeId: string, catalog: readonly { id: string; stock: number }[]): Promise<void> {
  if (!catalog.length) return;
  await db.query(
    `INSERT INTO storefront_stock (store_id, product_id, stock)
     SELECT $1, p, GREATEST(0, s) FROM unnest($2::text[], $3::int[]) AS t(p, s)
     ON CONFLICT DO NOTHING`,
    [storeId, catalog.map((p) => p.id), catalog.map((p) => p.stock)],
  );
}

export async function setStock(db: Queryable, row: StockRow): Promise<void> {
  await db.query(
    `INSERT INTO storefront_stock (store_id, product_id, stock) VALUES ($1, $2, $3)
     ON CONFLICT (store_id, product_id) DO UPDATE SET stock = EXCLUDED.stock, updated_at = now()`,
    [row.storeId, row.productId, row.stock],
  );
}

/** Live stock for the given stores, keyed by store id then product id. */
export async function stockByStore(db: Queryable, storeIds: readonly string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (!storeIds.length) return out;
  const { rows } = await db.query<Row>('SELECT store_id, product_id, stock FROM storefront_stock WHERE store_id = ANY($1::text[])', [storeIds]);
  for (const r of rows) {
    if (!out.has(r.store_id)) out.set(r.store_id, new Map());
    out.get(r.store_id)!.set(r.product_id, Number(r.stock));
  }
  return out;
}
