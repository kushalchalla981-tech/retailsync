/**
 * Offline route tests for the catalog API (/api/products, /api/products/:id,
 * /api/categories, /api/locations, /api/inventory) plus the shared error
 * envelope - all against the scripted fake database, no Aiven access.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { createFakeDatabase, type FakeDatabase, type FakeResponder } from '../testing/fake-db.js';

const productRow = {
  id: '9',
  sku: 'ELEC-009',
  name: 'Sony PlayStation 5 Slim Console',
  description: 'Console',
  price: '54990.00',
  image_url: 'https://example.test/ps5.jpg',
  category_id: '1',
  category_slug: 'electronics',
  category_name: 'Electronics',
  inventory: [
    { locationId: '1', locationName: 'Bangalore Central', city: 'Bangalore', stockQuantity: 1 },
    { locationId: '2', locationName: 'Mumbai Metro', city: 'Mumbai', stockQuantity: 0 },
  ],
  total_stock: 1,
  total_count: 7,
};

const expectedProduct = {
  id: '9',
  sku: 'ELEC-009',
  name: 'Sony PlayStation 5 Slim Console',
  description: 'Console',
  price: 54990,
  imageUrl: 'https://example.test/ps5.jpg',
  category: { id: '1', slug: 'electronics', name: 'Electronics' },
  inventory: productRow.inventory,
  totalStock: 1,
  inStock: true,
};

async function withApp(respond: FakeResponder, fn: (app: FastifyInstance, fake: FakeDatabase) => Promise<void>): Promise<void> {
  const fake = createFakeDatabase(respond);
  const app = buildApp({ logLevel: 'silent', db: fake });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

describe('GET /api/products', () => {
  it('passes every filter only as a bound value, never in the SQL text', async () => {
    await withApp(
      () => [productRow],
      async (app, fake) => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/products?category=electronics&locationId=1&city=Bangalore&inStock=true&limit=10&offset=5',
        });
        assert.equal(res.statusCode, 200);
        assert.equal(fake.calls.length, 1);
        const [call] = fake.calls;
        assert.deepEqual(call!.values, ['electronics', '1', 'Bangalore', true, 10, 5]);
        for (const literal of ['electronics', 'Bangalore']) {
          assert.ok(!call!.text.includes(literal), `${literal} must not appear in SQL text`);
        }
        assert.match(call!.text, /p\.is_active/);
      },
    );
  });

  it('defaults limit/offset and leaves absent filters null', async () => {
    await withApp(
      () => [],
      async (app, fake) => {
        const res = await app.inject({ method: 'GET', url: '/api/products' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { items: [], total: 0, limit: 50, offset: 0 });
        assert.deepEqual(fake.calls[0]!.values, [null, null, null, false, 50, 0]);
      },
    );
  });

  it('maps rows to camelCase JSON with string ids and numeric price', async () => {
    await withApp(
      () => [productRow],
      async (app) => {
        const res = await app.inject({ method: 'GET', url: '/api/products?limit=1' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { items: [expectedProduct], total: 7, limit: 1, offset: 0 });
      },
    );
  });

  it('reports a product with no stock anywhere as out of stock', async () => {
    await withApp(
      () => [{ ...productRow, inventory: null, total_stock: 0 }],
      async (app) => {
        const body = (await app.inject({ method: 'GET', url: '/api/products' })).json();
        assert.deepEqual(body.items[0].inventory, []);
        assert.equal(body.items[0].totalStock, 0);
        assert.equal(body.items[0].inStock, false);
      },
    );
  });

  const invalid: [string, string][] = [
    ['limit=0', 'query.limit'],
    ['limit=101', 'query.limit'],
    ['limit=abc', 'query.limit'],
    ['offset=-1', 'query.offset'],
    ['category=Bad_Slug', 'query.category'],
    ['locationId=0', 'query.locationId'],
    ['locationId=abc', 'query.locationId'],
    ['city=B4ngalore', 'query.city'],
    ['inStock=yes', 'query.inStock'],
  ];
  for (const [qs, path] of invalid) {
    it(`rejects ${qs} with 400 VALIDATION_FAILED before any query`, async () => {
      await withApp(
        () => [],
        async (app, fake) => {
          const res = await app.inject({ method: 'GET', url: `/api/products?${qs}` });
          assert.equal(res.statusCode, 400);
          const body = res.json();
          assert.equal(body.error.code, 'VALIDATION_FAILED');
          assert.equal(typeof body.error.requestId, 'string');
          assert.ok(
            body.error.details.issues.some((issue: { path: string }) => issue.path === path),
            `expected an issue at ${path}: ${res.body}`,
          );
          assert.equal(fake.calls.length, 0);
          const value = qs.split('=')[1]!;
          if (value.length > 2) assert.ok(!res.body.includes(value), 'rejected value must not be echoed');
        },
      );
    });
  }
});

describe('GET /api/products/:productId', () => {
  it('rejects a non-numeric id with 400 and no query', async () => {
    await withApp(
      () => [productRow],
      async (app, fake) => {
        const res = await app.inject({ method: 'GET', url: '/api/products/abc' });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error.code, 'VALIDATION_FAILED');
        assert.equal(res.json().error.details.issues[0].path, 'params.productId');
        assert.equal(fake.calls.length, 0);
      },
    );
  });

  it('returns 404 PRODUCT_NOT_FOUND when no active product matches', async () => {
    await withApp(
      () => [],
      async (app, fake) => {
        const res = await app.inject({ method: 'GET', url: '/api/products/999' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error.code, 'PRODUCT_NOT_FOUND');
        assert.deepEqual(fake.calls[0]!.values, ['999']);
        assert.match(fake.calls[0]!.text, /p\.is_active/);
      },
    );
  });

  it('returns {product} for a match', async () => {
    await withApp(
      () => [productRow],
      async (app) => {
        const res = await app.inject({ method: 'GET', url: '/api/products/9' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { product: expectedProduct });
      },
    );
  });
});

describe('GET /api/inventory', () => {
  const inventoryRow = {
    product_id: '9',
    sku: 'ELEC-009',
    product_name: 'Sony PlayStation 5 Slim Console',
    location_id: '1',
    location_name: 'Bangalore Central',
    city: 'Bangalore',
    stock_quantity: 1,
    updated_at: new Date('2026-11-12T10:00:00.000Z'),
  };

  it('requires productId or locationId', async () => {
    await withApp(
      () => [],
      async (app, fake) => {
        const res = await app.inject({ method: 'GET', url: '/api/inventory' });
        assert.equal(res.statusCode, 400);
        const body = res.json();
        assert.equal(body.error.code, 'VALIDATION_FAILED');
        assert.match(body.error.details.issues[0].message, /productId/);
        assert.match(body.error.details.issues[0].message, /locationId/);
        assert.equal(fake.calls.length, 0);
      },
    );
  });

  it('rejects malformed ids', async () => {
    await withApp(
      () => [],
      async (app, fake) => {
        const res = await app.inject({ method: 'GET', url: '/api/inventory?productId=1x' });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error.details.issues[0].path, 'query.productId');
        assert.equal(fake.calls.length, 0);
      },
    );
  });

  it('returns stock rows for a product at a store, filters as bound values', async () => {
    await withApp(
      () => [inventoryRow],
      async (app, fake) => {
        const res = await app.inject({ method: 'GET', url: '/api/inventory?productId=9&locationId=1' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), {
          items: [
            {
              productId: '9',
              sku: 'ELEC-009',
              productName: 'Sony PlayStation 5 Slim Console',
              locationId: '1',
              locationName: 'Bangalore Central',
              city: 'Bangalore',
              stockQuantity: 1,
              inStock: true,
              updatedAt: '2026-11-12T10:00:00.000Z',
            },
          ],
        });
        assert.deepEqual(fake.calls[0]!.values, ['9', '1']);
      },
    );
  });

  it('returns an empty list when the store does not carry the product', async () => {
    await withApp(
      () => [],
      async (app, fake) => {
        const res = await app.inject({ method: 'GET', url: '/api/inventory?locationId=3' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { items: [] });
        assert.deepEqual(fake.calls[0]!.values, [null, '3']);
      },
    );
  });
});

describe('GET /api/categories and /api/locations', () => {
  it('lists categories with string ids and a numeric active-product count', async () => {
    await withApp(
      () => [{ id: '1', slug: 'electronics', name: 'Electronics', product_count: 11 }],
      async (app, fake) => {
        const res = await app.inject({ method: 'GET', url: '/api/categories' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { items: [{ id: '1', slug: 'electronics', name: 'Electronics', productCount: 11 }] });
        assert.match(fake.calls[0]!.text, /FILTER \(WHERE p\.is_active\)/);
      },
    );
  });

  it('lists store locations', async () => {
    await withApp(
      () => [{ id: '1', name: 'Bangalore Central', city: 'Bangalore', address: 'MG Road' }],
      async (app) => {
        const res = await app.inject({ method: 'GET', url: '/api/locations' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { items: [{ id: '1', name: 'Bangalore Central', city: 'Bangalore', address: 'MG Road' }] });
      },
    );
  });
});

describe('error envelope', () => {
  let app: FastifyInstance;
  before(async () => {
    app = buildApp({
      logLevel: 'silent',
      db: createFakeDatabase(() => new Error('connect failed: password=hunter2 host=pg.example')),
    });
    await app.ready();
  });
  after(async () => {
    await app.close();
  });

  it('returns 404 ROUTE_NOT_FOUND for an unknown route', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    assert.equal(res.statusCode, 404);
    const body = res.json();
    assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
    assert.equal(typeof body.error.message, 'string');
    assert.equal(typeof body.error.requestId, 'string');
  });

  it('turns an unexpected database error into 500 INTERNAL_ERROR without leaking it', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/categories' });
    assert.equal(res.statusCode, 500);
    const body = res.json();
    assert.deepEqual(Object.keys(body), ['error']);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'Internal server error');
    assert.equal(typeof body.error.requestId, 'string');
    assert.ok(!res.body.includes('hunter2'));
    assert.ok(!res.body.includes('pg.example'));
  });

  it('keeps /health independent of the database', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'ok');
  });
});
