-- Signature-verified events that fail policy or shape validation are retained
-- even when one or more provider identity fields are missing. This table is
-- audit-only: it never authorizes a ranking mutation.
CREATE TABLE waffo_webhook_rejections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT,
  event_type TEXT,
  event_id TEXT,
  payment_id TEXT,
  order_id TEXT,
  intent_id TEXT,
  payload_hash TEXT NOT NULL,
  normalized_fingerprint TEXT NOT NULL,
  reason TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX waffo_webhook_rejections_delivery
  ON waffo_webhook_rejections (delivery_id);

CREATE INDEX waffo_webhook_rejections_identity
  ON waffo_webhook_rejections (event_type, event_id, payment_id, order_id, intent_id);
