/** Offline tests for /api/payments/razorpay/*: signature check, validation, and the unconfigured state. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import { buildApp } from '../app.js';
import { createFakeDatabase } from '../testing/fake-db.js';
import { isValidSignature } from './payments.js';

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
