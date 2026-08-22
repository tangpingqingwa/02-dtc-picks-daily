import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_BID_USD,
  placeBid,
  rankForBid,
  rankListings,
  type Listing,
} from "../src/core/board.js";
import { openDatabase } from "../src/db.js";

function listing(partial: Partial<Listing> & Pick<Listing, "id" | "bidUsd" | "createdAt">): Listing {
  return {
    day: "2026-08-22",
    productUrl: `https://example.com/${partial.id}`,
    whyTestThisToday: "Try this SKU on today's brief",
    paidUsd: partial.bidUsd,
    clicks: 0,
    updatedAt: partial.createdAt,
    ...partial,
  };
}

test("rankListings sorts bid descending then older createdAt first", () => {
  const a = listing({ id: "a", bidUsd: 20, createdAt: "2026-08-22T10:00:00.000Z" });
  const b = listing({ id: "b", bidUsd: 12, createdAt: "2026-08-22T11:00:00.000Z" });
  const c = listing({ id: "c", bidUsd: 12, createdAt: "2026-08-22T12:00:00.000Z" });
  const d = listing({ id: "d", bidUsd: 5, createdAt: "2026-08-22T13:00:00.000Z" });

  const ranked = rankListings([d, c, a, b]);
  assert.deepEqual(
    ranked.map((row) => row.id),
    ["a", "b", "c", "d"],
  );
});

test("SPEC acceptance 2: first $5 is #1 with 0 clicks", () => {
  const db = openDatabase(":memory:");
  try {
    const row = placeBid(db, {
      day: "2026-08-22",
      productUrl: "https://store.example/sku",
      whyTestThisToday: "Test this restock on today's brief",
      bidUsd: MIN_BID_USD,
    });
    assert.equal(row.bidUsd, 5);
    assert.equal(row.clicks, 0);
    assert.equal(rankListings([row])[0]?.id, row.id);
  } finally {
    db.close();
  }
});

test("SPEC acceptance 3: underbid still lists below #1", () => {
  const top = listing({ id: "top", bidUsd: 20, createdAt: "2026-08-22T09:00:00.000Z" });
  const under = listing({ id: "under", bidUsd: 8, createdAt: "2026-08-22T10:00:00.000Z" });
  const ranked = rankListings([under, top]);
  assert.equal(ranked[0]?.id, "top");
  assert.equal(ranked[1]?.id, "under");
  assert.ok(ranked.some((row) => row.id === "under"));
});

test("SPEC acceptance 4: equal bids keep the older listing above", () => {
  const older = listing({ id: "older", bidUsd: 10, createdAt: "2026-08-22T08:00:00.000Z" });
  const newer = listing({ id: "newer", bidUsd: 10, createdAt: "2026-08-22T09:00:00.000Z" });
  const ranked = rankListings([newer, older]);
  assert.equal(ranked[0]?.id, "older");
  assert.equal(ranked[1]?.id, "newer");
});

test("rankForBid reports the slot an unpaid bid would take", () => {
  const rows = [
    listing({ id: "a", bidUsd: 20, createdAt: "2026-08-22T10:00:00.000Z" }),
    listing({ id: "b", bidUsd: 12, createdAt: "2026-08-22T11:00:00.000Z" }),
  ];
  assert.equal(rankForBid(rows, 21), 1);
  assert.equal(rankForBid(rows, 20), 2);
  assert.equal(rankForBid(rows, 12), 3);
  assert.equal(rankForBid(rows, 5), 3);
  assert.equal(rankForBid([], 5), 1);
});
