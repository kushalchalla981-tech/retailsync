/**
 * Catalog seeder: upserts the demo catalog (`db/seed-data.json`) into
 * PostgreSQL, then indexes every active product into OpenSearch through the
 * `products` alias so search works immediately.
 *
 * Idempotent - safe to run any number of times:
 *   - Rows are matched on natural keys (store_locations.name, categories.slug,
 *     products.sku, inventory (product_id, location_id)) with
 *     INSERT ... ON CONFLICT DO UPDATE.
 *   - Updates are guarded by IS DISTINCT FROM, so an unchanged row is not
 *     rewritten (no dead tuples, no updated_at churn) and is reported as "unchanged".
 *   - Stock is RESET to the catalog quantities on every run. This is what makes
 *     the last-unit concurrency demo repeatable; rows and products that are not
 *     in the catalog are left untouched (never deleted).
 *   - All PostgreSQL writes happen in one transaction under an advisory lock
 *     (concurrent seeders serialise; a failure leaves nothing half-written),
 *     and the result is verified before COMMIT.
 *   - Documents use `_id = product_id` and are written with the bulk API using
 *     `require_alias`, so re-indexing overwrites instead of duplicating and a
 *     missing alias can never auto-create a mapping-less `products` index.
 *
 * Prerequisites (checked before any write): `npm run db:migrate` and
 * `npm run search:init` have been run.
 *
 * Usage:  npm run seed
 */
import type { API } from '@opensearch-project/opensearch';

import { errorMessage, isMainModule, runCli } from '../cli.js';
import { ConfigError, getOpenSearchConfig, getPostgresConfig } from '../config.js';
import { inventoryRows, lastUnitRows, loadSeedCatalog, type SeedCatalog } from '../db/seed-data.js';
import {
  buildProductDocument,
  openSearchIndexAdmin,
  PRODUCTS_ALIAS,
  type ProductDocument,
  type ProductInventoryEntry,
  type ProductSource,
} from '../search/mappings.js';
import { closeOpenSearch, getOpenSearch } from '../services/opensearch.js';
import { closePgPool, query, withTransaction } from '../services/postgres.js';

/** Minimal query interface (pg Pool / PoolClient satisfy it; tests use a fake). */
export interface Queryable {
  query<R extends object = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}

export interface SqlStatement {
  text: string;
  values: unknown[];
}

// ---------------------------------------------------------------------------
// PostgreSQL upserts
// ---------------------------------------------------------------------------

/** Advisory lock key: serialises concurrent seed runs (transaction-scoped). */
export const SEED_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('retailsync:seed'))";

export const REQUIRED_TABLES = ['store_locations', 'categories', 'products', 'inventory'] as const;

export const SCHEMA_CHECK_SQL = `SELECT t.name, to_regclass('public.' || t.name) IS NOT NULL AS present
  FROM unnest($1::text[]) AS t(name)`;

/** Fail before writing anything when the schema has not been migrated. */
export async function assertSchemaReady(db: Queryable): Promise<void> {
  const { rows } = await db.query<{ name: string; present: boolean }>(SCHEMA_CHECK_SQL, [[...REQUIRED_TABLES]]);
  const missing = REQUIRED_TABLES.filter((table) => !rows.some((row) => row.name === table && row.present));
  if (missing.length > 0) {
    throw new Error(`PostgreSQL schema is not migrated (missing table(s): ${missing.join(', ')}) - run: npm run db:migrate`);
  }
}

// `RETURNING (xmax = 0)` is true for a freshly inserted row and false for a
// conflict-updated one; rows skipped by the IS DISTINCT FROM guard return nothing.

export function buildLocationUpsert(catalog: SeedCatalog): SqlStatement {
  return {
    text: `INSERT INTO store_locations (name, city, address)
SELECT s.name, s.city, s.address
  FROM unnest($1::text[], $2::text[], $3::text[]) AS s(name, city, address)
ON CONFLICT ON CONSTRAINT store_locations_name_key DO UPDATE
   SET city = EXCLUDED.city, address = EXCLUDED.address
 WHERE (store_locations.city, store_locations.address) IS DISTINCT FROM (EXCLUDED.city, EXCLUDED.address)
RETURNING (xmax = 0) AS inserted`,
    values: [catalog.locations.map((l) => l.name), catalog.locations.map((l) => l.city), catalog.locations.map((l) => l.address)],
  };
}

export function buildCategoryUpsert(catalog: SeedCatalog): SqlStatement {
  return {
    text: `INSERT INTO categories (slug, name)
SELECT s.slug, s.name
  FROM unnest($1::text[], $2::text[]) AS s(slug, name)
ON CONFLICT ON CONSTRAINT categories_slug_key DO UPDATE
   SET name = EXCLUDED.name
 WHERE categories.name IS DISTINCT FROM EXCLUDED.name
RETURNING (xmax = 0) AS inserted`,
    values: [catalog.categories.map((c) => c.slug), catalog.categories.map((c) => c.name)],
  };
}

/** Prices travel as exact decimal strings into NUMERIC(12,2) (never via float rounding in SQL). */
export function formatPrice(price: number): string {
  return price.toFixed(2);
}

export function buildProductUpsert(catalog: SeedCatalog): SqlStatement {
  const p = catalog.products;
  return {
    text: `INSERT INTO products (sku, name, description, price, image_url, category_id, is_active)
SELECT s.sku, s.name, s.description, s.price, s.image_url, c.id, TRUE
  FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::text[], $6::text[])
       AS s(sku, name, description, price, image_url, category_slug)
  JOIN categories c ON c.slug = s.category_slug
ON CONFLICT ON CONSTRAINT products_sku_key DO UPDATE
   SET name = EXCLUDED.name,
       description = EXCLUDED.description,
       price = EXCLUDED.price,
       image_url = EXCLUDED.image_url,
       category_id = EXCLUDED.category_id,
       is_active = EXCLUDED.is_active
 WHERE (products.name, products.description, products.price, products.image_url, products.category_id, products.is_active)
       IS DISTINCT FROM
       (EXCLUDED.name, EXCLUDED.description, EXCLUDED.price, EXCLUDED.image_url, EXCLUDED.category_id, EXCLUDED.is_active)
RETURNING (xmax = 0) AS inserted`,
    values: [
      p.map((x) => x.sku),
      p.map((x) => x.name),
      p.map((x) => x.description),
      p.map((x) => formatPrice(x.price)),
      p.map((x) => x.image_url),
      p.map((x) => x.category),
    ],
  };
}

export function buildInventoryUpsert(catalog: SeedCatalog): SqlStatement {
  const rows = inventoryRows(catalog);
  return {
    text: `INSERT INTO inventory (product_id, location_id, stock_quantity)
SELECT p.id, l.id, s.stock_quantity
  FROM unnest($1::text[], $2::text[], $3::int[]) AS s(sku, location_name, stock_quantity)
  JOIN products p ON p.sku = s.sku
  JOIN store_locations l ON l.name = s.location_name
ON CONFLICT ON CONSTRAINT inventory_product_location_key DO UPDATE
   SET stock_quantity = EXCLUDED.stock_quantity
 WHERE inventory.stock_quantity IS DISTINCT FROM EXCLUDED.stock_quantity
RETURNING (xmax = 0) AS inserted`,
    values: [rows.map((r) => r.sku), rows.map((r) => r.location_name), rows.map((r) => r.stock_quantity)],
  };
}

/**
 * Post-write check (inside the transaction): every catalog row must now exist.
 * Guards the JOINs in the product/inventory upserts, which would otherwise
 * drop a row silently instead of failing.
 */
export function buildVerification(catalog: SeedCatalog): SqlStatement {
  const rows = inventoryRows(catalog);
  return {
    text: `SELECT (SELECT count(*) FROM store_locations WHERE name = ANY($1::text[]))::int AS locations,
       (SELECT count(*) FROM categories WHERE slug = ANY($2::text[]))::int AS categories,
       (SELECT count(*) FROM products WHERE sku = ANY($3::text[]) AND is_active)::int AS products,
       (SELECT count(*)
          FROM unnest($4::text[], $5::text[], $6::int[]) AS s(sku, location_name, stock_quantity)
          JOIN products p ON p.sku = s.sku
          JOIN store_locations l ON l.name = s.location_name
          JOIN inventory i ON i.product_id = p.id AND i.location_id = l.id
         WHERE i.stock_quantity = s.stock_quantity)::int AS inventory`,
    values: [
      catalog.locations.map((l) => l.name),
      catalog.categories.map((c) => c.slug),
      catalog.products.map((p) => p.sku),
      rows.map((r) => r.sku),
      rows.map((r) => r.location_name),
      rows.map((r) => r.stock_quantity),
    ],
  };
}

export interface UpsertCounts {
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
}

export interface SeedDbResult {
  locations: UpsertCounts;
  categories: UpsertCounts;
  products: UpsertCounts;
  inventory: UpsertCounts;
}

export function countUpserts(total: number, rows: readonly { inserted: boolean }[]): UpsertCounts {
  const inserted = rows.filter((row) => row.inserted).length;
  const updated = rows.length - inserted;
  return { total, inserted, updated, unchanged: total - rows.length };
}

/** Upsert the whole catalog. Run inside a transaction (see `main`); verifies before returning. */
export async function seedDatabase(db: Queryable, catalog: SeedCatalog): Promise<SeedDbResult> {
  await db.query(SEED_LOCK_SQL);
  const run = async (statement: SqlStatement, total: number) =>
    countUpserts(total, (await db.query<{ inserted: boolean }>(statement.text, statement.values)).rows);

  const result: SeedDbResult = {
    locations: await run(buildLocationUpsert(catalog), catalog.locations.length),
    categories: await run(buildCategoryUpsert(catalog), catalog.categories.length),
    products: await run(buildProductUpsert(catalog), catalog.products.length),
    inventory: await run(buildInventoryUpsert(catalog), inventoryRows(catalog).length),
  };

  const verification = buildVerification(catalog);
  const actual = (await db.query<Record<keyof SeedDbResult, number>>(verification.text, verification.values)).rows[0];
  const mismatches = (Object.keys(result) as (keyof SeedDbResult)[]).filter((key) => actual?.[key] !== result[key].total);
  if (mismatches.length > 0) {
    throw new Error(
      `seed verification failed (rolled back): ${mismatches
        .map((key) => `${key} expected ${result[key].total}, found ${actual?.[key] ?? 'none'}`)
        .join('; ')}`,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// OpenSearch indexing
// ---------------------------------------------------------------------------

/** Active products with category and per-location stock, shaped for buildProductDocument(). */
export const INDEX_SOURCE_SQL = `SELECT p.id, p.sku, p.name, p.description, c.slug AS category_slug, c.name AS category_name,
       p.price, p.image_url, p.is_active, p.created_at, p.updated_at,
       COALESCE(
         json_agg(json_build_object('location_id', l.id, 'location_name', l.name, 'city', l.city, 'stock_quantity', i.stock_quantity)
                  ORDER BY l.id) FILTER (WHERE i.id IS NOT NULL),
         '[]'::json) AS inventory
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN inventory i ON i.product_id = p.id
  LEFT JOIN store_locations l ON l.id = i.location_id
 WHERE p.is_active
 GROUP BY p.id, c.id
 ORDER BY p.id`;

/** Inactive products: their documents are removed so search only returns sellable items. */
export const INACTIVE_PRODUCTS_SQL = 'SELECT id FROM products WHERE NOT is_active ORDER BY id';

type IndexSourceRow = ProductSource & { inventory: ProductInventoryEntry[] };

export async function loadProductDocuments(db: Queryable): Promise<ProductDocument[]> {
  const { rows } = await db.query<IndexSourceRow>(INDEX_SOURCE_SQL);
  return rows.map(({ inventory, ...product }) =>
    buildProductDocument(
      product,
      inventory.map((entry) => ({ ...entry, location_id: Number(entry.location_id), stock_quantity: Number(entry.stock_quantity) })),
    ),
  );
}

export async function loadInactiveProductIds(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ id: string | number }>(INACTIVE_PRODUCTS_SQL);
  return rows.map((row) => String(row.id));
}

export type BulkBody = API.Bulk_RequestBody;
export type BulkResponse = API.Bulk_ResponseBody;

/** NDJSON-style bulk operations: index each document (_id = product_id) and delete inactive ones, via the alias. */
export function buildBulkBody(documents: readonly ProductDocument[], deleteIds: readonly string[] = []): BulkBody {
  return [
    ...documents.flatMap((document) => [{ index: { _index: PRODUCTS_ALIAS, _id: String(document.product_id) } }, document]),
    ...deleteIds.map((id) => ({ delete: { _index: PRODUCTS_ALIAS, _id: id } })),
  ];
}

/** The search-side operations the seeder needs (adapter keeps it testable). */
export interface SearchIndexer {
  aliasExists(alias: string): Promise<boolean>;
  bulk(body: BulkBody): Promise<BulkResponse>;
}

export function openSearchIndexer(client = getOpenSearch()): SearchIndexer {
  return {
    aliasExists: (alias) => openSearchIndexAdmin(client).aliasExists(alias),
    async bulk(body) {
      // require_alias: never auto-create a concrete `products` index;
      // refresh=wait_for: documents are searchable when the seeder returns.
      return (await client.bulk({ body, require_alias: true, refresh: 'wait_for' })).body;
    },
  };
}

export async function assertSearchReady(indexer: SearchIndexer): Promise<void> {
  if (!(await indexer.aliasExists(PRODUCTS_ALIAS))) {
    throw new Error(`OpenSearch alias "${PRODUCTS_ALIAS}" does not exist - run: npm run search:init`);
  }
}

export interface IndexResult {
  indexed: number;
  deleted: number;
  batches: number;
}

/** Bulk-index documents in batches; any per-item failure fails the run with the first reasons. */
export async function indexProducts(
  indexer: SearchIndexer,
  documents: readonly ProductDocument[],
  deleteIds: readonly string[] = [],
  batchSize = 250,
): Promise<IndexResult> {
  const result: IndexResult = { indexed: 0, deleted: 0, batches: 0 };
  const failures: string[] = [];
  const batches: { docs: readonly ProductDocument[]; deletes: readonly string[] }[] = [];
  for (let i = 0; i < documents.length; i += batchSize) batches.push({ docs: documents.slice(i, i + batchSize), deletes: [] });
  if (deleteIds.length > 0) batches.push({ docs: [], deletes: deleteIds });

  for (const batch of batches) {
    const response = await indexer.bulk(buildBulkBody(batch.docs, batch.deletes));
    result.batches += 1;
    for (const item of response.items) {
      const [action, outcome] = Object.entries(item)[0] ?? [];
      if (!action || !outcome) continue;
      const ok = outcome.status < 300 || (action === 'delete' && outcome.status === 404);
      if (!ok) {
        failures.push(`${action} ${outcome._id ?? '?'}: ${outcome.error?.type ?? outcome.status} ${outcome.error?.reason ?? ''}`.trim());
      } else if (action === 'delete') {
        if (outcome.status !== 404) result.deleted += 1;
      } else {
        result.indexed += 1;
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length} OpenSearch bulk operation(s) failed: ${failures.slice(0, 5).join('; ')}${failures.length > 5 ? '; ...' : ''}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function formatCounts(label: string, counts: UpsertCounts): string {
  return `${label.padEnd(16)} ${String(counts.total).padStart(4)} total: ${counts.inserted} inserted, ${counts.updated} updated, ${counts.unchanged} unchanged`;
}

/** PostgreSQL + OpenSearch config, reporting the issues of both sections at once. */
export function loadSeedConfig(
  loaders: { pg: typeof getPostgresConfig; os: typeof getOpenSearchConfig } = { pg: getPostgresConfig, os: getOpenSearchConfig },
) {
  const issues: string[] = [];
  const attempt = <T>(load: () => T): T | undefined => {
    try {
      return load();
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      issues.push(...error.issues);
      return undefined;
    }
  };
  const pg = attempt(loaders.pg);
  const os = attempt(loaders.os);
  if (!pg || !os) throw new ConfigError(issues);
  return { pg, os };
}

async function main(args: readonly string[]): Promise<void> {
  if (args.length > 0) throw new Error(`unknown argument(s): ${args.join(' ')} (seed takes no arguments)`);

  // Validate the catalog and both config sections before opening any connection.
  const catalog = loadSeedCatalog();
  const { pg, os } = loadSeedConfig();
  console.log(
    `[seed] catalog: ${catalog.products.length} products, ${catalog.categories.length} categories, ` +
      `${catalog.locations.length} store locations, ${inventoryRows(catalog).length} inventory rows`,
  );
  console.log(`[seed] targets: PostgreSQL ${pg.host}:${pg.port}/${pg.database}, OpenSearch ${os.node} (alias "${PRODUCTS_ALIAS}")`);

  const indexer = openSearchIndexer();
  // Both prerequisites are checked before the first write; report every unmet one.
  const preflight = await Promise.allSettled([
    assertSchemaReady({ query: (text, values) => query(text, values) }),
    assertSearchReady(indexer),
  ]);
  const unmet = preflight.flatMap((outcome) => (outcome.status === 'rejected' ? [errorMessage(outcome.reason)] : []));
  if (unmet.length > 0) throw new Error(`pre-flight checks failed, nothing written:\n  - ${unmet.join('\n  - ')}`);

  const started = performance.now();
  const db = await withTransaction((client) => seedDatabase(client, catalog));
  console.log(`[seed] PostgreSQL committed in ${Math.round(performance.now() - started)} ms`);
  console.log(`[seed]   ${formatCounts('store locations', db.locations)}`);
  console.log(`[seed]   ${formatCounts('categories', db.categories)}`);
  console.log(`[seed]   ${formatCounts('products', db.products)}`);
  console.log(`[seed]   ${formatCounts('inventory rows', db.inventory)}`);

  const indexStarted = performance.now();
  const readOnly: Queryable = { query: (text, values) => query(text, values) };
  const [documents, inactive] = await Promise.all([loadProductDocuments(readOnly), loadInactiveProductIds(readOnly)]);
  const indexed = await indexProducts(indexer, documents, inactive);
  console.log(
    `[seed] OpenSearch: indexed ${indexed.indexed} active product(s) into "${PRODUCTS_ALIAS}"` +
      `${indexed.deleted > 0 ? `, removed ${indexed.deleted} inactive` : ''} in ${Math.round(performance.now() - indexStarted)} ms ` +
      `(${indexed.batches} bulk request(s), searchable now)`,
  );

  const lastUnits = lastUnitRows(catalog);
  if (lastUnits.length > 0) {
    console.log(`[seed] last-unit stock for concurrency demos (exactly 1 unit):`);
    for (const row of lastUnits) {
      const product = catalog.products.find((p) => p.sku === row.sku);
      console.log(`[seed]   ${row.sku.padEnd(9)} ${row.location_name.padEnd(18)} ${product?.name ?? ''}`);
    }
  }
}

if (isMainModule(import.meta.url)) {
  await runCli('seed', main, async () => {
    const results = await Promise.allSettled([closePgPool(), closeOpenSearch()]);
    for (const outcome of results) {
      if (outcome.status === 'rejected') console.error(`[seed] cleanup error: ${errorMessage(outcome.reason)}`);
    }
  });
}
