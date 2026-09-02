import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { FixtureCheckout } from "../src/billing/fixture.js";
import { createCheckoutPort } from "../src/billing/port.js";
import { WaffoCheckout } from "../src/billing/waffo.js";
import {
  displayStringToCents,
  validateWaffoCheckoutExpiry,
  validateWaffoCheckoutUrl,
  waffoApiBase,
} from "../src/billing/waffo-session.js";
import type { CheckoutDraft, CheckoutSession } from "../src/billing/port.js";
import {
  applyPaidBid,
  attachCheckoutReservation,
  findPaymentIntent,
  listToday,
  MIN_BID_USD,
  placeBid,
  reserveCheckout,
} from "../src/core/board.js";
import { dayKey } from "../src/core/day.js";
import {
  listenHost,
  paymentMode,
  validateProductionConfig,
  validatePublicBaseUrl,
} from "../src/config.js";
import { openDatabase } from "../src/db.js";

const WAFFO_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "waffo");

function loadWaffoFixture(name: string): string {
  return readFileSync(join(WAFFO_FIXTURE_DIR, name), "utf8");
}

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

class CountingFixtureCheckout extends FixtureCheckout {
  createCalls = 0;

  override async createSession(draft: CheckoutDraft): Promise<CheckoutSession> {
    this.createCalls += 1;
    return super.createSession(draft);
  }
}

const WAFFO_MERCHANT_ID = "MER_1234567890123456789012";
const WAFFO_STORE_ID = "STO_1234567890123456789012";
const WAFFO_PRODUCT_ID = "PROD_1234567890123456789012";
const WAFFO_ORDER_ID = "ORD_1234567890123456789012";
const WAFFO_PAYMENT_ID = "PAY_1234567890123456789012";
const waffoKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const WAFFO_PRIVATE_KEY = waffoKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const WAFFO_PUBLIC_KEY = waffoKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
const WAFFO_FIXTURE_INTENT_CREATED_AT = "2026-08-27T09:00:00.000Z";
const futureWaffoExpiry = () => new Date(Date.now() + 60 * 60 * 1_000).toISOString();

function waffoEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    PAYMENT_MODE: "waffo-test",
    WAFFO_MERCHANT_ID,
    WAFFO_STORE_ID,
    WAFFO_PRODUCT_ID,
    WAFFO_PRIVATE_KEY,
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: WAFFO_PUBLIC_KEY,
    PUBLIC_BASE_URL: "https://dtc.example.test",
    DATABASE_PATH: "/tmp/dtc-picks-test.sqlite",
    ...overrides,
  };
}

type WaffoEventOptions = {
  intentId: string;
  intentFingerprint: string;
  metadataFingerprint: string;
  productUrl: string;
  whyTestThisToday: string;
  bidUsd: number;
  chargeUsd: number;
  quoteBaseBidUsd?: number;
  day: string;
  suffix?: string;
  overrides?: {
    mode?: "test" | "prod";
    storeId?: string;
    eventType?: string;
    orderStatus?: string;
    paymentStatus?: string;
    currency?: string;
    productId?: string;
    metadata?: Record<string, string>;
    amount?: string;
    subtotal?: string;
    total?: string;
    taxAmount?: string;
    deliveryId?: string;
    eventId?: string;
    orderId?: string;
    paymentId?: string;
    timestamp?: string;
    omitAmount?: boolean;
    omitTaxAmount?: boolean;
    omitSubtotal?: boolean;
    omitTotal?: boolean;
    omitProductMetadata?: boolean;
  };
};

function waffoOrderEvent(options: WaffoEventOptions): Record<string, unknown> {
  const suffix = options.suffix ?? "one";
  const overrides = options.overrides ?? {};
  const cents = Math.round(options.chargeUsd * 100);
  const amount = options.overrides?.amount ?? `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
  const paymentId = options.overrides?.paymentId ?? `PAY_12345678901234567890${suffix.slice(0, 2).padEnd(2, "0")}`;
  const metadata: Record<string, string> = {
    intentId: options.intentId,
    intentFingerprint: options.intentFingerprint,
    metadataFingerprint: options.metadataFingerprint,
    targetBidCents: String(Math.round(options.bidUsd * 100)),
    chargeCents: String(cents),
    canonicalUrl: options.productUrl,
    productUrl: options.productUrl,
    whyTestThisToday: options.whyTestThisToday,
    bidUsd: String(options.bidUsd),
    chargeUsd: String(options.chargeUsd),
    day: options.day,
    quoteBaseBidCents: String(Math.round((options.quoteBaseBidUsd ?? 0) * 100)),
    mode: "waffo-test",
    storeId: WAFFO_STORE_ID,
    productId: options.overrides?.productId ?? WAFFO_PRODUCT_ID,
    currency: "USD",
    taxCategory: "digital_goods",
    ...options.overrides?.metadata,
  };
  const event: Record<string, unknown> = {
    id: overrides.deliveryId ?? `delivery-${suffix}`,
    timestamp: overrides.timestamp ?? "2026-08-27T12:00:00.000Z",
    eventType: overrides.eventType ?? "order.completed",
    eventId: overrides.eventId ?? paymentId,
    storeId: overrides.storeId ?? WAFFO_STORE_ID,
    storeName: "DTC Picks test store",
    mode: overrides.mode ?? "test",
    data: {
      orderId: overrides.orderId ?? `ORD_12345678901234567890${suffix.slice(0, 2).padEnd(2, "0")}`,
      orderStatus: overrides.orderStatus ?? "completed",
      buyerEmail: "buyer@example.test",
      orderMerchantExternalId: options.intentId,
      currency: overrides.currency ?? "USD",
      orderMetadata: metadata,
      amount,
      taxAmount: overrides.taxAmount ?? "0.00",
      subtotal: overrides.subtotal ?? amount,
      total: overrides.total ?? amount,
      productName: "Rank",
      productMetadata: { productId: overrides.productId ?? WAFFO_PRODUCT_ID },
      paymentId,
      paymentStatus: overrides.paymentStatus ?? "succeeded",
    },
  };
  const eventData = event.data as Record<string, unknown>;
  if (overrides.omitAmount) delete eventData.amount;
  if (overrides.omitTaxAmount) delete eventData.taxAmount;
  if (overrides.omitSubtotal) delete eventData.subtotal;
  if (overrides.omitTotal) delete eventData.total;
  if (overrides.omitProductMetadata) delete eventData.productMetadata;
  return event;
}

function signedWaffo(
  event: Record<string, unknown>,
): { raw: string; headers: Record<string, string> } {
  const raw = JSON.stringify(event);
  // The official SDK's verifier treats `t` as epoch milliseconds.
  const timestamp = String(Date.now());
  const signature = createSign("RSA-SHA256")
    .update(`${timestamp}.${raw}`)
    .sign(WAFFO_PRIVATE_KEY, "base64");
  return {
    raw,
    headers: {
      "content-type": "application/json",
      "x-waffo-signature": `t=${timestamp},v1=${signature}`,
    },
  };
}

function createWaffoReservation(db: ReturnType<typeof openDatabase>, input: {
  productUrl: string;
  whyTestThisToday: string;
  bidUsd: number;
  day: string;
  expectedMode?: "waffo-test" | "waffo-prod";
  expectedStoreId?: string;
  expectedProductId?: string;
  now?: Date;
}) {
  const reservation = reserveCheckout(db, {
    ...input,
    now: input.now ?? new Date(WAFFO_FIXTURE_INTENT_CREATED_AT),
    expectedMode: input.expectedMode ?? "waffo-test",
    expectedStoreId: input.expectedStoreId ?? WAFFO_STORE_ID,
    expectedProductId: input.expectedProductId ?? WAFFO_PRODUCT_ID,
    expectedCurrency: "USD",
    expectedTaxCategory: "digital_goods",
  });
  attachCheckoutReservation(db, reservation.id, `CHK_${reservation.id.replaceAll("-", "").slice(0, 22)}`);
  return reservation;
}

test("checkout provider truth table requires an explicit Waffo boundary and stays offline", async () => {
  assert.equal(paymentMode({ PAYMENT_MODE: "fixture" }), "fixture");
  assert.equal(createCheckoutPort({ PAYMENT_MODE: "fixture" }).kind, "fixture");
  assert.equal(
    validateProductionConfig({ PAYMENT_MODE: "fixture", NODE_ENV: "test", HOST: "127.0.0.1" }),
    "fixture",
  );
  assert.equal(listenHost({ PAYMENT_MODE: "fixture", NODE_ENV: "test" }), "127.0.0.1");
  assert.throws(
    () => validateProductionConfig({ PAYMENT_MODE: "fixture", NODE_ENV: "staging" }),
    /BLOCKED-CONFIG: fixture mode is local\/test only/,
  );
  assert.throws(
    () => validateProductionConfig({ PAYMENT_MODE: "fixture", NODE_ENV: "test", HOST: "0.0.0.0" }),
    /BLOCKED-CONFIG: fixture mode must bind a loopback HOST/,
  );
  assert.throws(
    () => listenHost({ PAYMENT_MODE: "fixture", NODE_ENV: "test", HOST: "0.0.0.0" }),
    /BLOCKED-CONFIG: fixture mode must bind a loopback HOST/,
  );
  assert.throws(
    () => validateProductionConfig({ PAYMENT_MODE: "fixture", NODE_ENV: "production" }),
    /BLOCKED-CONFIG: production requires PAYMENT_MODE=waffo-prod/,
  );
  assert.throws(
    () => validateProductionConfig(waffoEnv({ PAYMENT_MODE: "waffo-test", NODE_ENV: "production" }), "/tmp/dtc.sqlite"),
    /BLOCKED-CONFIG: production requires PAYMENT_MODE=waffo-prod/,
  );
  assert.throws(
    () =>
      createCheckoutPort(
        waffoEnv({
          WAFFO_WEBHOOK_TEST_PUBLIC_KEY: undefined,
          WAFFO_WEBHOOK_PUBLIC_KEY: WAFFO_PUBLIC_KEY,
        }),
      ),
    /BLOCKED-SECRET: WAFFO_WEBHOOK_TEST_PUBLIC_KEY/,
  );
  assert.throws(
    () => paymentMode({}),
    /BLOCKED-CONFIG: PAYMENT_MODE must be explicitly set/,
  );
  assert.throws(
    () => paymentMode({ WAFFO_MODE: "fixture" }),
    /BLOCKED-CONFIG: WAFFO_MODE is unsupported/,
  );
  assert.throws(
    () => paymentMode({ PAYMENT_MODE: "fixture", WAFFO_MODE: "waffo-prod" }),
    /BLOCKED-CONFIG: WAFFO_MODE is unsupported/,
  );
  assert.throws(() => createCheckoutPort({ CI: "true" }), /BLOCKED-CONFIG/);
  assert.throws(() => createCheckoutPort({ WAFFO_LIVE: "1" }), /BLOCKED-CONFIG/);
  assert.equal(
    createCheckoutPort({
      PAYMENT_MODE: "fixture",
      WAFFO_LIVE: "1",
    }).kind,
    "fixture",
  );
  assert.throws(
    () => createCheckoutPort({ PAYMENT_MODE: "waffo-test" }),
    /BLOCKED-SECRET: WAFFO_MERCHANT_ID/,
  );
  const live = createCheckoutPort(waffoEnv());
  assert.equal(live.kind, "live");
  assert.equal(live.mode, "waffo-test");
  assert.ok(live instanceof WaffoCheckout);
  assert.equal(waffoApiBase({}), "https://api.waffo.ai");
  assert.equal(
    waffoApiBase(
      { PAYMENT_MODE: "waffo-test", WAFFO_API_BASE: "https://mock.waffo.test/" },
      "waffo-test",
      { allowInjectedTransport: true },
    ),
    "https://mock.waffo.test",
  );
  assert.throws(
    () => waffoApiBase({ PAYMENT_MODE: "waffo-test", WAFFO_API_BASE: "https://mock.waffo.test/" }, "waffo-test"),
    /BLOCKED-CONFIG: custom WAFFO_API_BASE requires an injected test transport/,
  );
  assert.throws(
    () => waffoApiBase({ PAYMENT_MODE: "waffo-test", WAFFO_API_BASE: "http://mock.waffo.test" }),
    /BLOCKED-CONFIG: WAFFO_API_BASE must be a public HTTPS origin/,
  );
  assert.throws(
    () => waffoApiBase({ PAYMENT_MODE: "waffo-test", WAFFO_API_BASE: "https://127.0.0.1:9443" }),
    /BLOCKED-CONFIG: WAFFO_API_BASE must be a public HTTPS origin/,
  );
  assert.throws(
    () => waffoApiBase({ PAYMENT_MODE: "waffo-test", WAFFO_API_BASE: "https://[::1]:9443" }),
    /BLOCKED-CONFIG: WAFFO_API_BASE must be a public HTTPS origin/,
  );
  assert.throws(
    () => validateProductionConfig(waffoEnv({ PAYMENT_MODE: "waffo-prod", WAFFO_API_BASE: "https://mock.waffo.test" }), "/tmp/dtc.sqlite"),
    /BLOCKED-CONFIG: WAFFO_API_BASE must be https:\/\/api\.waffo\.ai in waffo-prod/,
  );
  assert.throws(
    () => validateProductionConfig({ PAYMENT_MODE: "waffo-test" }, "/tmp/dtc.sqlite"),
    /BLOCKED-SECRET: WAFFO_MERCHANT_ID/,
  );
  assert.throws(
    () => validateProductionConfig(waffoEnv({ WAFFO_WEBHOOK_TEST_PUBLIC_KEY: undefined }), "/tmp/dtc.sqlite"),
    /BLOCKED-SECRET: WAFFO_WEBHOOK_TEST_PUBLIC_KEY/,
  );
  assert.throws(
    () =>
      validateProductionConfig(
        waffoEnv({
          WAFFO_WEBHOOK_TEST_PUBLIC_KEY: undefined,
          WAFFO_WEBHOOK_PUBLIC_KEY: WAFFO_PUBLIC_KEY,
        }),
        "/tmp/dtc.sqlite",
      ),
    /BLOCKED-SECRET: WAFFO_WEBHOOK_TEST_PUBLIC_KEY/,
  );
  assert.throws(
    () =>
      validateProductionConfig(
        waffoEnv({
          PAYMENT_MODE: "waffo-prod",
          NODE_ENV: "production",
          WAFFO_WEBHOOK_TEST_PUBLIC_KEY: undefined,
          WAFFO_WEBHOOK_PROD_PUBLIC_KEY: undefined,
          WAFFO_WEBHOOK_PUBLIC_KEY: WAFFO_PUBLIC_KEY,
        }),
        "/tmp/dtc.sqlite",
      ),
    /BLOCKED-SECRET: WAFFO_WEBHOOK_PROD_PUBLIC_KEY/,
  );
  assert.throws(
    () => validateProductionConfig(waffoEnv({ PUBLIC_BASE_URL: "http://localhost:3000" }), "/tmp/dtc.sqlite"),
    /BLOCKED-CONFIG: PUBLIC_BASE_URL must be a canonical public HTTPS origin/,
  );
  assert.throws(
    () => validateProductionConfig(waffoEnv(), ":memory:"),
    /BLOCKED-CONFIG: DATABASE_PATH must name a durable database/,
  );

  let fetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetches += 1;
    throw new Error("unexpected provider network");
  }) as typeof globalThis.fetch;
  try {
    const fixture = createCheckoutPort({ PAYMENT_MODE: "fixture", WAFFO_LIVE: "1" });
    assert.ok(fixture instanceof FixtureCheckout);
    await fixture.createSession({
      productUrl: "https://store.example/sku",
      whyTestThisToday: "Test this restock on today's brief",
      bidUsd: 5,
      day: "2026-08-22",
      chargeUsd: 5,
    });
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production Waffo readiness validates Short IDs and RSA key material before listening", () => {
  const production = waffoEnv({
    PAYMENT_MODE: "waffo-prod",
    NODE_ENV: "production",
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: undefined,
    WAFFO_WEBHOOK_PROD_PUBLIC_KEY: WAFFO_PUBLIC_KEY,
    PUBLIC_BASE_URL: "https://checkout.public.example.com",
    DATABASE_PATH: "/tmp/dtc-picks-production-config.sqlite",
  });
  assert.equal(validateProductionConfig(production, production.DATABASE_PATH), "waffo-prod");
  for (const [name, value] of [
    ["WAFFO_MERCHANT_ID", "MER_invalid"],
    ["WAFFO_STORE_ID", "STO_invalid"],
    ["WAFFO_PRODUCT_ID", "PROD_invalid"],
  ] as const) {
    assert.throws(
      () => validateProductionConfig({ ...production, [name]: value }, production.DATABASE_PATH),
      /must be a valid Waffo Short ID/,
      name,
    );
  }
  const { privateKey: ecPrivate, publicKey: ecPublic } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  assert.throws(
    () =>
      validateProductionConfig(
        {
          ...production,
          WAFFO_PRIVATE_KEY: ecPrivate.export({ type: "pkcs8", format: "pem" }).toString(),
        },
        production.DATABASE_PATH,
      ),
    /WAFFO_PRIVATE_KEY must be a valid RSA private key/,
  );
  assert.throws(
    () =>
      validateProductionConfig(
        {
          ...production,
          WAFFO_WEBHOOK_PROD_PUBLIC_KEY: ecPublic.export({ type: "spki", format: "pem" }).toString(),
        },
        production.DATABASE_PATH,
      ),
    /Waffo webhook key must be a valid RSA public key/,
  );
});

test("production public callback origins reject reserved networks, mapped aliases, and DNS suffixes", () => {
  const candidates = [
    "https://0.0.0.0",
    "https://192.0.2.1",
    "https://198.51.100.10",
    "https://203.0.113.10",
    "https://224.0.0.1",
    "https://240.0.0.1",
    "https://[::1]",
    "https://[2001:db8::1]",
    "https://[2001:2::1]",
    "https://[ff02::1]",
    "https://[::ffff:192.0.2.1]",
    "https://checkout.example",
    "https://checkout.test",
    "https://checkout.invalid",
  ];
  for (const candidate of candidates) {
    assert.throws(
      () => validatePublicBaseUrl(waffoEnv({ PUBLIC_BASE_URL: candidate })),
      /BLOCKED-CONFIG: PUBLIC_BASE_URL must be a canonical public HTTPS origin/,
      candidate,
    );
  }
  assert.equal(
    validatePublicBaseUrl(waffoEnv({ PUBLIC_BASE_URL: "https://checkout.public.example.com" })),
    "https://checkout.public.example.com",
  );
});

test("Waffo checkout sends the official anonymous create shape with decimal money", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> | undefined;
  let calls = 0;
  const checkout = new WaffoCheckout({
    env: waffoEnv(),
    fetch: async (input, init) => {
      calls += 1;
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          data: {
            sessionId: "CHK_1234567890123456789012",
            checkoutUrl: "https://pancake.waffo.ai/store/test/checkout/CHK_1234567890123456789012",
            expiresAt: futureWaffoExpiry(),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const session = await checkout.createSession({
    productUrl: "https://store.example/sku",
    whyTestThisToday: "The exact provider shape is covered offline",
    bidUsd: 12,
    day: "2026-08-27",
    chargeUsd: 7,
    intentId: "intent-create-1",
    intentFingerprint: "intent-fingerprint-1",
    metadataFingerprint: "metadata-fingerprint-1",
    quoteBaseBidUsd: 5,
  });

  assert.equal(calls, 1);
  assert.equal(
    requestUrl,
    "https://api.waffo.ai/v1/actions/checkout/create-session",
  );
  assert.ok(requestBody);
  assert.deepEqual(Object.keys(requestBody!).sort(), [
    "currency",
    "metadata",
    "orderMerchantExternalId",
    "priceSnapshot",
    "productId",
    "successUrl",
  ]);
  assert.equal(requestBody.productId, WAFFO_PRODUCT_ID);
  assert.equal(requestBody.currency, "USD");
  assert.deepEqual(requestBody.priceSnapshot, {
    amount: "7.00",
    taxCategory: "digital_goods",
  });
  assert.equal(requestBody.successUrl, "https://dtc.example.test/checkout/complete?intent=intent-create-1");
  assert.equal(requestBody.orderMerchantExternalId, "intent-create-1");
  assert.equal(requestBody.products, undefined);
  assert.equal(requestBody.product_id, undefined);
  assert.equal(requestBody.amount, undefined);
  const metadata = requestBody.metadata as Record<string, unknown>;
  for (const value of Object.values(metadata)) {
    assert.equal(typeof value, "string");
  }
  assert.equal(metadata.intentId, "intent-create-1");
  assert.equal(metadata.intentFingerprint, "intent-fingerprint-1");
  assert.equal(metadata.metadataFingerprint, "metadata-fingerprint-1");
  assert.equal(metadata.chargeCents, "700");
  assert.equal(session.id, "CHK_1234567890123456789012");
  assert.equal(session.status, "open");
  await assert.rejects(checkout.completeSession(session.id), /completes via webhook only/);
});

test("Waffo hosted session and money boundaries require exact provider strings", () => {
  const sessionId = "CHK_1234567890123456789012";
  const exact = `https://pancake.waffo.ai/store/test/checkout/${sessionId}`;
  assert.equal(validateWaffoCheckoutUrl(exact, sessionId), exact);
  for (const candidate of [
    `https://pancake.waffo.ai/checkout/${sessionId}`,
    `https://pancake.waffo.ai/store/%2F/checkout/${sessionId}`,
    `${exact}?next=https://evil.example`,
    `${exact}#fragment`,
    `https://user:p@pancake.waffo.ai/store/test/checkout/${sessionId}`,
    `https://pancake.waffo.ai:443/store/test/checkout/${sessionId}`,
    `${exact}/`,
  ]) {
    assert.throws(() => validateWaffoCheckoutUrl(candidate, sessionId), /checkout (URL|path)/);
  }
  assert.throws(
    () => validateWaffoCheckoutUrl(exact, "CHK_2234567890123456789012"),
    /session does not match/,
  );
  assert.throws(
    () => validateWaffoCheckoutExpiry("Thu, 27 Aug 2026 13:00:00 GMT", Date.parse("2026-08-27T12:00:00.000Z")),
    /invalid or expired checkout expiry/,
  );
  assert.equal(displayStringToCents("5.00"), 500);
  assert.equal(displayStringToCents(" 5.00 "), undefined);
});

test("Waffo callback and hosted checkout URLs stay on trusted public origins", async () => {
  for (const publicBase of [
    "https://user:pass.example.test/",
    "https://public.example.test/callback",
    "https://public.example.test/?next=checkout",
    "https://public.example.test/#fragment",
    "https://[fd00::1]/",
  ]) {
    assert.throws(
      () => validatePublicBaseUrl(waffoEnv({ PUBLIC_BASE_URL: publicBase })),
      /BLOCKED-CONFIG: PUBLIC_BASE_URL must be a canonical public HTTPS origin/,
      publicBase,
    );
  }

  const checkout = new WaffoCheckout({
    env: waffoEnv(),
    fetch: async () =>
      new Response(
        JSON.stringify({
          data: {
            sessionId: "CHK_untrusted_123456789012345678",
            checkoutUrl: "http://evil.example.test/checkout",
            expiresAt: futureWaffoExpiry(),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  await assert.rejects(
    checkout.createSession({
      productUrl: "https://store.example/sku",
      whyTestThisToday: "An untrusted provider redirect must never reach shoppers",
      bidUsd: 5,
      day: "2026-08-27",
      chargeUsd: 5,
      intentId: "intent-untrusted-checkout",
      intentFingerprint: "intent-fingerprint-untrusted",
      metadataFingerprint: "metadata-fingerprint-untrusted",
    }),
    /WAFFO_CHECKOUT_UNKNOWN: Waffo checkout response contains an untrusted checkout URL/,
  );
});

test("Waffo checkout rejects root, malformed, expired, and unbounded provider sessions", async () => {
  const responses = [
    {
      checkoutUrl: "https://pancake.waffo.ai/",
      expiresAt: futureWaffoExpiry(),
      message: /invalid checkout path/,
    },
    {
      checkoutUrl: "https://pancake.waffo.ai/store/test/checkout/CHK_invalid_0134567890123456789012",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      message: /invalid or expired checkout expiry/,
    },
    {
      checkoutUrl: "https://pancake.waffo.ai/store/test/checkout/CHK_invalid_0234567890123456789012",
      expiresAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1_000).toISOString(),
      message: /invalid or expired checkout expiry/,
    },
  ];
  for (const [index, response] of responses.entries()) {
    const checkout = new WaffoCheckout({
      env: waffoEnv(),
      fetch: async () =>
        new Response(
          JSON.stringify({
            data: {
              sessionId: `CHK_invalid_${String(index).padStart(2, "0")}34567890123456789012`,
              checkoutUrl: response.checkoutUrl,
              expiresAt: response.expiresAt,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    await assert.rejects(
      checkout.createSession({
        productUrl: `https://checkout-validation-${index}.example/sku`,
        whyTestThisToday: "Provider session URL and expiry are validated before redirect",
        bidUsd: 5,
        day: "2026-08-27",
        chargeUsd: 5,
        intentId: `intent-checkout-validation-${index}`,
        intentFingerprint: `intent-checkout-validation-fingerprint-${index}`,
        metadataFingerprint: `intent-checkout-validation-metadata-${index}`,
      }),
      response.message,
    );
  }
});

test("Waffo is the only provider webhook route", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  try {
    const legacyRoute = await app.inject({
      method: "POST",
      url: "/webhooks/polar",
      payload: JSON.stringify({ type: "order.paid" }),
      headers: { "content-type": "application/json" },
    });
    assert.equal(legacyRoute.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("Waffo timeout keeps a durable intent unknown and never ranks it", async () => {
  const db = openDatabase(":memory:");
  let calls = 0;
  const checkout = new WaffoCheckout({
    env: waffoEnv(),
    fetch: async () => {
      calls += 1;
      throw new Error("simulated timeout after provider acceptance");
    },
  });
  const app = await buildApp({ db, checkout });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({
        productUrl: "https://timeout.example/sku",
        whyTestThisToday: "Provider timeout must remain recoverable",
        bidUsd: "5",
      }),
    });
    assert.equal(response.statusCode, 503);
    assert.match(response.body, /WAFFO_CHECKOUT_UNKNOWN/);
    const recovery = response.json() as {
      error: string;
      status: string;
      recoveryUrl: string;
    };
    assert.match(recovery.error, /WAFFO_CHECKOUT_UNKNOWN/);
    assert.equal(recovery.status, "unknown");
    assert.match(recovery.recoveryUrl, /^\/checkout\/complete\?intent=/);
    assert.equal(calls, 1);
    const intent = db
      .prepare<[], { id: string }>("SELECT id FROM payment_intents LIMIT 1")
      .get();
    assert.ok(intent);
    assert.equal(
      recovery.recoveryUrl,
      `/checkout/complete?intent=${encodeURIComponent(intent.id)}`,
    );
    assert.equal(findPaymentIntent(db, intent.id)?.state, "unknown");
    assert.equal(listToday(db, dayKey()).length, 0);

    const recoveryPage = await app.inject({ method: "GET", url: recovery.recoveryUrl });
    assert.equal(recoveryPage.statusCode, 200);
    assert.match(recoveryPage.body, /Payment confirmation is pending/);
    assert.equal(listToday(db, dayKey()).length, 0);

    const localIntent = findPaymentIntent(db, intent.id);
    assert.ok(localIntent);
    const recovered = waffoOrderEvent({
      intentId: localIntent.id,
      intentFingerprint: localIntent.intent_fingerprint,
      metadataFingerprint: localIntent.metadata_fingerprint,
      productUrl: localIntent.product_url,
      whyTestThisToday: localIntent.why_test_this_today,
      bidUsd: localIntent.target_bid_cents / 100,
      chargeUsd: localIntent.charge_cents / 100,
      quoteBaseBidUsd: localIntent.quote_base_bid_cents / 100,
      day: localIntent.day,
      suffix: "timeout-recovery",
      overrides: {
        timestamp: new Date(Date.parse(localIntent.created_at) + 1).toISOString(),
      },
    });
    const signedRecovered = signedWaffo(recovered);
    const settled = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signedRecovered.headers,
      payload: signedRecovered.raw,
    });
    assert.equal(settled.statusCode, 200);
    assert.equal(settled.json().status, "applied");
    assert.equal(findPaymentIntent(db, intent.id)?.state, "paid");
    assert.equal(listToday(db, dayKey()).length, 1);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo checkout applies one deadline to transport and response-body reads", async () => {
  const draft: CheckoutDraft = {
    productUrl: "https://deadline.example/sku",
    whyTestThisToday: "A provider deadline must release the worker, not the payment",
    bidUsd: 5,
    day: "2026-08-27",
    chargeUsd: 5,
    intentId: "intent-deadline-transport",
    intentFingerprint: "intent-deadline-fingerprint",
    metadataFingerprint: "metadata-deadline-fingerprint",
  };
  let transportSignal: AbortSignal | undefined;
  const transportCheckout = new WaffoCheckout({
    env: waffoEnv(),
    timeoutMs: 25,
    fetch: async (_input, init) => {
      transportSignal = init?.signal ?? undefined;
      return await new Promise<Response>(() => undefined);
    },
  });
  await assert.rejects(transportCheckout.createSession(draft), /WAFFO_CHECKOUT_UNKNOWN/);
  assert.ok(transportSignal);
  assert.equal(transportSignal?.aborted, true);

  let bodySignal: AbortSignal | undefined;
  const bodyCheckout = new WaffoCheckout({
    env: waffoEnv(),
    timeoutMs: 25,
    fetch: async (_input, init) => {
      bodySignal = init?.signal ?? undefined;
      return {
        status: 200,
        json: async () => await new Promise<unknown>(() => undefined),
      } as Response;
    },
  });
  await assert.rejects(
    bodyCheckout.createSession({ ...draft, intentId: "intent-deadline-body" }),
    /WAFFO_CHECKOUT_UNKNOWN/,
  );
  assert.ok(bodySignal);
  assert.equal(bodySignal?.aborted, true);
});

test("Waffo definitive checkout rejection releases the intent without ranking", async () => {
  const db = openDatabase(":memory:");
  const checkout = new WaffoCheckout({
    env: waffoEnv(),
    fetch: async () =>
      new Response(
        JSON.stringify({ errors: [{ message: "product is not active" }] }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
  });
  const app = await buildApp({ db, checkout });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({
        productUrl: "https://reject.example/sku",
        whyTestThisToday: "A definitive provider rejection is not a payment",
        bidUsd: "5",
      }),
    });
    assert.equal(response.statusCode, 502);
    assert.match(response.body, /WAFFO_CHECKOUT_REJECTED/);
    const intent = db
      .prepare<[], { id: string; state: string }>("SELECT id, state FROM payment_intents LIMIT 1")
      .get();
    assert.ok(intent);
    assert.equal(intent.state, "rejected");
    assert.equal(
      db.prepare<[], { status: string }>("SELECT status FROM checkout_reservations LIMIT 1").get()?.status,
      "released",
    );
    assert.equal(listToday(db, dayKey()).length, 0);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo checkout route attaches the intent before redirect and ignores live returns", async () => {
  const db = openDatabase(":memory:");
  const checkout = new WaffoCheckout({
    env: waffoEnv(),
    fetch: async () =>
      new Response(
        JSON.stringify({
          data: {
            sessionId: "CHK_2234567890123456789012",
            checkoutUrl: "https://pancake.waffo.ai/store/test/checkout/CHK_2234567890123456789012",
            expiresAt: futureWaffoExpiry(),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  const app = await buildApp({ db, checkout });
  try {
    const started = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({
        productUrl: "https://route.example/sku",
        whyTestThisToday: "Return URLs cannot settle a live Waffo payment",
        bidUsd: "5",
      }),
    });
    assert.equal(started.statusCode, 303);
    assert.equal(started.headers.location, "https://pancake.waffo.ai/store/test/checkout/CHK_2234567890123456789012");
    const intent = db
      .prepare<[], { id: string; state: string; provider_checkout_id: string; checkout_url: string }>(
        "SELECT id, state, provider_checkout_id, checkout_url FROM payment_intents LIMIT 1",
      )
      .get();
    assert.ok(intent);
    assert.equal(intent.state, "open");
    assert.equal(intent.provider_checkout_id, "CHK_2234567890123456789012");
    assert.equal(intent.checkout_url, "https://pancake.waffo.ai/store/test/checkout/CHK_2234567890123456789012");

    const returned = await app.inject({
      method: "GET",
      url: `/checkout/complete?intent=${encodeURIComponent(intent.id)}`,
    });
    assert.equal(returned.statusCode, 200);
    assert.match(returned.body, /Payment is pending/);
    assert.doesNotMatch(returned.body, new RegExp(intent.id));
    assert.equal(listToday(db, dayKey()).length, 0);

    const unknown = await app.inject({
      method: "GET",
      url: "/checkout/complete?intent=not-a-local-intent-id",
    });
    assert.equal(unknown.statusCode, 200);
    assert.match(unknown.body, /Payment status unavailable/);
    assert.doesNotMatch(unknown.body, /not-a-local-intent-id/);
  } finally {
    await app.close();
    db.close();
  }
});

test("checkout reservations and board pages use the same injected civil-day clock", async () => {
  const db = openDatabase(":memory:");
  const now = new Date("2026-08-26T12:00:00.000Z");
  const app = await buildApp({ db, checkout: new FixtureCheckout(), now });
  try {
    const started = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({
        productUrl: "https://clock-boundary.example/sku",
        whyTestThisToday: "Checkout and board must share one clock",
        bidUsd: "5",
      }),
    });
    assert.equal(started.statusCode, 303);
    assert.equal(listToday(db, "2026-08-26").length, 1);
    assert.equal(listToday(db, "2026-08-27").length, 0);
    const board = await app.inject({ method: "GET", url: "/" });
    assert.equal(board.statusCode, 200);
    assert.match(board.body, /clock-boundary\.example\/sku/);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo signed settlement is atomic, replay-safe, and uses the provider event time", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const productUrl = "https://waffo.example/sku?utm_source=provider";
  const whyTestThisToday = "Signed Waffo order should occupy this URL once";
  const reservation = createWaffoReservation(db, {
    productUrl,
    whyTestThisToday,
    bidUsd: 5,
    day,
  });
  const checkout = new WaffoCheckout({ env: waffoEnv() });
  const app = await buildApp({ db, checkout });
  try {
    const event = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday,
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day,
      suffix: "waffo",
      overrides: {
        timestamp: "2026-08-27T11:22:33.000Z",
        deliveryId: "delivery-waffo-1",
        eventId: WAFFO_PAYMENT_ID,
        orderId: WAFFO_ORDER_ID,
        paymentId: WAFFO_PAYMENT_ID,
      },
    });
    const signed = signedWaffo(event);
    const first = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.json(), { received: true, applied: true, status: "applied" });
    assert.equal(listToday(db, day).length, 1);
    assert.equal(listToday(db, day)[0]?.createdAt, "2026-08-27T11:22:33.000Z");

    const retry = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(retry.statusCode, 200);
    assert.deepEqual(retry.json(), { received: true, applied: false, status: "replayed" });
    assert.equal(listToday(db, day).length, 1);

    const secondDelivery = signedWaffo({ ...event, id: "delivery-waffo-2" });
    const second = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: secondDelivery.headers,
      payload: secondDelivery.raw,
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().status, "replayed");
    assert.equal(listToday(db, day).length, 1);

    const changed = signedWaffo({ ...event, storeName: "tampered signed payload" });
    const changedResponse = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: changed.headers,
      payload: changed.raw,
    });
    assert.equal(changedResponse.statusCode, 409);
    assert.match(changedResponse.body, /different signed payload/);
    assert.equal(listToday(db, day).length, 1);

    const changedFreshDelivery = signedWaffo({
      ...event,
      id: "delivery-waffo-3",
      storeName: "tampered with a fresh delivery id",
    });
    const changedFreshResponse = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: changedFreshDelivery.headers,
      payload: changedFreshDelivery.raw,
    });
    assert.equal(changedFreshResponse.statusCode, 409);
    assert.match(changedFreshResponse.body, /different signed payload/);
    assert.equal(listToday(db, day).length, 1);
    const conflict = db
      .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM waffo_webhook_conflicts")
      .get();
    assert.equal(conflict?.count, 2);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo collision rows reserve every incoming identity against three-event laundering", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const owner = createWaffoReservation(db, {
    productUrl: "https://collision-owner.example/sku",
    whyTestThisToday: "The original signed payment owns this identity",
    bidUsd: 5,
    day,
  });
  const victim = createWaffoReservation(db, {
    productUrl: "https://collision-victim.example/sku",
    whyTestThisToday: "A changed identity must not launder into a new rank",
    bidUsd: 5,
    day,
  });
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const first = waffoOrderEvent({
      intentId: owner.id,
      intentFingerprint: owner.intentFingerprint!,
      metadataFingerprint: owner.metadataFingerprint!,
      productUrl: owner.productUrl,
      whyTestThisToday: "The original signed payment owns this identity",
      bidUsd: owner.bidUsd,
      chargeUsd: owner.chargeUsd,
      day,
      suffix: "collision-owner",
      overrides: {
        deliveryId: "delivery-collision-owner",
        paymentId: "PAY_collision_shared_123456789012345",
        eventId: "PAY_collision_shared_123456789012345",
        orderId: "ORD_collision_owner_123456789012345",
      },
    });
    const firstSigned = signedWaffo(first);
    const applied = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: firstSigned.headers,
      payload: firstSigned.raw,
    });
    assert.equal(applied.statusCode, 200);

    const conflicting = waffoOrderEvent({
      intentId: victim.id,
      intentFingerprint: victim.intentFingerprint!,
      metadataFingerprint: victim.metadataFingerprint!,
      productUrl: victim.productUrl,
      whyTestThisToday: "A changed identity must not launder into a new rank",
      bidUsd: victim.bidUsd,
      chargeUsd: victim.chargeUsd,
      day,
      suffix: "collision-victim",
      overrides: {
        deliveryId: "delivery-collision-victim",
        paymentId: "PAY_collision_shared_123456789012345",
        eventId: "PAY_collision_shared_123456789012345",
        orderId: "ORD_collision_victim_123456789012345",
      },
    });
    const conflictingSigned = signedWaffo(conflicting);
    const rejected = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: conflictingSigned.headers,
      payload: conflictingSigned.raw,
    });
    assert.equal(rejected.statusCode, 409);
    assert.equal(findPaymentIntent(db, victim.id)?.state, "needs_reconciliation");
    assert.equal(
      db.prepare<[string], { status: string }>("SELECT status FROM checkout_reservations WHERE id = ?")
        .get(victim.id)?.status,
      "released",
    );
    assert.equal(
      db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM waffo_webhook_conflicts WHERE delivery_id = ?")
        .get("delivery-collision-victim")?.n,
      1,
    );

    const exactRetry = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: conflictingSigned.headers,
      payload: conflictingSigned.raw,
    });
    assert.equal(exactRetry.statusCode, 200);
    assert.equal(exactRetry.json().status, "replayed");

    const laundered = waffoOrderEvent({
      intentId: victim.id,
      intentFingerprint: victim.intentFingerprint!,
      metadataFingerprint: victim.metadataFingerprint!,
      productUrl: victim.productUrl,
      whyTestThisToday: "A changed identity must not launder into a new rank",
      bidUsd: victim.bidUsd,
      chargeUsd: victim.chargeUsd,
      day,
      suffix: "collision-laundered",
      overrides: {
        deliveryId: "delivery-collision-victim",
        paymentId: "PAY_collision_fresh_123456789012345",
        eventId: "PAY_collision_fresh_123456789012345",
        orderId: "ORD_collision_victim_123456789012345",
      },
    });
    const launderedSigned = signedWaffo(laundered);
    const blocked = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: launderedSigned.headers,
      payload: launderedSigned.raw,
    });
    assert.equal(blocked.statusCode, 409);
    assert.equal(listToday(db, day).length, 1);
    assert.equal(findPaymentIntent(db, victim.id)?.state, "needs_reconciliation");
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo provider timestamps are canonical and bounded to receipt and intent time", async () => {
  for (const [name, timestamp, expectedStatus] of [
    ["future", "2099-01-01T00:00:00.000Z", 202],
    ["stale", "2000-01-01T00:00:00.000Z", 202],
  ] as const) {
    const db = openDatabase(":memory:");
    const reservation = createWaffoReservation(db, {
      productUrl: `https://provider-time-${name}.example/sku`,
      whyTestThisToday: `A ${name} provider event must reconcile safely`,
      bidUsd: 5,
      day: "2026-08-27",
    });
    const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
    try {
      const event = waffoOrderEvent({
        intentId: reservation.id,
        intentFingerprint: reservation.intentFingerprint!,
        metadataFingerprint: reservation.metadataFingerprint!,
        productUrl: reservation.productUrl,
        whyTestThisToday: `A ${name} provider event must reconcile safely`,
        bidUsd: reservation.bidUsd,
        chargeUsd: reservation.chargeUsd,
        day: "2026-08-27",
        suffix: `provider-${name}`,
        overrides: { timestamp },
      });
      const signed = signedWaffo(event);
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/waffo",
        headers: signed.headers,
        payload: signed.raw,
      });
      assert.equal(response.statusCode, expectedStatus, name);
      assert.equal(response.json().status, "needs_reconciliation", name);
      assert.equal(findPaymentIntent(db, reservation.id)?.state, "needs_reconciliation", name);
      assert.equal(listToday(db, "2026-08-27").length, 0, name);
      assert.equal(
        db.prepare<[string], { status: string }>("SELECT status FROM checkout_reservations WHERE id = ?")
          .get(reservation.id)?.status,
        "released",
        name,
      );
    } finally {
      await app.close();
      db.close();
    }
  }

  const db = openDatabase(":memory:");
  const reservation = createWaffoReservation(db, {
    productUrl: "https://provider-time-rfc.example/sku",
    whyTestThisToday: "RFC provider timestamps are not canonical UTC",
    bidUsd: 5,
    day: "2026-08-27",
  });
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const event = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday: "RFC provider timestamps are not canonical UTC",
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day: "2026-08-27",
      suffix: "provider-rfc",
      overrides: { timestamp: "Thu, 27 Aug 2026 12:00:00 GMT" },
    });
    const signed = signedWaffo(event);
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().status, "rejected");
    assert.equal(findPaymentIntent(db, reservation.id)?.state, "needs_reconciliation");
    assert.equal(listToday(db, "2026-08-27").length, 0);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo provider capture before local intent is durable reconciliation", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const reservation = createWaffoReservation(db, {
    productUrl: "https://provider-before-intent.example/sku",
    whyTestThisToday: "A provider capture before intent creation must never rank",
    bidUsd: 5,
    day,
  });
  const intent = findPaymentIntent(db, reservation.id);
  assert.ok(intent);
  assert.equal(intent.created_at, WAFFO_FIXTURE_INTENT_CREATED_AT);
  const preIntentTimestamp = new Date(Date.parse(intent.created_at) - 1).toISOString();
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const event = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday: "A provider capture before intent creation must never rank",
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day,
      suffix: "before-intent",
      overrides: { timestamp: preIntentTimestamp, deliveryId: "delivery-before-intent" },
    });
    const signed = signedWaffo(event);
    const first = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(first.statusCode, 202);
    assert.equal(first.json().status, "needs_reconciliation");
    assert.match(first.body, /predates the local intent/);
    assert.equal(findPaymentIntent(db, reservation.id)?.state, "needs_reconciliation");
    assert.equal(listToday(db, day).length, 0);
    assert.equal(
      db.prepare<[string], { status: string }>("SELECT status FROM checkout_reservations WHERE id = ?")
        .get(reservation.id)?.status,
      "released",
    );

    const retry = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().status, "replayed");
    assert.equal(listToday(db, day).length, 0);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo reconciliation reserves intent identity and blocks fresh identities from ranking", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const whyTestThisToday = "A provider mismatch must remain a durable reconciliation boundary";
  const reservation = createWaffoReservation(db, {
    productUrl: "https://reconciliation-identity.example/sku",
    whyTestThisToday,
    bidUsd: 5,
    day,
  });
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const mismatch = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday,
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day,
      suffix: "reconcile-mismatch",
      overrides: { productId: "PROD_2234567890123456789012" },
    });
    const signedMismatch = signedWaffo(mismatch);
    const first = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signedMismatch.headers,
      payload: signedMismatch.raw,
    });
    assert.equal(first.statusCode, 202);
    assert.equal(first.json().status, "needs_reconciliation");
    assert.equal(findPaymentIntent(db, reservation.id)?.state, "needs_reconciliation");
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM payment_event_identities").get()?.count,
      1,
    );
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM waffo_webhook_deliveries").get()?.count,
      1,
    );

    const correctedFacts = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday,
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day,
      suffix: "reconcile-fresh",
    });
    const corrected = signedWaffo(correctedFacts);
    const second = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: corrected.headers,
      payload: corrected.raw,
    });
    assert.equal(second.statusCode, 409);
    assert.match(second.body, /identity was already used|awaiting reconciliation/);
    assert.equal(listToday(db, day).length, 0);
    assert.equal(findPaymentIntent(db, reservation.id)?.state, "needs_reconciliation");
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM waffo_webhook_conflicts").get()?.count,
      1,
    );
  } finally {
    await app.close();
    db.close();
  }
});

test("an expired Waffo reservation rotates safely and a late capture reconciles", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const productUrl = "https://expired-waffo.example/sku";
  const old = createWaffoReservation(db, {
    productUrl,
    whyTestThisToday: "An expired hosted session must not lock this product",
    bidUsd: 5,
    day,
  });
  db.prepare("UPDATE payment_intents SET expires_at = ? WHERE id = ?").run(
    "2026-08-27T10:00:00.000Z",
    old.id,
  );
  const replacement = reserveCheckout(db, {
    productUrl,
    whyTestThisToday: "A replacement can open after the old checkout expires",
    bidUsd: 5,
    day,
    expectedMode: "waffo-test",
    expectedStoreId: WAFFO_STORE_ID,
    expectedProductId: WAFFO_PRODUCT_ID,
    expectedCurrency: "USD",
    expectedTaxCategory: "digital_goods",
    now: new Date("2026-08-27T11:00:00.000Z"),
  });
  assert.notEqual(replacement.id, old.id);
  assert.equal(findPaymentIntent(db, old.id)?.state, "released");
  assert.equal(
    db.prepare<[string], { status: string }>("SELECT status FROM checkout_reservations WHERE id = ?").get(old.id)?.status,
    "released",
  );

  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const late = waffoOrderEvent({
      intentId: old.id,
      intentFingerprint: old.intentFingerprint!,
      metadataFingerprint: old.metadataFingerprint!,
      productUrl: old.productUrl,
      whyTestThisToday: "An expired hosted session must not lock this product",
      bidUsd: old.bidUsd,
      chargeUsd: old.chargeUsd,
      day,
      suffix: "late-expired",
    });
    const signed = signedWaffo(late);
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(response.statusCode, 202);
    assert.equal(response.json().status, "needs_reconciliation");
    assert.equal(listToday(db, day).length, 0);
    assert.equal(findPaymentIntent(db, old.id)?.state, "released");
    assert.equal(findPaymentIntent(db, replacement.id)?.state, "creating");
  } finally {
    await app.close();
    db.close();
  }
});

test("a captured Waffo event with no open reservation is durably reconciled", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const whyTestThisToday = "A released reservation cannot be reopened by a capture";
  const reservation = createWaffoReservation(db, {
    productUrl: "https://no-open-waffo.example/sku",
    whyTestThisToday,
    bidUsd: 5,
    day,
  });
  db.prepare("UPDATE checkout_reservations SET status = 'released' WHERE id = ?").run(reservation.id);
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const event = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday,
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day,
      suffix: "no-open",
    });
    const signed = signedWaffo(event);
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(response.statusCode, 202);
    assert.equal(response.json().status, "needs_reconciliation");
    assert.equal(findPaymentIntent(db, reservation.id)?.state, "needs_reconciliation");
    assert.equal(listToday(db, day).length, 0);
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM payment_event_identities").get()?.count,
      1,
    );
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM waffo_webhook_deliveries").get()?.count,
      1,
    );
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo signature-valid non-completed events are durable and cannot later settle", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const whyTestThisToday = "Only a signed order.completed event can claim this product";
  const reservation = createWaffoReservation(db, {
    productUrl: "https://non-completed-waffo.example/sku",
    whyTestThisToday,
    bidUsd: 5,
    day,
  });
  const ids = {
    deliveryId: "delivery-non-completed-event",
    eventId: "PAY_non_completed_event_123456789012345678",
    paymentId: "PAY_non_completed_event_123456789012345678",
    orderId: "ORD_non_completed_event_123456789012345678",
  };
  const refunded = waffoOrderEvent({
    intentId: reservation.id,
    intentFingerprint: reservation.intentFingerprint!,
    metadataFingerprint: reservation.metadataFingerprint!,
    productUrl: reservation.productUrl,
    whyTestThisToday,
    bidUsd: reservation.bidUsd,
    chargeUsd: reservation.chargeUsd,
    day,
    suffix: "non-completed",
    overrides: { ...ids, eventType: "order.refunded" },
  });
  const signedRefunded = signedWaffo(refunded);
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const first = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signedRefunded.headers,
      payload: signedRefunded.raw,
    });
    assert.equal(first.statusCode, 409);
    assert.equal(first.json().status, "rejected");
    assert.equal(listToday(db, day).length, 0);
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM payment_event_identities").get()?.count,
      1,
    );
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM waffo_webhook_deliveries").get()?.count,
      1,
    );

    const retry = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signedRefunded.headers,
      payload: signedRefunded.raw,
    });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().status, "replayed");

    const corrected = signedWaffo({
      ...refunded,
      eventType: "order.completed",
    });
    const correctedResponse = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: corrected.headers,
      payload: corrected.raw,
    });
    assert.equal(correctedResponse.statusCode, 409);
    assert.match(correctedResponse.body, /different signed payload/);
    assert.equal(listToday(db, day).length, 0);
  } finally {
    await app.close();
    db.close();
  }
});

test("signed Waffo policy rejects are durable and cannot be corrected under the same identity", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const whyTestThisToday = "A malformed signed order must remain an audited rejection";
  const reservation = createWaffoReservation(db, {
    productUrl: "https://durable-rejection.example/sku",
    whyTestThisToday,
    bidUsd: 5,
    day,
  });
  const ids = {
    deliveryId: "delivery-durable-rejection",
    eventId: "PAY_durable_rejection_123456789012345678",
    paymentId: "PAY_durable_rejection_123456789012345678",
    orderId: "ORD_durable_rejection_123456789012345678",
  };
  const malformed = waffoOrderEvent({
    intentId: reservation.id,
    intentFingerprint: reservation.intentFingerprint!,
    metadataFingerprint: reservation.metadataFingerprint!,
    productUrl: reservation.productUrl,
    whyTestThisToday,
    bidUsd: reservation.bidUsd,
    chargeUsd: reservation.chargeUsd,
    day,
    suffix: "durable-rejection",
    overrides: { ...ids, total: "not-money" },
  });
  const signedMalformed = signedWaffo(malformed);
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const first = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signedMalformed.headers,
      payload: signedMalformed.raw,
    });
    assert.equal(first.statusCode, 409);
    assert.equal(first.json().status, "rejected");
    assert.equal(listToday(db, day).length, 0);
    assert.equal(findPaymentIntent(db, reservation.id)?.state, "needs_reconciliation");
    assert.equal(
      db.prepare<[string], { status: string }>("SELECT status FROM checkout_reservations WHERE id = ?")
        .get(reservation.id)?.status,
      "released",
    );
    const truthfulStatus = await app.inject({
      method: "GET",
      url: `/checkout/complete?intent=${encodeURIComponent(reservation.id)}`,
    });
    assert.equal(truthfulStatus.statusCode, 200);
    assert.match(truthfulStatus.body, /Payment needs reconciliation/);
    assert.doesNotMatch(truthfulStatus.body, new RegExp(reservation.id));
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM waffo_webhook_deliveries").get()?.count,
      1,
    );
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM payment_event_identities").get()?.count,
      1,
    );
    assert.equal(
      db.prepare<[], { outcome: string }>("SELECT outcome FROM payment_event_identities LIMIT 1").get()?.outcome,
      "rejected",
    );

    const retry = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signedMalformed.headers,
      payload: signedMalformed.raw,
    });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().status, "replayed");

    const corrected = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday,
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day,
      suffix: "durable-rejection",
      overrides: { ...ids, total: "5.00" },
    });
    const signedCorrected = signedWaffo(corrected);
    const correctedResponse = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signedCorrected.headers,
      payload: signedCorrected.raw,
    });
    assert.equal(correctedResponse.statusCode, 409);
    assert.match(correctedResponse.body, /different signed payload|previously rejected/);
    assert.equal(listToday(db, day).length, 0);
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM waffo_webhook_conflicts").get()?.count,
      1,
    );
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo settlement uses persisted intent provider facts after configuration rotation", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const productUrl = "https://config-drift.example/sku";
  const expectedProductId = WAFFO_PRODUCT_ID;
  const rotatedProductId = "PROD_2234567890123456789012";
  const whyTestThisToday = "A captured payment remains attachable after product rotation";
  const reservation = createWaffoReservation(db, {
    productUrl,
    whyTestThisToday,
    bidUsd: 5,
    day,
    expectedProductId,
  });
  const checkout = new WaffoCheckout({
    env: waffoEnv({ WAFFO_PRODUCT_ID: rotatedProductId }),
  });
  const event = waffoOrderEvent({
    intentId: reservation.id,
    intentFingerprint: reservation.intentFingerprint!,
    metadataFingerprint: reservation.metadataFingerprint!,
    productUrl,
    whyTestThisToday,
    bidUsd: reservation.bidUsd,
    chargeUsd: reservation.chargeUsd,
    day,
    suffix: "config-drift",
    overrides: { productId: expectedProductId },
  });
  const signed = signedWaffo(event);
  const app = await buildApp({ db, checkout });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "applied");
    assert.equal(listToday(db, day).length, 1);
    assert.equal(listToday(db, day)[0]?.paidUsd, 5);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo official order.completed fixture carries payment identity and tax fields", async () => {
  const db = openDatabase(":memory:");
  const productUrl = "https://fixture-waffo.example/sku";
  const whyTestThisToday = "The official Waffo fixture carries the normalized listing intent";
  const reservation = createWaffoReservation(db, {
    productUrl,
    whyTestThisToday,
    bidUsd: 5,
    day: "2026-08-27",
  });
  const fixture = JSON.parse(loadWaffoFixture("order-completed.json")) as Record<string, unknown>;
  const data = fixture.data as Record<string, unknown>;
  const metadata = data.orderMetadata as Record<string, string>;
  data.orderMerchantExternalId = reservation.id;
  data.orderMetadata = {
    ...metadata,
    intentId: reservation.id,
    intentFingerprint: reservation.intentFingerprint!,
    metadataFingerprint: reservation.metadataFingerprint!,
  };
  const signed = signedWaffo(fixture);
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "applied");
    assert.equal(listToday(db, "2026-08-27")[0]?.paidUsd, 5);
    assert.equal(
      db.prepare<[], { tax_cents: number }>("SELECT tax_cents FROM waffo_webhook_deliveries LIMIT 1").get()?.tax_cents,
      0,
    );
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo settles non-zero tax exactly while ranking the tax-exclusive charge", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const productUrl = "https://tax-waffo.example/sku";
  const whyTestThisToday = "Buyer tax is recorded but never inflates the ranked bid";
  const reservation = createWaffoReservation(db, {
    productUrl,
    whyTestThisToday,
    bidUsd: 5,
    day,
  });
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const event = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday,
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day,
      suffix: "tax",
      overrides: { amount: "5.00", subtotal: "5.00", total: "6.00", taxAmount: "1.00" },
    });
    const signed = signedWaffo(event);
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "applied");
    assert.equal(listToday(db, day)[0]?.bidUsd, 5);
    assert.equal(listToday(db, day)[0]?.paidUsd, 5);
    assert.equal(
      db.prepare<[], { tax_cents: number }>("SELECT tax_cents FROM waffo_webhook_deliveries LIMIT 1").get()?.tax_cents,
      100,
    );
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo allows omitted optional totals only for a tax-free charge", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const productUrl = "https://optional-amounts-waffo.example/sku";
  const whyTestThisToday = "Optional provider amount fields remain exact when tax is zero";
  const reservation = createWaffoReservation(db, {
    productUrl,
    whyTestThisToday,
    bidUsd: 5,
    day,
  });
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const event = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday,
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day,
      suffix: "optional",
      overrides: { omitSubtotal: true, omitTotal: true },
    });
    const signed = signedWaffo(event);
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "applied");
    assert.equal(listToday(db, day)[0]?.paidUsd, 5);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo raises charge only the target-minus-current difference", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const productUrl = "https://raise-waffo.example/sku";
  const firstWhy = "First Waffo bid establishes the product cover";
  const first = createWaffoReservation(db, {
    productUrl,
    whyTestThisToday: firstWhy,
    bidUsd: 5,
    day,
  });
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const firstEvent = waffoOrderEvent({
      intentId: first.id,
      intentFingerprint: first.intentFingerprint!,
      metadataFingerprint: first.metadataFingerprint!,
      productUrl: first.productUrl,
      whyTestThisToday: firstWhy,
      bidUsd: first.bidUsd,
      chargeUsd: first.chargeUsd,
      day,
      suffix: "first-raise",
      overrides: { timestamp: "2026-08-27T10:00:00.000Z" },
    });
    const firstSigned = signedWaffo(firstEvent);
    const firstResponse = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: firstSigned.headers,
      payload: firstSigned.raw,
    });
    assert.equal(firstResponse.statusCode, 200);

    const raisedWhy = "A signed Waffo raise pays only the seven-dollar difference";
    const raised = createWaffoReservation(db, {
      productUrl,
      whyTestThisToday: raisedWhy,
      bidUsd: 12,
      day,
    });
    assert.equal(raised.chargeUsd, 7);
    const raiseEvent = waffoOrderEvent({
      intentId: raised.id,
      intentFingerprint: raised.intentFingerprint!,
      metadataFingerprint: raised.metadataFingerprint!,
      productUrl: raised.productUrl,
      whyTestThisToday: raisedWhy,
      bidUsd: raised.bidUsd,
      chargeUsd: raised.chargeUsd,
      quoteBaseBidUsd: raised.quoteBaseBidUsd,
      day,
      suffix: "second-raise",
      overrides: { timestamp: "2026-08-27T11:00:00.000Z" },
    });
    const raiseSigned = signedWaffo(raiseEvent);
    const raiseResponse = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: raiseSigned.headers,
      payload: raiseSigned.raw,
    });
    assert.equal(raiseResponse.statusCode, 200);
    const listing = listToday(db, day)[0];
    assert.ok(listing);
    assert.equal(listing.bidUsd, 12);
    assert.equal(listing.paidUsd, 12);
    assert.equal(listing.createdAt, "2026-08-27T10:00:00.000Z");
    assert.equal(listToday(db, day).length, 1);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo stale captured raises reconcile without producing a $19 row", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const productUrl = "https://stale-waffo.example/sku";
  const base = placeBid(db, {
    id: "stale-waffo-base",
    productUrl,
    whyTestThisToday: "An earlier paid cover exists",
    bidUsd: 5,
    day,
    createdAt: "2026-08-27T08:00:00.000Z",
  });
  const reservation = createWaffoReservation(db, {
    productUrl,
    whyTestThisToday: "Two captured raises must not stack",
    bidUsd: 12,
    day,
  });
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    // A separate winner moved the live row before this captured payment was
    // delivered, making the saved $5 -> $12 quote stale.
    db.prepare("UPDATE listings SET bid_usd = 12, paid_usd = 12 WHERE id = ?").run(base.id);
    const event = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday: "Two captured raises must not stack",
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      quoteBaseBidUsd: reservation.quoteBaseBidUsd,
      day,
      suffix: "stale-raise",
    });
    const signed = signedWaffo(event);
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(response.statusCode, 202);
    assert.equal(response.json().status, "needs_reconciliation");
    assert.equal(findPaymentIntent(db, reservation.id)?.state, "needs_reconciliation");
    assert.equal(listToday(db, day)[0]?.bidUsd, 12);
    assert.equal(listToday(db, day)[0]?.paidUsd, 12);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo settlement survives a restart and is visible to a second app instance", async () => {
  const directory = mkdtempSync(join(tmpdir(), "dtc-waffo-two-instances-"));
  const databasePath = join(directory, "board.sqlite");
  let firstDb: ReturnType<typeof openDatabase> | undefined;
  let secondDb: ReturnType<typeof openDatabase> | undefined;
  let firstApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  let secondApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    firstDb = openDatabase(databasePath);
    const reservation = createWaffoReservation(firstDb, {
      productUrl: "https://restart-waffo.example/sku",
      whyTestThisToday: "The durable Waffo intent survives two app instances",
      bidUsd: 5,
      day: "2026-08-27",
    });
    const event = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday: "The durable Waffo intent survives two app instances",
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day: "2026-08-27",
      suffix: "restart",
    });
    const signed = signedWaffo(event);
    firstApp = await buildApp({ db: firstDb, checkout: new WaffoCheckout({ env: waffoEnv() }) });
    secondDb = openDatabase(databasePath);
    secondApp = await buildApp({ db: secondDb, checkout: new WaffoCheckout({ env: waffoEnv() }) });
    const settled = await secondApp.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(settled.statusCode, 200);
    assert.equal(listToday(firstDb, "2026-08-27").length, 1);
    assert.equal(listToday(secondDb, "2026-08-27").length, 1);
  } finally {
    if (firstApp) await firstApp.close();
    if (secondApp) await secondApp.close();
    firstDb?.close();
    secondDb?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Waffo invalid identity, provider values, and unknown intents never rank", async () => {
  const day = "2026-08-27";
  const cases: Array<{ name: string; overrides: WaffoEventOptions["overrides"] }> = [
    { name: "wrong mode", overrides: { mode: "prod" } },
    { name: "wrong store", overrides: { storeId: "STO_2234567890123456789012" } },
    { name: "wrong status", overrides: { orderStatus: "confirmed" } },
    { name: "wrong payment", overrides: { paymentStatus: "pending" } },
    { name: "wrong currency", overrides: { currency: "EUR" } },
    { name: "wrong product", overrides: { productId: "PROD_2234567890123456789012" } },
    { name: "missing provider product metadata", overrides: { omitProductMetadata: true } },
    { name: "wrong amount", overrides: { amount: "6.00", subtotal: "6.00", total: "6.00" } },
    { name: "wrong metadata fingerprint", overrides: { metadata: { intentFingerprint: "tampered" } } },
    { name: "event id is not payment id", overrides: { eventId: "EVT_2234567890123456789012" } },
    { name: "malformed subtotal", overrides: { subtotal: "5.000" } },
    { name: "malformed total", overrides: { total: "not-money" } },
    { name: "malformed amount", overrides: { amount: "5.000" } },
    { name: "malformed tax", overrides: { taxAmount: "0.005" } },
    {
      name: "amount contradicts subtotal and total with tax",
      overrides: { amount: "5.00", taxAmount: "0.50", subtotal: "5.00", total: "7.00" },
    },
    {
      name: "missing subtotal with tax",
      overrides: { omitSubtotal: true, amount: "5.50", taxAmount: "0.50", total: "5.50" },
    },
    { name: "missing amount", overrides: { omitAmount: true } },
    { name: "missing tax", overrides: { omitTaxAmount: true } },
  ];
  for (const testCase of cases) {
    const db = openDatabase(":memory:");
    const productUrl = `https://invalid-${testCase.name.replaceAll(" ", "-")}.example/sku`;
    const whyTestThisToday = `Reject ${testCase.name}`;
    const reservation = createWaffoReservation(db, {
      productUrl,
      whyTestThisToday,
      bidUsd: 5,
      day,
    });
    const checkout = new WaffoCheckout({ env: waffoEnv() });
    const app = await buildApp({ db, checkout });
    try {
      const event = waffoOrderEvent({
        intentId: reservation.id,
        intentFingerprint: reservation.intentFingerprint!,
        metadataFingerprint: reservation.metadataFingerprint!,
        productUrl: reservation.productUrl,
        whyTestThisToday,
        bidUsd: reservation.bidUsd,
        chargeUsd: reservation.chargeUsd,
        day,
        suffix: testCase.name.slice(0, 2),
        overrides: testCase.overrides,
      });
      const signed = signedWaffo(event);
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/waffo",
        headers: signed.headers,
        payload: signed.raw,
      });
      assert.notEqual(response.statusCode, 200, testCase.name);
      assert.equal(listToday(db, day).length, 0, testCase.name);
    } finally {
      await app.close();
      db.close();
    }
  }

  const db = openDatabase(":memory:");
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const unknownEvent = waffoOrderEvent({
      intentId: "missing-local-intent",
      intentFingerprint: "a".repeat(64),
      metadataFingerprint: "b".repeat(64),
      productUrl: "https://unknown.example/sku",
      whyTestThisToday: "Unknown intent must not rank",
      bidUsd: 5,
      chargeUsd: 5,
      day,
      suffix: "unknown",
    });
    const signed = signedWaffo(unknownEvent);
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().status, "rejected");
    assert.equal(listToday(db, day).length, 0);
  } finally {
    await app.close();
    db.close();
  }
});

test("Waffo webhook rollback leaves intent open and allows a later retry", async () => {
  const db = openDatabase(":memory:");
  const day = "2026-08-27";
  const productUrl = "https://rollback.example/sku";
  const whyTestThisToday = "A listing trigger simulates a transaction crash";
  const reservation = createWaffoReservation(db, {
    productUrl,
    whyTestThisToday,
    bidUsd: 5,
    day,
  });
  const app = await buildApp({ db, checkout: new WaffoCheckout({ env: waffoEnv() }) });
  try {
    const event = waffoOrderEvent({
      intentId: reservation.id,
      intentFingerprint: reservation.intentFingerprint!,
      metadataFingerprint: reservation.metadataFingerprint!,
      productUrl: reservation.productUrl,
      whyTestThisToday,
      bidUsd: reservation.bidUsd,
      chargeUsd: reservation.chargeUsd,
      day,
      suffix: "rollback",
    });
    const signed = signedWaffo(event);
    db.exec(
      "CREATE TRIGGER fail_waffo_listing BEFORE INSERT ON listings BEGIN SELECT RAISE(ABORT, 'injected listing failure'); END",
    );
    const failed = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(failed.statusCode, 500);
    assert.equal(listToday(db, day).length, 0);
    assert.equal(findPaymentIntent(db, reservation.id)?.state, "open");
    assert.equal(
      db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM waffo_webhook_deliveries").get()?.count,
      0,
    );
    db.exec("DROP TRIGGER fail_waffo_listing");

    const retried = await app.inject({
      method: "POST",
      url: "/webhooks/waffo",
      headers: signed.headers,
      payload: signed.raw,
    });
    assert.equal(retried.statusCode, 200);
    assert.equal(retried.json().status, "applied");
    assert.equal(listToday(db, day).length, 1);
  } finally {
    await app.close();
    db.close();
  }
});

test("same-day canonical URL reservation rejects a second open checkout", async () => {
  const db = openDatabase(":memory:");
  const checkout = new CountingFixtureCheckout({ autoComplete: false });
  const app = await buildApp({ db, checkout });
  try {
    const first = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({
        productUrl: "https://store.example/sku?utm_source=first",
        whyTestThisToday: "The first checkout owns this URL",
        bidUsd: "10",
      }),
    });
    assert.equal(first.statusCode, 303);
    const firstId = new URL(
      String(first.headers.location),
      "http://localhost",
    ).searchParams.get("session");
    assert.ok(firstId);
    assert.equal(checkout.createCalls, 1);
    assert.equal(listToday(db, dayKey()).length, 0);

    const blocked = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({
        productUrl: "https://store.example/sku?aff=second",
        whyTestThisToday: "The second checkout must be rejected",
        bidUsd: "10",
      }),
    });
    assert.equal(blocked.statusCode, 409);
    assert.match(blocked.body, /checkout already in progress/);
    assert.equal(checkout.createCalls, 1);

    const completed = await app.inject({
      method: "GET",
      url: "/checkout/complete?session=" + encodeURIComponent(firstId),
    });
    assert.equal(completed.statusCode, 303);
    assert.equal(listToday(db, dayKey()).length, 1);

    const replay = await app.inject({
      method: "GET",
      url: "/checkout/complete?session=" + encodeURIComponent(firstId),
    });
    assert.equal(replay.statusCode, 303);
    const listings = listToday(db, dayKey());
    assert.equal(listings.length, 1);
    assert.equal(listings[0]?.productUrl, "https://store.example/sku");
    assert.equal(listings[0]?.bidUsd, 10);
  } finally {
    await app.close();
    db.close();
  }
});

test("open checkout reservation survives a SQLite restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "dtc-picks-restart-"));
  const databasePath = join(directory, "board.sqlite");
  let firstDb: ReturnType<typeof openDatabase> | undefined;
  let firstApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  let secondDb: ReturnType<typeof openDatabase> | undefined;
  let secondApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    firstDb = openDatabase(databasePath);
    const firstCheckout = new CountingFixtureCheckout({ autoComplete: false });
    firstApp = await buildApp({ db: firstDb, checkout: firstCheckout });
    const started = await firstApp.inject({
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({
        productUrl: "https://restart.example/sku?utm_source=first",
        whyTestThisToday: "Open checkout must survive a restart",
        bidUsd: "11",
      }),
    });
    assert.equal(started.statusCode, 303);
    assert.equal(firstCheckout.createCalls, 1);
    await firstApp.close();
    firstApp = undefined;
    firstDb.close();
    firstDb = undefined;

    secondDb = openDatabase(databasePath);
    const secondCheckout = new CountingFixtureCheckout({ autoComplete: false });
    secondApp = await buildApp({ db: secondDb, checkout: secondCheckout });
    const blocked = await secondApp.inject({
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({
        productUrl: "https://restart.example/sku?aff=second",
        whyTestThisToday: "Restart must not double-charge this URL",
        bidUsd: "11",
      }),
    });
    assert.equal(blocked.statusCode, 409);
    assert.match(blocked.body, /checkout already in progress/);
    assert.equal(secondCheckout.createCalls, 0);
  } finally {
    if (firstApp) await firstApp.close();
    firstDb?.close();
    if (secondApp) await secondApp.close();
    secondDb?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("checkout completion surfaces an already-paid apply conflict", async () => {
  const db = openDatabase(":memory:");
  const checkout = new CountingFixtureCheckout({ autoComplete: false });
  const app = await buildApp({ db, checkout });
  try {
    const started = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({
        productUrl: "https://conflict.example/sku",
        whyTestThisToday: "A paid conflict must not be swallowed",
        bidUsd: "10",
      }),
    });
    const sessionId = new URL(
      String(started.headers.location),
      "http://localhost",
    ).searchParams.get("session");
    assert.ok(sessionId);

    applyPaidBid(db, {
      sessionId: "external_paid_conflict",
      productUrl: "https://conflict.example/sku",
      whyTestThisToday: "Another paid event already took this bid",
      bidUsd: 10,
      day: dayKey(),
      paidUsd: 10,
      paidAt: new Date().toISOString(),
    });

    const conflict = await app.inject({
      method: "GET",
      url: "/checkout/complete?session=" + encodeURIComponent(sessionId),
    });
    assert.equal(conflict.statusCode, 409);
    assert.match(conflict.body, /strictly greater|already applied/);
    assert.equal(listToday(db, dayKey()).length, 1);
  } finally {
    await app.close();
    db.close();
  }
});

test("duplicate paid event is idempotent but a mismatched replay is rejected", () => {
  const db = openDatabase(":memory:");
  try {
    const paid = {
      sessionId: "replayable_paid_event",
      productUrl: "https://replay.example/sku",
      whyTestThisToday: "Replay this payment without a second row",
      bidUsd: 10,
      day: "2026-08-22",
      paidUsd: 10,
      paidAt: "2026-08-22T09:00:00.000Z",
    };
    const first = applyPaidBid(db, paid);
    const replay = applyPaidBid(db, paid);
    assert.equal(replay.id, first.id);
    assert.equal(listToday(db, paid.day).length, 1);
    assert.throws(
      () =>
        applyPaidBid(db, {
          ...paid,
          productUrl: "https://other.example/sku",
        }),
      /already applied/,
    );
  } finally {
    db.close();
  }
});

test("SPEC acceptance 2: fixture pay $5 lists at #1 with 0 clicks", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://store.example/sku",
      whyTestThisToday: "Test this restock on today's brief",
      bidUsd: String(MIN_BID_USD),
    }),
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, "/");

  const board = await app.inject({ method: "GET", url: "/" });
  assert.equal(board.statusCode, 200);
  assert.doesNotMatch(board.body, /data-empty-board/);
  assert.match(board.body, /store\.example\/sku/);
  assert.match(board.body, /data-rank="1"/);
  assert.match(board.body, /\$5/);
  assert.match(board.body, /0 clicks/);

  const listings = listToday(app.db, dayKey());
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.rank, 1);
  assert.equal(listings[0]?.bidUsd, 5);
  assert.equal(listings[0]?.clicks, 0);
  assert.equal(listings[0]?.productUrl, "https://store.example/sku");
});

test("SPEC acceptance 3: underbid still lists below today's #1", async () => {
  const db = openDatabase(":memory:");
  const day = dayKey();
  placeBid(db, {
    id: "lst-cover",
    day,
    productUrl: "https://cover.example/apps/pick",
    whyTestThisToday: "Cover app sellers should install this morning",
    bidUsd: 20,
    createdAt: "2026-08-22T09:00:00.000Z",
  });

  const app = await buildApp({ db });
  after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://under.example/sku",
      whyTestThisToday: "Cheaper SKU still belongs on the brief",
      bidUsd: "8",
    }),
  });
  assert.equal(response.statusCode, 303);

  const listings = listToday(db, day);
  assert.equal(listings.length, 2);
  assert.equal(listings[0]?.id, "lst-cover");
  assert.equal(listings[0]?.rank, 1);
  assert.equal(listings[1]?.productUrl, "https://under.example/sku");
  assert.equal(listings[1]?.bidUsd, 8);
  assert.equal(listings[1]?.rank, 2);
  assert.notEqual(listings[1]?.rank, 1);
});

test("abandoned fixture session does not insert a listing", async () => {
  const checkout = new FixtureCheckout({ autoComplete: false });
  const app = await buildApp({ databasePath: ":memory:", checkout });
  after(() => app.close());

  const started = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://ghost.example/sku",
      whyTestThisToday: "Abandoned Waffo fixture session must not list",
      bidUsd: "12",
    }),
  });
  assert.equal(started.statusCode, 303);
  const location = String(started.headers.location ?? "");
  assert.match(location, /\/checkout\/complete\?session=/);
  assert.equal(listToday(app.db, dayKey()).length, 0);

  const sessionId = new URL(location, "http://localhost").searchParams.get("session");
  assert.ok(sessionId);
  await checkout.abandonSession(sessionId);

  const complete = await app.inject({
    method: "GET",
    url: `/checkout/complete?session=${encodeURIComponent(sessionId)}`,
  });
  assert.equal(complete.statusCode, 303);
  assert.equal(complete.headers.location, "/");
  assert.equal(listToday(app.db, dayKey()).length, 0);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /data-empty-board/);
  assert.match(board.body, /data-empty-cover=""/);
  assert.match(board.body, /name="productUrl"/);
  assert.match(board.body, /name="whyTestThisToday"/);
  assert.match(board.body, />Claim rank/);
  assert.doesNotMatch(board.body, /take-after-list|list-after-take|empty-claim-first|data-empty-claim|data-first-click="claim"/);
  assert.doesNotMatch(board.body, /data-later-write|data-why-later|Then the product URL|Then why test this today/);
  assert.doesNotMatch(board.body, /ghost\.example/);
  assert.doesNotMatch(board.body, /data-paid-name=/);
  assert.doesNotMatch(board.body, /This morning’s cover/);
  assert.doesNotMatch(board.body, /data-cover-hop/);
});

test("open fixture session lists only after complete", async () => {
  const checkout = new FixtureCheckout({ autoComplete: false });
  const app = await buildApp({ databasePath: ":memory:", checkout });
  after(() => app.close());

  const started = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://later.example/sku",
      whyTestThisToday: "Pay later still claims the rank",
      bidUsd: "7",
    }),
  });
  const sessionId = new URL(
    String(started.headers.location),
    "http://localhost",
  ).searchParams.get("session");
  assert.ok(sessionId);
  assert.equal(listToday(app.db, dayKey()).length, 0);

  const complete = await app.inject({
    method: "GET",
    url: `/checkout/complete?session=${encodeURIComponent(sessionId)}`,
  });
  assert.equal(complete.statusCode, 303);
  const listings = listToday(app.db, dayKey());
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.bidUsd, 7);
  assert.equal(listings[0]?.rank, 1);
});

test("bids below $5 are rejected and never charged", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://cheap.example/sku",
      whyTestThisToday: "Four dollars is under the floor",
      bidUsd: "4",
    }),
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.body, /whole dollar >= 5/);
  assert.equal(listToday(app.db, dayKey()).length, 0);
});
