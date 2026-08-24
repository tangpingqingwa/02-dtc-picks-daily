import type { FastifyPluginAsync } from "fastify";
import { boardTimeZone, dayKey } from "../../core/day.js";
import { escapeHtml, html } from "../../views/html.js";
import { renderLayout, SITE_TITLE } from "../../views/layout.js";

export const RULES_PATH = "/rules" as const;

export type RulesViewModel = {
  tz: string;
  day?: string;
};

export function renderRulesBody(model: RulesViewModel): string {
  const tz = escapeHtml(model.tz);
  return html`<article class="doc" data-page="rules">
  <h1>Rules</h1>
  <p>
    Rank is the bid. A bidder can predict place from this page alone. There are no extra
    ranking factors. <strong>No ads. No API keys. No revenue share</strong> with listed products.
  </p>

  <h2>Ranking</h2>
  <ol>
    <li>Rank is the bid. Nothing else — no recency boost, no editorial score, no click-through rate.</li>
    <li>Bids are whole US dollars. Minimum <strong>$5</strong>. Step <strong>$1</strong>.</li>
    <li>Sort today’s listings by bid descending. On a tie, the <strong>older</strong> listing keeps the higher rank.</li>
    <li>Paying less than the current #1 still lists at whatever rank that bid can take.</li>
    <li>A completed payment is what claims the rank. An unpaid Polar session does not appear.</li>
    <li>After a successful raise, we re-sort. The listing keeps its original created time.</li>
  </ol>
  <p>Example, same day:</p>
  <table>
    <thead>
      <tr><th>Order paid</th><th>Bid</th><th>Rank</th></tr>
    </thead>
    <tbody>
      <tr><td>A $20</td><td>20</td><td>#1</td></tr>
      <tr><td>B $12</td><td>12</td><td>#2</td></tr>
      <tr><td>C $12</td><td>12</td><td>#3 (newer than B)</td></tr>
      <tr><td>D $5</td><td>5</td><td>#4</td></tr>
    </tbody>
  </table>
  <p>D is on the board even though D did not take #1.</p>

  <h2>Raise</h2>
  <ul>
    <li>The same canonical product URL on the same day raises the existing listing. It does not create a second row.</li>
    <li>The new bid must be a whole dollar strictly greater than this listing’s current bid.</li>
    <li>The raiser pays only the <strong>difference</strong> (<code>newBid − currentBid</code>).</li>
    <li>To take #1, the new bid must be at least $1 above the current top bid, unless this listing is already #1 and is only increasing its own number.</li>
    <li>Another bidder cannot steal this listing’s rank by paying only this listing’s difference. They must submit <em>their</em> URL at a bid that outranks, paying that full bid (or their own difference if they already have a row).</li>
    <li>Created time does not change on raise. Amount paid increases by the difference.</li>
  </ul>

  <h2>URL identity and bans</h2>
  <p>Before we compare, store, or send an outbound click:</p>
  <ol>
    <li>Require <code>https:</code>. Reject <code>http:</code>, <code>javascript:</code>, <code>data:</code>.</li>
    <li>Reject shortener hosts. We never keep <code>bit.ly</code> / <code>t.co</code> / <code>tinyurl.com</code> as the stored URL.</li>
    <li>Drop the fragment.</li>
    <li>Strip tracking and affiliate query keys, including <code>utm_*</code>, <code>ref</code>, <code>ref_</code>, <code>affiliate</code>, <code>aff</code>, <code>tag</code>, <code>fbclid</code>, <code>gclid</code>, <code>mc_cid</code>, <code>mc_eid</code>, <code>igshid</code>, <code>si</code>, <code>pp</code>, <code>ascsubtag</code>, and Amazon <code>tag</code> / <code>linkCode</code> / <code>psc</code>. If the only remaining identity is those keys, we reject.</li>
    <li>Lowercase the host. Strip default ports. Strip a trailing slash on the path except <code>/</code>.</li>
    <li>Amazon / Shopify / App Store style paths are keyed by path, not leftover query. Different ASINs or product handles are different listings.</li>
  </ol>
  <p><strong>Reject (do not charge):</strong></p>
  <ul>
    <li>Chat and invite links: Telegram, WhatsApp, Discord, Messenger, Signal, Line, and similar.</li>
    <li>NSFW / porn / adult-platform URLs and blurbs that are sexual content.</li>
    <li>Empty or &gt;140 character “why test this today.”</li>
    <li>Non-https, credentials-in-URL, or localhost / link-local hosts.</li>
  </ul>
  <p>Clicks go to the <strong>stripped</strong> URL. Affiliate and tracking query strings must not survive.</p>

  <h2>Daily cadence</h2>
  <table>
    <tbody>
      <tr><th>Timezone</th><td><code>BOARD_TZ</code> IANA name. Default <strong>UTC</strong>. This board is on <strong>${tz}</strong>.</td></tr>
      <tr><th>Day key</th><td>Calendar date in <code>BOARD_TZ</code> (<code>YYYY-MM-DD</code>).</td></tr>
      <tr><th>Reset</th><td>At <strong>00:00</strong> in <code>BOARD_TZ</code>, a new empty board starts. Yesterday’s listings leave the cover.</td></tr>
      <tr><th>Cover</th><td>Rank #1 right now for today’s day is the cover slot of this morning’s brief.</td></tr>
      <tr><th>Last 24h</th><td>A strip on the desk ranks paid rows from the <strong>rolling last 24 hours</strong>. Not civil midnight. Empty strip stays empty. Not a second cover. Strip ranks are last-24h facts, not today’s cover #1.</td></tr>
      <tr><th>History</th><td>We keep paid rows for audit. The public cover shows today only. Last night’s spend can still sit on the last-24h strip.</td></tr>
    </tbody>
  </table>
  <p>Do not carry bids across the reset. Raising yesterday’s URL today is a new listing on the new day and pays a full bid ≥ $5.</p>

  <h2>Clicks</h2>
  <ul>
    <li>Every listing shows a public integer click count.</li>
    <li>We increment once per outbound navigation through the board (a redirect hop we control).</li>
    <li>We do not invent clicks. Counts start at 0. We do not hide low counts.</li>
    <li>Clicking does not change rank.</li>
  </ul>

  <h2>Checkout (Polar)</h2>
  <p>Money in v1 is Polar Checkout (merchant of record).</p>
  <table>
    <thead>
      <tr><th>Mode</th><th>When</th><th>Behavior</th></tr>
    </thead>
    <tbody>
      <tr><td>Fixture</td><td>default in <code>scripts/test.sh</code> and CI</td><td>Completing a fixture session inserts or raises the listing. No network.</td></tr>
      <tr><td>Live</td><td><code>POLAR_LIVE=1</code> plus Polar secret</td><td>Real Checkout. The listing appears only after a paid webhook / confirmed session.</td></tr>
    </tbody>
  </table>
  <p>
    Missing Polar live secret during operator smoke is <code>BLOCKED-SECRET: POLAR_ACCESS_TOKEN</code>.
    That is not a fixture success.
  </p>
  <p>
    No ads. No API-key product. No revenue share cut to the listed URL.
    Failed or abandoned checkout: 0 listing change, 0 rank change.
  </p>
</article>`;
}

export function renderRulesPage(model: RulesViewModel): string {
  const tz = model.tz;
  const day = model.day ?? dayKey(new Date(), tz);
  return renderLayout({
    title: `Rules · ${SITE_TITLE}`,
    description:
      "Ranking, raise, URL stripping, banned chat and NSFW, daily UTC reset, Polar. Rank is the bid. Minimum $5.",
    active: "rules",
    day,
    tz,
    body: renderRulesBody(model),
  });
}

export const rulesRoutes: FastifyPluginAsync = async (app) => {
  app.get(RULES_PATH, async (_request, reply) => {
    const tz = boardTimeZone();
    const htmlPage = renderRulesPage({ tz, day: dayKey(new Date(), tz) });
    return reply.type("text/html; charset=utf-8").send(htmlPage);
  });
};
