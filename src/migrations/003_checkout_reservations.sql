CREATE TABLE checkout_reservations (
  id TEXT PRIMARY KEY,
  provider_session_id TEXT UNIQUE,
  listing_id TEXT REFERENCES listings(id),
  day TEXT NOT NULL,
  product_url TEXT NOT NULL,
  bid_usd INTEGER NOT NULL CHECK (bid_usd >= 5),
  charge_usd INTEGER NOT NULL CHECK (charge_usd >= 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'released')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX checkout_reservations_open_url
  ON checkout_reservations (day, product_url)
  WHERE status = 'open';

ALTER TABLE checkout_events ADD COLUMN day TEXT;
ALTER TABLE checkout_events ADD COLUMN product_url TEXT;
ALTER TABLE checkout_events ADD COLUMN bid_usd INTEGER;
