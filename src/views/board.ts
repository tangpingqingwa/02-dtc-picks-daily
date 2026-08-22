import {
  claimPriceUsd,
  defaultClaimBidUsd,
  MIN_BID_USD,
  rankForBid,
  type RankedListing,
} from "../core/board.js";
import {
  avatarLetter,
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
  const topClass =
    rank === 1 ? " row-top3 row-1" : rank === 2 ? " row-top3 row-2" : rank === 3 ? " row-top3 row-3" : "";
  const host = escapeHtml(displayHostPath(listing.productUrl));
  const blurb = escapeHtml(listing.whyTestThisToday);
  const letter = escapeHtml(avatarLetter(listing.productUrl));
  const when = escapeHtml(relativeTime(listing.createdAt, now));
  const bid = escapeHtml(formatUsd(listing.bidUsd));
  const claim = escapeHtml(formatUsd(claimRankUsd(listing)));
  const href = escapeHtml(`/r/${listing.id}`);
  return html`<article class="row${topClass}" data-rank="${rank}" data-listing-id="${escapeHtml(listing.id)}">
  <a class="row-link" href="${href}">
    <div class="row-meta">
      <span class="rank">#${rank}</span>
      <span class="avatar" aria-hidden="true">${letter}</span>
    </div>
    <div class="row-body">
      <div class="row-top">
        <p class="host">${host}</p>
        <p class="bid">${bid}</p>
      </div>
      <p class="blurb">${blurb}</p>
      <p class="row-foot">
        <span class="when"><time datetime="${escapeHtml(listing.createdAt)}">${when}</time></span>
        <span class="clicks"><span class="live-dot" aria-hidden="true"></span>${listing.clicks} clicks</span>
      </p>
    </div>
  </a>
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
  const rows =
    model.listings.length === 0
      ? html`<div class="empty" data-empty-board>
          <p><strong>No listings yet today.</strong></p>
          <p>An empty morning is valid. Bid ${escapeHtml(formatUsd(MIN_BID_USD))} to take the cover.</p>
        </div>`
      : model.listings
          .map((listing) => {
            const row = renderListingRow(listing, model.now);
            const afterTop3 =
              listing.rank === 3 && model.listings.length > 3
                ? html`<div class="band" role="separator" aria-label="End of top 3"><span class="band-line"></span><span class="band-label">Top 3</span><span class="band-line"></span></div>`
                : "";
            const afterTop10 =
              listing.rank === 10 && model.listings.length > 10
                ? html`<div class="band" role="separator" aria-label="End of top 10"><span class="band-line"></span><span class="band-label">Top 10</span><span class="band-line"></span></div>`
                : "";
            return `${row}${afterTop3}${afterTop10}`;
          })
          .join("");

  return html`<header>
  <h1 class="sr-only">${SITE_TITLE}</h1>
</header>
<section id="claim">
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
        <span class="field-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"></circle>
            <ellipse cx="12" cy="12" rx="4" ry="10" stroke="currentColor" stroke-width="1.5"></ellipse>
            <path d="M2 12H22" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"></path>
          </svg>
        </span>
        <input id="productUrl" name="productUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false" required placeholder="Product URL"/>
      </div>
      <button type="submit" class="outbid">Outbid</button>
    </div>
    <div class="field why-field">
      <input id="whyTestThisToday" name="whyTestThisToday" type="text" maxlength="140" minlength="8" required placeholder="Why test this today"/>
    </div>
    <p class="form-hint">Already on the list? Enter the same URL and up your bid. You pay only the difference.</p>
  </form>
</section>
<div id="leaderboard">
  ${rows}
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
    body: renderBoardBody({
      ...model,
      defaultBidUsd: model.defaultBidUsd || defaultClaimBidUsd(model.listings),
    }),
  });
}
