/**
 * Guest cart sessions.
 *
 * Lock discipline (the contract plan 02-02's checkout relies on): every cart
 * mutation runs in one transaction whose FIRST statement is
 *
 *     SELECT id, status, location_id FROM carts WHERE id = $1 FOR UPDATE
 *
 * and refuses a cart that is not 'active'. Checkout locks the same cart row,
 * so a concurrent add-item either commits before checkout reads the items, or
 * waits on the row lock and is then rejected with 409 CART_NOT_ACTIVE because
 * the cart was checked out. No item can slip in after checkout locked stock.
 *
 * Carts never check or reserve stock: `availableQuantity` is informational,
 * and checkout is the only stock authority.
 */
import { conflict, notFound, unprocessable } from '../http/contract.js';
import { iso, money, type Database, type Queryable } from './db.js';

export const MAX_LINE_QUANTITY = 99;

export type CartStatus = 'active' | 'checked_out' | 'abandoned';

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  availableQuantity: number;
}

export interface Cart {
  id: string;
  status: CartStatus;
  locationId: string | null;
  location: { id: string; name: string; city: string } | null;
  orderId: string | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

export const LOCK_CART_SQL = 'SELECT id, status, location_id::text AS location_id FROM carts WHERE id = $1 FOR UPDATE';

export const CREATE_CART_SQL = 'INSERT INTO carts (location_id) SELECT id FROM store_locations WHERE id = $1 RETURNING id::text AS id';

export const PRODUCT_CHECK_SQL = 'SELECT id::text AS id, is_active FROM products WHERE id = $1';

/** $1 cart, $2 product, $3 quantity to add. No row returned = the line would exceed the limit. */
export const UPSERT_CART_ITEM_SQL = `INSERT INTO cart_items (cart_id, product_id, quantity)
VALUES ($1, $2, $3)
ON CONFLICT ON CONSTRAINT cart_items_cart_product_key
DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
 WHERE cart_items.quantity + EXCLUDED.quantity <= ${MAX_LINE_QUANTITY}
RETURNING quantity`;

export const UPDATE_CART_ITEM_SQL = `UPDATE cart_items SET quantity = $3
 WHERE cart_id = $1 AND product_id = $2
RETURNING quantity`;

export const DELETE_CART_ITEM_SQL = `DELETE FROM cart_items
 WHERE cart_id = $1 AND product_id = $2
RETURNING id::text AS id`;

export const SET_CART_LOCATION_SQL = `UPDATE carts SET location_id = l.id
  FROM store_locations l
 WHERE carts.id = $1 AND l.id = $2
RETURNING carts.id::text AS id`;

/** The BEFORE UPDATE trigger also sets updated_at; the explicit value keeps intent obvious. */
export const TOUCH_CART_SQL = 'UPDATE carts SET updated_at = now() WHERE id = $1';

export const CART_HEADER_SQL = `SELECT c.id::text AS id, c.status, c.location_id::text AS location_id,
       l.name AS location_name, l.city AS location_city,
       o.id::text AS order_id,
       (SELECT COALESCE(sum(ci.quantity), 0)::int
          FROM cart_items ci WHERE ci.cart_id = c.id) AS item_count,
       (SELECT COALESCE(sum(p.price * ci.quantity), 0)
          FROM cart_items ci JOIN products p ON p.id = ci.product_id
         WHERE ci.cart_id = c.id) AS subtotal,
       c.created_at, c.updated_at
  FROM carts c
  LEFT JOIN store_locations l ON l.id = c.location_id
  LEFT JOIN orders o ON o.cart_id = c.id
 WHERE c.id = $1`;

export const CART_ITEMS_SQL = `SELECT ci.product_id::text AS product_id, p.sku, p.name, p.image_url,
       p.price AS unit_price, ci.quantity, p.price * ci.quantity AS line_total,
       COALESCE(i.stock_quantity, 0)::int AS available_quantity
  FROM cart_items ci
  JOIN carts c ON c.id = ci.cart_id
  JOIN products p ON p.id = ci.product_id
  LEFT JOIN inventory i ON i.product_id = ci.product_id AND i.location_id = c.location_id
 WHERE ci.cart_id = $1
 ORDER BY ci.added_at, ci.id`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface CartHeaderRow {
  id: string;
  status: CartStatus;
  location_id: string | null;
  location_name: string | null;
  location_city: string | null;
  order_id: string | null;
  item_count: number;
  subtotal: string | number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CartItemRow {
  product_id: string;
  sku: string;
  name: string;
  image_url: string | null;
  unit_price: string;
  quantity: number;
  line_total: string;
  available_quantity: number;
}

/** Any status (a checked-out cart reads back with its orderId). 404 CART_NOT_FOUND otherwise. */
export async function getCart(db: Queryable, cartId: string): Promise<Cart> {
  const [header, items] = await Promise.all([
    db.query<CartHeaderRow>(CART_HEADER_SQL, [cartId]),
    db.query<CartItemRow>(CART_ITEMS_SQL, [cartId]),
  ]);
  const row = header.rows[0];
  if (!row) throw notFound('CART_NOT_FOUND', `Cart ${cartId} not found`);
  const locationId = row.location_id === null ? null : String(row.location_id);
  return {
    id: String(row.id),
    status: row.status,
    locationId,
    location:
      locationId === null ? null : { id: locationId, name: row.location_name ?? '', city: row.location_city ?? '' },
    orderId: row.order_id === null ? null : String(row.order_id),
    items: items.rows.map((item) => ({
      productId: String(item.product_id),
      sku: item.sku,
      name: item.name,
      imageUrl: item.image_url,
      unitPrice: money(item.unit_price),
      quantity: Number(item.quantity),
      lineTotal: money(item.line_total),
      availableQuantity: Number(item.available_quantity),
    })),
    itemCount: Number(row.item_count),
    subtotal: money(row.subtotal),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Mutations (each: one transaction, cart row locked first)
// ---------------------------------------------------------------------------

export interface LockedCart {
  id: string;
  status: CartStatus;
  locationId: string | null;
}

/** Lock the cart row; 404 CART_NOT_FOUND, or 409 CART_NOT_ACTIVE (details.status) unless active. */
export async function lockActiveCart(tx: Queryable, cartId: string): Promise<LockedCart> {
  const { rows } = await tx.query<{ id: string; status: CartStatus; location_id: string | null }>(LOCK_CART_SQL, [cartId]);
  const row = rows[0];
  if (!row) throw notFound('CART_NOT_FOUND', `Cart ${cartId} not found`);
  if (row.status !== 'active') {
    throw conflict('CART_NOT_ACTIVE', `Cart ${cartId} is ${row.status} and can no longer be modified`, {
      status: row.status,
    });
  }
  return { id: String(row.id), status: row.status, locationId: row.location_id === null ? null : String(row.location_id) };
}

export async function createCart(db: Database, input: { locationId: string }): Promise<Cart> {
  const { rows } = await db.query<{ id: string }>(CREATE_CART_SQL, [input.locationId]);
  const row = rows[0];
  if (!row) throw notFound('LOCATION_NOT_FOUND', `Store location ${input.locationId} not found`);
  return getCart(db, String(row.id));
}

export async function addCartItem(
  db: Database,
  cartId: string,
  input: { productId: string; quantity: number },
): Promise<Cart> {
  await db.transaction(async (tx) => {
    await lockActiveCart(tx, cartId);
    const product = (await tx.query<{ id: string; is_active: boolean }>(PRODUCT_CHECK_SQL, [input.productId])).rows[0];
    if (!product) throw notFound('PRODUCT_NOT_FOUND', `Product ${input.productId} not found`);
    if (!product.is_active) {
      throw conflict('PRODUCT_UNAVAILABLE', `Product ${input.productId} is no longer available`);
    }
    const upserted = await tx.query<{ quantity: number }>(UPSERT_CART_ITEM_SQL, [cartId, input.productId, input.quantity]);
    if (upserted.rows.length === 0) {
      throw unprocessable(
        'QUANTITY_LIMIT_EXCEEDED',
        `A cart line cannot exceed ${MAX_LINE_QUANTITY} units`,
        { maxQuantity: MAX_LINE_QUANTITY },
      );
    }
    await tx.query(TOUCH_CART_SQL, [cartId]);
  });
  return getCart(db, cartId);
}

export async function setCartItemQuantity(
  db: Database,
  cartId: string,
  productId: string,
  quantity: number,
): Promise<Cart> {
  await db.transaction(async (tx) => {
    await lockActiveCart(tx, cartId);
    const updated = await tx.query(UPDATE_CART_ITEM_SQL, [cartId, productId, quantity]);
    if (updated.rows.length === 0) throw notFound('CART_ITEM_NOT_FOUND', `Product ${productId} is not in cart ${cartId}`);
    await tx.query(TOUCH_CART_SQL, [cartId]);
  });
  return getCart(db, cartId);
}

export async function removeCartItem(db: Database, cartId: string, productId: string): Promise<Cart> {
  await db.transaction(async (tx) => {
    await lockActiveCart(tx, cartId);
    const deleted = await tx.query(DELETE_CART_ITEM_SQL, [cartId, productId]);
    if (deleted.rows.length === 0) throw notFound('CART_ITEM_NOT_FOUND', `Product ${productId} is not in cart ${cartId}`);
    await tx.query(TOUCH_CART_SQL, [cartId]);
  });
  return getCart(db, cartId);
}

export async function setCartLocation(db: Database, cartId: string, locationId: string): Promise<Cart> {
  await db.transaction(async (tx) => {
    await lockActiveCart(tx, cartId);
    const updated = await tx.query(SET_CART_LOCATION_SQL, [cartId, locationId]);
    if (updated.rows.length === 0) throw notFound('LOCATION_NOT_FOUND', `Store location ${locationId} not found`);
  });
  return getCart(db, cartId);
}
