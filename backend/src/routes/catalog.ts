/**
 * Catalog routes (registered under /api): product browsing with
 * category / store / city / in-stock filters.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { dbId, parseInput } from '../http/contract.js';
import { listProducts } from '../store/catalog.js';
import type { Database } from '../store/db.js';

export interface CatalogRoutesOptions {
  db: Database;
}

export const productListQuery = z.object({
  category: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Expected a category slug').optional(),
  locationId: dbId.optional(),
  city: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[\p{L} .-]+$/u, 'City may contain only letters, spaces, dots and hyphens')
    .optional(),
  inStock: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const catalogRoutes: FastifyPluginAsync<CatalogRoutesOptions> = async (app, { db }) => {
  app.get('/products', async (request) => {
    const filters = parseInput(productListQuery, request.query, 'query');
    return listProducts(db, filters);
  });
};
