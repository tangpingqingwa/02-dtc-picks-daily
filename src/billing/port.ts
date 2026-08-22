import { polarAccessToken, polarLiveEnabled } from "../config.js";
import { FixtureCheckout } from "./fixture.js";
import { PolarCheckout } from "./polar.js";

export type CheckoutDraft = {
  productUrl: string;
  whyTestThisToday: string;
  bidUsd: number;
  day: string;
  /** Dollars charged now: full bid on first list, difference on a raise. */
  chargeUsd: number;
};

export type CheckoutStatus = "open" | "complete" | "expired";

export type CheckoutSession = {
  id: string;
  status: CheckoutStatus;
  url: string;
  draft: CheckoutDraft;
  amountUsd: number;
};

export type PaidEvent = {
  sessionId: string;
  draft: CheckoutDraft;
  amountUsd: number;
  paidAt: string;
};

export type WebhookResult = PaidEvent | { ignored: true };

export type CheckoutPort = {
  readonly kind: "fixture" | "live";
  createSession(draft: CheckoutDraft): Promise<CheckoutSession>;
  getSession(id: string): CheckoutSession | undefined;
  completeSession(id: string): Promise<PaidEvent>;
  abandonSession(id: string): Promise<void>;
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult>;
};

export function createCheckoutPort(env: NodeJS.ProcessEnv = process.env): CheckoutPort {
  if (polarLiveEnabled(env)) {
    const token = polarAccessToken(env);
    if (!token) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
    return new PolarCheckout({ env });
  }
  return new FixtureCheckout();
}
