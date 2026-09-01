-- Keep the exact tax amount alongside each immutable Waffo delivery and
-- business identity. Ranking remains based on the tax-exclusive subtotal.
ALTER TABLE payment_event_identities
  ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0);

ALTER TABLE waffo_webhook_deliveries
  ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0);
