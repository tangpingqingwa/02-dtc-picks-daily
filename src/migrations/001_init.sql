CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  product_url TEXT NOT NULL,
  why_test_this_today TEXT NOT NULL,
  bid_usd INTEGER NOT NULL CHECK (bid_usd >= 5),
  paid_usd INTEGER NOT NULL CHECK (paid_usd >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (day, product_url)
);
