/**
 * GET /api/search — typo-tolerant product search served by Aiven OpenSearch.
 * Fuzzy multi_match (fuzziness AUTO) over name/description/category, with
 * category / city / price / in-stock filters and facets.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { parseInput } from '../http/contract.js';
import { PRODUCTS_ALIAS, type ProductDocument } from '../search/mappings.js';
import { getOpenSearch } from '../services/opensearch.js';
import type { Product } from '../store/catalog.js';
import { emitTelemetry } from '../telemetry/bus.js';

const searchQuery = z.object({
  q: z.string().trim().max(200).default(''),
  category: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export function toProduct(doc: ProductDocument): Product {
  return {
    id: String(doc.product_id),
    sku: doc.sku,
    name: doc.name,
    description: doc.description,
    price: doc.price,
    imageUrl: doc.image_url,
    category: { id: doc.category, slug: doc.category, name: doc.category_name },
    inventory: doc.inventory.map((e) => ({
      locationId: String(e.location_id),
      locationName: e.location_name,
      city: e.city,
      stockQuantity: e.stock_quantity,
    })),
    totalStock: doc.total_stock,
    inStock: doc.in_stock,
  };
}

type Bucket = { key: string | number; doc_count: number; from?: number; to?: number };

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/search', async (request) => {
    const input = parseInput(searchQuery, request.query, 'query');
    const filter: object[] = [{ term: { is_active: true } }];
    if (input.category) filter.push({ term: { category: input.category } });
    if (input.city) filter.push({ term: { [input.inStock === 'true' ? 'in_stock_cities' : 'city']: input.city } });
    else if (input.inStock === 'true') filter.push({ term: { in_stock: true } });
    if (input.minPrice !== undefined || input.maxPrice !== undefined) {
      filter.push({ range: { price: { gte: input.minPrice, lte: input.maxPrice } } });
    }
    const must = input.q
      ? [
          {
            bool: {
              should: [
                { multi_match: { query: input.q, fields: ['name^3', 'category_name^2', 'description'], fuzziness: 'AUTO', prefix_length: 1 } },
                { match: { 'name.autocomplete': { query: input.q, boost: 2 } } },
              ],
              minimum_should_match: 1,
            },
          },
        ]
      : [{ match_all: {} }];

    const params = {
      index: PRODUCTS_ALIAS,
      body: {
        size: input.limit,
        query: { bool: { must, filter } },
        aggs: {
          category: { terms: { field: 'category', size: 20 } },
          city: { terms: { field: 'in_stock_cities', size: 20 } },
          price: {
            range: {
              field: 'price',
              ranges: [{ to: 1000 }, { from: 1000, to: 5000 }, { from: 5000, to: 20000 }, { from: 20000, to: 50000 }, { from: 50000 }],
            },
          },
        },
      },
    };
    const response = await getOpenSearch().search(params as unknown as Parameters<ReturnType<typeof getOpenSearch>['search']>[0]);
    const body = response.body as unknown as {
      took: number;
      hits: { total: { value: number } | number; hits: { _source: ProductDocument }[] };
      aggregations?: Record<string, { buckets: Bucket[] }>;
    };
    const facet = (name: string) =>
      (body.aggregations?.[name]?.buckets ?? [])
        .filter((b) => b.doc_count > 0)
        .map((b) => ({
          key: name === 'price' ? `${b.from ?? 0}-${b.to ?? ''}` : String(b.key),
          count: b.doc_count,
        }));
    const total = typeof body.hits.total === 'number' ? body.hits.total : body.hits.total.value;
    // The query text is not logged: the ledger stream is public.
    emitTelemetry({
      service: 'opensearch',
      type: 'query',
      message: input.q ? `Fuzzy multi_match (fuzziness AUTO, edge n-gram autocomplete): ${total} hit${total === 1 ? '' : 's'}` : `Browse query: ${total} hit${total === 1 ? '' : 's'}`,
      latencyMs: body.took,
    });
    return {
      items: body.hits.hits.map((hit) => toProduct(hit._source)),
      total,
      tookMs: body.took,
      facets: { category: facet('category'), city: facet('city'), price: facet('price') },
    };
  });
};
