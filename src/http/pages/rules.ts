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
    The board follows the published rules below. There are no hidden ranking factors:
    <strong>rank is the bid</strong>.
  </p>

  <h2>Listings and payment</h2>
  <p>
    A listing appears only after its payment is confirmed. Returning from an incomplete,
    failed, canceled, or abandoned checkout never changes the board or its ranking.
  </p>

  <h2>Ranking</h2>
  <ol>
    <li>Listings are ordered by bid from highest to lowest.</li>
    <li>Bids use whole US dollars. Minimum <strong>$5</strong>; step <strong>$1</strong>.</li>
    <li>When bids are equal, the listing placed first keeps the higher rank.</li>
    <li>A bid below the current #1 still appears at the rank that amount can take.</li>
    <li>Rank changes only after payment is confirmed. An incomplete checkout never appears.</li>
    <li>Clicks, recency, and editorial preference never affect rank.</li>
  </ol>
  <p>Example, same day:</p>
  <table>
    <thead>
      <tr><th>Order placed</th><th>Bid</th><th>Rank</th></tr>
    </thead>
    <tbody>
      <tr><td>A</td><td>$20</td><td>#1</td></tr>
      <tr><td>B</td><td>$12</td><td>#2</td></tr>
      <tr><td>C</td><td>$12</td><td>#3, because B was first</td></tr>
      <tr><td>D</td><td>$5</td><td>#4</td></tr>
    </tbody>
  </table>

  <h2>Raises</h2>
  <ul>
    <li>The same product link on the same day raises the existing listing instead of creating a duplicate.</li>
    <li>The new total must be at least $1 above that listing’s current bid.</li>
    <li>The original payer is charged only the <strong>difference</strong> between the current and new bid.</li>
    <li>To take #1, the new total must be at least $1 above the current leader.</li>
    <li>A different seller submits a new listing and pays the full bid; they cannot take over somebody else’s listing for the raise amount.</li>
  </ul>

  <h2>Product links</h2>
  <ol>
    <li>Use a secure, public product page.</li>
    <li>Tracking, referral, and affiliate parameters are removed.</li>
    <li>Link shorteners, chat invitations, and adult content are rejected.</li>
    <li>Private, local-only, credentialed, or otherwise unsafe destinations are rejected before checkout.</li>
    <li>Products are identified by their cleaned destination, so tracking variants do not create duplicate listings.</li>
  </ol>

  <h2>Daily cover</h2>
  <table>
    <tbody>
      <tr><th>Timezone</th><td>This board follows <strong>${tz}</strong>.</td></tr>
      <tr><th>Reset</th><td>A new cover starts at <strong>00:00 ${tz}</strong>. Yesterday’s placements do not carry into today.</td></tr>
      <tr><th>Cover</th><td>The current #1 listing is today’s cover. If no placement is paid, the cover remains empty.</td></tr>
      <tr><th>Last 24 hours</th><td>The activity strip is a rolling view of recent paid listings. It is not a second cover and does not change today’s winner.</td></tr>
      <tr><th>Return tomorrow</th><td>A product that returns on a new day places a new full bid of at least $5.</td></tr>
    </tbody>
  </table>

  <h2>Clicks</h2>
  <ul>
    <li>Every listing shows a public click count beginning at 0.</li>
    <li>Outbound clicks go to the cleaned product link.</li>
    <li>Clicks never change rank.</li>
  </ul>
</article>`;
}

export function renderRulesPage(model: RulesViewModel): string {
  const tz = model.tz;
  const day = model.day ?? dayKey(new Date(), tz);
  return renderLayout({
    title: `Rules · ${SITE_TITLE}`,
    description:
      "Ranking, raises, product-link standards, daily reset, and payment confirmation. Rank is the bid; minimum $5.",
    active: "rules",
    day,
    tz,
    body: renderRulesBody(model),
  });
}

export const rulesRoutes: FastifyPluginAsync = async (app) => {
  app.get(RULES_PATH, async (_request, reply) => {
    const tz = boardTimeZone();
    const htmlPage = renderRulesPage({ tz, day: dayKey(app.now(), tz) });
    return reply.type("text/html; charset=utf-8").send(htmlPage);
  });
};
