import { randomUUID } from "node:crypto";
import type { AppDb } from "../db.js";
import { canonicalizeProductUrl, normalizeWhyTestThisToday } from "./urls.js";

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

export type BidQuote = {
  raise: boolean;
  chargeUsd: number;
};

type CheckoutEventRow = {
  listing_id: string;
};

const LISTING_COLUMNS = `
  id, day, product_url, why_test_this_today, bid_usd, paid_usd,
  clicks, created_at, updated_at
`;

/** Polar (or the fixture) has reported paid. Unpaid drafts never rank. */
export function isPaidListing(listing: Pick<Listing, "paidUsd">): boolean {
  return Number.isInteger(listing.paidUsd) && listing.paidUsd >= 1;
}

/** Paid rows only. Unpaid or abandoned checkouts never take a rank. */
export function paidListings<T extends Pick<Listing, "paidUsd">>(
  listings: readonly T[],
): T[] {
  return listings.filter(isPaidListing);
}

export function rankListings(rows: Listing[]): Listing[] {
  return [...paidListings(rows)].sort((a, b) => {
    if (b.bidUsd !== a.bidUsd) return b.bidUsd - a.bidUsd;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export function withRanks(rows: Listing[]): RankedListing[] {
  return rankListings(rows).map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Rank a new whole-dollar bid would take among today's paid rows. */
export function rankForBid(rows: readonly Listing[], bidUsd: number): number {
  return paidListings(rows).filter((row) => row.bidUsd >= bidUsd).length + 1;
}

export function claimPriceUsd(currentBidUsd: number): number {
  return currentBidUsd + 1;
}

export function defaultClaimBidUsd(rows: readonly Listing[]): number {
  const paid = rankListings([...rows] as Listing[]);
  if (paid.length === 0) {
    return MIN_BID_USD;
  }
  return claimPriceUsd(paid[0]!.bidUsd);
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

export function findListingByDayAndUrl(
  db: AppDb,
  day: string,
  productUrl: string,
): Listing | undefined {
  const canonical = canonicalizeProductUrl(productUrl);
  const row = db
    .prepare<[string, string], ListingRow>(
      `SELECT ${LISTING_COLUMNS} FROM listings WHERE day = ? AND product_url = ?`,
    )
    .get(day, canonical);
  return row ? listingFromRow(row) : undefined;
}

export function findPaidListingByDayAndUrl(
  db: AppDb,
  day: string,
  productUrl: string,
): Listing | undefined {
  const listing = findListingByDayAndUrl(db, day, productUrl);
  return listing && isPaidListing(listing) ? listing : undefined;
}

/** Charge the full bid on first list; only `newBid - currentBid` on a same-day raise. */
export function quotePaidBid(
  existing: Pick<Listing, "bidUsd"> | undefined,
  newBidUsd: number,
): BidQuote {
  if (!Number.isInteger(newBidUsd) || newBidUsd < MIN_BID_USD) {
    throw new Error(`bid must be a whole dollar >= ${MIN_BID_USD}`);
  }
  if (!existing) {
    return { raise: false, chargeUsd: newBidUsd };
  }
  if (newBidUsd <= existing.bidUsd) {
    throw new Error("new bid must be a whole dollar strictly greater than the current bid");
  }
  return { raise: true, chargeUsd: newBidUsd - existing.bidUsd };
}

/** Polar paid lands on a leftover unpaid same-URL row. Occupancy starts at this paid instant. */
function occupyUnpaidListing(
  db: AppDb,
  leftover: Listing,
  input: { whyTestThisToday: string; bidUsd: number; paidUsd: number; paidAt: string },
): Listing {
  const occupied: Listing = {
    ...leftover,
    whyTestThisToday: input.whyTestThisToday,
    bidUsd: input.bidUsd,
    paidUsd: input.paidUsd,
    createdAt: input.paidAt,
    updatedAt: input.paidAt,
  };
  db.prepare(
    `UPDATE listings
     SET why_test_this_today = ?, bid_usd = ?, paid_usd = ?, created_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    occupied.whyTestThisToday,
    occupied.bidUsd,
    occupied.paidUsd,
    occupied.createdAt,
    occupied.updatedAt,
    occupied.id,
  );
  return occupied;
}

export function raiseBid(
  db: AppDb,
  listing: Listing,
  input: { bidUsd: number; whyTestThisToday: string; paidUsd: number; updatedAt: string },
): Listing {
  const quote = quotePaidBid(listing, input.bidUsd);
  if (quote.chargeUsd !== input.paidUsd) {
    throw new Error(`raise pays the difference only (expected $${quote.chargeUsd})`);
  }
  const raised: Listing = {
    ...listing,
    whyTestThisToday: input.whyTestThisToday,
    bidUsd: input.bidUsd,
    paidUsd: listing.paidUsd + input.paidUsd,
    updatedAt: input.updatedAt,
  };
  db.prepare(
    `UPDATE listings
     SET why_test_this_today = ?, bid_usd = ?, paid_usd = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    raised.whyTestThisToday,
    raised.bidUsd,
    raised.paidUsd,
    raised.updatedAt,
    raised.id,
  );
  return raised;
}

export function listToday(db: AppDb, day: string): RankedListing[] {
  const rows = db
    .prepare<[string], ListingRow>(
      `SELECT ${LISTING_COLUMNS} FROM listings WHERE day = ? AND paid_usd >= 1`,
    )
    .all(day);
  return withRanks(rows.map(listingFromRow));
}

/** True when a leftover unpaid Polar row exists for today or the rolling 24h. */
export function hasLeftoverUnpaid(db: AppDb, day: string, now: Date = new Date()): boolean {
  const today = db
    .prepare<[string], { n: number }>(
      `SELECT COUNT(*) AS n FROM listings WHERE day = ? AND paid_usd < 1`,
    )
    .get(day);
  if ((today?.n ?? 0) > 0) {
    return true;
  }
  const since = rollingWindowStart(now).toISOString();
  const until = now.toISOString();
  const windowed = db
    .prepare<[string, string], { n: number }>(
      `SELECT COUNT(*) AS n FROM listings
       WHERE created_at >= ? AND created_at <= ? AND paid_usd < 1`,
    )
    .get(since, until);
  return (windowed?.n ?? 0) > 0;
}

export const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Inclusive start of the rolling last-24-hours window. Not civil midnight. */
export function rollingWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - ROLLING_WINDOW_MS);
}

function listingInRollingWindow(listing: Listing, now: Date): boolean {
  const created = Date.parse(listing.createdAt);
  if (Number.isNaN(created)) {
    return false;
  }
  return created >= now.getTime() - ROLLING_WINDOW_MS && created <= now.getTime();
}

/**
 * Paid rows whose createdAt falls in the last 24 hours, ranked by bid then older.
 * A raise keeps createdAt, so the original paid time is the window key.
 */
export function listLast24h(db: AppDb, now: Date = new Date()): RankedListing[] {
  const since = rollingWindowStart(now).toISOString();
  const until = now.toISOString();
  const rows = db
    .prepare<[string, string], ListingRow>(
      `SELECT ${LISTING_COLUMNS} FROM listings
       WHERE created_at >= ? AND created_at <= ? AND paid_usd >= 1`,
    )
    .all(since, until);
  return withRanks(
    rows.map(listingFromRow).filter((row) => listingInRollingWindow(row, now) && isPaidListing(row)),
  );
}

export function placeBid(db: AppDb, input: PlaceBidInput): Listing {
  if (!Number.isInteger(input.bidUsd) || input.bidUsd < MIN_BID_USD) {
    throw new Error(`bid must be a whole dollar >= ${MIN_BID_USD}`);
  }
  const nowIso = new Date().toISOString();
  const listing: Listing = {
    id: input.id ?? randomUUID(),
    day: input.day,
    productUrl: canonicalizeProductUrl(input.productUrl),
    whyTestThisToday: normalizeWhyTestThisToday(input.whyTestThisToday),
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

/** Public hops only for Polar-paid rows. Unpaid cover never earns a click. */
export function getPaidListing(db: AppDb, id: string): Listing | undefined {
  const listing = getListing(db, id);
  return listing && isPaidListing(listing) ? listing : undefined;
}

/** Insert or raise a listing only after Polar or the fixture reports a completed payment. */
export function applyPaidBid(db: AppDb, paid: PaidBid): Listing {
  if (!Number.isInteger(paid.bidUsd) || paid.bidUsd < MIN_BID_USD) {
    throw new Error(`bid must be a whole dollar >= ${MIN_BID_USD}`);
  }
  const productUrl = canonicalizeProductUrl(paid.productUrl);
  const whyTestThisToday = normalizeWhyTestThisToday(paid.whyTestThisToday);
  return db.transaction(() => {
    const replayed = db
      .prepare<[string], CheckoutEventRow>("SELECT listing_id FROM checkout_events WHERE id = ?")
      .get(paid.sessionId);
    if (replayed) {
      const listing = getListing(db, replayed.listing_id);
      if (!listing) {
        throw new Error(`checkout ${paid.sessionId} points at a missing listing`);
      }
      return listing;
    }
    const existing = findPaidListingByDayAndUrl(db, paid.day, productUrl);
    const leftover = existing ? undefined : findListingByDayAndUrl(db, paid.day, productUrl);
    const quote = quotePaidBid(existing, paid.bidUsd);
    const charged = paid.paidUsd ?? quote.chargeUsd;
    if (charged !== quote.chargeUsd) {
      throw new Error(
        quote.raise
          ? `raise pays the difference only (expected $${quote.chargeUsd})`
          : `first bid pays the full amount (expected $${quote.chargeUsd})`,
      );
    }
    const listing = existing
      ? raiseBid(db, existing, {
          bidUsd: paid.bidUsd,
          whyTestThisToday,
          paidUsd: charged,
          updatedAt: paid.paidAt,
        })
      : leftover
        ? occupyUnpaidListing(db, leftover, {
            whyTestThisToday,
            bidUsd: paid.bidUsd,
            paidUsd: charged,
            paidAt: paid.paidAt,
          })
        : placeBid(db, {
            productUrl,
            whyTestThisToday,
            bidUsd: paid.bidUsd,
            day: paid.day,
            paidUsd: charged,
            createdAt: paid.paidAt,
            updatedAt: paid.paidAt,
          });
    db.prepare(
      "INSERT INTO checkout_events (id, listing_id, amount_usd, paid_at) VALUES (?, ?, ?, ?)",
    ).run(paid.sessionId, listing.id, charged, paid.paidAt);
    return listing;
  })();
}
