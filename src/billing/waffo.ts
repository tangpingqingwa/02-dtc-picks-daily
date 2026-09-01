import { createHash } from "node:crypto";
import {
  paymentMode,
  publicBaseUrl,
  waffoProductId,
  waffoStoreId,
} from "../config.js";
import type {
  CheckoutDraft,
  CheckoutPort,
  CheckoutSession,
  PaidEvent,
  RejectedWebhook,
  WebhookResult,
} from "./port.js";
import {
  createWaffoCheckoutSession,
  createWaffoClient,
  displayStringToCents,
  requireWaffoLiveSecrets,
  verifyWaffoWebhook,
  type WaffoEnv,
  type WaffoMode,
  type WaffoVerifiedEvent,
  WaffoCheckoutRejectedError,
  WaffoCheckoutUnknownError,
  DEFAULT_WAFFO_CHECKOUT_TIMEOUT_MS,
} from "./waffo-session.js";

type StoredSession = CheckoutSession & { paidAt?: string };

/** Official Waffo Pancake checkout port. Polar is not selected here. */
export class WaffoCheckout implements CheckoutPort {
  readonly kind = "live" as const;
  readonly mode: WaffoMode;
  readonly expectedProductId: string;
  readonly expectedStoreId: string;
  readonly expectedCurrency = "USD" as const;
  private readonly env: WaffoEnv;
  private readonly sessions = new Map<string, StoredSession>();

  constructor(
    options: {
      env?: WaffoEnv;
      mode?: WaffoMode;
      fetch?: typeof fetch;
      timeoutMs?: number;
    } = {},
  ) {
    this.env = options.env ?? process.env;
    const envMode = configuredWaffoMode(this.env);
    const configuredMode = options.mode ?? envMode;
    if (configuredMode !== envMode) {
      throw new Error("BLOCKED-CONFIG: Waffo provider mode does not match PAYMENT_MODE");
    }
    this.mode = configuredMode;
    this.expectedProductId = waffoProductId(this.env) ?? "";
    this.expectedStoreId = waffoStoreId(this.env) ?? "";
    if (configuredMode !== "waffo-test" && configuredMode !== "waffo-prod") {
      throw new Error("WaffoCheckout requires PAYMENT_MODE=waffo-test or waffo-prod");
    }
    // Validate the complete live boundary before this port can serve traffic.
    // The webhook key is as mandatory as the checkout credentials because a
    // live process must never accept an un-verifiable settlement path.
    requireWaffoLiveSecrets(this.env, this.mode);
    // Constructing the official client also parses the RSA private key. This
    // keeps malformed credentials a startup/configuration failure rather than
    // discovering them after a customer has submitted a bid.
    createWaffoClient({ env: this.env, mode: this.mode, fetch: options.fetch });
    this.fetchFn = options.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_WAFFO_CHECKOUT_TIMEOUT_MS;
  }

  private readonly fetchFn?: typeof fetch;
  private readonly timeoutMs: number;

  async createSession(draft: CheckoutDraft): Promise<CheckoutSession> {
    if (
      !Number.isSafeInteger(draft.bidUsd) ||
      draft.bidUsd < 5 ||
      draft.bidUsd > Math.floor(Number.MAX_SAFE_INTEGER / 100) ||
      !Number.isSafeInteger(draft.chargeUsd) ||
      draft.chargeUsd < 0 ||
      draft.chargeUsd > Math.floor(Number.MAX_SAFE_INTEGER / 100)
    ) {
      throw new WaffoCheckoutRejectedError("checkout bid and charge must be safe whole-dollar values");
    }
    const intentId = draft.intentId?.trim();
    const intentFingerprint = draft.intentFingerprint?.trim();
    const metadataFingerprint = draft.metadataFingerprint?.trim();
    if (!intentId || !intentFingerprint || !metadataFingerprint) {
      throw new WaffoCheckoutRejectedError(
        "a durable local intent id and fingerprints are required before provider I/O",
      );
    }
    const metadata = {
      intentId,
      intentFingerprint,
      metadataFingerprint,
      targetBidCents: String(draft.bidUsd * 100),
      chargeCents: String(draft.chargeUsd * 100),
      canonicalUrl: draft.productUrl,
      productUrl: draft.productUrl,
      whyTestThisToday: draft.whyTestThisToday,
      bidUsd: String(draft.bidUsd),
      chargeUsd: String(draft.chargeUsd),
      day: draft.day,
      quoteBaseBidCents: String((draft.quoteBaseBidUsd ?? 0) * 100),
      mode: this.mode,
      storeId: this.expectedStoreId,
      productId: this.expectedProductId,
      currency: "USD",
      taxCategory: "digital_goods",
    };
    const started = await createWaffoCheckoutSession({
      env: this.env,
      mode: this.mode,
      fetch: this.fetchFn,
      timeoutMs: this.timeoutMs,
      chargeCents: draft.chargeUsd * 100,
      successUrl: `${publicBaseUrl(this.env)}/checkout/complete?intent=${encodeURIComponent(intentId)}`,
      intentId,
      intentFingerprint,
      metadata,
    });
    const session: StoredSession = {
      id: started.checkoutId,
      status: "open",
      url: started.url,
      draft: { ...draft },
      amountUsd: draft.chargeUsd,
      expiresAt: started.expiresAt,
    };
    this.sessions.set(started.checkoutId, session);
    return { ...session };
  }

  getSession(id: string): CheckoutSession | undefined {
    const session = this.sessions.get(id);
    return session ? { ...session } : undefined;
  }

  async completeSession(id: string): Promise<PaidEvent> {
    // Live listings are written only by the verified webhook path.
    throw new Error(`live Waffo session ${id} completes via webhook only`);
  }

  async abandonSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session && session.status !== "complete") session.status = "expired";
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult> {
    const signature = header(headers, "x-waffo-signature");
    const event = verifyWaffoWebhook(rawBody, signature, this.env, this.mode);
    const eventType = readString(event.eventType);
    if (eventType !== "order.completed") {
      return rejectedWebhookFromEvent(
        rawBody,
        event,
        eventType ?? "unknown",
        new Error("WAFFO_WEBHOOK_REJECTED: only order.completed may settle a listing"),
      );
    }
    try {
      return this.parseVerifiedWebhook(rawBody, event, eventType);
    } catch (error) {
      // Signature verification has already succeeded. Preserve the signed
      // bytes and any safely recoverable identity so policy/shape failures are
      // durable and cannot later be corrected under the same delivery ID.
      return rejectedWebhookFromEvent(rawBody, event, eventType, error);
    }
  }

  private parseVerifiedWebhook(
    rawBody: string,
    event: WaffoVerifiedEvent,
    eventType: string,
  ): PaidEvent {
    const data = isRecord(event.data) ? event.data : {};
    const orderId = readString(data.orderId);
    const paymentId = readString(data.paymentId);
    const eventId = readString(event.eventId);
    const intentId = readString(data.orderMerchantExternalId);
    const metadata = isRecord(data.orderMetadata) ? stringMetadata(data.orderMetadata) : undefined;
    const fingerprint = metadata?.intentFingerprint;
    const metadataFingerprint = metadata?.metadataFingerprint;
    const productMetadata = isRecord(data.productMetadata) ? data.productMetadata : undefined;
    const productMetadataId = productMetadata ? readString(productMetadata.productId) : undefined;
    const metadataProductId = readString(metadata?.productId);
    const productId = productMetadataId;
    const storeId = readString(event.storeId);
    const mode = event.mode;
    const currency = readString(data.currency);
    const orderStatus = readString(data.orderStatus);
    const paymentStatus = readString(data.paymentStatus);
    const deliveryId = readString(event.id);
    if (
      !deliveryId ||
      !orderId ||
      !paymentId ||
      !eventId ||
      !intentId ||
      !metadata ||
      !fingerprint ||
      !metadataFingerprint
    ) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: order identity or intent metadata is missing");
    }
    if (eventId !== paymentId) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: event id must equal payment id");
    }
    if (metadata.intentId !== intentId) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: external intent id does not match metadata");
    }
    if (mode !== "test" && mode !== "prod") {
      throw new Error("WAFFO_WEBHOOK_REJECTED: event mode is invalid");
    }
    if (orderStatus !== "completed" || paymentStatus !== "succeeded") {
      throw new Error("WAFFO_WEBHOOK_REJECTED: order/payment is not completed and succeeded");
    }
    if (currency !== "USD") {
      throw new Error("WAFFO_WEBHOOK_REJECTED: order currency must be USD");
    }
    if (!productMetadataId || !metadataProductId || metadataProductId !== productMetadataId) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: provider product binding is missing or inconsistent");
    }
    if (
      metadata.mode !== `waffo-${mode}` ||
      metadata.storeId !== storeId ||
      metadata.currency !== "USD" ||
      metadata.taxCategory !== "digital_goods"
    ) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: order metadata provider binding does not match");
    }
    const amountCents = requiredDisplayAmount(data, "amount");
    const rawSubtotalCents = optionalDisplayAmount(data, "subtotal");
    const rawTotalCents = optionalDisplayAmount(data, "total");
    const taxCents = requiredDisplayAmount(data, "taxAmount");
    if (amountCents === undefined || taxCents === undefined || taxCents < 0) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: order amounts must be decimal strings");
    }
    const targetBidCents = decimalMetadataInt(metadata.targetBidCents);
    const chargeCents = decimalMetadataInt(metadata.chargeCents);
    if (targetBidCents === undefined || chargeCents === undefined) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: metadata amount does not match the order");
    }
    const subtotalCents = rawSubtotalCents ?? amountCents;
    const expectedTotalCents = subtotalCents + taxCents;
    if (!Number.isSafeInteger(expectedTotalCents)) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: order total is outside the safe cents range");
    }
    const totalCents = rawTotalCents ?? expectedTotalCents;
    if (rawSubtotalCents !== undefined) {
      if (rawSubtotalCents !== chargeCents) {
        throw new Error("WAFFO_WEBHOOK_REJECTED: subtotal does not match the intent charge");
      }
      if (rawTotalCents !== undefined && rawTotalCents !== expectedTotalCents) {
        throw new Error("WAFFO_WEBHOOK_REJECTED: total does not match subtotal plus tax");
      }
      // Waffo has emitted both tax-exclusive amount=subtotal and
      // buyer-facing amount=total shapes. Both are safe only when they agree
      // with the exact subtotal/total equation; the rank remains subtotal.
      if (amountCents !== rawSubtotalCents && amountCents !== totalCents) {
        throw new Error("WAFFO_WEBHOOK_REJECTED: amount is inconsistent with subtotal/total");
      }
    } else if (
      taxCents !== 0 ||
      amountCents !== chargeCents ||
      (rawTotalCents !== undefined && totalCents !== amountCents)
    ) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: amount must equal a tax-free intent charge");
    }
    const productUrl = readString(metadata.canonicalUrl);
    const metadataProductUrl = readString(metadata.productUrl);
    const whyTestThisToday = readString(metadata.whyTestThisToday);
    const day = readString(metadata.day);
    const bidCents = decimalMetadataInt(metadata.bidUsd, true);
    const chargeUsdCents = decimalMetadataInt(metadata.chargeUsd, true);
    const quoteBaseBidCents = decimalMetadataInt(metadata.quoteBaseBidCents);
    if (
      !productUrl ||
      !metadataProductUrl ||
      metadataProductUrl !== productUrl ||
      !whyTestThisToday ||
      !day ||
      bidCents === undefined ||
      chargeUsdCents === undefined ||
      quoteBaseBidCents === undefined ||
      bidCents !== targetBidCents ||
      chargeUsdCents !== chargeCents
    ) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: normalized intent metadata is incomplete");
    }
    const paidAt = validTimestamp(event.timestamp);
    if (!paidAt) {
      throw new Error("WAFFO_WEBHOOK_REJECTED: provider event timestamp is invalid");
    }
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    return {
      sessionId: intentId,
      draft: {
        productUrl,
        whyTestThisToday,
        bidUsd: bidCents / 100,
        day,
        chargeUsd: chargeCents / 100,
        intentId,
        intentFingerprint: fingerprint,
        quoteBaseBidUsd: quoteBaseBidCents / 100,
      },
      amountUsd: subtotalCents / 100,
      paidAt,
      provider: "waffo",
      deliveryId,
      eventId,
      paymentId,
      orderId,
      mode,
      storeId,
      productId,
      currency,
      subtotalCents,
      amountCents,
      totalCents,
      taxCents,
      intentFingerprint: fingerprint,
      metadataFingerprint,
      payloadHash,
      normalizedFingerprint: normalizedWaffoPayloadFingerprint(event),
      eventType,
    };
  }
}

function requiredDisplayAmount(data: Record<string, unknown>, key: string): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, key)) {
    return undefined;
  }
  return displayStringToCents(data[key]);
}

function optionalDisplayAmount(data: Record<string, unknown>, key: string): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, key)) {
    return undefined;
  }
  const parsed = displayStringToCents(data[key]);
  if (parsed === undefined) {
    throw new Error(`WAFFO_WEBHOOK_REJECTED: ${key} must be a decimal string when present`);
  }
  return parsed;
}

/**
 * Canonicalize the complete verified provider payload while excluding only
 * Waffo's delivery record ID. The resulting value makes a fresh delivery of
 * the same business event replay-safe without allowing any other signed field
 * to change silently.
 */
function normalizedWaffoPayloadFingerprint(event: WaffoVerifiedEvent): string {
  const businessPayload: Record<string, unknown> = { ...event };
  delete businessPayload.id;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(businessPayload)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function configuredWaffoMode(env: WaffoEnv): WaffoMode {
  const mode = paymentMode(env as NodeJS.ProcessEnv);
  if (mode === "waffo-test" || mode === "waffo-prod") return mode;
  throw new Error("BLOCKED-CONFIG: Waffo provider mode is required");
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === needle && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function stringMetadata(value: Record<string, unknown>): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") return undefined;
    result[key] = item;
  }
  return result;
}

function decimalMetadataInt(value: string | undefined, dollar = false): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return undefined;
  return dollar ? parsed * 100 : parsed;
}

function validTimestamp(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) return undefined;
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Waffo webhook rejected";
}

function rejectedWebhookFromEvent(
  rawBody: string,
  event: WaffoVerifiedEvent,
  eventType: string,
  error: unknown,
): RejectedWebhook {
  const data = isRecord(event.data) ? event.data : {};
  const taxValue = Object.prototype.hasOwnProperty.call(data, "taxAmount")
    ? displayStringToCents(data.taxAmount)
    : 0;
  return {
    rejected: true,
    provider: "waffo",
    reason: errorMessage(error).slice(0, 500),
    payloadHash: createHash("sha256").update(rawBody).digest("hex"),
    normalizedFingerprint: normalizedWaffoPayloadFingerprint(event),
    deliveryId: readString(event.id),
    eventType,
    eventId: readString(event.eventId),
    paymentId: readString(data.paymentId),
    orderId: readString(data.orderId),
    intentId: readString(data.orderMerchantExternalId),
    taxCents: taxValue,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
