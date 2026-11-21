/** Offline tests for /api/payments/razorpay/*: signature check, validation, and the unconfigured state. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import { buildApp } from '../app.js';
import { createFakeDatabase } from '../testing/fake-db.js';
import Fastify from 'fastify';

import { registerErrorHandling } from '../http/contract.js';
import { renderInvoice, type Invoice } from '../services/invoice-email.js';
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

  const appWith = async (opts: PaymentRouteOptions) => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    const a = Fastify({ logger: false });
    registerErrorHandling(a);
    await a.register(paymentRoutes, { prefix: '/api', ...opts });
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
      sendInvoice: async (inv) => { sent.push(inv); return 'sent'; },
    });
    const res = await verify(a);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().invoice, 'sent');
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
    assert.equal(res.json().invoice, 'failed');
    await a.close();
  });
});
