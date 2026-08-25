import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { applyPaidBid, placeBid } from "../src/core/board.js";
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
  assert.match(body, /data-later-write=""/);
  assert.match(body, /data-listing-identity=""/);
  assert.match(body, /Then the product URL/);
  assert.match(body, /data-why-later=""/);
  assert.match(body, /Then why test this today/);
  assert.doesNotMatch(body, /class="bid-row"/);
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
  assert.doesNotMatch(body, /data-paid-name=/);
  assert.doesNotMatch(body, /data-later-listing=/);
  assert.doesNotMatch(body, /One-line listing/);
  assert.doesNotMatch(body, /data-later-fact=""/);
  assert.doesNotMatch(body, /class="bid later-fact"/);
  assert.doesNotMatch(desk, /data-occupied="true"/);
  assert.doesNotMatch(desk, /data-two-prizes=/);
  assert.doesNotMatch(desk, /data-morning-slot=/);
  assert.doesNotMatch(desk, /data-last24h-prize=/);
  assert.doesNotMatch(desk, /data-last24h-occupied=/);
  assert.doesNotMatch(body, /data-unpaid-off=/);
  assert.doesNotMatch(body, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(body, /An abandoned listing is not cover #1/);
  const emptyAt = body.indexOf("data-empty-board");
  const stripAt = body.indexOf('data-last24h=""');
  const claimAt = body.indexOf('id="claim"');
  const emptyClaimAt = body.indexOf('data-empty-claim-first=""', claimAt);
  const firstClickAt = body.indexOf('data-first-click="claim"');
  const outbidAt = body.indexOf(">Outbid<");
  const laterWriteAt = body.indexOf('data-later-write=""');
  const productUrlAt = body.indexOf('name="productUrl"');
  const whyLaterAt = body.indexOf('data-why-later=""');
  const whyAt = body.indexOf('name="whyTestThisToday"');
  assert.ok(emptyAt > -1 && claimAt > emptyAt, "quiet morning must precede claim chrome");
  assert.ok(stripAt > emptyAt && stripAt < claimAt, "last-24h strip sits under the one cover, before claim chrome");
  assert.ok(emptyClaimAt > claimAt && firstClickAt > emptyClaimAt, "empty Claim #1 is the only first click");
  assert.ok(outbidAt > firstClickAt && laterWriteAt > outbidAt, "product URL is a later write after Claim #1 / Outbid");
  assert.ok(productUrlAt > laterWriteAt && whyLaterAt > productUrlAt, "Why test this today is a later write after the product URL");
  assert.ok(whyAt > whyLaterAt, "Why test this today is not a twin field of the product URL");
  assert.equal((body.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((body.match(/data-empty-claim-first=""/g) ?? []).length, 2);
  assert.equal((body.match(/data-later-write=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-why-later=""/g) ?? []).length, 1);
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
  assert.match(body, /claim this rank for \$11/);
  assert.match(body, /This morning’s cover/);
  assert.match(body, /Why test this today/);
  assert.match(body, /data-cover-why=""/);
  assert.match(body, /Also on the desk/);
  assert.match(body, /row-cover/);
  assert.match(body, /List a product/);
  assert.match(body, /data-list-after-take=""/);
  assert.match(body, /href="#claim"/);
  assert.match(body, /data-cover-hop=""/);
  assert.match(body, /data-first-click="take"/);
  assert.match(body, /href="\/r\/lst-cover"/);
  assert.match(body, /aria-label="Test this today at cover\.example\/apps\/pick"/);
  const coverAt = body.indexOf('data-listing-id="lst-cover"');
  const hopAt = body.indexOf("data-cover-hop");
  const listAfterTakeAt = body.indexOf('data-list-after-take=""');
  const claimAt = body.indexOf('id="claim"');
  const stackAt = body.indexOf("Also on the desk");
  const coverWhyAt = body.indexOf('data-cover-why=""');
  const hopLabelAt = body.indexOf(">Test this today<");
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(coverAt > -1 && claimAt > coverAt, "today’s #1 must precede claim chrome");
  assert.ok(hopAt > coverAt && hopAt < claimAt, "cover hop lives on today’s #1, not the listing form");
  assert.ok(hopLabelAt > hopAt && hopLabelAt < claimAt, "Test this today is the cover action, not a field label");
  assert.ok(coverWhyAt > coverAt && coverWhyAt < hopAt, "cover why-line is the first cover read, before Test this today");
  assert.ok(hopAt > coverWhyAt && hopAt < body.indexOf(">$20<"), "Test this today takes after the why prize, before $bid");
  assert.ok(listAfterTakeAt > hopAt && listAfterTakeAt < body.indexOf(">$20<"), "one later List write sits after Test this today, before $bid");
  assert.doesNotMatch(body, /data-list-under-cover/);
  assert.doesNotMatch(body, /data-list-after-why/);
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
  assert.doesNotMatch(response.body, /data-paid-name=/);
  assert.doesNotMatch(response.body, /data-later-listing=/);
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
  assert.doesNotMatch(cover, /data-list-after-why/);
  assert.match(cover, /data-take-after-list=""/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const hopAt = cover.indexOf("data-cover-hop");
  const takeAt = cover.indexOf("data-take-after-list");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const bidAt = cover.indexOf(">$20<");
  assert.ok(whyLineAt > -1 && hopAt > whyLineAt, "Test this today sits after the why prize");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "the take wrap is the next control after the why prize");
  assert.ok(listAfterTakeAt > hopAt, "one later List write sits after Test this today");
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
  assert.doesNotMatch(body, /data-list-after-why=/);
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
  const listAfterTakeAt = body.indexOf('data-list-after-take=""');
  const coverAt = body.indexOf('data-listing-id="lst-cover"');
  const hopAt = body.indexOf("data-cover-hop");
  const claimAt = body.indexOf('id="claim"');
  const coverWhyAt = body.indexOf('data-cover-why=""');
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  const claimSlice = body.slice(claimAt);

  assert.match(body, /data-list-after-take=""/);
  assert.doesNotMatch(body, /data-list-under-cover=/);
  assert.doesNotMatch(body, /data-list-after-why=/);
  assert.match(body, /href="#claim"/);
  assert.match(body, /after Test this today/);
  assert.match(body, /Paying less than #1 still lists/);
  assert.match(body, />List a product</);
  assert.doesNotMatch(body, /class="claim-kicker"/);
  assert.doesNotMatch(claimSlice, /List a product/);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/>List a product</g) ?? []).length, 1);
  assert.ok(listAfterTakeAt > hopAt && listAfterTakeAt < claimAt, "one later List write sits after Test this today");
  assert.ok(coverWhyAt > coverAt && coverWhyAt < hopAt, "cover why-line sits on today’s #1, before the hop");
  assert.ok(claimAt > coverAt, "the listing form still lives under the cover");
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
  assert.doesNotMatch(cover, /data-list-after-why/);
  assert.doesNotMatch(cover, /class="blurb"/);
  const whyAt = cover.indexOf("data-cover-why");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const bidAt = cover.indexOf(">$20<");
  const hopAt = cover.indexOf("data-cover-hop");
  assert.ok(whyAt > -1 && whyAt < bidAt, "cover reason precedes $bid");
  assert.ok(whyAt < hopAt, "cover reason precedes Test this today");
  assert.ok(hopAt < bidAt, "Test this today takes after the why prize, before $bid");
  assert.ok(listAfterTakeAt > hopAt && listAfterTakeAt < bidAt, "one later List write sits after Test this today, before $bid");

  assert.match(under, /class="slot"/);
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
  assert.doesNotMatch(cover, /data-list-after-why/);
  assert.match(cover, /href="#claim"/);
  assert.match(cover, />List a product</);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /after Test this today/);
  assert.match(cover, /Paying less than #1 still lists/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const hopAt = cover.indexOf("data-cover-hop");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const bidAt = cover.indexOf(">$20<");
  assert.ok(whyLineAt > -1 && hopAt > whyLineAt, "why prize sits before Test this today");
  assert.ok(listAfterTakeAt > hopAt, "one later List write sits after Test this today");
  assert.ok(listAfterTakeAt < bidAt, "listing after Take is not buried under $bid");

  assert.doesNotMatch(under, /data-list-after-why/);
  assert.doesNotMatch(under, /under this reason/);
  assert.doesNotMatch(body, /data-list-after-why=/);
  assert.doesNotMatch(body, /data-list-under-cover=/);
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

  assert.doesNotMatch(cover, /data-list-after-why/);
  assert.match(cover, /data-take-after-list=""/);
  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /href="\/r\/lst-cover"/);
  const whyLineAt = cover.indexOf("cover-why-line");
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt && takeAt < hopAt, "the shopper take is the next control after the why prize");
  assert.ok(hopAt < bidAt && hopAt < hostAt, "Test this today is not quieter than host or $bid");
  assert.ok((cover.match(/data-cover-hop/g) ?? []).length === 1, "one cover hop");

  assert.doesNotMatch(under, /data-take-after-list/);
  assert.doesNotMatch(under, /data-cover-hop/);
  assert.doesNotMatch(under, /Test this today/);
  assert.equal((body.match(/data-take-after-list=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-hop/g) ?? []).length, 1);
  assert.doesNotMatch(body, /data-list-after-why=/);
  assert.doesNotMatch(body, /data-list-under-cover=/);

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

  assert.doesNotMatch(cover, /data-list-after-why/);
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
  const takeAt = cover.indexOf("data-take-after-list");
  const hopAt = cover.indexOf("data-cover-hop");
  const listAfterTakeAt = cover.indexOf("data-list-after-take");
  const firstWriteAt = cover.indexOf('data-first-write="list"');
  const bidAt = cover.indexOf(">$20<");
  const hostAt = cover.indexOf('class="host"');
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.doesNotMatch(body, /data-list-after-why=/);
  assert.doesNotMatch(body, /data-list-under-cover=/);

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

  assert.doesNotMatch(cover, /data-list-after-why/);
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.doesNotMatch(body, /data-list-after-why=/);
  assert.doesNotMatch(body, /data-list-under-cover=/);

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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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
  assert.ok(whyLineAt > -1 && takeAt > whyLineAt, "why stays the prize; Take follows the why-line");
  assert.ok(takeAt > whyLineAt && takeAt < hopAt, "take-after-list stays the shopper hop after the why prize");
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

  assert.match(under, /class="slot"/);
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
  assert.match(cover, /data-paid-name=""/);
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
  assert.match(under, /class="dek"/);
  assert.match(under, /class="slot"/);
  assert.doesNotMatch(under, /data-cover-name=""/);
  assert.doesNotMatch(under, /class="host"/);
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
  const laterWriteAt = quiet.indexOf('data-later-write=""');
  const laterLabelAt = quiet.indexOf("Then the product URL");
  const productUrlAt = quiet.indexOf('name="productUrl"');
  const whyLaterAt = quiet.indexOf('data-why-later=""');
  const whyLabelAt = quiet.indexOf("Then why test this today");
  const whyAt = quiet.indexOf('name="whyTestThisToday"');
  assert.ok(emptyCoverAt > -1 && claimAt > emptyCoverAt, "quiet morning still precedes Claim #1");
  assert.ok(emptyClaimAt > claimAt && firstClickAt > emptyClaimAt, "Claim #1 is stamped the only first click");
  assert.ok(claimCopyAt > firstClickAt && outbidAt > claimCopyAt, "the first click is Claim #1, then Outbid");
  assert.ok(laterWriteAt > outbidAt && laterLabelAt > laterWriteAt, "product URL is a later write after Outbid");
  assert.ok(productUrlAt > laterLabelAt && whyLaterAt > productUrlAt, "Why test this today is a later write after the product URL");
  assert.ok(whyLabelAt > whyLaterAt && whyAt > whyLabelAt, "Why test this today is not a twin field of the product URL");
  assert.equal((quiet.match(/data-empty-claim-first=""/g) ?? []).length, 2);
  assert.equal((quiet.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((quiet.match(/data-later-write=""/g) ?? []).length, 1);
  assert.equal((quiet.match(/data-why-later=""/g) ?? []).length, 1);
  assert.match(quiet, /class="empty-claim-first"/);
  assert.match(quiet, /data-empty-claim=""/);
  assert.match(quiet, /aria-label="Claim #1"/);
  assert.match(quiet, /data-occupied="false"/);
  assert.match(quiet, /data-empty-board/);
  assert.match(quiet, /Quiet morning/);
  assert.match(quiet, /not an invented cover/);
  assert.match(quiet, /Claim #1 for/);
  assert.match(quiet, />Outbid</);
  assert.match(quiet, /data-listing-identity=""/);
  assert.match(quiet, /Then the product URL/);
  assert.match(quiet, /data-why-later=""/);
  assert.match(quiet, /Then why test this today/);
  assert.match(quiet, /data-last24h-empty=""/);
  assert.doesNotMatch(quiet, /class="bid-row"/);
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
  assert.match(cover, /data-paid-name=""/);
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
  assert.doesNotMatch(under, /data-paid-name=/);
  assert.doesNotMatch(under, /data-later-fact=""/);
  assert.doesNotMatch(under, /Test this today/);
  assert.doesNotMatch(paid, /class="claim-kicker"/);
  assert.match(paid, /data-last24h-fact=""/);
  assert.match(paid, /class="bid-row"/);
  assert.doesNotMatch(paid, /data-later-write=/);
  assert.doesNotMatch(paid, /data-listing-identity=/);
  assert.doesNotMatch(paid, /Then the product URL/);
  assert.doesNotMatch(paid, /data-why-later=/);
  assert.doesNotMatch(paid, /Then why test this today/);
  assert.doesNotMatch(cover, />24h /);
});

test("GET / keeps occupied cover #1 and last-24h #1 two prizes — strip 24h 1 is not this morning’s cover", async () => {
  const css = BOARD_CSS;
  const twoPrizes = (css.split(".desk[data-two-prizes]", 2)[1] ?? "")
    .split("Occupied morning: Take is the only first click")[0] ?? "";
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

test("GET / keeps empty morning Claim #1 the first click — product URL is a later write", async () => {
  const css = BOARD_CSS;
  assert.match(css, /#claim\.empty-claim-first\[data-empty-claim-first\] \.listing-identity\[data-later-write\]/);
  assert.match(css, /#claim\.empty-claim-first\[data-empty-claim-first\] \.later-write-label/);
  assert.match(css, /Empty morning: Product URL is a later write after Claim #1 \/ Outbid/);
  const later = (css.split("Empty morning: Product URL is a later write after Claim #1 / Outbid", 2)[1] ?? "")
    .split("Empty morning: Why test this today is a later write after the product URL")[0] ?? "";
  assert.match(later, /border-top:\s*1px dashed var\(--border\)/);
  assert.match(later, /color:\s*var\(--muted-foreground\)/);
  assert.doesNotMatch(later, /background:/);
  assert.doesNotMatch(later, /var\(--primary\)/);
  assert.doesNotMatch(css, /data-empty-claim-after|data-claim-after-empty|take-after-list-seven|list-after-take-seven/);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.equal(empty.statusCode, 200);
  const quiet = pageBody(empty.body);
  const claimAt = quiet.indexOf('id="claim"');
  const firstClickAt = quiet.indexOf('data-first-click="claim"');
  const claimCopyAt = quiet.indexOf("Claim #1 for");
  const outbidAt = quiet.indexOf(">Outbid<");
  const laterWriteAt = quiet.indexOf('data-later-write=""');
  const laterLabelAt = quiet.indexOf("Then the product URL");
  const productUrlAt = quiet.indexOf('name="productUrl"');
  const whyLaterAt = quiet.indexOf('data-why-later=""');
  const whyLabelAt = quiet.indexOf("Then why test this today");
  const whyAt = quiet.indexOf('name="whyTestThisToday"');
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /class="empty-claim-first"/);
  assert.match(quiet, /data-empty-claim-first=""/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.match(quiet, /aria-label="Claim #1"/);
  assert.match(quiet, /data-listing-identity=""/);
  assert.match(quiet, /data-later-write=""/);
  assert.match(quiet, /Then the product URL/);
  assert.match(quiet, /data-why-later=""/);
  assert.match(quiet, /Then why test this today/);
  assert.match(quiet, /name="productUrl"/);
  assert.match(quiet, /name="whyTestThisToday"/);
  assert.match(quiet, />Outbid</);
  assert.match(quiet, /data-last24h-empty=""/);
  assert.doesNotMatch(quiet, /class="bid-row"/);
  assert.doesNotMatch(quiet, /List a product/);
  assert.doesNotMatch(quiet, /Test this today/);
  assert.doesNotMatch(quiet, /data-first-click="take"/);
  assert.doesNotMatch(quiet, /data-occupied="true"/);
  assert.doesNotMatch(quiet, /data-two-prizes=/);
  assert.doesNotMatch(quiet, /data-empty-claim-after/);
  assert.doesNotMatch(quiet, /take-after-list-seven/);
  assert.ok(claimAt > -1 && firstClickAt > claimAt, "Claim #1 still owns the empty first click");
  assert.ok(claimCopyAt > firstClickAt && outbidAt > claimCopyAt, "Outbid sits with Claim #1, not the product URL");
  assert.ok(laterWriteAt > outbidAt && laterLabelAt > laterWriteAt, "product URL is the later write after that hop");
  assert.ok(productUrlAt > laterLabelAt && whyLaterAt > productUrlAt, "Why test this today is a later write after the product URL");
  assert.ok(whyLabelAt > whyLaterAt && whyAt > whyLabelAt, "Why test this today is not a twin field of the product URL");
  assert.equal((quiet.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((quiet.match(/data-later-write=""/g) ?? []).length, 1);
  assert.equal((quiet.match(/data-listing-identity=""/g) ?? []).length, 1);
  assert.equal((quiet.match(/data-why-later=""/g) ?? []).length, 1);

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
  const occupiedApp = await buildApp({ db: occupiedDb, now });
  after(async () => {
    await occupiedApp.close();
    occupiedDb.close();
  });
  const occupied = await occupiedApp.inject({ method: "GET", url: "/" });
  assert.equal(occupied.statusCode, 200);
  const paid = pageBody(occupied.body);
  const paidClaimAt = paid.indexOf('id="claim"');
  const paidBidRowAt = paid.indexOf('class="bid-row"');
  const paidProductAt = paid.indexOf('name="productUrl"');
  const paidOutbidAt = paid.indexOf(">Outbid<");
  const paidWhyAt = paid.indexOf('name="whyTestThisToday"');
  assert.match(paid, /data-occupied="true"/);
  assert.match(paid, /class="bid-row"/);
  assert.doesNotMatch(paid, /class="claim-kicker"/);
  assert.match(paid, /data-morning-slot=""/);
  assert.doesNotMatch(paid, /data-empty-claim-first/);
  assert.doesNotMatch(paid, /empty-claim-first/);
  assert.doesNotMatch(paid, /data-first-click="claim"/);
  assert.doesNotMatch(paid, /data-later-write=/);
  assert.doesNotMatch(paid, /data-listing-identity=/);
  assert.doesNotMatch(paid, /Then the product URL/);
  assert.doesNotMatch(paid, /data-why-later=/);
  assert.doesNotMatch(paid, /Then why test this today/);
  assert.ok(paidBidRowAt > paidClaimAt && paidProductAt > paidBidRowAt, "occupied form still puts Product URL on the claim rail");
  assert.ok(paidOutbidAt > paidProductAt && paidWhyAt > paidOutbidAt, "occupied Outbid still sits with Product URL, listing under");
  assert.match(paid, /data-later-listing=""/);
  assert.match(paid, /data-prize-line=""/);
  assert.match(paid, />Why</);
  assert.doesNotMatch(paid, /One-line listing/);
  assert.doesNotMatch(paid.slice(paidClaimAt), /What a seller should try this morning/);

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
    now: new Date("2026-08-23T00:30:00.000Z"),
  }));
  assert.match(emptyCoverHtml, /data-empty-cover=""/);
  assert.match(emptyCoverHtml, /data-first-click="claim"/);
  assert.match(emptyCoverHtml, /data-later-write=""/);
  assert.match(emptyCoverHtml, /Then the product URL/);
  assert.match(emptyCoverHtml, /data-why-later=""/);
  assert.match(emptyCoverHtml, /Then why test this today/);
  assert.match(emptyCoverHtml, /data-last24h-prize=""/);
  assert.doesNotMatch(emptyCoverHtml, /class="bid-row"/);
  assert.doesNotMatch(emptyCoverHtml, /data-two-prizes=/);
  assert.doesNotMatch(emptyCoverHtml, /This morning’s cover/);
});

test("GET / keeps empty morning Claim #1 the first click — Why test this today is a later write", async () => {
  const css = BOARD_CSS;
  assert.match(css, /#claim\.empty-claim-first\[data-empty-claim-first\] \.why-later\[data-why-later\]/);
  assert.match(css, /#claim\.empty-claim-first\[data-empty-claim-first\] \.why-later-label/);
  assert.match(css, /Empty morning: Why test this today is a later write after the product URL/);
  const urlLater = (css.split("Empty morning: Product URL is a later write after Claim #1 / Outbid", 2)[1] ?? "")
    .split("Empty morning: Why test this today is a later write after the product URL")[0] ?? "";
  const whyLaterCss = (css.split("Empty morning: Why test this today is a later write after the product URL", 2)[1] ?? "")
    .split(".claim-kicker {")[0] ?? "";
  const urlMax = urlLater.match(/max-width:\s*([0-9.]+)rem/);
  const whyMax = whyLaterCss.match(/max-width:\s*([0-9.]+)rem/);
  const urlHeight = urlLater.match(/height:\s*([0-9.]+)rem/);
  const whyHeight = whyLaterCss.match(/height:\s*([0-9.]+)rem/);
  const urlFont = urlLater.match(/\.field input \{[^}]*font-size:\s*([0-9.]+)rem/);
  const whyFont = whyLaterCss.match(/\.field input \{[^}]*font-size:\s*([0-9.]+)rem/);
  assert.ok(urlMax && whyMax && urlHeight && whyHeight && urlFont && whyFont, "empty Why later-write CSS must size both writes");
  assert.ok(Number(urlMax[1]) > Number(whyMax[1]), "Why later write stays narrower than the product URL");
  assert.ok(Number(urlHeight[1]) > Number(whyHeight[1]), "Why later write stays shorter than the product URL");
  assert.ok(Number(urlFont[1]) > Number(whyFont[1]), "Why later write stays quieter than the product URL");
  assert.match(urlLater, /border-top:\s*1px dashed var\(--border\)/);
  assert.match(whyLaterCss, /border-top:\s*1px dotted var\(--border\)/);
  assert.doesNotMatch(urlLater, /why-later|data-why-later/);
  assert.doesNotMatch(whyLaterCss, /listing-identity|data-later-write/);
  assert.doesNotMatch(whyLaterCss, /background:/);
  assert.doesNotMatch(whyLaterCss, /var\(--primary\)/);
  assert.doesNotMatch(css, /data-empty-claim-after|data-claim-after-empty|take-after-list-seven|list-after-take-seven|data-why-later-quiet/);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  assert.equal(empty.statusCode, 200);
  const quiet = pageBody(empty.body);
  const claimAt = quiet.indexOf('id="claim"');
  const firstClickAt = quiet.indexOf('data-first-click="claim"');
  const outbidAt = quiet.indexOf(">Outbid<");
  const laterWriteAt = quiet.indexOf('data-later-write=""');
  const laterLabelAt = quiet.indexOf("Then the product URL");
  const productUrlAt = quiet.indexOf('name="productUrl"');
  const whyLaterAt = quiet.indexOf('data-why-later=""');
  const whyLabelAt = quiet.indexOf("Then why test this today");
  const whyAt = quiet.indexOf('name="whyTestThisToday"');
  const identity = quiet.slice(laterWriteAt, whyLaterAt);
  const whyWrap = quiet.slice(whyLaterAt, quiet.indexOf("Already on the list"));
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /class="empty-claim-first"/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.match(quiet, /aria-label="Claim #1"/);
  assert.match(quiet, /Claim #1 for/);
  assert.match(quiet, />Outbid</);
  assert.match(quiet, /data-listing-identity=""/);
  assert.match(quiet, /data-later-write=""/);
  assert.match(quiet, /Then the product URL/);
  assert.match(quiet, /data-why-later=""/);
  assert.match(quiet, /Then why test this today/);
  assert.match(quiet, /name="productUrl"/);
  assert.match(quiet, /name="whyTestThisToday"/);
  assert.match(quiet, /data-last24h-empty=""/);
  assert.match(quiet, /No invented #1/);
  assert.doesNotMatch(quiet, /class="bid-row"/);
  assert.doesNotMatch(quiet, /List a product/);
  assert.doesNotMatch(quiet, /Test this today/);
  assert.doesNotMatch(quiet, /data-first-click="take"/);
  assert.doesNotMatch(quiet, /data-occupied="true"/);
  assert.doesNotMatch(quiet, /data-two-prizes=/);
  assert.doesNotMatch(quiet, /data-later-stack=/);
  assert.doesNotMatch(quiet, /data-empty-claim-after/);
  assert.doesNotMatch(quiet, /take-after-list-seven/);
  assert.match(identity, /name="productUrl"/);
  assert.match(identity, /Then the product URL/);
  assert.doesNotMatch(identity, /name="whyTestThisToday"/);
  assert.doesNotMatch(identity, /Then why test this today/);
  assert.match(whyWrap, /Then why test this today/);
  assert.match(whyWrap, /name="whyTestThisToday"/);
  assert.doesNotMatch(whyWrap, /name="productUrl"/);
  assert.ok(claimAt > -1 && firstClickAt > claimAt, "Claim #1 still owns the empty first click");
  assert.ok(outbidAt > firstClickAt && laterWriteAt > outbidAt, "product URL stays a later write after Claim #1 / Outbid");
  assert.ok(laterLabelAt > laterWriteAt && productUrlAt > laterLabelAt, "Product URL already sits after that hop");
  assert.ok(whyLaterAt > productUrlAt && whyLabelAt > whyLaterAt, "Why test this today is a later write after the product URL");
  assert.ok(whyAt > whyLabelAt, "Why test this today is not a twin field of the product URL");
  assert.equal((quiet.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((quiet.match(/data-later-write=""/g) ?? []).length, 1);
  assert.equal((quiet.match(/data-why-later=""/g) ?? []).length, 1);
  assert.equal((quiet.match(/data-listing-identity=""/g) ?? []).length, 1);

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
  const paid = pageBody(occupied.body);
  const paidClaimAt = paid.indexOf('id="claim"');
  const paidBidRowAt = paid.indexOf('class="bid-row"');
  const paidProductAt = paid.indexOf('name="productUrl"');
  const paidOutbidAt = paid.indexOf(">Outbid<");
  const paidWhyAt = paid.indexOf('name="whyTestThisToday"');
  assert.match(paid, /data-occupied="true"/);
  assert.match(paid, /class="bid-row"/);
  assert.match(paid, /data-two-prizes=""/);
  assert.match(paid, /data-morning-slot=""/);
  assert.match(paid, /data-last24h-prize=""/);
  assert.match(paid, /data-later-stack=""/);
  assert.doesNotMatch(paid, /class="claim-kicker"/);
  assert.doesNotMatch(paid, /data-empty-claim-first/);
  assert.doesNotMatch(paid, /data-first-click="claim"/);
  assert.doesNotMatch(paid, /data-later-write=/);
  assert.doesNotMatch(paid, /data-listing-identity=/);
  assert.doesNotMatch(paid, /Then the product URL/);
  assert.doesNotMatch(paid, /data-why-later=/);
  assert.doesNotMatch(paid, /Then why test this today/);
  assert.ok(paidBidRowAt > paidClaimAt && paidProductAt > paidBidRowAt, "occupied form still puts Product URL on the claim rail");
  assert.ok(paidOutbidAt > paidProductAt && paidWhyAt > paidOutbidAt, "occupied listing stays under Product URL + Outbid, not a later empty write");
  assert.match(paid, /data-later-listing=""/);
  assert.match(paid, /data-prize-line=""/);
  assert.match(paid, />Why</);
  assert.doesNotMatch(paid, /One-line listing/);
  assert.match(paid, /data-paid-name=""/);
  const paidClaimSlice = paid.slice(paidClaimAt);
  assert.doesNotMatch(paidClaimSlice, /What a seller should try this morning/);
  assert.doesNotMatch(paidClaimSlice, /data-paid-name=/);

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
    now: new Date("2026-08-23T00:30:00.000Z"),
  }));
  assert.match(emptyCoverHtml, /data-empty-cover=""/);
  assert.match(emptyCoverHtml, /data-first-click="claim"/);
  assert.match(emptyCoverHtml, /data-later-write=""/);
  assert.match(emptyCoverHtml, /data-why-later=""/);
  assert.match(emptyCoverHtml, /Then why test this today/);
  assert.match(emptyCoverHtml, /data-last24h-prize=""/);
  assert.doesNotMatch(emptyCoverHtml, /class="bid-row"/);
  assert.doesNotMatch(emptyCoverHtml, /data-two-prizes=/);
  assert.doesNotMatch(emptyCoverHtml, /This morning’s cover/);
  assert.doesNotMatch(emptyCoverHtml, /data-last24h-empty=/);
  const emptyCoverIdentity = emptyCoverHtml.slice(
    emptyCoverHtml.indexOf('data-listing-identity=""'),
    emptyCoverHtml.indexOf('data-why-later=""'),
  );
  assert.match(emptyCoverIdentity, /name="productUrl"/);
  assert.doesNotMatch(emptyCoverIdentity, /name="whyTestThisToday"/);
});

test("GET / keeps occupied later product names quieter than this morning’s cover — prize stays first", async () => {
  const css = BOARD_CSS;
  assert.match(css, /\.later-stack\[data-later-stack\] \.row\[data-later-rank\] \.dek/);
  assert.match(css, /\.later-stack\[data-later-stack\] \.row\[data-later-rank\] \.slot/);
  assert.match(css, /\.later-stack\[data-later-stack\]/);
  assert.match(css, /\.later-stack-kicker/);
  const laterCss = (css.split(".later-stack[data-later-stack] .row[data-later-rank] .dek", 2)[1] ?? "")
    .split(".later-stack[data-later-stack] .row[data-later-rank] .bid", 1)[0] ?? "";
  const coverName = css.match(
    /\.row-cover \.host\[data-cover-name\]\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  const laterHost = css.match(
    /\.later-stack\[data-later-stack\] \.row\[data-later-rank\] \.dek\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  assert.ok(coverName && laterHost, "cover prize and later-rank host must both be sized");
  assert.ok(Number(coverName[1]) > Number(laterHost[1]), "later-rank product names stay quieter than the cover prize");
  assert.doesNotMatch(laterCss, /var\(--primary\)/);
  assert.doesNotMatch(laterCss, /background:/);
  assert.doesNotMatch(css, /data-later-rank-quiet|data-later-quiet|0\.78rem --muted/);
  assert.doesNotMatch(css, /take-after-list-seven|list-after-take-seven|data-empty-claim-after/);

  const db = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
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
  placeBid(db, {
    id: "lst-third",
    day,
    productUrl: "https://third.example/sku",
    whyTestThisToday: "A third product still lists under the cover",
    bidUsd: 6,
    clicks: 0,
    createdAt: "2026-08-22T12:30:00.000Z",
  });

  const app = await buildApp({ db, now });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const cover = body.slice(coverStart, body.indexOf("</article>", coverStart));
  const stackAt = body.indexOf('data-later-stack=""');
  const underStart = body.indexOf('data-listing-id="lst-under"');
  const under = body.slice(underStart, body.indexOf("</article>", underStart));
  const thirdStart = body.indexOf('data-listing-id="lst-third"');
  const third = body.slice(thirdStart, body.indexOf("</article>", thirdStart));
  const stripAt = body.indexOf('data-last24h=""');
  const claimAt = body.indexOf('id="claim"');
  const hopAt = cover.indexOf('data-first-click="take"');
  const coverNameAt = cover.indexOf("data-cover-name");

  assert.match(cover, /data-morning-slot=""/);
  assert.match(cover, /This morning’s cover/);
  assert.match(cover, /data-cover-name=""/);
  assert.match(cover, /<p class="host" data-cover-name="">cover\.example\/apps\/pick<\/p>/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(body, /data-later-stack=""/);
  assert.match(body, /Also on the desk/);
  assert.match(body, /These product names are not this morning’s cover/);
  assert.match(under, /data-later-rank=""/);
  assert.match(under, /class="dek"/);
  assert.match(under, /<p class="dek">under\.example\/sku<\/p>/);
  assert.match(under, /class="slot"/);
  assert.match(under, /<p class="bid">\$8<\/p>/);
  assert.match(third, /data-later-rank=""/);
  assert.match(third, /class="dek"/);
  assert.match(third, /class="slot"/);
  assert.doesNotMatch(under, /data-cover-name=/);
  assert.doesNotMatch(under, /class="host"/);
  assert.doesNotMatch(under, /This morning’s cover/);
  assert.doesNotMatch(under, /row-kicker/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /Test this today/);
  assert.doesNotMatch(third, /data-cover-name=/);
  assert.doesNotMatch(third, /class="host"/);
  assert.doesNotMatch(cover, /data-later-rank=/);
  assert.doesNotMatch(cover, /class="dek"/);
  assert.doesNotMatch(cover, /class="slot"/);
  assert.equal((body.match(/data-cover-name=""/g) ?? []).length, 1);
  assert.equal((body.match(/This morning’s cover/g) ?? []).length, 1);
  assert.equal((body.match(/data-later-stack=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-later-rank=""/g) ?? []).length, 2);
  assert.ok(coverStart > -1 && hopAt > -1 && hopAt < coverNameAt, "Take / the cover hop stays the first occupied click");
  assert.ok(stackAt > coverStart && underStart > stackAt, "later ranks group under the cover, not beside it");
  assert.ok(thirdStart > underStart && stripAt > thirdStart, "later ranks stay above the last-24h strip");
  assert.ok(claimAt > stripAt, "claim chrome stays after the desk");
  assert.match(body, /data-occupied="true"/);
  assert.match(body, /data-two-prizes=""/);
  assert.match(body, /data-last24h-prize=""/);
  assert.match(body, /class="bid-row"/);
  assert.doesNotMatch(body, /data-later-write=/);
  assert.doesNotMatch(body, /data-later-rank-quiet/);
  assert.doesNotMatch(body, /data-later-quiet/);
  assert.doesNotMatch(body, /take-after-list-seven/);
  assert.doesNotMatch(body, /data-empty-claim-first/);

  const onlyCover = pageBody(renderBoardPage({
    day,
    tz: "UTC",
    listings: [
      {
        id: "lst-cover",
        day,
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-22T09:00:00.000Z",
        updatedAt: "2026-08-22T09:00:00.000Z",
        rank: 1,
      },
    ],
    last24h: [],
    defaultBidUsd: 21,
    now,
  }));
  assert.match(onlyCover, /data-morning-slot=""/);
  assert.match(onlyCover, /data-cover-name=""/);
  assert.doesNotMatch(onlyCover, /data-later-stack=/);
  assert.doesNotMatch(onlyCover, /data-later-rank=/);
  assert.match(onlyCover, /data-last24h-empty=""/);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  const quiet = pageBody(empty.body);
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.match(quiet, /data-later-write=""/);
  assert.match(quiet, /data-why-later=""/);
  assert.doesNotMatch(quiet, /data-later-stack=/);
  assert.doesNotMatch(quiet, /data-later-rank=/);
  assert.doesNotMatch(quiet, /These product names are not this morning’s cover/);
});

test("GET / keeps occupied cover #1 as the paid product — later ranks cannot wear it", async () => {
  const css = BOARD_CSS;
  assert.match(css, /\.row-cover\[data-paid-name\] \.host\[data-cover-name\]/);
  assert.match(css, /\.later-stack\[data-later-stack\] \.row\[data-later-rank\] \.dek/);
  assert.match(css, /\.later-stack\[data-later-stack\] \.row\[data-later-rank\] \.slot/);
  assert.match(css, /\.later-listing\[data-later-listing\]/);
  const paidCss = (css.split(".row-cover[data-paid-name] .host[data-cover-name]", 2)[1] ?? "")
    .split("}", 1)[0] ?? "";
  const laterDekCss = (css.split(".later-stack[data-later-stack] .row[data-later-rank] .dek {", 2)[1] ?? "")
    .split("}", 1)[0] ?? "";
  const laterSlotCss = (css.split(".later-stack[data-later-stack] .row[data-later-rank] .slot {", 2)[1] ?? "")
    .split("}", 1)[0] ?? "";
  const listingCss = (css.split(".later-listing[data-later-listing] .field input", 2)[1] ?? "")
    .split("}", 1)[0] ?? "";
  const paidSize = paidCss.match(/font-size:\s*([0-9.]+)rem/);
  const dekSize = laterDekCss.match(/font-size:\s*([0-9.]+)rem/);
  const slotSize = laterSlotCss.match(/font-size:\s*([0-9.]+)rem/);
  const listingSize = listingCss.match(/font-size:\s*([0-9.]+)rem/);
  assert.ok(paidSize && dekSize && slotSize && listingSize, "paid name, later dek/slot, and claim listing must be sized");
  assert.ok(Number(paidSize[1]) > Number(dekSize[1]), "later dek cannot wear the paid cover name size");
  assert.ok(Number(paidSize[1]) > Number(slotSize[1]), "later slot cannot wear the paid cover name size");
  assert.ok(Number(paidSize[1]) > Number(listingSize[1]), "occupied claim listing cannot wear the paid cover name size");
  assert.match(laterDekCss, /color:\s*var\(--muted-foreground\)/);
  assert.match(laterSlotCss, /color:\s*var\(--muted-foreground\)/);
  assert.doesNotMatch(paidCss, /var\(--primary\)/);
  assert.doesNotMatch(laterDekCss, /var\(--primary\)|background:/);
  assert.doesNotMatch(laterSlotCss, /var\(--primary\)|background:/);
  assert.doesNotMatch(listingCss, /var\(--primary\)|background:/);
  assert.doesNotMatch(css, /data-later-rank-quiet|data-later-quiet|data-paid-name-quiet/);
  assert.doesNotMatch(css, /take-after-list-seven|list-after-take-seven|data-empty-claim-after/);

  const db = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
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
  placeBid(db, {
    id: "lst-third",
    day,
    productUrl: "https://third.example/sku",
    whyTestThisToday: "A third product still lists under the cover",
    bidUsd: 6,
    clicks: 0,
    createdAt: "2026-08-22T12:30:00.000Z",
  });

  const app = await buildApp({ db, now });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const cover = body.slice(coverStart, body.indexOf("</article>", coverStart));
  const stackAt = body.indexOf('data-later-stack=""');
  const underStart = body.indexOf('data-listing-id="lst-under"');
  const under = body.slice(underStart, body.indexOf("</article>", underStart));
  const thirdStart = body.indexOf('data-listing-id="lst-third"');
  const third = body.slice(thirdStart, body.indexOf("</article>", thirdStart));
  const stripAt = body.indexOf('data-last24h=""');
  const claimAt = body.indexOf('id="claim"');
  const laterListingAt = body.indexOf('data-later-listing=""');
  const hopAt = cover.indexOf('data-first-click="take"');
  const paidAt = cover.indexOf("data-paid-name");
  const coverNameAt = cover.indexOf("data-cover-name");

  assert.match(cover, /data-morning-slot=""/);
  assert.match(cover, /data-paid-name=""/);
  assert.match(cover, /This morning’s cover/);
  assert.match(cover, /data-cover-name=""/);
  assert.match(cover, /<p class="host" data-cover-name="">cover\.example\/apps\/pick<\/p>/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(body, /data-later-stack=""/);
  assert.match(body, /These product names are not this morning’s cover/);
  assert.match(under, /data-later-rank=""/);
  assert.match(under, /<p class="dek">under\.example\/sku<\/p>/);
  assert.match(under, /<p class="slot">Cheaper SKU still belongs on the brief<\/p>/);
  assert.match(third, /data-later-rank=""/);
  assert.match(third, /<p class="dek">third\.example\/sku<\/p>/);
  assert.match(third, /<p class="slot">A third product still lists under the cover<\/p>/);
  assert.doesNotMatch(under, /data-paid-name=/);
  assert.doesNotMatch(under, /data-cover-name=/);
  assert.doesNotMatch(under, /class="host"/);
  assert.doesNotMatch(under, /This morning’s cover/);
  assert.doesNotMatch(third, /data-paid-name=/);
  assert.doesNotMatch(third, /class="host"/);
  assert.doesNotMatch(cover, /data-later-rank=/);
  assert.doesNotMatch(cover, /class="dek"/);
  assert.doesNotMatch(cover, /class="slot"/);
  assert.doesNotMatch(cover, /One-line listing/);
  assert.equal((body.match(/data-paid-name=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-name=""/g) ?? []).length, 1);
  assert.equal((body.match(/This morning’s cover/g) ?? []).length, 1);
  assert.equal((body.match(/data-later-listing=""/g) ?? []).length, 1);
  assert.ok(coverStart > -1 && hopAt > -1 && hopAt < coverNameAt, "Take / the cover hop stays the first occupied click");
  assert.ok(paidAt > -1 && paidAt < coverNameAt, "paid-name stamps the occupied cover before the host prize");
  assert.ok(stackAt > coverStart && underStart > stackAt, "later ranks group under the cover, not beside it");
  assert.ok(thirdStart > underStart && stripAt > thirdStart, "later ranks stay above the last-24h strip");
  assert.ok(claimAt > stripAt, "claim chrome stays after the desk");
  assert.ok(laterListingAt > claimAt, "occupied claim rail listing sits after Claim, not on the cover");
  assert.match(body, /data-occupied="true"/);
  assert.match(body, /data-two-prizes=""/);
  assert.match(body, /data-last24h-prize=""/);
  assert.match(body, /class="bid-row"/);
  assert.match(body, /class="later-listing" data-later-listing=""/);
  assert.match(body, /data-prize-line=""/);
  assert.match(body, /placeholder="Why test this today"/);
  assert.match(body, />Why</);
  assert.doesNotMatch(body, /One-line listing/);
  assert.doesNotMatch(body, /What a seller should try this morning/);
  assert.doesNotMatch(body, /data-later-write=/);
  assert.doesNotMatch(body, /data-later-rank-quiet/);
  assert.doesNotMatch(body, /data-later-quiet/);
  assert.doesNotMatch(body, /take-after-list-seven/);
  assert.doesNotMatch(body, /data-empty-claim-first/);

  const claimSlice = body.slice(claimAt);
  assert.match(claimSlice, /data-later-listing=""/);
  assert.match(claimSlice, /data-prize-line=""/);
  assert.match(claimSlice, />Why</);
  assert.match(claimSlice, /placeholder="Why test this today"/);
  assert.doesNotMatch(claimSlice, /One-line listing/);
  assert.doesNotMatch(claimSlice, /data-paid-name=/);
  assert.doesNotMatch(claimSlice, /data-cover-name=/);
  assert.doesNotMatch(claimSlice, /This morning’s cover/);
  assert.doesNotMatch(claimSlice, /cover\.example\/apps\/pick/);
  assert.doesNotMatch(claimSlice, /What a seller should try this morning/);

  const onlyCover = pageBody(renderBoardPage({
    day,
    tz: "UTC",
    listings: [
      {
        id: "lst-cover",
        day,
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-22T09:00:00.000Z",
        updatedAt: "2026-08-22T09:00:00.000Z",
        rank: 1,
      },
    ],
    last24h: [],
    defaultBidUsd: 21,
    now,
  }));
  assert.match(onlyCover, /data-morning-slot=""/);
  assert.match(onlyCover, /data-paid-name=""/);
  assert.match(onlyCover, /data-cover-name=""/);
  assert.match(onlyCover, /data-later-listing=""/);
  assert.match(onlyCover, /data-prize-line=""/);
  assert.match(onlyCover, />Why</);
  assert.doesNotMatch(onlyCover, /One-line listing/);
  assert.doesNotMatch(onlyCover, /data-later-stack=/);
  assert.doesNotMatch(onlyCover, /data-later-rank=/);
  assert.match(onlyCover, /data-last24h-empty=""/);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  const quiet = pageBody(empty.body);
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.match(quiet, /data-later-write=""/);
  assert.match(quiet, /data-why-later=""/);
  assert.match(quiet, /Then why test this today/);
  assert.match(quiet, /What a seller should try this morning/);
  assert.match(quiet, /data-last24h-empty=""/);
  assert.doesNotMatch(quiet, /data-paid-name=/);
  assert.doesNotMatch(quiet, /data-later-listing=/);
  assert.doesNotMatch(quiet, /One-line listing/);
  assert.doesNotMatch(quiet, /data-later-stack=/);
  assert.doesNotMatch(quiet, /data-later-rank=/);
  assert.doesNotMatch(quiet, /These product names are not this morning’s cover/);

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
    now: new Date("2026-08-23T00:30:00.000Z"),
  }));
  assert.match(emptyCoverHtml, /data-empty-cover=""/);
  assert.match(emptyCoverHtml, /data-first-click="claim"/);
  assert.match(emptyCoverHtml, /data-last24h-prize=""/);
  assert.match(emptyCoverHtml, /What a seller should try this morning/);
  assert.doesNotMatch(emptyCoverHtml, /data-paid-name=/);
  assert.doesNotMatch(emptyCoverHtml, /data-later-listing=/);
  assert.doesNotMatch(emptyCoverHtml, /One-line listing/);
  assert.doesNotMatch(emptyCoverHtml, /This morning’s cover/);
  assert.doesNotMatch(emptyCoverHtml, /data-two-prizes=/);
});

test("GET / keeps unpaid off the merch desk — No cover #1 until Polar reports paid", async () => {
  const css = BOARD_CSS;
  assert.match(css, /\.desk\[data-unpaid-off\] \.row-cover/);
  assert.match(css, /\.desk\[data-unpaid-off\] \.later-stack/);
  assert.match(css, /\.desk\[data-unpaid-off\] \.cover-hop/);
  assert.match(css, /\.desk\[data-unpaid-off\] \.later-listing/);
  assert.match(css, /\.claim-note\[data-unpaid-off\]/);
  assert.match(css, /\.desk\[data-occupied="true"\] \.row-cover\[data-paid-name\] \.host\[data-cover-name\]/);
  const unpaidHide = (css.split("Unpaid Polar checkout stays off the merch desk until Polar reports paid.", 2)[1] ?? "")
    .split(".claim-note[data-unpaid-off]", 1)[0] ?? "";
  assert.match(unpaidHide, /display:\s*none/);
  assert.doesNotMatch(unpaidHide, /background:/);
  assert.doesNotMatch(unpaidHide, /var\(--primary\)/);
  assert.doesNotMatch(css, /data-unpaid-off-quiet|data-unpaid-off-board|take-after-list-seven|list-after-take-seven|data-empty-claim-after/);

  const db = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
  placeBid(db, {
    id: "lst-ghost",
    day,
    productUrl: "https://ghost.example/sku",
    whyTestThisToday: "Abandoned Polar session must not print as this morning’s cover",
    bidUsd: 99,
    paidUsd: 0,
    clicks: 12,
    createdAt: "2026-08-22T08:00:00.000Z",
  });
  placeBid(db, {
    id: "lst-vapor",
    day,
    productUrl: "https://vapor.example/sku",
    whyTestThisToday: "Unpaid Polar checkout stays off the last-24h strip too",
    bidUsd: 40,
    paidUsd: 0,
    clicks: 3,
    createdAt: "2026-08-22T08:30:00.000Z",
  });

  const unpaidApp = await buildApp({ db, now });
  after(async () => {
    await unpaidApp.close();
    db.close();
  });
  const leftoverRes = await unpaidApp.inject({ method: "GET", url: "/" });
  assert.equal(leftoverRes.statusCode, 200);
  const leftover = pageBody(leftoverRes.body);
  const leftoverEmpty = leftover.indexOf("data-empty-cover");
  const leftoverClaim = leftover.indexOf('id="claim"');
  const leftoverFirst = leftover.indexOf('data-first-click="claim"');
  const leftoverOutbid = leftover.indexOf(">Outbid<");
  const leftoverUrl = leftover.indexOf('data-later-write=""');
  const leftoverWhy = leftover.indexOf('data-why-later=""');
  const leftoverNote = leftover.indexOf("Unpaid Polar checkout stays off this desk");
  assert.ok(leftoverEmpty > -1 && leftoverClaim > leftoverEmpty, "unpaid leftover stays a quiet morning, then Claim #1");
  assert.ok(leftoverFirst > leftoverClaim && leftoverOutbid > leftoverFirst, "empty Claim #1 stays the first click");
  assert.ok(leftoverUrl > leftoverOutbid && leftoverWhy > leftoverUrl, "empty later-write Product URL then Why stay after Outbid");
  assert.ok(leftoverNote > leftoverClaim, "unpaid-off copy sits on the claim rail, not as a cover");
  assert.match(leftover, /data-empty-board=""/);
  assert.match(leftover, /data-empty-cover=""/);
  assert.match(leftover, /Quiet morning/);
  assert.match(leftover, /not an invented cover/);
  assert.match(leftover, /data-occupied="false"/);
  assert.match(leftover, /data-empty-claim-first=""/);
  assert.match(leftover, /data-first-click="claim"/);
  assert.match(leftover, /data-later-write=""/);
  assert.match(leftover, /Then the product URL/);
  assert.match(leftover, /data-why-later=""/);
  assert.match(leftover, /Then why test this today/);
  assert.match(leftover, /What a seller should try this morning/);
  assert.match(leftover, /data-unpaid-off=""/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk until Polar reports paid/);
  assert.match(leftover, /An abandoned listing is not cover #1/);
  assert.match(leftover, /data-last24h-empty=""/);
  assert.match(leftover, /No paid listings in the last 24 hours/);
  assert.doesNotMatch(leftover, /ghost\.example/);
  assert.doesNotMatch(leftover, /vapor\.example/);
  assert.doesNotMatch(leftover, /Abandoned Polar session/);
  assert.doesNotMatch(leftover, /\$99/);
  assert.doesNotMatch(leftover, /This morning’s cover/);
  assert.doesNotMatch(leftover, /data-paid-name=/);
  assert.doesNotMatch(leftover, /data-cover-name=/);
  assert.doesNotMatch(leftover, /data-cover-hop/);
  assert.doesNotMatch(leftover, /data-first-click="take"/);
  assert.doesNotMatch(leftover, /Test this today/);
  assert.doesNotMatch(leftover, /data-later-stack=/);
  assert.doesNotMatch(leftover, /data-later-rank=/);
  assert.doesNotMatch(leftover, /data-later-listing=/);
  assert.doesNotMatch(leftover, /One-line listing/);
  assert.doesNotMatch(leftover, /data-two-prizes=/);
  assert.doesNotMatch(leftover, /data-last24h-prize=/);
  assert.doesNotMatch(leftover, /data-morning-slot=/);
  assert.doesNotMatch(leftover, /take-after-list-seven|list-after-take-seven|data-empty-claim-after/);
  assert.equal((leftover.match(/data-first-click="claim"/g) ?? []).length, 1);

  const ghostHop = await unpaidApp.inject({ method: "GET", url: "/r/lst-ghost" });
  assert.equal(ghostHop.statusCode, 404);
  assert.doesNotMatch(ghostHop.body, /ghost\.example/);

  applyPaidBid(db, {
    sessionId: "chk_paid_cover",
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 20,
    day,
    paidUsd: 20,
    paidAt: "2026-08-22T09:00:00.000Z",
  });
  applyPaidBid(db, {
    sessionId: "chk_paid_under",
    productUrl: "https://under.example/sku",
    whyTestThisToday: "Cheaper SKU still belongs on the brief",
    bidUsd: 8,
    day,
    paidUsd: 8,
    paidAt: "2026-08-22T12:00:00.000Z",
  });

  const occupiedRes = await unpaidApp.inject({ method: "GET", url: "/" });
  assert.equal(occupiedRes.statusCode, 200);
  const occupied = pageBody(occupiedRes.body);
  const coverStart = occupied.indexOf("cover.example/apps/pick");
  const coverHop = occupied.indexOf('data-first-click="take"');
  const paidName = occupied.indexOf('data-paid-name=""');
  const coverName = occupied.indexOf('data-cover-name=""');
  const occupiedClaim = occupied.indexOf('id="claim"');
  const occupiedNote = occupied.indexOf("Unpaid Polar checkout stays off this desk");
  const laterStack = occupied.indexOf('data-later-stack=""');
  assert.ok(coverHop > -1 && coverHop < coverName, "occupied cover hop stays the first occupied click");
  assert.ok(paidName > -1 && paidName < coverName, "occupied cover #1 stays the paid name");
  assert.ok(laterStack > coverStart && occupiedClaim > laterStack, "later ranks stay under the paid cover");
  assert.ok(occupiedNote > occupiedClaim, "unpaid-off copy sits on the occupied claim rail");
  assert.match(occupied, /data-occupied="true"/);
  assert.match(occupied, /This morning’s cover/);
  assert.match(occupied, /data-paid-name=""/);
  assert.match(occupied, /data-cover-name=""/);
  assert.match(occupied, /data-morning-slot=""/);
  assert.match(occupied, /data-first-click="take"/);
  assert.match(occupied, />Test this today</);
  assert.match(occupied, /data-later-stack=""/);
  assert.match(occupied, /data-later-rank=""/);
  assert.match(occupied, /These product names are not this morning’s cover/);
  assert.match(occupied, /data-later-listing=""/);
  assert.match(occupied, /data-prize-line=""/);
  assert.match(occupied, />Why</);
  assert.doesNotMatch(occupied, /One-line listing/);
  assert.match(occupied, /data-two-prizes=""/);
  assert.match(occupied, /data-last24h-prize=""/);
  assert.match(occupied, /class="claim-note" data-unpaid-off=""/);
  assert.match(occupied, /Unpaid Polar checkout stays off this desk until Polar reports paid/);
  assert.match(occupied, /An abandoned listing is not cover #1/);
  assert.doesNotMatch(occupied, /ghost\.example/);
  assert.doesNotMatch(occupied, /vapor\.example/);
  assert.doesNotMatch(occupied, /data-empty-cover=/);
  assert.doesNotMatch(occupied, /data-empty-claim-first/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /Then the product URL/);
  assert.doesNotMatch(occupied, /data-why-later=/);
  assert.doesNotMatch(occupied, /take-after-list-seven|list-after-take-seven/);
  assert.equal((occupied.match(/data-paid-name=""/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-cover-name=""/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-first-click="take"/g) ?? []).length, 1);

  const mixed = pageBody(renderBoardPage({
    day,
    tz: "UTC",
    listings: [
      {
        id: "lst-ghost",
        day,
        productUrl: "https://ghost.example/sku",
        whyTestThisToday: "Abandoned Polar session must not print as this morning’s cover",
        bidUsd: 99,
        paidUsd: 0,
        clicks: 12,
        createdAt: "2026-08-22T08:00:00.000Z",
        updatedAt: "2026-08-22T08:00:00.000Z",
        rank: 1,
      },
      {
        id: "lst-cover",
        day,
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-22T09:00:00.000Z",
        updatedAt: "2026-08-22T09:00:00.000Z",
        rank: 2,
      },
    ],
    last24h: [
      {
        id: "lst-ghost",
        day,
        productUrl: "https://ghost.example/sku",
        whyTestThisToday: "Abandoned Polar session must not print as this morning’s cover",
        bidUsd: 99,
        paidUsd: 0,
        clicks: 12,
        createdAt: "2026-08-22T08:00:00.000Z",
        updatedAt: "2026-08-22T08:00:00.000Z",
        rank: 1,
      },
    ],
    defaultBidUsd: 21,
    now,
  }));
  assert.match(mixed, /data-occupied="true"/);
  assert.match(mixed, /data-paid-name=""/);
  assert.match(mixed, /cover\.example\/apps\/pick/);
  assert.match(mixed, /data-first-click="take"/);
  assert.match(mixed, /data-last24h-empty=""/);
  assert.doesNotMatch(mixed, /ghost\.example/);
  assert.doesNotMatch(mixed, /data-empty-cover=/);
  assert.doesNotMatch(mixed, /data-last24h-prize=/);
  assert.equal((mixed.match(/data-paid-name=""/g) ?? []).length, 1);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = pageBody((await emptyApp.inject({ method: "GET", url: "/" })).body);
  assert.match(empty, /data-empty-cover=""/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /data-later-write=""/);
  assert.match(empty, /data-why-later=""/);
  assert.match(empty, /data-last24h-empty=""/);
  assert.doesNotMatch(empty, /data-unpaid-off=/);
  assert.doesNotMatch(empty, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(empty, /An abandoned listing is not cover #1/);
  assert.doesNotMatch(empty, /data-paid-name=/);
  assert.doesNotMatch(empty, /This morning’s cover/);
});

test("GET / keeps occupied morning one first click — Take the cover, Claim stays after", async () => {
  const css = BOARD_CSS;
  assert.match(css, /Occupied morning: Take is the only first click/);
  assert.match(css, /\.desk\[data-occupied="true"\] \.claim-after-cover\[data-claim-after-cover\]/);
  assert.match(css, /\.desk\[data-occupied="true"\] \.claim-after-cover\[data-claim-after-cover\] #claim \.claim-title/);
  assert.match(css, /\.desk\[data-occupied="true"\] \.claim-after-cover\[data-claim-after-cover\] #claim \.outbid/);
  const laterClaim = (css.split("Occupied morning: Take is the only first click", 2)[1] ?? "")
    .split("Empty morning: Product URL is a later write after Claim #1 / Outbid")[0] ?? "";
  const claimTitle = laterClaim.match(
    /\.desk\[data-occupied="true"\] \.claim-after-cover\[data-claim-after-cover\] #claim \.claim-title\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  const emptyTitle = css.match(
    /\.desk:has\(\.empty\) #claim \.claim-title\s*\{[^}]*font-size:\s*clamp\(([0-9.]+)rem/,
  );
  const takeHeight = css.match(/\.take-after-list-six\s*\{[^}]*min-height:\s*([0-9.]+)rem/);
  const outbidHeight = laterClaim.match(
    /\.desk\[data-occupied="true"\] \.claim-after-cover\[data-claim-after-cover\] #claim \.outbid\s*\{[^}]*height:\s*([0-9.]+)rem/,
  );
  const paidName = css.match(
    /\.row-cover\[data-paid-name\] \.host\[data-cover-name\]\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  assert.ok(claimTitle && emptyTitle && takeHeight && outbidHeight && paidName, "occupied later Claim, empty Claim, Take, Outbid, and paid name must all have sizes");
  assert.ok(Number(claimTitle[1]) < Number(emptyTitle[1]), "occupied later Claim stays quieter than empty Claim #1");
  assert.ok(Number(claimTitle[1]) < Number(takeHeight[1]), "occupied later Claim stays quieter than Test this today");
  assert.ok(Number(outbidHeight[1]) < Number(takeHeight[1]), "occupied Outbid stays quieter than Test this today");
  assert.ok(Number(claimTitle[1]) < Number(paidName[1]), "occupied later Claim stays quieter than the paid cover name");
  assert.doesNotMatch(laterClaim, /background:/);
  assert.doesNotMatch(laterClaim, /var\(--primary\)/);
  assert.doesNotMatch(laterClaim, /empty-claim-first|data-why-later|data-later-write|data-unpaid-off/);
  assert.doesNotMatch(css, /data-later-claim|take-after-list-seven|list-after-take-seven|data-empty-claim-after/);

  const db = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
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
  placeBid(db, {
    id: "lst-ghost",
    day,
    productUrl: "https://ghost.example/sku",
    whyTestThisToday: "Abandoned Polar session must not print as this morning’s cover",
    bidUsd: 99,
    paidUsd: 0,
    clicks: 12,
    createdAt: "2026-08-22T08:00:00.000Z",
  });

  const app = await buildApp({ db, now });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const cover = body.slice(coverStart, body.indexOf("</article>", coverStart));
  const underStart = body.indexOf('data-listing-id="lst-under"');
  const under = body.slice(underStart, body.indexOf("</article>", underStart));
  const takeAt = cover.indexOf('data-first-click="take"');
  const hopLabelAt = cover.indexOf(">Test this today<");
  const paidAt = cover.indexOf("data-paid-name");
  const coverNameAt = cover.indexOf("data-cover-name");
  const stackAt = body.indexOf('data-later-stack=""');
  const stripAt = body.indexOf('data-last24h=""');
  const wrapAt = body.indexOf('data-claim-after-cover=""');
  const claimAt = body.indexOf('id="claim"');
  const claimTitleAt = body.indexOf('class="claim-title"', claimAt);
  const outbidAt = body.indexOf(">Outbid<");
  const productUrlAt = body.indexOf('name="productUrl"');
  const laterListingAt = body.indexOf('data-later-listing=""');

  assert.match(cover, /data-morning-slot=""/);
  assert.match(cover, /This morning’s cover/);
  assert.match(cover, /data-paid-name=""/);
  assert.match(cover, /data-cover-name=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /href="\/r\/lst-cover"/);
  assert.match(body, /data-claim-after-cover=""/);
  assert.match(body, /class="claim-after-cover"/);
  assert.doesNotMatch(body, /class="claim-kicker"/);
  assert.match(body, /class="bid-row"/);
  assert.match(body, /Claim #1 for/);
  assert.match(body, />Outbid</);
  assert.match(body, /data-later-listing=""/);
  assert.match(body, /data-prize-line=""/);
  assert.match(body, />Why</);
  assert.doesNotMatch(body, /One-line listing/);
  assert.match(body, /data-occupied="true"/);
  assert.match(body, /data-two-prizes=""/);
  assert.match(body, /data-last24h-prize=""/);
  assert.match(body, /data-later-stack=""/);
  assert.match(body, /data-later-rank=""/);
  assert.match(body, /These product names are not this morning’s cover/);
  assert.match(under, /<p class="dek">under\.example\/sku<\/p>/);
  assert.match(under, /<p class="slot">Cheaper SKU still belongs on the brief<\/p>/);
  assert.match(body, /Unpaid Polar checkout stays off this desk until Polar reports paid/);
  assert.match(body, /An abandoned listing is not cover #1/);
  assert.doesNotMatch(body, /ghost\.example/);
  assert.doesNotMatch(body, /data-empty-claim-first/);
  assert.doesNotMatch(body, /empty-claim-first/);
  assert.doesNotMatch(body, /data-first-click="claim"/);
  assert.doesNotMatch(body, /aria-label="Claim #1"/);
  assert.doesNotMatch(body, /data-later-write=/);
  assert.doesNotMatch(body, /Then the product URL/);
  assert.doesNotMatch(body, /data-why-later=/);
  assert.doesNotMatch(body, /Then why test this today/);
  assert.doesNotMatch(body, /take-after-list-seven/);
  assert.doesNotMatch(body, /data-later-claim/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-claim-after-cover=/);
  assert.doesNotMatch(under, /data-paid-name=/);
  assert.doesNotMatch(cover, /data-claim-after-cover=/);
  assert.doesNotMatch(cover, /One-line listing/);
  assert.doesNotMatch(cover, /claim this rank/);
  assert.doesNotMatch(cover, /class="claim-rank"/);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-claim-after-cover=""/g) ?? []).length, 1);
  assert.equal((body.match(/class="claim-after-cover"/g) ?? []).length, 1);
  assert.equal((body.match(/data-paid-name=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-name=""/g) ?? []).length, 1);
  assert.ok(coverStart > -1 && takeAt > -1 && hopLabelAt > takeAt, "Take / Test this today stays the first occupied click");
  assert.ok(paidAt > -1 && paidAt < coverNameAt, "occupied cover #1 stays the paid product name");
  assert.ok(takeAt < coverNameAt, "Take sits on the prize, not as a twin of Claim");
  assert.ok(stackAt > coverStart && stripAt > stackAt, "later ranks and last-24h stay under the cover");
  assert.ok(wrapAt > stripAt && claimAt > wrapAt, "Claim #1 is a later write after the cover");
  assert.ok(claimTitleAt > claimAt && outbidAt > claimTitleAt, "occupied Claim / Outbid sit on the later rail");
  assert.ok(productUrlAt > claimAt && productUrlAt > takeAt, "occupied Product URL stays with Outbid after the take");
  assert.ok(laterListingAt > claimAt, "occupied Why prize line stays a later write after Claim, not on the prize");

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");
  const ghostHop = await app.inject({ method: "GET", url: "/r/lst-ghost" });
  assert.equal(ghostHop.statusCode, 404);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  const quiet = pageBody(empty.body);
  const quietClaim = quiet.indexOf('id="claim"');
  const quietFirst = quiet.indexOf('data-first-click="claim"');
  const quietOutbid = quiet.indexOf(">Outbid<");
  const quietUrl = quiet.indexOf('data-later-write=""');
  const quietWhy = quiet.indexOf('data-why-later=""');
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.match(quiet, /class="empty-claim-first"/);
  assert.match(quiet, /Claim #1 for/);
  assert.match(quiet, /data-later-write=""/);
  assert.match(quiet, /Then the product URL/);
  assert.match(quiet, /data-why-later=""/);
  assert.match(quiet, /Then why test this today/);
  assert.match(quiet, /What a seller should try this morning/);
  assert.match(quiet, /data-last24h-empty=""/);
  assert.ok(quietFirst > quietClaim && quietOutbid > quietFirst, "empty Claim #1 stays the first click");
  assert.ok(quietUrl > quietOutbid && quietWhy > quietUrl, "empty product URL then Why stay later writes after Outbid");
  assert.doesNotMatch(quiet, /data-claim-after-cover=/);
  assert.doesNotMatch(quiet, /class="claim-after-cover"/);
  assert.doesNotMatch(quiet, /data-first-click="take"/);
  assert.doesNotMatch(quiet, /Test this today/);
  assert.doesNotMatch(quiet, /class="bid-row"/);
  assert.doesNotMatch(quiet, /One-line listing/);
  assert.doesNotMatch(quiet, /data-unpaid-off=/);

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
    now: new Date("2026-08-23T00:30:00.000Z"),
  }));
  assert.match(emptyCoverHtml, /data-empty-cover=""/);
  assert.match(emptyCoverHtml, /data-first-click="claim"/);
  assert.match(emptyCoverHtml, /data-later-write=""/);
  assert.match(emptyCoverHtml, /data-why-later=""/);
  assert.match(emptyCoverHtml, /data-last24h-prize=""/);
  assert.match(emptyCoverHtml, /Rolling 24h spend/);
  assert.doesNotMatch(emptyCoverHtml, /data-claim-after-cover=/);
  assert.doesNotMatch(emptyCoverHtml, /class="claim-after-cover"/);
  assert.doesNotMatch(emptyCoverHtml, /data-two-prizes=/);
  assert.doesNotMatch(emptyCoverHtml, /This morning’s cover/);
  assert.doesNotMatch(emptyCoverHtml, /data-first-click="take"/);
});

test("GET / keeps occupied later merch claim-this-rank quieter than Take — cover stays the prize", async () => {
  const css = BOARD_CSS;
  assert.match(css, /Occupied later merch: claim-this-rank is a quieter later write after the product, not a filled pill on the name/);
  assert.match(css, /\.later-stack\[data-later-stack\] \.row\[data-later-rank\] \.claim-after-row\[data-claim-after-row\]/);
  assert.doesNotMatch(css, /\.row:hover \.claim-rank/);
  const pill = css.match(/\.claim-rank\s*\{[^}]*\}/);
  assert.ok(pill, "claim-this-rank CSS must still exist");
  assert.doesNotMatch(pill[0], /position:\s*absolute/);
  assert.doesNotMatch(pill[0], /var\(--primary\)/);
  const laterWrite = (css.split("Occupied later merch: claim-this-rank is a quieter later write after the product, not a filled pill on the name.", 2)[1] ?? "")
    .split(".row-1 .rank")[0] ?? "";
  const rowClaim = laterWrite.match(/font-size:\s*([0-9.]+)rem/);
  const takeHeight = css.match(/\.take-after-list-six\s*\{[^}]*min-height:\s*([0-9.]+)rem/);
  const paidName = css.match(
    /\.row-cover\[data-paid-name\] \.host\[data-cover-name\]\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  assert.ok(rowClaim && takeHeight && paidName, "later claim-this-rank, Take, and paid name must all have sizes");
  assert.ok(Number(rowClaim[1]) < Number(takeHeight[1]), "later merch claim-this-rank stays quieter than Test this today");
  assert.ok(Number(rowClaim[1]) < Number(paidName[1]), "later merch claim-this-rank stays quieter than the paid cover name");
  assert.doesNotMatch(laterWrite, /background:/);
  assert.doesNotMatch(laterWrite, /var\(--primary\)/);
  assert.doesNotMatch(laterWrite, /empty-claim-first|data-why-later|data-later-write|data-unpaid-off/);
  assert.doesNotMatch(css, /data-later-claim|data-later-claim-quiet|take-after-list-seven|list-after-take-seven|data-empty-claim-after/);
  assert.match(css, /\.desk:has\(\.empty\) \.claim-after-row/);
  assert.match(css, /\.desk\[data-unpaid-off\] \.claim-after-row/);

  const db = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
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
  placeBid(db, {
    id: "lst-third",
    day,
    productUrl: "https://third.example/sku",
    whyTestThisToday: "A third product still lists under the cover",
    bidUsd: 6,
    clicks: 0,
    createdAt: "2026-08-22T12:30:00.000Z",
  });
  placeBid(db, {
    id: "lst-ghost",
    day,
    productUrl: "https://ghost.example/sku",
    whyTestThisToday: "Abandoned Polar session must not print as this morning’s cover",
    bidUsd: 99,
    paidUsd: 0,
    clicks: 12,
    createdAt: "2026-08-22T08:00:00.000Z",
  });

  const app = await buildApp({ db, now });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const cover = body.slice(coverStart, body.indexOf("</article>", coverStart));
  const underStart = body.indexOf('data-listing-id="lst-under"');
  const under = body.slice(underStart, body.indexOf("</article>", underStart));
  const thirdStart = body.indexOf('data-listing-id="lst-third"');
  const third = body.slice(thirdStart, body.indexOf("</article>", thirdStart));
  const takeAt = cover.indexOf('data-first-click="take"');
  const hopLabelAt = cover.indexOf(">Test this today<");
  const coverNameAt = cover.indexOf("data-cover-name");
  const paidAt = cover.indexOf("data-paid-name");
  const stackAt = body.indexOf('data-later-stack=""');
  const dekAt = under.indexOf('class="dek"');
  const linkEnd = under.indexOf("</a>");
  const laterClaimAt = under.indexOf('data-claim-after-row=""');
  const laterBtnAt = under.indexOf("claim this rank for $9");
  const stripAt = body.indexOf('data-last24h=""');
  const wrapAt = body.indexOf('data-claim-after-cover=""');
  const claimAt = body.indexOf('id="claim"');

  assert.match(cover, /data-morning-slot=""/);
  assert.match(cover, /This morning’s cover/);
  assert.match(cover, /data-paid-name=""/);
  assert.match(cover, /data-cover-name=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(body, /data-later-stack=""/);
  assert.match(body, /Also on the desk/);
  assert.match(body, /These product names are not this morning’s cover/);
  assert.match(under, /data-later-rank=""/);
  assert.match(under, /<p class="dek">under\.example\/sku<\/p>/);
  assert.match(under, /<p class="slot">Cheaper SKU still belongs on the brief<\/p>/);
  assert.match(under, /class="claim-after-row"/);
  assert.match(under, /data-claim-after-row=""/);
  assert.match(under, /claim this rank for \$9/);
  assert.match(under, /class="claim-rank"/);
  assert.match(third, /data-claim-after-row=""/);
  assert.match(third, /claim this rank for \$7/);
  assert.match(body, /data-claim-after-cover=""/);
  assert.match(body, /Claim #1 for/);
  assert.match(body, /data-occupied="true"/);
  assert.match(body, /data-two-prizes=""/);
  assert.match(body, /data-last24h-prize=""/);
  assert.match(body, /Unpaid Polar checkout stays off this desk until Polar reports paid/);
  assert.doesNotMatch(cover, /claim this rank/);
  assert.doesNotMatch(cover, /class="claim-rank"/);
  assert.doesNotMatch(cover, /data-claim-after-row=/);
  assert.doesNotMatch(cover, /class="claim-after-row"/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /Test this today/);
  assert.doesNotMatch(under, /data-cover-name=/);
  assert.doesNotMatch(under, /class="host"/);
  assert.doesNotMatch(body, /ghost\.example/);
  assert.doesNotMatch(body, /data-later-claim/);
  assert.doesNotMatch(body, /data-later-claim-quiet/);
  assert.doesNotMatch(body, /take-after-list-seven/);
  assert.doesNotMatch(body, /data-empty-claim-first/);
  assert.doesNotMatch(body, /data-first-click="claim"/);
  const strip = body.slice(stripAt, claimAt);
  assert.doesNotMatch(strip, /claim this rank/);
  assert.doesNotMatch(strip, /data-claim-after-row=/);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-claim-after-cover=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-claim-after-row=""/g) ?? []).length, 2);
  assert.equal((body.match(/data-paid-name=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-cover-name=""/g) ?? []).length, 1);
  assert.ok(coverStart > -1 && takeAt > -1 && hopLabelAt > takeAt, "Take / Test this today stays the first occupied click");
  assert.ok(paidAt > -1 && paidAt < coverNameAt, "occupied cover #1 stays the prize");
  assert.ok(takeAt < coverNameAt, "Take sits on the prize, not as a twin of later claim-this-rank");
  assert.ok(stackAt > coverStart && underStart > stackAt, "later merch groups under the cover");
  assert.ok(dekAt > -1 && linkEnd > dekAt && laterClaimAt > linkEnd, "later claim-this-rank recedes after the product, not a filled pill on the product name");
  assert.ok(laterBtnAt > laterClaimAt, "claim this rank stays inside the later-write wrap");
  assert.ok(thirdStart > underStart && stripAt > thirdStart, "later merch stays above the last-24h strip");
  assert.ok(wrapAt > stripAt && claimAt > wrapAt, "Claim #1 stays a later write after the cover");

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");
  const ghostHop = await app.inject({ method: "GET", url: "/r/lst-ghost" });
  assert.equal(ghostHop.statusCode, 404);

  const onlyCover = pageBody(renderBoardPage({
    day,
    tz: "UTC",
    listings: [
      {
        id: "lst-cover",
        day,
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "Cover app sellers should install this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-22T09:00:00.000Z",
        updatedAt: "2026-08-22T09:00:00.000Z",
        rank: 1,
      },
    ],
    last24h: [],
    defaultBidUsd: 21,
    now,
  }));
  assert.match(onlyCover, /data-morning-slot=""/);
  assert.match(onlyCover, /data-first-click="take"/);
  assert.doesNotMatch(onlyCover, /data-later-stack=/);
  assert.doesNotMatch(onlyCover, /data-claim-after-row=/);
  assert.doesNotMatch(onlyCover, /claim this rank/);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  const quiet = pageBody(empty.body);
  const quietClaim = quiet.indexOf('id="claim"');
  const quietFirst = quiet.indexOf('data-first-click="claim"');
  const quietOutbid = quiet.indexOf(">Outbid<");
  const quietUrl = quiet.indexOf('data-later-write=""');
  const quietWhy = quiet.indexOf('data-why-later=""');
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.match(quiet, /Claim #1 for/);
  assert.match(quiet, /data-later-write=""/);
  assert.match(quiet, /Then the product URL/);
  assert.match(quiet, /data-why-later=""/);
  assert.match(quiet, /Then why test this today/);
  assert.match(quiet, /data-last24h-empty=""/);
  assert.ok(quietFirst > quietClaim && quietOutbid > quietFirst, "empty Claim #1 stays the first click");
  assert.ok(quietUrl > quietOutbid && quietWhy > quietUrl, "empty stays Claim #1 then product URL then Why");
  assert.doesNotMatch(quiet, /data-claim-after-row=/);
  assert.doesNotMatch(quiet, /class="claim-after-row"/);
  assert.doesNotMatch(quiet, /claim this rank/);
  assert.doesNotMatch(quiet, /data-claim-after-cover=/);
  assert.doesNotMatch(quiet, /data-first-click="take"/);
  assert.doesNotMatch(quiet, /Test this today/);
  assert.doesNotMatch(quiet, /data-unpaid-off=/);

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
    now: new Date("2026-08-23T00:30:00.000Z"),
  }));
  assert.match(emptyCoverHtml, /data-empty-cover=""/);
  assert.match(emptyCoverHtml, /data-first-click="claim"/);
  assert.match(emptyCoverHtml, /data-later-write=""/);
  assert.match(emptyCoverHtml, /data-why-later=""/);
  assert.match(emptyCoverHtml, /data-last24h-prize=""/);
  assert.match(emptyCoverHtml, /Rolling 24h spend/);
  assert.doesNotMatch(emptyCoverHtml, /data-claim-after-row=/);
  assert.doesNotMatch(emptyCoverHtml, /claim this rank/);
  assert.doesNotMatch(emptyCoverHtml, /data-claim-after-cover=/);
  assert.doesNotMatch(emptyCoverHtml, /data-two-prizes=/);
  assert.doesNotMatch(emptyCoverHtml, /This morning’s cover/);
  assert.doesNotMatch(emptyCoverHtml, /data-first-click="take"/);
});

test("GET / keeps occupied cover one first click — Test this today, List stays after the cover", async () => {
  const css = BOARD_CSS;
  assert.match(css, /Occupied cover: Take is the one first click/);
  assert.match(css, /One later List write after Take recedes/);
  assert.match(css, /\.desk\[data-occupied="true"\] \.list-after-cover\[data-list-after-cover\]/);
  assert.match(css, /\.desk:has\(\.empty\) \.list-after-cover/);
  assert.match(css, /\.desk\[data-unpaid-off\] \.list-after-cover/);
  const recede = (css.split("Occupied cover: Take is the one first click", 2)[1] ?? "")
    .split("@media (min-width: 768px)")[0] ?? "";
  const listSize = recede.match(/font-size:\s*([0-9.]+)rem/);
  const takeHeight = css.match(/\.take-after-list-six\s*\{[^}]*min-height:\s*([0-9.]+)rem/);
  const whyPrize = css.match(
    /\.cover-why-line\[data-prize-before-price\]\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  const paidName = css.match(
    /\.row-cover\[data-paid-name\] \.host\[data-cover-name\]\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  assert.ok(listSize && takeHeight && whyPrize && paidName, "occupied List recede, Take, why prize, and paid name must all have sizes");
  assert.ok(Number(listSize[1]) < Number(takeHeight[1]), "occupied List write stays quieter than Test this today");
  assert.ok(Number(listSize[1]) < Number(whyPrize[1]), "occupied List write stays quieter than the why prize");
  assert.ok(Number(listSize[1]) < Number(paidName[1]), "occupied List write stays quieter than the paid cover name");
  assert.doesNotMatch(recede, /var\(--primary\)/);
  assert.doesNotMatch(recede, /empty-claim-first|data-why-later|data-later-write|data-unpaid-off/);
  assert.doesNotMatch(recede, /claim-after-row|data-later-claim|take-after-list-seven|list-after-take-seven/);
  assert.doesNotMatch(recede, /list-under-cover|list-after-why|masthead-list/);
  assert.doesNotMatch(css, /take-after-list-seven|list-after-take-seven|data-later-claim-quiet/);

  const db = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
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
  placeBid(db, {
    id: "lst-ghost",
    day,
    productUrl: "https://ghost.example/sku",
    whyTestThisToday: "Abandoned Polar session must not print as this morning’s cover",
    bidUsd: 99,
    paidUsd: 0,
    clicks: 12,
    createdAt: "2026-08-22T08:00:00.000Z",
  });

  const app = await buildApp({ db, now });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const cover = body.slice(coverStart, body.indexOf("</article>", coverStart));
  const underStart = body.indexOf('data-listing-id="lst-under"');
  const under = body.slice(underStart, body.indexOf("</article>", underStart));
  const whyAt = cover.indexOf('data-cover-why=""');
  const prizeAt = cover.indexOf("data-prize-before-price");
  const takeAt = cover.indexOf('data-first-click="take"');
  const hopLabelAt = cover.indexOf(">Test this today<");
  const listAfterTakeAt = cover.indexOf('data-list-after-take=""');
  const stackAt = body.indexOf('data-later-stack=""');
  const stripAt = body.indexOf('data-last24h=""');
  const laterClaimAt = under.indexOf('data-claim-after-row=""');
  const wrapAt = body.indexOf('data-claim-after-cover=""');
  const claimAt = body.indexOf('id="claim"');

  assert.match(cover, /data-morning-slot=""/);
  assert.match(cover, /This morning’s cover/);
  assert.match(cover, /data-cover-why=""/);
  assert.match(cover, /data-prize-before-price=""/);
  assert.match(cover, /Why test this today/);
  assert.match(cover, /Cover app sellers should install this morning/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /href="\/r\/lst-cover"/);
  assert.doesNotMatch(cover, /class="list-after-why-wrap list-after-cover"/);
  assert.match(cover, /class="list-after-take-wrap list-after-cover"/);
  assert.match(cover, /data-list-after-cover=""/);
  assert.doesNotMatch(cover, /data-list-after-why/);
  assert.doesNotMatch(cover, /under this reason/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, /after Test this today/);
  assert.doesNotMatch(body, /class="masthead-list list-after-cover"/);
  assert.doesNotMatch(body, /data-list-under-cover=/);
  assert.doesNotMatch(body, /under today’s cover/);
  assert.match(body, /data-occupied="true"/);
  assert.match(body, /data-later-stack=""/);
  assert.match(body, /data-claim-after-row=""/);
  assert.match(under, /claim this rank for \$9/);
  assert.match(body, /data-claim-after-cover=""/);
  assert.match(body, /data-two-prizes=""/);
  assert.match(body, /data-last24h-prize=""/);
  assert.match(body, /Unpaid Polar checkout stays off this desk until Polar reports paid/);
  assert.doesNotMatch(under, /data-first-click="take"/);
  assert.doesNotMatch(under, /data-list-after-cover=/);
  assert.doesNotMatch(under, /data-list-after-why=/);
  assert.doesNotMatch(under, /data-list-after-take=/);
  assert.doesNotMatch(under, /Test this today/);
  assert.doesNotMatch(body, /ghost\.example/);
  assert.doesNotMatch(body, /take-after-list-seven/);
  assert.doesNotMatch(body, /list-after-take-seven/);
  assert.doesNotMatch(body, /data-later-claim/);
  assert.doesNotMatch(body, /data-later-claim-quiet/);
  assert.doesNotMatch(body, /data-empty-claim-first/);
  assert.doesNotMatch(body, /data-first-click="claim"/);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-cover=""/g) ?? []).length, 1);
  assert.doesNotMatch(body, /data-list-after-why=/);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.doesNotMatch(body, /data-list-under-cover=/);
  assert.equal((body.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((body.match(/data-prize-before-price=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-claim-after-row=""/g) ?? []).length, 1);
  assert.ok(coverStart > -1 && whyAt > -1 && prizeAt > whyAt, "why stays the occupied cover prize");
  assert.ok(takeAt > prizeAt && hopLabelAt > takeAt, "Test this today is the one first click after the why prize");
  assert.ok(listAfterTakeAt > hopLabelAt, "one later List write sits after Test this today");
  assert.ok(stackAt > coverStart && laterClaimAt > -1, "later merch claim-this-rank quiet already shipped — do not restamp");
  assert.ok(stripAt > stackAt && wrapAt > stripAt && claimAt > wrapAt, "last-24h strip and Claim stay after the cover");

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");
  const ghostHop = await app.inject({ method: "GET", url: "/r/lst-ghost" });
  assert.equal(ghostHop.statusCode, 404);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  const quiet = pageBody(empty.body);
  const quietClaim = quiet.indexOf('id="claim"');
  const quietFirst = quiet.indexOf('data-first-click="claim"');
  const quietOutbid = quiet.indexOf(">Outbid<");
  const quietUrl = quiet.indexOf('data-later-write=""');
  const quietWhy = quiet.indexOf('data-why-later=""');
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.match(quiet, /Claim #1 for/);
  assert.match(quiet, /data-later-write=""/);
  assert.match(quiet, /Then the product URL/);
  assert.match(quiet, /data-why-later=""/);
  assert.match(quiet, /Then why test this today/);
  assert.match(quiet, /data-last24h-empty=""/);
  assert.ok(quietFirst > quietClaim && quietOutbid > quietFirst, "empty Claim #1 stays the first click");
  assert.ok(quietUrl > quietOutbid && quietWhy > quietUrl, "empty stays Claim #1 then product URL then Why");
  assert.doesNotMatch(quiet, /data-list-after-cover=/);
  assert.doesNotMatch(quiet, /data-list-under-cover=/);
  assert.doesNotMatch(quiet, /data-list-after-why=/);
  assert.doesNotMatch(quiet, /data-list-after-take=/);
  assert.doesNotMatch(quiet, /data-first-click="take"/);
  assert.doesNotMatch(quiet, /Test this today/);
  assert.doesNotMatch(quiet, /data-claim-after-cover=/);
  assert.doesNotMatch(quiet, /data-unpaid-off=/);

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
    now: new Date("2026-08-23T00:30:00.000Z"),
  }));
  assert.match(emptyCoverHtml, /data-empty-cover=""/);
  assert.match(emptyCoverHtml, /data-first-click="claim"/);
  assert.match(emptyCoverHtml, /data-later-write=""/);
  assert.match(emptyCoverHtml, /data-why-later=""/);
  assert.match(emptyCoverHtml, /data-last24h-prize=""/);
  assert.match(emptyCoverHtml, /Rolling 24h spend/);
  assert.doesNotMatch(emptyCoverHtml, /data-list-after-cover=/);
  assert.doesNotMatch(emptyCoverHtml, /data-list-under-cover=/);
  assert.doesNotMatch(emptyCoverHtml, /This morning’s cover/);
  assert.doesNotMatch(emptyCoverHtml, /data-first-click="take"/);
  assert.doesNotMatch(emptyCoverHtml, /data-two-prizes=/);
});

test("GET / keeps occupied cover one later List write after Take — not three List rails", async () => {
  const css = BOARD_CSS;
  assert.match(css, /Occupied cover: Take is the one first click/);
  assert.match(css, /One later List write after Take recedes after that hop/);
  assert.doesNotMatch(css, /List under Why, List after Take, and masthead List recede/);
  assert.doesNotMatch(css, /take-after-list-seven|list-after-take-seven/);
  const recede = (css.split("Occupied cover: Take is the one first click", 2)[1] ?? "")
    .split("@media (min-width: 768px)")[0] ?? "";
  assert.doesNotMatch(recede, /list-under-cover|list-after-why|masthead-list/);
  assert.doesNotMatch(recede, /claim-after-row|data-later-claim|empty-claim-first/);
  assert.doesNotMatch(recede, /var\(--primary\)/);

  const db = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
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

  const app = await buildApp({ db, now });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const cover = body.slice(coverStart, body.indexOf("</article>", coverStart));
  const underStart = body.indexOf('data-listing-id="lst-under"');
  const under = body.slice(underStart, body.indexOf("</article>", underStart));
  const whyAt = cover.indexOf("data-prize-before-price");
  const takeAt = cover.indexOf('data-first-click="take"');
  const hopLabelAt = cover.indexOf(">Test this today<");
  const listAfterTakeAt = cover.indexOf('data-list-after-take=""');
  const laterClaimAt = under.indexOf('data-claim-after-row=""');

  assert.match(cover, /data-prize-before-price=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /class="list-after-take-wrap list-after-cover"/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.doesNotMatch(cover, /data-list-after-why/);
  assert.doesNotMatch(cover, /under this reason/);
  assert.doesNotMatch(body, /data-list-under-cover=/);
  assert.doesNotMatch(body, /class="masthead-list/);
  assert.doesNotMatch(body, /under today’s cover/);
  assert.doesNotMatch(body, /take-after-list-seven/);
  assert.doesNotMatch(body, /list-after-take-seven/);
  assert.equal((cover.match(/>List a product</g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-cover=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.ok(whyAt > -1 && takeAt > whyAt && hopLabelAt > takeAt, "Test this today stays the one first click");
  assert.ok(listAfterTakeAt > hopLabelAt, "one later List write sits after Take");
  assert.ok(laterClaimAt > -1, "later merch claim-this-rank quiet already shipped — do not restamp");
  assert.doesNotMatch(under, /List a product/);
  assert.doesNotMatch(under, /data-list-after-cover=/);

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  const quiet = pageBody(empty.body);
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.doesNotMatch(quiet, /List a product/);
  assert.doesNotMatch(quiet, /data-list-after-cover=/);
  assert.doesNotMatch(quiet, /data-list-after-take=/);
  assert.doesNotMatch(quiet, /data-first-click="take"/);
});

test("GET / keeps occupied later List write the only List label — claim rail drops the second List", async () => {
  const css = BOARD_CSS;
  assert.match(css, /Occupied cover: Take is the one first click/);
  assert.match(css, /One later List write after Take recedes after that hop/);
  assert.doesNotMatch(css, /take-after-list-seven|list-after-take-seven/);
  const laterClaimCss = (css.split("Occupied morning: Take is the only first click", 2)[1] ?? "")
    .split("Empty morning: Product URL is a later write after Claim #1 / Outbid")[0] ?? "";
  assert.doesNotMatch(laterClaimCss, /#claim \.claim-kicker/);
  assert.match(laterClaimCss, /#claim \.claim-title/);
  assert.match(laterClaimCss, /#claim \.outbid/);
  assert.doesNotMatch(laterClaimCss, /var\(--primary\)/);
  assert.doesNotMatch(laterClaimCss, /empty-claim-first|data-why-later|data-unpaid-off/);
  assert.doesNotMatch(laterClaimCss, /claim-after-row|data-later-claim|take-after-list-seven/);

  const db = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
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

  const app = await buildApp({ db, now });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const cover = body.slice(coverStart, body.indexOf("</article>", coverStart));
  const underStart = body.indexOf('data-listing-id="lst-under"');
  const under = body.slice(underStart, body.indexOf("</article>", underStart));
  const claimAt = body.indexOf('id="claim"');
  const claim = body.slice(claimAt);
  const whyAt = cover.indexOf("data-prize-before-price");
  const takeAt = cover.indexOf('data-first-click="take"');
  const hopLabelAt = cover.indexOf(">Test this today<");
  const listAfterTakeAt = cover.indexOf('data-list-after-take=""');
  const listLabelAt = cover.indexOf(">List a product<");
  const laterClaimAt = under.indexOf('data-claim-after-row=""');
  const claimTitleAt = claim.indexOf('class="claim-title"');
  const claimCopyAt = claim.indexOf("Claim #1 for");
  const minusAt = claim.indexOf('data-bid-step="-1"');
  const plusAt = claim.indexOf('data-bid-step="1"');
  const outbidAt = claim.indexOf(">Outbid<");

  assert.match(cover, /data-prize-before-price=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /class="list-after-take-wrap list-after-cover"/);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(claim, /Claim #1 for/);
  assert.match(claim, /class="bid-field"/);
  assert.match(claim, /aria-label="Decrease bid by one dollar"/);
  assert.match(claim, /aria-label="Increase bid by one dollar"/);
  assert.match(claim, />Outbid</);
  assert.doesNotMatch(claim, /class="claim-kicker"/);
  assert.doesNotMatch(claim, /List a product/);
  assert.doesNotMatch(body, /class="claim-kicker"/);
  assert.doesNotMatch(body, /take-after-list-seven/);
  assert.doesNotMatch(body, /list-after-take-seven/);
  assert.doesNotMatch(under, /List a product/);
  assert.equal((body.match(/>List a product</g) ?? []).length, 1);
  assert.equal((cover.match(/>List a product</g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.ok(whyAt > -1 && takeAt > whyAt && hopLabelAt > takeAt, "Why stays the prize; Take stays the one first click");
  assert.ok(listAfterTakeAt > hopLabelAt && listLabelAt > listAfterTakeAt, "occupied later List write after Take stays the only List label");
  assert.ok(claimTitleAt > -1 && claimCopyAt > claimTitleAt, "occupied claim rail stays Claim #1");
  assert.ok(minusAt > claimCopyAt && plusAt > minusAt && outbidAt > plusAt, "occupied claim rail stays dashed $amount / ± / Outbid — not a second List");
  assert.ok(laterClaimAt > -1, "later merch claim-this-rank quiet already shipped — do not restamp");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  const quiet = pageBody(empty.body);
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.match(quiet, /Claim #1 for/);
  assert.doesNotMatch(quiet, /List a product/);
  assert.doesNotMatch(quiet, /class="claim-kicker"/);
  assert.doesNotMatch(quiet, /data-list-after-take=/);
  assert.doesNotMatch(quiet, /data-first-click="take"/);
});

test("GET / keeps occupied listing field after List as Why — the prize line, not One-line listing", async () => {
  const css = BOARD_CSS;
  assert.match(css, /Occupied listing field after List is Why — the prize line, not a second generic line/);
  assert.match(css, /\.desk\[data-occupied="true"\] \.later-listing\[data-later-listing\] \.why-field\[data-prize-line\]/);
  assert.doesNotMatch(css, /take-after-list-seven|list-after-take-seven/);
  const whyLineCss = (css.split("Occupied listing field after List is Why — the prize line, not a second generic line.", 2)[1] ?? "")
    .split("Occupied later merch: claim-this-rank is a quieter later write after the product, not a filled pill on the name.")[0] ?? "";
  assert.match(whyLineCss, /why-field\[data-prize-line\]/);
  assert.doesNotMatch(whyLineCss, /var\(--primary\)/);
  assert.doesNotMatch(whyLineCss, /empty-claim-first|data-why-later|data-unpaid-off/);
  assert.doesNotMatch(whyLineCss, /claim-after-row|data-later-claim|take-after-list-seven/);
  const prizeLine = whyLineCss.match(
    /\.desk\[data-occupied="true"\] \.later-listing\[data-later-listing\] \.why-field\[data-prize-line\] input\s*\{[^}]*font-size:\s*([0-9.]+)rem/,
  );
  const laterListing = css.match(/\.later-listing\[data-later-listing\] \.field input\s*\{[^}]*font-size:\s*([0-9.]+)rem/);
  const coverWhy = css.match(/\.cover-why-line\[data-prize-before-price\]\s*\{[^}]*font-size:\s*([0-9.]+)rem/);
  const takeHeight = css.match(/\.take-after-list-six\s*\{[^}]*min-height:\s*([0-9.]+)rem/);
  assert.ok(prizeLine && laterListing && coverWhy && takeHeight, "occupied Why prize line, generic listing, cover Why, and Take must all have sizes");
  assert.ok(Number(prizeLine[1]) > Number(laterListing[1]), "occupied Why prize line reads as Why, not a generic later listing");
  assert.ok(Number(prizeLine[1]) < Number(coverWhy[1]), "occupied Why write stays quieter than the cover why prize");
  assert.ok(Number(prizeLine[1]) < Number(takeHeight[1]), "occupied Why write stays quieter than Test this today");

  const db = openDatabase(":memory:");
  const now = new Date("2026-08-22T13:00:00.000Z");
  const day = dayKey(now);
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

  const app = await buildApp({ db, now });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const cover = body.slice(coverStart, body.indexOf("</article>", coverStart));
  const underStart = body.indexOf('data-listing-id="lst-under"');
  const under = body.slice(underStart, body.indexOf("</article>", underStart));
  const claimAt = body.indexOf('id="claim"');
  const claim = body.slice(claimAt);
  const whyPrizeAt = cover.indexOf("data-prize-before-price");
  const takeAt = cover.indexOf('data-first-click="take"');
  const hopLabelAt = cover.indexOf(">Test this today<");
  const listAfterTakeAt = cover.indexOf('data-list-after-take=""');
  const listLabelAt = cover.indexOf(">List a product<");
  const laterClaimAt = under.indexOf('data-claim-after-row=""');
  const claimTitleAt = claim.indexOf('class="claim-title"');
  const claimCopyAt = claim.indexOf("Claim #1 for");
  const minusAt = claim.indexOf('data-bid-step="-1"');
  const plusAt = claim.indexOf('data-bid-step="1"');
  const outbidAt = claim.indexOf(">Outbid<");
  const productUrlAt = claim.indexOf('name="productUrl"');
  const laterListingAt = claim.indexOf('data-later-listing=""');
  const prizeLineAt = claim.indexOf('data-prize-line=""');
  const whyLabelAt = claim.indexOf(">Why<");

  assert.match(cover, /data-prize-before-price=""/);
  assert.match(cover, /<p class="cover-why-label">Why test this today<\/p>/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /data-list-after-take=""/);
  assert.match(cover, />List a product</);
  assert.match(cover, /after Test this today/);
  assert.match(claim, /Claim #1 for/);
  assert.match(claim, /class="bid-field"/);
  assert.match(claim, />Outbid</);
  assert.match(claim, /data-later-listing=""/);
  assert.match(claim, /data-prize-line=""/);
  assert.match(claim, />Why</);
  assert.match(claim, /placeholder="Why test this today"/);
  assert.doesNotMatch(claim, /One-line listing/);
  assert.doesNotMatch(claim, /What a seller should try this morning/);
  assert.doesNotMatch(claim, /Then why test this today/);
  assert.doesNotMatch(claim, /data-why-later=/);
  assert.doesNotMatch(claim, /List a product/);
  assert.doesNotMatch(cover, /data-prize-line=/);
  assert.doesNotMatch(cover, />Why</);
  assert.doesNotMatch(cover, /One-line listing/);
  assert.doesNotMatch(body, /One-line listing/);
  assert.doesNotMatch(body, /take-after-list-seven/);
  assert.doesNotMatch(body, /list-after-take-seven/);
  assert.doesNotMatch(under, /data-prize-line=/);
  assert.equal((body.match(/data-prize-line=""/g) ?? []).length, 1);
  assert.equal((body.match(/>Why</g) ?? []).length, 1);
  assert.equal((body.match(/data-list-after-take=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  assert.ok(whyPrizeAt > -1 && takeAt > whyPrizeAt && hopLabelAt > takeAt, "Why stays the prize on the cover; Take stays the one first click");
  assert.ok(listAfterTakeAt > hopLabelAt && listLabelAt > listAfterTakeAt, "occupied later List write after Take stays the only List label");
  assert.ok(claimTitleAt > -1 && claimCopyAt > claimTitleAt, "occupied claim rail stays Claim #1");
  assert.ok(minusAt > claimCopyAt && plusAt > minusAt && outbidAt > plusAt, "occupied claim rail stays dashed $amount / ± / Outbid");
  assert.ok(productUrlAt > plusAt && outbidAt > productUrlAt && laterListingAt > outbidAt, "occupied listing field stays under Product URL + Outbid");
  assert.ok(prizeLineAt > laterListingAt && whyLabelAt > prizeLineAt, "after List, the listing field is Why — the prize line");
  assert.ok(laterClaimAt > -1, "later merch claim-this-rank quiet already shipped — do not restamp");

  const emptyApp = await buildApp({ databasePath: ":memory:" });
  after(() => emptyApp.close());
  const empty = await emptyApp.inject({ method: "GET", url: "/" });
  const quiet = pageBody(empty.body);
  assert.match(quiet, /data-empty-cover=""/);
  assert.match(quiet, /data-first-click="claim"/);
  assert.match(quiet, /Claim #1 for/);
  assert.match(quiet, /data-why-later=""/);
  assert.match(quiet, /Then why test this today/);
  assert.match(quiet, /What a seller should try this morning/);
  assert.doesNotMatch(quiet, /data-prize-line=/);
  assert.doesNotMatch(quiet, />Why</);
  assert.doesNotMatch(quiet, /One-line listing/);
  assert.doesNotMatch(quiet, /List a product/);
  assert.doesNotMatch(quiet, /data-list-after-take=/);
  assert.doesNotMatch(quiet, /data-first-click="take"/);

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
    now: new Date("2026-08-23T00:30:00.000Z"),
  }));
  assert.match(emptyCoverHtml, /data-empty-cover=""/);
  assert.match(emptyCoverHtml, /data-first-click="claim"/);
  assert.match(emptyCoverHtml, /data-why-later=""/);
  assert.match(emptyCoverHtml, /data-last24h-prize=""/);
  assert.doesNotMatch(emptyCoverHtml, /data-prize-line=/);
  assert.doesNotMatch(emptyCoverHtml, />Why</);
  assert.doesNotMatch(emptyCoverHtml, /One-line listing/);
  assert.doesNotMatch(emptyCoverHtml, /This morning’s cover/);
  assert.doesNotMatch(emptyCoverHtml, /data-two-prizes=/);
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
  assert.match(body, /unpaid Polar session does not appear/);
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
  assert.match(body, /Unpaid Polar checkout stays off this desk until Polar reports paid/);
  assert.match(body, /An abandoned listing is not cover #1/);
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
