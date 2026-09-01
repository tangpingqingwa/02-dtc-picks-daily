import type { FastifyPluginAsync } from "fastify";
import { boardTimeZone, dayKey } from "../../core/day.js";
import { escapeHtml, html } from "../../views/html.js";
import { renderLayout, SITE_TITLE } from "../../views/layout.js";

export const ABOUT_PATH = "/about" as const;

export type AboutViewModel = {
  tz: string;
  day?: string;
};

export function renderAboutBody(model: AboutViewModel): string {
  const tz = escapeHtml(model.tz);
  return html`<article class="doc" data-page="about">
  <h1>About</h1>
  <p>
    DTC Picks Daily is a public auction for the cover of a daily product-discovery brief.
    Suppliers and tools bid whole US dollars so their product link appears at the top of
    this morning’s list.
  </p>
  <p>
    This is a <strong>transparent paid-placement board</strong> for product links.
    There are no hidden ranking factors, editorial boosts, or revenue-share claims.
  </p>
  <p>
    <strong>Rank is the bid.</strong> Nothing else. No recency boost, no editorial score,
    and no invented ratings. A bid below today’s #1 still appears at the rank it can take.
    When bids are equal, the listing placed first stays higher.
  </p>
  <p>
    Bids are whole-dollar <strong>USD</strong>. Minimum <strong>$5</strong>. Step $1.
    The same product link can raise during the same day; the payer is charged only the
    <strong>difference</strong> between the current and new bid.
  </p>
  <p>
    The cover resets at <strong>00:00 ${tz}</strong>. Yesterday’s listings leave today’s
    cover, so returning products place a new full bid. The separate last-24-hours strip
    is a rolling activity view, not a second cover. If nobody has paid for a placement,
    the board remains empty.
  </p>
  <p>
    Anyone can read the board without an account. A product appears only after payment
    is confirmed. Failed, canceled, or abandoned checkout changes nothing.
  </p>
  <p>
    We remove tracking and affiliate parameters before we store a URL or send a click.
    Chat invitations and adult content are not accepted. Public click counts begin at 0
    and never affect rank.
  </p>
</article>`;
}

export function renderAboutPage(model: AboutViewModel): string {
  const tz = model.tz;
  const day = model.day ?? dayKey(new Date(), tz);
  return renderLayout({
    title: `About · ${SITE_TITLE}`,
    description:
      "Daily public auction for this morning’s product-discovery cover. Rank is the bid.",
    active: "about",
    day,
    tz,
    body: renderAboutBody(model),
  });
}

export const aboutRoutes: FastifyPluginAsync = async (app) => {
  app.get(ABOUT_PATH, async (_request, reply) => {
    const tz = boardTimeZone();
    const htmlPage = renderAboutPage({ tz, day: dayKey(app.now(), tz) });
    return reply.type("text/html; charset=utf-8").send(htmlPage);
  });
};
