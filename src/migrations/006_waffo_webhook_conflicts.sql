-- Signed payload conflicts are retained without overwriting the first
-- immutable delivery/business identity. This makes a rejected replay auditable.
CREATE TABLE waffo_webhook_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  normalized_fingerprint TEXT NOT NULL,
  reason TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE (delivery_id, payload_hash)
);

CREATE INDEX waffo_webhook_conflicts_identity
  ON waffo_webhook_conflicts (event_type, event_id, payment_id, order_id);
