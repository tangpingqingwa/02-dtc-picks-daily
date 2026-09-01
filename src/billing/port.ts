import { paymentMode, type PaymentMode } from "../config.js";
import { FixtureCheckout } from "./fixture.js";
import { WaffoCheckout } from "./waffo.js";

export type CheckoutDraft = {
  productUrl: string;
  whyTestThisToday: string;
  bidUsd: number;
  day: string;
  /** Dollars charged now: full bid on first list, difference on a raise. */
  chargeUsd: number;
  /** Durable local intent identity/fingerprint, attached before provider I/O. */
  intentId?: string;
  intentFingerprint?: string;
  metadataFingerprint?: string;
  quoteBaseBidUsd?: number;
};

export type CheckoutStatus = "open" | "complete" | "expired";

export type CheckoutSession = {
  id: string;
  status: CheckoutStatus;
  url: string;
  draft: CheckoutDraft;
  amountUsd: number;
  expiresAt?: string;
};

export type PaidEvent = {
  sessionId: string;
  draft: CheckoutDraft;
  amountUsd: number;
  paidAt: string;
  provider?: "fixture" | "waffo" | "polar";
  deliveryId?: string;
  eventId?: string;
  paymentId?: string;
  orderId?: string;
  mode?: "test" | "prod";
  storeId?: string;
  productId?: string;
  currency?: string;
  subtotalCents?: number;
  /** Waffo tax amount in exact minor units; ranking never includes it. */
  taxCents?: number;
  amountCents?: number;
  totalCents?: number;
  /** The immutable intent fingerprint copied from Waffo order metadata. */
  intentFingerprint?: string;
  metadataFingerprint?: string;
  payloadHash?: string;
  /** Canonical signed business payload, excluding only Waffo delivery id. */
  normalizedFingerprint?: string;
  eventType?: string;
};

/** A signature-verified provider event that failed policy/shape validation. */
export type RejectedWebhook = {
  rejected: true;
  provider: "waffo";
  reason: string;
  payloadHash: string;
  normalizedFingerprint: string;
  deliveryId?: string;
  eventType?: string;
  eventId?: string;
  paymentId?: string;
  orderId?: string;
  intentId?: string;
  taxCents?: number;
};

export type WebhookResult = PaidEvent | RejectedWebhook | { ignored: true };

export type CheckoutPort = {
  readonly kind: "fixture" | "live";
  readonly mode?: PaymentMode;
  readonly expectedProductId?: string;
  readonly expectedStoreId?: string;
  readonly expectedCurrency?: "USD";
  createSession(draft: CheckoutDraft): Promise<CheckoutSession>;
  getSession(id: string): CheckoutSession | undefined;
  completeSession(id: string): Promise<PaidEvent>;
  abandonSession(id: string): Promise<void>;
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult>;
};

export function createCheckoutPort(env: NodeJS.ProcessEnv = process.env): CheckoutPort {
  const mode = paymentMode(env);
  if (mode === "fixture") return new FixtureCheckout();
  return new WaffoCheckout({ env, mode });
}
