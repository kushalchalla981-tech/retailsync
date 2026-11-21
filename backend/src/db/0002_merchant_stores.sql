-- Merchant-created storefronts (v1.04).
-- The storefront document (branding, theme, catalog) lives in `data` as the
-- frontend's store model; ownership is the verified Clerk user id, never a
-- value taken from the request body.
CREATE TABLE IF NOT EXISTS merchant_stores (
  id          TEXT        PRIMARY KEY,
  owner_id    TEXT        NOT NULL,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_stores_owner_idx ON merchant_stores (owner_id);
