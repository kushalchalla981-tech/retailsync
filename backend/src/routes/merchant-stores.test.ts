/** Offline tests for Clerk token verification and the merchant store routes. */
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';

import { buildApp } from '../app.js';
import { clerkVerifier, issuerFromPublishableKey, type TokenVerifier } from '../http/clerk-auth.js';
import { createFakeDatabase, type FakeCall } from '../testing/fake-db.js';

const ISS = 'https://eminent-seagull-5191.clerk.accounts.dev';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' };
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims: object, kid = 'k1') {
  const head = `${b64({ alg: 'RS256', kid })}.${b64(claims)}`;
  return `${head}.${sign('RSA-SHA256', Buffer.from(head), privateKey).toString('base64url')}`;
}
const NOW = 1_800_000_000_000;
const verifier = clerkVerifier({ issuer: ISS, authorizedParties: ['https://retailsync-sable.vercel.app'], fetchJwks: async () => ({ keys: [jwk] }), now: () => NOW });
const good = { sub: 'user_a', iss: ISS, exp: NOW / 1000 + 60, nbf: NOW / 1000 - 5, azp: 'https://retailsync-sable.vercel.app' };

describe('clerk session verification', () => {
  it('derives the issuer from the publishable key', () => {
    assert.equal(issuerFromPublishableKey('pk_test_ZW1pbmVudC1zZWFndWxsLTUxOTEuY2xlcmsuYWNjb3VudHMuZGV2JA'), ISS);
  });
  it('accepts a valid token', async () => {
    assert.deepEqual(await verifier(token(good)), { sub: 'user_a' });
  });
  for (const [why, claims] of [
    ['expired', { ...good, exp: NOW / 1000 - 60 }],
    ['wrong issuer', { ...good, iss: 'https://evil.example' }],
    ['foreign origin', { ...good, azp: 'https://evil.example' }],
  ] as const) {
    it(`rejects ${why}`, async () => {
      await assert.rejects(verifier(token(claims)), (e: Error & { statusCode?: number }) => e.statusCode === 401);
    });
  }
  it('rejects a tampered payload', async () => {
    const [h, , s] = token(good).split('.');
    await assert.rejects(verifier(`${h}.${b64({ ...good, sub: 'user_owner' })}.${s}`), (e: Error & { statusCode?: number }) => e.statusCode === 401);
  });
});

describe('merchant store routes', () => {
  const stub: TokenVerifier = async (t) => ({ sub: t });
  const body = { name: 'Moss & Co', slug: 'moss', category: 'Home', tagline: 't', description: 'd', primaryColor: '#000', accentColor: '#fff', catalog: [], ownerId: 'user_forged' };
  const ID = 'ms_0b6f6a2e-3c1d-4e5f-8a9b-1c2d3e4f5a6b';
  const row = (owner: string) => ({ id: ID, owner_id: owner, data: { name: 'Moss & Co' }, created_at: new Date(0) });

  it('lists stores publicly', async () => {
    const app = buildApp({ logLevel: 'silent', db: createFakeDatabase(() => [row('user_a')]), verifier: stub });
    const res = await app.inject({ method: 'GET', url: '/api/stores' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().items[0].ownerId, 'user_a');
    await app.close();
  });

  it('requires sign-in to create', async () => {
    const app = buildApp({ logLevel: 'silent', db: createFakeDatabase(), verifier: stub });
    const res = await app.inject({ method: 'POST', url: '/api/stores', payload: body });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it('creates with the verified owner, ignoring a forged ownerId', async () => {
    const calls: FakeCall[] = [];
    const db = createFakeDatabase((c) => { calls.push(c); return /count/.test(c.text) ? [{ n: '0' }] : /INSERT/.test(c.text) ? [row(String(c.values[1]))] : undefined; });
    const app = buildApp({ logLevel: 'silent', db, verifier: stub });
    const res = await app.inject({ method: 'POST', url: '/api/stores', headers: { authorization: 'Bearer user_b' }, payload: body });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().ownerId, 'user_b');
    const insert = calls.find((c) => /INSERT/.test(c.text))!;
    assert.equal(insert.values[1], 'user_b');
    assert.ok(!String(insert.values[2]).includes('user_forged'));
    await app.close();
  });

  it('enforces the per-owner store limit', async () => {
    const db = createFakeDatabase((c) => (/count/.test(c.text) ? [{ n: '10' }] : undefined));
    const app = buildApp({ logLevel: 'silent', db, verifier: stub });
    const res = await app.inject({ method: 'POST', url: '/api/stores', headers: { authorization: 'Bearer user_b' }, payload: body });
    assert.equal(res.statusCode, 409);
    await app.close();
  });

  it("refuses to update someone else's store", async () => {
    const db = createFakeDatabase((c) => (/UPDATE/.test(c.text) ? [] : /SELECT 1/.test(c.text) ? [{ '?column?': 1 }] : undefined));
    const app = buildApp({ logLevel: 'silent', db, verifier: stub });
    const res = await app.inject({ method: 'PUT', url: `/api/stores/${ID}`, headers: { authorization: 'Bearer user_b' }, payload: body });
    assert.equal(res.statusCode, 403);
    await app.close();
  });

  it('lets the platform owner update any store', async () => {
    const calls: FakeCall[] = [];
    const db = createFakeDatabase((c) => { calls.push(c); return /UPDATE/.test(c.text) ? [row('user_a')] : undefined; });
    const app = buildApp({ logLevel: 'silent', db, verifier: stub });
    const res = await app.inject({ method: 'PUT', url: `/api/stores/${ID}`, headers: { authorization: 'Bearer user_3MPoGBbBQ4HVZD7NBfbGqH3CBY5' }, payload: body });
    assert.equal(res.statusCode, 200);
    assert.equal(calls.find((c) => /UPDATE/.test(c.text))!.values[3], true);
    await app.close();
  });

  it('answers 404 when deleting a missing store', async () => {
    const app = buildApp({ logLevel: 'silent', db: createFakeDatabase(() => []), verifier: stub });
    const res = await app.inject({ method: 'DELETE', url: `/api/stores/${ID}`, headers: { authorization: 'Bearer user_a' } });
    assert.equal(res.statusCode, 404);
    await app.close();
  });
});
