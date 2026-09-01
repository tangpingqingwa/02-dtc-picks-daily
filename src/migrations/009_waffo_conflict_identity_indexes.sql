-- Conflict rows are terminal reservations. Keep each incoming identity
-- searchable when a later delivery tries to launder one changed subset.
CREATE INDEX waffo_webhook_conflicts_delivery
  ON waffo_webhook_conflicts (delivery_id);

CREATE INDEX waffo_webhook_conflicts_intent
  ON waffo_webhook_conflicts (intent_id);

CREATE INDEX waffo_webhook_conflicts_payment
  ON waffo_webhook_conflicts (payment_id);

CREATE INDEX waffo_webhook_conflicts_order
  ON waffo_webhook_conflicts (order_id);
