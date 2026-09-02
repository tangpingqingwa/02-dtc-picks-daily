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

type TestDomElement = {
  tagName: string;
  attributes: Map<string, string>;
  parent: TestDomElement | null;
  children: TestDomElement[];
};

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function tagEnd(source: string, start: number): number {
  let quote = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  throw new Error("unterminated HTML tag");
}

function testDomAttributes(openingTag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const name = /^<\s*[A-Za-z][\w:-]*/.exec(openingTag)?.[0] ?? "";
  const source = openingTag.slice(name.length, -1);
  const matcher = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(matcher)) {
    attributes.set(match[1], match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

/** Small dependency-free DOM tree parser for the generated page contract. */
function parseTestDom(source: string): TestDomElement {
  const documentNode: TestDomElement = {
    tagName: "#document",
    attributes: new Map(),
    parent: null,
    children: [],
  };
  const stack = [documentNode];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      if (end < 0) throw new Error("unterminated HTML comment");
      cursor = end + 3;
      continue;
    }
    if (source.startsWith("<!", start) || source.startsWith("<?", start)) {
      cursor = tagEnd(source, start) + 1;
      continue;
    }
    const end = tagEnd(source, start);
    const token = source.slice(start, end + 1);
    const closing = /^<\s*\/\s*([A-Za-z][\w:-]*)/.exec(token);
    if (closing) {
      const current = stack[stack.length - 1];
      assert.equal(current.tagName, closing[1].toLowerCase(), `DOM close order for ${closing[1]}`);
      stack.pop();
      cursor = end + 1;
      continue;
    }
    const opening = /^<\s*([A-Za-z][\w:-]*)/.exec(token);
    if (!opening) {
      cursor = end + 1;
      continue;
    }
    const element: TestDomElement = {
      tagName: opening[1].toLowerCase(),
      attributes: testDomAttributes(token),
      parent: stack[stack.length - 1],
      children: [],
    };
    stack[stack.length - 1].children.push(element);
    if (!VOID_ELEMENTS.has(element.tagName) && !/\/\s*>$/.test(token)) {
      stack.push(element);
    }
    cursor = end + 1;
    if (element.tagName === "script" || element.tagName === "style") {
      const closingStart = source.toLowerCase().indexOf(`</${element.tagName}`, cursor);
      if (closingStart < 0) throw new Error(`unterminated ${element.tagName}`);
      cursor = closingStart;
    }
  }
  assert.equal(stack.length, 1, `DOM has unclosed ${stack[stack.length - 1]?.tagName ?? "element"}`);
  return documentNode;
}

function testDomElements(root: TestDomElement): TestDomElement[] {
  const result: TestDomElement[] = [];
  const visit = (element: TestDomElement): void => {
    for (const child of element.children) {
      result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
}

function closestTestDomClass(element: TestDomElement, className: string): TestDomElement | null {
  for (let current: TestDomElement | null = element; current; current = current.parent) {
    if ((current.attributes.get("class") ?? "").split(/\s+/).includes(className)) return current;
  }
  return null;
}

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
  const stripEnd = html.indexOf("</aside>", stripAt);
  const strip = html.slice(stripAt, stripEnd);
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
  assert.match(body, /<meta name="viewport" content="width=device-width, initial-scale=1"\/>/);
  assert.match(body, /Leaderboard/);
  assert.match(body, /About/);
  assert.match(body, /Rules/);
  assert.match(body, /Claim #1 for/);
  assert.match(body, /aria-label="Decrease bid by one dollar"/);
  assert.match(body, /aria-label="Increase bid by one dollar"/);
  assert.match(body, /\.bid-field:focus-within\s*\{/);
  assert.match(body, /outline:\s*2px solid var\(--ring\)/);
  assert.match(body, />Claim rank/);
  assert.match(body, /aria-label="Claim rank"/);
  assert.match(body, /type="text" inputmode="url"/);
  assert.match(body, /"https:\/\/" \+ trimmed/);
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
  assert.match(body, /aria-label="Claim #1"/);
  assert.match(body, /data-occupied="false"/);
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
  assert.doesNotMatch(body, /take-after-list|list-after-take/);
  assert.doesNotMatch(body, /data-first-click="take"/);
  assert.doesNotMatch(body, /data-first-write="list"/);
  assert.doesNotMatch(body, /after Test this today|empty-claim-first|data-empty-claim|data-later-write|data-why-later|Then the product URL|Then why test this today/);
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
  assert.doesNotMatch(body, /Unpaid Waffo checkout stays off this desk/);
  assert.doesNotMatch(body, /An abandoned listing is not cover #1/);
  const emptyAt = body.indexOf("data-empty-board");
  const stripAt = body.indexOf('data-last24h=""');
  const claimAt = body.indexOf('id="claim"');
  const titleAt = body.indexOf('class="claim-title"', claimAt);
  const outbidAt = body.indexOf(">Claim rank");
  const productUrlAt = body.indexOf('name="productUrl"');
  const whyAt = body.indexOf('name="whyTestThisToday"');
  assert.ok(emptyAt > -1 && claimAt > -1 && emptyAt > claimAt, "claim chrome precedes the quiet morning surface");
  assert.ok(stripAt > emptyAt, "last-24h strip sits under the one cover");
  assert.ok(titleAt > claimAt && productUrlAt > titleAt && whyAt > productUrlAt && outbidAt > whyAt, "empty form orders Product URL, Why, then one Claim rank");
  assert.equal((body.match(/>Claim rank<\/button>/g) ?? []).length, 1);
  assert.doesNotMatch(body, />Outbid<|Claim rank and Outbid/i);
  assert.equal((body.match(/name="productUrl"/g) ?? []).length, 1);
  assert.equal((body.match(/name="whyTestThisToday"/g) ?? []).length, 1);
  const stepDownAt = body.indexOf('data-bid-step="-1"');
  const amountAt = body.indexOf('id="bid-display"');
  const stepUpAt = body.indexOf('data-bid-step="1"');
  assert.ok(stepDownAt > titleAt && stepDownAt < amountAt && amountAt < stepUpAt, "amount stays exactly between the minus and plus controls");
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
  assert.match(body, /data-list-route=""/);
  assert.match(body, /href="#why"/);
  assert.match(body, /data-cover-hop=""/);
  assert.match(body, /data-first-click="take"/);
  assert.match(body, /href="\/r\/lst-cover"/);
  assert.match(body, /aria-label="Test this today at cover\.example\/apps\/pick"/);
  const coverAt = body.indexOf('data-listing-id="lst-cover"');
  const hopAt = body.indexOf("data-cover-hop");
  const listRouteAt = body.indexOf('data-list-route=""');
  const claimAt = body.indexOf('id="claim"');
  const stackAt = body.indexOf("Also on the desk");
  const coverWhyAt = body.indexOf('data-cover-why=""');
  const hopLabelAt = body.indexOf(">Test this today<");
  const fieldWhyAt = body.indexOf('for="whyTestThisToday"');
  assert.ok(coverAt > -1 && claimAt > -1 && coverAt > claimAt, "claim chrome precedes today’s #1");
  assert.ok(hopAt > coverAt, "cover hop lives on today’s #1, not the listing form");
  assert.ok(hopLabelAt > hopAt, "Test this today is the cover action, not a field label");
  assert.ok(coverWhyAt > coverAt && coverWhyAt < hopAt, "cover why-line is the first cover read, before Test this today");
  assert.ok(hopAt > coverWhyAt && hopAt < body.indexOf(">$20<"), "Test this today takes after the why prize, before $bid");
  assert.ok(listRouteAt > hopAt && listRouteAt < body.indexOf(">$20<"), "one quiet List route sits after Test this today, before $bid");
  assert.doesNotMatch(body, /data-list-under-cover/);
  assert.doesNotMatch(body, /data-list-after-why/);
  assert.ok(fieldWhyAt > claimAt, "the listing field still lives on the claim form");
  assert.ok(stackAt > coverAt, "desk-stack rows stay under the cover");
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
  assert.doesNotMatch(response.body, /take-after-list|list-after-take/);
  assert.doesNotMatch(response.body, /data-first-click="take"/);
  assert.doesNotMatch(response.body, /data-first-write="list"/);
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
  assert.ok(claimAt > -1 && boardAt > claimAt, "first-time read is the claim form, then the desk");
});




test("GET / keeps one Test action, one quiet List route, and one Claim rank form", async () => {
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
  assert.match(body, /\.merch-desk-main\s*\{[\s\S]*grid-template-columns: minmax\(0, 720px\) minmax\(300px, 360px\);/);
  assert.match(body, /\.merch-desk-main > #leaderboard\s*\{\s*grid-area: cover;\s*\}/);
  const coverStart = body.indexOf('data-listing-id="lst-cover"');
  const coverEnd = body.indexOf("</article>", coverStart);
  const cover = body.slice(coverStart, coverEnd);
  const claimAt = body.indexOf('id="claim"');
  const coverWhyAt = cover.indexOf('data-cover-why=""');
  const testAt = cover.indexOf('data-cover-hop=""');
  const listAt = cover.indexOf('data-list-route=""');
  const bidAt = cover.indexOf(">$20<");

  assert.match(cover, /data-cover-hop=""/);
  assert.match(cover, /data-first-click="take"/);
  assert.match(cover, />Test this today</);
  assert.match(cover, /href="\/r\/lst-cover"/);
  assert.match(cover, /data-list-route=""/);
  assert.match(cover, /href="#why"/);
  assert.match(cover, />List a product</);
  assert.doesNotMatch(body, /take-after-list|list-after-take|after Test this today/);
  assert.doesNotMatch(body, /data-first-write="list"/);
  assert.equal((body.match(/data-cover-hop=""/g) ?? []).length, 1);
  assert.equal((body.match(/data-list-route=""/g) ?? []).length, 1);
  assert.equal((body.match(/>Test this today</g) ?? []).length, 1);
  assert.equal((body.match(/>List a product</g) ?? []).length, 1);
  assert.equal((body.match(/>Claim rank<\/button>/g) ?? []).length, 1);
  assert.doesNotMatch(body, />Outbid<|Claim rank and Outbid/i);
  assert.ok(coverWhyAt > -1 && testAt > coverWhyAt && listAt > testAt && listAt < bidAt, "the why prize leads, Test is first action, and List stays quiet before later facts");
  assert.ok(claimAt > -1 && coverStart > claimAt, "the listing form precedes the cover surface");

  const hop = await app.inject({ method: "GET", url: "/r/lst-cover" });
  assert.equal(hop.statusCode, 302);
  assert.equal(hop.headers.location, "https://cover.example/apps/pick");
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
  assert.match(body, /Claim rank/);

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
  assert.match(cover, /<p class="host" data-cover-name="" data-card-field="title">cover\.example\/apps\/pick<\/p>/);
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
  const listRouteAt = cover.indexOf("data-list-route");
  const whyAt = cover.indexOf("data-prize-before-price");
  assert.ok(nameAt > -1 && laterAt > nameAt, "cover product name precedes later-fact money");
  assert.ok(laterAt > hopAt && laterAt > listRouteAt, "$bid sits after Test this today and the quiet List route, not beside the product name");
  const laterClicksAt = cover.lastIndexOf("3 clicks");
  assert.ok(bidAt > laterAt && laterClicksAt > laterAt, "$bid and clicks recede together as later facts");
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
  assert.match(body, />Claim rank/);
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

test("GET / exposes an operable Find popover for paid rows", () => {
  const html = renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [{
      id: "lst-search-board",
      day: "2026-08-23",
      productUrl: "https://board.example/sku",
      whyTestThisToday: "Search this real board listing",
      bidUsd: 12,
      paidUsd: 12,
      clicks: 1,
      createdAt: "2026-08-23T00:10:00.000Z",
      updatedAt: "2026-08-23T00:10:00.000Z",
      rank: 1,
    }],
    last24h: [{
      id: "lst-search-window",
      day: "2026-08-22",
      productUrl: "https://window.example/sku",
      whyTestThisToday: "Search this real rolling window listing",
      bidUsd: 9,
      paidUsd: 9,
      clicks: 0,
      createdAt: "2026-08-22T12:00:00.000Z",
      updatedAt: "2026-08-22T12:00:00.000Z",
      rank: 1,
    }],
    defaultBidUsd: 5,
    now: new Date("2026-08-23T00:30:00.000Z"),
  });
  const searchButtonStart = html.indexOf('id="search-button"');
  const searchButton = html.slice(html.lastIndexOf("<button", searchButtonStart), html.indexOf(">", searchButtonStart));
  assert.match(searchButton, /aria-label="Find paid listings"/);
  assert.match(searchButton, /aria-expanded="false"/);
  assert.match(searchButton, /aria-controls="listing-search"/);
  assert.doesNotMatch(searchButton, /\bdisabled\b/);
  assert.match(html, /id="listing-search" class="listing-search" hidden data-listing-search=""/);
  assert.match(html, /role="dialog" aria-modal="false" aria-labelledby="listing-search-title"/);
  assert.match(html, /id="listing-search-input" type="search"/);
  assert.match(html, /data-search-item="" data-search-text="board\.example\/sku search this real board listing"/);
  assert.match(html, /data-search-item="" data-search-text="window\.example\/sku search this real rolling window listing"/);
  assert.match(html, /data-search-status="" role="status" aria-live="polite"/);
  assert.match(html, /searchItems\.forEach\(function \(item\)/);
  assert.match(html, /searchInput\.addEventListener\("input", updateSearchResults\)/);
  assert.match(html, /event\.key === "Escape" && !searchPopover\.hidden/);
  assert.match(html, /!searchPopover\.contains\(event\.target\)/);
});

test("GET / exposes working All-time and Today ranking periods", () => {
  const html = pageBody(renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [{
      id: "lst-board",
      day: "2026-08-23",
      productUrl: "https://board.example/sku",
      whyTestThisToday: "The board row is a real paid daily listing",
      bidUsd: 12,
      paidUsd: 12,
      clicks: 1,
      createdAt: "2026-08-23T00:10:00.000Z",
      updatedAt: "2026-08-23T00:10:00.000Z",
      rank: 1,
    }],
    last24h: [{
      id: "lst-window",
      day: "2026-08-22",
      productUrl: "https://window.example/sku",
      whyTestThisToday: "The rolling window row is also a real paid listing",
      bidUsd: 9,
      paidUsd: 9,
      clicks: 0,
      createdAt: "2026-08-22T12:00:00.000Z",
      updatedAt: "2026-08-22T12:00:00.000Z",
      rank: 1,
    }],
    defaultBidUsd: 5,
    now: new Date("2026-08-23T00:30:00.000Z"),
  }));
  const allTimeTabStart = html.indexOf('data-ranking-tab="all-time"');
  const allTimeTab = html.slice(html.lastIndexOf("<button", allTimeTabStart), html.indexOf("</button>", allTimeTabStart));
  const todayTabStart = html.indexOf('data-ranking-tab="today"');
  const todayTab = html.slice(html.lastIndexOf("<button", todayTabStart), html.indexOf("</button>", todayTabStart));
  assert.match(allTimeTab, /aria-selected="true"/);
  assert.match(todayTab, /aria-selected="false"/);
  assert.doesNotMatch(todayTab, /\bdisabled\b|aria-disabled/);
  assert.match(html, /data-ranking-surface="all-time" data-ranking-window="board-day"/);
  assert.match(html, /id="last24h" class="last24h"[^>]*data-ranking-surface="today" data-ranking-window="rolling-24h"/);
  assert.match(html, /data-listing-id="lst-board"/);
  assert.match(html, /data-last24h-id="lst-window"/);
  assert.match(html, /function setRankingPeriod\(period, persist\)/);
  assert.match(html, /tab\.setAttribute\("aria-selected", selected \? "true" : "false"\)/);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /setRankingPeriod\(rankingPeriodFromUrl\(\), false\)/);
});

test("GET / keeps the MERCH DESK cover-ledger, claim-drawer, and card anatomy contract", () => {
  const html = renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [
      {
        id: "lst-geometry",
        day: "2026-08-23",
        productUrl: "https://geometry.example/sku",
        whyTestThisToday: "A real DTC geometry fixture for card anchors",
        bidUsd: 12,
        paidUsd: 12,
        clicks: 1,
        createdAt: "2026-08-23T00:10:00.000Z",
        updatedAt: "2026-08-23T00:10:00.000Z",
        rank: 1,
      },
      {
        id: "lst-geometry-two",
        day: "2026-08-23",
        productUrl: "https://geometry-two.example/sku",
        whyTestThisToday: "A second paid DTC card keeps the later anatomy covered",
        bidUsd: 9,
        paidUsd: 9,
        clicks: 2,
        createdAt: "2026-08-23T00:11:00.000Z",
        updatedAt: "2026-08-23T00:11:00.000Z",
        rank: 2,
      },
      {
        id: "lst-geometry-three",
        day: "2026-08-23",
        productUrl: "https://geometry-three.example/sku",
        whyTestThisToday: "A third paid DTC card keeps rank three in the board",
        bidUsd: 7,
        paidUsd: 7,
        clicks: 3,
        createdAt: "2026-08-23T00:12:00.000Z",
        updatedAt: "2026-08-23T00:12:00.000Z",
        rank: 3,
      },
    ],
    defaultBidUsd: 5,
    now: new Date("2026-08-23T00:30:00.000Z"),
  });

  assert.match(html, /<header class="site-header"[^>]*data-slot="site-header"/);
  assert.match(html, /<div class="site-header-inner"[^>]*data-slot="shell"/);
  assert.match(html, /<main class="merch-desk-main"[^>]*data-merch-desk=""[^>]*data-slot="home-shell"/);
  assert.match(html, /<section id="claim" class="claim-drawer"[^>]*data-identity-slot="claim-drawer"[^>]*data-slot="claim-hero"/);
  assert.match(html, /data-slot="claim-heading"/);
  assert.match(html, /<form id="bid-form"[^>]*data-slot="claim-form"/);
  assert.match(html, /data-slot="url-input"/);
  assert.match(html, /data-slot="category-control"/);
  assert.match(html, /data-slot="category-rail"/);
  assert.doesNotMatch(html, /name="category"/);
  assert.match(html, /<section id="leaderboard" class="cover-board"[^>]*data-identity-slot="cover-board"[^>]*data-slot="top-three"/);
  assert.equal((html.match(/data-slot="paid-card"/g) ?? []).length, 3);
  assert.match(html, /data-identity-slot="cover-card"/);
  assert.equal((html.match(/<article[^>]*data-identity-slot="ledger-row"/g) ?? []).length, 2);
  assert.match(html, /MERCH DESK \/ MORNING ISSUE/);
  assert.match(html, /One cover\. What deserves a test before lunch\?/);
  assert.match(html, /id="search-button"[^>]*>[\s\S]*<span class="control-label">Find<\/span>/);
  assert.match(html, /id="theme-toggle"[^>]*>[\s\S]*<span class="control-label">Theme<\/span>/);
  assert.match(html, /<a class="brand"[^>]*>[\s\S]*<span class="brand-name">picks/);
  assert.match(html, /<img class="brand-mark" src="\/icons\/brand-mark\.svg"[^>]*>/);
  assert.doesNotMatch(html, /<svg\b|class="lane-icon"|class="card-avatar"|[←→↔]/);
  assert.doesNotMatch(html, /outbid\.lol|outbid-mark|see\.io|tutti\.so|joni\.ai/);
  assert.doesNotMatch(html, />Outbid<|Claim rank and Outbid/i);
  const dom = parseTestDom(html);
  const domElements = testDomElements(dom);
  const home = domElements.find((element) => element.attributes.get("data-slot") === "home-shell");
  const claim = domElements.find((element) => element.attributes.get("id") === "claim");
  const leaderboard = domElements.find((element) => element.attributes.get("id") === "leaderboard");
  const ledger = domElements.find((element) => element.attributes.get("data-identity-slot") === "desk-ledger");
  const paidCards = domElements.filter((element) => element.attributes.get("data-slot") === "paid-card");
  assert.ok(home, "DOM parser finds the merch desk shell");
  assert.ok(claim, "DOM parser finds the claim surface");
  assert.ok(leaderboard, "DOM parser finds the leaderboard surface");
  assert.ok(ledger, "DOM parser finds the later ledger surface");
  assert.equal(closestTestDomClass(claim!, "merch-desk-main"), home, "claim drawer stays inside merch desk");
  assert.equal(leaderboard!.parent, home, "cover board is a direct merch desk surface");
  assert.equal(closestTestDomClass(leaderboard!, "merch-desk-main"), home, "cover board stays inside merch desk");
  assert.equal(ledger!.parent, home, "later ledger is a direct merch desk surface");
  assert.equal(paidCards.length, 3, "DOM parser finds all three paid cards");
  assert.deepEqual(
    paidCards.map((card) => card.parent?.attributes.get("data-identity-slot")),
    ["cover-board", "desk-ledger", "desk-ledger"],
    "cover and later cards stay in their distinct desk surfaces",
  );
  for (const card of paidCards) {
    assert.equal(closestTestDomClass(card, "merch-desk-main"), home, "paid cards stay inside merch desk");
  }
  const metadataTracks = paidCards.map((card) => {
    const descendants = testDomElements(card);
    return {
      podium: descendants.some((element) => (element.attributes.get("class") ?? "").split(/\s+/).includes("podium-meta")),
      footer: descendants.some((element) => (element.attributes.get("class") ?? "").split(/\s+/).includes("row-foot")),
    };
  });
  assert.deepEqual(
    metadataTracks,
    [
      { podium: true, footer: false },
      { podium: false, footer: true },
      { podium: false, footer: true },
    ],
    "all three paid cards retain their real metadata track in the parsed card tree",
  );
  const identitySlots = paidCards.map((card) => card.attributes.get("data-identity-slot"));
  assert.deepEqual(identitySlots, ["cover-card", "ledger-row", "ledger-row"], "cover and ledger cards use separate identity slots");
  const componentOrder = [
    html.indexOf('data-slot="stats-pill"'),
    html.indexOf('data-slot="period-tabs"'),
    html.indexOf('data-slot="claim-heading"'),
    html.indexOf('data-slot="claim-form"'),
    html.indexOf('data-slot="category-rail"'),
    html.indexOf('data-slot="top-three"'),
  ];
  assert.ok(componentOrder.every((position, index) => position >= 0 && (index === 0 || position > componentOrder[index - 1])), "desk slots stay in source order");

  assert.match(html, /data-stats-pill=""/);
  assert.match(html, /data-category-rail=""/);
  assert.match(html, /data-category-chip="Storefronts"/);
  assert.match(html, /data-category-chip="Product tests"/);
  assert.match(html, /data-category-chip="Supplier ops"/);
  assert.match(html, /data-category-more=""/);
  assert.match(html, /id="category-overflow"[^>]*hidden[^>]*data-category-overflow=""/);
  assert.match(BOARD_CSS, /\.site-header-inner\s*\{[\s\S]*height: 72px;/);
  assert.match(BOARD_CSS, /\.merch-desk-main\s*\{[\s\S]*grid-template-columns: minmax\(0, 720px\) minmax\(300px, 360px\);/);
  assert.match(BOARD_CSS, /grid-template-areas:\s*"cover claim"\s*"ledger claim"\s*"handoff handoff";/);
  assert.match(BOARD_CSS, /\.merch-desk-main \.row-cover\s*\{[\s\S]*min-height: 176px;[\s\S]*border-radius: 0;/);
  assert.match(BOARD_CSS, /\.merch-desk-main \.row-cover \.row-link\s*\{[\s\S]*grid-template-columns: 78px minmax\(0, 1fr\);[\s\S]*"leading body"/);
  assert.match(BOARD_CSS, /\.merch-desk-main \.desk-ledger \.row-link\s*\{[\s\S]*grid-template-columns: 78px minmax\(0, 1fr\);/);
  assert.match(BOARD_CSS, /\.desk-lanes\s*\{[\s\S]*border-top: 1px dashed/);
  assert.match(BOARD_CSS, /\.claim-submit\s*\{[\s\S]*min-height: 46px;/);
  assert.match(BOARD_CSS, /\.bid-stepper\s*\{[\s\S]*flex: 0 0 auto;[\s\S]*justify-content: center;[\s\S]*gap: 6px;/);
  assert.doesNotMatch(BOARD_CSS, /\.bid-stepper\s*\{[^}]*flex:\s*1 1 auto/);
  assert.match(BOARD_CSS, /\.bid-field\s*\{[\s\S]*flex: 0 0 auto;[\s\S]*width: max-content;/);
  assert.match(BOARD_CSS, /\.bid-form\s*\{[\s\S]*align-items: center;/);
  assert.match(BOARD_CSS, /\.url-field,[\s\S]*\.form-hint\s*\{[\s\S]*width: 100%;[\s\S]*max-width: 28rem;/);
  assert.match(BOARD_CSS, /\.desk:has\(\.empty\) #claim \.claim-title\s*\{\s*font-size: clamp\(1\.55rem, 2\.35vw, 1\.75rem\);/);
  assert.doesNotMatch(BOARD_CSS, /\.desk:has\(\.empty\) #claim \.claim-title\s*\{[^}]*font-size: clamp\(2\.1rem, 5vw, 2\.85rem\);/);
  assert.match(BOARD_CSS, /@media \(max-width: 767px\)[\s\S]*\.merch-desk-main\s*\{[\s\S]*display: flex;[\s\S]*flex-direction: column;/);
  assert.match(BOARD_CSS, /@media \(max-width: 767px\)[\s\S]*\.desk\[data-occupied="false"\] \.merch-desk-main > #claim \{ order: 1; \}/);
  assert.match(BOARD_CSS, /@media \(max-width: 767px\)[\s\S]*grid-template-areas:\s*"brand"\s*"folio"\s*"nav";/);
  assert.match(BOARD_CSS, /@media \(max-width: 767px\)[\s\S]*\.merch-desk-main \.row-cover\s*\{[\s\S]*min-height: 176px;/);
  assert.match(BOARD_CSS, /body\s*\{[\s\S]*scrollbar-width: none;[\s\S]*-ms-overflow-style: none;/);
  assert.match(BOARD_CSS, /html::-webkit-scrollbar,[\s\S]*body::-webkit-scrollbar[\s\S]*display: none;/);
  assert.match(BOARD_CSS, /\.search-button,[\s\S]*\.theme-toggle\s*\{[\s\S]*border-radius: var\(--radius\);[\s\S]*text-transform: uppercase;/);
  assert.match(BOARD_CSS, /\.brand-mark\s*\{[\s\S]*width: 28px;[\s\S]*height: 28px;/);
  assert.doesNotMatch(BOARD_CSS, /lane-icon|card-avatar|<svg\b/);
  assert.doesNotMatch(BOARD_CSS, /visual-home|R20 exact-reference|outbid-today|outbid-activity|reference-fixture/);
});

test("GET / keeps real product title/body/footer fields and paid actions in every podium card", () => {
  const html = renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [
      {
        id: "lst-card-one",
        day: "2026-08-23",
        productUrl: "https://cover.example/apps/pick",
        whyTestThisToday: "A real cover reason sellers can test this morning",
        bidUsd: 20,
        paidUsd: 20,
        clicks: 3,
        createdAt: "2026-08-23T00:10:00.000Z",
        updatedAt: "2026-08-23T00:10:00.000Z",
        rank: 1,
      },
      {
        id: "lst-card-two",
        day: "2026-08-23",
        productUrl: "https://under.example/sku",
        whyTestThisToday: "A real second reason for a focused daily test",
        bidUsd: 12,
        paidUsd: 12,
        clicks: 1,
        createdAt: "2026-08-23T00:11:00.000Z",
        updatedAt: "2026-08-23T00:11:00.000Z",
        rank: 2,
      },
      {
        id: "lst-card-three",
        day: "2026-08-23",
        productUrl: "https://third.example/sku",
        whyTestThisToday: "A real third reason with no invented product facts",
        bidUsd: 9,
        paidUsd: 9,
        clicks: 0,
        createdAt: "2026-08-23T00:12:00.000Z",
        updatedAt: "2026-08-23T00:12:00.000Z",
        rank: 3,
      },
    ],
    defaultBidUsd: 5,
    now: new Date("2026-08-23T00:30:00.000Z"),
  });
  const dom = parseTestDom(html);
  const cards = testDomElements(dom).filter((element) => element.attributes.get("data-slot") === "paid-card");
  assert.equal(cards.length, 3);
  for (const [index, card] of cards.entries()) {
    const fields = testDomElements(card).filter((element) => element.attributes.has("data-card-field"));
    assert.deepEqual(
      fields.map((element) => element.attributes.get("data-card-field")),
      ["title", "body", "footer"],
      `card ${index + 1} keeps title → body → footer source order`,
    );
    const footer = fields.find((element) => element.attributes.get("data-card-field") === "footer");
    assert.ok(footer, `card ${index + 1} keeps a footer field`);
    const footerMeta = testDomElements(footer!)
      .filter((element) => element.attributes.has("data-card-meta"))
      .map((element) => element.attributes.get("data-card-meta"));
    assert.deepEqual(footerMeta, ["rank", "age", "host", "clicks", "details"], `card ${index + 1} keeps real footer facts`);
  }
  assert.equal((html.match(/data-podium-card=""/g) ?? []).length, 3, "every paid card remains openable");
  assert.equal((html.match(/href="\/r\/lst-card-(one|two|three)"/g) ?? []).length, 3, "every paid card keeps its redirect action");
  assert.equal((html.match(/data-card-meta="clicks"/g) ?? []).length, 3, "click facts remain visible in each card footer");
  assert.match(html, /data-cover-hop=""/);
  assert.match(html, /data-claim-after-row=""/);
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
  const stripEnd = html.indexOf("</aside>", stripAt);
  const stripSlice = html.slice(stripAt, stripEnd);
  assert.ok(coverAt > -1 && stripAt > coverAt, "one all-time cover stays above the last-24h strip");
  assert.ok(newcomerAt > stripAt && newcomerAt < stripEnd, "newcomer sits on the strip, not a second cover");
  assertStripRankIsLast24hFact(stripSlice, [1, 2]);
  assert.equal((html.match(/data-cover-hop/g) ?? []).length, 1);
  assert.equal((html.match(/This morning’s cover/g) ?? []).length, 1);
  assert.equal((html.match(/data-last24h-fact=""/g) ?? []).length, 2);
  assert.doesNotMatch(html, /take-after-list|list-after-take/);

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
  const liveStripEnd = live.body.indexOf("</aside>", liveStripAt);
  const liveStripSlice = live.body.slice(liveStripAt, liveStripEnd);
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
  assert.ok(claimAt > -1 && emptyStripAt > claimAt, "claim chrome precedes the empty strip");
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
  const overnightStripEnd = body.indexOf("</aside>", overnightStripAt);
  const overnightStripSlice = body.slice(overnightStripAt, overnightStripEnd);
  assert.ok(overnightCoverAt > -1 && overnightStripAt > overnightCoverAt, "quiet cover stays empty above last-night spend");
  assert.ok(overnightRowAt > overnightStripAt && overnightRowAt < overnightStripEnd, "last-night spend sits on the strip, not the cover");
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
  const occupiedStripEnd = occupied.body.indexOf("</aside>", occupiedStripAt);
  const occupiedStripSlice = occupied.body.slice(occupiedStripAt, occupiedStripEnd);
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
  const emptyCoverStripEnd = emptyCoverHtml.indexOf("</aside>", emptyCoverStripAt);
  const emptyCoverSlice = emptyCoverHtml.slice(emptyCoverStripAt, emptyCoverStripEnd);
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
  const differentStripEnd = differentCoverHtml.indexOf("</aside>", differentStripAt);
  const differentSlice = differentCoverHtml.slice(differentStripAt, differentStripEnd);
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
  const liveStripEnd = live.body.indexOf("</aside>", liveStripAt);
  const liveSlice = live.body.slice(liveStripAt, liveStripEnd);
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









test("GET / keeps an empty desk direct: Product URL, Why, then one Claim rank", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const claimAt = body.indexOf('id="claim"');
  const titleAt = body.indexOf('class="claim-title"', claimAt);
  const productUrlAt = body.indexOf('name="productUrl"', claimAt);
  const whyAt = body.indexOf('name="whyTestThisToday"', claimAt);
  const outbidAt = body.indexOf(">Claim rank", claimAt);

  assert.match(body, /data-empty-board=""/);
  assert.match(body, /data-empty-cover=""/);
  assert.match(body, /data-occupied="false"/);
  assert.match(body, /aria-label="Claim #1"/);
  assert.match(body, /Claim #1 for/);
  assert.match(body, /Product URL/);
  assert.match(body, /Why test this today/);
  assert.equal((body.match(/>Claim rank<\/button>/g) ?? []).length, 1);
  assert.doesNotMatch(body, />Outbid<|Claim rank and Outbid/i);
  assert.equal((body.match(/name="productUrl"/g) ?? []).length, 1);
  assert.equal((body.match(/name="whyTestThisToday"/g) ?? []).length, 1);
  assert.ok(claimAt > -1 && titleAt > claimAt && productUrlAt > titleAt && whyAt > productUrlAt && outbidAt > whyAt, "empty keyboard order is Product URL, Why, then Claim rank");
  assert.doesNotMatch(body, /take-after-list|list-after-take|after Test this today/);
  assert.doesNotMatch(body, /empty-claim-first|data-empty-claim|data-first-click="claim"/);
  assert.doesNotMatch(body, /data-later-write|data-why-later|data-listing-identity|Then the product URL|Then why test this today/);
  assert.doesNotMatch(body, /List a product|data-cover-hop|data-first-click="take"/);
});

test("GET / keeps morning and rolling-window prizes distinct", () => {
  const html = pageBody(renderBoardPage({
    day: "2026-08-23",
    tz: "UTC",
    listings: [{
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
    }],
    last24h: [{
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
    }],
    defaultBidUsd: 21,
    now: new Date("2026-08-23T00:30:00.000Z"),
  }));

  assert.match(html, /data-occupied="true"/);
  assert.match(html, /data-two-prizes=""/);
  assert.match(html, /data-morning-slot=""/);
  assert.match(html, /data-cover-name=""/);
  assert.match(html, /data-last24h-prize=""/);
  assert.match(html, /Rolling 24h spend/);
  assert.match(html, />24h 1</);
  assert.match(html, /A strip rank is a last-24h fact, not today’s cover #1/);
  assert.equal((html.match(/data-cover-hop=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-route=""/g) ?? []).length, 1);
  assert.doesNotMatch(html, /take-after-list|list-after-take|after Test this today/);
  assert.ok(html.indexOf('data-listing-id="lst-cover"') < html.indexOf('data-last24h=""'), "morning cover precedes the rolling strip");
});

test("GET / keeps paid later ranks quieter and claimable", async () => {
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
  const body = pageBody(response.body);
  const coverAt = body.indexOf('data-listing-id="lst-cover"');
  const underAt = body.indexOf('data-listing-id="lst-under"');
  assert.ok(coverAt > -1 && underAt > coverAt);
  assert.match(body, /data-later-stack=""/);
  assert.match(body, /data-later-rank=""/);
  assert.match(body, /<p class="dek" data-card-field="title">under\.example\/sku<\/p>/);
  assert.match(body, /claim this rank for \$9/);
  assert.doesNotMatch(body, /data-paid-name=""[^]*data-later-rank=""[^]*data-cover-name/);
  assert.doesNotMatch(body, /take-after-list|list-after-take|after Test this today/);
  assert.equal((body.match(/data-first-click="take"/g) ?? []).length, 1);
  const claimAt = body.indexOf('id="claim"');
  assert.ok(claimAt > -1 && underAt > claimAt, "claim form precedes later ranks");
});

test("GET / keeps unpaid sessions off the desk and redirect", async () => {
  const db = openDatabase(":memory:");
  const day = dayKey();
  placeBid(db, {
    id: "lst-ghost",
    day,
    productUrl: "https://ghost.example/sku",
    whyTestThisToday: "Abandoned Waffo session must not print as this morning’s cover",
    bidUsd: 99,
    paidUsd: 0,
    clicks: 12,
    createdAt: "2026-08-22T08:00:00.000Z",
  });
  const app = await buildApp({ db });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  assert.match(body, /data-empty-board=""/);
  assert.match(body, /data-unpaid-off=""/);
  assert.match(body, /incomplete or abandoned checkout stays off this desk/i);
  assert.match(body, /never becomes cover #1/i);
  assert.doesNotMatch(body, /ghost\.example|\$99|data-cover-hop|Test this today/);
  assert.doesNotMatch(body, /take-after-list|list-after-take|empty-claim-first|data-later-write|data-why-later/);

  const hop = await app.inject({ method: "GET", url: "/r/lst-ghost" });
  assert.equal(hop.statusCode, 404);
});

test("GET / keeps occupied Claim rail after the desk and redirects paid cover", async () => {
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
  const app = await buildApp({ db });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const body = pageBody(response.body);
  const deskAt = body.indexOf('data-listing-id="lst-cover"');
  const stripAt = body.indexOf('data-last24h=""');
  const claimAt = body.indexOf('id="claim"');
  const railAt = body.indexOf('data-later-rail=""');
  const claimTitleAt = body.indexOf('class="claim-title"', claimAt);
  const outbidAt = body.indexOf(">Claim rank", claimAt);
  const productUrlAt = body.indexOf('name="productUrl"', claimAt);
  assert.match(body, /data-claim-after-cover=""/);
  assert.match(body, /data-later-rail=""/);
  assert.match(body, /Claim #1 for/);
  assert.match(body, /data-bid-step="-1"/);
  assert.match(body, /data-bid-step="1"/);
  assert.match(body, /data-later-listing=""/);
  assert.doesNotMatch(body, /take-after-list|list-after-take|after Test this today/);
  assert.ok(claimAt > -1 && claimTitleAt > claimAt && productUrlAt > claimTitleAt && productUrlAt < outbidAt && railAt > outbidAt && deskAt > railAt && stripAt > deskAt, "paid claim facts keep the claim form, category rail, desk, rolling strip order");

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

test("GET /about publishes customer-facing product and cadence copy", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/about" });
  assert.equal(response.statusCode, 200);
  const body = response.body;
  const content = body.slice(body.indexOf('<article class="doc"'));
  assert.match(body, /aria-current="page"/);
  assert.match(body, /data-page="about"/);
  assert.match(body, /DTC Picks Daily/);
  assert.match(body, /transparent paid-placement board/);
  assert.match(body, /no hidden ranking factors/);
  assert.match(body, /\$5/);
  assert.match(body, /Rank is the bid/);
  assert.match(body, /listing placed first stays higher/);
  assert.match(body, /USD/);
  assert.match(body, /UTC/);
  assert.match(body, /00:00/);
  assert.match(body, /rolling/);
  assert.match(body, /last-24-hours strip/);
  assert.match(body, /not a second cover/i);
  assert.match(body, /payment\s+is confirmed/);
  assert.match(body, /Chat invitations/);
  assert.match(body, /adult content/);
  assert.match(body, /tracking and affiliate parameters/i);
  assert.match(body, /difference/);
  assert.doesNotMatch(
    content,
    /outbid\.lol|clone of|\bv1\b|fixture|Waffo|PAYMENT_MODE|BLOCKED-|BOARD_TZ/i,
  );
});

test("GET /rules publishes ranking, safety, and settlement rules without implementation copy", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/rules" });
  assert.equal(response.statusCode, 200);
  const body = response.body;
  const content = body.slice(body.indexOf('<article class="doc"'));
  assert.match(body, /aria-current="page"/);
  assert.match(body, /data-page="rules"/);
  assert.match(content, /A listing appears only after its payment is confirmed/);
  assert.match(content, /incomplete,[\s\S]*failed,[\s\S]*canceled,[\s\S]*abandoned checkout/);
  assert.doesNotMatch(content, /API keys?|Waffo|provider|webhook|order\.completed|valid signature/i);
  assert.match(body, /Minimum <strong>\$5<\/strong>/);
  assert.match(body, /step <strong>\$1<\/strong>/i);
  assert.match(body, /listing placed first/);
  assert.match(body, /difference/);
  assert.match(body, /UTC/);
  assert.match(body, /00:00/);
  assert.match(body, /activity strip is a rolling view/i);
  assert.match(body, /not a second cover/i);
  assert.match(body, /secure, public product page/i);
  assert.match(body, /Tracking, referral, and affiliate parameters are removed/);
  assert.match(body, /chat invitations/);
  assert.match(body, /adult content/);
  assert.match(body, /Clicks never change rank/);
  assert.match(body, /incomplete checkout never appears/i);
  assert.doesNotMatch(
    content,
    /outbid\.lol|clone of|\bv1\b|fixture|developer platform|PAYMENT_MODE|BLOCKED-|BOARD_TZ|weekId|createdAt|paidAt|localhost|link-local/i,
  );
});

test("GET /about and GET /rules show the configured public timezone", () => {
  const about = renderAboutPage({ tz: "America/New_York" });
  const rules = renderRulesPage({ tz: "America/New_York" });
  const aboutContent = about.slice(about.indexOf('<article class="doc"'));
  const rulesContent = rules.slice(rules.indexOf('<article class="doc"'));
  assert.match(about, /America\/New_York/);
  assert.match(rules, /America\/New_York/);
  assert.doesNotMatch(aboutContent, /BOARD_TZ|fixture|Waffo/);
  assert.doesNotMatch(rulesContent, /BOARD_TZ|fixture/);
});
