/**
 * Offline tests for the OpenSearch `products` index definition and initializer.
 *
 * The request body is additionally type-checked against the OpenSearch API
 * spec types at compile time (see `satisfies` in mappings.ts). These tests
 * check internal consistency (every referenced analyzer/filter is defined,
 * document <-> mapping lockstep) and initializer behaviour with a fake admin.
 * Whether OpenSearch accepts the body is pending a live cluster (WINDOWS.md).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildProductDocument,
  buildProductsIndexBody,
  ensureProductsIndex,
  PRODUCT_PROPERTIES,
  PRODUCTS_ALIAS,
  PRODUCTS_INDEX,
  PRODUCTS_MAPPINGS,
  PRODUCTS_SETTINGS,
  type IndexAdmin,
  type ProductSource,
} from './mappings.js';

type Json = Record<string, unknown>;

/** Round-trip through JSON: exactly what the client sends over the wire. */
const body = JSON.parse(JSON.stringify(buildProductsIndexBody())) as {
  settings: Json & { analysis: { analyzer: Record<string, Json>; filter: Record<string, Json>; normalizer: Record<string, Json> } };
  mappings: Json & { properties: Record<string, Json> };
  aliases: Record<string, Json>;
};

/** Built-in token filters used by the custom analyzers. */
const BUILT_IN_FILTERS = new Set(['lowercase', 'asciifolding']);
const BUILT_IN_ANALYZERS = new Set(['standard', 'simple', 'whitespace', 'keyword']);

/** Walk mapping properties (including multi-fields and nested properties). */
function* walkFields(properties: Record<string, Json>, prefix = ''): Generator<[string, Json]> {
  for (const [name, field] of Object.entries(properties)) {
    const path = `${prefix}${name}`;
    yield [path, field];
    if (field.fields) yield* walkFields(field.fields as Record<string, Json>, `${path}.`);
    if (field.properties) yield* walkFields(field.properties as Record<string, Json>, `${path}.`);
  }
}

describe('products index body', () => {
  it('creates the versioned index behind the products alias as write index', () => {
    assert.equal(PRODUCTS_ALIAS, 'products');
    assert.equal(PRODUCTS_INDEX, 'products_v1');
    assert.deepEqual(body.aliases, { products: { is_write_index: true } });
    assert.deepEqual(Object.keys(body).sort(), ['aliases', 'mappings', 'settings']);
  });

  it('uses a single shard with replicas that adapt to the cluster size', () => {
    assert.equal(body.settings.number_of_shards, 1);
    assert.equal(body.settings.auto_expand_replicas, '0-1');
  });

  it('rejects unmapped fields (dynamic: strict) and records the schema version', () => {
    assert.equal(body.mappings.dynamic, 'strict');
    assert.deepEqual(body.mappings._meta, { schema_version: 1, source: 'postgresql:products+inventory' });
  });

  it('defines every analyzer and normalizer referenced by the mapping', () => {
    const analyzers = new Set(Object.keys(body.settings.analysis.analyzer));
    const normalizers = new Set(Object.keys(body.settings.analysis.normalizer));
    let checked = 0;
    for (const [path, field] of walkFields(body.mappings.properties)) {
      for (const key of ['analyzer', 'search_analyzer'] as const) {
        const name = field[key] as string | undefined;
        if (!name) continue;
        checked += 1;
        assert.ok(analyzers.has(name) || BUILT_IN_ANALYZERS.has(name), `${path}.${key} -> ${name} is defined`);
      }
      if (field.normalizer) assert.ok(normalizers.has(field.normalizer as string), `${path}.normalizer is defined`);
    }
    assert.ok(checked >= 5, 'analyzers are actually referenced');
  });

  it('defines every token filter referenced by the custom analyzers and normalizers', () => {
    const custom = new Set(Object.keys(body.settings.analysis.filter));
    for (const [name, def] of [...Object.entries(body.settings.analysis.analyzer), ...Object.entries(body.settings.analysis.normalizer)]) {
      for (const filter of def.filter as string[]) {
        assert.ok(custom.has(filter) || BUILT_IN_FILTERS.has(filter), `${name} uses defined filter ${filter}`);
      }
    }
  });

  it('autocomplete: edge n-grams at index time only (search side is not n-grammed)', () => {
    const edge = body.settings.analysis.filter.autocomplete_edge_ngram!;
    assert.equal(edge.type, 'edge_ngram');
    assert.ok((edge.min_gram as number) >= 1 && (edge.min_gram as number) <= (edge.max_gram as number));
    const name = body.mappings.properties.name! as { fields: Record<string, Json> };
    assert.deepEqual(name.fields.autocomplete, {
      type: 'text',
      analyzer: 'autocomplete_index',
      search_analyzer: 'autocomplete_search',
    });
    assert.ok((body.settings.analysis.analyzer.autocomplete_index!.filter as string[]).includes('autocomplete_edge_ngram'));
    assert.ok(!(body.settings.analysis.analyzer.autocomplete_search!.filter as string[]).includes('autocomplete_edge_ngram'));
  });

  it('fuzzy-match targets are full-text fields with the product_text analyzer', () => {
    for (const field of ['name', 'description', 'category_name']) {
      assert.equal(body.mappings.properties[field]!.type, 'text', field);
      assert.equal(body.mappings.properties[field]!.analyzer, 'product_text', field);
    }
    const productText = body.settings.analysis.analyzer.product_text!;
    assert.equal(productText.tokenizer, 'standard');
    assert.deepEqual((productText.filter as string[]).slice(0, 2), ['lowercase', 'asciifolding']);
  });

  it('filter fields: keyword category/city, numeric price for gte/lte ranges', () => {
    const p = body.mappings.properties;
    assert.equal(p.category!.type, 'keyword');
    assert.equal(p.city!.type, 'keyword');
    assert.equal(p.in_stock_cities!.type, 'keyword');
    assert.deepEqual(p.price, { type: 'scaled_float', scaling_factor: 100 });
    assert.equal(p.in_stock!.type, 'boolean');
    assert.equal(p.inventory!.type, 'nested');
  });

  it('exports consistent constants', () => {
    assert.equal(PRODUCTS_MAPPINGS.properties, PRODUCT_PROPERTIES);
    assert.equal(buildProductsIndexBody().settings, PRODUCTS_SETTINGS);
  });
});

// ---------------------------------------------------------------------------

const source: ProductSource = {
  id: '42',
  sku: 'EL-HP-001',
  name: 'Wireless Headphones',
  description: 'Noise cancelling over-ear headphones',
  category_slug: 'electronics',
  category_name: 'Electronics',
  price: '2499.00',
  image_url: null,
  is_active: true,
  created_at: new Date('2026-11-12T10:00:00Z'),
  updated_at: '2026-11-12T11:00:00Z',
};

describe('buildProductDocument', () => {
  const doc = buildProductDocument(source, [
    { location_id: 3, location_name: 'Delhi Hub', city: 'Delhi', stock_quantity: 0 },
    { location_id: 1, location_name: 'Bangalore Central', city: 'Bangalore', stock_quantity: 1 },
    { location_id: 2, location_name: 'Mumbai Metro', city: 'Mumbai', stock_quantity: 4 },
  ]);

  it('produces exactly the mapped fields (strict mapping would reject anything else)', () => {
    assert.deepEqual(Object.keys(doc).sort(), Object.keys(PRODUCT_PROPERTIES).sort());
    const nested = Object.keys(PRODUCT_PROPERTIES.inventory.properties).sort();
    for (const entry of doc.inventory) assert.deepEqual(Object.keys(entry).sort(), nested);
  });

  it('converts pg types (bigint id / NUMERIC string / Date) to JSON-friendly values', () => {
    assert.equal(doc.product_id, 42);
    assert.equal(doc.price, 2499);
    assert.equal(doc.created_at, '2026-11-12T10:00:00.000Z');
    assert.equal(doc.updated_at, '2026-11-12T11:00:00.000Z');
    assert.equal(doc.category, 'electronics');
  });

  it('derives availability: carried cities, in-stock cities, total stock', () => {
    assert.deepEqual(doc.city, ['Bangalore', 'Delhi', 'Mumbai']);
    assert.deepEqual(doc.in_stock_cities, ['Bangalore', 'Mumbai']);
    assert.equal(doc.total_stock, 5);
    assert.equal(doc.in_stock, true);
    assert.deepEqual(doc.inventory.map((e) => e.location_id), [1, 2, 3], 'stable order');
  });

  it('marks products with no stock anywhere as out of stock', () => {
    const empty = buildProductDocument(source, [{ location_id: 1, location_name: 'X', city: 'Pune', stock_quantity: 0 }]);
    assert.equal(empty.in_stock, false);
    assert.deepEqual(empty.in_stock_cities, []);
    assert.deepEqual(empty.city, ['Pune']);
  });

  it('rejects non-numeric prices', () => {
    assert.throws(() => buildProductDocument({ ...source, price: 'abc' }, []), /price is not numeric/);
  });
});

// ---------------------------------------------------------------------------

interface FakeState {
  indices: Set<string>;
  aliases: Map<string, string[]>;
  putMappingError?: Error;
}

function fakeAdmin(state: FakeState) {
  const calls: string[] = [];
  const admin: IndexAdmin = {
    async indexExists(index) {
      calls.push(`exists ${index}`);
      return state.indices.has(index) || state.aliases.has(index);
    },
    async aliasExists(alias) {
      calls.push(`aliasExists ${alias}`);
      return state.aliases.has(alias);
    },
    async aliasTargets(alias) {
      return state.aliases.get(alias) ?? [];
    },
    async createIndex(index, requestBody) {
      calls.push(`create ${index}`);
      assert.deepEqual(requestBody, buildProductsIndexBody());
      state.indices.add(index);
      state.aliases.set(PRODUCTS_ALIAS, [...(state.aliases.get(PRODUCTS_ALIAS) ?? []), index]);
    },
    async putMapping(index) {
      calls.push(`putMapping ${index}`);
      if (state.putMappingError) throw state.putMappingError;
    },
    async putAlias(index, alias) {
      calls.push(`putAlias ${index} ${alias}`);
      state.aliases.set(alias, [...(state.aliases.get(alias) ?? []), index]);
    },
    async deleteIndex(index) {
      calls.push(`delete ${index}`);
      state.indices.delete(index);
      for (const [alias, targets] of state.aliases) {
        const left = targets.filter((t) => t !== index);
        if (left.length) state.aliases.set(alias, left);
        else state.aliases.delete(alias);
      }
    },
  };
  return { admin, calls };
}

describe('ensureProductsIndex', () => {
  it('creates the index and alias on an empty cluster', async () => {
    const state: FakeState = { indices: new Set(), aliases: new Map() };
    const { admin, calls } = fakeAdmin(state);
    const result = await ensureProductsIndex(admin);
    assert.deepEqual(result, { index: 'products_v1', alias: 'products', outcome: 'created', otherAliasTargets: [] });
    assert.ok(calls.includes('create products_v1'));
    assert.deepEqual(state.aliases.get('products'), ['products_v1']);
  });

  it('is idempotent: an existing index gets an additive mapping update only', async () => {
    const state: FakeState = { indices: new Set(['products_v1']), aliases: new Map([['products', ['products_v1']]]) };
    const { admin, calls } = fakeAdmin(state);
    const result = await ensureProductsIndex(admin);
    assert.equal(result.outcome, 'up-to-date');
    assert.ok(calls.includes('putMapping products_v1'));
    assert.ok(!calls.some((c) => c.startsWith('create') || c.startsWith('delete') || c.startsWith('putAlias')));
  });

  it('repairs a missing alias on an existing index', async () => {
    const state: FakeState = { indices: new Set(['products_v1']), aliases: new Map() };
    const { admin, calls } = fakeAdmin(state);
    await ensureProductsIndex(admin);
    assert.ok(calls.includes('putAlias products_v1 products'));
    assert.deepEqual(state.aliases.get('products'), ['products_v1']);
  });

  it('refuses to clobber an auto-created concrete "products" index without --recreate', async () => {
    const state: FakeState = { indices: new Set(['products']), aliases: new Map() };
    const { admin, calls } = fakeAdmin(state);
    await assert.rejects(ensureProductsIndex(admin), /concrete index named "products" exists.*--recreate/);
    assert.ok(!calls.some((c) => c.startsWith('delete') || c.startsWith('create')));
  });

  it('--recreate replaces a concrete "products" index with the aliased layout', async () => {
    const state: FakeState = { indices: new Set(['products']), aliases: new Map() };
    const { admin, calls } = fakeAdmin(state);
    const result = await ensureProductsIndex(admin, { recreate: true });
    assert.equal(result.outcome, 'recreated');
    assert.deepEqual(calls.filter((c) => /^(delete|create)/.test(c)), ['delete products', 'create products_v1']);
    assert.deepEqual(state.aliases.get('products'), ['products_v1']);
  });

  it('--recreate drops and recreates an existing versioned index', async () => {
    const state: FakeState = { indices: new Set(['products_v1']), aliases: new Map([['products', ['products_v1']]]) };
    const { admin, calls } = fakeAdmin(state);
    const result = await ensureProductsIndex(admin, { recreate: true });
    assert.equal(result.outcome, 'recreated');
    assert.deepEqual(calls.filter((c) => /^(delete|create)/.test(c)), ['delete products_v1', 'create products_v1']);
  });

  it('explains incompatible mappings instead of silently continuing', async () => {
    const state: FakeState = {
      indices: new Set(['products_v1']),
      aliases: new Map([['products', ['products_v1']]]),
      putMappingError: new Error('illegal_argument_exception: mapper [price] cannot be changed from type [float] to [scaled_float]'),
    };
    const { admin } = fakeAdmin(state);
    await assert.rejects(ensureProductsIndex(admin), /incompatible mapping .*cannot be changed.*Bump PRODUCTS_INDEX_VERSION or re-run with --recreate/);
  });

  it('reports other indices behind the alias', async () => {
    const state: FakeState = { indices: new Set(['products_v1', 'legacy']), aliases: new Map([['products', ['legacy', 'products_v1']]]) };
    const { admin } = fakeAdmin(state);
    const result = await ensureProductsIndex(admin);
    assert.deepEqual(result.otherAliasTargets, ['legacy']);
  });
});
