import type { CheckoutDraft, CheckoutPort, CheckoutSession, PaidEvent, WebhookResult } from "./port.js";

/**
 * Retained only as a source-compatible marker for old local imports. Polar is
 * not a provider adapter and has no runtime route or settlement path.
 */
export const POLAR_API_BASE = "https://api.polar.sh";

export function polarApiBase(_env: NodeJS.ProcessEnv = process.env): string {
  return POLAR_API_BASE;
}

export function polarLiveEnabled(_env: NodeJS.ProcessEnv = process.env): boolean {
  return false;
}

export class PolarCheckout implements CheckoutPort {
  readonly kind = "live" as const;

  constructor(_options: Record<string, unknown> = {}) {
    throw new Error("BLOCKED-CONFIG: Polar provider is retired; use Waffo");
  }

  createSession(_draft: CheckoutDraft): Promise<CheckoutSession> {
    return Promise.reject(new Error("BLOCKED-CONFIG: Polar provider is retired; use Waffo"));
  }

  getSession(_id: string): CheckoutSession | undefined {
    return undefined;
  }

  completeSession(_id: string): Promise<PaidEvent> {
    return Promise.reject(new Error("BLOCKED-CONFIG: Polar provider is retired; use Waffo"));
  }

  abandonSession(_id: string): Promise<void> {
    return Promise.resolve();
  }

  parseWebhook(_rawBody: string, _headers: Record<string, string>): Promise<WebhookResult> {
    return Promise.reject(new Error("BLOCKED-CONFIG: Polar provider is retired; use Waffo"));
  }
}
