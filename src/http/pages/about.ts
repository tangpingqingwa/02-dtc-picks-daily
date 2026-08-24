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
    This is a daily public auction for the cover of a DTC / Shopify / Amazon picks brief.
    Suppliers and tools bid whole US dollars so their product URL sits at the top of this
    morning’s list. Sellers see your link first.
  </p>
  <p>
    <strong>No ads. No API keys. No revenue share</strong> with listed products.
    There is no developer platform, no sponsorship package, and no cut to the listed URL.
  </p>
  <p>
    <strong>Rank is the bid.</strong> Nothing else. No recency boost, no editorial score,
    no invented ratings. Paying less than today’s #1 still lists at whatever rank that
    bid can take. Equal bids: the older listing keeps the higher rank.
  </p>
  <p>
    Bids are whole-dollar <strong>USD</strong>. Minimum <strong>$5</strong>. Step $1.
    The same product URL on the same day can raise; the raiser pays only the
    <strong>difference</strong>. Global sellers. English copy. USD only.
  </p>
  <p>
    The cover resets daily at <strong>00:00</strong> in
    <code>BOARD_TZ</code> (default <strong>UTC</strong>). Right now this board uses
    <strong>${tz}</strong>. Yesterday’s listings leave the cover. Raising yesterday’s
    URL today is a new listing and pays a full bid of at least $5.
    A last-24-hours strip on the desk is a <strong>rolling</strong> window, not that
    midnight reset. An empty strip is honest. It is not a second cover. A quiet
    morning invents no #1 on the cover or the strip.
  </p>
  <p>
    Anyone can read the board without an account. Payment is the only write path.
    Live money is Polar Checkout. Tests and CI use a fixture so they never call live Polar.
    Failed or abandoned checkout changes nothing.
  </p>
  <p>
    We strip tracking and affiliate query strings before we store a URL or send a click.
    Chat and invite links and NSFW are banned. Public click counts start at 0 and do not
    change rank.
  </p>
  <p>
    Clone of the <a href="https://outbid.lol">outbid.lol</a> pay-to-rank board for the
    <strong>dtc-picks-daily</strong> vertical — $5 floor, product URL plus one line:
    why test this today.
  </p>
</article>`;
}

export function renderAboutPage(model: AboutViewModel): string {
  const tz = model.tz;
  const day = model.day ?? dayKey(new Date(), tz);
  return renderLayout({
    title: `About · ${SITE_TITLE}`,
    description:
      "Daily public auction for this morning’s DTC / Shopify / Amazon picks cover. No ads, no API keys, no revenue share. Rank is the bid.",
    active: "about",
    day,
    tz,
    body: renderAboutBody(model),
  });
}

export const aboutRoutes: FastifyPluginAsync = async (app) => {
  app.get(ABOUT_PATH, async (_request, reply) => {
    const tz = boardTimeZone();
    const htmlPage = renderAboutPage({ tz, day: dayKey(new Date(), tz) });
    return reply.type("text/html; charset=utf-8").send(htmlPage);
  });
};
