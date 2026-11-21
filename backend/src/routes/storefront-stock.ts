/**
 * Live storefront stock (v1.05):
 *   GET /api/stock                         public: every tracked product's stock
 *   PUT /api/stock/:storeId/:productId     set stock (store owner; platform owner for demo stores)
 *
 * Changes are streamed to every device through the telemetry bus and published to Kafka.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { StorefrontEventSink } from '../events/storefront-events.js';
import { requireUser, type TokenVerifier } from '../http/clerk-auth.js';
import { AppError, notFound, parseInput } from '../http/contract.js';
import type { Database } from '../store/db.js';
import { listStock, setStock } from '../store/storefront-stock.js';
import { emitTelemetry } from '../telemetry/bus.js';

const params = z.object({
  storeId: z.string().regex(/^(ms_[0-9a-f-]{36}|store-\d{1,3})$/, 'Expected a store id'),
  productId: z.string().trim().min(1).max(100),
});
const body = z.object({ stock: z.number().int().min(0).max(1_000_000) });

export interface StockRouteOptions {
  db: Database;
  verifier: TokenVerifier | null;
  events: StorefrontEventSink;
}

export const storefrontStockRoutes: FastifyPluginAsync<StockRouteOptions> = async (app, { db, verifier, events }) => {
  app.get('/stock', async () => ({ items: await listStock(db) }));

  app.put('/stock/:storeId/:productId', async (request) => {
    const user = await requireUser(request, verifier);
    const { storeId, productId } = parseInput(params, request.params, 'params');
    const { stock } = parseInput(body, request.body, 'body');

    if (storeId.startsWith('ms_')) {
      const { rows } = await db.query<{ owner_id: string }>('SELECT owner_id FROM merchant_stores WHERE id = $1', [storeId]);
      if (!rows[0]) throw notFound('STORE_NOT_FOUND', 'Store not found');
      if (rows[0].owner_id !== user.userId && !user.isPlatformOwner) throw new AppError(403, 'NOT_STORE_OWNER', 'Only the store owner can change stock');
    } else if (!user.isPlatformOwner) {
      throw new AppError(403, 'NOT_STORE_OWNER', 'Only the platform owner can change demo store stock');
    }

    await setStock(db, { storeId, productId, stock });
    emitTelemetry({ service: 'postgres', type: 'stock.updated', message: `${productId} set to ${stock} by the store owner`, storeId, productId, stockAfter: stock });
    void events
      .stockChanged([{ type: 'storefront.stock', storeId, productId, stockAfter: stock, delta: null, reason: 'merchant', at: new Date().toISOString() }])
      .catch((err) => request.log.error({ err }, 'storefront kafka publish failed'));
    return { storeId, productId, stock };
  });
};
