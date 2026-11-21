/** Offline tests for /api/payments/razorpay/*: signature check, validation, and the unconfigured state. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import { buildApp } from '../app.js';
import { createFakeDatabase } from '../testing/fake-db.js';
import Fastify from 'fastify';

import { registerErrorHandling } from '../http/contract.js';
import { renderInvoice, type Invoice } from '../services/invoice-email.js';
import { subscribeTelemetry, type TelemetryEvent } from '../telemetry/bus.js';
import type { FakeResponder } from '../testing/fake-db.js';
import { isValidSignature, paymentRoutes, type PaymentRouteOptions } from './payments.js';

const SECRET = 'test_secret';
const sign = (o: string, p: string) => createHmac('sha256', SECRET).update(`${o}|${p}`).digest('hex');
const app = () => buildApp({ logLevel: 'silent', db: createFakeDatabase() });

describe('razorpay payments', () => {
  const saved = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  afterEach(() => {
    process.env.RAZORPAY_KEY_ID = saved.id ?? '';
    process.env.RAZORPAY_KEY_SECRET = saved.secret ?? '';
  });

  it('accepts a correct signature and rejects a tampered one', () => {
    const sig = sign('order_A1', 'pay_B2');
    assert.equal(isValidSignature('order_A1', 'pay_B2', sig, SECRET), true);
    assert.equal(isValidSignature('order_A1', 'pay_B3', sig, SECRET), false);
    assert.equal(isValidSignature('order_A1', 'pay_B2', 'abcd', SECRET), false);
  });

  it('verify route returns 200 for a valid signature and 400 for an invalid one', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    const a = app();
    const ok = await a.inject({ method: 'POST', url: '/api/payments/razorpay/verify', payload: { razorpay_order_id: 'order_A1', razorpay_payment_id: 'pay_B2', razorpay_signature: sign('order_A1', 'pay_B2') } });
    assert.equal(ok.statusCode, 200);
    const bad = await a.inject({ method: 'POST', url: '/api/payments/razorpay/verify', payload: { razorpay_order_id: 'order_A1', razorpay_payment_id: 'pay_B9', razorpay_signature: sign('order_A1', 'pay_B2') } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'PAYMENT_SIGNATURE_INVALID');
    await a.close();
  });

  it('rejects out-of-range amounts before contacting Razorpay', async () => {
    const a = app();
    const res = await a.inject({ method: 'POST', url: '/api/payments/razorpay/order', payload: { amount: 50 } });
    assert.equal(res.statusCode, 400);
    await a.close();
  });

  it('answers 503 when keys are not configured', async () => {
    process.env.RAZORPAY_KEY_ID = '';
    process.env.RAZORPAY_KEY_SECRET = '';
    const a = app();
    const res = await a.inject({ method: 'POST', url: '/api/payments/razorpay/order', payload: { amount: 10000 } });
    assert.equal(res.statusCode, 503);
    await a.close();
  });
});

describe('payment invoices', () => {
  const ORDER = 'order_INV1', PAY = 'pay_INV1';
  const lines = [{ name: '<b>Mug</b>', storeName: 'Hearthware', qty: 2, unitPriceInr: 449 }];
  const saved = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  afterEach(() => {
    process.env.RAZORPAY_KEY_ID = saved.id ?? '';
    process.env.RAZORPAY_KEY_SECRET = saved.secret ?? '';
  });

  const appWith = async (opts: Omit<PaymentRouteOptions, 'db'>, respond?: FakeResponder) => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    const a = Fastify({ logger: false });
    registerErrorHandling(a);
    await a.register(paymentRoutes, { prefix: '/api', db: createFakeDatabase(respond ?? ((c) => (/storefront_payments/.test(c.text) ? [{ payment_id: PAY }] : undefined))), ...opts });
    return a;
  };
  const verify = (a: Awaited<ReturnType<typeof appWith>>) =>
    a.inject({ method: 'POST', url: '/api/payments/razorpay/verify', payload: { razorpay_order_id: ORDER, razorpay_payment_id: PAY, razorpay_signature: sign(ORDER, PAY), invoice: { lines, customerEmail: 'shopper@example.com' } } });

  it('renders escaped item names and the Razorpay-verified total', () => {
    const { html, subject } = renderInvoice({ orderId: ORDER, paymentId: PAY, paidPaise: 99700, currency: 'INR', lines, issuedAt: new Date(0) });
    assert.match(html, /&lt;b&gt;Mug&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>Mug<\/b>/);
    assert.match(subject, /₹997/);
    assert.match(html, /Shipping<\/td><td align="right">₹99</);
  });

  it('flags items that add up to more than was paid', () => {
    const { html } = renderInvoice({ orderId: ORDER, paymentId: PAY, paidPaise: 10000, currency: 'INR', lines, issuedAt: new Date(0) });
    assert.match(html, /Check this payment/);
  });

  it('emails an invoice using the amount Razorpay captured', async () => {
    const sent: Invoice[] = [];
    const a = await appWith({
      fetchOrder: async () => ({ id: ORDER, amount: 99700, amount_paid: 99700, currency: 'INR' }),
      sendInvoice: async (inv) => { sent.push(inv); return { owner: 'sent', buyer: 'sent' }; },
    });
    const res = await verify(a);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().invoice, { owner: 'sent', buyer: 'sent' });
    assert.equal(res.json().paidInr, 997);
    assert.equal(sent[0]?.paidPaise, 99700);
    assert.equal(sent[0]?.customerEmail, 'shopper@example.com');
    await a.close();
  });

  it('still confirms the payment when the invoice email fails', async () => {
    const a = await appWith({
      fetchOrder: async () => ({ id: ORDER, amount: 99700, amount_paid: 99700, currency: 'INR' }),
      sendInvoice: async () => { throw new Error('smtp down'); },
    });
    const res = await verify(a);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().verified, true);
    assert.equal(res.json().invoice.owner, 'failed');
    await a.close();
  });

  it('renders a buyer receipt without owner-only notes', () => {
    const inv = { orderId: ORDER, paymentId: PAY, paidPaise: 10000, currency: 'INR', lines, issuedAt: new Date(0), shortfalls: [{ name: 'Mug', missing: 1 }] };
    const buyer = renderInvoice(inv, 'buyer');
    assert.match(buyer.subject, /Your RetailSync receipt from Hearthware/);
    assert.doesNotMatch(buyer.html, /Check this payment|Refund needed|GMV/);
    assert.match(renderInvoice(inv, 'owner').html, /Refund needed:<\/b> 1 × Mug/);
  });
});

describe('storefront stock at checkout', () => {
  const ORDER = 'order_STK1', PAY = 'pay_STK1';
  const line = { name: 'Mug', storeName: 'Hearthware', qty: 3, unitPriceInr: 449, storeId: 'store-1', productId: 'store-1-prod-1' };
  const saved = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  afterEach(() => {
    process.env.RAZORPAY_KEY_ID = saved.id ?? '';
    process.env.RAZORPAY_KEY_SECRET = saved.secret ?? '';
  });
  const setup = async (respond: FakeResponder) => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    const db = createFakeDatabase(respond);
    const a = Fastify({ logger: false });
    registerErrorHandling(a);
    await a.register(paymentRoutes, {
      prefix: '/api',
      db,
      fetchOrder: async () => ({ id: ORDER, amount: 134700, amount_paid: 134700, currency: 'INR' }),
      sendInvoice: async () => ({ owner: 'sent', buyer: 'skipped' }),
    });
    const verify = () =>
      a.inject({ method: 'POST', url: '/api/payments/razorpay/verify', payload: { razorpay_order_id: ORDER, razorpay_payment_id: PAY, razorpay_signature: sign(ORDER, PAY), invoice: { lines: [line] } } });
    return { a, db, verify };
  };

  it('locks, decrements and streams the new stock', async () => {
    const seen: TelemetryEvent[] = [];
    const stop = subscribeTelemetry((e) => seen.push(e));
    const { a, db, verify } = await setup((c) =>
      /storefront_payments/.test(c.text) ? [{ payment_id: PAY }] : /FOR UPDATE/.test(c.text) ? [{ store_id: 'store-1', product_id: 'store-1-prod-1', stock: 5 }] : undefined,
    );
    const res = await verify();
    stop();
    assert.equal(res.json().stock, 'committed');
    const lock = db.calls.find((c) => /FOR UPDATE/.test(c.text))!;
    assert.ok(lock.inTransaction);
    const update = db.calls.find((c) => /UPDATE storefront_stock/.test(c.text))!;
    assert.deepEqual(update.values, ['store-1', 'store-1-prod-1', 3]);
    const dec = seen.find((e) => e.type === 'inventory.decrement')!;
    assert.equal(dec.stockAfter, 2);
    const order = seen.find((e) => e.type === 'order.placed')!;
    assert.equal(order.totalInr, 1347);
    assert.ok(!JSON.stringify(seen).includes('@'), 'no customer data on the public stream');
    await a.close();
  });

  it('never takes more than is left, and reports the shortfall', async () => {
    const { a, db, verify } = await setup((c) =>
      /storefront_payments/.test(c.text) ? [{ payment_id: PAY }] : /FOR UPDATE/.test(c.text) ? [{ store_id: 'store-1', product_id: 'store-1-prod-1', stock: 1 }] : undefined,
    );
    const res = await verify();
    assert.equal(res.json().stock, 'short');
    assert.deepEqual(res.json().short, [{ storeId: 'store-1', productId: 'store-1-prod-1', missing: 2 }]);
    assert.deepEqual(db.calls.find((c) => /UPDATE storefront_stock/.test(c.text))!.values[2], 1);
    await a.close();
  });

  it('ignores a replayed verify (no second decrement or invoice)', async () => {
    let invoices = 0;
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    const db = createFakeDatabase(() => undefined); // payment row already exists
    const a = Fastify({ logger: false });
    registerErrorHandling(a);
    await a.register(paymentRoutes, { prefix: '/api', db, sendInvoice: async () => { invoices++; return { owner: 'sent', buyer: 'sent' }; } });
    const res = await a.inject({ method: 'POST', url: '/api/payments/razorpay/verify', payload: { razorpay_order_id: ORDER, razorpay_payment_id: PAY, razorpay_signature: sign(ORDER, PAY), invoice: { lines: [line] } } });
    assert.equal(res.json().duplicate, true);
    assert.equal(invoices, 0);
    assert.ok(!db.calls.some((c) => /UPDATE storefront_stock/.test(c.text)));
    await a.close();
  });

  it('refuses to create a payment order the stock cannot cover', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    const a = buildApp({ logLevel: 'silent', db: createFakeDatabase((c) => (/storefront_stock/.test(c.text) ? [{ store_id: 'store-1', product_id: 'store-1-prod-1', stock: 2 }] : undefined)) });
    const res = await a.inject({ method: 'POST', url: '/api/payments/razorpay/order', payload: { amount: 10000, lines: [{ storeId: 'store-1', productId: 'store-1-prod-1', qty: 3 }] } });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'OUT_OF_STOCK');
    await a.close();
  });
});
