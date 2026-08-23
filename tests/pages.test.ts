import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { placeBid } from "../src/core/board.js";
import { dayKey, formatIssueDate } from "../src/core/day.js";
import { openDatabase } from "../src/db.js";
import { renderAboutPage } from "../src/http/pages/about.js";
import { renderRulesPage } from "../src/http/pages/rules.js";
import { renderBoardPage } from "../src/views/board.js";
import { formatFolioDate } from "../src/views/html.js";

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
  assert.match(body, /Claim #1 for/);
  assert.match(body, /aria-label="Decrease bid by one dollar"/);
  assert.match(body, /aria-label="Increase bid by one dollar"/);
  assert.match(body, />Outbid</);
  assert.match(body, /name="productUrl"/);
  assert.match(body, /name="whyTestThisToday"/);
  assert.match(body, /Why test this today/);
  assert.match(body, /New spots start at \$5/);
  assert.match(body, /whatever place that bid can take/);
  assert.match(body, /You pay only the difference/);
  assert.match(body, /data-empty-board/);
  assert.match(body, /No listings yet today/);
  assert.match(body, /Quiet morning/);
  assert.match(body, /Morning merch desk/);
  assert.match(body, /data-issue-date="/);
  assert.match(body, /One cover/);
  assert.doesNotMatch(body, /category zoo|Fulfillment tools|Browse categories/);
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
  assert.match(body, /This morning’s cover/);
  assert.match(body, /Why test this today/);
  assert.match(body, /Also on the desk/);
  assert.match(body, /row-cover/);

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
  assert.match(response.body, /Quiet morning/);
  assert.doesNotMatch(response.body, /yesterday\.example/);
  assert.doesNotMatch(response.body, /\$99/);
});

test("masthead, folio, and data-issue-date name the same day in UTC+12", () => {
  const day = "2026-08-23";
  const tz = "Pacific/Auckland";
  const body = renderBoardPage({
    day,
    tz,
    listings: [],
    defaultBidUsd: 5,
  });
  const spoken = formatIssueDate(day, tz);
  const folio = formatFolioDate(day);
  assert.equal(spoken, "Sunday, August 23, 2026");
  assert.match(body, /data-issue-date="2026-08-23"/);
  assert.match(body, new RegExp(spoken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(body, new RegExp(folio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(body, /August 24, 2026/);
  assert.doesNotMatch(body, /Aug 24, 2026/);
});

test("GET / prints today's date as the issue on a morning desk", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const day = dayKey();
  const body = response.body;
  assert.match(body, new RegExp(`data-issue-date="${day}"`));
  assert.match(body, new RegExp(formatIssueDate(day).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(body, new RegExp(formatFolioDate(day).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(body, /Morning merch desk/);
  assert.match(body, /Date is the issue/);
  assert.match(body, /bid-field/);
  assert.match(body, /text-decoration-style: dashed/);
});

test("SPEC acceptance 10: GET /about and GET /rules are 200", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const about = await app.inject({ method: "GET", url: "/about" });
  const rules = await app.inject({ method: "GET", url: "/rules" });

  assert.equal(about.statusCode, 200);
  assert.equal(rules.statusCode, 200);
  assert.match(about.headers["content-type"] ?? "", /text\/html/);
  assert.match(rules.headers["content-type"] ?? "", /text\/html/);
});

test("GET /about states no ads, no API keys, no revenue share, $5 floor, daily UTC", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/about" });
  assert.equal(response.statusCode, 200);
  const body = response.body;
  assert.match(body, /aria-current="page"/);
  assert.match(body, /data-page="about"/);
  assert.match(body, /No ads/);
  assert.match(body, /No API keys/);
  assert.match(body, /No revenue share/);
  assert.match(body, /\$5/);
  assert.match(body, /Rank is the bid/);
  assert.match(body, /older listing keeps the higher rank/);
  assert.match(body, /DTC \/ Shopify \/ Amazon/);
  assert.match(body, /Global sellers/);
  assert.match(body, /English/);
  assert.match(body, /USD/);
  assert.match(body, /BOARD_TZ/);
  assert.match(body, /UTC/);
  assert.match(body, /00:00/);
  assert.match(body, /dtc-picks-daily/);
  assert.match(body, /outbid\.lol/);
  assert.match(body, /Chat and invite links/);
  assert.match(body, /NSFW/);
  assert.match(body, /tracking/);
  assert.match(body, /difference/);
  assert.doesNotMatch(body, /POLAR_LIVE=1/);
  assert.doesNotMatch(body, /api\.polar\.sh/);
});

test("GET /rules states ranking, raise difference, bans, reset, clicks, Polar", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/rules" });
  assert.equal(response.statusCode, 200);
  const body = response.body;
  assert.match(body, /aria-current="page"/);
  assert.match(body, /data-page="rules"/);
  assert.match(body, /No ads/);
  assert.match(body, /No API keys/);
  assert.match(body, /No revenue share/);
  assert.match(body, /Minimum <strong>\$5<\/strong>/);
  assert.match(body, /Step <strong>\$1<\/strong>/);
  assert.match(body, /older/);
  assert.match(body, /difference/);
  assert.match(body, /newBid − currentBid/);
  assert.match(body, /BOARD_TZ/);
  assert.match(body, /UTC/);
  assert.match(body, /00:00/);
  assert.match(body, /Telegram/);
  assert.match(body, /WhatsApp/);
  assert.match(body, /Discord/);
  assert.match(body, /NSFW/);
  assert.match(body, /utm_\*/);
  assert.match(body, /stripped/);
  assert.match(body, /Clicking does not change rank/);
  assert.match(body, /Polar Checkout/);
  assert.match(body, /abandoned checkout/);
  assert.match(body, /D is on the board even though D did not take #1/);
  assert.match(body, /no extra[\s\S]*ranking factors/i);
  assert.match(body, /no recency boost/i);
  assert.doesNotMatch(body, /trending score/);
});

test("GET /about and GET /rules document BOARD_TZ when it is not UTC", () => {
  const about = renderAboutPage({ tz: "America/New_York" });
  const rules = renderRulesPage({ tz: "America/New_York" });
  assert.match(about, /America\/New_York/);
  assert.match(rules, /America\/New_York/);
  assert.match(about, /BOARD_TZ/);
  assert.match(rules, /Default <strong>UTC<\/strong>/);
});
