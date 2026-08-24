import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { CheckoutDraft, PaidEvent } from "../billing/port.js";
import {
  applyPaidBid,
  findPaidListingByDayAndUrl,
  MIN_BID_USD,
  quotePaidBid,
} from "../core/board.js";
import { boardTimeZone, dayKey } from "../core/day.js";
import { canonicalizeProductUrl, normalizeWhyTestThisToday, UrlError } from "../core/urls.js";

export const CHECKOUT_PATH = "/checkout" as const;
export const CHECKOUT_COMPLETE_PATH = "/checkout/complete" as const;

type CheckoutForm = {
  productUrl?: unknown;
  whyTestThisToday?: unknown;
  bidUsd?: unknown;
};

export class CheckoutFormError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "CheckoutFormError";
  }
}

export function parseCheckoutForm(body: unknown, day: string): CheckoutDraft {
  const form = (body ?? {}) as CheckoutForm;
  const rawUrl = typeof form.productUrl === "string" ? form.productUrl.trim() : "";
  const rawWhy =
    typeof form.whyTestThisToday === "string" ? form.whyTestThisToday.trim() : "";
  const bidUsd = parseBidUsd(form.bidUsd);

  if (!rawUrl) {
    throw new CheckoutFormError("product URL is required");
  }
  let productUrl: string;
  try {
    productUrl = canonicalizeProductUrl(rawUrl);
  } catch (error) {
    throw checkoutUrlError(error);
  }
  let whyTestThisToday: string;
  try {
    whyTestThisToday = normalizeWhyTestThisToday(rawWhy);
  } catch (error) {
    throw checkoutUrlError(error);
  }
  if (bidUsd === undefined) {
    throw new CheckoutFormError(`bid must be a whole dollar >= ${MIN_BID_USD}`);
  }
  return { productUrl, whyTestThisToday, bidUsd, day, chargeUsd: bidUsd };
}

export function parseBidUsd(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw >= MIN_BID_USD ? raw : undefined;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim().replace(/^\$/, "");
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const bid = Number(trimmed);
  return bid >= MIN_BID_USD ? bid : undefined;
}

export const checkoutRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      const raw = typeof body === "string" ? body : body.toString("utf8");
      done(null, Object.fromEntries(new URLSearchParams(raw)));
    },
  );

  app.post(CHECKOUT_PATH, async (request, reply) => {
    const day = dayKey(new Date(), boardTimeZone());
    let draft: CheckoutDraft;
    try {
      draft = parseCheckoutForm(request.body, day);
      const existing = findPaidListingByDayAndUrl(app.db, day, draft.productUrl);
      draft = { ...draft, chargeUsd: quotePaidBid(existing, draft.bidUsd).chargeUsd };
    } catch (error) {
      return formError(reply, error);
    }
    const session = await app.checkout.createSession(draft);
    if (session.status === "complete") {
      const paid = await app.checkout.completeSession(session.id);
      applyPaid(app, paid);
      return reply.redirect("/", 303);
    }
    return reply.redirect(session.url, 303);
  });

  app.get(CHECKOUT_COMPLETE_PATH, async (request, reply) => {
    const query = request.query as { session?: string };
    const sessionId = typeof query.session === "string" ? query.session : "";
    if (!sessionId) {
      return reply.redirect("/", 303);
    }
    try {
      const paid = await app.checkout.completeSession(sessionId);
      applyPaid(app, paid);
    } catch {
      // Live Polar writes the listing only after a verified paid webhook.
    }
    return reply.redirect("/", 303);
  });
};

function applyPaid(
  app: { db: import("../db.js").AppDb },
  paid: PaidEvent,
): void {
  applyPaidBid(app.db, {
    sessionId: paid.sessionId,
    productUrl: paid.draft.productUrl,
    whyTestThisToday: paid.draft.whyTestThisToday,
    bidUsd: paid.draft.bidUsd,
    day: paid.draft.day,
    paidUsd: paid.amountUsd,
    paidAt: paid.paidAt,
  });
}

function checkoutUrlError(error: unknown): CheckoutFormError {
  const message =
    error instanceof UrlError || error instanceof Error ? error.message : "invalid product URL";
  return new CheckoutFormError(message);
}

function formError(reply: FastifyReply, error: unknown): FastifyReply {
  const message = error instanceof Error ? error.message : "invalid checkout";
  const status = error instanceof CheckoutFormError ? error.statusCode : 400;
  return reply.status(status).type("text/plain; charset=utf-8").send(message);
}
