/**
 * Razorpay Standard Checkout, server side:
 *   POST /api/payments/razorpay/order   -> creates a Razorpay order (key secret never leaves the server)
 *   POST /api/payments/razorpay/verify  -> checks the HMAC-SHA256 signature Checkout returns
 *
 * v1.05: the order route refuses carts that tracked stock cannot cover, and a
 * verified payment decrements live storefront stock exactly once (row-locked),
 * streams the change to every device, publishes it to Kafka, and emails the
 * owner summary plus the buyer's receipt.
 *
 * Keys come from RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET. Without them both routes
 * answer 503 PAYMENTS_NOT_CONFIGURED so the storefront can fall back to its demo flow.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { loadDotEnv } from '../config.js';
import { noopStorefrontEvents, type StorefrontEventSink } from '../events/storefront-events.js';
import { AppError, conflict, parseInput } from '../http/contract.js';
import { sendInvoiceEmail, type InvoiceDelivery, type InvoiceSender } from '../services/invoice-email.js';
import type { Database } from '../store/db.js';
import { commitPaymentStock, findShortfalls, type CommitResult, type StockLine } from '../store/storefront-stock.js';
import { emitTelemetry } from '../telemetry/bus.js';

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

const storeId = z.string().trim().min(1).max(80);
const productId = z.string().trim().min(1).max(100);

const orderBody = z.object({
  // Paise. Razorpay's floor is ₹1; the ceiling keeps a tampered client from minting huge orders.
  amount: z.number().int().min(100).max(10_000_000),
  currency: z.literal('INR').default('INR'),
  receipt: z.string().trim().min(1).max(40).optional(),
  notes: z.record(z.string().max(40), z.string().max(256)).optional(),
  /** Cart lines to check against live stock before the shopper pays. */
  lines: z.array(z.object({ storeId, productId, qty: z.number().int().min(1).max(100) })).max(50).optional(),
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
          storeId: storeId.optional(),
          productId: productId.optional(),
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
  db: Database;
  /** Kafka publisher in production; no-op by default. */
  events?: StorefrontEventSink;
  /** Injected in tests; defaults to Resend. */
  sendInvoice?: InvoiceSender;
  /** Injected in tests; defaults to the Razorpay Orders API. */
  fetchOrder?: typeof fetchRazorpayOrder;
}

export const paymentRoutes: FastifyPluginAsync<PaymentRouteOptions> = async (app, opts) => {
  const sendInvoice = opts.sendInvoice ?? sendInvoiceEmail;
  const fetchOrder = opts.fetchOrder ?? fetchRazorpayOrder;
  const { db } = opts;
  const events = opts.events ?? noopStorefrontEvents;

  app.post('/payments/razorpay/order', async (request, reply) => {
    const body = parseInput(orderBody, request.body, 'body');
    const { keyId, keySecret } = razorpayKeys();

    if (body.lines?.length) {
      const short = await findShortfalls(db, body.lines);
      if (short.length) {
        throw conflict('OUT_OF_STOCK', 'Some items sold out while they were in your cart', { items: short });
      }
    }

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

    const placedAt = new Date();
    const lines = body.invoice?.lines ?? [];
    const stockLines: StockLine[] = lines.flatMap((l) => (l.storeId && l.productId ? [{ storeId: l.storeId, productId: l.productId, qty: l.qty }] : []));

    // Stock first: it also makes the rest idempotent (a replayed verify is a no-op).
    let commit: CommitResult | null = null;
    try {
      commit = await commitPaymentStock(db, { paymentId: body.razorpay_payment_id, orderId: body.razorpay_order_id, lines: stockLines });
    } catch (err) {
      request.log.error({ err }, 'storefront stock commit failed');
    }
    const base = { verified: true, orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id };
    if (commit?.status === 'duplicate') return { ...base, duplicate: true, invoice: { owner: 'skipped', buyer: 'skipped' }, paidInr: null };

    let paidPaise: number | null = null;
    let currency = 'INR';
    if (body.invoice) {
      try {
        const order = await fetchOrder(body.razorpay_order_id, keyId, keySecret);
        paidPaise = order.amount_paid || order.amount;
        currency = order.currency;
      } catch (err) {
        request.log.error({ err }, 'razorpay order lookup failed');
      }
    }

    const committed = commit?.status === 'committed' ? commit.lines : [];
    const short = committed.filter((l) => l.taken < l.qty);
    if (commit?.status === 'committed' && committed.length) {
      emitTelemetry({ service: 'postgres', type: 'row.lock', message: `SELECT ... FOR UPDATE locked ${committed.length} stock row${committed.length === 1 ? '' : 's'}`, latencyMs: commit.lockMs, orderId: body.razorpay_order_id });
    }
    for (const l of committed) {
      emitTelemetry({
        service: 'postgres',
        type: 'inventory.decrement',
        message: `${l.productId}: -${l.taken} -> ${l.stockAfter} left${l.taken < l.qty ? ` (short ${l.qty - l.taken}; CHECK stock >= 0 held)` : ''}`,
        storeId: l.storeId,
        productId: l.productId,
        stockAfter: l.stockAfter,
        delta: -l.taken,
        orderId: body.razorpay_order_id,
      });
    }
    const items = lines.map((l) => ({ storeId: l.storeId ?? l.storeName, productId: l.productId, name: l.name, qty: l.qty, unitPriceInr: l.unitPriceInr }));
    const totalInr = paidPaise === null ? null : paidPaise / 100;
    if (items.length) {
      emitTelemetry({ service: 'postgres', type: 'order.placed', message: `Order ${body.razorpay_order_id} committed (${items.length} line${items.length === 1 ? '' : 's'})`, orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, totalInr: totalInr ?? undefined, items });
    }
    if (short.length) request.log.warn({ short }, 'paid units exceeded remaining stock; owner must refund');

    // Kafka is best-effort and never delays the shopper.
    const at = placedAt.toISOString();
    void Promise.all([
      items.length ? events.orderPlaced({ type: 'storefront.order', orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, placedAt: at, totalInr, items }) : undefined,
      committed.length
        ? events.stockChanged(committed.map((l) => ({ type: 'storefront.stock', storeId: l.storeId, productId: l.productId, stockAfter: l.stockAfter, delta: -l.taken, reason: 'checkout', orderId: body.razorpay_order_id, at })))
        : undefined,
    ]).catch((err) => request.log.error({ err }, 'storefront kafka publish failed'));

    // The invoice never blocks or fails the payment confirmation the shopper is waiting for.
    let invoice: InvoiceDelivery = { owner: 'skipped', buyer: 'skipped' };
    if (body.invoice && paidPaise !== null) {
      try {
        invoice = await sendInvoice({
          orderId: body.razorpay_order_id,
          paymentId: body.razorpay_payment_id,
          paidPaise,
          currency,
          lines: body.invoice.lines,
          customerName: body.invoice.customerName,
          customerEmail: body.invoice.customerEmail,
          issuedAt: placedAt,
          shortfalls: short.map((l) => ({ name: lines.find((x) => x.productId === l.productId && x.storeId === l.storeId)?.name ?? l.productId, missing: l.qty - l.taken })),
        });
        if (invoice.owner === 'skipped') request.log.warn('invoice email skipped: RESEND_API_KEY is not set');
      } catch (err) {
        invoice = { owner: 'failed', buyer: body.invoice.customerEmail ? 'failed' : 'skipped' };
        request.log.error({ err }, 'invoice email failed');
      }
    } else if (body.invoice) {
      invoice = { owner: 'failed', buyer: body.invoice.customerEmail ? 'failed' : 'skipped' };
    }
    return { ...base, invoice, paidInr: totalInr, stock: commit === null ? 'unavailable' : short.length ? 'short' : 'committed', short: short.map(({ storeId: s, productId: p, qty, taken }) => ({ storeId: s, productId: p, missing: qty - taken })) };
  });
};
