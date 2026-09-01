CREATE TABLE polar_webhook_deliveries (
  webhook_id TEXT PRIMARY KEY,
  checkout_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents >= 0),
  received_at TEXT NOT NULL
);

CREATE INDEX polar_webhook_deliveries_checkout
  ON polar_webhook_deliveries (checkout_id);

CREATE INDEX polar_webhook_deliveries_order
  ON polar_webhook_deliveries (order_id);
