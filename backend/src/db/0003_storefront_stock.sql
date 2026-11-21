-- Live storefront stock (v1.05): one row per storefront product, shared by
-- every device. Checkout decrements under row locks; the CHECK makes
-- overselling impossible even if application code is wrong.
CREATE TABLE IF NOT EXISTS storefront_stock (
  store_id    TEXT        NOT NULL,
  product_id  TEXT        NOT NULL,
  stock       INTEGER     NOT NULL CHECK (stock >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, product_id)
);

-- One row per verified Razorpay payment, so a replayed verify never
-- decrements stock or emails an invoice twice.
CREATE TABLE IF NOT EXISTS storefront_payments (
  payment_id  TEXT        PRIMARY KEY,
  order_id    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The six built-in demo stores (catalog in frontend/src/data/stores.ts).
INSERT INTO storefront_stock (store_id, product_id, stock) VALUES
  ('store-1', 'store-1-prod-1', 23),
  ('store-1', 'store-1-prod-2', 38),
  ('store-1', 'store-1-prod-3', 54),
  ('store-1', 'store-1-prod-4', 72),
  ('store-1', 'store-1-prod-5', 88),
  ('store-1', 'store-1-prod-6', 105),
  ('store-1', 'store-1-prod-7', 118),
  ('store-1', 'store-1-prod-8', 129),
  ('store-2', 'store-2-prod-1', 38),
  ('store-2', 'store-2-prod-2', 54),
  ('store-2', 'store-2-prod-3', 72),
  ('store-2', 'store-2-prod-4', 88),
  ('store-2', 'store-2-prod-5', 105),
  ('store-2', 'store-2-prod-6', 118),
  ('store-2', 'store-2-prod-7', 129),
  ('store-2', 'store-2-prod-8', 23),
  ('store-3', 'store-3-prod-1', 54),
  ('store-3', 'store-3-prod-2', 72),
  ('store-3', 'store-3-prod-3', 88),
  ('store-3', 'store-3-prod-4', 105),
  ('store-3', 'store-3-prod-5', 118),
  ('store-3', 'store-3-prod-6', 129),
  ('store-3', 'store-3-prod-7', 23),
  ('store-3', 'store-3-prod-8', 38),
  ('store-4', 'store-4-prod-1', 72),
  ('store-4', 'store-4-prod-2', 88),
  ('store-4', 'store-4-prod-3', 105),
  ('store-4', 'store-4-prod-4', 118),
  ('store-4', 'store-4-prod-5', 129),
  ('store-4', 'store-4-prod-6', 23),
  ('store-4', 'store-4-prod-7', 38),
  ('store-5', 'store-5-prod-1', 88),
  ('store-5', 'store-5-prod-2', 105),
  ('store-5', 'store-5-prod-3', 118),
  ('store-5', 'store-5-prod-4', 129),
  ('store-5', 'store-5-prod-5', 23),
  ('store-5', 'store-5-prod-6', 38),
  ('store-5', 'store-5-prod-7', 54),
  ('store-6', 'store-6-prod-1', 105),
  ('store-6', 'store-6-prod-2', 118),
  ('store-6', 'store-6-prod-3', 129),
  ('store-6', 'store-6-prod-4', 23),
  ('store-6', 'store-6-prod-5', 38),
  ('store-6', 'store-6-prod-6', 54),
  ('store-6', 'store-6-prod-7', 72),
  ('store-6', 'store-6-prod-8', 88)
ON CONFLICT DO NOTHING;

-- Merchant stores created before v1.05: seed from their saved catalogs.
INSERT INTO storefront_stock (store_id, product_id, stock)
SELECT s.id, p->>'id', GREATEST(0, COALESCE((p->>'stock')::int, 0))
  FROM merchant_stores s, jsonb_array_elements(s.data->'catalog') p
 WHERE p->>'id' IS NOT NULL
ON CONFLICT DO NOTHING;
