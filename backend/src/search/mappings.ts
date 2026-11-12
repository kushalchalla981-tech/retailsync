/**
 * OpenSearch `products` index: analyzers, mappings, document model, and an
 * idempotent initializer.
 *
 * Layout: a versioned concrete index (`products_v1`) behind the `products`
 * alias (write index). Readers and writers always use the alias, so a future
 * analyzer change ships as `products_v2` + reindex + alias swap without
 * touching application code. Analyzer settings cannot be changed on an open
 * index - bump PRODUCTS_INDEX_VERSION instead of editing them in place.
 *
 * Typo tolerance (SEARCH-01) is query-time fuzziness over these analyzers:
 *   - `name`, `description`, `category_name` use `product_text`
 *     (standard tokenizer, lowercase, ASCII folding, possessive + minimal
 *     English stemming) and are the targets of `multi_match` with
 *     `fuzziness: "AUTO"` ("hedphones" -> "headphones").
 *   - `name.autocomplete` indexes 2-20 char edge n-grams and is searched with
 *     the plain (non n-gram) `autocomplete_search` analyzer, giving
 *     search-as-you-type prefix matches ("wire" -> "wireless").
 * Filters (SEARCH-02) use exact `keyword` / numeric fields: `category`,
 * `city` / `in_stock_cities`, and `price` (scaled_float, supports gte/lte).
 *
 * Usage:  npm run search:init --workspace backend [-- --recreate]
 */
import type { API, Client } from '@opensearch-project/opensearch';

import { errorMessage, isMainModule, runCli } from '../cli.js';
import { getOpenSearchConfig } from '../config.js';
import { closeOpenSearch, getOpenSearch } from '../services/opensearch.js';

export const PRODUCTS_ALIAS = 'products';
export const PRODUCTS_INDEX_VERSION = 1;
export const PRODUCTS_INDEX = `${PRODUCTS_ALIAS}_v${PRODUCTS_INDEX_VERSION}`;

// ---------------------------------------------------------------------------
// Document model (mirrors PostgreSQL products + per-location inventory)
// ---------------------------------------------------------------------------

/** Stock of one product at one store location (PostgreSQL `inventory` row). */
export interface ProductInventoryEntry {
  location_id: number;
  location_name: string;
  city: string;
  stock_quantity: number;
}

/** A document in the `products` index. Field set is enforced by `dynamic: strict`. */
export interface ProductDocument {
  /** PostgreSQL products.id (also used as the OpenSearch document _id). */
  product_id: number;
  sku: string;
  name: string;
  description: string;
  /** Category slug - exact-match filter / facet. */
  category: string;
  category_name: string;
  price: number;
  image_url: string | null;
  is_active: boolean;
  /** Cities that carry the product (have an inventory row), regardless of stock. */
  city: string[];
  /** Cities where stock_quantity > 0 - the "available in my city" filter. */
  in_stock_cities: string[];
  total_stock: number;
  in_stock: boolean;
  inventory: ProductInventoryEntry[];
  created_at: string;
  updated_at: string;
}

type IndexBody = API.Indices_Create_RequestBody;
type Mappings = NonNullable<IndexBody['mappings']>;
type Property = NonNullable<Mappings['properties']>[string];

const keyword = { type: 'keyword' } as const satisfies Property;

/**
 * One mapping entry per ProductDocument field: the mapped type makes the
 * compiler reject a missing or extra field, keeping documents and mapping in lockstep.
 */
export const PRODUCT_PROPERTIES = {
  product_id: { type: 'long' },
  sku: { type: 'keyword', normalizer: 'lowercase_ascii' },
  name: {
    type: 'text',
    analyzer: 'product_text',
    fields: {
      autocomplete: { type: 'text', analyzer: 'autocomplete_index', search_analyzer: 'autocomplete_search' },
      keyword: { type: 'keyword', normalizer: 'lowercase_ascii', ignore_above: 256 },
    },
  },
  description: { type: 'text', analyzer: 'product_text' },
  category: keyword,
  category_name: {
    type: 'text',
    analyzer: 'product_text',
    fields: { keyword: { type: 'keyword', ignore_above: 256 } },
  },
  price: { type: 'scaled_float', scaling_factor: 100 },
  image_url: { type: 'keyword', index: false, doc_values: false },
  is_active: { type: 'boolean' },
  city: keyword,
  in_stock_cities: keyword,
  total_stock: { type: 'integer' },
  in_stock: { type: 'boolean' },
  inventory: {
    type: 'nested',
    properties: {
      location_id: { type: 'long' },
      location_name: keyword,
      city: keyword,
      stock_quantity: { type: 'integer' },
    },
  },
  created_at: { type: 'date' },
  updated_at: { type: 'date' },
} as const satisfies { [K in keyof ProductDocument]: Property };

export const PRODUCTS_MAPPINGS = {
  dynamic: 'strict',
  _meta: { schema_version: PRODUCTS_INDEX_VERSION, source: 'postgresql:products+inventory' },
  properties: PRODUCT_PROPERTIES,
} as const satisfies Mappings;

export const PRODUCTS_SETTINGS = {
  number_of_shards: 1,
  // 0 replicas on a single-node plan (green health), 1 when a second node exists.
  auto_expand_replicas: '0-1',
  analysis: {
    filter: {
      autocomplete_edge_ngram: { type: 'edge_ngram', min_gram: 2, max_gram: 20 },
      english_possessive: { type: 'stemmer', language: 'possessive_english' },
      english_minimal_stem: { type: 'stemmer', language: 'minimal_english' },
    },
    analyzer: {
      product_text: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding', 'english_possessive', 'english_minimal_stem'],
      },
      autocomplete_index: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding', 'autocomplete_edge_ngram'],
      },
      autocomplete_search: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding'],
      },
    },
    normalizer: {
      lowercase_ascii: { type: 'custom', filter: ['lowercase', 'asciifolding'] },
    },
  },
} as const satisfies NonNullable<IndexBody['settings']>;

/** Full create-index request body, including the alias as write index. */
export function buildProductsIndexBody(): IndexBody {
  return {
    settings: PRODUCTS_SETTINGS,
    mappings: PRODUCTS_MAPPINGS,
    aliases: { [PRODUCTS_ALIAS]: { is_write_index: true } },
  } as IndexBody;
}

// ---------------------------------------------------------------------------
// Document builder (shared by the seeder and the Kafka sync consumer)
// ---------------------------------------------------------------------------

export interface ProductSource {
  id: number | string;
  sku: string;
  name: string;
  description: string;
  category_slug: string;
  category_name: string;
  /** NUMERIC comes back from pg as a string. */
  price: number | string;
  image_url: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

const toIso = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

/** Build the index document for a product and its inventory rows (derived fields computed here, once). */
export function buildProductDocument(product: ProductSource, inventory: readonly ProductInventoryEntry[]): ProductDocument {
  const price = Number(product.price);
  if (!Number.isFinite(price)) throw new Error(`product ${product.id}: price is not numeric`);
  const entries = [...inventory].sort((a, b) => a.location_id - b.location_id);
  const unique = (values: string[]) => [...new Set(values)].sort();
  const totalStock = entries.reduce((sum, entry) => sum + entry.stock_quantity, 0);
  return {
    product_id: Number(product.id),
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category_slug,
    category_name: product.category_name,
    price,
    image_url: product.image_url,
    is_active: product.is_active,
    city: unique(entries.map((e) => e.city)),
    in_stock_cities: unique(entries.filter((e) => e.stock_quantity > 0).map((e) => e.city)),
    total_stock: totalStock,
    in_stock: totalStock > 0,
    inventory: entries,
    created_at: toIso(product.created_at),
    updated_at: toIso(product.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Initializer
// ---------------------------------------------------------------------------

/** The subset of index-admin operations the initializer needs (adapter keeps it testable). */
export interface IndexAdmin {
  indexExists(index: string): Promise<boolean>;
  aliasExists(alias: string): Promise<boolean>;
  aliasTargets(alias: string): Promise<string[]>;
  createIndex(index: string, body: IndexBody): Promise<void>;
  putMapping(index: string, mappings: Mappings): Promise<void>;
  putAlias(index: string, alias: string): Promise<void>;
  deleteIndex(index: string): Promise<void>;
}

export function openSearchIndexAdmin(client: Client): IndexAdmin {
  return {
    async indexExists(index) {
      return (await client.indices.exists({ index })).body === true;
    },
    async aliasExists(alias) {
      return (await client.indices.existsAlias({ name: alias })).body === true;
    },
    async aliasTargets(alias) {
      return Object.keys((await client.indices.getAlias({ name: alias })).body);
    },
    async createIndex(index, body) {
      await client.indices.create({ index, body });
    },
    async putMapping(index, mappings) {
      await client.indices.putMapping({ index, body: mappings });
    },
    async putAlias(index, alias) {
      await client.indices.putAlias({ index, name: alias, body: { is_write_index: true } });
    },
    async deleteIndex(index) {
      await client.indices.delete({ index });
    },
  };
}

export interface EnsureIndexOptions {
  /** Delete and recreate the index (DESTROYS indexed documents; reseed afterwards). */
  recreate?: boolean;
}

export interface EnsureIndexResult {
  index: string;
  alias: string;
  outcome: 'created' | 'recreated' | 'up-to-date';
  /** Other indices the alias also points to (left untouched; reported for the operator). */
  otherAliasTargets: string[];
}

/**
 * Ensure `products_v<N>` exists with the current settings/mappings and that
 * the `products` alias points at it. Safe to run repeatedly.
 */
export async function ensureProductsIndex(admin: IndexAdmin, options: EnsureIndexOptions = {}): Promise<EnsureIndexResult> {
  const aliasExists = await admin.aliasExists(PRODUCTS_ALIAS);
  // indices.exists() is also true for an alias, so only probe for a concrete
  // index named "products" when no alias of that name exists.
  if (!aliasExists && (await admin.indexExists(PRODUCTS_ALIAS))) {
    if (!options.recreate) {
      throw new Error(
        `a concrete index named "${PRODUCTS_ALIAS}" exists (usually auto-created by indexing before initialization), ` +
          `so the "${PRODUCTS_ALIAS}" alias cannot be created. Re-run with --recreate to replace it (its documents are deleted).`,
      );
    }
    await admin.deleteIndex(PRODUCTS_ALIAS);
  }

  let outcome: EnsureIndexResult['outcome'];
  const indexExists = await admin.indexExists(PRODUCTS_INDEX);
  if (indexExists && options.recreate) {
    await admin.deleteIndex(PRODUCTS_INDEX);
    await admin.createIndex(PRODUCTS_INDEX, buildProductsIndexBody());
    outcome = 'recreated';
  } else if (!indexExists) {
    await admin.createIndex(PRODUCTS_INDEX, buildProductsIndexBody());
    outcome = options.recreate ? 'recreated' : 'created';
  } else {
    // Additive mapping changes apply in place; incompatible ones fail loudly here.
    try {
      await admin.putMapping(PRODUCTS_INDEX, PRODUCTS_MAPPINGS);
    } catch (error) {
      throw new Error(
        `existing index ${PRODUCTS_INDEX} has an incompatible mapping (${errorMessage(error)}). ` +
          'Bump PRODUCTS_INDEX_VERSION or re-run with --recreate.',
        { cause: error },
      );
    }
    outcome = 'up-to-date';
  }

  const targets = (await admin.aliasExists(PRODUCTS_ALIAS)) ? await admin.aliasTargets(PRODUCTS_ALIAS) : [];
  if (!targets.includes(PRODUCTS_INDEX)) await admin.putAlias(PRODUCTS_INDEX, PRODUCTS_ALIAS);

  return {
    index: PRODUCTS_INDEX,
    alias: PRODUCTS_ALIAS,
    outcome,
    otherAliasTargets: targets.filter((target) => target !== PRODUCTS_INDEX),
  };
}

async function main(args: readonly string[]): Promise<void> {
  const unknown = args.filter((arg) => arg !== '--recreate');
  if (unknown.length > 0) throw new Error(`unknown argument(s): ${unknown.join(' ')} (supported: --recreate)`);
  const recreate = args.includes('--recreate');

  console.log(`[search:init] target ${getOpenSearchConfig().node}${recreate ? ' (--recreate: existing documents will be deleted)' : ''}`);
  const result = await ensureProductsIndex(openSearchIndexAdmin(getOpenSearch()), { recreate });
  console.log(`[search:init] ${result.outcome}: index ${result.index} behind alias "${result.alias}"`);
  if (result.otherAliasTargets.length > 0) {
    console.warn(`[search:init] WARNING: alias "${result.alias}" also points to ${result.otherAliasTargets.join(', ')}`);
  }
}

if (isMainModule(import.meta.url)) {
  await runCli('search:init', main, closeOpenSearch);
}
