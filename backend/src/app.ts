/**
 * Fastify application factory: cross-cutting wiring (logging, error envelope,
 * liveness, closing Aiven connections) plus the /api route plugins.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import type { LogLevel } from './config.js';
import { noopOrderEventSink, type OrderEventSink } from './events/order-events.js';
import { registerErrorHandling } from './http/contract.js';
import { cartRoutes } from './routes/carts.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { searchRoutes } from './routes/search.js';
import { corsHeaders, telemetryRoutes } from './routes/telemetry.js';
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

  // CORS for the separately hosted storefront (CORS_ORIGIN; default any origin).
  app.addHook('onRequest', async (request, reply) => {
    for (const [k, v] of Object.entries(corsHeaders(request.headers.origin))) reply.header(k, v);
    if (request.method === 'OPTIONS') {
      reply
        .header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        .header('access-control-allow-headers', 'content-type')
        .header('access-control-max-age', '86400')
        .code(204)
        .send();
    }
  });

  // Liveness only: does not touch Aiven services (connectivity diagnostics are
  // a separate, explicit check so a slow dependency never fails liveness).
  app.get('/health', async () => ({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));

  app.register(catalogRoutes, { prefix: '/api', db });
  app.register(cartRoutes, { prefix: '/api', db });
  app.register(orderRoutes, { prefix: '/api', db, orderEvents });
  app.register(searchRoutes, { prefix: '/api' });
  app.register(telemetryRoutes, { prefix: '/api' });

  // Serve the built storefront (frontend/dist) from the same origin when present,
  // with SPA fallback for non-API paths.
  // Resolved from this file (src/ or dist/ both sit two levels below the repo root), not the cwd,
  // because `npm start --workspace backend` runs inside backend/.
  const staticDir = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : fileURLToPath(new URL('../../frontend/dist', import.meta.url));
  if (existsSync(staticDir)) {
    app.register(fastifyStatic, { root: staticDir, wildcard: false });
    app.get('/*', (request, reply) => (request.url.startsWith('/api') ? reply.callNotFound() : reply.sendFile('index.html')));
  }

  app.addHook('onClose', async (instance) => {
    const results = await Promise.allSettled([closePgPool(), disconnectKafka(), closeOpenSearch()]);
    for (const result of results) {
      if (result.status === 'rejected') instance.log.error({ err: result.reason }, 'error closing service connection');
    }
  });

  return app;
}
