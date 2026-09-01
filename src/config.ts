import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { isPrivateOrLocalHostname } from "./core/network.js";

export type PaymentMode = "fixture" | "waffo-test" | "waffo-prod";

export const OFFICIAL_WAFFO_API_ORIGIN = "https://api.waffo.ai";

const FIXTURE_LOCAL_NODE_ENVS = new Set(["development", "test"]);
const FIXTURE_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Runtime selection is Waffo-only; Polar variables are compatibility debris. */
export function paymentMode(env: NodeJS.ProcessEnv = process.env): PaymentMode {
  const legacy = env.WAFFO_MODE?.trim();
  if (legacy) {
    throw new Error("BLOCKED-CONFIG: WAFFO_MODE is unsupported; use PAYMENT_MODE");
  }
  const configured = env.PAYMENT_MODE?.trim().toLowerCase() ?? "";
  if (configured === "fixture") return "fixture";
  if (configured === "waffo-test" || configured === "waffo-prod") return configured;
  // Every process must declare its boundary. In particular, development,
  // test, and CI flags never silently turn a missing live configuration into a
  // fixture checkout path.
  throw new Error(
    "BLOCKED-CONFIG: PAYMENT_MODE must be explicitly set to fixture, waffo-test, or waffo-prod",
  );
}

export function waffoEnvironment(mode: PaymentMode): "test" | "prod" | undefined {
  return mode === "waffo-test" ? "test" : mode === "waffo-prod" ? "prod" : undefined;
}

export function waffoMerchantId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nonEmpty(env.WAFFO_MERCHANT_ID);
}

export function waffoStoreId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nonEmpty(env.WAFFO_STORE_ID);
}

export function waffoProductId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nonEmpty(env.WAFFO_PRODUCT_ID);
}

export function waffoPrivateKeyValue(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nonEmpty(env.WAFFO_PRIVATE_KEY);
}

export function waffoPrivateKeyFile(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nonEmpty(env.WAFFO_PRIVATE_KEY_FILE);
}

export function waffoWebhookPublicKey(
  env: NodeJS.ProcessEnv = process.env,
  mode: PaymentMode = paymentMode(env),
): string | undefined {
  // A shared legacy key must never cross an active test/production boundary.
  // Keep WAFFO_WEBHOOK_PUBLIC_KEY readable only as inert compatibility data;
  // callers that verify or start a Waffo process must supply the exact
  // environment-scoped key.
  const specific =
    mode === "waffo-test"
      ? env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY
      : mode === "waffo-prod"
        ? env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY
        : undefined;
  return nonEmpty(specific);
}

export function publicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PUBLIC_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:3000";
}

/**
 * Fixture money is for a local/test process only. The source-level test
 * helpers may construct a FixtureCheckout directly, but a listener must stay
 * on loopback and may not masquerade as staging or production.
 */
export function validateFixtureBoundary(env: NodeJS.ProcessEnv = process.env): void {
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv && !FIXTURE_LOCAL_NODE_ENVS.has(nodeEnv)) {
    throw new Error(
      "BLOCKED-CONFIG: fixture mode is local/test only; use PAYMENT_MODE=waffo-prod for public deployments",
    );
  }
  const configuredHost = env.HOST?.trim();
  if (configuredHost && !isFixtureLoopbackHost(configuredHost)) {
    throw new Error("BLOCKED-CONFIG: fixture mode must bind a loopback HOST");
  }
}

/** Select a listener host without allowing fixture money onto a public bind. */
export function listenHost(
  env: NodeJS.ProcessEnv = process.env,
  mode: PaymentMode = paymentMode(env),
): string {
  const configuredHost = env.HOST?.trim();
  if (mode === "fixture") {
    validateFixtureBoundary(env);
    return configuredHost || "127.0.0.1";
  }
  return configuredHost || "0.0.0.0";
}

/**
 * Resolve the provider API to an origin that cannot silently redirect signed
 * checkout traffic to an insecure or private endpoint. Production is pinned to
 * Waffo's documented origin; test mode may use another public HTTPS origin for
 * an injected/offline transport.
 */
export function validateWaffoApiOrigin(
  env: NodeJS.ProcessEnv = process.env,
  mode?: PaymentMode,
  options: { allowInjectedTransport?: boolean } = {},
): string {
  const raw = env.WAFFO_API_BASE?.trim() || OFFICIAL_WAFFO_API_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE must be a public HTTPS origin");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    isPrivateNetwork(parsed.hostname, false)
  ) {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE must be a public HTTPS origin");
  }
  if (mode === "waffo-prod" && parsed.origin !== OFFICIAL_WAFFO_API_ORIGIN) {
    throw new Error(
      `BLOCKED-CONFIG: WAFFO_API_BASE must be ${OFFICIAL_WAFFO_API_ORIGIN} in waffo-prod`,
    );
  }
  if (
    mode === "waffo-test" &&
    parsed.origin !== OFFICIAL_WAFFO_API_ORIGIN &&
    !options.allowInjectedTransport
  ) {
    throw new Error(
      "BLOCKED-CONFIG: custom WAFFO_API_BASE requires an injected test transport",
    );
  }
  return parsed.origin;
}

/** Old adapter helpers remain exported but are never consulted by provider selection. */
export function polarLiveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.POLAR_LIVE === "1";
}

export function polarAccessToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nonEmpty(env.POLAR_ACCESS_TOKEN);
}

export function polarWebhookSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nonEmpty(env.POLAR_WEBHOOK_SECRET);
}

export function polarProductId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nonEmpty(env.POLAR_PRODUCT_ID);
}

/** Validate live configuration before the server starts accepting traffic. */
export function validateProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
  databasePath = env.DATABASE_PATH,
): PaymentMode {
  const mode = paymentMode(env);
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  if ((nodeEnv === "production" || nodeEnv === "prod") && mode !== "waffo-prod") {
    throw new Error("BLOCKED-CONFIG: production requires PAYMENT_MODE=waffo-prod");
  }
  if (mode === "fixture") {
    validateFixtureBoundary(env);
    return mode;
  }
  validateWaffoApiOrigin(env, mode);
  const merchantId = waffoMerchantId(env);
  if (!merchantId) throw new Error("BLOCKED-SECRET: WAFFO_MERCHANT_ID");
  assertShortId("WAFFO_MERCHANT_ID", env.WAFFO_MERCHANT_ID ?? "", "MER_");
  if (!waffoPrivateKeyValue(env) && !waffoPrivateKeyFile(env)) {
    throw new Error("BLOCKED-SECRET: WAFFO_PRIVATE_KEY");
  }
  validateWaffoPrivateKeyMaterial(env);
  const storeId = waffoStoreId(env);
  if (!storeId) throw new Error("BLOCKED-SECRET: WAFFO_STORE_ID");
  assertShortId("WAFFO_STORE_ID", env.WAFFO_STORE_ID ?? "", "STO_");
  const productId = waffoProductId(env);
  if (!productId) throw new Error("BLOCKED-SECRET: WAFFO_PRODUCT_ID");
  assertShortId("WAFFO_PRODUCT_ID", env.WAFFO_PRODUCT_ID ?? "", "PROD_");
  if (!waffoWebhookPublicKey(env, mode)) {
    throw new Error(
      mode === "waffo-test"
        ? "BLOCKED-SECRET: WAFFO_WEBHOOK_TEST_PUBLIC_KEY"
        : "BLOCKED-SECRET: WAFFO_WEBHOOK_PROD_PUBLIC_KEY",
    );
  }
  validateWaffoWebhookPublicKeyMaterial(env, mode);
  validatePublicBaseUrl(env, { rejectReservedHostnames: mode === "waffo-prod" });
  if (
    !databasePath ||
    databasePath.trim() === "" ||
    databasePath === ":memory:" ||
    /^file::memory(?::|\?|$)/i.test(databasePath.trim())
  ) {
    throw new Error("BLOCKED-CONFIG: DATABASE_PATH must name a durable database");
  }
  return mode;
}

/** Parse the configured merchant key before a live listener can start. */
export function validateWaffoPrivateKeyMaterial(env: NodeJS.ProcessEnv = process.env): void {
  let raw: string | undefined;
  const inline = waffoPrivateKeyValue(env);
  if (inline) {
    raw = inline.replace(/\\n/g, "\n");
  } else {
    const file = waffoPrivateKeyFile(env);
    if (file) {
      try {
        raw = readFileSync(file, "utf8").trim();
      } catch {
        raw = undefined;
      }
    }
  }
  if (!raw) throw new Error("BLOCKED-SECRET: WAFFO_PRIVATE_KEY");
  try {
    const key = createPrivateKey(raw);
    if (key.asymmetricKeyType !== "rsa") {
      throw new Error("not-rsa");
    }
  } catch {
    throw new Error("BLOCKED-CONFIG: WAFFO_PRIVATE_KEY must be a valid RSA private key");
  }
}

/** Parse the mode-scoped webhook key and reject non-RSA or private material. */
export function validateWaffoWebhookPublicKeyMaterial(
  env: NodeJS.ProcessEnv = process.env,
  mode: Exclude<PaymentMode, "fixture"> = paymentMode(env) as Exclude<PaymentMode, "fixture">,
): void {
  const configured = waffoWebhookPublicKey(env, mode);
  if (!configured) {
    throw new Error(
      mode === "waffo-test"
        ? "BLOCKED-SECRET: WAFFO_WEBHOOK_TEST_PUBLIC_KEY"
        : "BLOCKED-SECRET: WAFFO_WEBHOOK_PROD_PUBLIC_KEY",
    );
  }
  const raw = configured.replace(/\\n/g, "\n");
  if (/-----BEGIN [^-]*PRIVATE KEY-----/.test(raw)) {
    throw new Error("BLOCKED-CONFIG: Waffo webhook key must be an RSA public key");
  }
  try {
    const key = createPublicKey(raw);
    if (key.asymmetricKeyType !== "rsa") {
      throw new Error("not-rsa");
    }
  } catch {
    throw new Error("BLOCKED-CONFIG: Waffo webhook key must be a valid RSA public key");
  }
}

/** Validate the public origin used to construct provider success URLs. */
export function validatePublicBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  options: { rejectReservedHostnames?: boolean } = {},
): string {
  let parsed: URL;
  try {
    parsed = new URL(publicBaseUrl(env));
  } catch {
    throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL must be a canonical public HTTPS origin");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    isPrivateNetwork(parsed.hostname, options.rejectReservedHostnames ?? true)
  ) {
    throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL must be a canonical public HTTPS origin");
  }
  return parsed.origin;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function assertShortId(name: string, value: string, prefix: string): void {
  if (value.trim() !== value || !new RegExp(`^${prefix}[0-9A-Za-z]{22}$`).test(value)) {
    throw new Error(`BLOCKED-CONFIG: ${name} must be a valid Waffo Short ID`);
  }
}

function isPrivateNetwork(hostname: string, rejectReservedHostnames: boolean): boolean {
  return isPrivateOrLocalHostname(hostname, { rejectReservedHostnames });
}

function isFixtureLoopbackHost(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  return FIXTURE_LOOPBACK_HOSTS.has(normalized);
}
