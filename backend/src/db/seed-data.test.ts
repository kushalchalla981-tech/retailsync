/**
 * Tests for the demo catalog: the shipped seed-data.json must satisfy the
 * plan's content requirements and the schema's constraints, and the validator
 * must reject bad edits before anything touches the database.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildProductDocument } from '../search/mappings.js';
import {
  inventoryRows,
  lastUnitRows,
  loadSeedCatalog,
  parseSeedCatalog,
  resolveSeedDataPath,
  SeedDataError,
  type SeedCatalog,
} from './seed-data.js';

const catalog = loadSeedCatalog();

describe('shipped seed catalog', () => {
  it('has 50+ products across multiple realistic retail categories', () => {
    assert.ok(catalog.products.length >= 50, `only ${catalog.products.length} products`);
    const slugs = catalog.categories.map((c) => c.slug);
    for (const required of ['electronics', 'apparel', 'groceries', 'home-goods']) assert.ok(slugs.includes(required), required);
    for (const category of catalog.categories) {
      const count = catalog.products.filter((p) => p.category === category.slug).length;
      assert.ok(count >= 5, `${category.slug} has only ${count} products`);
    }
  });

  it('has store locations in Bangalore, Mumbai, and Delhi', () => {
    assert.deepEqual(
      catalog.locations.map((l) => [l.name, l.city]),
      [
        ['Bangalore Central', 'Bangalore'],
        ['Mumbai Metro', 'Mumbai'],
        ['Delhi Hub', 'Delhi'],
      ],
    );
    for (const location of catalog.locations) {
      const stocked = inventoryRows(catalog).filter((row) => row.location_name === location.name && row.stock_quantity > 0);
      assert.ok(stocked.length >= 40, `${location.name} stocks only ${stocked.length} products`);
    }
  });

  it('includes last-unit stock (=1) in every city for the concurrent checkout demo', () => {
    const lastUnits = lastUnitRows(catalog);
    assert.ok(lastUnits.length >= 5, `only ${lastUnits.length} last-unit rows`);
    for (const location of catalog.locations) {
      assert.ok(
        lastUnits.some((row) => row.location_name === location.name),
        `${location.name} has no product with exactly 1 unit`,
      );
    }
    // A single product with exactly one unit in every store (flash-sale scenario).
    const everywhere = catalog.products.filter((p) => catalog.locations.every((l) => p.inventory[l.name] === 1));
    assert.ok(everywhere.length >= 1, 'no product has exactly 1 unit in every store');
  });

  it('covers sold-out, not-carried, and fully out-of-stock availability cases', () => {
    const rows = inventoryRows(catalog);
    assert.ok(rows.some((row) => row.stock_quantity === 0), 'no sold-out (0) inventory row');
    assert.ok(
      catalog.products.some((p) => Object.keys(p.inventory).length < catalog.locations.length),
      'every product is carried everywhere',
    );
    assert.ok(
      catalog.products.some((p) => Object.values(p.inventory).every((qty) => qty === 0)),
      'no product is out of stock everywhere',
    );
  });

  it('has plausible product data (unique names, descriptions, positive INR prices, https images)', () => {
    assert.equal(new Set(catalog.products.map((p) => p.name)).size, catalog.products.length);
    for (const product of catalog.products) {
      assert.ok(product.description.length >= 30, `${product.sku} description too short`);
      assert.ok(product.price > 0 && product.price < 100_000, `${product.sku} price ${product.price}`);
      assert.match(product.image_url ?? '', /^https:\/\//);
    }
    const prices = catalog.products.map((p) => p.price);
    assert.ok(Math.min(...prices) < 500 && Math.max(...prices) > 25_000, 'price range too narrow for range-filter demos');
  });

  it('includes searchable names for the typo-tolerance demo', () => {
    const names = catalog.products.map((p) => p.name.toLowerCase()).join('\n');
    for (const term of ['headphones', 'wireless', 'basmati', 'running shoes']) assert.ok(names.includes(term), term);
  });

  it('builds a valid search document for every product (derived city availability)', () => {
    const locations = new Map(catalog.locations.map((l, i) => [l.name, { id: i + 1, ...l }]));
    const category = new Map(catalog.categories.map((c) => [c.slug, c.name]));
    for (const [index, product] of catalog.products.entries()) {
      const inventory = Object.entries(product.inventory).map(([name, stock_quantity]) => {
        const location = locations.get(name)!;
        return { location_id: location.id, location_name: name, city: location.city, stock_quantity };
      });
      const doc = buildProductDocument(
        {
          id: index + 1,
          sku: product.sku,
          name: product.name,
          description: product.description,
          category_slug: product.category,
          category_name: category.get(product.category)!,
          price: product.price.toFixed(2),
          image_url: product.image_url,
          is_active: true,
          created_at: '2026-11-12T00:00:00Z',
          updated_at: '2026-11-12T00:00:00Z',
        },
        inventory,
      );
      assert.equal(doc.city.length, Object.keys(product.inventory).length);
      assert.equal(doc.in_stock, Object.values(product.inventory).some((qty) => qty > 0));
      assert.equal(doc.price, product.price);
    }
  });

  it('flattens inventory in catalog then location order', () => {
    const rows = inventoryRows(catalog);
    assert.equal(rows.length, catalog.products.reduce((n, p) => n + Object.keys(p.inventory).length, 0));
    assert.deepEqual(rows[0], { sku: catalog.products[0]!.sku, location_name: 'Bangalore Central', stock_quantity: catalog.products[0]!.inventory['Bangalore Central'] });
    const firstProductRows = rows.filter((row) => row.sku === catalog.products[0]!.sku).map((row) => row.location_name);
    assert.deepEqual(firstProductRows, ['Bangalore Central', 'Mumbai Metro', 'Delhi Hub']);
  });
});

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

function minimal(): SeedCatalog {
  return {
    locations: [{ name: 'Store A', city: 'Pune', address: '' }],
    categories: [{ slug: 'tools', name: 'Tools' }],
    products: [
      {
        sku: 'TOOL-001',
        name: 'Hammer',
        description: 'A hammer',
        category: 'tools',
        price: 199.5,
        image_url: 'https://example.com/hammer.jpg',
        inventory: { 'Store A': 3 },
      },
    ],
  };
}

function issuesOf(raw: unknown): readonly string[] {
  try {
    parseSeedCatalog(raw, 'test');
  } catch (error) {
    assert.ok(error instanceof SeedDataError);
    return error.issues;
  }
  assert.fail('expected SeedDataError');
}

describe('seed catalog validation', () => {
  it('accepts a minimal valid catalog and defaults the address', () => {
    const raw = minimal() as unknown as Record<string, unknown>;
    delete (raw.locations as Record<string, unknown>[])[0]!.address;
    assert.equal(parseSeedCatalog(raw).locations[0]!.address, '');
  });

  it('rejects values the schema constraints would reject', () => {
    const raw = minimal();
    raw.categories[0]!.slug = 'Power Tools';
    raw.products[0]!.price = 19.999;
    raw.products[0]!.inventory['Store A'] = -1;
    raw.products[0]!.image_url = 'http://insecure.example.com/x.jpg';
    raw.products[0]!.sku = 'tool1';
    const issues = issuesOf(raw);
    assert.ok(issues.some((i) => i.startsWith('categories.0.slug:')), issues.join('\n'));
    assert.ok(issues.some((i) => i.startsWith('products.0.price:') && /2 decimal/.test(i)));
    assert.ok(issues.some((i) => i.startsWith('products.0.inventory.Store A:')));
    assert.ok(issues.some((i) => i.startsWith('products.0.image_url:')));
    assert.ok(issues.some((i) => i.startsWith('products.0.sku:')));
  });

  it('rejects unknown fields (typos) in records', () => {
    const raw = minimal() as unknown as { products: Record<string, unknown>[] };
    raw.products[0]!.prcie = 10;
    assert.ok(issuesOf(raw).some((i) => i.startsWith('products.0') && /prcie/.test(i)));
  });

  it('reports every cross-reference problem at once', () => {
    const raw = minimal();
    raw.locations.push({ name: 'Store A', city: 'Pune', address: '' });
    raw.categories.push({ slug: 'garden', name: 'Garden' });
    raw.products.push(
      { ...raw.products[0]!, sku: 'tool-001'.toUpperCase(), name: 'Dup', inventory: { 'Store A': 1 } },
      { ...raw.products[0]!, sku: 'TOOL-002', category: 'toys', inventory: { 'Store Z': 1 } },
      { ...raw.products[0]!, sku: 'TOOL-003', inventory: {} },
    );
    assert.deepEqual([...issuesOf(raw)].sort(), [
      'categories.garden: has no products',
      'locations: duplicate name "Store A"',
      'products.TOOL-002.category: unknown category "toys"',
      'products.TOOL-002.inventory: unknown store location "Store Z"',
      'products.TOOL-003.inventory: must list at least one store location',
      'products: duplicate sku "TOOL-001"',
    ]);
  });

  it('treats SKUs as unique case-insensitively (the index lowercases them)', () => {
    const raw = minimal();
    raw.products.push({ ...raw.products[0]!, sku: 'TOOL-001' });
    assert.deepEqual(issuesOf(raw), ['products: duplicate sku "TOOL-001"']);
  });

  it('reports unreadable JSON with the file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-data-'));
    const file = join(dir, 'broken.json');
    writeFileSync(file, '{ not json');
    assert.throws(() => loadSeedCatalog(file), (error: unknown) => error instanceof SeedDataError && error.message.includes(file));
  });

  it('resolves the shipped catalog path', () => {
    assert.match(resolveSeedDataPath(), /backend\/src\/db\/seed-data\.json$/);
    assert.throws(() => resolveSeedDataPath('missing.json'), /seed data missing\.json not found/);
  });
});
