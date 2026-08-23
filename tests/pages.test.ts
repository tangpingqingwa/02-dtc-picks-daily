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
  assert.doesNotMatch(body, /data-list-under-cover/);
  assert.doesNotMatch(body, /data-list-after-why/);
  assert.doesNotMatch(body, /data-take-after-list/);
  assert.doesNotMatch(body, /data-list-after-take/);
  assert.doesNotMatch(body, /data-first-click="take"/);
  assert.doesNotMatch(body, /data-first-write="list"/);
  assert.doesNotMatch(body, /data-take-after-list-first/);
  assert.doesNotMatch(body, /data-cover-why/);
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
  assert.match(body, /data-cover-why=""/);
  assert.match(body, /Also on the desk/);
  assert.match(body, /row-cover/);
  assert.match(body, /List a product/);
  assert.match(body, /data-list-under-cover=""/);
  assert.match(body, /href="#claim"/);
  assert.match(body, /data-cover-hop=""/);
  assert.match(body, /data-first-click="take"/);
  assert.match(body, /href="\/r\/lst-cover"/);
  assert.match(body, /aria-label="Test this today at cover\.example\/apps\/pick"/);
  const coverAt = body.indexOf('data-listing-id="lst-cover"');
  const hopAt = body.indexOf("data-cover-hop");
  const listHopAt = body.indexOf('data-list-under-cover=""');
  const claimAt = body.indexOf('id="claim"');
  const stackAt = body.indexOf("Also on the desk");
  const coverWhyAt = body.indexOf('data-cover-why=""');
  const listAfterAt = body.indexOf('data-list-after-why=""');
  const hopLabelAt = body.indexOf(">Test this today<");
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(coverAt > -1 && claimAt > coverAt, "today’s #1 must precede claim chrome");
  assert.ok(listHopAt > -1 && listHopAt < coverAt, "seller list hop sits above the paid cover");
  assert.ok(hopAt > coverAt && hopAt < claimAt, "cover hop lives on today’s #1, not the listing form");
  assert.ok(hopLabelAt > hopAt && hopLabelAt < claimAt, "Test this today is the cover action, not a field label");
  assert.ok(coverWhyAt > coverAt && coverWhyAt < hopAt, "cover why-line is the first cover read, before Test this today");
  assert.ok(listAfterAt > coverWhyAt && listAfterAt < hopAt, "list-after-why sits under the why-line, before Test this today");
  assert.ok(hopAt > listAfterAt && hopAt < body.indexOf(">$20<"), "Test this today takes after list-after-why, before $bid");
  const listAfterTakeAt = body.indexOf('data-list-after-take=""');
  assert.ok(listAfterTakeAt > hopAt && listAfterTakeAt < body.indexOf(">$20<"), "list-after-take sits after Test this today, before $bid");
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");
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
  assert.doesNotMatch(response.body, /data-cover-why/);
  assert.doesNotMatch(response.body, /data-cover-hop/);
  assert.doesNotMatch(response.body, /data-list-under-cover/);
  assert.doesNotMatch(response.body, /data-list-after-why/);
  assert.doesNotMatch(response.body, /data-take-after-list/);
  assert.doesNotMatch(response.body, /data-list-after-take/);
  assert.doesNotMatch(response.body, /data-first-click="take"/);
  assert.doesNotMatch(response.body, /data-first-write="list"/);
  assert.doesNotMatch(response.body, /data-take-after-list-first/);
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
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /href="\/r\/lst-cover"/);
  assert.match(cover, /data-cover-why=""/);
  assert.match(cover, /Why test this today/);
  assert.match(cover, /Cover app sellers should install this morning/);
  assert.match(cover, /data-list-after-why=""/);
  assert.match(cover, /data-take-after-list=""/);
  const listAfterAt = cover.indexOf("data-list-after-why");
  const hopAt = cover.indexOf("data-cover-hop");
  const takeAt = cover.indexOf("data-take-after-list");
  const bidAt = cover.indexOf(">$20<");
  assert.ok(listAfterAt > -1 && hopAt > listAfterAt, "Test this today sits after list-after-why");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "the take wrap is the next control after listing");
  assert.ok(hopAt < bidAt && hopAt < cover.indexOf('class="host"'), "taking the cover is not buried under host or $bid");
  assert.doesNotMatch(cover, /class="row-link" href=/);
  assert.match(under, /href="\/r\/lst-under"/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /data-cover-why/);
  assert.doesNotMatch(under, /data-list-after-why/);
  assert.doesNotMatch(under, /data-take-after-list/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-why=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-why=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");
});

test("GET / gives a seller one List a product hop under a paid cover", async () => {
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
  const listHopAt = body.indexOf('data-list-under-cover=""');
  const listAfterAt = body.indexOf('data-list-after-why=""');
  const coverAt = body.indexOf('data-listing-id="lst-cover"');
  const hopAt = body.indexOf("data-cover-hop");
  const claimAt = body.indexOf('id="claim"');
  const coverWhyAt = body.indexOf('data-cover-why=""');
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  const kickerAt = body.indexOf('class="claim-kicker"');

  assert.match(body, /data-list-under-cover=""/);
  assert.match(body, /data-list-after-why=""/);
  assert.match(body, /href="#claim"/);
  assert.match(body, /under today’s cover/);
  assert.match(body, /Paying less than #1 still lists/);
  assert.equal((body.match(/data-list-under-cover=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-why=""/g) ?? []).length, 1);
  assert.ok(listHopAt > -1 && listHopAt < coverAt, "seller list hop sits above today’s cover, not below the fold");
  assert.ok(listHopAt < hopAt, "listing hop is not the shopper cover hop");
  assert.ok(coverWhyAt > coverAt && listAfterAt > coverWhyAt && listAfterAt < hopAt, "list-after-why sits under the cover reason, before Test this today");
  assert.ok(claimAt > coverAt, "the listing form still lives under the cover");
  assert.ok(kickerAt > claimAt, "List a product kicker stays on the form");
  assert.ok(coverWhyAt > coverAt && coverWhyAt < hopAt, "cover why-line sits on today’s #1, before the hop");
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
});

test("GET / names why this is today’s cover before $bid and the hop", async () => {
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

  assert.match(cover, /data-cover-why=""/);
  assert.match(cover, /<p class="cover-why-label">Why test this today<\/p>/);
  assert.match(cover, /<p class="cover-why-line">Cover app sellers should install this morning<\/p>/);
  assert.match(cover, /data-list-after-why=""/);
  assert.doesNotMatch(cover, /class="blurb"/);
  const whyAt = cover.indexOf("data-cover-why");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const bidAt = cover.indexOf(">$20<");
  const hopAt = cover.indexOf("data-cover-hop");
  assert.ok(whyAt > -1 && whyAt < bidAt, "cover reason precedes $bid");
  assert.ok(whyAt < hopAt, "cover reason precedes Test this today");
  assert.ok(listAfterAt > whyAt && listAfterAt < hopAt, "list-after-why sits after the why-line, before Test this today");
  assert.ok(hopAt < bidAt, "Test this today takes after list-after-why, before $bid");

  assert.match(under, /class="blurb"/);
  assert.match(under, /Cheaper SKU still belongs on the brief/);
  assert.doesNotMatch(under, /data-cover-why/);
  assert.doesNotMatch(under, /data-list-after-why/);
  assert.doesNotMatch(under, /Why test this today/);
  assert.equal((body.match(/data-cover-why=""/g) ?? []).length, 1);
  assert.doesNotMatch(body, /data-empty-board/);
});

test("GET / lists after the why-line on a paid cover", async () => {
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

  assert.match(cover, /data-cover-why=""/);
  assert.match(cover, /data-list-after-why=""/);
  assert.match(cover, /href="#claim"/);
  assert.match(cover, />List a product</);
  assert.match(cover, /under this reason/);
  assert.match(cover, /Paying less than #1 still lists/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const hopAt = cover.indexOf("data-cover-hop");
  const bidAt = cover.indexOf(">$20<");
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "seller hop sits after the labeled why-line");
  assert.ok(listAfterAt < hopAt, "seller hop is not the shopper Test this today hop");
  assert.ok(listAfterAt < bidAt, "listing after the why-line is not buried under $bid");

  assert.doesNotMatch(under, /data-list-after-why/);
  assert.doesNotMatch(under, /under this reason/);
  assert.equal((body.match(/data-list-after-why=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-under-cover=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-list-after-why/);
  assert.doesNotMatch(empty.body, /under this reason/);
  assert.doesNotMatch(empty.body, /data-take-after-list/);
});

test("GET / takes the cover after list-after-why", async () => {
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

  assert.match(cover, /data-list-after-why=""/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /href="\/r\/lst-cover"/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "the shopper take is the next control after listing");
  assert.ok(hopAt < bidAt && hopAt < hostAt, "Test this today is not quieter than host or $bid");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "one cover hop");

  assert.doesNotMatch(under, /data-take-after-list/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-take-after-list=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-why=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-under-cover=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-take-after-list/);
  assert.doesNotMatch(empty.body, /data-cover-hop/);
  assert.doesNotMatch(empty.body, /Test this today/);
});

test("GET / lists after Test this today", async () => {
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

  assert.match(cover, /data-list-after-why=""/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /class="list-after-take list-after-take-first"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"/);
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(cover, /Paying less than #1 still lists/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(listAfterTakeAt > hopAt, "seller write is the next control after Test this today");
  assert.ok(firstWriteAt > hopAt && firstWriteAt > listAfterTakeAt, "first write is stamped on list-after-take");
  assert.ok(listAfterTakeAt < bidAt && listAfterTakeAt < hostAt, "listing after the take is not buried under host or $bid");
  assert.ok((cover.match(/data-list-after-take/g) ?? []).length === 1, "one list-after-take hop");

  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.doesNotMatch(under, /data-take-after-list/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-why=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-under-cover=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-list-after-take/);
  assert.doesNotMatch(empty.body, /data-first-write="list"/);
  assert.doesNotMatch(empty.body, /after Test this today/);
  assert.doesNotMatch(empty.body, /data-take-after-list/);
  assert.doesNotMatch(empty.body, /Test this today/);
});

test("GET / lets Test this today win the first click after list-after-take", async () => {
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

  assert.match(cover, /data-list-after-why=""/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, /data-take-after-list-first=""/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /href="\/r\/lst-cover"/);
  assert.match(cover, /class="list-after-take list-after-take-first"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"/);
  assert.match(cover, /after Test this today/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today is the first click, before list-after-take");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "concentrated take stays on the existing first-click hop");
  assert.ok(listAfterTakeAt > hopAt, "seller write stays the next control after Test this today");
  assert.ok(firstWriteAt > firstClickAt && firstWriteAt > listAfterTakeAt, "first write is stamped on the hop after the take");
  assert.ok(listAfterTakeAt < bidAt && listAfterTakeAt < hostAt, "listing after the take is not buried under host or $bid");
  assert.ok((cover.match(/data-first-click="take"/g) ?? []).length === 1, "one first-click take");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-first-write="list"/g) ?? []).length === 1, "one first-write list");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "one cover hop");

  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.doesNotMatch(under, /data-take-after-list/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-why=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-under-cover=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-first-click="take"/);
  assert.doesNotMatch(empty.body, /data-first-write="list"/);
  assert.doesNotMatch(empty.body, /data-take-after-list-first/);
  assert.doesNotMatch(empty.body, /data-list-after-take/);
  assert.doesNotMatch(empty.body, /after Test this today/);
  assert.doesNotMatch(empty.body, /data-take-after-list/);
  assert.doesNotMatch(empty.body, /Test this today/);
});

test("GET / concentrates List a product as the first write after the take", async () => {
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

  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, /data-take-after-list-first=""/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /class="list-after-take list-after-take-first"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"/);
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(cover, /Paying less than #1 still lists/);
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  const claimAt = body.indexOf('id="claim"');
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(firstClickAt > -1 && firstClickAt < listAfterTakeAt, "shopper take stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "concentrated take stays on the existing hop");
  assert.ok(firstWriteAt > hopAt && firstWriteAt > listAfterTakeAt, "first write concentrates the existing list-after-take hop");
  assert.ok(firstWriteAt < bidAt && firstWriteAt < hostAt, "first write is not buried under host or $bid");
  assert.ok((cover.match(/data-first-write="list"/g) ?? []).length === 1, "one first-write list");
  assert.ok((cover.match(/data-list-after-take/g) ?? []).length === 1, "no extra named list hop");
  assert.ok(claimAt > coverStart, "the listing form still lives under the cover");
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");

  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /class="list-after-take list-after-take-first"/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-first-write="list"/);
  assert.doesNotMatch(empty.body, /class="list-after-take list-after-take-first"/);
  assert.doesNotMatch(empty.body, /data-list-after-take/);
  assert.doesNotMatch(empty.body, /after Test this today/);
  assert.doesNotMatch(empty.body, /data-first-click="take"/);
  assert.doesNotMatch(empty.body, /data-take-after-list-first/);
});


test("GET / concentrates Test this today after List a product is the first write", async () => {
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

  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, /data-take-after-list-first=""/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""/,
  );
  assert.match(cover, />Test this today</);
  assert.match(cover, /class="list-after-take list-after-take-first"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the existing take hop is concentrated after the first-write stamp");
  assert.ok(firstWriteAt > takeFirstAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(takeFirstAt < bidAt && takeFirstAt < hostAt, "concentrated take is not buried under host or $bid");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "no extra named take hop");
  assert.ok((cover.match(/data-first-click="take"/g) ?? []).length === 1, "one first-click take");

  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /class="cover-hop cover-hop-first take-after-list-first"/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-take-after-list-first/);
  assert.doesNotMatch(empty.body, /class="cover-hop cover-hop-first take-after-list-first"/);
  assert.doesNotMatch(empty.body, /data-first-click="take"/);
  assert.doesNotMatch(empty.body, /Test this today/);
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
