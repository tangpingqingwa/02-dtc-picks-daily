import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { placeBid } from "../src/core/board.js";
import { dayKey } from "../src/core/day.js";
import { openDatabase } from "../src/db.js";

test("GET / is a public empty board with bid form", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/html/);
  const body = response.body;
  assert.match(body, /Leaderboard/);
  assert.match(body, /About/);
  assert.match(body, /Rules/);
  assert.match(body, /aria-label="Decrease bid by one dollar"/);
  assert.match(body, /aria-label="Increase bid by one dollar"/);
  assert.match(body, /name="productUrl"/);
  assert.match(body, /name="whyTestThisToday"/);
  assert.match(body, /Why test this today/);
  assert.match(body, /New spots start at \$5/);
  assert.match(body, /whatever place that bid can take/);
  assert.match(body, /data-empty-board/);
  assert.match(body, /No listings yet today/);
  assert.doesNotMatch(body, /POLAR_LIVE/);
  assert.doesNotMatch(body, /api\.polar\.sh/);
});

test("GET / ranks fixture-seeded rows by bid then older createdAt", async () => {
  const db = openDatabase(":memory:");
  const day = dayKey();
  placeBid(db, {
    id: "lst-under",
    day,
    productUrl: "https://under.example/sku",
    whyTestThisToday: "Cheaper SKU still belongs on the brief",
    bidUsd: 8,
    createdAt: "2026-08-22T12:00:00.000Z",
  });
  placeBid(db, {
    id: "lst-old-tie",
    day,
    productUrl: "https://older.example/sku",
    whyTestThisToday: "Older ten-dollar listing keeps the higher rank",
    bidUsd: 10,
    createdAt: "2026-08-22T10:00:00.000Z",
  });
  placeBid(db, {
    id: "lst-new-tie",
    day,
    productUrl: "https://newer.example/sku",
    whyTestThisToday: "Newer ten-dollar listing sits below the older tie",
    bidUsd: 10,
    createdAt: "2026-08-22T11:00:00.000Z",
  });
  placeBid(db, {
    id: "lst-cover",
    day,
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 20,
    clicks: 3,
    createdAt: "2026-08-22T09:00:00.000Z",
  });

  const app = await buildApp({ db });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = response.body;
  assert.doesNotMatch(body, /data-empty-board/);
  assert.match(body, /cover\.example\/apps\/pick/);
  assert.match(body, /\$20/);
  assert.match(body, /3 clicks/);
  assert.match(body, /claim this rank for \$21/);

  const order = [...body.matchAll(/data-listing-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["lst-cover", "lst-old-tie", "lst-new-tie", "lst-under"]);

  const ranks = [...body.matchAll(/data-rank="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(ranks, [1, 2, 3, 4]);
});

test("GET / does not show yesterday's cover on a new day", async () => {
  const db = openDatabase(":memory:");
  placeBid(db, {
    id: "lst-yesterday",
    day: "1999-01-01",
    productUrl: "https://yesterday.example/old",
    whyTestThisToday: "Yesterday's cover must leave today's board",
    bidUsd: 99,
    createdAt: "1999-01-01T00:00:00.000Z",
  });

  const app = await buildApp({ db });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /data-empty-board/);
  assert.doesNotMatch(response.body, /yesterday\.example/);
  assert.doesNotMatch(response.body, /\$99/);
});
