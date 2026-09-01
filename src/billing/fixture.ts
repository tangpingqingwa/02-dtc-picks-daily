import { randomUUID } from "node:crypto";
import type {
  CheckoutDraft,
  CheckoutPort,
  CheckoutSession,
  PaidEvent,
  WebhookResult,
} from "./port.js";

export type FixtureCheckoutOptions = {
  /** Default true: createSession finishes paid so tests never need a provider host. */
  autoComplete?: boolean;
};

type StoredSession = CheckoutSession & { paidAt?: string };

export class FixtureCheckout implements CheckoutPort {
  readonly kind = "fixture" as const;
  readonly mode = "fixture" as const;
  readonly expectedProductId = "fixture";
  readonly expectedStoreId = "fixture";
  readonly expectedCurrency = "USD" as const;
  private readonly autoComplete: boolean;
  private readonly sessions = new Map<string, StoredSession>();

  constructor(options: FixtureCheckoutOptions = {}) {
    this.autoComplete = options.autoComplete !== false;
  }

  async createSession(draft: CheckoutDraft): Promise<CheckoutSession> {
    const id = `fix_${randomUUID()}`;
    const session: StoredSession = {
      id,
      status: "open",
      url: `/checkout/complete?session=${encodeURIComponent(id)}`,
      draft: { ...draft },
      amountUsd: draft.chargeUsd,
    };
    this.sessions.set(id, session);
    if (this.autoComplete) {
      await this.completeSession(id);
    }
    return { ...this.requireSession(id) };
  }

  getSession(id: string): CheckoutSession | undefined {
    const session = this.sessions.get(id);
    return session ? { ...session } : undefined;
  }

  async completeSession(id: string): Promise<PaidEvent> {
    const session = this.requireSession(id);
    if (session.status === "expired") {
      throw new Error("checkout session is abandoned");
    }
    if (session.status !== "complete") {
      session.status = "complete";
      session.paidAt = new Date().toISOString();
    }
    return paidEvent(session);
  }

  async abandonSession(id: string): Promise<void> {
    const session = this.requireSession(id);
    if (session.status === "complete") {
      return;
    }
    session.status = "expired";
  }

  async parseWebhook(rawBody: string, _headers: Record<string, string>): Promise<WebhookResult> {
    const event = parseJson(rawBody);
    if (!isRecord(event)) {
      return { ignored: true };
    }
    const data = isRecord(event.data) ? event.data : event;
    const status = typeof data.status === "string" ? data.status : "";
    const sessionId = typeof data.id === "string" ? data.id : "";
    if (!sessionId) {
      return { ignored: true };
    }
    if (status === "expired" || status === "failed" || status === "canceled") {
      if (this.sessions.has(sessionId)) {
        await this.abandonSession(sessionId);
      }
      return { ignored: true };
    }
    if (!isPaidStatus(status) && event.type !== "order.paid") {
      return { ignored: true };
    }
    // Recorded/provider metadata can never manufacture a local paid session.
    // Fixture happy paths must first call createSession, just like production
    // requires a durable local checkout intent before a webhook can apply.
    if (!this.sessions.has(sessionId)) {
      return { ignored: true };
    }
    return this.completeSession(sessionId);
  }

  private requireSession(id: string): StoredSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`unknown checkout session ${id}`);
    }
    return session;
  }
}

function paidEvent(session: StoredSession): PaidEvent {
  return {
    sessionId: session.id,
    draft: { ...session.draft },
    amountUsd: session.amountUsd,
    paidAt: session.paidAt ?? new Date().toISOString(),
  };
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
