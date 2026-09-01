import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { CheckoutDraft, PaidEvent } from "../billing/port.js";
import {
  WaffoCheckoutRejectedError,
  WaffoCheckoutUnknownError,
} from "../billing/waffo-session.js";
import {
  applyPaidBid,
  attachCheckoutReservation,
  CheckoutReservationConflictError,
  findPaymentIntent,
  MIN_BID_USD,
  markCheckoutProviderRejected,
  markCheckoutProviderUnknown,
  PaidBidConflictError,
  releaseCheckoutReservation,
  reserveCheckout,
} from "../core/board.js";
import { boardTimeZone, dayKey } from "../core/day.js";
import { canonicalizeProductUrl, normalizeWhyTestThisToday, UrlError } from "../core/urls.js";
import { html } from "../views/html.js";
import { renderLayout, SITE_TITLE } from "../views/layout.js";

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
  return Number.isSafeInteger(bid) && bid <= Math.floor(Number.MAX_SAFE_INTEGER / 100) && bid >= MIN_BID_USD
    ? bid
    : undefined;
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
    const now = app.now();
    const day = dayKey(now, boardTimeZone());
    let draft: CheckoutDraft;
    let reservation: ReturnType<typeof reserveCheckout>;
    try {
      draft = parseCheckoutForm(request.body, day);
      reservation = reserveCheckout(app.db, {
        productUrl: draft.productUrl,
        bidUsd: draft.bidUsd,
        day,
        whyTestThisToday: draft.whyTestThisToday,
        expectedMode: app.checkout.mode ?? "fixture",
        expectedStoreId: app.checkout.expectedStoreId ?? "fixture",
        expectedProductId: app.checkout.expectedProductId ?? "fixture",
        expectedCurrency: app.checkout.expectedCurrency ?? "USD",
        expectedTaxCategory: "digital_goods",
        now,
      });
      draft = {
        ...draft,
        chargeUsd: reservation.chargeUsd,
        intentId: reservation.id,
        intentFingerprint: reservation.intentFingerprint,
        metadataFingerprint: reservation.metadataFingerprint,
        quoteBaseBidUsd: reservation.quoteBaseBidUsd,
      };
    } catch (error) {
      return formError(reply, error);
    }
    let session;
    try {
      session = await app.checkout.createSession(draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : "checkout provider failed";
      if (error instanceof WaffoCheckoutRejectedError) {
        markCheckoutProviderRejected(app.db, reservation.id, message);
        return reply.status(502).type("text/plain; charset=utf-8").send(message);
      }
      if (error instanceof WaffoCheckoutUnknownError || app.checkout.kind === "live") {
        // A timeout/reset/5xx may follow a provider-side acceptance. Keep the
        // local intent recoverable so a later signed event can settle it.
        markCheckoutProviderUnknown(app.db, reservation.id, message);
        return unknownCheckoutResponse(reply, reservation.id, message);
      }
      releaseCheckoutReservation(app.db, reservation.id);
      throw error;
    }
    try {
      attachCheckoutReservation(app.db, reservation.id, session.id, {
        checkoutUrl: session.url,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      // The provider accepted a payment-session request but local attachment
      // failed. This is recoverable, not a reason to release the reservation.
      markCheckoutProviderUnknown(
        app.db,
        reservation.id,
        error instanceof Error ? error.message : "checkout attachment failed",
      );
      return unknownCheckoutResponse(reply, reservation.id, "checkout attachment is recoverable");
    }
    if (session.status === "complete") {
      let paid: PaidEvent;
      try {
        paid = await app.checkout.completeSession(session.id);
      } catch {
        if (app.checkout.getSession(session.id)?.status === "expired") {
          releaseCheckoutReservation(app.db, reservation.id);
        }
        return reply.redirect("/", 303);
      }
      try {
        applyPaid(app, paid);
      } catch (error) {
        if (error instanceof PaidBidConflictError) {
          return paymentConflict(reply, error);
        }
        throw error;
      }
      return reply.redirect("/", 303);
    }
    return reply.redirect(session.url, 303);
  });

  app.get(CHECKOUT_COMPLETE_PATH, async (request, reply) => {
    const query = request.query as { session?: string; intent?: string };
    if (app.checkout.kind === "live") {
      // A browser return is never evidence of payment. Show only the local,
      // durable intent state (and no provider error or untrusted identifier).
      const rawIntent = typeof query.intent === "string" ? query.intent.trim() : "";
      const intent = isLocalIntentId(rawIntent) ? findPaymentIntent(app.db, rawIntent) : undefined;
      const tz = boardTimeZone();
      return reply
        .type("text/html; charset=utf-8")
        .send(renderCheckoutStatusPage(intent, dayKey(app.now(), tz), tz));
    }
    const sessionId =
      typeof query.session === "string"
        ? query.session
        : typeof query.intent === "string"
          ? query.intent
          : "";
    if (!sessionId) {
      return reply.redirect("/", 303);
    }
    let paid: PaidEvent;
    try {
      paid = await app.checkout.completeSession(sessionId);
    } catch {
      // Live Waffo writes the listing only after a verified paid webhook.
      return reply.redirect("/", 303);
    }
    try {
      applyPaid(app, paid);
    } catch (error) {
      if (error instanceof PaidBidConflictError) {
        return paymentConflict(reply, error);
      }
      throw error;
    }
    return reply.redirect("/", 303);
  });
};

type ReadOnlyIntent = { state: string };

/** Render local payment state without allowing a return URL to mutate it. */
export function renderCheckoutStatusPage(
  intent: ReadOnlyIntent | undefined,
  day: string,
  tz: string,
): string {
  const copy = statusCopy(intent?.state);
  return renderLayout({
    title: `Checkout status · ${SITE_TITLE}`,
    description: "Checkout status. Rank changes only after payment is confirmed.",
    active: "leaderboard",
    day,
    tz,
    body: html`<article class="doc" data-page="checkout-status">
  <h1>${copy.heading}</h1>
  <p>${copy.message}</p>
  <p><a href="/">Return to today’s cover</a></p>
</article>`,
  });
}

function statusCopy(state: string | undefined): { heading: string; message: string } {
  switch (state) {
    case "paid":
      return {
        heading: "Payment received",
        message: "A verified payment is recorded. This read-only page never changes the board.",
      };
    case "needs_reconciliation":
      return {
        heading: "Payment needs reconciliation",
        message: "The captured payment needs review before it can affect a rank. No ranking was applied here.",
      };
    case "unknown":
      return {
        heading: "Payment confirmation is pending",
        message: "Confirmation is still in progress. Keep your receipt and check the board again shortly.",
      };
    case "rejected":
      return {
        heading: "Checkout was rejected",
        message: "No ranking was applied. Start a new checkout only after confirming the previous attempt was not captured.",
      };
    case "released":
      return {
        heading: "Checkout expired",
        message: "This checkout was released before a verified completion. No ranking was applied.",
      };
    case "creating":
    case "open":
      return {
        heading: "Payment is pending",
        message: "Payment has not been confirmed yet. The listing will appear only after confirmation.",
      };
    default:
      return {
        heading: "Payment status unavailable",
        message: "That checkout could not be found locally. No payment or ranking was changed.",
      };
  }
}

function isLocalIntentId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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
  const status =
    error instanceof CheckoutFormError
      ? error.statusCode
      : error instanceof CheckoutReservationConflictError
        ? 409
        : 400;
  return reply.status(status).type("text/plain; charset=utf-8").send(message);
}

function paymentConflict(reply: FastifyReply, error: PaidBidConflictError): FastifyReply {
  return reply.status(409).type("text/plain; charset=utf-8").send(error.message);
}

function unknownCheckoutResponse(reply: FastifyReply, intentId: string, message: string): FastifyReply {
  return reply.status(503).type("application/json; charset=utf-8").send({
    error: message,
    status: "unknown",
    recoveryUrl: `${CHECKOUT_COMPLETE_PATH}?intent=${encodeURIComponent(intentId)}`,
  });
}
