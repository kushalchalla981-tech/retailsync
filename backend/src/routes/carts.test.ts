/**
 * Offline route tests for guest cart sessions (/api/carts...): validation
 * before any database access, the cart-row lock discipline that checkout
 * (plan 02-02) relies on, and the error codes - all against the scripted fake
 * database, no Aiven access.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { createFakeDatabase, type FakeCall, type FakeDatabase, type FakeResponse } from '../testing/fake-db.js';

const CART_ID = '0b6f6a2e-3c1d-4e5f-8a9b-1c2d3e4f5a6b';
const CREATED = new Date('2026-11-13T08:00:00.000Z');
const UPDATED = new Date('2026-11-13T08:05:00.000Z');

interface Scenario {
  /** Cart row returned by the FOR UPDATE lock (null = no such cart). */
  cart?: { status: string; location_id: string | null } | null;
  /** Product returned by the existence check (null = no such product). */
  product?: { is_active: boolean } | null;
  /** Rows returned by the cart_items upsert / update / delete (default: one row). */
  itemWrite?: readonly object[];
  /** Rows returned by INSERT INTO carts / UPDATE carts SET location_id (default: one row). */
  locationWrite?: readonly object[];
  /** Cart header row for the read-back (null = no cart). */
  header?: object | null;
  /** Item rows for the read-back. */
  items?: readonly object[];
}

const defaultHeader = {
  id: CART_ID,
  status: 'active',
  location_id: '1',
  location_name: 'Bangalore Central',
  location_city: 'Bangalore',
  order_id: null,
  item_count: 0,
  subtotal: '0',
  created_at: CREATED,
  updated_at: UPDATED,
};

function respond(scenario: Scenario): (call: FakeCall) => FakeResponse {
  return ({ text }) => {
    if (/FOR UPDATE/.test(text)) {
      const cart = scenario.cart === undefined ? { status: 'active', location_id: '1' } : scenario.cart;
      return cart ? [{ id: CART_ID, ...cart }] : [];
    }
    if (/FROM products\s+WHERE id/.test(text)) {
      const product = scenario.product === undefined ? { is_active: true } : scenario.product;
      return product ? [{ id: '9', ...product }] : [];
    }
    if (/INSERT INTO cart_items|UPDATE cart_items|DELETE FROM cart_items/.test(text)) {
      return scenario.itemWrite ?? [{ quantity: 1 }];
    }
    if (/INSERT INTO carts|UPDATE carts\s+SET location_id/.test(text)) {
      return scenario.locationWrite ?? [{ id: CART_ID }];
    }
    if (/UPDATE carts\s+SET updated_at/.test(text)) return [];
    if (/LEFT JOIN orders/.test(text)) {
      const header = scenario.header === undefined ? defaultHeader : scenario.header;
      return header ? [header] : [];
    }
    if (/LEFT JOIN inventory/.test(text)) return scenario.items ?? [];
    return new Error(`unexpected SQL in test: ${text}`);
  };
}

async function withApp(scenario: Scenario, fn: (app: FastifyInstance, fake: FakeDatabase) => Promise<void>): Promise<void> {
  const fake = createFakeDatabase(respond(scenario));
  const app = buildApp({ logLevel: 'silent', db: fake });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

function errorCode(body: string): string | undefined {
  return (JSON.parse(body) as { error?: { code?: string } }).error?.code;
}

describe('POST /api/carts', () => {
  it('creates an active, empty cart at the store (201 {cart})', async () => {
    await withApp({}, async (app, fake) => {
      const res = await app.inject({ method: 'POST', url: '/api/carts', payload: { locationId: '1' } });
      assert.equal(res.statusCode, 201);
      assert.deepEqual(res.json(), {
        cart: {
          id: CART_ID,
          status: 'active',
          locationId: '1',
          location: { id: '1', name: 'Bangalore Central', city: 'Bangalore' },
          orderId: null,
          items: [],
          itemCount: 0,
          subtotal: 0,
          createdAt: CREATED.toISOString(),
          updatedAt: UPDATED.toISOString(),
        },
      });
      const insert = fake.calls.find((call) => /INSERT INTO carts/.test(call.text));
      assert.ok(insert, 'expected an INSERT INTO carts');
      assert.deepEqual(insert.values, ['1']);
      assert.match(insert.text, /FROM store_locations/);
    });
  });

  it('normalizes a numeric locationId to a string id', async () => {
    await withApp({}, async (app, fake) => {
      const res = await app.inject({ method: 'POST', url: '/api/carts', payload: { locationId: 2 } });
      assert.equal(res.statusCode, 201);
      assert.deepEqual(fake.calls.find((call) => /INSERT INTO carts/.test(call.text))?.values, ['2']);
    });
  });

  it('returns 404 LOCATION_NOT_FOUND for an unknown store', async () => {
    await withApp({ locationWrite: [] }, async (app) => {
      const res = await app.inject({ method: 'POST', url: '/api/carts', payload: { locationId: '42' } });
      assert.equal(res.statusCode, 404);
      assert.equal(errorCode(res.body), 'LOCATION_NOT_FOUND');
    });
  });

  const badBodies: [string, unknown][] = [
    ['an empty object', {}],
    ['an unknown key (strict object)', { locationId: '1', coupon: 'FREE' }],
    ['a zero id', { locationId: 0 }],
    ['a malformed id', { locationId: '01' }],
  ];
  for (const [label, payload] of badBodies) {
    it(`rejects ${label} with 400 VALIDATION_FAILED and no query`, async () => {
      await withApp({}, async (app, fake) => {
        const res = await app.inject({ method: 'POST', url: '/api/carts', payload: payload as Record<string, unknown> });
        assert.equal(res.statusCode, 400);
        assert.equal(errorCode(res.body), 'VALIDATION_FAILED');
        assert.equal(fake.calls.length, 0);
      });
    });
  }

  it('rejects malformed JSON inside the error envelope (Fastify code passthrough)', async () => {
    await withApp({}, async (app, fake) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/carts',
        headers: { 'content-type': 'application/json' },
        payload: '{"locationId": ',
      });
      assert.equal(res.statusCode, 400);
      const body = res.json();
      assert.equal(body.error.code, 'FST_ERR_CTP_INVALID_JSON');
      assert.equal(typeof body.error.message, 'string');
      assert.equal(typeof body.error.requestId, 'string');
      assert.equal(fake.calls.length, 0);
    });
  });
});

describe('POST /api/carts/:cartId/items', () => {
  it('locks the cart row as the first statement of the transaction', async () => {
    await withApp({}, async (app, fake) => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/carts/${CART_ID}/items`,
        payload: { productId: '9', quantity: 2 },
      });
      assert.equal(res.statusCode, 200);
      assert.ok(res.json().cart, 'expected {cart}');
      const first = fake.calls.find((call) => call.inTransaction);
      assert.ok(first, 'expected statements inside a transaction');
      assert.match(first.text, /FOR UPDATE/);
      assert.match(first.text, /FROM carts/);
      assert.equal(first.values[0], CART_ID);
      assert.deepEqual(fake.events, ['begin', 'commit']);
      const upsert = fake.calls.find((call) => /INSERT INTO cart_items/.test(call.text));
      assert.ok(upsert?.inTransaction, 'cart_items write must run inside the transaction');
      assert.deepEqual(upsert.values, [CART_ID, '9', 2]);
      assert.match(upsert.text, /ON CONFLICT ON CONSTRAINT cart_items_cart_product_key/);
      assert.match(upsert.text, /<= 99/);
    });
  });

  it('defaults quantity to 1', async () => {
    await withApp({}, async (app, fake) => {
      const res = await app.inject({ method: 'POST', url: `/api/carts/${CART_ID}/items`, payload: { productId: 9 } });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(fake.calls.find((call) => /INSERT INTO cart_items/.test(call.text))?.values, [CART_ID, '9', 1]);
    });
  });

  it('refuses a checked-out cart with 409 CART_NOT_ACTIVE and writes nothing', async () => {
    await withApp({ cart: { status: 'checked_out', location_id: '1' } }, async (app, fake) => {
      const res = await app.inject({ method: 'POST', url: `/api/carts/${CART_ID}/items`, payload: { productId: '9' } });
      assert.equal(res.statusCode, 409);
      const body = res.json();
      assert.equal(body.error.code, 'CART_NOT_ACTIVE');
      assert.deepEqual(body.error.details, { status: 'checked_out' });
      assert.ok(!fake.calls.some((call) => /INSERT INTO cart_items/.test(call.text)), 'no cart_items INSERT');
      assert.equal(fake.events.at(-1), 'rollback');
    });
  });

  it('returns 404 CART_NOT_FOUND for an unknown cart', async () => {
    await withApp({ cart: null }, async (app, fake) => {
      const res = await app.inject({ method: 'POST', url: `/api/carts/${CART_ID}/items`, payload: { productId: '9' } });
      assert.equal(res.statusCode, 404);
      assert.equal(errorCode(res.body), 'CART_NOT_FOUND');
      assert.equal(fake.events.at(-1), 'rollback');
    });
  });

  it('returns 404 PRODUCT_NOT_FOUND for a missing product', async () => {
    await withApp({ product: null }, async (app, fake) => {
      const res = await app.inject({ method: 'POST', url: `/api/carts/${CART_ID}/items`, payload: { productId: '999' } });
      assert.equal(res.statusCode, 404);
      assert.equal(errorCode(res.body), 'PRODUCT_NOT_FOUND');
      assert.ok(!fake.calls.some((call) => /INSERT INTO cart_items/.test(call.text)));
    });
  });

  it('returns 409 PRODUCT_UNAVAILABLE for an inactive product', async () => {
    await withApp({ product: { is_active: false } }, async (app, fake) => {
      const res = await app.inject({ method: 'POST', url: `/api/carts/${CART_ID}/items`, payload: { productId: '9' } });
      assert.equal(res.statusCode, 409);
      assert.equal(errorCode(res.body), 'PRODUCT_UNAVAILABLE');
      assert.ok(!fake.calls.some((call) => /INSERT INTO cart_items/.test(call.text)));
    });
  });

  it('returns 422 QUANTITY_LIMIT_EXCEEDED when the line would exceed 99', async () => {
    await withApp({ itemWrite: [] }, async (app, fake) => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/carts/${CART_ID}/items`,
        payload: { productId: '9', quantity: 50 },
      });
      assert.equal(res.statusCode, 422);
      assert.equal(errorCode(res.body), 'QUANTITY_LIMIT_EXCEEDED');
      assert.equal(fake.events.at(-1), 'rollback');
    });
  });

  for (const quantity of [0, 100, 1.5, '2']) {
    it(`rejects quantity ${JSON.stringify(quantity)} with 400 and no query`, async () => {
      await withApp({}, async (app, fake) => {
        const res = await app.inject({
          method: 'POST',
          url: `/api/carts/${CART_ID}/items`,
          payload: { productId: '9', quantity },
        });
        assert.equal(res.statusCode, 400);
        const body = res.json();
        assert.equal(body.error.code, 'VALIDATION_FAILED');
        assert.ok(body.error.details.issues.some((issue: { path: string }) => issue.path === 'body.quantity'));
        assert.equal(fake.calls.length, 0);
      });
    });
  }

  it('rejects a non-UUID cart id with 400 before any database access', async () => {
    await withApp({}, async (app, fake) => {
      const res = await app.inject({ method: 'POST', url: '/api/carts/not-a-uuid/items', payload: { productId: '9' } });
      assert.equal(res.statusCode, 400);
      const body = res.json();
      assert.equal(body.error.code, 'VALIDATION_FAILED');
      assert.equal(body.error.details.issues[0].path, 'params.cartId');
      assert.equal(fake.calls.length, 0);
      assert.deepEqual(fake.events, []);
    });
  });
});

describe('PUT / DELETE /api/carts/:cartId/items/:productId', () => {
  it('PUT on a product not in the cart returns 404 CART_ITEM_NOT_FOUND', async () => {
    await withApp({ itemWrite: [] }, async (app, fake) => {
      const res = await app.inject({ method: 'PUT', url: `/api/carts/${CART_ID}/items/9`, payload: { quantity: 3 } });
      assert.equal(res.statusCode, 404);
      assert.equal(errorCode(res.body), 'CART_ITEM_NOT_FOUND');
      assert.match(fake.calls.find((call) => call.inTransaction)!.text, /FOR UPDATE/);
      assert.equal(fake.events.at(-1), 'rollback');
    });
  });

  it('PUT sets the quantity on a present item', async () => {
    await withApp({ itemWrite: [{ quantity: 3 }] }, async (app, fake) => {
      const res = await app.inject({ method: 'PUT', url: `/api/carts/${CART_ID}/items/9`, payload: { quantity: 3 } });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(fake.calls.find((call) => /UPDATE cart_items/.test(call.text))?.values, [CART_ID, '9', 3]);
    });
  });

  it('PUT requires a quantity', async () => {
    await withApp({}, async (app, fake) => {
      const res = await app.inject({ method: 'PUT', url: `/api/carts/${CART_ID}/items/9`, payload: {} });
      assert.equal(res.statusCode, 400);
      assert.equal(fake.calls.length, 0);
    });
  });

  it('DELETE on a present item returns 200 {cart}', async () => {
    await withApp({ itemWrite: [{ id: '5' }] }, async (app, fake) => {
      const res = await app.inject({ method: 'DELETE', url: `/api/carts/${CART_ID}/items/9` });
      assert.equal(res.statusCode, 200);
      assert.ok(res.json().cart);
      const first = fake.calls.find((call) => call.inTransaction)!;
      assert.match(first.text, /FOR UPDATE/);
      assert.deepEqual(fake.calls.find((call) => /DELETE FROM cart_items/.test(call.text))?.values, [CART_ID, '9']);
      assert.deepEqual(fake.events, ['begin', 'commit']);
    });
  });

  it('DELETE on an absent item returns 404 CART_ITEM_NOT_FOUND', async () => {
    await withApp({ itemWrite: [] }, async (app) => {
      const res = await app.inject({ method: 'DELETE', url: `/api/carts/${CART_ID}/items/9` });
      assert.equal(res.statusCode, 404);
      assert.equal(errorCode(res.body), 'CART_ITEM_NOT_FOUND');
    });
  });

  it('rejects a malformed product id in the path', async () => {
    await withApp({}, async (app, fake) => {
      const res = await app.inject({ method: 'DELETE', url: `/api/carts/${CART_ID}/items/abc` });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.details.issues[0].path, 'params.productId');
      assert.equal(fake.calls.length, 0);
    });
  });
});

describe('GET / PATCH /api/carts/:cartId', () => {
  const itemRow = {
    product_id: '9',
    sku: 'ELEC-009',
    name: 'Sony PlayStation 5 Slim Console',
    image_url: null,
    unit_price: '54990.00',
    quantity: 2,
    line_total: '109980.00',
    available_quantity: 1,
  };

  it('reads a checked-out cart back with items, totals and its order id', async () => {
    await withApp(
      {
        header: { ...defaultHeader, status: 'checked_out', order_id: 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b', item_count: 2, subtotal: '109980.00' },
        items: [itemRow],
      },
      async (app, fake) => {
        const res = await app.inject({ method: 'GET', url: `/api/carts/${CART_ID}` });
        assert.equal(res.statusCode, 200);
        const { cart } = res.json();
        assert.equal(cart.status, 'checked_out');
        assert.equal(cart.orderId, 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b');
        assert.deepEqual(cart.items, [
          {
            productId: '9',
            sku: 'ELEC-009',
            name: 'Sony PlayStation 5 Slim Console',
            imageUrl: null,
            unitPrice: 54990,
            quantity: 2,
            lineTotal: 109980,
            availableQuantity: 1,
          },
        ]);
        assert.equal(cart.itemCount, 2);
        assert.equal(cart.subtotal, 109980);
        assert.ok(fake.calls.every((call) => !/FOR UPDATE/.test(call.text)), 'reads never lock');
      },
    );
  });

  it('returns 404 CART_NOT_FOUND for an unknown cart', async () => {
    await withApp({ header: null }, async (app) => {
      const res = await app.inject({ method: 'GET', url: `/api/carts/${CART_ID}` });
      assert.equal(res.statusCode, 404);
      assert.equal(errorCode(res.body), 'CART_NOT_FOUND');
    });
  });

  it('PATCH switches the store under the cart lock', async () => {
    await withApp({}, async (app, fake) => {
      const res = await app.inject({ method: 'PATCH', url: `/api/carts/${CART_ID}`, payload: { locationId: '2' } });
      assert.equal(res.statusCode, 200);
      assert.ok(res.json().cart);
      assert.match(fake.calls.find((call) => call.inTransaction)!.text, /FOR UPDATE/);
      assert.deepEqual(fake.calls.find((call) => /UPDATE carts\s+SET location_id/.test(call.text))?.values, [CART_ID, '2']);
    });
  });

  it('PATCH to an unknown store returns 404 LOCATION_NOT_FOUND', async () => {
    await withApp({ locationWrite: [] }, async (app, fake) => {
      const res = await app.inject({ method: 'PATCH', url: `/api/carts/${CART_ID}`, payload: { locationId: '42' } });
      assert.equal(res.statusCode, 404);
      assert.equal(errorCode(res.body), 'LOCATION_NOT_FOUND');
      assert.equal(fake.events.at(-1), 'rollback');
    });
  });

  it('PATCH on a checked-out cart returns 409 CART_NOT_ACTIVE', async () => {
    await withApp({ cart: { status: 'checked_out', location_id: '1' } }, async (app, fake) => {
      const res = await app.inject({ method: 'PATCH', url: `/api/carts/${CART_ID}`, payload: { locationId: '2' } });
      assert.equal(res.statusCode, 409);
      assert.equal(errorCode(res.body), 'CART_NOT_ACTIVE');
      assert.ok(!fake.calls.some((call) => /UPDATE carts\s+SET location_id/.test(call.text)));
    });
  });
});
