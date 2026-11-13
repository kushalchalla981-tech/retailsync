/**
 * Live pipeline telemetry for the storefront ledger:
 *   GET /api/telemetry/events?after=<id>  — polling ({ items, next })
 *   GET /api/telemetry/stream             — Server-Sent Events
 */
import type { FastifyPluginAsync } from 'fastify';

import { subscribeTelemetry, telemetrySince } from '../telemetry/bus.js';

export const telemetryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/telemetry/events', async (request) => {
    const after = (request.query as { after?: string }).after;
    const items = telemetrySince(after);
    return { items, next: items.at(-1)?.id ?? after ?? null };
  });

  app.get('/telemetry/stream', (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...corsHeaders(request.headers.origin),
    });
    res.write(': connected\n\n');
    const unsubscribe = subscribeTelemetry((event) => res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`));
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
};

/** CORS headers for the deployed storefront origin (CORS_ORIGIN, default any). */
export function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = process.env.CORS_ORIGIN ?? '*';
  const value = allowed === '*' ? '*' : allowed.split(',').map((s) => s.trim()).includes(origin ?? '') ? (origin as string) : '';
  return value ? { 'access-control-allow-origin': value, vary: 'Origin' } : {};
}
