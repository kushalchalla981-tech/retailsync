/**
 * Catalog reads: products with per-store stock, categories, store locations
 * and inventory lookups, straight from Aiven PostgreSQL.
 *
 * Every request-derived value is a `$n` bound parameter; SQL text is constant.
 */
import { notFound } from '../http/contract.js';
import { iso, money, type Queryable } from './db.js';

export interface InventoryEntry {
  locationId: string;
  locationName: string;
  city: string;
  stockQuantity: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string | null;
  category: { id: string; slug: string; name: string };
  inventory: InventoryEntry[];
  totalStock: number;
  inStock: boolean;
}

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: string;
  image_url: string | null;
  category_id: string;
  category_slug: string;
  category_name: string;
  inventory: InventoryEntry[] | null;
  total_stock: number | null;
}

export function toProduct(row: ProductRow): Product {
  const totalStock = row.total_stock ?? 0;
  return {
    id: String(row.id),
    sku: row.sku,
    name: row.name,
    description: row.description,
    price: money(row.price),
    imageUrl: row.image_url,
    category: { id: String(row.category_id), slug: row.category_slug, name: row.category_name },
    inventory: row.inventory ?? [],
    totalStock,
    inStock: totalStock > 0,
  };
}

/** Shared SELECT list + joins for the product shape (active-product filter is added by callers). */
const PRODUCT_SELECT = `SELECT p.id::text AS id, p.sku, p.name, p.description, p.price, p.image_url,
       c.id::text AS category_id, c.slug AS category_slug, c.name AS category_name,
       COALESCE(inv.inventory, '[]'::json) AS inventory,
       COALESCE(inv.total_stock, 0)::int AS total_stock`;

const PRODUCT_FROM = `  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'locationId', l.id::text,
             'locationName', l.name,
             'city', l.city,
             'stockQuantity', i.stock_quantity
           ) ORDER BY l.id) AS inventory,
           sum(i.stock_quantity) AS total_stock
      FROM inventory i
      JOIN store_locations l ON l.id = i.location_id
     WHERE i.product_id = p.id
  ) inv ON TRUE`;

export interface ProductFilters {
  category?: string | undefined;
  locationId?: string | undefined;
  city?: string | undefined;
  inStock?: boolean | undefined;
  limit: number;
  offset: number;
}

export interface ProductPage {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * $1 category slug, $2 location id, $3 city, $4 in-stock flag, $5 limit, $6 offset.
 * - locationId: the product must have an inventory row at that store (with stock when inStock).
 * - city: an inventory row at any store in that city, case-insensitive (with stock when inStock).
 * - inStock alone: stock > 0 at any store.
 */
export const LIST_PRODUCTS_SQL = `${PRODUCT_SELECT},
       count(*) OVER ()::int AS total_count
${PRODUCT_FROM}
 WHERE p.is_active
   AND ($1::text IS NULL OR c.slug = $1::text)
   AND ($2::bigint IS NULL OR EXISTS (
         SELECT 1 FROM inventory il
          WHERE il.product_id = p.id AND il.location_id = $2::bigint
            AND (NOT $4::boolean OR il.stock_quantity > 0)))
   AND ($3::text IS NULL OR EXISTS (
         SELECT 1 FROM inventory ic
           JOIN store_locations lc ON lc.id = ic.location_id
          WHERE ic.product_id = p.id AND lower(lc.city) = lower($3::text)
            AND (NOT $4::boolean OR ic.stock_quantity > 0)))
   AND (NOT $4::boolean OR $2::bigint IS NOT NULL OR $3::text IS NOT NULL OR EXISTS (
         SELECT 1 FROM inventory ia WHERE ia.product_id = p.id AND ia.stock_quantity > 0))
 ORDER BY p.id
 LIMIT $5::int OFFSET $6::int`;

export async function listProducts(db: Queryable, filters: ProductFilters): Promise<ProductPage> {
  const { rows } = await db.query<ProductRow & { total_count: number }>(LIST_PRODUCTS_SQL, [
    filters.category ?? null,
    filters.locationId ?? null,
    filters.city ?? null,
    filters.inStock === true,
    filters.limit,
    filters.offset,
  ]);
  return {
    items: rows.map(toProduct),
    total: rows.length > 0 ? Number(rows[0]!.total_count) : 0,
    limit: filters.limit,
    offset: filters.offset,
  };
}

// ---------------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------------

export const GET_PRODUCT_SQL = `${PRODUCT_SELECT}
${PRODUCT_FROM}
 WHERE p.is_active AND p.id = $1::bigint`;

/** One active product in the list shape; 404 PRODUCT_NOT_FOUND otherwise. */
export async function getProduct(db: Queryable, productId: string): Promise<Product> {
  const { rows } = await db.query<ProductRow>(GET_PRODUCT_SQL, [productId]);
  const row = rows[0];
  if (!row) throw notFound('PRODUCT_NOT_FOUND', `Product ${productId} not found`);
  return toProduct(row);
}

// ---------------------------------------------------------------------------
// Categories and store locations
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  slug: string;
  name: string;
  productCount: number;
}

export const LIST_CATEGORIES_SQL = `SELECT c.id::text AS id, c.slug, c.name,
       count(p.id) FILTER (WHERE p.is_active)::int AS product_count
  FROM categories c
  LEFT JOIN products p ON p.category_id = c.id
 GROUP BY c.id
 ORDER BY c.name`;

export async function listCategories(db: Queryable): Promise<Category[]> {
  const { rows } = await db.query<{ id: string; slug: string; name: string; product_count: number }>(LIST_CATEGORIES_SQL);
  return rows.map((row) => ({
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    productCount: Number(row.product_count),
  }));
}

export interface StoreLocation {
  id: string;
  name: string;
  city: string;
  address: string;
}

export const LIST_LOCATIONS_SQL = `SELECT l.id::text AS id, l.name, l.city, l.address
  FROM store_locations l
 ORDER BY l.city, l.name`;

export async function listLocations(db: Queryable): Promise<StoreLocation[]> {
  const { rows } = await db.query<StoreLocation>(LIST_LOCATIONS_SQL);
  return rows.map((row) => ({ id: String(row.id), name: row.name, city: row.city, address: row.address }));
}

// ---------------------------------------------------------------------------
// Inventory lookup
// ---------------------------------------------------------------------------

export interface InventoryRecord {
  productId: string;
  sku: string;
  productName: string;
  locationId: string;
  locationName: string;
  city: string;
  stockQuantity: number;
  inStock: boolean;
  updatedAt: string;
}

export interface InventoryFilters {
  productId?: string | undefined;
  locationId?: string | undefined;
}

/**
 * $1 product id, $2 location id (either may be null; the route requires at
 * least one). Raw stock view: rows for inactive products are included too.
 */
export const LOOKUP_INVENTORY_SQL = `SELECT i.product_id::text AS product_id, p.sku, p.name AS product_name,
       i.location_id::text AS location_id, l.name AS location_name, l.city,
       i.stock_quantity, i.updated_at
  FROM inventory i
  JOIN products p ON p.id = i.product_id
  JOIN store_locations l ON l.id = i.location_id
 WHERE ($1::bigint IS NULL OR i.product_id = $1::bigint)
   AND ($2::bigint IS NULL OR i.location_id = $2::bigint)
 ORDER BY i.product_id, i.location_id`;

interface InventoryRow {
  product_id: string;
  sku: string;
  product_name: string;
  location_id: string;
  location_name: string;
  city: string;
  stock_quantity: number;
  updated_at: Date | string;
}

export async function lookupInventory(db: Queryable, filters: InventoryFilters): Promise<InventoryRecord[]> {
  const { rows } = await db.query<InventoryRow>(LOOKUP_INVENTORY_SQL, [filters.productId ?? null, filters.locationId ?? null]);
  return rows.map((row) => ({
    productId: String(row.product_id),
    sku: row.sku,
    productName: row.product_name,
    locationId: String(row.location_id),
    locationName: row.location_name,
    city: row.city,
    stockQuantity: Number(row.stock_quantity),
    inStock: Number(row.stock_quantity) > 0,
    updatedAt: iso(row.updated_at),
  }));
}
