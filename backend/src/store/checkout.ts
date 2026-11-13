/**
 * Atomic checkout with pessimistic row locking (STOCK-01..03).
 *
 * Isolation: PostgreSQL's default READ COMMITTED plus explicit `FOR UPDATE`
 * row locks (not SERIALIZABLE). Contended inventory rows are fully serialized
 * by the row lock, so a flash sale queues on the lock instead of failing with
 * 40001 serialization errors that would need a retry loop.
 *
 * Global lock order (every transaction that touches these rows acquires locks
 * in this order, so the wait-for graph has no cycle and cannot deadlock):
 *
 *   1. the cart row              (carts, FOR UPDATE OF c - same lock every cart mutation takes)
 *   2. the customer row          (customers, upsert by lower(email))
 *   3. the inventory rows by id  (inventory, ... ORDER BY id FOR UPDATE)
 *
 * Two carts listing the same products in opposite orders still lock the
 * inventory rows in ascending id order, which is what the race test's
 * `deadlock` scenario proves live.
 *
 * Everything runs in ONE transaction. Any thrown error (including 409
 * OUT_OF_STOCK) rolls back: no order, no stock change, the cart stays active.
 * The order event hook runs only after COMMIT.
 */
import { AppError, conflict, notFound, unprocessable } from '../http/contract.js';
import {
  notifyOrderPlaced,
  type EventLogger,
  type OrderEventSink,
  type OrderPlacedEvent,
} from '../events/order-events.js';
import { iso, money, type Database, type Queryable } from './db.js';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/** Order JSON. Customer email is deliberately never part of it. */
export interface Order {
  id: string;
  status: string;
  paymentStatus: string;
  cartId: string | null;
  customer: { id: string; name: string };
  location: { id: string; name: string; city: string };
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
}

export interface CheckoutInput {
  cartId: string;
  customer: { name: string; email: string };
}

export interface CheckoutDeps {
  db: Database;
  events: OrderEventSink;
  log: EventLogger;
}

export interface CheckoutResult {
  order: Order;
  replayed: boolean;
}

// ---------------------------------------------------------------------------
// SQL (every request value is a $n parameter)
// ---------------------------------------------------------------------------

/** (1) Lock only the cart row (`OF c`), not the joined store row. */
export const LOCK_CHECKOUT_CART_SQL = `SELECT c.id::text AS id, c.status, c.location_id::text AS location_id,
       l.name AS location_name, l.city
  FROM carts c
  LEFT JOIN store_locations l ON l.id = c.location_id
 WHERE c.id = $1
   FOR UPDATE OF c`;

/** Cart lines with the product price snapshot (NUMERIC as text, never a float). */
export const CHECKOUT_ITEMS_SQL = `SELECT ci.product_id::text AS product_id, ci.quantity, p.sku, p.name,
       p.price::text AS price, p.is_active
  FROM cart_items ci
  JOIN products p ON p.id = ci.product_id
 WHERE ci.cart_id = $1
 ORDER BY ci.product_id`;

/** (2) Guest customer keyed by case-insensitive email. Runs before the inventory lock to keep the critical section short. */
export const UPSERT_CUSTOMER_SQL = `INSERT INTO customers (name, email) VALUES ($1, $2)
ON CONFLICT ((lower(email))) DO UPDATE SET name = EXCLUDED.name
RETURNING id::text AS id`;

/** (3) The schema.sql stock integrity contract, verbatim: deterministic id order, row locks. */
export const LOCK_INVENTORY_SQL =
  'SELECT id, product_id, stock_quantity FROM inventory WHERE location_id = $1 AND product_id = ANY($2::bigint[]) ORDER BY id FOR UPDATE';

/** Set-based decrement of the locked rows; returns post-decrement stock. */
export const DECREMENT_INVENTORY_SQL = `UPDATE inventory AS i SET stock_quantity = i.stock_quantity - d.qty
  FROM unnest($1::bigint[], $2::int[]) AS d(id, qty)
 WHERE i.id = d.id
RETURNING i.id::text AS id, i.product_id::text AS product_id, i.location_id::text AS location_id, i.stock_quantity`;

/** Order header; total computed in SQL NUMERIC from the price snapshot. */
export const INSERT_ORDER_SQL = `INSERT INTO orders (customer_id, cart_id, location_id, total_amount)
SELECT $1::uuid, $2::uuid, $3::bigint, sum(d.q * d.p)
  FROM unnest($4::int[], $5::numeric[]) AS d(q, p)
RETURNING id::text AS id, status, payment_status, total_amount::text AS total_amount, created_at`;

/** Order lines; line_total is a GENERATED column and is never inserted. */
export const INSERT_ORDER_ITEMS_SQL = `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT $1::uuid, d.product_id, d.quantity, d.unit_price
  FROM unnest($2::bigint[], $3::int[], $4::numeric[]) AS d(product_id, quantity, unit_price)
RETURNING product_id::text AS product_id, quantity, unit_price::text AS unit_price, line_total::text AS line_total`;

/** customer_id is set in the same UPDATE as the status (carts_one_active_per_customer). */
export const MARK_CART_CHECKED_OUT_SQL = "UPDATE carts SET status = 'checked_out', customer_id = $2 WHERE id = $1";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface LockedCartRow {
  id: string;
  status: 'active' | 'checked_out' | 'abandoned';
  location_id: string | null;
  location_name: string | null;
  city: string | null;
}

interface CheckoutItemRow {
  product_id: string;
  quantity: number;
  sku: string;
  name: string;
  price: string;
  is_active: boolean;
}

interface LockedInventoryRow {
  id: string | number;
  product_id: string | number;
  stock_quantity: number;
}

interface DecrementedRow {
  id: string;
  product_id: string;
  location_id: string;
  stock_quantity: number;
}

interface OrderRow {
  id: string;
  status: string;
  payment_status: string;
  total_amount: string;
  created_at: Date | string;
}

interface OrderItemRow {
  product_id: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compareIds(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

interface Shortfall {
  productId: string;
  sku: string;
  name: string;
  requested: number;
  available: number;
}

function outOfStock(locationId: string, locationName: string, shortfalls: Shortfall[]): AppError {
  const message = `Insufficient stock at ${locationName}: ${shortfalls
    .map((item) => `${item.name} (requested ${item.requested}, available ${item.available})`)
    .join('; ')}`;
  return conflict('OUT_OF_STOCK', message, { locationId, locationName, items: shortfalls });
}

interface PlacedOrder {
  order: Order;
  event: OrderPlacedEvent;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

async function placeOrder(tx: Queryable, input: CheckoutInput): Promise<PlacedOrder> {
  // (a) Lock the cart row first (same lock every cart mutation takes).
  const cart = (await tx.query<LockedCartRow>(LOCK_CHECKOUT_CART_SQL, [input.cartId])).rows[0];
  if (!cart) throw notFound('CART_NOT_FOUND', `Cart ${input.cartId} not found`);
  if (cart.status !== 'active') {
    throw conflict('CART_NOT_ACTIVE', `Cart ${input.cartId} is ${cart.status} and cannot be checked out`, {
      status: cart.status,
    });
  }
  if (cart.location_id === null) {
    throw conflict('CART_LOCATION_REQUIRED', 'Choose a store location before checking out');
  }
  const locationId = String(cart.location_id);
  const locationName = cart.location_name ?? '';
  const city = cart.city ?? '';

  // (b) Cart lines with the price snapshot.
  const items = (await tx.query<CheckoutItemRow>(CHECKOUT_ITEMS_SQL, [input.cartId])).rows.map((row) => ({
    productId: String(row.product_id),
    quantity: Number(row.quantity),
    sku: row.sku,
    name: row.name,
    price: String(row.price),
    isActive: row.is_active,
  }));
  if (items.length === 0) throw unprocessable('CART_EMPTY', 'Cannot check out an empty cart');
  items.sort((a, b) => compareIds(a.productId, b.productId));

  // (c) Customer row (lock order step 2), outside the inventory critical section.
  const customerRow = (await tx.query<{ id: string }>(UPSERT_CUSTOMER_SQL, [input.customer.name, input.customer.email]))
    .rows[0];
  if (!customerRow) throw new Error('customer upsert returned no row');
  const customerId = String(customerRow.id);

  // (d) Lock inventory rows in ascending id order (lock order step 3).
  const productIds = items.map((item) => item.productId);
  const locked = (await tx.query<LockedInventoryRow>(LOCK_INVENTORY_SQL, [locationId, productIds])).rows;
  const stockByProduct = new Map(locked.map((row) => [String(row.product_id), row]));

  // (e) Verify every line; a product the store does not carry has 0 available.
  const shortfalls: Shortfall[] = [];
  for (const item of items) {
    const available = Number(stockByProduct.get(item.productId)?.stock_quantity ?? 0);
    if (available < item.quantity) {
      shortfalls.push({ productId: item.productId, sku: item.sku, name: item.name, requested: item.quantity, available });
    }
  }
  if (shortfalls.length > 0) throw outOfStock(locationId, locationName, shortfalls);

  // (f) Decrement in one set-based statement.
  const decrementIds = items.map((item) => String(stockByProduct.get(item.productId)?.id));
  const decrementQty = items.map((item) => item.quantity);
  const decremented = (await tx.query<DecrementedRow>(DECREMENT_INVENTORY_SQL, [decrementIds, decrementQty])).rows;

  // (g) Order header, total in SQL NUMERIC.
  const orderRow = (
    await tx.query<OrderRow>(INSERT_ORDER_SQL, [
      customerId,
      input.cartId,
      locationId,
      items.map((item) => item.quantity),
      items.map((item) => item.price),
    ])
  ).rows[0];
  if (!orderRow) throw new Error('order insert returned no row');
  const orderId = String(orderRow.id);

  // (h) Order lines from the price snapshot (never client-supplied prices).
  const lineRows = (
    await tx.query<OrderItemRow>(INSERT_ORDER_ITEMS_SQL, [
      orderId,
      productIds,
      items.map((item) => item.quantity),
      items.map((item) => item.price),
    ])
  ).rows;
  const lineByProduct = new Map(lineRows.map((row) => [String(row.product_id), row]));

  // (i) Close the cart.
  await tx.query(MARK_CART_CHECKED_OUT_SQL, [input.cartId, customerId]);

  const placedAt = iso(orderRow.created_at);
  const eventItems = items.map((item) => {
    const line = lineByProduct.get(item.productId);
    return {
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPrice: line?.unit_price === undefined ? item.price : String(line.unit_price),
      lineTotal: line?.line_total === undefined ? '0' : String(line.line_total),
    };
  });

  const order: Order = {
    id: orderId,
    status: orderRow.status,
    paymentStatus: orderRow.payment_status,
    cartId: input.cartId,
    customer: { id: customerId, name: input.customer.name },
    location: { id: locationId, name: locationName, city },
    items: eventItems.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.lineTotal),
    })),
    totalAmount: money(orderRow.total_amount),
    createdAt: placedAt,
  };

  const event: OrderPlacedEvent = {
    type: 'order.placed',
    version: 1,
    orderId,
    customerId,
    cartId: input.cartId,
    locationId,
    locationName,
    city,
    status: orderRow.status,
    totalAmount: String(orderRow.total_amount),
    placedAt,
    items: eventItems,
    inventory: decremented.map((row) => ({
      inventoryId: String(row.id),
      productId: String(row.product_id),
      locationId: String(row.location_id),
      stockQuantity: Number(row.stock_quantity),
    })),
  };

  return { order, event };
}

/**
 * Check out a cart in one locked transaction. The event sink is notified
 * strictly after COMMIT, and only for a newly created order.
 */
export async function checkoutCart(deps: CheckoutDeps, input: CheckoutInput): Promise<CheckoutResult> {
  const placed = await deps.db.transaction((tx) => placeOrder(tx, input));
  // Post-COMMIT: a sink failure is logged by notifyOrderPlaced and never fails the checkout.
  await notifyOrderPlaced(deps.events, placed.event, deps.log);
  return { order: placed.order, replayed: false };
}
