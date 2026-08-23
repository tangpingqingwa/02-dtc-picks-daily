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
  assert.match(body, /List a product/);
  assert.doesNotMatch(body, /data-cover-hop/);
  assert.doesNotMatch(body, /Test this today/);
  const emptyAt = body.indexOf("data-empty-board");
  const claimAt = body.indexOf('id="claim"');
  assert.ok(emptyAt > -1 && claimAt > emptyAt, "quiet morning must precede claim chrome");
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
  assert.match(body, /List a product/);
  assert.match(body, /data-cover-hop=""/);
  assert.match(body, /href="\/r\/lst-cover"/);
  assert.match(body, /aria-label="Test this today at cover\.example\/apps\/pick"/);
  const coverAt = body.indexOf("row-cover");
  const hopAt = body.indexOf("data-cover-hop");
  const claimAt = body.indexOf('id="claim"');
  const stackAt = body.indexOf("Also on the desk");
  const whyAt = body.indexOf("Why test this today");
  const hopLabelAt = body.indexOf(">Test this today<");
  assert.ok(coverAt > -1 && claimAt > coverAt, "today’s #1 must precede claim chrome");
  assert.ok(hopAt > coverAt && hopAt < claimAt, "cover hop lives on today’s #1, not the listing form");
  assert.ok(hopLabelAt > hopAt && hopLabelAt < claimAt, "Test this today is the cover action, not a field label");
  assert.ok(whyAt > claimAt, "Why test this today stays the listing field, not the cover hop");
  assert.ok(stackAt > coverAt && stackAt < claimAt, "desk-stack rows stay under the cover, still before listing");
  assert.ok(stackAt > hopAt, "stack rows sit under the cover hop");
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/href="\/r\/lst-cover"/g) ?? []).length, 1);
  assert.doesNotMatch(body, /class="row-cover"[\s\S]*class="row-link" href=/);

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
  const boardAt = body.indexOf('id="leaderboard"');
  const claimAt = body.indexOf('id="claim"');
  assert.ok(boardAt > -1 && claimAt > boardAt, "first-time read is the desk, then the claim form");
});

test("GET / gives a shopper one Test this today hop on the paid cover", async () => {
  const db = openDatabase(":memory:");
  const day = dayKey();
  placeBid(db, {
    id: "lst-cover",
    day,
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 20,
    clicks: 3,
    createdAt: "2026-08-22T09:00:00.000Z",
  });
  placeBid(db, {
    id: "lst-under",
    day,
    productUrl: "https://under.example/sku",
    whyTestThisToday: "Cheaper SKU still belongs on the brief",
    bidUsd: 8,
    createdAt: "2026-08-22T12:00:00.000Z",
  });

  const app = await buildApp({ db });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = response.body;
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const coverEnd = body.indexOf("</article>", coverStart);
  const cover = body.slice(coverStart, coverEnd);
  const underStart = body.indexOf('data-listing-id="lst-under"');
  const underEnd = body.indexOf("</article>", underStart);
  const under = body.slice(underStart, underEnd);

  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /href="\/r\/lst-cover"/);
  assert.doesNotMatch(cover, /class="row-link" href=/);
  assert.doesNotMatch(cover, /Why test this today/);
  assert.match(under, /href="\/r\/lst-under"/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");
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
