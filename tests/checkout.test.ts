import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { FixtureCheckout } from "../src/billing/fixture.js";
import { PolarCheckout, POLAR_API_BASE, polarApiBase } from "../src/billing/polar.js";
import { createCheckoutPort } from "../src/billing/port.js";
import { listToday, MIN_BID_USD, placeBid } from "../src/core/board.js";
import { dayKey } from "../src/core/day.js";
import { polarLiveEnabled } from "../src/config.js";
import { openDatabase } from "../src/db.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "polar");

function loadPolarFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

test("createCheckoutPort stays fixture unless POLAR_LIVE=1", () => {
  assert.equal(polarLiveEnabled({}), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "0" }), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "true" }), false);
  assert.equal(createCheckoutPort({}).kind, "fixture");
  assert.equal(createCheckoutPort({ POLAR_LIVE: "0" }).kind, "fixture");
  assert.throws(
    () => createCheckoutPort({ POLAR_LIVE: "1" }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );
  const live = createCheckoutPort({
    POLAR_LIVE: "1",
    POLAR_ACCESS_TOKEN: "polar_tok_test",
  });
  assert.equal(live.kind, "live");
});

test("SPEC acceptance 2: fixture pay $5 lists at #1 with 0 clicks", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://store.example/sku",
      whyTestThisToday: "Test this restock on today's brief",
      bidUsd: String(MIN_BID_USD),
    }),
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, "/");

  const board = await app.inject({ method: "GET", url: "/" });
  assert.equal(board.statusCode, 200);
  assert.doesNotMatch(board.body, /data-empty-board/);
  assert.match(board.body, /store\.example\/sku/);
  assert.match(board.body, /data-rank="1"/);
  assert.match(board.body, /\$5/);
  assert.match(board.body, /0 clicks/);

  const listings = listToday(app.db, dayKey());
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.rank, 1);
  assert.equal(listings[0]?.bidUsd, 5);
  assert.equal(listings[0]?.clicks, 0);
  assert.equal(listings[0]?.productUrl, "https://store.example/sku");
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

  const response = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://under.example/sku",
      whyTestThisToday: "Cheaper SKU still belongs on the brief",
      bidUsd: "8",
    }),
  });
  assert.equal(response.statusCode, 303);

  const listings = listToday(db, day);
  assert.equal(listings.length, 2);
  assert.equal(listings[0]?.id, "lst-cover");
  assert.equal(listings[0]?.rank, 1);
  assert.equal(listings[1]?.productUrl, "https://under.example/sku");
  assert.equal(listings[1]?.bidUsd, 8);
  assert.equal(listings[1]?.rank, 2);
  assert.notEqual(listings[1]?.rank, 1);
});

test("abandoned fixture session does not insert a listing", async () => {
  const checkout = new FixtureCheckout({ autoComplete: false });
  const app = await buildApp({ databasePath: ":memory:", checkout });
  after(() => app.close());

  const started = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://ghost.example/sku",
      whyTestThisToday: "Abandoned Polar session must not list",
      bidUsd: "12",
    }),
  });
  assert.equal(started.statusCode, 303);
  const location = String(started.headers.location ?? "");
  assert.match(location, /\/checkout\/complete\?session=/);
  assert.equal(listToday(app.db, dayKey()).length, 0);

  const sessionId = new URL(location, "http://localhost").searchParams.get("session");
  assert.ok(sessionId);
  await checkout.abandonSession(sessionId);

  const complete = await app.inject({
    method: "GET",
    url: `/checkout/complete?session=${encodeURIComponent(sessionId)}`,
  });
  assert.equal(complete.statusCode, 303);
  assert.equal(complete.headers.location, "/");
  assert.equal(listToday(app.db, dayKey()).length, 0);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /data-empty-board/);
  assert.doesNotMatch(board.body, /ghost\.example/);
});

test("open fixture session lists only after complete", async () => {
  const checkout = new FixtureCheckout({ autoComplete: false });
  const app = await buildApp({ databasePath: ":memory:", checkout });
  after(() => app.close());

  const started = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://later.example/sku",
      whyTestThisToday: "Pay later still claims the rank",
      bidUsd: "7",
    }),
  });
  const sessionId = new URL(
    String(started.headers.location),
    "http://localhost",
  ).searchParams.get("session");
  assert.ok(sessionId);
  assert.equal(listToday(app.db, dayKey()).length, 0);

  const complete = await app.inject({
    method: "GET",
    url: `/checkout/complete?session=${encodeURIComponent(sessionId)}`,
  });
  assert.equal(complete.statusCode, 303);
  const listings = listToday(app.db, dayKey());
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.bidUsd, 7);
  assert.equal(listings[0]?.rank, 1);
});

test("bids below $5 are rejected and never charged", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://cheap.example/sku",
      whyTestThisToday: "Four dollars is under the floor",
      bidUsd: "4",
    }),
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.body, /whole dollar >= 5/);
  assert.equal(listToday(app.db, dayKey()).length, 0);
});

test("fixture webhook from recorded Polar paid event inserts the listing", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const paid = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: { "content-type": "application/json" },
    payload: loadPolarFixture("checkout-paid.json"),
  });
  assert.equal(paid.statusCode, 200);
  assert.deepEqual(paid.json(), { received: true, applied: true });

  const listings = listToday(app.db, "2026-08-22");
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.productUrl, "https://store.example/sku");
  assert.equal(listings[0]?.bidUsd, 5);
  assert.equal(listings[0]?.clicks, 0);

  const again = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: { "content-type": "application/json" },
    payload: loadPolarFixture("checkout-paid.json"),
  });
  assert.equal(again.statusCode, 200);
  assert.equal(listToday(app.db, "2026-08-22").length, 1);
});

test("recorded expired Polar session is a no-op", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const expired = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: { "content-type": "application/json" },
    payload: loadPolarFixture("checkout-expired.json"),
  });
  assert.equal(expired.statusCode, 200);
  assert.deepEqual(expired.json(), { received: true, applied: false });
  assert.equal(listToday(app.db, "2026-08-22").length, 0);
});

test("polarApiBase defaults to production and honors POLAR_API_BASE", () => {
  assert.equal(polarApiBase({}), POLAR_API_BASE);
  assert.equal(polarApiBase({ POLAR_API_BASE: "" }), POLAR_API_BASE);
  assert.equal(
    polarApiBase({ POLAR_API_BASE: "https://sandbox-api.polar.sh/" }),
    "https://sandbox-api.polar.sh",
  );
});

test("live PolarCheckout never fetches unless POLAR_LIVE=1", async () => {
  assert.throws(
    () => new PolarCheckout({ env: {} }),
    /PolarCheckout requires POLAR_LIVE=1/,
  );
  assert.throws(
    () =>
      new PolarCheckout({
        env: { POLAR_LIVE: "1" },
      }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );

  let fetches = 0;
  const polar = new PolarCheckout({
    env: {
      POLAR_LIVE: "1",
      POLAR_ACCESS_TOKEN: "polar_tok_test",
      PUBLIC_BASE_URL: "http://localhost:3000",
    },
    fetch: async (input) => {
      fetches += 1;
      assert.equal(String(input), `${polarApiBase({})}/v1/checkouts/`);
      return new Response(loadPolarFixture("checkout-created.json"), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const session = await polar.createSession({
    productUrl: "https://store.example/sku",
    whyTestThisToday: "Test this restock on today's brief",
    bidUsd: 5,
    day: "2026-08-22",
    chargeUsd: 5,
  });
  assert.equal(fetches, 1);
  assert.equal(session.id, "chk_recorded_open");
  assert.equal(session.status, "open");
  await assert.rejects(
    polar.completeSession(session.id),
    /completes via webhook only/,
  );
});

test("live PolarCheckout posts to POLAR_API_BASE override and includes product_id", async () => {
  let postedUrl = "";
  let postedBody: Record<string, unknown> | undefined;
  const polar = new PolarCheckout({
    env: {
      POLAR_LIVE: "1",
      POLAR_ACCESS_TOKEN: "polar_tok_test",
      POLAR_API_BASE: "https://sandbox-api.polar.sh",
      POLAR_PRODUCT_ID: "prod_sandbox_test",
      PUBLIC_BASE_URL: "http://localhost:3000",
    },
    fetch: async (input, init) => {
      postedUrl = String(input);
      postedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(loadPolarFixture("checkout-created.json"), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await polar.createSession({
    productUrl: "https://store.example/sku",
    whyTestThisToday: "Test this restock on today's brief",
    bidUsd: 5,
    day: "2026-08-22",
    chargeUsd: 5,
  });
  assert.equal(postedUrl, "https://sandbox-api.polar.sh/v1/checkouts/");
  assert.equal(postedBody?.product_id, "prod_sandbox_test");
  assert.equal(postedBody?.amount, 500);
});

test("live Polar webhook applies only with a valid signature", async () => {
  const secret = "whsec_test";
  const polar = new PolarCheckout({
    env: {
      POLAR_LIVE: "1",
      POLAR_ACCESS_TOKEN: "polar_tok_test",
      POLAR_WEBHOOK_SECRET: secret,
    },
    fetch: async () => {
      throw new Error("live Polar must not fetch from webhook tests");
    },
  });
  const app = await buildApp({ databasePath: ":memory:", checkout: polar });
  after(() => app.close());

  const raw = loadPolarFixture("underbid-paid.json");
  const unsigned = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: { "content-type": "application/json" },
    payload: raw,
  });
  assert.equal(unsigned.statusCode, 400);
  assert.equal(listToday(app.db, "2026-08-22").length, 0);

  const webhookId = "msg_1";
  const timestamp = "1710000000";
  const signature = createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.${raw}`)
    .digest("base64");
  const signed = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: {
      "content-type": "application/json",
      "webhook-id": webhookId,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    },
    payload: raw,
  });
  assert.equal(signed.statusCode, 200);
  assert.deepEqual(signed.json(), { received: true, applied: true });
  const listings = listToday(app.db, "2026-08-22");
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.bidUsd, 8);
  assert.equal(listings[0]?.productUrl, "https://under.example/sku");
});
