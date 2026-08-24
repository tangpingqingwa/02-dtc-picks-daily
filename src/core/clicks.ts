import type { AppDb } from "../db.js";
import { getPaidListing, type Listing } from "./board.js";

export class ClickError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 404) {
    super(message);
    this.name = "ClickError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Increment once per outbound hop. Never seed or invent a count. */
export function incrementClick(db: AppDb, listingId: string): Listing {
  const listing = getPaidListing(db, listingId);
  if (!listing) {
    throw new ClickError("listing_not_found", "listing not found", 404);
  }
  db.prepare("UPDATE listings SET clicks = clicks + 1 WHERE id = ?").run(listingId);
  const updated = getPaidListing(db, listingId);
  if (!updated) {
    throw new ClickError("listing_not_found", "listing not found", 404);
  }
  return updated;
}
