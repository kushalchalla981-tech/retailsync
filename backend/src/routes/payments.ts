/**
 * Razorpay Standard Checkout, server side:
 *   POST /api/payments/razorpay/order   -> creates a Razorpay order (key secret never leaves the server)
 *   POST /api/payments/razorpay/verify  -> checks the HMAC-SHA256 signature Checkout returns
 *
 * Keys come from RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET. Without them both routes
 * answer 503 PAYMENTS_NOT_CONFIGURED so the storefront can fall back to its demo flow.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { loadDotEnv } from '../config.js';
import { AppError, parseInput } from '../http/contract.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

interface RazorpayKeys {
  keyId: string;
  keySecret: string;
}

export function razorpayKeys(env: NodeJS.ProcessEnv = process.env): RazorpayKeys {
  loadDotEnv();
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) throw new AppError(503, 'PAYMENTS_NOT_CONFIGURED', 'Razorpay keys are not configured');
  return { keyId, keySecret };
}

/** Signature Razorpay sends back after payment: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function isValidSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const orderBody = z.object({
  // Paise. Razorpay's floor is ₹1; the ceiling keeps a tampered client from minting huge orders.
  amount: z.number().int().min(100).max(10_000_000),
  currency: z.literal('INR').default('INR'),
  receipt: z.string().trim().min(1).max(40).optional(),
  notes: z.record(z.string().max(40), z.string().max(256)).optional(),
});

const verifyBody = z.object({
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
});

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  app.post('/payments/razorpay/order', async (request, reply) => {
    const body = parseInput(orderBody, request.body, 'body');
    const { keyId, keySecret } = razorpayKeys();

    const res = await fetch(`${RAZORPAY_API}/orders`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amount: body.amount,
        currency: body.currency,
        receipt: body.receipt ?? `rs_${Date.now()}`,
        notes: body.notes ?? {},
      }),
    });
    if (!res.ok) {
      request.log.error({ status: res.status, body: await res.text() }, 'razorpay order create failed');
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not create the payment order');
    }
    const order = (await res.json()) as { id: string; amount: number; currency: string };
    // keyId is public by design (Checkout needs it in the browser); the secret is not returned.
    return reply.code(201).send({ orderId: order.id, amount: order.amount, currency: order.currency, keyId });
  });

  app.post('/payments/razorpay/verify', async (request) => {
    const body = parseInput(verifyBody, request.body, 'body');
    const { keySecret } = razorpayKeys();
    if (!isValidSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, keySecret)) {
      throw new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Payment signature did not match');
    }
    return { verified: true, orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id };
  });
};
