/**
 * Guest cart routes (registered under /api). Path params are validated before
 * any database access; bodies are strict objects (unknown keys -> 400).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { bodyDbId, dbId, parseInput, uuidId } from '../http/contract.js';
import {
  addCartItem,
  createCart,
  getCart,
  MAX_LINE_QUANTITY,
  removeCartItem,
  setCartItemQuantity,
  setCartLocation,
} from '../store/carts.js';
import type { Database } from '../store/db.js';

export interface CartRoutesOptions {
  db: Database;
}

const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY);

export const cartParams = z.object({ cartId: uuidId });
export const cartItemParams = z.object({ cartId: uuidId, productId: dbId });
export const cartLocationBody = z.strictObject({ locationId: bodyDbId });
export const addItemBody = z.strictObject({ productId: bodyDbId, quantity: quantity.default(1) });
export const setQuantityBody = z.strictObject({ quantity });

export const cartRoutes: FastifyPluginAsync<CartRoutesOptions> = async (app, { db }) => {
  app.post('/carts', async (request, reply) => {
    const { locationId } = parseInput(cartLocationBody, request.body, 'body');
    const cart = await createCart(db, { locationId });
    return reply.code(201).send({ cart });
  });

  app.get('/carts/:cartId', async (request) => {
    const { cartId } = parseInput(cartParams, request.params, 'params');
    return { cart: await getCart(db, cartId) };
  });

  app.patch('/carts/:cartId', async (request) => {
    const { cartId } = parseInput(cartParams, request.params, 'params');
    const { locationId } = parseInput(cartLocationBody, request.body, 'body');
    return { cart: await setCartLocation(db, cartId, locationId) };
  });

  app.post('/carts/:cartId/items', async (request) => {
    const { cartId } = parseInput(cartParams, request.params, 'params');
    const item = parseInput(addItemBody, request.body, 'body');
    return { cart: await addCartItem(db, cartId, item) };
  });

  app.put('/carts/:cartId/items/:productId', async (request) => {
    const { cartId, productId } = parseInput(cartItemParams, request.params, 'params');
    const body = parseInput(setQuantityBody, request.body, 'body');
    return { cart: await setCartItemQuantity(db, cartId, productId, body.quantity) };
  });

  app.delete('/carts/:cartId/items/:productId', async (request) => {
    const { cartId, productId } = parseInput(cartItemParams, request.params, 'params');
    return { cart: await removeCartItem(db, cartId, productId) };
  });
};
