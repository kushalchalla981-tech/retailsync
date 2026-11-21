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
import { sendInvoiceEmail, type InvoiceSender } from '../services/invoice-email.js';

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
  /** What the shopper bought, for the owner's invoice. The total on the invoice comes from Razorpay, not from here. */
  invoice: z
    .object({
      lines: z
        .array(z.object({
          name: z.string().trim().min(1).max(120),
          storeName: z.string().trim().min(1).max(80),
          qty: z.number().int().min(1).max(100),
          unitPriceInr: z.number().min(0).max(10_000_000),
        }))
        .min(1)
        .max(50),
      customerName: z.string().trim().max(120).optional(),
      customerEmail: z.string().trim().email().max(200).optional(),
    })
    .optional(),
});

interface RazorpayOrder { id: string; amount: number; amount_paid: number; currency: string }

async function fetchRazorpayOrder(orderId: string, keyId: string, keySecret: string): Promise<RazorpayOrder> {
  const res = await fetch(`${RAZORPAY_API}/orders/${encodeURIComponent(orderId)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
  });
  if (!res.ok) throw new Error(`Razorpay order lookup failed with ${res.status}`);
  return (await res.json()) as RazorpayOrder;
}

export interface PaymentRouteOptions {
  /** Injected in tests; defaults to Resend. */
  sendInvoice?: InvoiceSender;
  /** Injected in tests; defaults to the Razorpay Orders API. */
  fetchOrder?: typeof fetchRazorpayOrder;
}

export const paymentRoutes: FastifyPluginAsync<PaymentRouteOptions> = async (app, opts) => {
  const sendInvoice = opts.sendInvoice ?? sendInvoiceEmail;
  const fetchOrder = opts.fetchOrder ?? fetchRazorpayOrder;

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
    const { keyId, keySecret } = razorpayKeys();
    if (!isValidSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, keySecret)) {
      throw new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Payment signature did not match');
    }

    // The invoice never blocks or fails the payment confirmation the shopper is waiting for.
    let invoice: 'sent' | 'skipped' | 'failed' = 'skipped';
    if (body.invoice) {
      try {
        const order = await fetchOrder(body.razorpay_order_id, keyId, keySecret);
        invoice = await sendInvoice({
          orderId: order.id,
          paymentId: body.razorpay_payment_id,
          paidPaise: order.amount_paid || order.amount,
          currency: order.currency,
          lines: body.invoice.lines,
          customerName: body.invoice.customerName,
          customerEmail: body.invoice.customerEmail,
          issuedAt: new Date(),
        });
        if (invoice === 'skipped') request.log.warn('invoice email skipped: RESEND_API_KEY is not set');
      } catch (err) {
        invoice = 'failed';
        request.log.error({ err }, 'invoice email failed');
      }
    }
    return { verified: true, orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, invoice };
  });
};
