/**
 * Checkout and order routes (registered under /api). Params and body are
 * validated before any database access; the body is a strict object carrying
 * only customer name and email, so a client can never supply prices.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { OrderEventSink } from '../events/order-events.js';
import { parseInput, uuidId } from '../http/contract.js';
import { checkoutCart, getOrder } from '../store/checkout.js';
import type { Database } from '../store/db.js';

export interface OrderRoutesOptions {
  db: Database;
  orderEvents: OrderEventSink;
}

export const checkoutParams = z.object({ cartId: uuidId });
export const orderParams = z.object({ orderId: uuidId });

export const checkoutBody = z.strictObject({
  customer: z.strictObject({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
  }),
});

export const orderRoutes: FastifyPluginAsync<OrderRoutesOptions> = async (app, { db, orderEvents }) => {
  app.post('/carts/:cartId/checkout', async (request, reply) => {
    const { cartId } = parseInput(checkoutParams, request.params, 'params');
    const { customer } = parseInput(checkoutBody, request.body, 'body');
    const result = await checkoutCart({ db, events: orderEvents, log: request.log }, { cartId, customer });
    // 201 for a newly placed order, 200 for an idempotent replay; the body is always { order, replayed }.
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/orders/:orderId', async (request) => {
    const { orderId } = parseInput(orderParams, request.params, 'params');
    return { order: await getOrder(db, { orderId }) };
  });
};
