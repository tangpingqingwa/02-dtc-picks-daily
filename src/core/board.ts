import { createHash, randomUUID } from "node:crypto";
import type { AppDb } from "../db.js";
import type { PaymentMode } from "../config.js";
import type { RejectedWebhook } from "../billing/port.js";
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
  amount_usd: number;
  paid_at: string;
  day: string | null;
  product_url: string | null;
  bid_usd: number | null;
};

export type CheckoutReservationStatus = "open" | "completed" | "released";

export type CheckoutReservation = {
  id: string;
  providerSessionId?: string;
  listingId?: string;
  day: string;
  productUrl: string;
  bidUsd: number;
  chargeUsd: number;
  status: CheckoutReservationStatus;
  createdAt: string;
  updatedAt: string;
  intentFingerprint?: string;
  metadataFingerprint?: string;
  quoteBaseBidUsd?: number;
};

type CheckoutReservationRow = {
  id: string;
  provider_session_id: string | null;
  listing_id: string | null;
  day: string;
  product_url: string;
  bid_usd: number;
  charge_usd: number;
  status: CheckoutReservationStatus;
  created_at: string;
  updated_at: string;
};

export class CheckoutReservationConflictError extends Error {
  readonly code = "CHECKOUT_RESERVATION_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "CheckoutReservationConflictError";
  }
}

export class PaidBidConflictError extends Error {
  readonly code = "PAID_BID_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "PaidBidConflictError";
  }
}

export class WaffoPaymentConflictError extends Error {
  readonly code = "WAFFO_PAYMENT_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "WaffoPaymentConflictError";
  }
}

export type WaffoPaymentSettlement = {
  deliveryId: string;
  eventType: string;
  eventId: string;
  paymentId: string;
  orderId: string;
  intentId: string;
  payloadHash: string;
  normalizedFingerprint: string;
  /** The two provider metadata fingerprints are kept distinct at the boundary. */
  intentFingerprint?: string;
  metadataFingerprint?: string;
  productId: string;
  storeId: string;
  mode: "test" | "prod";
  currency: "USD";
  subtotalCents: number;
  taxCents: number;
  amountCents: number;
  totalCents: number;
  productUrl: string;
  whyTestThisToday: string;
  bidUsd: number;
  chargeUsd: number;
  day: string;
  paidAt: string;
  /** Application receipt time used to bound provider event time. */
  receivedAt?: string;
};

export type WaffoSettlementOutcome = {
  status: "applied" | "replayed" | "needs_reconciliation" | "rejected";
  listing?: Listing;
  reason?: string;
};

const LISTING_COLUMNS = `
  id, day, product_url, why_test_this_today, bid_usd, paid_usd,
  clicks, created_at, updated_at
`;

const RESERVATION_COLUMNS =
  "id, provider_session_id, listing_id, day, product_url, bid_usd, charge_usd, status, created_at, updated_at";

export type NormalizedIntentInput = {
  day: string;
  productUrl: string;
  whyTestThisToday: string;
  targetBidCents: number;
  quoteBaseBidCents: number;
  chargeCents: number;
  expectedMode: PaymentMode;
  expectedStoreId: string;
  expectedProductId: string;
  expectedCurrency: "USD";
  expectedTaxCategory: "digital_goods";
};

export function normalizedIntentMetadata(input: NormalizedIntentInput): {
  metadataJson: string;
  metadataFingerprint: string;
  intentFingerprint: string;
} {
  const business = {
    day: input.day,
    canonicalUrl: input.productUrl,
    whyTestThisToday: input.whyTestThisToday,
    targetBidCents: input.targetBidCents,
    quoteBaseBidCents: input.quoteBaseBidCents,
    chargeCents: input.chargeCents,
  };
  const metadata = {
    ...business,
    expectedMode: input.expectedMode,
    expectedStoreId: input.expectedStoreId,
    expectedProductId: input.expectedProductId,
    expectedCurrency: input.expectedCurrency,
    expectedTaxCategory: input.expectedTaxCategory,
  };
  const metadataJson = JSON.stringify(metadata);
  const metadataFingerprint = createHash("sha256")
    .update(JSON.stringify(business))
    .digest("hex");
  const intentFingerprint = createHash("sha256").update(metadataJson).digest("hex");
  return { metadataJson, metadataFingerprint, intentFingerprint };
}

/** Stable fingerprint of both immutable intent and business metadata copies. */
export function normalizedWaffoFingerprint(
  intentFingerprint: string,
  metadataFingerprint: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([intentFingerprint, metadataFingerprint]))
    .digest("hex");
}

/** A provider (or the fixture) has reported paid. Unpaid drafts never rank. */
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
  if (
    !Number.isSafeInteger(newBidUsd) ||
    newBidUsd > Math.floor(Number.MAX_SAFE_INTEGER / 100) ||
    newBidUsd < MIN_BID_USD
  ) {
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

/** Release an attached hosted checkout once its provider expiry has passed. */
function releaseExpiredCheckoutReservations(db: AppDb, now: Date): void {
  const nowIso = now.toISOString();
  const activeIntent = `
    SELECT id FROM payment_intents
    WHERE state IN ('creating', 'open', 'unknown')
      AND expires_at IS NOT NULL
      AND expires_at <= ?`;
  db.prepare(
    `UPDATE checkout_reservations
     SET status = 'released', updated_at = ?
     WHERE status = 'open' AND id IN (${activeIntent})`,
  ).run(nowIso, nowIso);
  db.prepare(
    `UPDATE payment_intents
     SET state = 'released',
         provider_error = COALESCE(provider_error, 'checkout session expired'),
         updated_at = ?
     WHERE state IN ('creating', 'open', 'unknown')
       AND expires_at IS NOT NULL
       AND expires_at <= ?`,
  ).run(nowIso, nowIso);
}

export function reserveCheckout(
  db: AppDb,
  input: {
    productUrl: string;
    bidUsd: number;
    day: string;
    whyTestThisToday?: string;
    expectedMode?: PaymentMode;
    expectedStoreId?: string;
    expectedProductId?: string;
    expectedCurrency?: "USD";
    expectedTaxCategory?: "digital_goods";
    now?: Date;
  },
): CheckoutReservation {
  const productUrl = canonicalizeProductUrl(input.productUrl);
  try {
    const transaction = db.transaction(() => {
      releaseExpiredCheckoutReservations(db, input.now ?? new Date());
      const open = db
        .prepare<[string, string], { id: string }>(
          "SELECT id FROM checkout_reservations WHERE day = ? AND product_url = ? AND status = 'open'",
        )
        .get(input.day, productUrl);
      if (open) {
        throw new CheckoutReservationConflictError(
          "checkout already in progress for this product today",
        );
      }
      const existing = findPaidListingByDayAndUrl(db, input.day, productUrl);
      const quote = quotePaidBid(existing, input.bidUsd);
      const nowIso = (input.now ?? new Date()).toISOString();
      const whyTestThisToday = normalizeWhyTestThisToday(
        input.whyTestThisToday ?? "Local checkout intent",
      );
      const expectedMode = input.expectedMode ?? "fixture";
      const expectedStoreId = input.expectedStoreId ?? "fixture";
      const expectedProductId = input.expectedProductId ?? "fixture";
      const expectedCurrency = input.expectedCurrency ?? "USD";
      const expectedTaxCategory = input.expectedTaxCategory ?? "digital_goods";
      const quoteBaseBidUsd = existing?.bidUsd ?? 0;
      const intentMetadata = normalizedIntentMetadata({
        day: input.day,
        productUrl,
        whyTestThisToday,
        targetBidCents: input.bidUsd * 100,
        quoteBaseBidCents: quoteBaseBidUsd * 100,
        chargeCents: quote.chargeUsd * 100,
        expectedMode,
        expectedStoreId,
        expectedProductId,
        expectedCurrency,
        expectedTaxCategory,
      });
      const intentId = randomUUID();
      const reservation: CheckoutReservation = {
        id: intentId,
        day: input.day,
        productUrl,
        bidUsd: input.bidUsd,
        chargeUsd: quote.chargeUsd,
        status: "open",
        createdAt: nowIso,
        updatedAt: nowIso,
        intentFingerprint: intentMetadata.intentFingerprint,
        metadataFingerprint: intentMetadata.metadataFingerprint,
        quoteBaseBidUsd,
      };
      db.prepare(
        "INSERT INTO checkout_reservations (id, day, product_url, bid_usd, charge_usd, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)",
      ).run(
        reservation.id,
        reservation.day,
        reservation.productUrl,
        reservation.bidUsd,
        reservation.chargeUsd,
        reservation.createdAt,
        reservation.updatedAt,
      );
      db.prepare(
        `INSERT INTO payment_intents (
          id, day, product_url, why_test_this_today, target_bid_cents,
          quote_base_bid_cents, charge_cents, expected_mode, expected_store_id,
          expected_product_id, expected_currency, expected_tax_category,
          metadata_json, metadata_fingerprint, intent_fingerprint, state,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?)`,
      ).run(
        reservation.id,
        input.day,
        productUrl,
        whyTestThisToday,
        input.bidUsd * 100,
        quoteBaseBidUsd * 100,
        quote.chargeUsd * 100,
        expectedMode,
        expectedStoreId,
        expectedProductId,
        expectedCurrency,
        expectedTaxCategory,
        intentMetadata.metadataJson,
        intentMetadata.metadataFingerprint,
        intentMetadata.intentFingerprint,
        nowIso,
        nowIso,
      );
      return reservation;
    });
    return transaction.immediate();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("checkout_reservations.day, checkout_reservations.product_url") ||
        error.message.includes("payment_intents.day, payment_intents.product_url"))
    ) {
      throw new CheckoutReservationConflictError(
        "checkout already in progress for this product today",
      );
    }
    throw error;
  }
}

export function attachCheckoutReservation(
  db: AppDb,
  reservationId: string,
  providerSessionId: string,
  attachment: { checkoutUrl?: string; expiresAt?: string } = {},
): void {
  db.transaction(() => {
    const reservation = db
      .prepare<[string], CheckoutReservationRow>(
        "SELECT " + RESERVATION_COLUMNS + " FROM checkout_reservations WHERE id = ?",
      )
      .get(reservationId);
    if (!reservation) {
      throw new CheckoutReservationConflictError("checkout reservation is missing");
    }
    if (
      reservation.status === "completed" &&
      reservation.provider_session_id === providerSessionId
    ) {
      return;
    }
    if (reservation.status !== "open") {
      throw new CheckoutReservationConflictError("checkout reservation is no longer open");
    }
    if (
      reservation.provider_session_id !== null &&
      reservation.provider_session_id !== providerSessionId
    ) {
      throw new CheckoutReservationConflictError("checkout reservation has another provider session");
    }
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "UPDATE checkout_reservations SET provider_session_id = ?, updated_at = ? WHERE id = ? AND status = 'open'",
      )
      .run(providerSessionId, now, reservationId);
    if (result.changes !== 1) {
      throw new CheckoutReservationConflictError("checkout reservation is no longer open");
    }
    db.prepare(
      `UPDATE payment_intents
       SET provider_checkout_id = ?, checkout_url = COALESCE(?, checkout_url),
           expires_at = COALESCE(?, expires_at), state = 'open', updated_at = ?
       WHERE id = ? AND state IN ('creating', 'open', 'unknown')`,
    ).run(
      providerSessionId,
      attachment.checkoutUrl ?? null,
      attachment.expiresAt ?? null,
      now,
      reservationId,
    );
  })();
}

export function releaseCheckoutReservation(db: AppDb, reservationId: string): void {
  db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE checkout_reservations SET status = 'released', updated_at = ? WHERE id = ? AND status = 'open'",
    ).run(now, reservationId);
    db.prepare(
      "UPDATE payment_intents SET state = 'released', updated_at = ? WHERE id = ? AND state IN ('creating', 'open', 'unknown')",
    ).run(now, reservationId);
  })();
}

export function markCheckoutProviderUnknown(
  db: AppDb,
  reservationId: string,
  message: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE payment_intents
     SET state = 'unknown', provider_error = ?, updated_at = ?
     WHERE id = ? AND state IN ('creating', 'open', 'unknown')`,
  ).run(message, now, reservationId);
}

export function markCheckoutProviderRejected(
  db: AppDb,
  reservationId: string,
  message: string,
): void {
  db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE payment_intents SET state = 'rejected', provider_error = ?, updated_at = ? WHERE id = ? AND state IN ('creating', 'open', 'unknown')",
    ).run(message, now, reservationId);
    db.prepare(
      "UPDATE checkout_reservations SET status = 'released', updated_at = ? WHERE id = ? AND status = 'open'",
    ).run(now, reservationId);
  })();
}

function findCheckoutReservationForPaid(
  db: AppDb,
  paid: PaidBid,
  productUrl: string,
): CheckoutReservationRow | undefined {
  const bySession = db
    .prepare<[string], CheckoutReservationRow>(
      "SELECT " + RESERVATION_COLUMNS + " FROM checkout_reservations WHERE provider_session_id = ?",
    )
    .get(paid.sessionId);
  if (bySession) {
    return bySession;
  }
  return db
    .prepare<[string, string], CheckoutReservationRow>(
      "SELECT " +
        RESERVATION_COLUMNS +
        " FROM checkout_reservations WHERE status = 'open' AND provider_session_id IS NULL AND day = ? AND product_url = ?",
    )
    .get(paid.day, productUrl);
}

function assertReservationMatches(
  reservation: CheckoutReservationRow,
  paid: PaidBid,
  productUrl: string,
  charged: number,
): void {
  if (reservation.status !== "open") {
    throw new PaidBidConflictError(
      "checkout " + paid.sessionId + " reservation is " + reservation.status,
    );
  }
  if (
    reservation.day !== paid.day ||
    reservation.product_url !== productUrl ||
    reservation.bid_usd !== paid.bidUsd ||
    reservation.charge_usd !== charged
  ) {
    throw new PaidBidConflictError(
      "checkout " + paid.sessionId + " does not match its reserved bid",
    );
  }
}

function bindCheckoutReservation(
  db: AppDb,
  reservation: CheckoutReservationRow,
  providerSessionId: string,
): CheckoutReservationRow {
  if (reservation.provider_session_id === providerSessionId) {
    return reservation;
  }
  if (reservation.provider_session_id !== null) {
    throw new PaidBidConflictError(
      "checkout " + providerSessionId + " has another reservation",
    );
  }
  const result = db
    .prepare(
      "UPDATE checkout_reservations SET provider_session_id = ?, updated_at = ? WHERE id = ? AND status = 'open'",
    )
    .run(providerSessionId, new Date().toISOString(), reservation.id);
  if (result.changes !== 1) {
    throw new PaidBidConflictError("checkout reservation is no longer open");
  }
  return { ...reservation, provider_session_id: providerSessionId };
}

function completeCheckoutReservation(
  db: AppDb,
  reservation: CheckoutReservationRow,
  listingId: string,
  paidAt: string,
): void {
  const result = db
    .prepare(
      "UPDATE checkout_reservations SET status = 'completed', listing_id = ?, updated_at = ? WHERE id = ? AND status = 'open'",
    )
    .run(listingId, paidAt, reservation.id);
  if (result.changes !== 1) {
    throw new PaidBidConflictError("checkout reservation is no longer open");
  }
  db.prepare(
    "UPDATE payment_intents SET state = 'paid', paid_at = ?, updated_at = ? WHERE id = ? AND state IN ('creating', 'open', 'unknown')",
  ).run(paidAt, paidAt, reservation.id);
}

function assertReplayedEventMatches(
  event: CheckoutEventRow,
  listing: Listing,
  paid: PaidBid,
  productUrl: string,
): void {
  const eventDay = event.day ?? listing.day;
  const eventUrl = event.product_url ?? listing.productUrl;
  if (eventDay !== paid.day || eventUrl !== productUrl) {
    throw new PaidBidConflictError(
      "checkout " + paid.sessionId + " was already applied to another payment",
    );
  }
  if (event.bid_usd !== null && event.bid_usd !== paid.bidUsd) {
    throw new PaidBidConflictError(
      "checkout " + paid.sessionId + " was already applied at another bid",
    );
  }
  if (paid.paidUsd !== undefined && event.amount_usd !== paid.paidUsd) {
    throw new PaidBidConflictError(
      "checkout " + paid.sessionId + " was already applied at another amount",
    );
  }
}

/** A paid provider event lands on a leftover unpaid same-URL row. Occupancy starts at this paid instant. */
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

/** True when a leftover unpaid provider row exists for today or the rolling 24h. */
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
  if (
    !Number.isSafeInteger(input.bidUsd) ||
    input.bidUsd > Math.floor(Number.MAX_SAFE_INTEGER / 100) ||
    input.bidUsd < MIN_BID_USD
  ) {
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

/** Public hops only for paid rows. Unpaid cover never earns a click. */
export function getPaidListing(db: AppDb, id: string): Listing | undefined {
  const listing = getListing(db, id);
  return listing && isPaidListing(listing) ? listing : undefined;
}

/** Insert or raise a listing only after Waffo or the fixture reports payment. */
export function applyPaidBid(db: AppDb, paid: PaidBid): Listing {
  return db.transaction(() => applyPaidBidInTransaction(db, paid))();
}

function applyPaidBidInTransaction(
  db: AppDb,
  paid: PaidBid,
  options: { reservation?: CheckoutReservationRow; eventId?: string } = {},
): Listing {
  if (
    !Number.isSafeInteger(paid.bidUsd) ||
    paid.bidUsd > Math.floor(Number.MAX_SAFE_INTEGER / 100) ||
    paid.bidUsd < MIN_BID_USD
  ) {
    throw new Error(`bid must be a whole dollar >= ${MIN_BID_USD}`);
  }
  const productUrl = canonicalizeProductUrl(paid.productUrl);
  const whyTestThisToday = normalizeWhyTestThisToday(paid.whyTestThisToday);
  const eventId = options.eventId ?? paid.sessionId;
    const replayed = db
      .prepare<[string], CheckoutEventRow>(
        "SELECT listing_id, amount_usd, paid_at, day, product_url, bid_usd FROM checkout_events WHERE id = ?",
      )
      .get(eventId);
    if (replayed) {
      const listing = getListing(db, replayed.listing_id);
      if (!listing) {
        throw new Error(`checkout ${eventId} points at a missing listing`);
      }
      assertReplayedEventMatches(replayed, listing, paid, productUrl);
      return listing;
    }
    let reservation = options.reservation ?? findCheckoutReservationForPaid(db, paid, productUrl);
    const existing = findPaidListingByDayAndUrl(db, paid.day, productUrl);
    const leftover = existing ? undefined : findListingByDayAndUrl(db, paid.day, productUrl);
    let quote: BidQuote;
    try {
      quote = quotePaidBid(existing, paid.bidUsd);
    } catch (error) {
      throw new PaidBidConflictError(error instanceof Error ? error.message : "paid bid conflict");
    }
    const charged = paid.paidUsd ?? quote.chargeUsd;
    if (charged !== quote.chargeUsd) {
      throw new PaidBidConflictError(
        quote.raise
          ? `raise pays the difference only (expected $${quote.chargeUsd})`
          : `first bid pays the full amount (expected $${quote.chargeUsd})`,
      );
    }
    if (reservation) {
      assertReservationMatches(reservation, paid, productUrl, charged);
      if (!options.reservation) {
        reservation = bindCheckoutReservation(db, reservation, paid.sessionId);
      }
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
      "INSERT INTO checkout_events (id, listing_id, amount_usd, paid_at, day, product_url, bid_usd) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      eventId,
      listing.id,
      charged,
      paid.paidAt,
      paid.day,
      productUrl,
      paid.bidUsd,
    );
    if (reservation) {
      completeCheckoutReservation(db, reservation, listing.id, paid.paidAt);
    }
    return listing;
}

type PaymentIntentRow = {
  id: string;
  day: string;
  product_url: string;
  why_test_this_today: string;
  target_bid_cents: number;
  quote_base_bid_cents: number;
  charge_cents: number;
  expected_mode: PaymentMode;
  expected_store_id: string;
  expected_product_id: string;
  expected_currency: "USD";
  expected_tax_category: "digital_goods";
  metadata_json: string;
  metadata_fingerprint: string;
  intent_fingerprint: string;
  state: "creating" | "open" | "unknown" | "paid" | "rejected" | "needs_reconciliation" | "released";
  provider_checkout_id: string | null;
  checkout_url: string | null;
  expires_at: string | null;
  provider_error: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentIdentityRow = {
  event_type: string;
  event_id: string;
  payment_id: string;
  order_id: string;
  intent_id: string;
  payload_hash: string;
  normalized_fingerprint: string;
  tax_cents: number;
  outcome: WaffoSettlementOutcome["status"];
  reason: string | null;
  listing_id: string | null;
  paid_at: string | null;
};

type WaffoDeliveryRow = {
  delivery_id: string;
  event_type: string;
  event_id: string;
  payment_id: string;
  order_id: string;
  intent_id: string | null;
  payload_hash: string;
  normalized_fingerprint: string;
  tax_cents: number;
  outcome: WaffoSettlementOutcome["status"];
  reason: string | null;
  listing_id: string | null;
};

type WaffoRejectionRow = {
  delivery_id: string | null;
  event_type: string | null;
  event_id: string | null;
  payment_id: string | null;
  order_id: string | null;
  intent_id: string | null;
  payload_hash: string;
  normalized_fingerprint: string;
  reason: string;
};

type WaffoConflictRow = {
  id: number;
  delivery_id: string;
  event_type: string;
  event_id: string;
  payment_id: string;
  order_id: string;
  intent_id: string;
  payload_hash: string;
  normalized_fingerprint: string;
  reason: string;
};

export function findPaymentIntent(db: AppDb, intentId: string): PaymentIntentRow | undefined {
  return db
    .prepare<[string], PaymentIntentRow>(
      `SELECT id, day, product_url, why_test_this_today, target_bid_cents,
              quote_base_bid_cents, charge_cents, expected_mode, expected_store_id,
              expected_product_id, expected_currency, expected_tax_category,
              metadata_json, metadata_fingerprint, intent_fingerprint, state,
              provider_checkout_id, checkout_url, expires_at, provider_error,
              paid_at, created_at, updated_at
       FROM payment_intents WHERE id = ?`,
    )
    .get(intentId);
}

/**
 * Persist a signature-verified Waffo policy/shape rejection. Complete
 * identities reserve the normal delivery/business ledgers; events with a
 * missing identity use the partial rejection ledger and can never later
 * settle under the same delivery or business identifiers.
 */
export function recordWaffoWebhookRejection(
  db: AppDb,
  rejection: RejectedWebhook,
): WaffoSettlementOutcome {
  const eventType = rejection.eventType ?? "order.completed";
  const transaction = db.transaction((): WaffoSettlementOutcome => {
    // A signed completed event that cannot be parsed is still a terminal fact
    // about the attached local intent. Move it out of open before recording the
    // rejection so the browser cannot advertise a checkout that can never be
    // corrected under the consumed identity.
    if (eventType === "order.completed" && rejection.intentId) {
      markIntentNeedsReconciliation(
        db,
        rejection.intentId,
        `Waffo payment needs reconciliation: ${rejection.reason}`,
      );
    }

    const priorConflicts = findWaffoConflicts(db, rejection);
    const exactConflict = priorConflicts.find((row) => sameWaffoConflict(row, rejection));
    if (exactConflict) {
      return { status: "replayed", reason: exactConflict.reason };
    }
    if (priorConflicts.length > 0) {
      const reason = "Waffo rejected identity was already reserved by a different signed payload";
      if (
        rejection.deliveryId &&
        rejection.eventId &&
        rejection.paymentId &&
        rejection.orderId &&
        rejection.intentId
      ) {
        recordWaffoConflictIdentity(db, {
          deliveryId: rejection.deliveryId,
          eventType,
          eventId: rejection.eventId,
          paymentId: rejection.paymentId,
          orderId: rejection.orderId,
          intentId: rejection.intentId,
          payloadHash: rejection.payloadHash,
          normalizedFingerprint: rejection.normalizedFingerprint,
          taxCents: rejection.taxCents ?? 0,
        }, reason);
      } else {
        insertWaffoRejection(db, rejection, eventType, reason);
      }
      return { status: "rejected", reason };
    }

    const priorPartials = findWaffoRejections(db, rejection);
    const priorPartial = priorPartials.find((row) => sameWaffoRejection(row, rejection)) ?? priorPartials[0];
    if (priorPartial) {
      if (sameWaffoRejection(priorPartial, rejection)) {
        return { status: "replayed", reason: priorPartial.reason };
      }
      const reason = "Waffo rejected identity was reused for a different signed payload";
      if (
        rejection.deliveryId &&
        rejection.eventId &&
        rejection.paymentId &&
        rejection.orderId &&
        rejection.intentId
      ) {
        recordWaffoConflictIdentity(db, {
          deliveryId: rejection.deliveryId,
          eventType,
          eventId: rejection.eventId,
          paymentId: rejection.paymentId,
          orderId: rejection.orderId,
          intentId: rejection.intentId,
          payloadHash: rejection.payloadHash,
          normalizedFingerprint: rejection.normalizedFingerprint,
          taxCents: rejection.taxCents ?? 0,
        }, reason);
      } else {
        insertWaffoRejection(db, rejection, eventType, reason);
      }
      return { status: "rejected", reason };
    }

    if (
      !rejection.deliveryId ||
      !rejection.eventId ||
      !rejection.paymentId ||
      !rejection.orderId ||
      !rejection.intentId
    ) {
      insertWaffoRejection(db, rejection, eventType, rejection.reason);
      return { status: "rejected", reason: rejection.reason };
    }

    const identity = {
      deliveryId: rejection.deliveryId,
      eventType,
      eventId: rejection.eventId,
      paymentId: rejection.paymentId,
      orderId: rejection.orderId,
      intentId: rejection.intentId,
      payloadHash: rejection.payloadHash,
      normalizedFingerprint: rejection.normalizedFingerprint,
      taxCents: rejection.taxCents ?? 0,
    };
    const priorDelivery = findWaffoDelivery(db, identity.deliveryId);
    if (priorDelivery) {
      if (sameWaffoRejectedIdentity(priorDelivery, identity)) {
        return { status: "replayed", reason: priorDelivery.reason ?? undefined };
      }
      const reason = "Waffo delivery id was already used for a different signed payload";
      recordWaffoConflictIdentity(db, identity, reason);
      return { status: "rejected", reason };
    }
    const priorBusiness = findWaffoBusinessDelivery(db, identity);
    if (priorBusiness) {
      if (sameWaffoBusinessIdentity(priorBusiness, identity)) {
        recordWaffoRejectedDelivery(db, identity, "replayed", priorBusiness.reason ?? undefined);
        return { status: "replayed", reason: priorBusiness.reason ?? undefined };
      }
      const reason = "Waffo payment/order identity was already used for a different signed payload";
      recordWaffoConflictIdentity(db, identity, reason);
      return { status: "rejected", reason };
    }
    const priorIdentity = findWaffoIdentity(db, identity);
    if (priorIdentity) {
      if (sameWaffoBusinessIdentity(priorIdentity, identity)) {
        recordWaffoRejectedDelivery(db, identity, "replayed", priorIdentity.reason ?? undefined);
        return { status: "replayed", reason: priorIdentity.reason ?? undefined };
      }
      const reason = "Waffo business/payment/order identity was already used for a different signed payload";
      recordWaffoConflictIdentity(db, identity, reason);
      return { status: "rejected", reason };
    }

    recordWaffoRejectedIdentity(db, identity, rejection.reason);
    recordWaffoRejectedDelivery(db, identity, "rejected", rejection.reason);
    return { status: "rejected", reason: rejection.reason };
  });
  return transaction.immediate();
}

/**
 * Settle one verified Waffo order inside the same SQLite transaction as the
 * immutable event ledger, intent transition, checkout event, and listing.
 */
export function settleWaffoPayment(
  db: AppDb,
  event: WaffoPaymentSettlement & { quoteBaseBidCents?: number },
): WaffoSettlementOutcome {
  const transaction = db.transaction((): WaffoSettlementOutcome => {
    const priorConflicts = findWaffoConflicts(db, event);
    const exactConflict = priorConflicts.find((row) => sameWaffoConflict(row, event));
    if (exactConflict) {
      return { status: "replayed", reason: exactConflict.reason };
    }
    if (priorConflicts.length > 0) {
      const reason = "Waffo identity was already reserved by a different signed payload";
      recordWaffoConflict(db, event, reason);
      return { status: "rejected", reason };
    }

    const priorPartials = findWaffoRejections(db, event);
    const priorPartial = priorPartials.find((row) => sameWaffoRejection(row, event)) ?? priorPartials[0];
    if (priorPartial) {
      const reason = "Waffo event was previously rejected and cannot be corrected under this identity";
      if (sameWaffoRejection(priorPartial, event)) {
        return { status: "replayed", reason: priorPartial.reason };
      }
      recordWaffoConflict(db, event, reason);
      return { status: "rejected", reason };
    }
    const existingDelivery = findWaffoDelivery(db, event.deliveryId);
    if (existingDelivery) {
      if (!sameWaffoDelivery(existingDelivery, event)) {
        const reason = "Waffo delivery id was already used for a different signed payload";
        recordWaffoConflict(db, event, reason);
        return { status: "rejected", reason };
      }
      return {
        status: "replayed",
        reason: existingDelivery.reason ?? undefined,
      };
    }

    const priorDelivery = findWaffoBusinessDelivery(db, event);
    if (priorDelivery) {
      if (!sameWaffoBusinessIdentity(priorDelivery, event)) {
        const reason = "Waffo payment/order identity was already used for a different signed payload";
        recordWaffoConflict(db, event, reason);
        return { status: "rejected", reason };
      }
      recordWaffoDelivery(db, event, "replayed", priorDelivery.reason ?? undefined);
      return { status: "replayed", reason: priorDelivery.reason ?? undefined };
    }

    const priorIdentity = findWaffoIdentity(db, event);
    if (priorIdentity) {
      if (!sameWaffoBusinessIdentity(priorIdentity, event)) {
        const reason = "Waffo business/payment/order identity was already used for a different signed payload";
        recordWaffoConflict(db, event, reason);
        return { status: "rejected", reason };
      }
      recordWaffoDelivery(db, event, "replayed", priorIdentity.reason ?? undefined);
      return { status: "replayed", reason: priorIdentity.reason ?? undefined };
    }

    const intent = findPaymentIntent(db, event.intentId);
    if (!intent) {
      const reason = "Waffo order is not attached to a known immutable local intent";
      // A fully identified, signature-valid event is terminal even when the
      // local intent is missing. Reserve every identity we have so a later
      // checkout or a newly-created business event cannot reinterpret this
      // captured payment as an authorized ranking.
      recordWaffoIdentity(db, event, "rejected", reason);
      recordWaffoDelivery(db, event, "rejected", reason);
      return { status: "rejected", reason };
    }

    const timestampMismatch = waffoProviderTimestampMismatch(intent, event);
    if (timestampMismatch) {
      const reason = `Waffo payment needs reconciliation: ${timestampMismatch}`;
      markIntentNeedsReconciliation(db, intent.id, reason);
      recordWaffoIdentity(db, event, "needs_reconciliation", reason);
      recordWaffoDelivery(db, event, "needs_reconciliation", reason);
      return { status: "needs_reconciliation", reason };
    }

    const mismatch = waffoIntentMismatch(intent, event);
    if (mismatch) {
      const reason = `Waffo payment needs reconciliation: ${mismatch}`;
      markIntentNeedsReconciliation(db, intent.id, reason);
      recordWaffoIdentity(db, event, "needs_reconciliation", reason);
      recordWaffoDelivery(db, event, "needs_reconciliation", reason);
      return { status: "needs_reconciliation", reason };
    }

    const reservation = db
      .prepare<[string], CheckoutReservationRow>(
        "SELECT " + RESERVATION_COLUMNS + " FROM checkout_reservations WHERE id = ?",
      )
      .get(intent.id);
    if (!reservation || reservation.status !== "open") {
      const reason = "Waffo payment has no open local reservation";
      markIntentNeedsReconciliation(db, intent.id, reason);
      recordWaffoIdentity(db, event, "needs_reconciliation", reason);
      recordWaffoDelivery(db, event, "needs_reconciliation", reason);
      return { status: "needs_reconciliation", reason };
    }

    const existing = findPaidListingByDayAndUrl(db, event.day, event.productUrl);
    let quote: BidQuote;
    try {
      quote = quotePaidBid(existing, event.bidUsd);
    } catch (error) {
      const reason = `Waffo payment needs reconciliation: ${error instanceof Error ? error.message : "current board quote is stale"}`;
      markIntentNeedsReconciliation(db, intent.id, reason);
      recordWaffoIdentity(db, event, "needs_reconciliation", reason);
      recordWaffoDelivery(db, event, "needs_reconciliation", reason);
      return { status: "needs_reconciliation", reason };
    }
    if (
      quote.chargeUsd * 100 !== intent.charge_cents ||
      (event.quoteBaseBidCents ?? intent.quote_base_bid_cents) !== intent.quote_base_bid_cents
    ) {
      const reason = "Waffo payment needs reconciliation: the captured quote is stale";
      markIntentNeedsReconciliation(db, intent.id, reason);
      recordWaffoIdentity(db, event, "needs_reconciliation", reason);
      recordWaffoDelivery(db, event, "needs_reconciliation", reason);
      return { status: "needs_reconciliation", reason };
    }

    const listing = applyPaidBidInTransaction(
      db,
      {
        sessionId: event.paymentId,
        productUrl: event.productUrl,
        whyTestThisToday: event.whyTestThisToday,
        bidUsd: event.bidUsd,
        day: event.day,
        paidUsd: event.chargeUsd,
        paidAt: event.paidAt,
      },
      { reservation, eventId: event.paymentId },
    );
    recordWaffoIdentity(db, event, "applied", undefined, listing.id);
    recordWaffoDelivery(db, event, "applied", undefined, listing.id);
    return { status: "applied", listing };
  });
  return transaction.immediate();
}

function waffoIntentMismatch(
  intent: PaymentIntentRow,
  event: WaffoPaymentSettlement & { quoteBaseBidCents?: number },
): string | undefined {
  if (intent.state === "needs_reconciliation") {
    return "intent is already awaiting reconciliation";
  }
  if (intent.state === "paid" || intent.state === "released" || intent.state === "rejected") {
    return "intent is not payable";
  }
  if (intent.expected_mode !== `waffo-${event.mode}`) return "provider mode differs from the intent";
  if (intent.expected_store_id !== event.storeId) return "store differs from the intent";
  if (intent.expected_product_id !== event.productId) return "product differs from the intent";
  if (intent.expected_currency !== event.currency) return "currency differs from the intent";
  if (event.intentFingerprint !== undefined) {
    if (intent.intent_fingerprint !== event.intentFingerprint) {
      return "intent fingerprint differs from the intent";
    }
  } else if (
    intent.intent_fingerprint !== event.normalizedFingerprint &&
    intent.metadata_fingerprint !== event.normalizedFingerprint
  ) {
    return "intent fingerprint differs from the intent";
  }
  if (
    event.metadataFingerprint !== undefined &&
    intent.metadata_fingerprint !== event.metadataFingerprint
  ) {
    return "metadata fingerprint differs from the intent";
  }
  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeProductUrl(event.productUrl);
  } catch {
    return "canonical URL is invalid";
  }
  if (intent.product_url !== canonicalUrl) return "canonical URL differs from the intent";
  if (intent.day !== event.day) return "board day differs from the intent";
  let normalizedWhy: string;
  try {
    normalizedWhy = normalizeWhyTestThisToday(event.whyTestThisToday);
  } catch {
    return "why-test text is invalid";
  }
  if (intent.why_test_this_today !== normalizedWhy) {
    return "why-test text differs from the intent";
  }
  if (intent.target_bid_cents !== event.bidUsd * 100) return "target bid differs from the intent";
  if (intent.charge_cents !== event.chargeUsd * 100) return "charge differs from the intent";
  if (event.subtotalCents !== intent.charge_cents) {
    return "order subtotal differs from the intent";
  }
  // Waffo's subtotal is tax-exclusive, while amount/total are the buyer-facing
  // tax-inclusive amount. Enforce the exact cents relation so contradictory
  // tax representations cannot rank. Ranking still uses the immutable
  // subtotal/charge, never the tax-inclusive total.
  if (!Number.isSafeInteger(event.taxCents) || event.taxCents < 0) {
    return "order tax differs from the intent";
  }
  if (event.totalCents !== event.subtotalCents + event.taxCents) {
    return "order total differs from subtotal plus tax";
  }
  if (event.amountCents !== event.subtotalCents && event.amountCents !== event.totalCents) {
    return "order amount differs from subtotal and total";
  }
  return undefined;
}

function markIntentNeedsReconciliation(db: AppDb, intentId: string, reason: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE payment_intents SET state = 'needs_reconciliation', provider_error = ?, updated_at = ?
     WHERE id = ? AND state IN ('creating', 'open', 'unknown', 'needs_reconciliation')`,
  ).run(reason, now, intentId);
  // A captured-but-unsafe event must not leave the same local product locked
  // behind an open checkout that can never be settled by a corrected payload.
  db.prepare(
    "UPDATE checkout_reservations SET status = 'released', updated_at = ? WHERE id = ? AND status = 'open'",
  ).run(now, intentId);
}

const WAFFO_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const WAFFO_EVENT_MAX_FUTURE_MS = 5 * 60 * 1_000;

function waffoProviderTimestampMismatch(
  intent: PaymentIntentRow,
  event: WaffoPaymentSettlement & { quoteBaseBidCents?: number },
): string | undefined {
  if (!isCanonicalUtcTimestamp(event.paidAt)) {
    return "provider event timestamp is not canonical UTC";
  }
  if (event.receivedAt !== undefined && !isCanonicalUtcTimestamp(event.receivedAt)) {
    return "provider receipt timestamp is not canonical UTC";
  }
  const paidMs = Date.parse(event.paidAt);
  const receiptMs = event.receivedAt === undefined ? Date.now() : Date.parse(event.receivedAt);
  if (!Number.isFinite(paidMs) || !Number.isFinite(receiptMs)) {
    return "provider event timestamp is not canonical UTC";
  }
  if (paidMs > receiptMs + WAFFO_EVENT_MAX_FUTURE_MS) {
    return "provider event timestamp is implausibly in the future";
  }
  if (paidMs < receiptMs - WAFFO_EVENT_MAX_AGE_MS) {
    return "provider event timestamp is too stale for this receipt";
  }
  const createdMs = Date.parse(intent.created_at);
  if (!Number.isFinite(createdMs)) {
    return "local intent creation timestamp is invalid";
  }
  if (paidMs < createdMs) {
    return "provider event predates the local intent";
  }
  if (intent.expires_at !== null) {
    const expiresMs = Date.parse(intent.expires_at);
    if (Number.isFinite(expiresMs) && paidMs > expiresMs) {
      return "provider event arrived after the checkout expiry";
    }
  }
  return undefined;
}

function isCanonicalUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function findWaffoDelivery(db: AppDb, deliveryId: string): WaffoDeliveryRow | undefined {
  return db
    .prepare<[string], WaffoDeliveryRow>(
      `SELECT delivery_id, event_type, event_id, payment_id, order_id, intent_id,
              payload_hash, normalized_fingerprint, tax_cents, outcome, reason, listing_id
       FROM waffo_webhook_deliveries WHERE delivery_id = ?`,
    )
    .get(deliveryId);
}

function findWaffoBusinessDelivery(
  db: AppDb,
  event: Pick<WaffoPaymentSettlement, "eventType" | "eventId" | "paymentId" | "orderId">,
): WaffoDeliveryRow | undefined {
  return db
    .prepare<[string, string, string, string], WaffoDeliveryRow>(
      `SELECT delivery_id, event_type, event_id, payment_id, order_id, intent_id,
              payload_hash, normalized_fingerprint, tax_cents, outcome, reason
       FROM waffo_webhook_deliveries
       WHERE (event_type = ? AND event_id = ?) OR payment_id = ? OR order_id = ?
       LIMIT 1`,
    )
    .get(event.eventType, event.eventId, event.paymentId, event.orderId);
}

function findWaffoIdentity(
  db: AppDb,
  event: Pick<WaffoPaymentSettlement, "eventType" | "eventId" | "paymentId" | "orderId" | "intentId">,
): PaymentIdentityRow | undefined {
  return db
    .prepare<[string, string, string, string, string], PaymentIdentityRow>(
      `SELECT event_type, event_id, payment_id, order_id, intent_id,
              payload_hash, normalized_fingerprint, tax_cents, outcome, reason, listing_id, paid_at
       FROM payment_event_identities
       WHERE (event_type = ? AND event_id = ?) OR payment_id = ? OR order_id = ? OR intent_id = ?
       LIMIT 1`,
    )
    .get(event.eventType, event.eventId, event.paymentId, event.orderId, event.intentId);
}

/** A reused delivery ID is immutable: every signed byte identity must match. */
function sameWaffoDelivery(
  previous: WaffoDeliveryRow | PaymentIdentityRow,
  event: Pick<
    WaffoPaymentSettlement,
    "eventType" | "eventId" | "paymentId" | "orderId" | "intentId" | "payloadHash" | "normalizedFingerprint" | "taxCents"
  >,
): boolean {
  return (
    previous.event_type === event.eventType &&
    previous.event_id === event.eventId &&
    previous.payment_id === event.paymentId &&
    previous.order_id === event.orderId &&
    (previous.intent_id ?? event.intentId) === event.intentId &&
    previous.payload_hash === event.payloadHash &&
    previous.normalized_fingerprint === event.normalizedFingerprint &&
    previous.tax_cents === event.taxCents
  );
}

/** A provider retry may get a new delivery ID, but never a new business event. */
function sameWaffoBusinessIdentity(
  previous: WaffoDeliveryRow | PaymentIdentityRow,
  event: Pick<
    WaffoPaymentSettlement,
    "eventType" | "eventId" | "paymentId" | "orderId" | "intentId" | "normalizedFingerprint" | "taxCents"
  >,
): boolean {
  return (
    previous.event_type === event.eventType &&
    previous.event_id === event.eventId &&
    previous.payment_id === event.paymentId &&
    previous.order_id === event.orderId &&
    (previous.intent_id ?? event.intentId) === event.intentId &&
    previous.normalized_fingerprint === event.normalizedFingerprint &&
    previous.tax_cents === event.taxCents
  );
}

type WaffoRejectedIdentity = {
  deliveryId: string;
  eventType: string;
  eventId: string;
  paymentId: string;
  orderId: string;
  intentId: string;
  payloadHash: string;
  normalizedFingerprint: string;
  taxCents: number;
};

function sameWaffoRejectedIdentity(
  previous: WaffoDeliveryRow | PaymentIdentityRow,
  event: WaffoRejectedIdentity,
): boolean {
  return (
    previous.event_type === event.eventType &&
    previous.event_id === event.eventId &&
    previous.payment_id === event.paymentId &&
    previous.order_id === event.orderId &&
    (previous.intent_id ?? event.intentId) === event.intentId &&
    previous.payload_hash === event.payloadHash &&
    previous.normalized_fingerprint === event.normalizedFingerprint &&
    previous.tax_cents === event.taxCents
  );
}

function recordWaffoRejectedIdentity(
  db: AppDb,
  event: WaffoRejectedIdentity,
  reason: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO payment_event_identities
      (event_type, event_id, payment_id, order_id, intent_id, payload_hash,
       normalized_fingerprint, tax_cents, outcome, reason, listing_id, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?, NULL, NULL, ?, ?)`,
  ).run(
    event.eventType,
    event.eventId,
    event.paymentId,
    event.orderId,
    event.intentId,
    event.payloadHash,
    event.normalizedFingerprint,
    event.taxCents,
    reason,
    now,
    now,
  );
}

function recordWaffoRejectedDelivery(
  db: AppDb,
  event: WaffoRejectedIdentity,
  outcome: WaffoSettlementOutcome["status"],
  reason?: string,
): void {
  db.prepare(
    `INSERT INTO waffo_webhook_deliveries
      (delivery_id, event_type, event_id, payment_id, order_id, intent_id,
       payload_hash, normalized_fingerprint, tax_cents, outcome, reason, listing_id, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    event.deliveryId,
    event.eventType,
    event.eventId,
    event.paymentId,
    event.orderId,
    event.intentId,
    event.payloadHash,
    event.normalizedFingerprint,
    event.taxCents,
    outcome,
    reason ?? null,
    new Date().toISOString(),
  );
}

type WaffoIdentityLookup = {
  deliveryId?: string;
  eventType?: string;
  eventId?: string;
  paymentId?: string;
  orderId?: string;
  intentId?: string;
};

/** Conflict rows are terminal reservations for every identity carried by the signed event. */
function findWaffoConflicts(db: AppDb, event: WaffoIdentityLookup): WaffoConflictRow[] {
  const clauses: string[] = [];
  const values: string[] = [];
  if (event.deliveryId) {
    clauses.push("delivery_id = ?");
    values.push(event.deliveryId);
  }
  if (event.eventType && event.eventId) {
    clauses.push("(event_type = ? AND event_id = ?)");
    values.push(event.eventType, event.eventId);
  }
  if (event.paymentId) {
    clauses.push("payment_id = ?");
    values.push(event.paymentId);
  }
  if (event.orderId) {
    clauses.push("order_id = ?");
    values.push(event.orderId);
  }
  if (event.intentId) {
    clauses.push("intent_id = ?");
    values.push(event.intentId);
  }
  if (clauses.length === 0) return [];
  return db
    .prepare<string[], WaffoConflictRow>(
      `SELECT id, delivery_id, event_type, event_id, payment_id, order_id, intent_id,
              payload_hash, normalized_fingerprint, reason
       FROM waffo_webhook_conflicts WHERE ${clauses.join(" OR ")} ORDER BY id`,
    )
    .all(...values);
}

function sameWaffoConflict(
  previous: WaffoConflictRow,
  event: WaffoIdentityLookup & { payloadHash: string; normalizedFingerprint: string },
): boolean {
  return Boolean(
    event.deliveryId &&
      event.eventType &&
      event.eventId &&
      event.paymentId &&
      event.orderId &&
      event.intentId &&
      previous.delivery_id === event.deliveryId &&
      previous.event_type === event.eventType &&
      previous.event_id === event.eventId &&
      previous.payment_id === event.paymentId &&
      previous.order_id === event.orderId &&
      previous.intent_id === event.intentId &&
      previous.payload_hash === event.payloadHash &&
      previous.normalized_fingerprint === event.normalizedFingerprint,
  );
}

function findWaffoRejections(
  db: AppDb,
  event: Pick<
    RejectedWebhook,
    "deliveryId" | "eventType" | "eventId" | "paymentId" | "orderId" | "intentId"
  > | Pick<WaffoPaymentSettlement, "deliveryId" | "eventType" | "eventId" | "paymentId" | "orderId" | "intentId">,
): WaffoRejectionRow[] {
  const clauses: string[] = [];
  const values: string[] = [];
  if (event.deliveryId) {
    clauses.push("delivery_id = ?");
    values.push(event.deliveryId);
  }
  if (event.eventType && event.eventId) {
    clauses.push("(event_type = ? AND event_id = ?)");
    values.push(event.eventType, event.eventId);
  }
  if (event.paymentId) {
    clauses.push("payment_id = ?");
    values.push(event.paymentId);
  }
  if (event.orderId) {
    clauses.push("order_id = ?");
    values.push(event.orderId);
  }
  if (event.intentId) {
    clauses.push("intent_id = ?");
    values.push(event.intentId);
  }
  if (clauses.length === 0) return [];
  return db
    .prepare<string[], WaffoRejectionRow>(
      `SELECT delivery_id, event_type, event_id, payment_id, order_id, intent_id,
              payload_hash, normalized_fingerprint, reason
       FROM waffo_webhook_rejections WHERE ${clauses.join(" OR ")} ORDER BY id`,
    )
    .all(...values);
}

function sameWaffoRejection(
  previous: WaffoRejectionRow,
  event: WaffoIdentityLookup & { payloadHash: string; normalizedFingerprint: string },
): boolean {
  return (
    previous.payload_hash === event.payloadHash &&
    previous.normalized_fingerprint === event.normalizedFingerprint &&
    (!event.deliveryId || previous.delivery_id === event.deliveryId) &&
    (!event.eventType || previous.event_type === event.eventType) &&
    (!event.eventId || previous.event_id === event.eventId) &&
    (!event.paymentId || previous.payment_id === event.paymentId) &&
    (!event.orderId || previous.order_id === event.orderId) &&
    (!event.intentId || previous.intent_id === event.intentId)
  );
}

function insertWaffoRejection(
  db: AppDb,
  event: RejectedWebhook,
  eventType: string,
  reason: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO waffo_webhook_rejections
      (delivery_id, event_type, event_id, payment_id, order_id, intent_id,
       payload_hash, normalized_fingerprint, reason, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.deliveryId ?? null,
    eventType,
    event.eventId ?? null,
    event.paymentId ?? null,
    event.orderId ?? null,
    event.intentId ?? null,
    event.payloadHash,
    event.normalizedFingerprint,
    reason,
    new Date().toISOString(),
  );
}

function recordWaffoConflictIdentity(
  db: AppDb,
  event: WaffoRejectedIdentity,
  reason: string,
): void {
  if (event.eventType === "order.completed") {
    markIntentNeedsReconciliation(
      db,
      event.intentId,
      `Waffo payment needs reconciliation: ${reason}`,
    );
  }
  db.prepare(
    `INSERT OR IGNORE INTO waffo_webhook_conflicts
      (delivery_id, event_type, event_id, payment_id, order_id, intent_id,
       payload_hash, normalized_fingerprint, reason, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.deliveryId,
    event.eventType,
    event.eventId,
    event.paymentId,
    event.orderId,
    event.intentId,
    event.payloadHash,
    event.normalizedFingerprint,
    reason,
    new Date().toISOString(),
  );
}

function recordWaffoIdentity(
  db: AppDb,
  event: WaffoPaymentSettlement,
  outcome: WaffoSettlementOutcome["status"],
  reason?: string,
  listingId?: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO payment_event_identities
      (event_type, event_id, payment_id, order_id, intent_id, payload_hash,
       normalized_fingerprint, tax_cents, outcome, reason, listing_id, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.eventType,
    event.eventId,
    event.paymentId,
    event.orderId,
    event.intentId,
    event.payloadHash,
    event.normalizedFingerprint,
    event.taxCents,
    outcome,
    reason ?? null,
    listingId ?? null,
    event.paidAt,
    now,
    now,
  );
  void listingId;
}

function recordWaffoDelivery(
  db: AppDb,
  event: WaffoPaymentSettlement,
  outcome: WaffoSettlementOutcome["status"],
  reason?: string,
  listingId?: string,
): void {
  db.prepare(
    `INSERT INTO waffo_webhook_deliveries
      (delivery_id, event_type, event_id, payment_id, order_id, intent_id,
       payload_hash, normalized_fingerprint, tax_cents, outcome, reason, listing_id, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.deliveryId,
    event.eventType,
    event.eventId,
    event.paymentId,
    event.orderId,
    event.intentId,
    event.payloadHash,
    event.normalizedFingerprint,
    event.taxCents,
    outcome,
    reason ?? null,
    listingId ?? null,
    new Date().toISOString(),
  );
}

function recordWaffoConflict(
  db: AppDb,
  event: WaffoPaymentSettlement,
  reason: string,
): void {
  markIntentNeedsReconciliation(
    db,
    event.intentId,
    `Waffo payment needs reconciliation: ${reason}`,
  );
  db.prepare(
    `INSERT OR IGNORE INTO waffo_webhook_conflicts
      (delivery_id, event_type, event_id, payment_id, order_id, intent_id,
       payload_hash, normalized_fingerprint, reason, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.deliveryId,
    event.eventType,
    event.eventId,
    event.paymentId,
    event.orderId,
    event.intentId,
    event.payloadHash,
    event.normalizedFingerprint,
    reason,
    new Date().toISOString(),
  );
}
