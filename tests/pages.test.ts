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
import { BOARD_CSS } from "../src/views/styles.js";

function pageBody(html: string): string {
  const start = html.indexOf('<div class="page">');
  return start >= 0 ? html.slice(start) : html;
}

function assertStripRankIsLast24hFact(stripHtml: string, ranks: number[]): void {
  for (const rank of ranks) {
    assert.match(stripHtml, new RegExp(`>24h ${rank}<`));
    assert.doesNotMatch(stripHtml, new RegExp(`(?<!24h )>#?${rank}<`));
  }
  assert.doesNotMatch(stripHtml, /This morning’s cover/);
  assert.doesNotMatch(stripHtml, /data-morning-slot=/);
  assert.doesNotMatch(stripHtml, /data-cover-name=/);
}

function assertTwoPrizes(html: string, coverId: string, stripPrizeId: string): void {
  html = pageBody(html);
  const coverStart = html.indexOf(`class="row row-cover row-1"`);
  const cover = html.slice(coverStart, html.indexOf("</article>", coverStart));
  assert.match(cover, new RegExp(`data-listing-id="${coverId}"`));
  const stripAt = html.indexOf('data-last24h=""');
  const claimAt = html.indexOf('id="claim"');
  const strip = html.slice(stripAt, claimAt);
  const prizeStart = strip.indexOf(`data-last24h-id="${stripPrizeId}"`);
  const prizeEnd = strip.indexOf("</li>", prizeStart);
  const prize = strip.slice(prizeStart, prizeEnd);
  assert.ok(coverStart > -1 && stripAt > coverStart, "morning slot stays above the rolling-window prize");
  assert.match(cover, /data-morning-slot=""/);
  assert.match(cover, /This morning’s cover/);
  assert.match(cover, /data-cover-name=""/);
  assert.match(cover, /class="row row-cover row-1"/);
  assert.doesNotMatch(cover, /data-last24h-prize=/);
  assert.doesNotMatch(cover, />24h /);
  assert.match(strip, /data-last24h-occupied=""/);
  assert.match(strip, /Cover #1 is this morning’s slot/);
  assert.match(prize, /data-last24h-prize=""/);
  assert.match(prize, /data-last24h-slot=""/);
  assert.match(prize, /Rolling 24h spend/);
  assert.match(prize, /data-last24h-fact=""/);
  assert.match(prize, />24h 1</);
  const hostAt = prize.indexOf("last24h-host");
  const rankAt = prize.indexOf("data-last24h-rank");
  assert.ok(hostAt > -1 && rankAt > hostAt, "strip 24h 1 recedes after the rolling-window host");
  assert.doesNotMatch(prize, /This morning’s cover/);
  assert.doesNotMatch(prize, /data-morning-slot=/);
  assert.doesNotMatch(prize, /data-cover-name=/);
  assert.equal((html.match(/data-morning-slot=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-last24h-prize=""/g) ?? []).length, 1);
  assert.equal((html.match(/This morning’s cover/g) ?? []).length, 1);
}

test("GET / is a public empty board with bid form", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/html/);
  const body = response.body;
  const desk = pageBody(body);
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
  assert.match(body, /data-empty-cover=""/);
  assert.match(body, /No listings yet today/);
  assert.match(body, /Quiet morning/);
  assert.match(body, /not an invented cover/);
  assert.match(body, /Morning merch desk/);
  assert.match(body, /data-issue-date="/);
  assert.match(body, /One cover/);
  assert.match(body, /data-empty-claim-first=""/);
  assert.match(body, /class="empty-claim-first"/);
  assert.match(body, /data-first-click="claim"/);
  assert.match(body, /aria-label="Claim #1"/);
  assert.match(body, /data-occupied="false"/);
  assert.doesNotMatch(body, /List a product/);
  assert.doesNotMatch(body, /class="claim-kicker"/);
  assert.match(body, /data-last24h=""/);
  assert.match(body, /data-last24h-window="rolling-24h"/);
  assert.match(body, /data-last24h-empty=""/);
  assert.match(body, /data-last24h-empty-strip=""/);
  assert.match(body, /No paid listings in the last 24 hours/);
  assert.match(body, /rolling last 24 hours/);
  assert.match(body, /No invented #1/);
  assert.doesNotMatch(body, /data-last24h-row/);
  assert.doesNotMatch(body, /data-last24h-rank/);
  assert.doesNotMatch(body, /data-last24h-fact/);
  assert.doesNotMatch(body, /This morning’s cover/);
  assert.doesNotMatch(body, /class="row-cover/);
  assert.doesNotMatch(body, /data-cover-hop/);
  assert.doesNotMatch(body, /Test this today/);
  assert.doesNotMatch(body, /data-list-under-cover/);
  assert.doesNotMatch(body, /data-list-after-why/);
  assert.doesNotMatch(body, /data-take-after-list/);
  assert.doesNotMatch(body, /data-list-after-take/);
  assert.doesNotMatch(body, /data-first-click="take"/);
  assert.doesNotMatch(body, /data-first-write="list"/);
  assert.doesNotMatch(body, /data-take-after-list-first/);
  assert.doesNotMatch(body, /data-list-after-take-two/);
  assert.doesNotMatch(body, /data-take-after-list-two/);
  assert.doesNotMatch(body, /data-list-after-take-three/);
  assert.doesNotMatch(body, /data-list-after-take-four/);
  assert.doesNotMatch(body, /data-list-after-take-five/);
  assert.doesNotMatch(body, /data-list-after-take-six/);
  assert.doesNotMatch(body, /data-take-after-list-three/);
  assert.doesNotMatch(body, /data-take-after-list-four/);
  assert.doesNotMatch(body, /data-take-after-list-five/);
  assert.doesNotMatch(body, /data-take-after-list-six/);
  assert.doesNotMatch(body, /data-cover-why/);
  assert.doesNotMatch(body, /data-cover-name=""/);
  assert.doesNotMatch(body, /data-later-fact=""/);
  assert.doesNotMatch(body, /class="bid later-fact"/);
  assert.doesNotMatch(body, /data-occupied="true"/);
  assert.doesNotMatch(desk, /data-two-prizes=/);
  assert.doesNotMatch(desk, /data-morning-slot=/);
  assert.doesNotMatch(desk, /data-last24h-prize=/);
  assert.doesNotMatch(desk, /data-last24h-occupied=/);
  const emptyAt = body.indexOf("data-empty-board");
  const stripAt = body.indexOf('data-last24h=""');
  const claimAt = body.indexOf('id="claim"');
  const emptyClaimAt = body.indexOf('data-empty-claim-first=""', claimAt);
  const firstClickAt = body.indexOf('data-first-click="claim"');
  assert.ok(emptyAt > -1 && claimAt > emptyAt, "quiet morning must precede claim chrome");
  assert.ok(stripAt > emptyAt && stripAt < claimAt, "last-24h strip sits under the one cover, before claim chrome");
  assert.ok(emptyClaimAt > claimAt && firstClickAt > emptyClaimAt, "empty Claim #1 is the only first click");
  assert.equal((body.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((body.match(/data-empty-claim-first=""/g) ?? []).length, 2);
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
  assert.match(response.body, /data-empty-cover=""/);
  assert.match(response.body, /Quiet morning/);
  assert.match(response.body, /data-last24h-empty=""/);
  assert.doesNotMatch(response.body, /yesterday\.example/);
  assert.doesNotMatch(response.body, /\$99/);
  assert.doesNotMatch(response.body, /data-cover-why/);
  assert.doesNotMatch(response.body, /data-cover-name=""/);
  assert.doesNotMatch(response.body, /data-later-fact=""/);
  assert.doesNotMatch(response.body, /class="bid later-fact"/);
  assert.doesNotMatch(response.body, /data-cover-hop/);
  assert.doesNotMatch(response.body, /data-list-under-cover/);
  assert.doesNotMatch(response.body, /data-list-after-why/);
  assert.doesNotMatch(response.body, /data-take-after-list/);
  assert.doesNotMatch(response.body, /data-list-after-take/);
  assert.doesNotMatch(response.body, /data-first-click="take"/);
  assert.doesNotMatch(response.body, /data-first-write="list"/);
  assert.doesNotMatch(response.body, /data-take-after-list-first/);
  assert.doesNotMatch(response.body, /data-list-after-take-two/);
  assert.doesNotMatch(response.body, /data-take-after-list-two/);
  assert.doesNotMatch(response.body, /data-list-after-take-three/);
  assert.doesNotMatch(response.body, /data-list-after-take-four/);
  assert.doesNotMatch(response.body, /data-list-after-take-five/);
  assert.doesNotMatch(response.body, /data-list-after-take-six/);
  assert.doesNotMatch(response.body, /data-take-after-list-three/);
  assert.doesNotMatch(response.body, /data-take-after-list-four/);
  assert.doesNotMatch(response.body, /data-take-after-list-five/);
  assert.doesNotMatch(response.body, /data-take-after-list-six/);
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
  assert.match(body, /data-last24h=""/);
  assert.match(body, /data-last24h-empty=""/);
  assert.match(body, /data-empty-cover=""/);
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
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-why=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-why=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);

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
  assert.match(cover, /<p class="cover-why-line" data-prize-before-price="">Cover app sellers should install this morning<\/p>/);
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
  assert.match(cover, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/);
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
  assert.ok((cover.match(/data-list-after-take=""/g) ?? []).length === 1, "one list-after-take hop");

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
  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-list-after-take-two=""/);
  assert.match(cover, /data-list-after-take-three=""/);
  assert.match(cover, /data-list-after-take-four=""/);
  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /href="\/r\/lst-cover"/);
  assert.match(cover, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/);
  assert.match(cover, /after Test this today/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today is the first click, before list-after-take");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "concentrated take stays on the existing first-click hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(listAfterTakeAt > hopAt, "seller write stays the next control after Test this today");
  assert.ok(firstWriteAt > firstClickAt && firstWriteAt > listAfterTakeAt, "first write is stamped on the hop after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(listAfterTakeAt < bidAt && listAfterTakeAt < hostAt, "listing after the take is not buried under host or $bid");
  assert.ok((cover.match(/data-first-click="take"/g) ?? []).length === 1, "one first-click take");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok((cover.match(/data-first-write="list"/g) ?? []).length === 1, "one first-write list");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "one cover hop");

  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.doesNotMatch(under, /data-take-after-list/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);
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
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
  assert.doesNotMatch(empty.body, /data-list-after-take-two/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
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
  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-list-after-take-two=""/);
  assert.match(cover, /data-list-after-take-three=""/);
  assert.match(cover, /data-list-after-take-four=""/);
  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(cover, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/);
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(cover, /Paying less than #1 still lists/);
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  const claimAt = body.indexOf('id="claim"');
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(firstClickAt > -1 && firstClickAt < listAfterTakeAt, "shopper take stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "concentrated take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > hopAt && firstWriteAt > listAfterTakeAt, "first write concentrates the existing list-after-take hop");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(firstWriteAt < bidAt && firstWriteAt < hostAt, "first write is not buried under host or $bid");
  assert.ok((cover.match(/data-first-write="list"/g) ?? []).length === 1, "one first-write list");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");
  assert.ok((cover.match(/data-list-after-take=""/g) ?? []).length === 1, "no extra named list hop");
  assert.ok(claimAt > coverStart, "the listing form still lives under the cover");
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");

  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /class="list-after-take list-after-take-first"/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);
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
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
  assert.doesNotMatch(empty.body, /data-list-after-take-two/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
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
  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  assert.match(cover, />Test this today</);
  assert.match(cover, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the existing take hop is concentrated after the first-write stamp");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeFirstAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(takeFirstAt < bidAt && takeFirstAt < hostAt, "concentrated take is not buried under host or $bid");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "no extra named take hop");
  assert.ok((cover.match(/data-first-click="take"/g) ?? []).length === 1, "one first-click take");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");

  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-take-after-list-first/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
  assert.doesNotMatch(empty.body, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(empty.body, /data-first-click="take"/);
  assert.doesNotMatch(empty.body, /Test this today/);
  assert.doesNotMatch(empty.body, /data-list-after-take-two/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
});

test("GET / concentrates List a product after Test this today is re-concentrated", async () => {
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

  assert.match(cover, /data-take-after-list-first=""/);
  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-list-after-take-two=""/);
  assert.match(cover, /data-list-after-take-three=""/);
  assert.match(cover, /data-list-after-take-four=""/);
  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(
    cover,
    /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/,
  );
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(cover, /Paying less than #1 still lists/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  const claimAt = body.indexOf('id="claim"');
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeFirstAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "the existing list hop is concentrated after the taller take");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(listTwoAt < bidAt && listTwoAt < hostAt, "concentrated list is not buried under host or $bid");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");
  assert.ok((cover.match(/data-list-after-take=""/g) ?? []).length === 1, "no extra named list hop");
  assert.ok((cover.match(/data-first-write="list"/g) ?? []).length === 1, "one first-write list");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok(claimAt > coverStart, "the listing form still lives under the cover");
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");

  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-list-after-take-two/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
  assert.doesNotMatch(empty.body, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(empty.body, /data-first-write="list"/);
  assert.doesNotMatch(empty.body, /data-list-after-take/);
  assert.doesNotMatch(empty.body, /after Test this today/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
});

test("GET / concentrates Test this today after List a product is re-concentrated", async () => {
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

  assert.match(cover, /data-list-after-take-two=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, /data-take-after-list-first=""/);
  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  assert.match(cover, />Test this today</);
  assert.match(cover, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "the existing take hop is concentrated after the taller list");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeTwoAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(takeTwoAt < bidAt && takeTwoAt < hostAt, "concentrated take is not buried under host or $bid");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "no extra named take hop");
  assert.ok((cover.match(/data-first-click="take"/g) ?? []).length === 1, "one first-click take");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");

  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
  assert.doesNotMatch(empty.body, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(empty.body, /data-take-after-list-first/);
  assert.doesNotMatch(empty.body, /data-first-click="take"/);
  assert.doesNotMatch(empty.body, /Test this today/);
  assert.doesNotMatch(empty.body, /data-list-after-take-two/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
});

test("GET / concentrates List a product after Test this today is re-concentrated again", async () => {
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

  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-list-after-take-two=""/);
  assert.match(cover, /data-list-after-take-three=""/);
  assert.match(cover, /data-list-after-take-four=""/);
  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(
    cover,
    /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/,
  );
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(cover, /Paying less than #1 still lists/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  const claimAt = body.indexOf('id="claim"');
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeTwoAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "the existing list hop is concentrated after the louder take");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(listThreeAt < bidAt && listThreeAt < hostAt, "concentrated list is not buried under host or $bid");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");
  assert.ok((cover.match(/data-list-after-take=""/g) ?? []).length === 1, "no extra named list hop");
  assert.ok((cover.match(/data-first-write="list"/g) ?? []).length === 1, "one first-write list");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok(claimAt > coverStart, "the listing form still lives under the cover");
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");

  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
  assert.doesNotMatch(empty.body, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(empty.body, /data-first-write="list"/);
  assert.doesNotMatch(empty.body, /data-list-after-take/);
  assert.doesNotMatch(empty.body, /after Test this today/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
});

test("GET / concentrates Test this today after List a product is re-concentrated again", async () => {
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

  assert.match(cover, /data-list-after-take-three=""/);
  assert.match(cover, /data-list-after-take-four=""/);
  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, /data-take-after-list-first=""/);
  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  assert.match(cover, />Test this today</);
  assert.match(cover, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "the existing take hop is concentrated after the taller list");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeThreeAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(takeThreeAt < bidAt && takeThreeAt < hostAt, "concentrated take is not buried under host or $bid");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "no extra named take hop");
  assert.ok((cover.match(/data-first-click="take"/g) ?? []).length === 1, "one first-click take");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");

  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
  assert.doesNotMatch(empty.body, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-first/);
  assert.doesNotMatch(empty.body, /data-first-click="take"/);
  assert.doesNotMatch(empty.body, /Test this today/);
  assert.doesNotMatch(empty.body, /data-list-after-take-two/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
});

test("GET / concentrates List a product after Test this today is re-concentrated a fourth time", async () => {
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

  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-list-after-take-two=""/);
  assert.match(cover, /data-list-after-take-three=""/);
  assert.match(cover, /data-list-after-take-four=""/);
  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(
    cover,
    /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/,
  );
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(cover, /Paying less than #1 still lists/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  const claimAt = body.indexOf('id="claim"');
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeThreeAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "the existing list hop is concentrated after the taller take");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(listFourAt < bidAt && listFourAt < hostAt, "concentrated list is not buried under host or $bid");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");
  assert.ok((cover.match(/data-list-after-take=""/g) ?? []).length === 1, "no extra named list hop");
  assert.ok((cover.match(/data-first-write="list"/g) ?? []).length === 1, "one first-write list");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok(claimAt > coverStart, "the listing form still lives under the cover");
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");

  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
  assert.doesNotMatch(empty.body, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(empty.body, /data-first-write="list"/);
  assert.doesNotMatch(empty.body, /data-list-after-take/);
  assert.doesNotMatch(empty.body, /after Test this today/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
});

test("GET / concentrates Test this today after List a product is re-concentrated a fourth time", async () => {
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

  assert.match(cover, /data-list-after-take-four=""/);
  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, /data-take-after-list-first=""/);
  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  assert.match(cover, />Test this today</);
  assert.match(cover, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "the existing take hop is concentrated after the taller list");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeFourAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(takeFourAt < bidAt && takeFourAt < hostAt, "concentrated take is not buried under host or $bid");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "no extra named take hop");
  assert.ok((cover.match(/data-first-click="take"/g) ?? []).length === 1, "one first-click take");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");

  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
  assert.doesNotMatch(empty.body, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-first/);
  assert.doesNotMatch(empty.body, /data-first-click="take"/);
  assert.doesNotMatch(empty.body, /Test this today/);
  assert.doesNotMatch(empty.body, /data-list-after-take-two/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
});

test("GET / concentrates List a product after Test this today is re-concentrated a fifth time", async () => {
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

  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-list-after-take-two=""/);
  assert.match(cover, /data-list-after-take-three=""/);
  assert.match(cover, /data-list-after-take-four=""/);
  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(
    cover,
    /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/,
  );
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(cover, /Paying less than #1 still lists/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  const claimAt = body.indexOf('id="claim"');
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeFourAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "the existing list hop is concentrated after the taller take");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(listFiveAt < bidAt && listFiveAt < hostAt, "concentrated list is not buried under host or $bid");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");
  assert.ok((cover.match(/data-list-after-take=""/g) ?? []).length === 1, "no extra named list hop");
  assert.ok((cover.match(/data-first-write="list"/g) ?? []).length === 1, "one first-write list");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok(claimAt > coverStart, "the listing form still lives under the cover");
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");

  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
  assert.doesNotMatch(empty.body, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(empty.body, /data-first-write="list"/);
  assert.doesNotMatch(empty.body, /data-list-after-take/);
  assert.doesNotMatch(empty.body, /after Test this today/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
});

test("GET / concentrates Test this today after List a product is re-concentrated a fifth time", async () => {
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

  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, /data-take-after-list-first=""/);
  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  assert.match(cover, />Test this today</);
  assert.match(cover, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "the existing take hop is concentrated after the taller list");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeSixAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(takeSixAt < bidAt && takeSixAt < hostAt, "concentrated take is not buried under host or $bid");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "no extra named take hop");
  assert.ok((cover.match(/data-first-click="take"/g) ?? []).length === 1, "one first-click take");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");

  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
  assert.doesNotMatch(empty.body, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-first/);
  assert.doesNotMatch(empty.body, /data-first-click="take"/);
  assert.doesNotMatch(empty.body, /Test this today/);
  assert.doesNotMatch(empty.body, /data-list-after-take-two/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
});

test("GET / concentrates List a product after Test this today is re-concentrated a sixth time", async () => {
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

  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /data-list-after-take-two=""/);
  assert.match(cover, /data-list-after-take-three=""/);
  assert.match(cover, /data-list-after-take-four=""/);
  assert.match(cover, /data-list-after-take-five=""/);
  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(
    cover,
    /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/,
  );
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(cover, /Paying less than #1 still lists/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  const claimAt = body.indexOf('id="claim"');
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "take-after-list-six stays on the existing first-click hop");
  assert.ok(firstWriteAt > takeSixAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "the existing list hop is concentrated after the taller take");
  assert.ok(listSixAt < bidAt && listSixAt < hostAt, "concentrated list is not buried under host or $bid");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");
  assert.ok((cover.match(/data-list-after-take=""/g) ?? []).length === 1, "no extra named list hop");
  assert.ok((cover.match(/data-first-write="list"/g) ?? []).length === 1, "one first-write list");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok(claimAt > coverStart, "the listing form still lives under the cover");
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");

  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /data-list-after-take/);
  assert.doesNotMatch(under, /after Test this today/);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
  assert.doesNotMatch(empty.body, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"/);
  assert.doesNotMatch(empty.body, /data-first-write="list"/);
  assert.doesNotMatch(empty.body, /data-list-after-take/);
  assert.doesNotMatch(empty.body, /after Test this today/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
});

test("GET / concentrates Test this today after List a product is re-concentrated a sixth time", async () => {
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

  assert.match(cover, /data-list-after-take-six=""/);
  assert.match(cover, /data-first-write="list"/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, /data-take-after-list-first=""/);
  assert.match(cover, /data-take-after-list-two=""/);
  assert.match(cover, /data-take-after-list-three=""/);
  assert.match(cover, /data-take-after-list-four=""/);
  assert.match(cover, /data-take-after-list-five=""/);
  assert.match(cover, /data-take-after-list-six=""/);
  assert.match(
    cover,
    /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"[^>]*href="\/r\/lst-cover"[^>]*data-cover-hop=""[^>]*data-first-click="take"[^>]*data-take-after-list-first=""[^>]*data-take-after-list-two=""[^>]*data-take-after-list-three=""[^>]*data-take-after-list-four=""[^>]*data-take-after-list-five=""[^>]*data-take-after-list-six=""/,
  );
  assert.match(cover, />Test this today</);
  assert.match(cover, /class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six"[^>]*href="#claim"[^>]*data-list-after-take=""[^>]*data-first-write="list"[^>]*data-list-after-take-two=""[^>]*data-list-after-take-three=""[^>]*data-list-after-take-four=""[^>]*data-list-after-take-five=""[^>]*data-list-after-take-six=""/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const listAfterAt = cover.indexOf("data-list-after-why");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const firstClickAt = cover.indexOf('data-first-click="take"');
  const takeFirstAt = cover.indexOf("data-take-after-list-first");
  const takeTwoAt = cover.indexOf("data-take-after-list-two");
  const takeThreeAt = cover.indexOf("data-take-after-list-three");
  const takeFourAt = cover.indexOf("data-take-after-list-four");
  const takeFiveAt = cover.indexOf("data-take-after-list-five");
  const takeSixAt = cover.indexOf("data-take-after-list-six");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const listTwoAt = cover.indexOf("data-list-after-take-two");
  const listThreeAt = cover.indexOf("data-list-after-take-three");
  const listFourAt = cover.indexOf("data-list-after-take-four");
  const listFiveAt = cover.indexOf("data-list-after-take-five");
  const listSixAt = cover.indexOf("data-list-after-take-six");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && listAfterAt > whyLineAt, "list-after-why stays under the labeled why-line");
  assert.ok(takeAt > listAfterAt && takeAt < hopAt, "take-after-list stays the shopper hop after listing");
  assert.ok(firstClickAt > takeAt && firstClickAt < listAfterTakeAt, "Test this today stays the first click");
  assert.ok(takeFirstAt > firstClickAt && takeFirstAt < listAfterTakeAt, "the louder take stays on the existing hop");
  assert.ok(takeTwoAt > takeFirstAt && takeTwoAt < listAfterTakeAt, "take-after-list-two stays on the existing first-click hop");
  assert.ok(takeThreeAt > takeTwoAt && takeThreeAt < listAfterTakeAt, "take-after-list-three stays on the existing first-click hop");
  assert.ok(takeFourAt > takeThreeAt && takeFourAt < listAfterTakeAt, "take-after-list-four stays on the existing first-click hop");
  assert.ok(takeFiveAt > takeFourAt && takeFiveAt < listAfterTakeAt, "take-after-list-five stays on the existing first-click hop");
  assert.ok(takeSixAt > takeFiveAt && takeSixAt < listAfterTakeAt, "the existing take hop is concentrated after the taller list");
  assert.ok(firstWriteAt > takeSixAt && firstWriteAt > listAfterTakeAt, "first write stays on list-after-take, after the take");
  assert.ok(listTwoAt > firstWriteAt, "list-after-take-two stays on the existing first-write hop");
  assert.ok(listThreeAt > listTwoAt, "list-after-take-three stays on the existing first-write hop");
  assert.ok(listFourAt > listThreeAt, "list-after-take-four stays on the existing first-write hop");
  assert.ok(listFiveAt > listFourAt, "list-after-take-five stays on the existing first-write hop");
  assert.ok(listSixAt > listFiveAt, "list-after-take-six stays on the existing first-write hop");
  assert.ok(takeSixAt < bidAt && takeSixAt < hostAt, "concentrated take is not buried under host or $bid");
  assert.ok((cover.match(/data-take-after-list-six=""/g) ?? []).length === 1, "one take-after-list-six stamp");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "no extra named take hop");
  assert.ok((cover.match(/data-first-click="take"/g) ?? []).length === 1, "one first-click take");
  assert.ok((cover.match(/data-take-after-list-first=""/g) ?? []).length === 1, "one take-after-list-first stamp");
  assert.ok((cover.match(/data-take-after-list-two=""/g) ?? []).length === 1, "one take-after-list-two stamp");
  assert.ok((cover.match(/data-take-after-list-three=""/g) ?? []).length === 1, "one take-after-list-three stamp");
  assert.ok((cover.match(/data-take-after-list-four=""/g) ?? []).length === 1, "one take-after-list-four stamp");
  assert.ok((cover.match(/data-take-after-list-five=""/g) ?? []).length === 1, "one take-after-list-five stamp");
  assert.ok((cover.match(/data-list-after-take-two=""/g) ?? []).length === 1, "one list-after-take-two stamp");
  assert.ok((cover.match(/data-list-after-take-three=""/g) ?? []).length === 1, "one list-after-take-three stamp");
  assert.ok((cover.match(/data-list-after-take-four=""/g) ?? []).length === 1, "one list-after-take-four stamp");
  assert.ok((cover.match(/data-list-after-take-five=""/g) ?? []).length === 1, "one list-after-take-five stamp");
  assert.ok((cover.match(/data-list-after-take-six=""/g) ?? []).length === 1, "one list-after-take-six stamp");

  assert.doesNotMatch(under, /data-take-after-list-six/);
  assert.doesNotMatch(under, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(under, /data-take-after-list-five/);
  assert.doesNotMatch(under, /data-take-after-list-four/);
  assert.doesNotMatch(under, /data-take-after-list-three/);
  assert.doesNotMatch(under, /data-take-after-list-two/);
  assert.doesNotMatch(under, /data-take-after-list-first/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-first-write="list"/);
  assert.doesNotMatch(under, /data-list-after-take-two/);
  assert.doesNotMatch(under, /data-list-after-take-three/);
  assert.doesNotMatch(under, /data-list-after-take-four/);
  assert.doesNotMatch(under, /data-list-after-take-five/);
  assert.doesNotMatch(under, /data-list-after-take-six/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-take-after-list-six=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-first=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-take-after-list-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-write="list"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-two=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-three=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-four=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-five=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take-six=""/g) ?? []).length, 1);

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.doesNotMatch(empty.body, /data-take-after-list-six/);
  assert.doesNotMatch(empty.body, /class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six"/);
  assert.doesNotMatch(empty.body, /data-take-after-list-five/);
  assert.doesNotMatch(empty.body, /data-take-after-list-four/);
  assert.doesNotMatch(empty.body, /data-take-after-list-three/);
  assert.doesNotMatch(empty.body, /data-take-after-list-two/);
  assert.doesNotMatch(empty.body, /data-take-after-list-first/);
  assert.doesNotMatch(empty.body, /data-first-click="take"/);
  assert.doesNotMatch(empty.body, /Test this today/);
  assert.doesNotMatch(empty.body, /data-list-after-take-two/);
  assert.doesNotMatch(empty.body, /data-list-after-take-three/);
  assert.doesNotMatch(empty.body, /data-list-after-take-four/);
  assert.doesNotMatch(empty.body, /data-list-after-take-five/);
  assert.doesNotMatch(empty.body, /data-list-after-take-six/);
});

test("GET / lets the occupied cover why-line read first and larger than $bid", async () => {
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
  assert.match(cover, /data-prize-before-price=""/);
  assert.match(cover, /<p class="cover-why-line" data-prize-before-price="">Cover app sellers should install this morning<\/p>/);
  assert.match(body, /cover-why-line\[data-prize-before-price\]/);
  assert.match(cover, /\$20/);
  assert.match(cover, /3 clicks/);
  const whyAt = cover.indexOf("data-prize-before-price");
  const bidAt = cover.indexOf(">$20<");
  const clicksAt = cover.indexOf("3 clicks");
  const hopAt = cover.indexOf("data-cover-hop");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyAt > -1 && whyAt < bidAt, "cover prize precedes $bid");
  assert.ok(whyAt < clicksAt, "cover prize precedes clicks");
  assert.ok(whyAt < hopAt, "cover prize still precedes Test this today");
  assert.ok(whyAt < hostAt, "cover prize precedes the host line");
  assert.ok((cover.match(/data-prize-before-price=""/g) ?? []).length === 1, "one prize mark on occupied #1");
  assert.ok((cover.match(/data-cover-why=""/g) ?? []).length === 1, "one labeled why-line");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "no extra named hop");

  assert.match(under, /class="blurb"/);
  assert.match(under, /\$8/);
  assert.doesNotMatch(under, /data-prize-before-price/);
  assert.doesNotMatch(under, /data-cover-why/);
  assert.doesNotMatch(under, /cover-why-line/);
  assert.equal((body.match(/data-prize-before-price=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-why=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.match(body, /data-issue-date="/);
  assert.match(body, /One cover/);
  assert.match(body, /Claim #1 for/);
  assert.match(body, /Outbid/);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /Quiet morning/);
  assert.match(empty.body, /No listings yet today/);
  assert.doesNotMatch(empty.body, /data-prize-before-price=""/);
  assert.doesNotMatch(empty.body, /data-cover-why=""/);
  assert.doesNotMatch(empty.body, /Test this today/);
});

test("GET / keeps the occupied cover product name the prize — $bid stays a later fact", async () => {
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
    clicks: 1,
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

  assert.match(cover, /data-cover-name=""/);
  assert.match(cover, /<p class="host" data-cover-name="">cover\.example\/apps\/pick<\/p>/);
  assert.match(cover, /data-later-fact=""/);
  assert.match(cover, /class="bid later-fact"/);
  assert.match(cover, /class="clicks later-fact"/);
  assert.match(cover, /\$20/);
  assert.match(cover, /3 clicks/);
  assert.match(cover, /data-prize-before-price=""/);
  assert.match(cover, /This morning’s cover/);
  assert.match(cover, /data-cover-hop=""/);
  assert.doesNotMatch(cover, /<p class="bid">\$20<\/p>/);

  const nameAt = cover.indexOf("data-cover-name");
  const laterAt = cover.indexOf("data-later-fact");
  const bidAt = cover.indexOf(">$20<");
  const clicksAt = cover.indexOf("3 clicks");
  const hopAt = cover.indexOf("data-cover-hop");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const whyAt = cover.indexOf("data-prize-before-price");
  assert.ok(nameAt > -1 && laterAt > nameAt, "cover product name precedes later-fact money");
  assert.ok(laterAt > hopAt && laterAt > listAfterTakeAt, "$bid sits after Test this today, not beside the product name");
  assert.ok(bidAt > laterAt && clicksAt > laterAt, "$bid and clicks recede together as later facts");
  assert.ok(whyAt > -1 && whyAt < hopAt, "why-line still reads before the hop");
  assert.ok((cover.match(/data-cover-name=""/g) ?? []).length === 1, "one cover product-name prize");
  assert.ok((cover.match(/data-later-fact=""/g) ?? []).length === 3, "later-fact stamps wrap $bid and clicks on occupied #1");
  assert.ok((cover.match(/class="bid later-fact"/g) ?? []).length === 1, "one later-fact $bid on occupied #1");

  assert.match(under, /<p class="bid">\$8<\/p>/);
  assert.match(under, /1 clicks/);
  assert.match(under, /class="host"/);
  assert.doesNotMatch(under, /data-cover-name=""/);
  assert.doesNotMatch(under, /data-later-fact=""/);
  assert.doesNotMatch(under, /class="bid later-fact"/);
  assert.doesNotMatch(under, /This morning’s cover/);
  assert.equal((body.match(/data-cover-name=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-later-fact=""/g) ?? []).length, 3);
  assert.equal((body.match(/class="bid later-fact"/g) ?? []).length, 1);
  assert.match(body, /Claim #1 for/);
  assert.match(body, />Outbid</);
  assert.match(body, /data-last24h="/);
  assert.match(body, /A strip rank is a last-24h fact, not today’s cover #1/);
  assert.doesNotMatch(cover, /data-last24h-fact/);
  assert.doesNotMatch(cover, />24h /);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /data-empty-board/);
  assert.match(empty.body, /data-empty-cover=""/);
  assert.match(empty.body, /Quiet morning/);
  assert.match(empty.body, /data-last24h-empty=""/);
  assert.doesNotMatch(empty.body, /data-cover-name=""/);
  assert.doesNotMatch(empty.body, /data-later-fact=""/);
  assert.doesNotMatch(empty.body, /class="bid later-fact"/);
  assert.doesNotMatch(empty.body, /This morning’s cover/);
  assert.doesNotMatch(empty.body, /data-prize-before-price=""/);
});

test("GET / shows an honest last-24h strip so a newcomer can be seen today", async () => {
  const db = openDatabase(":memory:");
  const now = new Date("2026-08-23T00:30:00.000Z");
  placeBid(db, {
    id: "lst-cover",
    day: "2026-08-23",
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 20,
    clicks: 3,
    createdAt: "2026-08-23T00:10:00.000Z",
  });
  placeBid(db, {
    id: "lst-newcomer",
    day: "2026-08-22",
    productUrl: "https://newcomer.example/sku",
    whyTestThisToday: "Last night’s $6 still belongs on the last-24h strip",
    bidUsd: 6,
    createdAt: "2026-08-22T12:00:00.000Z",
  });
  placeBid(db, {
    id: "lst-stale",
    day: "2026-08-21",
    productUrl: "https://stale.example/sku",
    whyTestThisToday: "Older than 24 hours must leave the rolling strip",
    bidUsd: 99,
    createdAt: "2026-08-21T23:00:00.000Z",
  });

  const html = renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [
      {
        id: "lst-cover",
        day: "2026-08-23",
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-23T00:10:00.000Z",
        updatedAt: "2026-08-23T00:10:00.000Z",
        rank: 1,
      },
    ],
    last24h: [
      {
        id: "lst-cover",
        day: "2026-08-23",
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-23T00:10:00.000Z",
        updatedAt: "2026-08-23T00:10:00.000Z",
        rank: 1,
      },
      {
        id: "lst-newcomer",
        day: "2026-08-22",
        productUrl: "https://newcomer.example/sku",
        whyTestThisToday: "Last night’s $6 still belongs on the last-24h strip",
        bidUsd: 6,
        paidUsd: 6,
        clicks: 0,
        createdAt: "2026-08-22T12:00:00.000Z",
        updatedAt: "2026-08-22T12:00:00.000Z",
        rank: 2,
      },
    ],
    defaultBidUsd: 21,
    now,
  });

  assert.match(html, /data-last24h=""/);
  assert.match(html, /data-last24h-window="rolling-24h"/);
  assert.match(html, /Last 24 hours/);
  assert.match(html, /rolling last 24 hours/);
  assert.match(html, /Not a midnight UTC reset/);
  assert.match(html, /Not a second all-time board/);
  assert.match(html, /data-last24h-id="lst-cover"/);
  assert.match(html, /data-last24h-id="lst-newcomer"/);
  assert.match(html, /data-last24h-rank="1"/);
  assert.match(html, /data-last24h-rank="2"/);
  assert.match(html, /data-last24h-fact=""/);
  assert.match(html, /newcomer\.example\/sku/);
  assert.match(html, /Last night’s \$6 still belongs on the last-24h strip/);
  assert.match(html, /A strip rank is a last-24h fact, not today’s cover #1/);
  assert.match(html, /Cover #1 is this morning’s slot/);
  assert.match(html, /data-two-prizes=""/);
  assert.match(html, /data-morning-slot=""/);
  assert.match(html, /data-last24h-prize=""/);
  assert.match(html, /data-last24h-occupied=""/);
  assert.match(html, /Rolling 24h spend/);
  assert.doesNotMatch(html, /stale\.example/);
  assert.doesNotMatch(html, /\$99/);
  assert.doesNotMatch(html, /href="\/today"/);
  assert.doesNotMatch(html, /outbid\.lol\/today/);
  assert.doesNotMatch(html, /data-last24h-empty=""/);
  assertTwoPrizes(html, "lst-cover", "lst-cover");
  const coverAt = html.indexOf('data-listing-id="lst-cover"');
  const stripAt = html.indexOf('data-last24h=""');
  const newcomerAt = html.indexOf('data-last24h-id="lst-newcomer"');
  const claimAt = html.indexOf('id="claim"');
  const stripSlice = html.slice(stripAt, claimAt);
  assert.ok(coverAt > -1 && stripAt > coverAt, "one all-time cover stays above the last-24h strip");
  assert.ok(newcomerAt > stripAt && newcomerAt < claimAt, "newcomer sits on the strip, not a second cover");
  assertStripRankIsLast24hFact(stripSlice, [1, 2]);
  assert.equal((html.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((html.match(/This morning’s cover/g) ?? []).length, 1);
  assert.equal((html.match(/data-last24h-fact=""/g) ?? []).length, 2);
  assert.doesNotMatch(html, /data-take-after-list-seven/);
  assert.doesNotMatch(html, /data-list-after-take-seven/);

  const previousTz = process.env.BOARD_TZ;
  process.env.BOARD_TZ = "UTC";
  const app = await buildApp({ db, now });
  after(async () => {
    if (previousTz === undefined) {
      delete process.env.BOARD_TZ;
    } else {
      process.env.BOARD_TZ = previousTz;
    }
    await app.close();
    db.close();
  });
  const live = await app.inject({ method: "GET", url: "/" });
  assert.equal(live.statusCode, 200);
  assert.match(live.body, /data-last24h=""/);
  assert.match(live.body, /data-last24h-window="rolling-24h"/);
  assert.match(live.body, /data-last24h-id="lst-newcomer"/);
  assert.match(live.body, /newcomer\.example\/sku/);
  assert.match(live.body, /This morning’s cover/);
  assert.match(live.body, /data-last24h-fact=""/);
  assert.doesNotMatch(live.body, /data-last24h-empty=""/);
  assert.doesNotMatch(live.body, /stale\.example/);
  assert.doesNotMatch(live.body, /\$99/);
  const liveCoverAt = live.body.indexOf('data-listing-id="lst-cover"');
  const liveStripAt = live.body.indexOf('data-last24h=""');
  const liveNewcomerAt = live.body.indexOf('data-last24h-id="lst-newcomer"');
  const liveClaimAt = live.body.indexOf('id="claim"');
  const liveStripSlice = live.body.slice(liveStripAt, liveClaimAt);
  assert.ok(liveCoverAt > -1 && liveStripAt > liveCoverAt, "live cover stays one all-time #1");
  assert.ok(liveNewcomerAt > liveStripAt, "live newcomer is seen on the last-24h strip");
  assertStripRankIsLast24hFact(liveStripSlice, [1, 2]);

  const empty = pageBody(renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [],
    last24h: [],
    defaultBidUsd: 5,
    now,
  }));
  assert.match(empty, /data-empty-board/);
  assert.match(empty, /data-empty-cover=""/);
  assert.match(empty, /Quiet morning/);
  assert.match(empty, /not an invented cover/);
  assert.match(empty, /data-last24h=""/);
  assert.match(empty, /data-last24h-empty=""/);
  assert.match(empty, /data-last24h-empty-strip=""/);
  assert.match(empty, /No paid listings in the last 24 hours/);
  assert.match(empty, /not a second cover/);
  assert.match(empty, /No invented #1/);
  assert.doesNotMatch(empty, /data-two-prizes=/);
  assert.doesNotMatch(empty, /data-morning-slot=/);
  assert.doesNotMatch(empty, /data-last24h-prize=/);
  assert.doesNotMatch(empty, /data-last24h-occupied=/);
  assert.doesNotMatch(empty, /data-last24h-row/);
  assert.doesNotMatch(empty, /data-last24h-rank/);
  assert.doesNotMatch(empty, /data-last24h-fact/);
  assert.doesNotMatch(empty, /data-cover-hop/);
  assert.doesNotMatch(empty, /This morning’s cover/);
  assert.doesNotMatch(empty, /class="row-cover/);
});

test("GET / keeps a quiet morning honest — no invented cover on the last-24h strip", async () => {
  const previousTz = process.env.BOARD_TZ;
  process.env.BOARD_TZ = "UTC";
  after(() => {
    if (previousTz === undefined) {
      delete process.env.BOARD_TZ;
    } else {
      process.env.BOARD_TZ = previousTz;
    }
  });
  const now = new Date("2026-08-23T00:30:00.000Z");
  const emptyApp = await buildApp({ databasePath: ":memory:", now });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.equal(empty.statusCode, 200);
  const quiet = pageBody(empty.body);
  assert.match(quiet, /data-empty-board/);
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /Quiet morning/);
  assert.match(quiet, /No listings yet today/);
  assert.match(quiet, /not an invented cover/);
  assert.match(quiet, /data-last24h=""/);
  assert.match(quiet, /data-last24h-window="rolling-24h"/);
  assert.match(quiet, /data-last24h-empty=""/);
  assert.match(quiet, /data-last24h-empty-strip=""/);
  assert.match(quiet, /No paid listings in the last 24 hours/);
  assert.match(quiet, /No invented #1/);
  assert.match(quiet, /Claim #1 for/);
  assert.doesNotMatch(quiet, /data-last24h-row/);
  assert.doesNotMatch(quiet, /data-last24h-rank/);
  assert.doesNotMatch(quiet, /data-last24h-fact/);
  assert.doesNotMatch(quiet, /This morning’s cover/);
  assert.doesNotMatch(quiet, /class="row-cover/);
  assert.doesNotMatch(quiet, /data-cover-hop/);
  assert.doesNotMatch(quiet, /data-cover-why/);
  assert.doesNotMatch(quiet, /Test this today/);
  const emptyCoverAt = quiet.indexOf('data-empty-cover=""');
  const emptyStripAt = quiet.indexOf('data-last24h-empty=""');
  const claimAt = quiet.indexOf('id="claim"');
  assert.ok(emptyCoverAt > -1 && emptyStripAt > emptyCoverAt, "empty cover stays above the empty last-24h strip");
  assert.ok(emptyStripAt < claimAt, "empty strip stays before claim chrome");
  assert.equal((quiet.match(/data-empty-cover=""/g) ?? []).length, 1);
  assert.equal((quiet.match(/data-last24h-empty=""/g) ?? []).length, 1);
  assert.equal((quiet.match(/This morning’s cover/g) ?? []).length, 0);

  const overnightDb = openDatabase(":memory:");
  placeBid(overnightDb, {
    id: "lst-last-night",
    day: "2026-08-22",
    productUrl: "https://overnight.example/sku",
    whyTestThisToday: "Last night’s $6 still belongs on the last-24h strip",
    bidUsd: 6,
    createdAt: "2026-08-22T12:00:00.000Z",
  });
  const overnightApp = await buildApp({ db: overnightDb, now });
  after(async () => {
    await overnightApp.close();
    overnightDb.close();
  });
  const overnight = await overnightApp.inject({ method: "GET", url: "/" });
  assert.equal(overnight.statusCode, 200);
  const body = pageBody(overnight.body);
  assert.match(body, /data-empty-board/);
  assert.match(body, /data-empty-cover=""/);
  assert.match(body, /Quiet morning/);
  assert.match(body, /No listings yet today/);
  assert.match(body, /not an invented cover/);
  assert.match(body, /data-last24h=""/);
  assert.match(body, /data-last24h-window="rolling-24h"/);
  assert.match(body, /data-last24h-id="lst-last-night"/);
  assert.match(body, /data-last24h-rank="1"/);
  assert.match(body, /data-last24h-fact=""/);
  assert.match(body, /overnight\.example\/sku/);
  assert.match(body, /A strip rank is a last-24h fact, not today’s cover #1/);
  assert.match(body, /data-last24h-prize=""/);
  assert.match(body, /Rolling 24h spend/);
  assert.doesNotMatch(body, /data-two-prizes=/);
  assert.doesNotMatch(body, /data-morning-slot=/);
  assert.doesNotMatch(body, /data-last24h-empty=""/);
  assert.doesNotMatch(body, /This morning’s cover/);
  assert.doesNotMatch(body, /class="row-cover/);
  assert.doesNotMatch(body, /data-cover-hop/);
  assert.doesNotMatch(body, /data-cover-why/);
  assert.doesNotMatch(body, /data-listing-id="lst-last-night"/);
  assert.doesNotMatch(body, /Test this today/);
  const overnightCoverAt = body.indexOf('data-empty-cover=""');
  const overnightStripAt = body.indexOf('data-last24h=""');
  const overnightRowAt = body.indexOf('data-last24h-id="lst-last-night"');
  const overnightRankAt = body.indexOf('data-last24h-rank="1"');
  const overnightFactAt = body.indexOf('data-last24h-fact=""');
  const overnightClaimAt = body.indexOf('id="claim"');
  const overnightStripSlice = body.slice(overnightStripAt, overnightClaimAt);
  assert.ok(overnightCoverAt > -1 && overnightStripAt > overnightCoverAt, "quiet cover stays empty above last-night spend");
  assert.ok(overnightRowAt > overnightStripAt && overnightRowAt < overnightClaimAt, "last-night spend sits on the strip, not the cover");
  assert.ok(overnightRankAt > overnightStripAt, "strip rank 1 is not today’s cover #1");
  assert.ok(overnightFactAt > overnightStripAt, "occupied strip rank is a last-24h fact");
  assertStripRankIsLast24hFact(overnightStripSlice, [1]);
  assert.equal((body.match(/This morning’s cover/g) ?? []).length, 0);
  assert.equal((body.match(/data-empty-cover=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 0);
  assert.equal((body.match(/data-last24h=/g) ?? []).length, 1);
  assert.equal((body.match(/data-last24h-fact=""/g) ?? []).length, 1);

  const occupiedDb = openDatabase(":memory:");
  placeBid(occupiedDb, {
    id: "lst-cover",
    day: "2026-08-23",
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 20,
    createdAt: "2026-08-23T00:10:00.000Z",
  });
  const occupiedApp = await buildApp({ db: occupiedDb, now });
  after(async () => {
    await occupiedApp.close();
    occupiedDb.close();
  });
  const occupied = await occupiedApp.inject({ method: "GET", url: "/" });
  assert.equal(occupied.statusCode, 200);
  assert.match(occupied.body, /This morning’s cover/);
  assert.match(occupied.body, /data-listing-id="lst-cover"/);
  assert.match(occupied.body, /class="row row-cover row-1"/);
  assert.match(occupied.body, /data-cover-hop=""/);
  assert.match(occupied.body, /data-last24h-id="lst-cover"/);
  assert.match(occupied.body, /data-last24h-rank="1"/);
  assert.match(occupied.body, /data-last24h-fact=""/);
  assert.match(occupied.body, /data-two-prizes=""/);
  assert.match(occupied.body, /data-morning-slot=""/);
  assert.match(occupied.body, /data-last24h-prize=""/);
  assert.doesNotMatch(occupied.body, /data-empty-board/);
  assert.doesNotMatch(occupied.body, /data-empty-cover/);
  const occupiedCoverAt = occupied.body.indexOf('data-listing-id="lst-cover"');
  const occupiedStripAt = occupied.body.indexOf('data-last24h=""');
  const occupiedClaimAt = occupied.body.indexOf('id="claim"');
  const occupiedStripSlice = occupied.body.slice(occupiedStripAt, occupiedClaimAt);
  assert.ok(occupiedCoverAt > -1 && occupiedStripAt > occupiedCoverAt, "occupied cover stays above the last-24h strip");
  assertStripRankIsLast24hFact(occupiedStripSlice, [1]);
  assert.equal((occupied.body.match(/This morning’s cover/g) ?? []).length, 1);
  assert.equal((occupied.body.match(/data-cover-hop/g) ?? []).length, 1);
});

test("GET / keeps last-24h strip rank a last-24h fact, not today’s cover #1", async () => {
  const previousTz = process.env.BOARD_TZ;
  process.env.BOARD_TZ = "UTC";
  after(() => {
    if (previousTz === undefined) {
      delete process.env.BOARD_TZ;
    } else {
      process.env.BOARD_TZ = previousTz;
    }
  });
  const now = new Date("2026-08-23T00:30:00.000Z");

  const emptyCoverHtml = pageBody(renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [],
    last24h: [
      {
        id: "lst-last-night",
        day: "2026-08-22",
        productUrl: "https://overnight.example/sku",
        whyTestThisToday: "Last night’s $6 still belongs on the last-24h strip",
        bidUsd: 6,
        paidUsd: 6,
        clicks: 0,
        createdAt: "2026-08-22T12:00:00.000Z",
        updatedAt: "2026-08-22T12:00:00.000Z",
        rank: 1,
      },
    ],
    defaultBidUsd: 5,
    now,
  }));
  const emptyCoverStripAt = emptyCoverHtml.indexOf('data-last24h=""');
  const emptyCoverClaimAt = emptyCoverHtml.indexOf('id="claim"');
  const emptyCoverSlice = emptyCoverHtml.slice(emptyCoverStripAt, emptyCoverClaimAt);
  assert.match(emptyCoverHtml, /data-empty-cover=""/);
  assert.match(emptyCoverHtml, /data-last24h-rank="1"/);
  assert.match(emptyCoverHtml, /data-last24h-fact=""/);
  assert.match(emptyCoverHtml, /A strip rank is a last-24h fact, not today’s cover #1/);
  assertStripRankIsLast24hFact(emptyCoverSlice, [1]);
  assert.doesNotMatch(emptyCoverHtml, /data-last24h-empty=/);
  assert.doesNotMatch(emptyCoverHtml, /This morning’s cover/);
  assert.doesNotMatch(emptyCoverHtml, /data-cover-hop/);

  const differentCoverHtml = renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [
      {
        id: "lst-cover",
        day: "2026-08-23",
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-23T00:10:00.000Z",
        updatedAt: "2026-08-23T00:10:00.000Z",
        rank: 1,
      },
    ],
    last24h: [
      {
        id: "lst-last-night",
        day: "2026-08-22",
        productUrl: "https://overnight.example/sku",
        whyTestThisToday: "Last night’s $6 still belongs on the last-24h strip",
        bidUsd: 9,
        paidUsd: 9,
        clicks: 1,
        createdAt: "2026-08-22T12:00:00.000Z",
        updatedAt: "2026-08-22T12:00:00.000Z",
        rank: 1,
      },
      {
        id: "lst-cover",
        day: "2026-08-23",
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 8,
        paidUsd: 8,
        clicks: 3,
        createdAt: "2026-08-23T00:10:00.000Z",
        updatedAt: "2026-08-23T00:10:00.000Z",
        rank: 2,
      },
    ],
    defaultBidUsd: 21,
    now,
  });
  const differentCoverAt = differentCoverHtml.indexOf('data-listing-id="lst-cover"');
  const differentStripAt = differentCoverHtml.indexOf('data-last24h=""');
  const differentClaimAt = differentCoverHtml.indexOf('id="claim"');
  const differentSlice = differentCoverHtml.slice(differentStripAt, differentClaimAt);
  assert.match(differentCoverHtml, /This morning’s cover/);
  assert.match(differentCoverHtml, /class="row row-cover row-1"/);
  assert.match(differentCoverHtml, /data-last24h-id="lst-last-night"/);
  assert.match(differentCoverHtml, /data-last24h-rank="1"/);
  assert.match(differentCoverHtml, /data-last24h-rank="2"/);
  assert.match(differentCoverHtml, /data-last24h-fact=""/);
  assert.match(differentCoverHtml, /data-two-prizes=""/);
  assert.match(differentCoverHtml, /data-morning-slot=""/);
  assert.match(differentCoverHtml, /data-last24h-prize=""/);
  assert.match(differentCoverHtml, /Rolling 24h spend/);
  assert.ok(differentCoverAt > -1 && differentStripAt > differentCoverAt, "today’s cover stays above a different last-24h #1");
  assertStripRankIsLast24hFact(differentSlice, [1, 2]);
  assert.equal((differentCoverHtml.match(/This morning’s cover/g) ?? []).length, 1);
  assert.equal((differentCoverHtml.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((differentCoverHtml.match(/data-last24h-fact=""/g) ?? []).length, 2);

  const emptyStrip = renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [],
    last24h: [],
    defaultBidUsd: 5,
    now,
  });
  assert.match(emptyStrip, /data-last24h-empty=""/);
  assert.match(emptyStrip, /data-last24h-empty-strip=""/);
  assert.doesNotMatch(emptyStrip, /data-last24h-rank/);
  assert.doesNotMatch(emptyStrip, /data-last24h-fact/);
  assert.doesNotMatch(emptyStrip, />24h 1</);

  const liveDb = openDatabase(":memory:");
  placeBid(liveDb, {
    id: "lst-last-night",
    day: "2026-08-22",
    productUrl: "https://overnight.example/sku",
    whyTestThisToday: "Last night’s $6 still belongs on the last-24h strip",
    bidUsd: 6,
    createdAt: "2026-08-22T12:00:00.000Z",
  });
  placeBid(liveDb, {
    id: "lst-cover",
    day: "2026-08-23",
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 5,
    createdAt: "2026-08-23T00:10:00.000Z",
  });
  const liveApp = await buildApp({ db: liveDb, now });
  after(async () => {
    await liveApp.close();
    liveDb.close();
  });
  const live = await liveApp.inject({ method: "GET", url: "/" });
  assert.equal(live.statusCode, 200);
  const liveCoverAt = live.body.indexOf('data-listing-id="lst-cover"');
  const liveStripAt = live.body.indexOf('data-last24h=""');
  const liveClaimAt = live.body.indexOf('id="claim"');
  const liveSlice = live.body.slice(liveStripAt, liveClaimAt);
  assert.match(live.body, /This morning’s cover/);
  assert.match(live.body, /data-last24h-id="lst-last-night"/);
  assert.match(live.body, /data-last24h-rank="1"/);
  assert.match(live.body, /data-last24h-fact=""/);
  assert.match(live.body, /data-last24h-window="rolling-24h"/);
  assert.match(live.body, /data-two-prizes=""/);
  assert.match(live.body, /data-morning-slot=""/);
  assert.match(live.body, /data-last24h-prize=""/);
  assert.ok(liveCoverAt > -1 && liveStripAt > liveCoverAt, "live cover stays today’s #1 above the strip");
  assertStripRankIsLast24hFact(liveSlice, [1]);
  assert.doesNotMatch(live.body, /data-last24h-empty=/);
});

test("GET / keeps empty cover Claim #1 the only first click — Test this today stays off empty", async () => {
  const css = BOARD_CSS;
  const emptyCss = css.split("Empty morning: Claim #1 is the only first click")[1] ?? "";
  const hideCss = emptyCss.split(".last24h {")[0] ?? "";
  assert.match(hideCss, /\.desk:has\(\.empty\) \.cover-hop/);
  assert.match(hideCss, /\.desk:has\(\.empty\) \.cover-later/);
  assert.match(hideCss, /\.desk:has\(\.empty\) \.list-under-cover/);
  assert.match(hideCss, /\.desk:has\(\.empty\) \.claim-kicker/);
  assert.match(hideCss, /\.desk:has\(\.empty\) #claim \.claim-title/);
  assert.match(hideCss, /display:\s*none/);
  assert.doesNotMatch(hideCss, /data-cover-hop|data-first-click="take"|data-cover-name|data-later-fact/);
  assert.doesNotMatch(hideCss, /background:/);
  assert.doesNotMatch(css, /data-empty-claim-after|data-claim-after-empty|take-after-list-seven/);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.equal(empty.statusCode, 200);
  const quiet = empty.body.slice(empty.body.indexOf('<div class="page">'));
  const emptyCoverAt = quiet.indexOf('data-empty-cover=""');
  const claimAt = quiet.indexOf('id="claim"');
  const emptyClaimAt = quiet.indexOf('data-empty-claim-first=""', claimAt);
  const firstClickAt = quiet.indexOf('data-first-click="claim"');
  const claimCopyAt = quiet.indexOf("Claim #1 for");
  const outbidAt = quiet.indexOf(">Outbid<");
  assert.ok(emptyCoverAt > -1 && claimAt > emptyCoverAt, "quiet morning still precedes Claim #1");
  assert.ok(emptyClaimAt > claimAt && firstClickAt > emptyClaimAt, "Claim #1 is stamped the only first click");
  assert.ok(claimCopyAt > firstClickAt && outbidAt > claimCopyAt, "the first click is Claim #1, then Outbid");
  assert.equal((quiet.match(/data-empty-claim-first=""/g) ?? []).length, 2);
  assert.equal((quiet.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.match(quiet, /class="empty-claim-first"/);
  assert.match(quiet, /data-empty-claim=""/);
  assert.match(quiet, /aria-label="Claim #1"/);
  assert.match(quiet, /data-occupied="false"/);
  assert.match(quiet, /data-empty-board/);
  assert.match(quiet, /Quiet morning/);
  assert.match(quiet, /not an invented cover/);
  assert.match(quiet, /Claim #1 for/);
  assert.match(quiet, />Outbid</);
  assert.match(quiet, /data-last24h-empty=""/);
  assert.doesNotMatch(quiet, /data-occupied="true"/);
  assert.doesNotMatch(quiet, /class="claim-kicker"/);
  assert.doesNotMatch(quiet, /List a product/);
  assert.doesNotMatch(quiet, /data-cover-hop/);
  assert.doesNotMatch(quiet, /Test this today/);
  assert.doesNotMatch(quiet, /data-first-click="take"/);
  assert.doesNotMatch(quiet, /data-cover-name=""/);
  assert.doesNotMatch(quiet, /data-later-fact=""/);
  assert.doesNotMatch(quiet, /class="bid later-fact"/);
  assert.doesNotMatch(quiet, /This morning’s cover/);
  assert.doesNotMatch(quiet, /class="row-cover/);
  assert.doesNotMatch(quiet, /data-list-under-cover/);
  assert.doesNotMatch(quiet, /data-list-after-take/);
  assert.doesNotMatch(quiet, /data-empty-claim-after/);
  assert.doesNotMatch(quiet, /take-after-list-seven/);

  const occupiedDb = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
  placeBid(occupiedDb, {
    id: "lst-cover",
    day,
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 20,
    clicks: 3,
    createdAt: "2026-08-22T09:00:00.000Z",
  });
  placeBid(occupiedDb, {
    id: "lst-under",
    day,
    productUrl: "https://under.example/sku",
    whyTestThisToday: "Cheaper SKU still belongs on the brief",
    bidUsd: 8,
    clicks: 1,
    createdAt: "2026-08-22T12:00:00.000Z",
  });
  const occupiedApp = await buildApp({ db: occupiedDb, now });
  after(async () => {
    await occupiedApp.close();
    occupiedDb.close();
  });
  const occupied = await occupiedApp.inject({ method: "GET", url: "/" });
  assert.equal(occupied.statusCode, 200);
  const paid = occupied.body.slice(occupied.body.indexOf('<div class="page">'));
  const coverStart = paid.indexOf('data-listing-id="lst-cover"');
  const cover = paid.slice(coverStart, paid.indexOf("</article>", coverStart));
  const underStart = paid.indexOf('data-listing-id="lst-under"');
  const under = paid.slice(underStart, paid.indexOf("</article>", underStart));
  assert.match(paid, /data-occupied="true"/);
  assert.doesNotMatch(paid, /data-empty-claim-first/);
  assert.doesNotMatch(paid, /empty-claim-first/);
  assert.doesNotMatch(paid, /data-first-click="claim"/);
  assert.doesNotMatch(paid, /aria-label="Claim #1"/);
  assert.doesNotMatch(paid, /data-occupied="false"/);
  assert.match(cover, /data-cover-name=""/);
  assert.match(cover, /data-later-fact=""/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /data-first-click="take"/);
  const nameAt = cover.indexOf("data-cover-name");
  const hopAt = cover.indexOf("data-cover-hop");
  const bidAt = cover.indexOf(">$20<");
  assert.ok(nameAt > -1 && nameAt < bidAt, "occupied cover name still reads before $bid");
  assert.ok(hopAt > -1 && hopAt < bidAt, "occupied Test this today still sits before $bid");
  assert.match(under, /<p class="bid">\$8<\/p>/);
  assert.doesNotMatch(under, /data-cover-name=""/);
  assert.doesNotMatch(under, /data-later-fact=""/);
  assert.doesNotMatch(under, /Test this today/);
  assert.match(paid, /class="claim-kicker">List a product</);
  assert.match(paid, /data-last24h-fact=""/);
  assert.doesNotMatch(cover, />24h /);
});

test("GET / keeps occupied cover #1 and last-24h #1 two prizes — strip 24h 1 is not this morning’s cover", async () => {
  const css = BOARD_CSS;
  const twoPrizes = (css.split(".desk[data-two-prizes]", 2)[1] ?? "").split("#claim {")[0] ?? "";
  assert.match(css, /\.desk\[data-two-prizes\] \.row-cover\[data-morning-slot\] \.host\[data-cover-name\]/);
  assert.match(css, /\.desk\[data-two-prizes\] \.last24h-row\[data-last24h-prize\] \.last24h-host/);
  assert.match(css, /\.desk\[data-two-prizes\] \.last24h-row\[data-last24h-prize\] \.last24h-rank/);
  assert.match(css, /\.last24h-row\[data-last24h-prize\] \.last24h-host/);
  assert.match(css, /\.last24h-slot/);
  const coverName = css.match(
    /\.desk\[data-two-prizes\] \.row-cover\[data-morning-slot\] \.host\[data-cover-name\]\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  const stripHost = css.match(
    /\.desk\[data-two-prizes\] \.last24h-row\[data-last24h-prize\] \.last24h-host\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  const stripRank = css.match(
    /\.desk\[data-two-prizes\] \.last24h-row\[data-last24h-prize\] \.last24h-rank\s*\{[\s\S]*?font-size:\s*([0-9.]+)rem/,
  );
  assert.ok(coverName && stripHost && stripRank, "two-prize CSS must size both prizes");
  assert.ok(Number(coverName[1]) > Number(stripHost[1]), "morning cover name stays larger than strip #1 host");
  assert.ok(Number(stripHost[1]) > Number(stripRank[1]), "strip host stays larger than receded 24h 1");
  assert.doesNotMatch(twoPrizes, /var\(--primary\)/);
  assert.doesNotMatch(css, /take-after-list-seven|list-after-take-seven|data-empty-claim-after/);

  const now = new Date("2026-08-23T00:30:00.000Z");
  const differentCoverHtml = renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [
      {
        id: "lst-cover",
        day: "2026-08-23",
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-23T00:10:00.000Z",
        updatedAt: "2026-08-23T00:10:00.000Z",
        rank: 1,
      },
    ],
    last24h: [
      {
        id: "lst-last-night",
        day: "2026-08-22",
        productUrl: "https://overnight.example/sku",
        whyTestThisToday: "Last night’s $6 still belongs on the last-24h strip",
        bidUsd: 9,
        paidUsd: 9,
        clicks: 1,
        createdAt: "2026-08-22T12:00:00.000Z",
        updatedAt: "2026-08-22T12:00:00.000Z",
        rank: 1,
      },
      {
        id: "lst-cover",
        day: "2026-08-23",
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 8,
        paidUsd: 8,
        clicks: 3,
        createdAt: "2026-08-23T00:10:00.000Z",
        updatedAt: "2026-08-23T00:10:00.000Z",
        rank: 2,
      },
    ],
    defaultBidUsd: 21,
    now,
  });
  assert.match(differentCoverHtml, /data-two-prizes=""/);
  assertTwoPrizes(differentCoverHtml, "lst-cover", "lst-last-night");
  assert.match(differentCoverHtml, /data-last24h-id="lst-cover"/);
  assert.match(differentCoverHtml, /data-last24h-rank="2"/);
  const differentStrip = differentCoverHtml.slice(
    differentCoverHtml.indexOf('data-last24h=""'),
    differentCoverHtml.indexOf('id="claim"'),
  );
  const coverOnStrip = differentStrip.slice(
    differentStrip.indexOf('data-last24h-id="lst-cover"'),
    differentStrip.indexOf("</li>", differentStrip.indexOf('data-last24h-id="lst-cover"')),
  );
  assert.doesNotMatch(coverOnStrip, /data-last24h-prize=/);
  assert.doesNotMatch(coverOnStrip, /Rolling 24h spend/);
  assertStripRankIsLast24hFact(differentStrip, [1, 2]);

  const previousTz = process.env.BOARD_TZ;
  process.env.BOARD_TZ = "UTC";
  after(() => {
    if (previousTz === undefined) {
      delete process.env.BOARD_TZ;
    } else {
      process.env.BOARD_TZ = previousTz;
    }
  });
  const liveDb = openDatabase(":memory:");
  placeBid(liveDb, {
    id: "lst-last-night",
    day: "2026-08-22",
    productUrl: "https://overnight.example/sku",
    whyTestThisToday: "Last night’s $6 still belongs on the last-24h strip",
    bidUsd: 9,
    createdAt: "2026-08-22T12:00:00.000Z",
  });
  placeBid(liveDb, {
    id: "lst-cover",
    day: "2026-08-23",
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 5,
    createdAt: "2026-08-23T00:10:00.000Z",
  });
  const liveApp = await buildApp({ db: liveDb, now });
  after(async () => {
    await liveApp.close();
    liveDb.close();
  });
  const live = await liveApp.inject({ method: "GET", url: "/" });
  assert.equal(live.statusCode, 200);
  assert.match(live.body, /data-two-prizes=""/);
  assertTwoPrizes(live.body, "lst-cover", "lst-last-night");
  assert.doesNotMatch(live.body, /data-last24h-empty=/);
  assert.doesNotMatch(live.body, /data-take-after-list-seven/);
  assert.doesNotMatch(live.body, /data-list-after-take-seven/);

  const emptyCoverHtml = pageBody(renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [],
    last24h: [
      {
        id: "lst-last-night",
        day: "2026-08-22",
        productUrl: "https://overnight.example/sku",
        whyTestThisToday: "Last night’s $6 still belongs on the last-24h strip",
        bidUsd: 6,
        paidUsd: 6,
        clicks: 0,
        createdAt: "2026-08-22T12:00:00.000Z",
        updatedAt: "2026-08-22T12:00:00.000Z",
        rank: 1,
      },
    ],
    defaultBidUsd: 5,
    now,
  }));
  assert.match(emptyCoverHtml, /data-empty-cover=""/);
  assert.match(emptyCoverHtml, /data-empty-claim-first=""/);
  assert.match(emptyCoverHtml, /data-first-click="claim"/);
  assert.match(emptyCoverHtml, /Claim #1 for/);
  assert.match(emptyCoverHtml, /data-last24h-prize=""/);
  assert.match(emptyCoverHtml, /Rolling 24h spend/);
  assert.doesNotMatch(emptyCoverHtml, /data-two-prizes=/);
  assert.doesNotMatch(emptyCoverHtml, /data-morning-slot=/);
  assert.doesNotMatch(emptyCoverHtml, /This morning’s cover/);
  assert.doesNotMatch(emptyCoverHtml, /data-cover-hop/);
  const emptyCoverStrip = emptyCoverHtml.slice(
    emptyCoverHtml.indexOf('data-last24h=""'),
    emptyCoverHtml.indexOf('id="claim"'),
  );
  assertStripRankIsLast24hFact(emptyCoverStrip, [1]);

  const emptyStrip = pageBody(renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [
      {
        id: "lst-cover",
        day: "2026-08-23",
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-23T00:10:00.000Z",
        updatedAt: "2026-08-23T00:10:00.000Z",
        rank: 1,
      },
    ],
    last24h: [],
    defaultBidUsd: 21,
    now,
  }));
  assert.match(emptyStrip, /data-morning-slot=""/);
  assert.match(emptyStrip, /This morning’s cover/);
  assert.match(emptyStrip, /data-last24h-empty=""/);
  assert.match(emptyStrip, /data-last24h-empty-strip=""/);
  assert.doesNotMatch(emptyStrip, /data-two-prizes=/);
  assert.doesNotMatch(emptyStrip, /data-last24h-prize=/);
  assert.doesNotMatch(emptyStrip, /data-last24h-occupied=/);
  assert.doesNotMatch(emptyStrip, />24h 1</);
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
  assert.match(body, /rolling/);
  assert.match(body, /last-24-hours strip/);
  assert.match(body, /not a second cover/i);
  assert.match(body, /last-24h facts/);
  assert.match(body, /not today’s cover #1/);
  assert.match(body, /this morning’s slot/);
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
  assert.match(body, /rolling last 24 hours/);
  assert.match(body, /Not civil midnight/);
  assert.match(body, /Not a second cover/);
  assert.match(body, /last-24h facts/);
  assert.match(body, /not today’s cover #1/);
  assert.match(body, /this morning’s slot/);
  assert.match(body, /two prizes/);
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
