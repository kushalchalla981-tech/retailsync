/**
 * Offline tests for checkout (POST /api/carts/:cartId/checkout) and order
 * read-back (GET /api/orders/:orderId) against the scripted fake database:
 * lock order, rollback on insufficient stock, PostgreSQL error mapping,
 * idempotent replay, and the post-COMMIT order event hook. No Aiven access.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { notifyOrderPlaced, type OrderEventSink, type OrderPlacedEvent } from '../events/order-events.js';
// Namespace import: a missing export is undefined at use, not a module load fault.
import * as checkoutStore from '../store/checkout.js';
import { createFakeDatabase, type FakeCall, type FakeDatabase, type FakeResponse } from '../testing/fake-db.js';

const CART_ID = '0b6f6a2e-3c1d-4e5f-8a9b-1c2d3e4f5a6b';
const ORDER_ID = '5d1c9a7e-2b3f-4c6d-9e8a-7f6b5c4d3e2a';
const CUSTOMER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const PLACED = new Date('2026-11-13T09:30:00.000Z');

const ELEC_001 = { product_id: '7', sku: 'ELEC-001', name: 'Sony WH-1000XM5', price: '29990.00', is_active: true };
const ELEC_010 = { product_id: '12', sku: 'ELEC-010', name: 'Anker PowerCore', price: '4990.00', is_active: true };

const CUSTOMER = { name: 'Asha Rao', email: 'asha@example.com' };

interface Scenario {
  cart?: { status: string; location_id: string | null; location_name?: string | null; city?: string | null } | null;
  /** Cart lines (default: ELEC-010 x2 then ELEC-001 x1, i.e. NOT in product id order). */
  items?: readonly object[];
  /** Rows returned by the inventory FOR UPDATE lock. */
  inventory?: readonly { id: string; product_id: string; stock_quantity: number }[];
  /** Existing order row for getOrder (null = none). */
  existingOrder?: object | null;
  /** Fail the first statement matching `pattern` with `error`. */
  failOn?: { pattern: RegExp; error: Error };
}

const defaultItems = [
  { ...ELEC_010, quantity: 2 },
  { ...ELEC_001, quantity: 1 },
];

const defaultInventory = [
  { id: '101', product_id: '12', stock_quantity: 50 },
  { id: '205', product_id: '7', stock_quantity: 25 },
];

const existingOrderRow = {
  id: ORDER_ID,
  status: 'placed',
  payment_status: 'pending',
  cart_id: CART_ID,
  customer_id: CUSTOMER_ID,
  customer_name: 'Asha Rao',
  location_id: '1',
  location_name: 'Bangalore Central',
  city: 'Bangalore',
  total_amount: '39970.00',
  created_at: PLACED,
  items: [
    { productId: '7', sku: 'ELEC-001', name: 'Sony WH-1000XM5', quantity: 1, unitPrice: '29990.00', lineTotal: '29990.00' },
    { productId: '12', sku: 'ELEC-010', name: 'Anker PowerCore', quantity: 2, unitPrice: '4990.00', lineTotal: '9980.00' },
  ],
};

function pgError(code: string, constraint?: string): Error {
  return Object.assign(new Error(`pg error ${code}`), { code, ...(constraint ? { constraint } : {}) });
}

function respond(scenario: Scenario): (call: FakeCall) => FakeResponse {
  let failed = false;
  return ({ text, values }) => {
    if (!failed && scenario.failOn && scenario.failOn.pattern.test(text)) {
      failed = true;
      return scenario.failOn.error;
    }
    if (/SET LOCAL lock_timeout/.test(text)) return [];
    if (/FOR UPDATE OF c/.test(text)) {
      const cart =
        scenario.cart === undefined
          ? { status: 'active', location_id: '1', location_name: 'Bangalore Central', city: 'Bangalore' }
          : scenario.cart;
      return cart ? [{ id: CART_ID, location_name: 'Bangalore Central', city: 'Bangalore', ...cart }] : [];
    }
    if (/FROM cart_items ci/.test(text)) return scenario.items ?? defaultItems;
    if (/INSERT INTO customers/.test(text)) return [{ id: CUSTOMER_ID }];
    if (/FROM inventory WHERE location_id/.test(text)) return scenario.inventory ?? defaultInventory;
    if (/UPDATE inventory/.test(text)) {
      const ids = values[0] as string[];
      const qty = values[1] as number[];
      const inventory = scenario.inventory ?? defaultInventory;
      return ids.map((id, index) => {
        const row = inventory.find((entry) => entry.id === id);
        return {
          id,
          product_id: row?.product_id ?? '0',
          location_id: '1',
          stock_quantity: (row?.stock_quantity ?? 0) - (qty[index] ?? 0),
        };
      });
    }
    if (/INSERT INTO orders/.test(text)) {
      return [{ id: ORDER_ID, status: 'placed', payment_status: 'pending', total_amount: '39970.00', created_at: PLACED }];
    }
    if (/INSERT INTO order_items/.test(text)) {
      return [
        { product_id: '7', quantity: 1, unit_price: '29990.00', line_total: '29990.00' },
        { product_id: '12', quantity: 2, unit_price: '4990.00', line_total: '9980.00' },
      ];
    }
    if (/UPDATE carts SET status/.test(text)) return [];
    if (/FROM orders o/.test(text)) {
      const order = scenario.existingOrder === undefined ? existingOrderRow : scenario.existingOrder;
      return order ? [order] : [];
    }
    return new Error(`unexpected SQL in test: ${text}`);
  };
}

interface SpySink extends OrderEventSink {
  events: OrderPlacedEvent[];
  /** Copy of fake.events at the moment the sink was called. */
  txEventsAtCall: string[][];
}

function spySink(fake: () => FakeDatabase, behaviour: 'ok' | 'throw' = 'ok'): SpySink {
  const sink: SpySink = {
    events: [],
    txEventsAtCall: [],
    async orderPlaced(event) {
      sink.events.push(event);
      sink.txEventsAtCall.push([...fake().events]);
      if (behaviour === 'throw') throw new Error('kafka is down');
    },
  };
  return sink;
}

async function withApp(
  scenario: Scenario,
  fn: (app: FastifyInstance, fake: FakeDatabase, sink: SpySink) => Promise<void>,
  behaviour: 'ok' | 'throw' = 'ok',
): Promise<void> {
  const fake = createFakeDatabase(respond(scenario));
  const sink = spySink(() => fake, behaviour);
  const app = buildApp({ logLevel: 'silent', db: fake, orderEvents: sink });
  try {
    await fn(app, fake, sink);
  } finally {
    await app.close();
  }
}

function checkout(app: FastifyInstance, payload: unknown = { customer: CUSTOMER }, cartId = CART_ID) {
  return app.inject({ method: 'POST', url: `/api/carts/${cartId}/checkout`, payload: payload as Record<string, unknown> });
}

function indexOf(fake: FakeDatabase, pattern: RegExp): number {
  return fake.calls.findIndex((call) => pattern.test(call.text));
}

function has(fake: FakeDatabase, pattern: RegExp): boolean {
  return indexOf(fake, pattern) !== -1;
}

describe('POST /api/carts/:cartId/checkout - success', () => {
  it('locks the cart, then inventory in id order, then writes; commits and returns 201', async () => {
    await withApp({}, async (app, fake) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 201, response.body);
      assert.deepEqual(fake.events, ['begin', 'commit']);

      const lockingCalls = fake.calls.filter((call) => /FOR UPDATE/.test(call.text));
      assert.match(lockingCalls[0]?.text ?? '', /FOR UPDATE OF c/);
      assert.deepEqual(lockingCalls[0]?.values, [CART_ID]);

      const inventoryLock = indexOf(fake, /ORDER BY id FOR UPDATE/);
      assert.ok(inventoryLock > indexOf(fake, /FOR UPDATE OF c/), 'inventory lock must follow the cart lock');
      assert.deepEqual(fake.calls[inventoryLock]?.values, ['1', ['7', '12']], 'product ids sorted ascending (numerically)');
      assert.ok(inventoryLock < indexOf(fake, /UPDATE inventory/), 'lock before decrement');
      assert.ok(inventoryLock < indexOf(fake, /INSERT INTO orders/), 'lock before order insert');
      assert.ok(indexOf(fake, /INSERT INTO customers/) < inventoryLock, 'customer upsert outside the stock critical section');
      assert.ok(fake.calls.every((call) => call.inTransaction), 'every checkout statement runs in the transaction');
    });
  });

  it('sets a lock_timeout of at least 30s as the first statement of the transaction', async () => {
    await withApp({}, async (app, fake) => {
      await checkout(app);
      assert.match(fake.calls[0]?.text ?? '', /^SET LOCAL lock_timeout = '\d+s'$/);
      const seconds = Number(/'(\d+)s'/.exec(fake.calls[0]?.text ?? '')?.[1]);
      assert.ok(seconds >= 30, `lock_timeout ${seconds}s must be >= 30s`);
      assert.equal(checkoutStore.CHECKOUT_LOCK_TIMEOUT, `${seconds}s`);
    });
  });

  it('returns the order in the documented shape, prices from the product snapshot', async () => {
    await withApp({}, async (app, fake) => {
      const response = await checkout(app);
      const body = response.json();
      assert.equal(body.replayed, false);
      const { order } = body;
      assert.equal(order.id, ORDER_ID);
      assert.equal(order.status, 'placed');
      assert.equal(order.paymentStatus, 'pending');
      assert.equal(order.cartId, CART_ID);
      assert.deepEqual(order.customer, { id: CUSTOMER_ID, name: 'Asha Rao' });
      assert.deepEqual(order.location, { id: '1', name: 'Bangalore Central', city: 'Bangalore' });
      assert.equal(order.totalAmount, 39970);
      assert.equal(order.createdAt, PLACED.toISOString());
      assert.deepEqual(order.items, [
        { productId: '7', sku: 'ELEC-001', name: 'Sony WH-1000XM5', quantity: 1, unitPrice: 29990, lineTotal: 29990 },
        { productId: '12', sku: 'ELEC-010', name: 'Anker PowerCore', quantity: 2, unitPrice: 4990, lineTotal: 9980 },
      ]);
      assert.ok(!response.body.includes('email'), 'no email in the response');

      const decrement = fake.calls[indexOf(fake, /UPDATE inventory/)];
      assert.deepEqual(decrement?.values, [['205', '101'], [1, 2]]);
      const orderInsert = fake.calls[indexOf(fake, /INSERT INTO orders/)];
      assert.deepEqual(orderInsert?.values, [CUSTOMER_ID, CART_ID, '1', [1, 2], ['29990.00', '4990.00']]);
      const markCart = fake.calls[indexOf(fake, /UPDATE carts SET status/)];
      assert.deepEqual(markCart?.values, [CART_ID, CUSTOMER_ID]);
    });
  });

  it('notifies the sink exactly once, after COMMIT', async () => {
    await withApp({}, async (app, _fake, sink) => {
      await checkout(app);
      assert.equal(sink.events.length, 1);
      assert.equal(sink.txEventsAtCall[0]?.at(-1), 'commit');
    });
  });

  it('sends the order.placed payload with decimal strings and post-decrement stock', async () => {
    await withApp({}, async (app, _fake, sink) => {
      await checkout(app);
      const event = sink.events[0];
      assert.ok(event);
      assert.equal(event.type, 'order.placed');
      assert.equal(event.version, 1);
      assert.equal(event.orderId, ORDER_ID);
      assert.equal(event.customerId, CUSTOMER_ID);
      assert.equal(event.cartId, CART_ID);
      assert.equal(event.locationId, '1');
      assert.equal(event.locationName, 'Bangalore Central');
      assert.equal(event.city, 'Bangalore');
      assert.equal(event.totalAmount, '39970.00');
      assert.equal(event.placedAt, PLACED.toISOString());
      assert.deepEqual(event.items, [
        { productId: '7', sku: 'ELEC-001', name: 'Sony WH-1000XM5', quantity: 1, unitPrice: '29990.00', lineTotal: '29990.00' },
        { productId: '12', sku: 'ELEC-010', name: 'Anker PowerCore', quantity: 2, unitPrice: '4990.00', lineTotal: '9980.00' },
      ]);
      assert.deepEqual(
        [...event.inventory].sort((a, b) => a.inventoryId.localeCompare(b.inventoryId)),
        [
          { inventoryId: '101', productId: '12', locationId: '1', stockQuantity: 48 },
          { inventoryId: '205', productId: '7', locationId: '1', stockQuantity: 24 },
        ],
      );
      assert.ok(!JSON.stringify(event).includes('asha@example.com'), 'event carries no email');
    });
  });

  it('still returns 201 when the sink throws', async () => {
    await withApp(
      {},
      async (app, fake, sink) => {
        const response = await checkout(app);
        assert.equal(response.statusCode, 201);
        assert.equal(sink.events.length, 1);
        assert.deepEqual(fake.events, ['begin', 'commit']);
      },
      'throw',
    );
  });
});

describe('notifyOrderPlaced', () => {
  it('logs a sink failure with the order id only and does not rethrow', async () => {
    const logged: { obj: Record<string, unknown>; msg?: string }[] = [];
    const log = { error: (obj: object, msg?: string) => logged.push({ obj: obj as Record<string, unknown>, msg }) };
    const sink: OrderEventSink = {
      async orderPlaced() {
        throw new Error('broker unavailable');
      },
    };
    await notifyOrderPlaced(sink, { orderId: ORDER_ID } as OrderPlacedEvent, log);
    assert.equal(logged.length, 1);
    assert.equal(logged[0]?.obj.orderId, ORDER_ID);
    assert.ok(logged[0]?.obj.err instanceof Error);
    assert.deepEqual(Object.keys(logged[0]?.obj ?? {}).sort(), ['err', 'orderId']);
    assert.match(logged[0]?.msg ?? '', /committed/);
  });
});

describe('POST /api/carts/:cartId/checkout - insufficient stock', () => {
  it('returns 409 OUT_OF_STOCK naming store and product, rolls back, writes nothing', async () => {
    const scenario: Scenario = {
      items: [{ ...ELEC_001, quantity: 1 }],
      inventory: [{ id: '205', product_id: '7', stock_quantity: 0 }],
    };
    await withApp(scenario, async (app, fake, sink) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 409);
      const { error } = response.json();
      assert.equal(error.code, 'OUT_OF_STOCK');
      assert.match(error.message, /Bangalore Central/);
      assert.match(error.message, /Sony WH-1000XM5/);
      assert.match(error.message, /requested 1, available 0/);
      assert.equal(error.details.locationId, '1');
      assert.equal(error.details.locationName, 'Bangalore Central');
      assert.deepEqual(error.details.items[0], {
        productId: '7',
        sku: 'ELEC-001',
        name: 'Sony WH-1000XM5',
        requested: 1,
        available: 0,
      });
      assert.ok(!has(fake, /UPDATE inventory/), 'no stock decrement');
      assert.ok(!has(fake, /INSERT INTO orders/), 'no order insert');
      assert.ok(!has(fake, /UPDATE carts SET status/), 'cart stays active');
      assert.equal(fake.events.at(-1), 'rollback');
      assert.equal(sink.events.length, 0);
    });
  });

  it('lists every shortfall, joined with "; "', async () => {
    const scenario: Scenario = {
      inventory: [
        { id: '101', product_id: '12', stock_quantity: 1 },
        { id: '205', product_id: '7', stock_quantity: 0 },
      ],
    };
    await withApp(scenario, async (app) => {
      const { error } = (await checkout(app)).json();
      assert.equal(error.code, 'OUT_OF_STOCK');
      assert.equal(error.details.items.length, 2);
      assert.match(error.message, /; /);
    });
  });

  it('treats a product the store does not carry as available 0', async () => {
    const scenario: Scenario = { items: [{ ...ELEC_001, quantity: 1 }], inventory: [] };
    await withApp(scenario, async (app, fake) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 409);
      const { error } = response.json();
      assert.equal(error.code, 'OUT_OF_STOCK');
      assert.equal(error.details.items[0].available, 0);
      assert.equal(fake.events.at(-1), 'rollback');
    });
  });
});

describe('POST /api/carts/:cartId/checkout - idempotent replay', () => {
  it('returns 200 replayed:true with the existing order for a checked_out cart, no stock lock, no hook', async () => {
    await withApp({ cart: { status: 'checked_out', location_id: '1' } }, async (app, fake, sink) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 200, response.body);
      const body = response.json();
      assert.equal(body.replayed, true);
      assert.equal(body.order.id, ORDER_ID);
      assert.equal(body.order.totalAmount, 39970);
      assert.ok(!has(fake, /ORDER BY id FOR UPDATE/), 'no inventory lock');
      assert.ok(!has(fake, /UPDATE inventory|INSERT INTO orders|INSERT INTO customers/), 'nothing written');
      assert.equal(sink.events.length, 0);
    });
  });

  it('maps 23505 orders_cart_id_key on the order insert to a replay after rollback', async () => {
    const scenario: Scenario = { failOn: { pattern: /INSERT INTO orders/, error: pgError('23505', 'orders_cart_id_key') } };
    await withApp(scenario, async (app, fake, sink) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().replayed, true);
      assert.equal(response.json().order.id, ORDER_ID);
      assert.equal(fake.events.at(-1), 'rollback');
      const read = fake.calls[indexOf(fake, /FROM orders o/)];
      assert.equal(read?.inTransaction, false, 'existing order read after the rollback');
      assert.deepEqual(read?.values, [CART_ID]);
      assert.equal(sink.events.length, 0);
    });
  });
});

describe('POST /api/carts/:cartId/checkout - database error mapping', () => {
  it('maps 23514 inventory_stock_quantity_nonnegative on the decrement to 409 OUT_OF_STOCK', async () => {
    const scenario: Scenario = {
      failOn: { pattern: /UPDATE inventory/, error: pgError('23514', 'inventory_stock_quantity_nonnegative') },
    };
    await withApp(scenario, async (app, fake, sink) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 409);
      assert.equal(response.json().error.code, 'OUT_OF_STOCK');
      assert.equal(fake.events.at(-1), 'rollback');
      assert.equal(sink.events.length, 0);
    });
  });

  for (const sqlstate of ['40P01', '40001', '55P03']) {
    it(`maps SQLSTATE ${sqlstate} to 503 CHECKOUT_BUSY (retryable)`, async () => {
      const scenario: Scenario = { failOn: { pattern: /ORDER BY id FOR UPDATE/, error: pgError(sqlstate) } };
      await withApp(scenario, async (app, fake) => {
        const response = await checkout(app);
        assert.equal(response.statusCode, 503);
        const { error } = response.json();
        assert.equal(error.code, 'CHECKOUT_BUSY');
        assert.equal(error.details.retryable, true);
        assert.equal(error.details.sqlstate, sqlstate);
        assert.equal(fake.events.at(-1), 'rollback');
      });
    });
  }

  it('lets unknown database errors become a non-leaking 500', async () => {
    const scenario: Scenario = { failOn: { pattern: /INSERT INTO order_items/, error: pgError('XX000') } };
    await withApp(scenario, async (app) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 500);
      assert.equal(response.json().error.code, 'INTERNAL_ERROR');
      assert.ok(!response.body.includes('pg error'));
    });
  });

  it('mapCheckoutDbError classifies pg errors', () => {
    const { mapCheckoutDbError } = checkoutStore;
    const outOfStock = mapCheckoutDbError(pgError('23514', 'inventory_stock_quantity_nonnegative'));
    assert.equal(typeof outOfStock === 'object' && outOfStock.code, 'OUT_OF_STOCK');
    assert.equal(mapCheckoutDbError(pgError('23505', 'orders_cart_id_key')), 'replay');
    const busy = mapCheckoutDbError(pgError('40P01'));
    assert.equal(typeof busy === 'object' && busy.statusCode, 503);
    assert.equal(mapCheckoutDbError(pgError('23505', 'customers_email_lower_key')), undefined);
    assert.equal(mapCheckoutDbError(pgError('23514', 'some_other_check')), undefined);
    assert.equal(mapCheckoutDbError(new Error('plain')), undefined);
    assert.equal(mapCheckoutDbError('not an error'), undefined);
  });
});

describe('POST /api/carts/:cartId/checkout - guards', () => {
  it('returns 404 CART_NOT_FOUND for an unknown cart', async () => {
    await withApp({ cart: null }, async (app, fake) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 404);
      assert.equal(response.json().error.code, 'CART_NOT_FOUND');
      assert.equal(fake.events.at(-1), 'rollback');
    });
  });

  it('returns 422 CART_EMPTY for an empty cart', async () => {
    await withApp({ items: [] }, async (app, fake) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 422);
      assert.equal(response.json().error.code, 'CART_EMPTY');
      assert.ok(!has(fake, /INSERT INTO customers|ORDER BY id FOR UPDATE/));
    });
  });

  it('returns 409 PRODUCT_UNAVAILABLE when a cart line is an inactive product', async () => {
    const scenario: Scenario = { items: [{ ...ELEC_001, quantity: 1 }, { ...ELEC_010, quantity: 1, is_active: false }] };
    await withApp(scenario, async (app, fake) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 409);
      const { error } = response.json();
      assert.equal(error.code, 'PRODUCT_UNAVAILABLE');
      assert.deepEqual(error.details.skus, ['ELEC-010']);
      assert.ok(!has(fake, /ORDER BY id FOR UPDATE/));
      assert.equal(fake.events.at(-1), 'rollback');
    });
  });

  it('returns 409 CART_NOT_ACTIVE for an abandoned cart', async () => {
    await withApp({ cart: { status: 'abandoned', location_id: '1' } }, async (app, fake) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 409);
      assert.equal(response.json().error.code, 'CART_NOT_ACTIVE');
      assert.equal(response.json().error.details.status, 'abandoned');
      assert.ok(!has(fake, /FROM cart_items ci/));
    });
  });

  it('returns 409 CART_LOCATION_REQUIRED when the cart has no store', async () => {
    await withApp({ cart: { status: 'active', location_id: null, location_name: null, city: null } }, async (app) => {
      const response = await checkout(app);
      assert.equal(response.statusCode, 409);
      assert.equal(response.json().error.code, 'CART_LOCATION_REQUIRED');
    });
  });
});

describe('POST /api/carts/:cartId/checkout - validation', () => {
  const invalid: [string, unknown][] = [
    ['missing customer', {}],
    ['bad email', { customer: { name: 'Asha', email: 'not-an-email' } }],
    ['blank name', { customer: { name: '   ', email: 'asha@example.com' } }],
    ['extra body key', { customer: CUSTOMER, totalAmount: 1 }],
    ['extra customer key', { customer: { ...CUSTOMER, price: 1 } }],
  ];
  for (const [label, payload] of invalid) {
    it(`rejects ${label} with 400 VALIDATION_FAILED and no database call`, async () => {
      await withApp({}, async (app, fake) => {
        const response = await checkout(app, payload);
        assert.equal(response.statusCode, 400);
        assert.equal(response.json().error.code, 'VALIDATION_FAILED');
        assert.equal(fake.calls.length, 0);
      });
    });
  }

  it('rejects a non-UUID cart id with 400 and no database call', async () => {
    await withApp({}, async (app, fake) => {
      const response = await checkout(app, { customer: CUSTOMER }, 'not-a-uuid');
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, 'VALIDATION_FAILED');
      assert.equal(fake.calls.length, 0);
    });
  });
});

describe('GET /api/orders/:orderId', () => {
  it('returns 200 {order} with customer id and name and no email anywhere', async () => {
    await withApp({}, async (app, fake) => {
      const response = await app.inject({ method: 'GET', url: `/api/orders/${ORDER_ID}` });
      assert.equal(response.statusCode, 200, response.body);
      const { order } = response.json();
      assert.equal(order.id, ORDER_ID);
      assert.deepEqual(order.customer, { id: CUSTOMER_ID, name: 'Asha Rao' });
      assert.deepEqual(order.location, { id: '1', name: 'Bangalore Central', city: 'Bangalore' });
      assert.equal(order.totalAmount, 39970);
      assert.equal(order.items.length, 2);
      assert.equal(order.items[1].lineTotal, 9980);
      assert.ok(!/email/i.test(response.body), 'no email key or value in the body');
      assert.deepEqual(fake.calls[0]?.values, [ORDER_ID]);
      assert.ok(!/email/.test(fake.calls[0]?.text ?? ''), 'the order query never selects email');
    });
  });

  it('returns 404 ORDER_NOT_FOUND for an unknown id', async () => {
    await withApp({ existingOrder: null }, async (app) => {
      const response = await app.inject({ method: 'GET', url: `/api/orders/${ORDER_ID}` });
      assert.equal(response.statusCode, 404);
      assert.equal(response.json().error.code, 'ORDER_NOT_FOUND');
    });
  });

  it('returns 400 for a non-UUID id without touching the database', async () => {
    await withApp({}, async (app, fake) => {
      const response = await app.inject({ method: 'GET', url: '/api/orders/42' });
      assert.equal(response.statusCode, 400);
      assert.equal(fake.calls.length, 0);
    });
  });
});
