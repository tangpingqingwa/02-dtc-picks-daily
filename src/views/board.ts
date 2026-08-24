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
  defaultBidUsd: number;
  now?: Date;
};

export function claimRankUsd(listing: RankedListing): number {
  return claimPriceUsd(listing.bidUsd);
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
  const eyebrow = isCover ? "This morning’s cover" : `Also on the desk · #${rank}`;
  const coverWhy = isCover
    ? html`<div class="cover-why" data-cover-why="">
      <p class="cover-why-label">Why test this today</p>
      <p class="cover-why-line">${blurb}</p>
      <p class="list-after-why-wrap">
        <a class="list-after-why" href="#claim" data-list-after-why="">List a product</a>
        under this reason. Paying less than #1 still lists.
      </p>
    </div>`
    : "";
  const coverHop = isCover
    ? html`<p class="cover-hop-wrap" data-take-after-list="">
        <a class="cover-hop cover-hop-first take-after-list-first take-after-list-two take-after-list-three take-after-list-four take-after-list-five" href="${href}" data-cover-hop="" data-first-click="take" data-take-after-list-first="" data-take-after-list-two="" data-take-after-list-three="" data-take-after-list-four="" data-take-after-list-five="" aria-label="Test this today at ${host}">Test this today</a>
      </p>`
    : "";
  const listAfterTake = isCover
    ? html`<p class="list-after-take-wrap">
        <a class="list-after-take list-after-take-first list-after-take-two list-after-take-three list-after-take-four list-after-take-five list-after-take-six" href="#claim" data-list-after-take="" data-first-write="list" data-list-after-take-two="" data-list-after-take-three="" data-list-after-take-four="" data-list-after-take-five="" data-list-after-take-six="">List a product</a>
        after Test this today. Paying less than #1 still lists.
      </p>`
    : "";
  const stackBlurb = isCover ? "" : html`<p class="blurb">${blurb}</p>`;
  const inner = html`<div class="row-meta">
      <span class="rank">#${rank}</span>
    </div>
    <div class="row-body">
      <p class="row-kicker">${eyebrow}</p>
      ${coverWhy}
      ${coverHop}
      ${listAfterTake}
      <div class="row-top">
        <p class="host">${host}</p>
        <p class="bid">${bid}</p>
      </div>
      ${stackBlurb}
      <p class="row-foot">
        <span class="when"><time datetime="${escapeHtml(listing.createdAt)}">${when}</time></span>
        <span class="clicks"><span class="live-dot" aria-hidden="true"></span>${listing.clicks} clicks</span>
      </p>
    </div>`;
  const wrap = isCover
    ? html`<div class="row-link">${inner}</div>`
    : html`<a class="row-link" href="${href}">${inner}</a>`;
  return html`<article class="row${topClass}" data-rank="${rank}" data-listing-id="${escapeHtml(listing.id)}">
  ${wrap}
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
  const rows = occupied
    ? model.listings.map((listing) => renderListingRow(listing, model.now)).join("")
    : html`<div class="empty" data-empty-board>
          <p class="empty-kicker">Quiet morning</p>
          <p><strong>No listings yet today.</strong></p>
          <p>The desk is open. An empty morning is valid — not a broken site. Bid ${escapeHtml(formatUsd(MIN_BID_USD))} to take the cover.</p>
        </div>`;
  const listHop = occupied
    ? html`<p class="masthead-list">
    <a class="list-under-cover" href="#claim" data-list-under-cover="">List a product</a>
    under today’s cover. Paying less than #1 still lists.
  </p>`
    : "";

  return html`<header class="masthead">
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
<section id="claim">
  <p class="claim-kicker">List a product</p>
  <h2 class="claim-title">
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
  <form id="bid-form" class="bid-form" method="post" action="/checkout">
    <div class="bid-row">
      <div class="field">
        <label class="field-label" for="productUrl">Product URL</label>
        <input id="productUrl" name="productUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false" required placeholder="https://store.example/sku"/>
      </div>
      <button type="submit" class="outbid">Outbid</button>
    </div>
    <div class="field why-field">
      <label class="field-label" for="whyTestThisToday">Why test this today</label>
      <input id="whyTestThisToday" name="whyTestThisToday" type="text" maxlength="140" minlength="8" required placeholder="What a seller should try this morning"/>
    </div>
    <p class="form-hint">Already on the list? Enter the same URL and up your bid. You pay only the difference.</p>
  </form>
</section>
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
