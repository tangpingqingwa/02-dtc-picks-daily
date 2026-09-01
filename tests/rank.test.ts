import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_BID_USD,
  isPaidListing,
  listLast24h,
  listToday,
  paidListings,
  placeBid,
  rankForBid,
  rankListings,
  rollingWindowStart,
  withRanks,
  type Listing,
} from "../src/core/board.js";
import { dayKey } from "../src/core/day.js";
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

test("unpaid Waffo checkout stays off the live board until paid", () => {
  const unpaid = listing({
    id: "lst-ghost",
    bidUsd: 99,
    paidUsd: 0,
    createdAt: "2026-08-22T08:00:00.000Z",
  });
  const abandoned = listing({
    id: "lst-abandoned",
    bidUsd: 40,
    paidUsd: 0,
    createdAt: "2026-08-22T08:30:00.000Z",
  });
  const paid = listing({
    id: "lst-paid",
    bidUsd: 5,
    paidUsd: 5,
    createdAt: "2026-08-22T09:00:00.000Z",
  });
  assert.equal(isPaidListing(unpaid), false);
  assert.equal(isPaidListing(abandoned), false);
  assert.equal(isPaidListing(paid), true);
  assert.deepEqual(rankListings([unpaid, abandoned]), []);
  assert.deepEqual(
    paidListings([unpaid, abandoned, paid]).map((row) => row.id),
    ["lst-paid"],
  );
  const ranked = withRanks([unpaid, abandoned, paid]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.id, "lst-paid");
  assert.equal(ranked[0]?.rank, 1);
  assert.doesNotMatch(ranked.map((row) => row.id).join(","), /lst-ghost|lst-abandoned/);
  assert.equal(rankForBid([unpaid, abandoned], 5), 1);
  assert.equal(rankForBid([unpaid, paid], 5), 2);

  const db = openDatabase(":memory:");
  try {
    placeBid(db, {
      id: "lst-ghost",
      day: "2026-08-22",
      productUrl: "https://ghost.example/sku",
      whyTestThisToday: "Unpaid Waffo checkout must not take this morning’s cover",
      bidUsd: 99,
      paidUsd: 0,
      createdAt: "2026-08-22T08:00:00.000Z",
    });
    placeBid(db, {
      id: "lst-paid",
      day: "2026-08-22",
      productUrl: "https://store.example/sku",
      whyTestThisToday: "Fixture pay $5 lists at #1 after Waffo reports paid",
      bidUsd: 5,
      paidUsd: 5,
      createdAt: "2026-08-22T09:00:00.000Z",
    });
    const today = listToday(db, "2026-08-22");
    assert.equal(today.length, 1);
    assert.equal(today[0]?.id, "lst-paid");
    assert.equal(today[0]?.rank, 1);
    assert.doesNotMatch(today.map((row) => row.id).join(","), /lst-ghost/);
    const strip = listLast24h(db, new Date("2026-08-22T13:00:00.000Z"));
    assert.equal(strip.length, 1);
    assert.equal(strip[0]?.id, "lst-paid");
  } finally {
    db.close();
  }
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

test("listLast24h is a rolling 24h window, not civil midnight UTC", () => {
  const db = openDatabase(":memory:");
  const now = new Date("2026-08-23T00:30:00.000Z");
  try {
    placeBid(db, {
      id: "lst-last-night",
      day: "2026-08-22",
      productUrl: "https://overnight.example/sku",
      whyTestThisToday: "Paid after yesterday noon still sits in the last 24 hours",
      bidUsd: 7,
      createdAt: "2026-08-22T12:00:00.000Z",
    });
    placeBid(db, {
      id: "lst-too-old",
      day: "2026-08-21",
      productUrl: "https://stale.example/sku",
      whyTestThisToday: "Paid more than 24 hours ago leaves the rolling strip",
      bidUsd: 40,
      createdAt: "2026-08-21T23:00:00.000Z",
    });
    placeBid(db, {
      id: "lst-morning",
      day: "2026-08-23",
      productUrl: "https://fresh.example/sku",
      whyTestThisToday: "This morning’s spend is still in the window",
      bidUsd: 9,
      createdAt: "2026-08-23T00:10:00.000Z",
    });

    const window = listLast24h(db, now);
    assert.deepEqual(
      window.map((row) => row.id),
      ["lst-morning", "lst-last-night"],
    );
    assert.equal(window[0]?.rank, 1);
    assert.equal(window[1]?.rank, 2);
    assert.ok(!window.some((row) => row.id === "lst-too-old"));
    assert.equal(listToday(db, "2026-08-23").length, 1);
    assert.equal(listToday(db, "2026-08-23")[0]?.id, "lst-morning");
    assert.equal(rollingWindowStart(now).toISOString(), "2026-08-22T00:30:00.000Z");
    assert.notEqual(dayKey(now, "UTC"), dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), "UTC"));
  } finally {
    db.close();
  }
});

test("listLast24h stays empty when nothing paid in the last 24 hours", () => {
  const db = openDatabase(":memory:");
  try {
    placeBid(db, {
      id: "lst-stale",
      day: "2026-08-20",
      productUrl: "https://old.example/sku",
      whyTestThisToday: "Stale spend must not invent a last-24h #1",
      bidUsd: 99,
      createdAt: "2026-08-20T00:00:00.000Z",
    });
    assert.deepEqual(listLast24h(db, new Date("2026-08-23T00:30:00.000Z")), []);
  } finally {
    db.close();
  }
});
