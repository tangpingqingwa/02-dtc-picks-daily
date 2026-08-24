import {
  claimPriceUsd,
  defaultClaimBidUsd,
  MIN_BID_USD,
  rankForBid,
  type RankedListing,
} from "../core/board.js";
import { formatIssueDate } from "../core/day.js";
import {
  displayHostPath,
  escapeHtml,
  formatUsd,
  html,
  relativeTime,
} from "./html.js";
import { renderLayout, SITE_TITLE } from "./layout.js";

export type BoardViewModel = {
  day: string;
  tz: string;
  listings: RankedListing[];
  last24h?: RankedListing[];
  defaultBidUsd: number;
  now?: Date;
};

export function claimRankUsd(listing: RankedListing): number {
  return claimPriceUsd(listing.bidUsd);
}

export function renderLast24hRow(listing: RankedListing, now?: Date): string {
  const host = escapeHtml(displayHostPath(listing.productUrl));
  const blurb = escapeHtml(listing.whyTestThisToday);
  const when = escapeHtml(relativeTime(listing.createdAt, now));
  const bid = escapeHtml(formatUsd(listing.bidUsd));
  const isWindowPrize = listing.rank === 1;
  const prizeAttr = isWindowPrize ? ' data-last24h-prize=""' : "";
  const slot = isWindowPrize
    ? html`<span class="last24h-slot" data-last24h-slot="">Rolling 24h spend</span>`
    : "";
  return html`<li class="last24h-row" data-last24h-row="" data-last24h-id="${escapeHtml(listing.id)}"${prizeAttr}>
  <div class="last24h-link">
    <span class="last24h-body">
      ${slot}
      <span class="last24h-host">${host}</span>
      <span class="last24h-why">${blurb}</span>
    </span>
    <span class="last24h-meta">
      <span class="last24h-when"><time datetime="${escapeHtml(listing.createdAt)}">${when}</time></span>
      <span class="last24h-clicks">${listing.clicks} clicks</span>
      <span class="last24h-bid">${bid}</span>
      <span class="last24h-rank" data-last24h-rank="${listing.rank}" data-last24h-fact="" aria-label="Last 24 hours rank ${listing.rank}, not today’s cover">24h ${listing.rank}</span>
    </span>
  </div>
</li>`;
}

export function renderLast24hStrip(listings: RankedListing[], now?: Date): string {
  const occupied = listings.length > 0;
  const rows = occupied
    ? html`<ol class="last24h-list">
        ${listings.map((listing) => renderLast24hRow(listing, now)).join("")}
      </ol>`
    : html`<p class="last24h-empty" data-last24h-empty="">
        No paid listings in the last 24 hours. The strip stays empty — not a second cover. No invented #1.
      </p>`;
  return html`<aside class="last24h" data-last24h="" data-last24h-window="rolling-24h"${occupied ? ' data-last24h-occupied=""' : ' data-last24h-empty-strip=""'}>
  <p class="last24h-kicker">Last 24 hours</p>
  <p class="last24h-dek">Spend in the rolling last 24 hours. Not a midnight UTC reset. Not a second all-time board. Cover #1 is this morning’s slot. A strip rank is a last-24h fact, not today’s cover #1.</p>
  ${rows}
</aside>`;
}

export function renderListingRow(listing: RankedListing, now?: Date): string {
  const rank = listing.rank;
  const isCover = rank === 1;
  const topClass = isCover
    ? " row-cover row-1"
    : rank === 2
      ? " row-stack row-2"
      : rank === 3
        ? " row-stack row-3"
        : " row-stack";
  const host = escapeHtml(displayHostPath(listing.productUrl));
  const blurb = escapeHtml(listing.whyTestThisToday);
  const when = escapeHtml(relativeTime(listing.createdAt, now));
  const bid = escapeHtml(formatUsd(listing.bidUsd));
  const claim = escapeHtml(formatUsd(claimRankUsd(listing)));
  const href = escapeHtml(`/r/${listing.id}`);
  const coverWhy = isCover
    ? html`<div class="cover-why" data-cover-why="">
      <p class="cover-why-label">Why test this today</p>
      <p class="cover-why-line" data-prize-before-price="">${blurb}</p>
      <p class="list-after-why-wrap">
        <a class="list-after-why" href="#claim" data-list-after-why="">List a product</a>
        under this reason. Paying less than #1 still lists.
      </p>
    </div>`
    : "";
  const coverHop = isCover
    ? html`<p class="cover-hop-wrap" data-take-after-list="">
        <a class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five take-after-list-six" href="${href}" data-cover-hop="" data-first-click="take" data-take-after-list-first="" data-take-after-list-two="" data-take-after-list-three="" data-take-after-list-four="" data-take-after-list-five="" data-take-after-list-six="" aria-label="Test this today at ${host}">Test this today</a>
      </p>`
    : "";
  const listAfterTake = isCover
    ? html`<p class="list-after-take-wrap">
        <a class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six" href="#claim" data-list-after-take="" data-first-write="list" data-list-after-take-two="" data-list-after-take-three="" data-list-after-take-four="" data-list-after-take-five="" data-list-after-take-six="">List a product</a>
        after Test this today. Paying less than #1 still lists.
      </p>`
    : "";
  if (isCover) {
    const inner = html`<div class="row-meta">
      <span class="rank">#${rank}</span>
    </div>
    <div class="row-body">
      <p class="row-kicker">This morning’s cover</p>
      ${coverWhy}
      ${coverHop}
      ${listAfterTake}
      <div class="row-top">
        <p class="host" data-cover-name="">${host}</p>
      </div>
      <p class="cover-later" data-later-fact="">
        <span class="bid later-fact" data-later-fact="">${bid}</span>
        <span class="clicks later-fact" data-later-fact=""><span class="live-dot" aria-hidden="true"></span>${listing.clicks} clicks</span>
      </p>
    </div>`;
    return html`<article class="row${topClass}" data-rank="${rank}" data-listing-id="${escapeHtml(listing.id)}" data-morning-slot="" data-paid-name="">
  <div class="row-link">${inner}</div>
  <button type="button" class="claim-rank" data-claim-bid="${claimRankUsd(listing)}">claim this rank for ${claim}</button>
</article>`;
  }
  const inner = html`<div class="row-meta">
      <span class="rank">#${rank}</span>
    </div>
    <div class="row-body">
      <div class="row-top">
        <p class="dek">${host}</p>
        <p class="bid">${bid}</p>
      </div>
      <p class="slot">${blurb}</p>
      <p class="row-foot">
        <span class="when"><time datetime="${escapeHtml(listing.createdAt)}">${when}</time></span>
        <span class="clicks"><span class="live-dot" aria-hidden="true"></span>${listing.clicks} clicks</span>
      </p>
    </div>`;
  return html`<article class="row${topClass}" data-rank="${rank}" data-listing-id="${escapeHtml(listing.id)}" data-later-rank="">
  <a class="row-link" href="${href}">${inner}</a>
  <button type="button" class="claim-rank" data-claim-bid="${claimRankUsd(listing)}">claim this rank for ${claim}</button>
</article>`;
}

export function renderBoardBody(model: BoardViewModel): string {
  const defaultBid = model.defaultBidUsd;
  const projected = rankForBid(model.listings, defaultBid);
  const claimCopy =
    model.listings.length === 0
      ? "Claim #1 for"
      : projected === 1
        ? "Claim #1 for"
        : `Claim #${projected} for`;
  const issueSpoken = escapeHtml(formatIssueDate(model.day, model.tz));
  const occupied = model.listings.length > 0;
  const stripOccupied = (model.last24h ?? []).length > 0;
  const coverListing = model.listings.find((listing) => listing.rank === 1);
  const laterListings = model.listings.filter((listing) => listing.rank !== 1);
  const laterStack =
    laterListings.length > 0
      ? html`<section class="later-stack" data-later-stack="" aria-label="Also on the desk">
  <p class="later-stack-kicker">Also on the desk</p>
  <p class="later-stack-dek">Paying less than #1 still lists. These product names are not this morning’s cover.</p>
  ${laterListings.map((listing) => renderListingRow(listing, model.now)).join("")}
</section>`
      : "";
  const rows = occupied && coverListing
    ? `${renderListingRow(coverListing, model.now)}${laterStack}`
    : html`<div class="empty" data-empty-board="" data-empty-cover="">
          <p class="empty-kicker">Quiet morning</p>
          <p><strong>No listings yet today.</strong></p>
          <p>The desk is open. An empty morning is valid — not a broken site, not an invented cover. Bid ${escapeHtml(formatUsd(MIN_BID_USD))} to take the cover.</p>
        </div>`;
  const listHop = occupied
    ? html`<p class="masthead-list">
    <a class="list-under-cover" href="#claim" data-list-under-cover="">List a product</a>
    under today’s cover. Paying less than #1 still lists.
  </p>`
    : "";
  const deskAttrs = occupied
    ? ` data-occupied="true"${stripOccupied ? ' data-two-prizes=""' : ""}`
    : ' data-occupied="false" data-empty-claim-first=""';
  const claimAttrs = occupied
    ? ""
    : ' class="empty-claim-first" data-empty-claim-first="" aria-label="Claim #1"';
  const claimTitleAttrs = occupied ? "" : ' data-empty-claim="" data-first-click="claim"';
  const claimKicker = occupied ? html`<p class="claim-kicker">List a product</p>` : "";
  const productUrlField = html`<div class="field">
      <label class="field-label" for="productUrl">Product URL</label>
      <input id="productUrl" name="productUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false" required placeholder="https://store.example/sku"/>
    </div>`;
  const whyField = html`<div class="field why-field">
      <label class="field-label" for="whyTestThisToday">Why test this today</label>
      <input id="whyTestThisToday" name="whyTestThisToday" type="text" maxlength="140" minlength="8" required placeholder="What a seller should try this morning"/>
    </div>`;
  const occupiedListingField = html`<div class="field why-field">
      <label class="field-label" for="whyTestThisToday">One-line listing</label>
      <input id="whyTestThisToday" name="whyTestThisToday" type="text" maxlength="140" minlength="8" required placeholder="One-line listing"/>
    </div>`;
  const formHint = html`<p class="form-hint">Already on the list? Enter the same URL and up your bid. You pay only the difference.</p>`;
  const bidForm = occupied
    ? html`<form id="bid-form" class="bid-form" method="post" action="/checkout">
    <div class="bid-row">
      ${productUrlField}
      <button type="submit" class="outbid">Outbid</button>
    </div>
    <div class="later-listing" data-later-listing="">
      ${occupiedListingField}
    </div>
    ${formHint}
  </form>`
    : html`<form id="bid-form" class="bid-form" method="post" action="/checkout">
    <button type="submit" class="outbid">Outbid</button>
    <div class="listing-identity" data-listing-identity="" data-later-write="">
      <p class="later-write-label">Then the product URL</p>
      ${productUrlField}
    </div>
    <div class="why-later" data-why-later="">
      <p class="why-later-label">Then why test this today</p>
      ${whyField}
    </div>
    ${formHint}
  </form>`;

  return html`<div class="desk"${deskAttrs}>
<header class="masthead">
  <p class="masthead-kicker">Morning merch desk</p>
  <h1 class="masthead-title">${SITE_TITLE}</h1>
  <p class="masthead-issue">
    <span class="issue-label">Issue</span>
    <time datetime="${escapeHtml(model.day)}" data-issue-date="${escapeHtml(model.day)}">${issueSpoken}</time>
    <span class="issue-rule" aria-hidden="true"></span>
    <span class="issue-tz">${escapeHtml(model.tz)}</span>
  </p>
  <p class="masthead-dek">One cover. Product URL plus why test this today. Rank is the bid.</p>
  ${listHop}
</header>
<section id="leaderboard" aria-label="Today’s cover">
  ${rows}
</section>
${renderLast24hStrip(model.last24h ?? [], model.now)}
<section id="claim"${claimAttrs}>
  ${claimKicker}
  <h2 class="claim-title"${claimTitleAttrs}>
    <span data-claim-copy>${claimCopy}</span>
    <span class="bid-stepper">
      <button type="button" class="step" data-bid-step="-1" aria-label="Decrease bid by one dollar">−</button>
      <label class="bid-field">
        <span class="sr-only">Amount in dollars</span>
        <span class="bid-sizer" aria-hidden="true">$${defaultBid}</span>
        <span class="bid-input-wrap">
          <span aria-hidden="true">$</span>
          <input id="bid" name="bidUsd" form="bid-form" type="text" inputmode="numeric" pattern="[0-9]*" value="${defaultBid}" required/>
        </span>
      </label>
      <button type="button" class="step" data-bid-step="1" aria-label="Increase bid by one dollar">+</button>
    </span>
  </h2>
  <p class="claim-note">
    <span class="accent">New spots start at ${escapeHtml(formatUsd(MIN_BID_USD))}.</span>
    Paying less than the #1 price still puts you on the board at whatever place that bid can take.
  </p>
  ${bidForm}
</section>
</div>
<script>
  (function () {
    var min = ${MIN_BID_USD};
    var input = document.getElementById("bid");
    var sizer = document.querySelector(".bid-sizer");
    var copy = document.querySelector("[data-claim-copy]");
    var bids = ${JSON.stringify(model.listings.map((row) => row.bidUsd))};
    function parseBid(raw) {
      var n = parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
      return Number.isFinite(n) ? n : min;
    }
    function rankFor(bid) {
      var r = 1;
      for (var i = 0; i < bids.length; i++) if (bids[i] >= bid) r++;
      return r;
    }
    function sync() {
      var bid = Math.max(min, parseBid(input.value));
      input.value = String(bid);
      if (sizer) sizer.textContent = "$" + bid;
      if (copy) copy.textContent = "Claim #" + rankFor(bid) + " for";
    }
    if (!input) return;
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    document.querySelectorAll("[data-bid-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var step = Number(btn.getAttribute("data-bid-step"));
        var next = Math.max(min, parseBid(input.value) + step);
        input.value = String(next);
        sync();
      });
    });
    document.querySelectorAll("[data-claim-bid]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        input.value = String(btn.getAttribute("data-claim-bid"));
        sync();
        var field = document.getElementById("productUrl");
        if (field) field.focus();
        document.getElementById("claim").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    sync();
  })();
</script>`;
}

export function renderBoardPage(model: BoardViewModel): string {
  return renderLayout({
    title: SITE_TITLE,
    description:
      "Daily public auction for this morning’s DTC / Shopify / Amazon picks cover. Rank is the bid.",
    active: "leaderboard",
    day: model.day,
    tz: model.tz,
    now: model.now,
    body: renderBoardBody({
      ...model,
      defaultBidUsd: model.defaultBidUsd || defaultClaimBidUsd(model.listings),
    }),
  });
}
