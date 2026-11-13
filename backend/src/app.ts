/**
 * Fastify application factory: cross-cutting wiring (logging, error envelope,
 * liveness, closing Aiven connections) plus the /api route plugins.
 */
import Fastify, { type FastifyInstance } from 'fastify';

import type { LogLevel } from './config.js';
import { noopOrderEventSink, type OrderEventSink } from './events/order-events.js';
import { registerErrorHandling } from './http/contract.js';
import { cartRoutes } from './routes/carts.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { disconnectKafka } from './services/kafka.js';
import { closeOpenSearch } from './services/opensearch.js';
import { closePgPool } from './services/postgres.js';
import { pgDatabase, type Database } from './store/db.js';

export interface BuildAppOptions {
  logLevel: LogLevel;
  /** Data access; defaults to the shared Aiven PostgreSQL pool (opened lazily). Tests inject a fake. */
  db?: Database;
  /**
   * Receives OrderPlacedEvent after each checkout COMMIT. Defaults to the no-op
   * sink; Phase 3 injects the Kafka publisher here.
   */
  orderEvents?: OrderEventSink;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: { level: options.logLevel } });
  const db = options.db ?? pgDatabase();
  const orderEvents = options.orderEvents ?? noopOrderEventSink;

  // Must precede route registration so every plugin inherits the envelope.
  registerErrorHandling(app);

  // Liveness only: does not touch Aiven services (connectivity diagnostics are
  // a separate, explicit check so a slow dependency never fails liveness).
  app.get('/health', async () => ({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));

  app.register(catalogRoutes, { prefix: '/api', db });
  app.register(cartRoutes, { prefix: '/api', db });
  app.register(orderRoutes, { prefix: '/api', db, orderEvents });

  app.addHook('onClose', async (instance) => {
    const results = await Promise.allSettled([closePgPool(), disconnectKafka(), closeOpenSearch()]);
    for (const result of results) {
      if (result.status === 'rejected') instance.log.error({ err: result.reason }, 'error closing service connection');
    }
  });

  return app;
}
