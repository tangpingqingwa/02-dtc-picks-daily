CREATE TABLE checkout_events (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  amount_usd INTEGER NOT NULL CHECK (amount_usd >= 0),
  paid_at TEXT NOT NULL
);
