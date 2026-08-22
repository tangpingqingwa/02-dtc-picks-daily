import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { FixtureCheckout } from "../src/billing/fixture.js";
import {
  applyPaidBid,
  findListingByDayAndUrl,
  listToday,
  placeBid,
  quotePaidBid,
  raiseBid,
} from "../src/core/board.js";
import { dayKey } from "../src/core/day.js";
import { openDatabase } from "../src/db.js";

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

test("quotePaidBid charges the full first bid and only the raise difference", () => {
  assert.deepEqual(quotePaidBid(undefined, 10), { raise: false, chargeUsd: 10 });
  assert.deepEqual(quotePaidBid({ bidUsd: 10 }, 15), { raise: true, chargeUsd: 5 });
  assert.throws(
    () => quotePaidBid({ bidUsd: 10 }, 10),
    /strictly greater than the current bid/,
  );
  assert.throws(() => quotePaidBid({ bidUsd: 10 }, 9), /strictly greater/);
  assert.throws(() => quotePaidBid(undefined, 4), /whole dollar >= 5/);
});

test("SPEC acceptance 5: same URL $10 → $15 pays $5 more; one row; bid $15", () => {
  const db = openDatabase(":memory:");
  try {
    const first = applyPaidBid(db, {
      sessionId: "chk_first_10",
      productUrl: "https://store.example/sku",
      whyTestThisToday: "Test this restock on today's brief",
      bidUsd: 10,
      day: "2026-08-22",
      paidUsd: 10,
      paidAt: "2026-08-22T09:00:00.000Z",
    });
    assert.equal(first.bidUsd, 10);
    assert.equal(first.paidUsd, 10);
    assert.equal(first.createdAt, "2026-08-22T09:00:00.000Z");

    const raised = applyPaidBid(db, {
      sessionId: "chk_raise_15",
      productUrl: "https://store.example/sku?utm_source=x&aff=1",
      whyTestThisToday: "Same SKU, higher bid, still one row",
      bidUsd: 15,
      day: "2026-08-22",
      paidUsd: 5,
      paidAt: "2026-08-22T11:00:00.000Z",
    });

    assert.equal(raised.id, first.id);
    assert.equal(raised.bidUsd, 15);
    assert.equal(raised.paidUsd, 15);
    assert.equal(raised.createdAt, first.createdAt);
    assert.equal(raised.updatedAt, "2026-08-22T11:00:00.000Z");
    assert.equal(raised.productUrl, "https://store.example/sku");

    const today = listToday(db, "2026-08-22");
    assert.equal(today.length, 1);
    assert.equal(today[0]?.id, first.id);
    assert.equal(today[0]?.bidUsd, 15);
    assert.equal(today[0]?.rank, 1);
    assert.equal(today[0]?.createdAt, first.createdAt);
  } finally {
    db.close();
  }
});

test("raise keeps createdAt and re-ranks above a newer higher neighbor", () => {
  const db = openDatabase(":memory:");
  try {
    const older = placeBid(db, {
      id: "lst-older",
      day: "2026-08-22",
      productUrl: "https://older.example/sku",
      whyTestThisToday: "Older ten-dollar listing starts below cover",
      bidUsd: 10,
      createdAt: "2026-08-22T08:00:00.000Z",
    });
    placeBid(db, {
      id: "lst-cover",
      day: "2026-08-22",
      productUrl: "https://cover.example/apps/pick",
      whyTestThisToday: "Cover app sellers should install this morning",
      bidUsd: 20,
      createdAt: "2026-08-22T09:00:00.000Z",
    });

    const before = listToday(db, "2026-08-22");
    assert.deepEqual(
      before.map((row) => row.id),
      ["lst-cover", "lst-older"],
    );

    const raised = raiseBid(db, older, {
      bidUsd: 21,
      whyTestThisToday: "Raised to take the cover without a new row",
      paidUsd: 11,
      updatedAt: "2026-08-22T12:00:00.000Z",
    });
    assert.equal(raised.createdAt, "2026-08-22T08:00:00.000Z");
    assert.equal(raised.paidUsd, 21);

    const after = listToday(db, "2026-08-22");
    assert.equal(after.length, 2);
    assert.equal(after[0]?.id, "lst-older");
    assert.equal(after[0]?.rank, 1);
    assert.equal(after[0]?.bidUsd, 21);
    assert.equal(after[0]?.createdAt, older.createdAt);
    assert.equal(after[1]?.id, "lst-cover");
  } finally {
    db.close();
  }
});

test("a rival URL paying only this listing's difference cannot steal the row", () => {
  const db = openDatabase(":memory:");
  try {
    applyPaidBid(db, {
      sessionId: "chk_cover",
      productUrl: "https://cover.example/apps/pick",
      whyTestThisToday: "Cover app sellers should install this morning",
      bidUsd: 20,
      day: "2026-08-22",
      paidUsd: 20,
      paidAt: "2026-08-22T09:00:00.000Z",
    });
    applyPaidBid(db, {
      sessionId: "chk_rival",
      productUrl: "https://rival.example/sku",
      whyTestThisToday: "Rival pays five dollars, not this listing's difference",
      bidUsd: 5,
      day: "2026-08-22",
      paidUsd: 5,
      paidAt: "2026-08-22T10:00:00.000Z",
    });

    const today = listToday(db, "2026-08-22");
    assert.equal(today.length, 2);
    assert.equal(today[0]?.productUrl, "https://cover.example/apps/pick");
    assert.equal(today[0]?.bidUsd, 20);
    assert.equal(today[1]?.productUrl, "https://rival.example/sku");
    assert.equal(today[1]?.bidUsd, 5);
    assert.notEqual(today[1]?.rank, 1);
  } finally {
    db.close();
  }
});

test("same-or-lower raise is rejected and leaves the row unchanged", () => {
  const db = openDatabase(":memory:");
  try {
    const first = applyPaidBid(db, {
      sessionId: "chk_stay",
      productUrl: "https://stay.example/sku",
      whyTestThisToday: "Do not raise unless the new bid is higher",
      bidUsd: 12,
      day: "2026-08-22",
      paidUsd: 12,
      paidAt: "2026-08-22T09:00:00.000Z",
    });
    assert.throws(
      () =>
        applyPaidBid(db, {
          sessionId: "chk_same",
          productUrl: "https://stay.example/sku",
          whyTestThisToday: "Same twelve dollars is not a raise",
          bidUsd: 12,
          day: "2026-08-22",
          paidUsd: 0,
          paidAt: "2026-08-22T10:00:00.000Z",
        }),
      /strictly greater/,
    );
    const again = findListingByDayAndUrl(db, "2026-08-22", "https://stay.example/sku");
    assert.equal(again?.id, first.id);
    assert.equal(again?.bidUsd, 12);
    assert.equal(again?.paidUsd, 12);
    assert.equal(again?.createdAt, first.createdAt);
    assert.equal(listToday(db, "2026-08-22").length, 1);
  } finally {
    db.close();
  }
});

test("raise that is not charged the difference only is rejected", () => {
  const db = openDatabase(":memory:");
  try {
    applyPaidBid(db, {
      sessionId: "chk_full",
      productUrl: "https://full.example/sku",
      whyTestThisToday: "First list pays the full ten",
      bidUsd: 10,
      day: "2026-08-22",
      paidUsd: 10,
      paidAt: "2026-08-22T09:00:00.000Z",
    });
    assert.throws(
      () =>
        applyPaidBid(db, {
          sessionId: "chk_overpay",
          productUrl: "https://full.example/sku",
          whyTestThisToday: "Cannot charge the full new bid on a raise",
          bidUsd: 15,
          day: "2026-08-22",
          paidUsd: 15,
          paidAt: "2026-08-22T10:00:00.000Z",
        }),
      /difference only/,
    );
    assert.equal(listToday(db, "2026-08-22").length, 1);
    assert.equal(listToday(db, "2026-08-22")[0]?.bidUsd, 10);
  } finally {
    db.close();
  }
});

test("fixture checkout raise of the same URL pays the difference only", async () => {
  const checkout = new FixtureCheckout({ autoComplete: false });
  const app = await buildApp({ databasePath: ":memory:", checkout });
  after(() => app.close());

  const first = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://store.example/sku?utm_source=ad",
      whyTestThisToday: "Test this restock on today's brief",
      bidUsd: "10",
    }),
  });
  assert.equal(first.statusCode, 303);
  const firstId = new URL(String(first.headers.location), "http://localhost").searchParams.get(
    "session",
  );
  assert.ok(firstId);
  const firstSession = checkout.getSession(firstId);
  assert.equal(firstSession?.amountUsd, 10);
  await app.inject({
    method: "GET",
    url: `/checkout/complete?session=${encodeURIComponent(firstId)}`,
  });

  const raised = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://store.example/sku?aff=1",
      whyTestThisToday: "Same URL pays five more to take fifteen",
      bidUsd: "15",
    }),
  });
  assert.equal(raised.statusCode, 303);
  const raiseId = new URL(String(raised.headers.location), "http://localhost").searchParams.get(
    "session",
  );
  assert.ok(raiseId);
  const raiseSession = checkout.getSession(raiseId);
  assert.equal(raiseSession?.draft.bidUsd, 15);
  assert.equal(raiseSession?.draft.chargeUsd, 5);
  assert.equal(raiseSession?.amountUsd, 5);
  await app.inject({
    method: "GET",
    url: `/checkout/complete?session=${encodeURIComponent(raiseId)}`,
  });

  const day = dayKey();
  const listings = listToday(app.db, day);
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.productUrl, "https://store.example/sku");
  assert.equal(listings[0]?.bidUsd, 15);
  assert.equal(listings[0]?.paidUsd, 15);
  assert.equal(listings[0]?.rank, 1);
});
