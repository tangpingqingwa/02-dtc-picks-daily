import { createHmac, timingSafeEqual } from "node:crypto";
import {
  polarAccessToken,
  polarLiveEnabled,
  polarWebhookSecret,
  publicBaseUrl,
} from "../config.js";
import type {
  CheckoutDraft,
  CheckoutPort,
  CheckoutSession,
  PaidEvent,
  WebhookResult,
} from "./port.js";

/** Only used when POLAR_LIVE=1. tests/ never fetch this host. */
export const POLAR_API_BASE = "https://api.polar.sh";

export type PolarCheckoutOptions = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
};

type StoredSession = CheckoutSession & { paidAt?: string };

/** Live Polar Checkout. Never constructed unless POLAR_LIVE=1. */
export class PolarCheckout implements CheckoutPort {
  readonly kind = "live" as const;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchFn: typeof fetch;
  private readonly sessions = new Map<string, StoredSession>();

  constructor(options: PolarCheckoutOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchFn = options.fetch ?? fetch;
    if (!polarLiveEnabled(this.env)) {
      throw new Error("PolarCheckout requires POLAR_LIVE=1");
    }
    if (!polarAccessToken(this.env)) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
  }

  async createSession(draft: CheckoutDraft): Promise<CheckoutSession> {
    const token = this.requireToken();
    const response = await this.fetchFn(`${POLAR_API_BASE}/v1/checkouts/`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        amount: draft.bidUsd * 100,
        currency: "usd",
        success_url: `${publicBaseUrl(this.env)}/checkout/complete?session={CHECKOUT_ID}`,
        metadata: {
          productUrl: draft.productUrl,
          whyTestThisToday: draft.whyTestThisToday,
          bidUsd: String(draft.bidUsd),
          day: draft.day,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`polar checkout failed: ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const id = readString(payload.id);
    const url = readString(payload.url);
    if (!id || !url) {
      throw new Error("polar checkout response missing id/url");
    }
    const session: StoredSession = {
      id,
      status: "open",
      url,
      draft: { ...draft },
      amountUsd: draft.bidUsd,
    };
    this.sessions.set(id, session);
    return { ...session };
  }

  getSession(id: string): CheckoutSession | undefined {
    const session = this.sessions.get(id);
    return session ? { ...session } : undefined;
  }

  async completeSession(id: string): Promise<PaidEvent> {
    // Live listings appear only after a verified paid webhook.
    throw new Error(`live Polar session ${id} completes via webhook only`);
  }

  async abandonSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session && session.status !== "complete") {
      session.status = "expired";
    }
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult> {
    const secret = polarWebhookSecret(this.env);
    if (!secret) {
      throw new Error("BLOCKED-SECRET: POLAR_WEBHOOK_SECRET");
    }
    if (!verifyPolarSignature(rawBody, headers, secret)) {
      throw new Error("invalid Polar webhook signature");
    }
    const event = parseJson(rawBody);
    if (!isRecord(event)) {
      return { ignored: true };
    }
    const data = isRecord(event.data) ? event.data : event;
    const status = readString(data.status) ?? "";
    const sessionId = readString(data.id);
    if (!sessionId) {
      return { ignored: true };
    }
    if (status === "expired" || status === "failed" || status === "canceled") {
      await this.abandonSession(sessionId);
      return { ignored: true };
    }
    if (!isPaidStatus(status) && event.type !== "order.paid") {
      return { ignored: true };
    }
    const existing = this.sessions.get(sessionId);
    const draft = existing?.draft ?? draftFromMetadata(data);
    if (!draft) {
      return { ignored: true };
    }
    const paidAt = new Date().toISOString();
    this.sessions.set(sessionId, {
      id: sessionId,
      status: "complete",
      url: existing?.url ?? "",
      draft,
      amountUsd: draft.bidUsd,
      paidAt,
    });
    return {
      sessionId,
      draft,
      amountUsd: draft.bidUsd,
      paidAt,
    };
  }

  private requireToken(): string {
    const token = polarAccessToken(this.env);
    if (!token) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
    return token;
  }
}

export function verifyPolarSignature(
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const id = header(headers, "webhook-id");
  const timestamp = header(headers, "webhook-timestamp");
  const signature = header(headers, "webhook-signature");
  if (!id || !timestamp || !signature) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  for (const part of signature.split(" ")) {
    const value = part.startsWith("v1,") ? part.slice(3) : part;
    if (safeEqual(value, expected)) {
      return true;
    }
  }
  return false;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === needle && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isPaidStatus(status: string): boolean {
  return status === "succeeded" || status === "paid" || status === "confirmed" || status === "complete";
}

function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function draftFromMetadata(data: Record<string, unknown>): CheckoutDraft | undefined {
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const productUrl = readString(metadata.productUrl);
  const whyTestThisToday = readString(metadata.whyTestThisToday);
  const bidUsd = readInt(metadata.bidUsd);
  const day = readString(metadata.day);
  if (!productUrl || !whyTestThisToday || bidUsd === undefined || !day) {
    return undefined;
  }
  return { productUrl, whyTestThisToday, bidUsd, day };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}
