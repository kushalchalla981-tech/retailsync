/**
 * Catalog reads: products with per-store stock, categories, store locations
 * and inventory lookups, straight from Aiven PostgreSQL.
 *
 * Every request-derived value is a `$n` bound parameter; SQL text is constant.
 */
import { money, type Queryable } from './db.js';

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
