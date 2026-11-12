-- =============================================================================
-- RetailSync relational schema (migration 0001_initial_schema)
-- =============================================================================
-- Source of truth for catalog, per-location stock, carts, and orders.
--
-- Applied by backend/src/db/migrations.ts inside a single transaction
-- (PostgreSQL DDL is transactional, so a failure leaves no partial schema).
-- Every statement is also idempotent (IF NOT EXISTS / OR REPLACE), so the file
-- can be re-applied safely with psql as well.
--
-- Requires PostgreSQL 13+ (gen_random_uuid() is built in; no extensions).
--
-- Stock integrity contract (Phase 2 checkout):
--   * Stock lives in exactly one row per (product, location): `inventory`.
--   * Checkout locks the rows it will decrement with
--         SELECT id, stock_quantity FROM inventory
--          WHERE location_id = $1 AND product_id = ANY($2)
--          ORDER BY id
--            FOR UPDATE;
--     inside one transaction. Locking in a deterministic order (ORDER BY id)
--     prevents deadlocks between concurrent multi-item checkouts. The lookup is
--     served by the inventory_product_location_key unique index.
--   * CHECK (stock_quantity >= 0) is the last line of defence: even a buggy
--     decrement that skipped the lock cannot drive stock negative; it fails with
--     SQLSTATE 23514 on constraint inventory_stock_quantity_nonnegative.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Catalog
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT        NOT NULL CHECK (length(btrim(name)) > 0),
  slug        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT categories_slug_key UNIQUE (slug),
  CONSTRAINT categories_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS products (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id  BIGINT        NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  name         TEXT          NOT NULL CHECK (length(btrim(name)) > 0),
  description  TEXT          NOT NULL DEFAULT '',
  price        NUMERIC(12,2) NOT NULL,
  sku          TEXT          NOT NULL,
  image_url    TEXT,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT products_sku_key UNIQUE (sku),
  CONSTRAINT products_price_nonnegative CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS products_category_id_idx ON products (category_id);

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Physical stores (fulfilment locations, one or more per city)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_locations (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT        NOT NULL CHECK (length(btrim(name)) > 0),
  city        TEXT        NOT NULL CHECK (length(btrim(city)) > 0),
  address     TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_locations_name_key UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS store_locations_city_idx ON store_locations (city);

-- -----------------------------------------------------------------------------
-- Inventory: one lockable row per (product, location)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id      BIGINT      NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  location_id     BIGINT      NOT NULL REFERENCES store_locations (id) ON DELETE RESTRICT,
  stock_quantity  INTEGER     NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_product_location_key UNIQUE (product_id, location_id),
  CONSTRAINT inventory_stock_quantity_nonnegative CHECK (stock_quantity >= 0)
);

-- (product_id, location_id) is covered by the unique index; this serves
-- "everything stocked at location X" lookups and the location FK.
CREATE INDEX IF NOT EXISTS inventory_location_id_idx ON inventory (location_id);

DROP TRIGGER IF EXISTS inventory_set_updated_at ON inventory;
CREATE TRIGGER inventory_set_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Customers (guest checkout: name + email, no credentials)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (length(btrim(name)) > 0),
  email       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_email_format CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);

-- Case-insensitive uniqueness without the citext extension.
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_key ON customers (lower(email));

-- -----------------------------------------------------------------------------
-- Carts (session cart; location chosen via the city selector before checkout)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID        REFERENCES customers (id) ON DELETE SET NULL,
  location_id  BIGINT      REFERENCES store_locations (id) ON DELETE RESTRICT,
  status       TEXT        NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carts_status_check CHECK (status IN ('active', 'checked_out', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS carts_customer_id_idx ON carts (customer_id);
CREATE INDEX IF NOT EXISTS carts_location_id_idx ON carts (location_id);
-- At most one active cart per known customer.
CREATE UNIQUE INDEX IF NOT EXISTS carts_one_active_per_customer
  ON carts (customer_id)
  WHERE status = 'active' AND customer_id IS NOT NULL;

DROP TRIGGER IF EXISTS carts_set_updated_at ON carts;
CREATE TRIGGER carts_set_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS cart_items (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id     UUID        NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
  product_id  BIGINT      NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  quantity    INTEGER     NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_cart_product_key UNIQUE (cart_id, product_id),
  CONSTRAINT cart_items_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS cart_items_product_id_idx ON cart_items (product_id);

-- -----------------------------------------------------------------------------
-- Orders
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID          NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  -- A cart converts into at most one order (guards against double submit).
  cart_id         UUID          REFERENCES carts (id) ON DELETE SET NULL,
  location_id     BIGINT        NOT NULL REFERENCES store_locations (id) ON DELETE RESTRICT,
  status          TEXT          NOT NULL DEFAULT 'placed',
  payment_status  TEXT          NOT NULL DEFAULT 'pending',
  total_amount    NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT orders_cart_id_key UNIQUE (cart_id),
  CONSTRAINT orders_status_check CHECK (status IN ('placed', 'confirmed', 'fulfilled', 'cancelled')),
  CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  CONSTRAINT orders_total_amount_nonnegative CHECK (total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS orders_customer_id_created_at_idx ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_location_id_idx ON orders (location_id);

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS order_items (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    UUID          NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id  BIGINT        NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity    INTEGER       NOT NULL,
  -- Price snapshot at checkout; later catalog price changes do not rewrite history.
  unit_price  NUMERIC(12,2) NOT NULL,
  line_total  NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  CONSTRAINT order_items_order_product_key UNIQUE (order_id, product_id),
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_unit_price_nonnegative CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items (product_id);
