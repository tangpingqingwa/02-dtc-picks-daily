-- Durable application-side payment boundary.  Provider retries are delivery
-- records; business/payment/order identities live in the unique identity table.
CREATE TABLE payment_intents (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  product_url TEXT NOT NULL,
  why_test_this_today TEXT NOT NULL,
  target_bid_cents INTEGER NOT NULL CHECK (target_bid_cents >= 500),
  quote_base_bid_cents INTEGER NOT NULL CHECK (quote_base_bid_cents >= 0),
  charge_cents INTEGER NOT NULL CHECK (charge_cents >= 0),
  expected_mode TEXT NOT NULL CHECK (expected_mode IN ('fixture', 'waffo-test', 'waffo-prod')),
  expected_store_id TEXT NOT NULL,
  expected_product_id TEXT NOT NULL,
  expected_currency TEXT NOT NULL CHECK (expected_currency = 'USD'),
  expected_tax_category TEXT NOT NULL CHECK (expected_tax_category = 'digital_goods'),
  metadata_json TEXT NOT NULL,
  metadata_fingerprint TEXT NOT NULL,
  intent_fingerprint TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('creating', 'open', 'unknown', 'paid', 'rejected', 'needs_reconciliation', 'released')),
  provider_checkout_id TEXT UNIQUE,
  checkout_url TEXT,
  expires_at TEXT,
  provider_error TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX payment_intents_open_url
  ON payment_intents (day, product_url)
  WHERE state IN ('creating', 'open', 'unknown');

CREATE TABLE payment_event_identities (
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  normalized_fingerprint TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'replayed', 'needs_reconciliation', 'rejected')),
  reason TEXT,
  listing_id TEXT REFERENCES listings(id),
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_type, event_id),
  UNIQUE (payment_id),
  UNIQUE (order_id),
  UNIQUE (intent_id)
);

CREATE TABLE waffo_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  intent_id TEXT,
  payload_hash TEXT NOT NULL,
  normalized_fingerprint TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'replayed', 'needs_reconciliation', 'rejected')),
  reason TEXT,
  listing_id TEXT REFERENCES listings(id),
  received_at TEXT NOT NULL,
  UNIQUE (delivery_id, payload_hash)
);

CREATE INDEX payment_event_identities_intent
  ON payment_event_identities (intent_id);

CREATE INDEX waffo_webhook_deliveries_event
  ON waffo_webhook_deliveries (event_type, event_id);
