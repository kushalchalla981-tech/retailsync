/**
 * Hermetic tests for the catalog seeder: SQL shape and schema consistency,
 * parameter alignment, upsert accounting, verification, and OpenSearch bulk
 * indexing - all against fakes. Execution against live Aiven PostgreSQL /
 * OpenSearch is pending credentials.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { ConfigError } from '../config.js';
import { resolveMigrationPath } from '../db/migrations.js';
import { inventoryRows, loadSeedCatalog, type SeedCatalog } from '../db/seed-data.js';
import { PRODUCTS_ALIAS, type ProductDocument } from '../search/mappings.js';
import {
  assertSchemaReady,
  assertSearchReady,
  buildBulkBody,
  buildCategoryUpsert,
  buildInventoryUpsert,
  buildLocationUpsert,
  buildProductUpsert,
  buildVerification,
  countUpserts,
  formatCounts,
  formatPrice,
  INACTIVE_PRODUCTS_SQL,
  INDEX_SOURCE_SQL,
  indexProducts,
  loadInactiveProductIds,
  loadProductDocuments,
  loadSeedConfig,
  SCHEMA_CHECK_SQL,
  SEED_LOCK_SQL,
  seedDatabase,
  type BulkBody,
  type BulkResponse,
  type Queryable,
  type SearchIndexer,
  type SqlStatement,
} from './seed.js';

const catalog = loadSeedCatalog();
const schemaSql = readFileSync(resolveMigrationPath('schema.sql'), 'utf8');

/** The column list of `CREATE TABLE IF NOT EXISTS <table> (...)` in schema.sql. */
function tableBlock(table: string): string {
  const match = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`).exec(schemaSql);
  assert.ok(match, `table ${table} not found in schema.sql`);
  return match[1]!;
}

function placeholders(text: string): number {
  return new Set([...text.matchAll(/\$(\d+)/g)].map((m) => m[1])).size;
}

const upserts: [string, (c: SeedCatalog) => SqlStatement][] = [
  ['store_locations', buildLocationUpsert],
  ['categories', buildCategoryUpsert],
  ['products', buildProductUpsert],
  ['inventory', buildInventoryUpsert],
];

describe('seed upsert SQL', () => {
  for (const [table, build] of upserts) {
    describe(table, () => {
      const statement = build(catalog);

      it('inserts only columns that exist in schema.sql', () => {
        const match = /INSERT INTO (\w+) \(([^)]+)\)/.exec(statement.text);
        assert.ok(match);
        assert.equal(match[1], table);
        const block = tableBlock(table);
        for (const column of match[2]!.split(',').map((c) => c.trim())) {
          assert.match(block, new RegExp(`^\\s+${column}\\s`, 'm'), `${table}.${column} missing from schema.sql`);
        }
      });

      it('targets a unique constraint declared on the table', () => {
        const match = /ON CONFLICT ON CONSTRAINT (\w+) DO UPDATE/.exec(statement.text);
        assert.ok(match, 'no ON CONFLICT ... DO UPDATE');
        assert.match(tableBlock(table), new RegExp(`CONSTRAINT ${match[1]} UNIQUE`));
      });

      it('skips unchanged rows and reports insert vs update', () => {
        assert.match(statement.text, /\n WHERE [\s\S]+IS DISTINCT FROM/);
        assert.match(statement.text, /RETURNING \(xmax = 0\) AS inserted$/);
      });

      it('passes one aligned array per placeholder', () => {
        assert.equal(placeholders(statement.text), statement.values.length);
        const lengths = statement.values.map((v) => (v as unknown[]).length);
        assert.ok(lengths.every((n) => n === lengths[0]), `misaligned arrays: ${lengths.join(', ')}`);
        assert.ok(lengths[0]! > 0);
      });
    });
  }

  it('sends exact decimal price strings for NUMERIC(12,2)', () => {
    assert.equal(formatPrice(29990), '29990.00');
    assert.equal(formatPrice(199.5), '199.50');
    assert.equal(formatPrice(0.1 + 0.2), '0.30');
    const prices = buildProductUpsert(catalog).values[3] as string[];
    assert.ok(prices.every((p) => /^\d+\.\d{2}$/.test(p)));
    assert.match(buildProductUpsert(catalog).text, /\$4::numeric\[\]/);
  });

  it('resolves category and location ids by natural key and (re)activates seeded products', () => {
    const products = buildProductUpsert(catalog).text;
    assert.match(products, /JOIN categories c ON c\.slug = s\.category_slug/);
    assert.match(products, /c\.id, TRUE/);
    const inventory = buildInventoryUpsert(catalog).text;
    assert.match(inventory, /JOIN products p ON p\.sku = s\.sku/);
    assert.match(inventory, /JOIN store_locations l ON l\.name = s\.location_name/);
    assert.match(inventory, /SET stock_quantity = EXCLUDED\.stock_quantity/);
  });

  it('inventory rows carry every catalog (product, location) pair including zero stock', () => {
    const [skus, locations, quantities] = buildInventoryUpsert(catalog).values as [string[], string[], number[]];
    assert.equal(skus.length, inventoryRows(catalog).length);
    assert.ok(quantities.includes(0));
    assert.ok(quantities.includes(1));
    assert.deepEqual(new Set(locations), new Set(['Bangalore Central', 'Mumbai Metro', 'Delhi Hub']));
  });

  it('verification query checks counts and exact stock per pair', () => {
    const v = buildVerification(catalog);
    assert.equal(placeholders(v.text), v.values.length);
    assert.match(v.text, /WHERE i\.stock_quantity = s\.stock_quantity/);
    assert.match(v.text, /AND is_active/);
  });
});

// ---------------------------------------------------------------------------
// seedDatabase with a scripted fake client
// ---------------------------------------------------------------------------

interface Call {
  text: string;
  values?: unknown[];
}

function fakeDb(respond: (call: Call) => Record<string, unknown>[]): Queryable & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async query<R>(text: string, values?: unknown[]) {
      const call = { text, values };
      calls.push(call);
      return { rows: respond(call) as R[] };
    },
  };
}

const totals = {
  locations: catalog.locations.length,
  categories: catalog.categories.length,
  products: catalog.products.length,
  inventory: inventoryRows(catalog).length,
};

function rowsFor(table: string, inserted: number, updated: number) {
  void table;
  return [...Array.from({ length: inserted }, () => ({ inserted: true })), ...Array.from({ length: updated }, () => ({ inserted: false }))];
}

describe('seedDatabase', () => {
  it('locks, upserts in dependency order, verifies, and counts inserts on a fresh database', async () => {
    const db = fakeDb(({ text }) => {
      if (text.startsWith('INSERT INTO store_locations')) return rowsFor('l', totals.locations, 0);
      if (text.startsWith('INSERT INTO categories')) return rowsFor('c', totals.categories, 0);
      if (text.startsWith('INSERT INTO products')) return rowsFor('p', totals.products, 0);
      if (text.startsWith('INSERT INTO inventory')) return rowsFor('i', totals.inventory, 0);
      if (text.startsWith('SELECT (SELECT count(*) FROM store_locations')) return [totals];
      return [];
    });
    const result = await seedDatabase(db, catalog);
    assert.deepEqual(
      db.calls.map((c) => c.text.split('\n')[0]!.slice(0, 32)),
      [
        SEED_LOCK_SQL.slice(0, 32),
        'INSERT INTO store_locations (nam',
        'INSERT INTO categories (slug, na',
        'INSERT INTO products (sku, name,',
        'INSERT INTO inventory (product_i',
        'SELECT (SELECT count(*) FROM sto',
      ],
    );
    assert.deepEqual(result.products, { total: totals.products, inserted: totals.products, updated: 0, unchanged: 0 });
    assert.deepEqual(result.inventory, { total: totals.inventory, inserted: totals.inventory, updated: 0, unchanged: 0 });
  });

  it('reports a re-run with no changes as all unchanged (idempotent accounting)', async () => {
    const db = fakeDb(({ text }) => (text.startsWith('SELECT (SELECT count(*)') ? [totals] : []));
    const result = await seedDatabase(db, catalog);
    for (const counts of Object.values(result)) {
      assert.equal(counts.inserted, 0);
      assert.equal(counts.updated, 0);
      assert.equal(counts.unchanged, counts.total);
    }
  });

  it('counts stock resets after checkouts as updates', async () => {
    const db = fakeDb(({ text }) => {
      if (text.startsWith('INSERT INTO inventory')) return rowsFor('i', 0, 3);
      return text.startsWith('SELECT (SELECT count(*)') ? [totals] : [];
    });
    const result = await seedDatabase(db, catalog);
    assert.deepEqual(result.inventory, { total: totals.inventory, inserted: 0, updated: 3, unchanged: totals.inventory - 3 });
  });

  it('throws (so the transaction rolls back) when verification finds missing rows', async () => {
    const db = fakeDb(({ text }) =>
      text.startsWith('SELECT (SELECT count(*)') ? [{ ...totals, products: totals.products - 1, inventory: totals.inventory - 2 }] : [],
    );
    await assert.rejects(
      seedDatabase(db, catalog),
      new RegExp(
        `seed verification failed \\(rolled back\\): products expected ${totals.products}, found ${totals.products - 1}; ` +
          `inventory expected ${totals.inventory}, found ${totals.inventory - 2}`,
      ),
    );
  });

  it('countUpserts derives unchanged rows from the skipped ones', () => {
    assert.deepEqual(countUpserts(5, [{ inserted: true }, { inserted: false }]), { total: 5, inserted: 1, updated: 1, unchanged: 3 });
  });
});

describe('preflight checks', () => {
  it('names missing tables and the migrate command', async () => {
    const db = fakeDb(({ text, values }) => {
      assert.equal(text, SCHEMA_CHECK_SQL);
      return (values![0] as string[]).map((name) => ({ name, present: name === 'categories' }));
    });
    await assert.rejects(assertSchemaReady(db), /missing table\(s\): store_locations, products, inventory\) - run: npm run db:migrate/);
  });

  it('passes when all tables exist', async () => {
    const db = fakeDb(({ values }) => (values![0] as string[]).map((name) => ({ name, present: true })));
    await assertSchemaReady(db);
  });

  it('requires the products alias before indexing', async () => {
    const indexer: SearchIndexer = { aliasExists: async () => false, bulk: async () => assert.fail('must not write') };
    await assert.rejects(assertSearchReady(indexer), /alias "products" does not exist - run: npm run search:init/);
  });
});

// ---------------------------------------------------------------------------
// OpenSearch indexing
// ---------------------------------------------------------------------------

describe('search documents', () => {
  it('builds documents from pg rows (bigint ids and NUMERIC prices arrive as strings)', async () => {
    const db = fakeDb(({ text }) => {
      assert.equal(text, INDEX_SOURCE_SQL);
      return [
        {
          id: '7',
          sku: 'ELEC-009',
          name: 'Sony PlayStation 5 Slim Console',
          description: 'Console',
          category_slug: 'electronics',
          category_name: 'Electronics',
          price: '54990.00',
          image_url: null,
          is_active: true,
          created_at: new Date('2026-11-12T10:00:00Z'),
          updated_at: new Date('2026-11-12T10:00:00Z'),
          inventory: [
            { location_id: 3, location_name: 'Delhi Hub', city: 'Delhi', stock_quantity: 0 },
            { location_id: 1, location_name: 'Bangalore Central', city: 'Bangalore', stock_quantity: 1 },
          ],
        },
      ];
    });
    const [doc] = await loadProductDocuments(db);
    assert.equal(doc!.product_id, 7);
    assert.equal(doc!.price, 54990);
    assert.deepEqual(doc!.city, ['Bangalore', 'Delhi']);
    assert.deepEqual(doc!.in_stock_cities, ['Bangalore']);
    assert.equal(doc!.total_stock, 1);
    assert.equal(doc!.inventory[0]!.location_id, 1);
  });

  it('index source SQL only selects active products and aggregates per-location stock', () => {
    assert.match(INDEX_SOURCE_SQL, /WHERE p\.is_active/);
    assert.match(INDEX_SOURCE_SQL, /LEFT JOIN inventory i ON i\.product_id = p\.id/);
    assert.match(INDEX_SOURCE_SQL, /FILTER \(WHERE i\.id IS NOT NULL\)/);
  });

  it('loads inactive ids as strings', async () => {
    const db = fakeDb(({ text }) => {
      assert.equal(text, INACTIVE_PRODUCTS_SQL);
      return [{ id: '12' }, { id: 15 }];
    });
    assert.deepEqual(await loadInactiveProductIds(db), ['12', '15']);
  });
});

function doc(id: number): ProductDocument {
  return { product_id: id, sku: `T-${id}` } as ProductDocument;
}

function okResponse(body: BulkBody, status: (action: string) => number = (action) => (action === 'delete' ? 200 : 201)): BulkResponse {
  const items = body
    .filter((entry): entry is Record<string, { _id: string }> => typeof entry === 'object' && ('index' in entry || 'delete' in entry))
    .map((entry) => {
      const [action, meta] = Object.entries(entry)[0]!;
      return { [action]: { _index: 'products_v1', _id: meta._id, status: status(action) } };
    });
  return { errors: false, took: 1, items } as BulkResponse;
}

describe('bulk indexing', () => {
  it('pairs an index action (alias, _id = product id) with each document, then deletes', () => {
    const body = buildBulkBody([doc(1), doc(2)], ['9']);
    assert.deepEqual(body, [
      { index: { _index: PRODUCTS_ALIAS, _id: '1' } },
      doc(1),
      { index: { _index: PRODUCTS_ALIAS, _id: '2' } },
      doc(2),
      { delete: { _index: PRODUCTS_ALIAS, _id: '9' } },
    ]);
  });

  it('batches requests and counts results; deleting an absent document is fine', async () => {
    const bodies: BulkBody[] = [];
    const indexer: SearchIndexer = {
      aliasExists: async () => true,
      bulk: async (body) => {
        bodies.push(body);
        return okResponse(body, (action) => (action === 'delete' ? 404 : 201));
      },
    };
    const result = await indexProducts(indexer, [1, 2, 3, 4, 5].map(doc), ['40'], 2);
    assert.deepEqual(result, { indexed: 5, deleted: 0, batches: 4 });
    assert.deepEqual(
      bodies.map((b) => b.length),
      [4, 4, 2, 1],
    );
  });

  it('fails with per-item reasons when any document is rejected', async () => {
    const indexer: SearchIndexer = {
      aliasExists: async () => true,
      bulk: async (body) => {
        const response = okResponse(body);
        response.errors = true;
        response.items[1] = {
          index: { _index: 'products_v1', _id: '2', status: 400, error: { type: 'strict_dynamic_mapping_exception', reason: 'mapping set to strict' } },
        } as BulkResponse['items'][number];
        return response;
      },
    };
    await assert.rejects(
      indexProducts(indexer, [doc(1), doc(2)]),
      /1 OpenSearch bulk operation\(s\) failed: index 2: strict_dynamic_mapping_exception mapping set to strict/,
    );
  });

  it('formats upsert counts for the CLI summary', () => {
    assert.equal(
      formatCounts('products', { total: 61, inserted: 2, updated: 1, unchanged: 58 }),
      'products           61 total: 2 inserted, 1 updated, 58 unchanged',
    );
  });
});

describe('seed configuration', () => {
  it('reports PostgreSQL and OpenSearch config issues together', () => {
    assert.throws(
      () =>
        loadSeedConfig({
          pg: () => {
            throw new ConfigError(['AIVEN_PG_URI: is required']);
          },
          os: () => {
            throw new ConfigError(['AIVEN_OPENSEARCH_URI: is required']);
          },
        }),
      (error: unknown) =>
        error instanceof ConfigError && error.issues.join('|') === 'AIVEN_PG_URI: is required|AIVEN_OPENSEARCH_URI: is required',
    );
  });
});
