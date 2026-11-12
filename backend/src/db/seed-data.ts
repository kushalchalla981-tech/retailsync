/**
 * Demo catalog (`seed-data.json`): loading and validation.
 *
 * The JSON is the single source of the seeded store locations, categories,
 * products, and per-location stock. Validation mirrors the PostgreSQL schema
 * constraints (slug format, non-negative NUMERIC(12,2) price, non-negative
 * INTEGER stock, unique natural keys) and checks every cross-reference, so a
 * bad edit fails before any row is written - with every problem listed at once.
 *
 * `inventory` maps a store location name to units on hand; omitting a location
 * means the product is not carried there (no inventory row).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { PROJECT_ROOT } from '../config.js';

export const SEED_DATA_FILE = 'seed-data.json';

/** Largest value of PostgreSQL NUMERIC(12,2). */
const MAX_PRICE = 9_999_999_999.99;
/** Largest PostgreSQL INTEGER. */
const MAX_STOCK = 2_147_483_647;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKU = /^[A-Z][A-Z0-9]*-\d{3,}$/;

const nonBlank = z.string().trim().min(1, 'must not be blank');

const locationSchema = z.strictObject({
  name: nonBlank,
  city: nonBlank,
  address: z.string().trim().default(''),
});

const categorySchema = z.strictObject({
  slug: z.string().regex(SLUG, 'must be lowercase words joined by single hyphens'),
  name: nonBlank,
});

const priceSchema = z
  .number()
  .nonnegative()
  .max(MAX_PRICE)
  .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, 'must have at most 2 decimal places');

const productSchema = z.strictObject({
  sku: z.string().regex(SKU, 'must look like PREFIX-001 (uppercase prefix, dash, 3+ digits)'),
  name: nonBlank.max(200),
  description: nonBlank,
  category: z.string(),
  price: priceSchema,
  image_url: z.url({ protocol: /^https$/ }).nullable(),
  inventory: z.record(z.string(), z.number().int().min(0).max(MAX_STOCK)),
});

const catalogSchema = z.object({
  $comment: z.string().optional(),
  locations: z.array(locationSchema).min(1),
  categories: z.array(categorySchema).min(1),
  products: z.array(productSchema).min(1),
});

export type SeedLocation = z.output<typeof locationSchema>;
export type SeedCategory = z.output<typeof categorySchema>;
export type SeedProduct = z.output<typeof productSchema>;
export type SeedCatalog = z.output<typeof catalogSchema>;

/** One `inventory` row to upsert, keyed by natural keys. */
export interface SeedInventoryRow {
  sku: string;
  location_name: string;
  stock_quantity: number;
}

export class SeedDataError extends Error {
  readonly issues: readonly string[];

  constructor(source: string, issues: readonly string[]) {
    super(`invalid seed data (${source}):\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'SeedDataError';
    this.issues = issues;
  }
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

/** Referential and uniqueness checks the per-record schema cannot express. */
function crossCheck(catalog: SeedCatalog): string[] {
  const issues: string[] = [];
  for (const name of duplicates(catalog.locations.map((l) => l.name))) issues.push(`locations: duplicate name "${name}"`);
  for (const slug of duplicates(catalog.categories.map((c) => c.slug))) issues.push(`categories: duplicate slug "${slug}"`);
  // The search index normalises SKUs to lowercase, so they must be unique case-insensitively.
  for (const sku of duplicates(catalog.products.map((p) => p.sku.toLowerCase()))) issues.push(`products: duplicate sku "${sku.toUpperCase()}"`);

  const locationNames = new Set(catalog.locations.map((l) => l.name));
  const categorySlugs = new Set(catalog.categories.map((c) => c.slug));
  const usedCategories = new Set<string>();
  for (const product of catalog.products) {
    if (!categorySlugs.has(product.category)) {
      issues.push(`products.${product.sku}.category: unknown category "${product.category}"`);
    }
    usedCategories.add(product.category);
    const stocked = Object.keys(product.inventory);
    if (stocked.length === 0) issues.push(`products.${product.sku}.inventory: must list at least one store location`);
    for (const location of stocked) {
      if (!locationNames.has(location)) issues.push(`products.${product.sku}.inventory: unknown store location "${location}"`);
    }
  }
  for (const slug of categorySlugs) {
    if (!usedCategories.has(slug)) issues.push(`categories.${slug}: has no products`);
  }
  return issues;
}

/** Validate raw JSON into a typed catalog, reporting every problem at once. */
export function parseSeedCatalog(raw: unknown, source = SEED_DATA_FILE): SeedCatalog {
  const parsed = catalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SeedDataError(
      source,
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const issues = crossCheck(parsed.data);
  if (issues.length > 0) throw new SeedDataError(source, issues);
  return parsed.data;
}

/**
 * Locate the catalog: next to this module under tsx, or the source tree when
 * running compiled `dist/` (tsc does not copy JSON that is not imported).
 */
export function resolveSeedDataPath(file = SEED_DATA_FILE): string {
  const candidates = [fileURLToPath(new URL(file, import.meta.url)), resolve(PROJECT_ROOT, 'backend', 'src', 'db', file)];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`seed data ${file} not found (looked in: ${candidates.join(', ')})`);
  return found;
}

export function loadSeedCatalog(path = resolveSeedDataPath()): SeedCatalog {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new SeedDataError(path, [`not readable JSON: ${(error as Error).message}`]);
  }
  return parseSeedCatalog(raw, path);
}

/** Flatten per-product stock maps into inventory rows (catalog order, then location order). */
export function inventoryRows(catalog: SeedCatalog): SeedInventoryRow[] {
  const order = new Map(catalog.locations.map((location, index) => [location.name, index]));
  return catalog.products.flatMap((product) =>
    Object.entries(product.inventory)
      .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map(([location_name, stock_quantity]) => ({ sku: product.sku, location_name, stock_quantity })),
  );
}

/** Inventory rows holding exactly one unit: the targets for the concurrent last-unit checkout demo. */
export function lastUnitRows(catalog: SeedCatalog): SeedInventoryRow[] {
  return inventoryRows(catalog).filter((row) => row.stock_quantity === 1);
}
