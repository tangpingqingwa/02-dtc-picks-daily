import {
  WaffoPancake,
  WaffoPancakeError,
  verifyWebhook,
  TaxCategory,
  type WebhookEvent,
} from "@waffo/pancake-ts";
import {
  paymentMode,
  waffoEnvironment,
  waffoMerchantId,
  waffoPrivateKeyFile,
  waffoPrivateKeyValue,
  waffoProductId,
  waffoStoreId,
  waffoWebhookPublicKey,
  validateWaffoApiOrigin,
  validatePublicBaseUrl,
  validateWaffoPrivateKeyMaterial,
  validateWaffoWebhookPublicKeyMaterial,
} from "../config.js";
import { readFileSync } from "node:fs";

export type WaffoEnv = Record<string, string | undefined>;
export type WaffoMode = "waffo-test" | "waffo-prod";

export const DEFAULT_WAFFO_API_BASE = "https://api.waffo.ai";

/** Keep a provider request from pinning the HTTP worker or a local intent. */
export const DEFAULT_WAFFO_CHECKOUT_TIMEOUT_MS = 15_000;
export const MAX_WAFFO_CHECKOUT_TIMEOUT_MS = 60_000;
/** The hosted checkout must not be allowed to become an indefinite lock. */
export const MAX_WAFFO_CHECKOUT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export function waffoApiBase(
  env: WaffoEnv = process.env,
  mode?: WaffoMode,
  options: { allowInjectedTransport?: boolean } = {},
): string {
  return validateWaffoApiOrigin(env as NodeJS.ProcessEnv, mode, options);
}

export function isWaffoLive(env: WaffoEnv = process.env): boolean {
  try {
    const configured = paymentMode(env as NodeJS.ProcessEnv);
    return configured === "waffo-test" || configured === "waffo-prod";
  } catch {
    return false;
  }
}

export function requireWaffoSecret(
  name: "WAFFO_MERCHANT_ID" | "WAFFO_PRODUCT_ID" | "WAFFO_STORE_ID",
  env: WaffoEnv = process.env,
): string {
  const value = env[name];
  if (!value || value.trim() === "") throw new Error(`BLOCKED-SECRET: ${name}`);
  const expectedPrefix =
    name === "WAFFO_MERCHANT_ID"
      ? "MER_"
      : name === "WAFFO_STORE_ID"
        ? "STO_"
        : "PROD_";
  if (value.trim() !== value || !new RegExp(`^${expectedPrefix}[0-9A-Za-z]{22}$`).test(value)) {
    throw new Error(`BLOCKED-CONFIG: ${name} must be a valid Waffo Short ID`);
  }
  return value;
}

export function waffoPrivateKey(env: WaffoEnv = process.env): string {
  const inline = waffoPrivateKeyValue(env);
  if (inline) return inline.replace(/\\n/g, "\n");
  const file = waffoPrivateKeyFile(env);
  if (file) {
    try {
      const value = readFileSync(file, "utf8").trim();
      if (value) return value;
    } catch {
      // Report the stable configuration blocker instead of leaking an fs error.
    }
  }
  throw new Error("BLOCKED-SECRET: WAFFO_PRIVATE_KEY");
}

export function requireWaffoLiveSecrets(
  env: WaffoEnv = process.env,
  mode: WaffoMode = requireWaffoMode(env),
): void {
  requireWaffoSecret("WAFFO_MERCHANT_ID", env);
  requireWaffoSecret("WAFFO_STORE_ID", env);
  requireWaffoSecret("WAFFO_PRODUCT_ID", env);
  waffoPrivateKey(env);
  validateWaffoPrivateKeyMaterial(env as NodeJS.ProcessEnv);
  requireWaffoWebhookKey(env, mode);
  validateWaffoWebhookPublicKeyMaterial(env as NodeJS.ProcessEnv, mode);
}

export function requireWaffoCheckoutSecrets(env: WaffoEnv = process.env): void {
  requireWaffoSecret("WAFFO_MERCHANT_ID", env);
  requireWaffoSecret("WAFFO_STORE_ID", env);
  requireWaffoSecret("WAFFO_PRODUCT_ID", env);
  waffoPrivateKey(env);
  validateWaffoPrivateKeyMaterial(env as NodeJS.ProcessEnv);
}

export function requireWaffoWebhookKey(
  env: WaffoEnv,
  mode: WaffoMode,
): string {
  const key = waffoWebhookPublicKey(env, mode);
  if (!key) {
    throw new Error(
      mode === "waffo-test"
        ? "BLOCKED-SECRET: WAFFO_WEBHOOK_TEST_PUBLIC_KEY"
        : "BLOCKED-SECRET: WAFFO_WEBHOOK_PROD_PUBLIC_KEY",
    );
  }
  return key;
}

export function createWaffoClient(input: {
  env: WaffoEnv;
  mode: WaffoMode;
  fetch?: typeof fetch;
}): WaffoPancake {
  const { env, mode } = input;
  if (paymentMode(env as NodeJS.ProcessEnv) !== mode) {
    throw new Error("BLOCKED-CONFIG: Waffo provider mode does not match PAYMENT_MODE");
  }
  requireWaffoCheckoutSecrets(env);
  validateWaffoWebhookPublicKeyMaterial(env as NodeJS.ProcessEnv, mode);
  validatePublicBaseUrl(env as NodeJS.ProcessEnv, {
    rejectReservedHostnames: mode === "waffo-prod",
  });
  const environment = waffoEnvironment(mode);
  if (!environment) throw new Error("BLOCKED-CONFIG: Waffo environment is missing");
  const publicKey = waffoWebhookPublicKey(env, mode);
  return new WaffoPancake({
    merchantId: requireWaffoSecret("WAFFO_MERCHANT_ID", env),
    privateKey: waffoPrivateKey(env),
    baseUrl: waffoApiBase(env, mode, { allowInjectedTransport: input.fetch !== undefined }),
    fetch: input.fetch,
    environment,
    webhookPublicKey: publicKey,
  });
}

export type WaffoCheckoutStart = {
  checkoutId: string;
  url: string;
  expiresAt: string;
};

export async function createWaffoCheckoutSession(input: {
  env?: WaffoEnv;
  mode: WaffoMode;
  fetch?: typeof fetch;
  timeoutMs?: number;
  chargeCents: number;
  successUrl: string;
  intentId: string;
  intentFingerprint: string;
  metadataFingerprint?: string;
  metadata: Record<string, string>;
}): Promise<WaffoCheckoutStart> {
  if (!Number.isSafeInteger(input.chargeCents) || input.chargeCents < 0) {
    throw new WaffoCheckoutRejectedError("Waffo checkout amount is not a valid cents value");
  }
  const env = input.env ?? process.env;
  if (paymentMode(env as NodeJS.ProcessEnv) !== input.mode) {
    throw new Error("BLOCKED-CONFIG: Waffo provider mode does not match PAYMENT_MODE");
  }
  try {
    const productId = requireWaffoSecret("WAFFO_PRODUCT_ID", env);
    const timeoutMs = normalizeCheckoutTimeout(input.timeoutMs);
    const transport = withCheckoutDeadline(
      input.fetch ?? globalThis.fetch.bind(globalThis),
      timeoutMs,
    );
    const client = createWaffoClient({ env, mode: input.mode, fetch: transport });
    const result = await client.checkout.anonymous.create({
      productId,
      currency: "USD",
      priceSnapshot: {
        amount: centsToDisplayString(input.chargeCents),
        taxCategory: TaxCategory.DigitalGoods,
      },
      successUrl: input.successUrl,
      orderMerchantExternalId: input.intentId,
      metadata: {
        ...input.metadata,
        intentId: input.intentId,
        intentFingerprint: input.intentFingerprint,
        metadataFingerprint: input.metadataFingerprint ?? input.metadata.metadataFingerprint ?? "",
      },
    });
    const checkoutId = strictResponseString(result.sessionId);
    const url = strictResponseString(result.checkoutUrl);
    const expiresAt = strictResponseString(result.expiresAt);
    if (!checkoutId || !url || !expiresAt) {
      throw new WaffoCheckoutUnknownError("Waffo checkout response is missing session data");
    }
    validateWaffoCheckoutUrl(url, checkoutId);
    const normalizedExpiry = validateWaffoCheckoutExpiry(expiresAt);
    return { checkoutId, url, expiresAt: normalizedExpiry };
  } catch (error) {
    if (error instanceof WaffoCheckoutError) throw error;
    if (
      error instanceof WaffoPancakeError &&
      error.status >= 400 &&
      error.status < 500 &&
      ![408, 409, 425, 429].includes(error.status) &&
      !error.errors.some((item) => item.message.startsWith("Non-JSON response"))
    ) {
      throw new WaffoCheckoutRejectedError(errorMessage(error));
    }
    // A timeout, reset, 5xx, malformed envelope, or crash after acceptance is
    // deliberately recoverable. The caller keeps the intent as unknown.
    throw new WaffoCheckoutUnknownError(errorMessage(error));
  }
}

export class WaffoCheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaffoCheckoutError";
  }
}

export class WaffoCheckoutRejectedError extends WaffoCheckoutError {
  readonly code = "WAFFO_CHECKOUT_REJECTED";

  constructor(message: string) {
    super(`WAFFO_CHECKOUT_REJECTED: ${message}`);
    this.name = "WaffoCheckoutRejectedError";
  }
}

export class WaffoCheckoutUnknownError extends WaffoCheckoutError {
  readonly code = "WAFFO_CHECKOUT_UNKNOWN";

  constructor(message: string) {
    super(`WAFFO_CHECKOUT_UNKNOWN: ${message}`);
    this.name = "WaffoCheckoutUnknownError";
  }
}

export type WaffoVerifiedEvent = WebhookEvent<Record<string, unknown>>;

export function verifyWaffoWebhook(
  rawBody: string,
  signature: string | undefined,
  env: WaffoEnv,
  mode: WaffoMode,
): WaffoVerifiedEvent {
  const key = waffoWebhookPublicKey(env, mode);
  if (!key) {
    throw new Error(
      mode === "waffo-test"
        ? "BLOCKED-SECRET: WAFFO_WEBHOOK_TEST_PUBLIC_KEY"
        : "BLOCKED-SECRET: WAFFO_WEBHOOK_PROD_PUBLIC_KEY",
    );
  }
  // Keep the direct verification boundary fail-closed too; the server
  // constructor validates this at startup, but callers may use this helper
  // independently in a worker or a focused webhook test.
  validateWaffoWebhookPublicKeyMaterial(env as NodeJS.ProcessEnv, mode);
  const environment = waffoEnvironment(mode);
  if (!environment) throw new Error("BLOCKED-CONFIG: Waffo environment is missing");
  try {
    return verifyWebhook<Record<string, unknown>>(rawBody, signature, {
      environment,
      publicKey: key,
    });
  } catch (error) {
    throw new Error(`WAFFO_WEBHOOK_INVALID: ${errorMessage(error)}`);
  }
}

export function centsToDisplayString(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("amount must be a non-negative integer number of cents");
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

const WAFFO_CHECKOUT_HOSTS = new Set(["pancake.waffo.ai"]);

/** Accept only the hosted checkout origin documented by the Waffo SDK. */
export function validateWaffoCheckoutUrl(value: string, expectedSessionId?: string): string {
  if (typeof value !== "string" || value.trim() !== value || value === "") {
    throw new Error("Waffo checkout response contains an invalid checkout URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Waffo checkout response contains an invalid checkout URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    !WAFFO_CHECKOUT_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    throw new Error("Waffo checkout response contains an untrusted checkout URL");
  }
  // URL normalizes an explicit default port away, so inspect the raw authority
  // as well. The provider resource is one exact, credential-free origin.
  const authority = /^https:\/\/([^/?#]*)/i.exec(value)?.[1];
  if (!authority || authority.includes("@") || authority.includes(":") || authority.toLowerCase() !== "pancake.waffo.ai") {
    throw new Error("Waffo checkout response contains an untrusted checkout URL");
  }
  const rawSuffix = value.slice("https://".length + authority.length);
  const rawPath = rawSuffix.split(/[?#]/, 1)[0] ?? "";
  // URL normalizes dot segments (and can hide a raw traversal attempt), so
  // the provider response must preserve one exact path spelling as well.
  // Empty query/fragment markers are also not part of the documented URL.
  if (
    rawSuffix.includes("?") ||
    rawSuffix.includes("#") ||
    rawPath !== parsed.pathname ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname.includes("%")
  ) {
    throw new Error("Waffo checkout response contains an invalid checkout path");
  }
  // Waffo's hosted anonymous checkout is exactly
  // /store/{safe-slug}/checkout/{sessionId}; no short form or trailing slash.
  const match = /^\/store\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,62}))\/checkout\/([A-Za-z0-9_-]+)$/.exec(parsed.pathname);
  if (!match) {
    throw new Error("Waffo checkout response contains an invalid checkout path");
  }
  if (expectedSessionId !== undefined && match[2] !== expectedSessionId) {
    throw new Error("Waffo checkout response session does not match its checkout URL");
  }
  return parsed.toString();
}

/** Validate and canonicalize the provider's finite, strictly future expiry. */
export function validateWaffoCheckoutExpiry(
  value: string,
  nowMs = Date.now(),
): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error("Waffo checkout response contains an invalid or expired checkout expiry");
  }
  const parsed = new Date(value);
  const expiresMs = parsed.getTime();
  if (
    !Number.isFinite(expiresMs) ||
    expiresMs <= nowMs ||
    expiresMs - nowMs > MAX_WAFFO_CHECKOUT_TTL_MS
  ) {
    throw new Error("Waffo checkout response contains an invalid or expired checkout expiry");
  }
  if (parsed.toISOString() !== value) {
    throw new Error("Waffo checkout response contains an invalid or expired checkout expiry");
  }
  return value;
}

/** Exact decimal parser used for Waffo display amounts; never uses floats. */
export function displayStringToCents(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  if (value.trim() !== value) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : undefined;
}

function requireWaffoMode(env: WaffoEnv): WaffoMode {
  const mode = paymentMode(env as NodeJS.ProcessEnv);
  if (mode !== "waffo-test" && mode !== "waffo-prod") {
    throw new Error("BLOCKED-CONFIG: Waffo provider mode is required");
  }
  return mode;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function strictResponseString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" && value.trim() === value ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "provider request failed";
}

function normalizeCheckoutTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_WAFFO_CHECKOUT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_WAFFO_CHECKOUT_TIMEOUT_MS
  ) {
    throw new WaffoCheckoutRejectedError(
      `checkout timeout must be a whole number of milliseconds from 1 to ${MAX_WAFFO_CHECKOUT_TIMEOUT_MS}`,
    );
  }
  return value;
}

/**
 * Put one deadline around both the SDK request and its response-body read.
 * The SDK accepts a fetch implementation but does not expose RequestInit, so
 * this boundary is the only place that can reliably propagate an AbortSignal
 * through its complete anonymous checkout call.
 */
function withCheckoutDeadline(
  transport: typeof fetch,
  timeoutMs: number,
): typeof fetch {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const parentSignal = init.signal;
    let rejectDeadline: (error: Error) => void = () => undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      rejectDeadline = reject;
    });
    const timer = setTimeout(() => {
      controller.abort();
      rejectDeadline(new Error("Waffo checkout request deadline exceeded"));
    }, timeoutMs);
    const onParentAbort = () => {
      controller.abort(parentSignal?.reason);
      rejectDeadline(new Error("Waffo checkout request was aborted"));
    };
    if (parentSignal) {
      if (parentSignal.aborted) {
        onParentAbort();
      } else {
        parentSignal.addEventListener("abort", onParentAbort, { once: true });
      }
    }
    const cleanup = () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onParentAbort);
    };
    try {
      const response = await Promise.race([
        transport(input, { ...init, signal: controller.signal }),
        deadline,
      ]);
      // The official SDK calls response.json() after fetch resolves. Keep the
      // same deadline alive until that body promise resolves, including for a
      // custom test transport that returns a response whose body hangs.
      const bodyMethods = new Set(["arrayBuffer", "blob", "formData", "json", "text"]);
      return new Proxy(response, {
        get(target, property, receiver) {
          if (typeof property === "string" && bodyMethods.has(property)) {
            const reader = Reflect.get(target, property, target);
            if (typeof reader === "function") {
              return (...args: unknown[]) => {
                let readResult: Promise<unknown>;
                try {
                  readResult = Promise.resolve(
                    (reader as (...items: unknown[]) => Promise<unknown>).apply(target, args),
                  );
                } catch (error) {
                  cleanup();
                  throw error;
                }
                return Promise.race([readResult, deadline]).finally(cleanup);
              };
            }
          }
          // Response accessors perform an internal-slot brand check; use the
          // original response as the receiver rather than the Proxy.
          return Reflect.get(target, property, target);
        },
      });
    } catch (error) {
      cleanup();
      throw error;
    }
  };
}
