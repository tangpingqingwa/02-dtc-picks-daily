import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { FixtureCheckout } from "../src/billing/fixture.js";
import { PolarCheckout, verifyPolarSignature } from "../src/billing/polar.js";
import { createCheckoutPort } from "../src/billing/port.js";
import { listToday, MIN_BID_USD, placeBid } from "../src/core/board.js";
import { dayKey } from "../src/core/day.js";
import { openDatabase } from "../src/db.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "polar");

function loadPolarFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

function form(body: Record<string, string>) {
  return {
    method: "POST" as const,
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams(body).toString(),
  };
}

test("createCheckoutPort without POLAR_LIVE is the fixture", () => {
  const port = createCheckoutPort({ BOARD_TZ: "UTC" });
  assert.equal(port.kind, "fixture");
});

test("PolarCheckout is env-gated and never constructed in CI", () => {
  assert.throws(() => new PolarCheckout({ env: {} }), /POLAR_LIVE=1/);
  assert.throws(
    () => new PolarCheckout({ env: { POLAR_LIVE: "1" } }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );
  assert.throws(
    () => createCheckoutPort({ POLAR_LIVE: "1" }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );
});

test("SPEC acceptance 2: fixture pay $5 lists at #1 with 0 clicks", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject(
    form({
      productUrl: "https://store.example/sku",
      whyTestThisToday: "Test this restock on today's brief",
      bidUsd: String(MIN_BID_USD),
    }),
  );
  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, "/");

  const board = await app.inject({ method: "GET", url: "/" });
  assert.equal(board.statusCode, 200);
  assert.match(board.body, /store\.example\/sku/);
  assert.match(board.body, /\$5/);
  assert.match(board.body, /0 clicks/);
  assert.match(board.body, /data-rank="1"/);
  assert.doesNotMatch(board.body, /data-empty-board/);

  const listings = listToday(app.db, dayKey());
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.rank, 1);
  assert.equal(listings[0]?.bidUsd, 5);
  assert.equal(listings[0]?.clicks, 0);
});

test("SPEC acceptance 3: underbid still lists below today's #1", async () => {
  const db = openDatabase(":memory:");
  const day = dayKey();
  placeBid(db, {
    id: "lst-cover",
    day,
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 20,
    createdAt: "2026-08-22T09:00:00.000Z",
  });
  const app = await buildApp({ db });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject(
    form({
      productUrl: "https://under.example/sku",
      whyTestThisToday: "Cheaper SKU still belongs on the brief",
      bidUsd: "8",
    }),
  );
  assert.equal(response.statusCode, 303);

  const listings = listToday(db, day);
  assert.equal(listings.length, 2);
  assert.equal(listings[0]?.id, "lst-cover");
  assert.equal(listings[0]?.bidUsd, 20);
  assert.equal(listings[1]?.productUrl, "https://under.example/sku");
  assert.equal(listings[1]?.bidUsd, 8);
  assert.equal(listings[1]?.rank, 2);

  const board = await app.inject({ method: "GET", url: "/" });
  const order = [...board.body.matchAll(/data-listing-id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(order[0], "lst-cover");
  assert.equal(order.length, 2);
  assert.match(board.body, /under\.example\/sku/);
});

test("abandoned fixture session is a no-op", async () => {
  const checkout = new FixtureCheckout({ autoComplete: false });
  const app = await buildApp({ databasePath: ":memory:", checkout });
  after(() => app.close());

  const response = await app.inject(
    form({
      productUrl: "https://ghost.example/sku",
      whyTestThisToday: "This unpaid Polar session must not appear",
      bidUsd: "12",
    }),
  );
  assert.equal(response.statusCode, 303);
  assert.match(String(response.headers.location), /\/checkout\/complete\?session=/);
  assert.equal(listToday(app.db, dayKey()).length, 0);

  const sessionId = new URL(String(response.headers.location), "http://localhost").searchParams.get(
    "session",
  );
  assert.ok(sessionId);
  await checkout.abandonSession(sessionId);
  const complete = await app.inject({
    method: "GET",
    url: `/checkout/complete?session=${encodeURIComponent(sessionId)}`,
  });
  assert.equal(complete.statusCode, 303);
  assert.equal(listToday(app.db, dayKey()).length, 0);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /data-empty-board/);
  assert.doesNotMatch(board.body, /ghost\.example/);
});

test("recorded Polar paid webhook inserts the listing at that bid's rank", async () => {
  const db = openDatabase(":memory:");
  placeBid(db, {
    id: "lst-cover",
    day: "2026-08-22",
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 20,
    createdAt: "2026-08-22T09:00:00.000Z",
  });
  const app = await buildApp({ db });
  after(async () => {
    await app.close();
    db.close();
  });

  const paid = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: { "content-type": "application/json" },
    payload: loadPolarFixture("paid.json"),
  });
  assert.equal(paid.statusCode, 200);
  assert.deepEqual(paid.json(), { received: true, applied: true });

  const afterFive = listToday(app.db, "2026-08-22");
  assert.equal(afterFive.length, 2);
  assert.equal(afterFive[0]?.id, "lst-cover");
  assert.equal(afterFive[1]?.productUrl, "https://store.example/sku");
  assert.equal(afterFive[1]?.bidUsd, 5);
  assert.equal(afterFive[1]?.rank, 2);
  assert.equal(afterFive[1]?.clicks, 0);

  const under = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: { "content-type": "application/json" },
    payload: loadPolarFixture("underbid-paid.json"),
  });
  assert.equal(under.statusCode, 200);
  const ranked = listToday(app.db, "2026-08-22");
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0]?.id, "lst-cover");
  assert.equal(ranked[1]?.productUrl, "https://under.example/sku");
  assert.equal(ranked[1]?.bidUsd, 8);
  assert.equal(ranked[1]?.rank, 2);
  assert.equal(ranked[2]?.productUrl, "https://store.example/sku");
});

test("recorded abandoned Polar webhook does not change the board", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: { "content-type": "application/json" },
    payload: loadPolarFixture("abandoned.json"),
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { received: true, applied: false });
  assert.equal(listToday(app.db, "2026-08-22").length, 0);
});

test("bids below $5 are rejected and do not charge", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject(
    form({
      productUrl: "https://cheap.example/sku",
      whyTestThisToday: "Four dollars is below the floor",
      bidUsd: "4",
    }),
  );
  assert.equal(response.statusCode, 400);
  assert.match(response.body, /whole dollar >= 5/);
  assert.equal(listToday(app.db, dayKey()).length, 0);
});

test("replayed paid checkout does not insert a second row", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());
  const payload = loadPolarFixture("paid.json");

  await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: { "content-type": "application/json" },
    payload,
  });
  const again = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: { "content-type": "application/json" },
    payload,
  });
  assert.equal(again.statusCode, 200);
  assert.equal(listToday(app.db, "2026-08-22").length, 1);
});

test("live Polar createSession uses injected fetch only", async () => {
  const recorded = JSON.parse(loadPolarFixture("checkout-created.json")) as {
    id: string;
    url: string;
  };
  const calls: string[] = [];
  const polar = new PolarCheckout({
    env: { POLAR_LIVE: "1", POLAR_ACCESS_TOKEN: "test-token" },
    fetch: async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify(recorded), { status: 201 });
    },
  });
  const session = await polar.createSession({
    productUrl: "https://store.example/sku",
    whyTestThisToday: "Test this restock on today's brief",
    bidUsd: 5,
    day: "2026-08-22",
  });
  assert.equal(session.id, recorded.id);
  assert.equal(session.status, "open");
  assert.equal(session.url, recorded.url);
  assert.equal(calls.length, 1);
  await assert.rejects(polar.completeSession(session.id), /webhook only/);
});

test("live Polar webhook verifies the signature before applying", async () => {
  const secret = "whsec_test";
  const rawBody = loadPolarFixture("paid.json");
  const webhookId = "msg_1";
  const timestamp = "1710000000";
  const signature = `v1,${createHmac("sha256", secret).update(`${webhookId}.${timestamp}.${rawBody}`).digest("base64")}`;
  assert.equal(
    verifyPolarSignature(rawBody, {
      "webhook-id": webhookId,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    }, secret),
    true,
  );

  const polar = new PolarCheckout({
    env: {
      POLAR_LIVE: "1",
      POLAR_ACCESS_TOKEN: "test-token",
      POLAR_WEBHOOK_SECRET: secret,
    },
  });
  const paid = await polar.parseWebhook(rawBody, {
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp,
    "webhook-signature": signature,
  });
  assert.ok(!("ignored" in paid));
  if ("ignored" in paid) {
    return;
  }
  assert.equal(paid.draft.bidUsd, 5);
  assert.equal(paid.draft.productUrl, "https://store.example/sku");

  await assert.rejects(
    polar.parseWebhook(rawBody, {
      "webhook-id": webhookId,
      "webhook-timestamp": timestamp,
      "webhook-signature": "v1,not-the-signature",
    }),
    /invalid Polar webhook signature/,
  );
});
