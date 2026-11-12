/**
 * Offline structural tests for backend/src/db/schema.sql.
 *
 * No PostgreSQL server is available to these tests, so the SQL text is split
 * into statements (respecting comments, quotes, and dollar-quoting) and each
 * CREATE TABLE body is decomposed into column / constraint definitions. The
 * assertions pin the contract later phases rely on - most importantly the
 * lockable per-location inventory row with CHECK (stock_quantity >= 0).
 *
 * This proves structure, NOT that PostgreSQL accepts the DDL; live execution
 * is pending Aiven credentials (see WINDOWS.md).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const SQL = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Minimal SQL structure analyser
// ---------------------------------------------------------------------------

/** Split SQL into statements, dropping comments; `;` inside quotes/dollar bodies is ignored. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      assert.notEqual(end, -1, 'unterminated block comment');
      i = end + 2;
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      assert.notEqual(end, -1, `unterminated dollar-quoted body ${tag}`);
      current += sql.slice(i, end + tag.length);
      i = end + tag.length;
      continue;
    }
    const ch = sql[i]!;
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch && sql[j + 1] === ch) j += 2;
        else if (sql[j] === ch) break;
        else j += 1;
      }
      assert.ok(j < sql.length, 'unterminated quoted literal');
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === ';') {
      if (current.trim()) statements.push(normalise(current));
      current = '';
    } else {
      current += ch;
    }
    i += 1;
  }
  assert.equal(current.trim(), '', 'trailing statement without terminating semicolon');
  return statements;
}

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Split on commas that are not nested inside parentheses. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    assert.ok(depth >= 0, 'unbalanced parentheses');
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  assert.equal(depth, 0, 'unbalanced parentheses');
  if (current.trim()) parts.push(current.trim());
  return parts;
}

interface Column {
  name: string;
  definition: string;
}

interface Table {
  name: string;
  columns: Map<string, Column>;
  /** Table-level constraint clauses (CONSTRAINT ..., PRIMARY KEY (...), ...). */
  constraints: string[];
  /** column -> referenced table (inline REFERENCES). */
  foreignKeys: Map<string, string>;
}

const CREATE_TABLE = /^CREATE TABLE IF NOT EXISTS (\w+) \((.*)\)$/i;

function parseTables(statements: readonly string[]): Map<string, Table> {
  const tables = new Map<string, Table>();
  for (const statement of statements) {
    if (!/^CREATE TABLE/i.test(statement)) continue;
    const match = CREATE_TABLE.exec(statement);
    assert.ok(match, `CREATE TABLE must use IF NOT EXISTS: ${statement.slice(0, 60)}`);
    const [, name, body] = match as unknown as [string, string, string];
    const table: Table = { name, columns: new Map(), constraints: [], foreignKeys: new Map() };
    for (const part of splitTopLevel(body)) {
      if (/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)\b/i.test(part)) {
        table.constraints.push(part);
        continue;
      }
      const [columnName = ''] = part.split(' ');
      table.columns.set(columnName, { name: columnName, definition: part });
      const ref = /\bREFERENCES (\w+)/i.exec(part);
      if (ref) table.foreignKeys.set(columnName, ref[1]!);
    }
    tables.set(name, table);
  }
  return tables;
}

/** Leading column of every index-backed key: PK, UNIQUE constraints, CREATE [UNIQUE] INDEX. */
function indexedLeadingColumns(statements: readonly string[], tables: Map<string, Table>): Map<string, Set<string>> {
  const leading = new Map<string, Set<string>>();
  const add = (table: string, column: string) => {
    if (!leading.has(table)) leading.set(table, new Set());
    leading.get(table)!.add(column);
  };
  for (const table of tables.values()) {
    for (const column of table.columns.values()) {
      if (/\bPRIMARY KEY\b/i.test(column.definition) || /\bUNIQUE\b/i.test(column.definition)) add(table.name, column.name);
    }
    for (const constraint of table.constraints) {
      const key = /\b(?:UNIQUE|PRIMARY KEY) \((\w+)/i.exec(constraint);
      if (key) add(table.name, key[1]!);
    }
  }
  for (const statement of statements) {
    const index = /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS \w+ ON (\w+) \((?:lower\()?(\w+)/i.exec(statement);
    if (index) add(index[1]!, index[2]!);
  }
  return leading;
}

const statements = splitStatements(SQL);
const tables = parseTables(statements);
const table = (name: string): Table => {
  const found = tables.get(name);
  assert.ok(found, `table ${name} is defined`);
  return found;
};
const column = (tableName: string, columnName: string): string => {
  const found = table(tableName).columns.get(columnName);
  assert.ok(found, `${tableName}.${columnName} is defined`);
  return found.definition;
};
const constraintsOf = (tableName: string) => table(tableName).constraints.join('\n');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('schema.sql structure', () => {
  it('defines every table of the RetailSync data model', () => {
    assert.deepEqual(
      [...tables.keys()].sort(),
      [
        'cart_items',
        'carts',
        'categories',
        'customers',
        'inventory',
        'order_items',
        'orders',
        'products',
        'store_locations',
      ],
    );
  });

  it('is idempotent: every statement can be re-applied', () => {
    for (const statement of statements) {
      const ok =
        /^CREATE TABLE IF NOT EXISTS /i.test(statement) ||
        /^CREATE (UNIQUE )?INDEX IF NOT EXISTS /i.test(statement) ||
        /^CREATE OR REPLACE FUNCTION /i.test(statement) ||
        /^DROP TRIGGER IF EXISTS /i.test(statement) ||
        /^CREATE TRIGGER /i.test(statement);
      assert.ok(ok, `non-idempotent statement: ${statement.slice(0, 80)}`);
    }
    // Each CREATE TRIGGER is immediately preceded by a DROP TRIGGER IF EXISTS of the same trigger.
    statements.forEach((statement, index) => {
      const trigger = /^CREATE TRIGGER (\w+) .* ON (\w+) /i.exec(statement);
      if (!trigger) return;
      assert.equal(statements[index - 1], `DROP TRIGGER IF EXISTS ${trigger[1]} ON ${trigger[2]}`);
    });
  });

  it('contains no destructive or privileged statements (safe on a managed Aiven service)', () => {
    for (const statement of statements) {
      assert.doesNotMatch(statement, /^(DROP (TABLE|INDEX|SCHEMA|FUNCTION)|TRUNCATE|DELETE|ALTER)\b/i);
      assert.doesNotMatch(statement, /^CREATE EXTENSION\b/i, 'no extensions: avnadmin must be able to apply it');
    }
  });

  it('creates referenced tables before the tables that reference them', () => {
    const order = [...tables.keys()];
    for (const t of tables.values()) {
      for (const [col, referenced] of t.foreignKeys) {
        assert.ok(tables.has(referenced), `${t.name}.${col} references a defined table`);
        assert.ok(order.indexOf(referenced) < order.indexOf(t.name), `${referenced} is created before ${t.name}`);
      }
    }
  });

  it('wires the expected foreign keys', () => {
    const fks = Object.fromEntries([...tables.values()].map((t) => [t.name, Object.fromEntries(t.foreignKeys)]));
    assert.deepEqual(fks, {
      categories: {},
      products: { category_id: 'categories' },
      store_locations: {},
      inventory: { product_id: 'products', location_id: 'store_locations' },
      customers: {},
      carts: { customer_id: 'customers', location_id: 'store_locations' },
      cart_items: { cart_id: 'carts', product_id: 'products' },
      orders: { customer_id: 'customers', cart_id: 'carts', location_id: 'store_locations' },
      order_items: { order_id: 'orders', product_id: 'products' },
    });
  });

  it('indexes the leading column of every foreign key (joins, cascades, lock lookups)', () => {
    const leading = indexedLeadingColumns(statements, tables);
    for (const t of tables.values()) {
      for (const col of t.foreignKeys.keys()) {
        assert.ok(leading.get(t.name)?.has(col), `${t.name}.${col} has an index with it as leading column`);
      }
    }
  });

  it('gives every table a primary key', () => {
    for (const t of tables.values()) {
      const id = t.columns.get('id');
      assert.ok(id && /\bPRIMARY KEY\b/i.test(id.definition), `${t.name}.id is the primary key`);
    }
  });
});

describe('schema.sql inventory locking contract (Phase 2 SELECT ... FOR UPDATE)', () => {
  it('stores stock as one row per (product, location)', () => {
    assert.match(constraintsOf('inventory'), /CONSTRAINT inventory_product_location_key UNIQUE \(product_id, location_id\)/);
    assert.match(column('inventory', 'product_id'), /NOT NULL REFERENCES products \(id\)/);
    assert.match(column('inventory', 'location_id'), /NOT NULL REFERENCES store_locations \(id\)/);
  });

  it('forbids negative stock with a named CHECK constraint', () => {
    assert.match(column('inventory', 'stock_quantity'), /^stock_quantity INTEGER NOT NULL DEFAULT 0$/);
    assert.match(
      constraintsOf('inventory'),
      /CONSTRAINT inventory_stock_quantity_nonnegative CHECK \(stock_quantity >= 0\)/,
    );
  });

  it('keeps inventory rows when locations are referenced, and removes them with their product', () => {
    assert.match(column('inventory', 'location_id'), /ON DELETE RESTRICT/);
    assert.match(column('inventory', 'product_id'), /ON DELETE CASCADE/);
  });

  it('maintains inventory.updated_at on every stock change', () => {
    assert.match(column('inventory', 'updated_at'), /TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    assert.ok(statements.includes(
      'CREATE TRIGGER inventory_set_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
    ));
  });
});

describe('schema.sql columns and constraints', () => {
  it('categories: unique, URL-safe slug', () => {
    for (const col of ['id', 'name', 'slug']) column('categories', col);
    assert.match(constraintsOf('categories'), /CONSTRAINT categories_slug_key UNIQUE \(slug\)/);
    assert.match(constraintsOf('categories'), /CONSTRAINT categories_slug_format CHECK/);
  });

  it('products: plan columns, unique SKU, non-negative exact-decimal price', () => {
    for (const col of ['id', 'category_id', 'name', 'description', 'price', 'sku', 'image_url', 'created_at']) {
      column('products', col);
    }
    assert.match(column('products', 'price'), /NUMERIC\(12,2\) NOT NULL/);
    assert.match(constraintsOf('products'), /CONSTRAINT products_price_nonnegative CHECK \(price >= 0\)/);
    assert.match(constraintsOf('products'), /CONSTRAINT products_sku_key UNIQUE \(sku\)/);
    assert.match(column('products', 'category_id'), /NOT NULL REFERENCES categories \(id\) ON DELETE RESTRICT/);
  });

  it('store_locations: name, city, address', () => {
    for (const col of ['id', 'name', 'city', 'address']) column('store_locations', col);
    assert.match(column('store_locations', 'city'), /NOT NULL/);
  });

  it('customers: case-insensitive unique email', () => {
    for (const col of ['id', 'name', 'email']) column('customers', col);
    assert.ok(statements.includes('CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_key ON customers (lower(email))'));
  });

  it('carts / cart_items: status lifecycle, positive quantities, one row per product', () => {
    assert.match(constraintsOf('carts'), /CHECK \(status IN \('active', 'checked_out', 'abandoned'\)\)/);
    assert.match(constraintsOf('cart_items'), /CONSTRAINT cart_items_quantity_positive CHECK \(quantity > 0\)/);
    assert.match(constraintsOf('cart_items'), /UNIQUE \(cart_id, product_id\)/);
    assert.match(column('cart_items', 'cart_id'), /ON DELETE CASCADE/);
  });

  it('orders: status, total_amount, payment_status, created_at with validated values', () => {
    for (const col of ['id', 'customer_id', 'location_id', 'status', 'total_amount', 'payment_status', 'created_at']) {
      column('orders', col);
    }
    assert.match(column('orders', 'location_id'), /NOT NULL/, 'every order is fulfilled by a store location');
    assert.match(column('orders', 'total_amount'), /NUMERIC\(12,2\) NOT NULL/);
    assert.match(constraintsOf('orders'), /orders_status_check CHECK \(status IN \('placed', 'confirmed', 'fulfilled', 'cancelled'\)\)/);
    assert.match(constraintsOf('orders'), /orders_payment_status_check CHECK \(payment_status IN \('pending', 'paid', 'failed', 'refunded'\)\)/);
    assert.match(constraintsOf('orders'), /orders_total_amount_nonnegative CHECK \(total_amount >= 0\)/);
    assert.match(constraintsOf('orders'), /CONSTRAINT orders_cart_id_key UNIQUE \(cart_id\)/);
  });

  it('order_items: price snapshot, positive quantity, derived line total', () => {
    for (const col of ['order_id', 'product_id', 'quantity', 'unit_price', 'line_total']) column('order_items', col);
    assert.match(column('order_items', 'line_total'), /GENERATED ALWAYS AS \(quantity \* unit_price\) STORED/);
    assert.match(constraintsOf('order_items'), /CHECK \(quantity > 0\)/);
    assert.match(constraintsOf('order_items'), /CHECK \(unit_price >= 0\)/);
    assert.match(column('order_items', 'product_id'), /ON DELETE RESTRICT/, 'ordered products cannot be deleted');
  });
});
