/**
 * Catalog routes (registered under /api): categories, store locations,
 * product browsing with category / store / city / in-stock filters, product
 * detail, and per-product / per-store inventory lookup.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { dbId, parseInput } from '../http/contract.js';
import { getProduct, listCategories, listLocations, listProducts, lookupInventory } from '../store/catalog.js';
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

export const productParams = z.object({ productId: dbId });

export const inventoryQuery = z
  .object({ productId: dbId.optional(), locationId: dbId.optional() })
  .refine((value) => value.productId !== undefined || value.locationId !== undefined, {
    error: 'Provide productId, locationId, or both',
  });

export const catalogRoutes: FastifyPluginAsync<CatalogRoutesOptions> = async (app, { db }) => {
  app.get('/categories', async () => ({ items: await listCategories(db) }));

  app.get('/locations', async () => ({ items: await listLocations(db) }));

  app.get('/products', async (request) => {
    const filters = parseInput(productListQuery, request.query, 'query');
    return listProducts(db, filters);
  });

  app.get('/products/:productId', async (request) => {
    const { productId } = parseInput(productParams, request.params, 'params');
    return { product: await getProduct(db, productId) };
  });

  app.get('/inventory', async (request) => {
    const filters = parseInput(inventoryQuery, request.query, 'query');
    return { items: await lookupInventory(db, filters) };
  });
};
