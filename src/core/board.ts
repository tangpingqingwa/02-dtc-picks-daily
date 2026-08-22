import { randomUUID } from "node:crypto";
import type { AppDb } from "../db.js";

export const MIN_BID_USD = 5;

export type Listing = {
  id: string;
  day: string;
  productUrl: string;
  whyTestThisToday: string;
  bidUsd: number;
  paidUsd: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
};

export type RankedListing = Listing & { rank: number };

export type ListingRow = {
  id: string;
  day: string;
  product_url: string;
  why_test_this_today: string;
  bid_usd: number;
  paid_usd: number;
  clicks: number;
  created_at: string;
  updated_at: string;
};

export type PlaceBidInput = {
  productUrl: string;
  whyTestThisToday: string;
  bidUsd: number;
  day: string;
  paidUsd?: number;
  clicks?: number;
  createdAt?: string;
  updatedAt?: string;
  id?: string;
};

export type PaidBid = {
  sessionId: string;
  productUrl: string;
  whyTestThisToday: string;
  bidUsd: number;
  day: string;
  paidUsd?: number;
  paidAt: string;
};

type CheckoutEventRow = {
  listing_id: string;
};

const LISTING_COLUMNS = `
  id, day, product_url, why_test_this_today, bid_usd, paid_usd,
  clicks, created_at, updated_at
`;

export function rankListings(rows: Listing[]): Listing[] {
  return [...rows].sort((a, b) => {
    if (b.bidUsd !== a.bidUsd) return b.bidUsd - a.bidUsd;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export function withRanks(rows: Listing[]): RankedListing[] {
  return rankListings(rows).map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Rank a new whole-dollar bid would take among today's paid rows. */
export function rankForBid(rows: readonly Listing[], bidUsd: number): number {
  return rows.filter((row) => row.bidUsd >= bidUsd).length + 1;
}

export function claimPriceUsd(currentBidUsd: number): number {
  return currentBidUsd + 1;
}

export function defaultClaimBidUsd(rows: readonly Listing[]): number {
  if (rows.length === 0) {
    return MIN_BID_USD;
  }
  return claimPriceUsd(rows[0]!.bidUsd);
}

export function listingFromRow(row: ListingRow): Listing {
  return {
    id: row.id,
    day: row.day,
    productUrl: row.product_url,
    whyTestThisToday: row.why_test_this_today,
    bidUsd: row.bid_usd,
    paidUsd: row.paid_usd,
    clicks: row.clicks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listToday(db: AppDb, day: string): RankedListing[] {
  const rows = db
    .prepare<[string], ListingRow>(
      `SELECT ${LISTING_COLUMNS} FROM listings WHERE day = ?`,
    )
    .all(day);
  return withRanks(rows.map(listingFromRow));
}

export function placeBid(db: AppDb, input: PlaceBidInput): Listing {
  if (!Number.isInteger(input.bidUsd) || input.bidUsd < MIN_BID_USD) {
    throw new Error(`bid must be a whole dollar >= ${MIN_BID_USD}`);
  }
  const nowIso = new Date().toISOString();
  const listing: Listing = {
    id: input.id ?? randomUUID(),
    day: input.day,
    productUrl: input.productUrl,
    whyTestThisToday: input.whyTestThisToday,
    bidUsd: input.bidUsd,
    paidUsd: input.paidUsd ?? input.bidUsd,
    clicks: input.clicks ?? 0,
    createdAt: input.createdAt ?? nowIso,
    updatedAt: input.updatedAt ?? input.createdAt ?? nowIso,
  };
  db.prepare(
    `INSERT INTO listings (
      id, day, product_url, why_test_this_today, bid_usd, paid_usd,
      clicks, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    listing.id,
    listing.day,
    listing.productUrl,
    listing.whyTestThisToday,
    listing.bidUsd,
    listing.paidUsd,
    listing.clicks,
    listing.createdAt,
    listing.updatedAt,
  );
  return listing;
}

export function getListing(db: AppDb, id: string): Listing | undefined {
  const row = db
    .prepare<[string], ListingRow>(`SELECT ${LISTING_COLUMNS} FROM listings WHERE id = ?`)
    .get(id);
  return row ? listingFromRow(row) : undefined;
}

/** Insert a listing only after Polar or the fixture reports a completed payment. */
export function applyPaidBid(db: AppDb, paid: PaidBid): Listing {
  if (!Number.isInteger(paid.bidUsd) || paid.bidUsd < MIN_BID_USD) {
    throw new Error(`bid must be a whole dollar >= ${MIN_BID_USD}`);
  }
  return db.transaction(() => {
    const existing = db
      .prepare<[string], CheckoutEventRow>("SELECT listing_id FROM checkout_events WHERE id = ?")
      .get(paid.sessionId);
    if (existing) {
      const listing = getListing(db, existing.listing_id);
      if (!listing) {
        throw new Error(`checkout ${paid.sessionId} points at a missing listing`);
      }
      return listing;
    }
    const listing = placeBid(db, {
      productUrl: paid.productUrl,
      whyTestThisToday: paid.whyTestThisToday,
      bidUsd: paid.bidUsd,
      day: paid.day,
      paidUsd: paid.paidUsd ?? paid.bidUsd,
      createdAt: paid.paidAt,
      updatedAt: paid.paidAt,
    });
    db.prepare(
      "INSERT INTO checkout_events (id, listing_id, amount_usd, paid_at) VALUES (?, ?, ?, ?)",
    ).run(paid.sessionId, listing.id, paid.paidUsd ?? paid.bidUsd, paid.paidAt);
    return listing;
  })();
}
