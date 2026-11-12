/**
 * Fastify application factory. Routes are added by later phases; this module
 * owns cross-cutting wiring (logging, liveness, closing Aiven connections).
 */
import Fastify, { type FastifyInstance } from 'fastify';

import type { LogLevel } from './config.js';
import { disconnectKafka } from './services/kafka.js';
import { closeOpenSearch } from './services/opensearch.js';
import { closePgPool } from './services/postgres.js';

export function buildApp(options: { logLevel: LogLevel }): FastifyInstance {
  const app = Fastify({ logger: { level: options.logLevel } });

  // Liveness only: does not touch Aiven services (connectivity diagnostics are
  // a separate, explicit check so a slow dependency never fails liveness).
  app.get('/health', async () => ({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));

  app.addHook('onClose', async (instance) => {
    const results = await Promise.allSettled([closePgPool(), disconnectKafka(), closeOpenSearch()]);
    for (const result of results) {
      if (result.status === 'rejected') instance.log.error({ err: result.reason }, 'error closing service connection');
    }
  });

  return app;
}
