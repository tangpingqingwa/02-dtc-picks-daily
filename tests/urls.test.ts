import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { applyPaidBid, listToday, placeBid } from "../src/core/board.js";
import { dayKey } from "../src/core/day.js";
import {
  canonicalizeProductUrl,
  isTrackingQueryKey,
  normalizeWhyTestThisToday,
  UrlError,
} from "../src/core/urls.js";
import { openDatabase } from "../src/db.js";

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

test("SPEC acceptance 6: strip utm_source and aff before store", () => {
  assert.equal(
    canonicalizeProductUrl("https://store.example/p?utm_source=x&aff=1"),
    "https://store.example/p",
  );
  assert.equal(
    canonicalizeProductUrl("https://Store.Example/p/?utm_campaign=ad#frag"),
    "https://store.example/p",
  );
  assert.equal(
    canonicalizeProductUrl("https://store.example:443/p?ref=x&fbclid=abc&keep=1"),
    "https://store.example/p?keep=1",
  );
  assert.equal(isTrackingQueryKey("utm_source"), true);
  assert.equal(isTrackingQueryKey("ref_src"), true);
  assert.equal(isTrackingQueryKey("keep"), false);

  const db = openDatabase(":memory:");
  try {
    const listing = placeBid(db, {
      day: "2026-08-22",
      productUrl: "https://store.example/p?utm_source=x&aff=1",
      whyTestThisToday: "Tracking must not survive on the stored URL",
      bidUsd: 5,
    });
    assert.equal(listing.productUrl, "https://store.example/p");
    assert.doesNotMatch(listing.productUrl, /utm_/);
    assert.doesNotMatch(listing.productUrl, /aff=/);
  } finally {
    db.close();
  }
});

test("Amazon and Shopify listings are keyed by path, not leftover query", () => {
  assert.equal(
    canonicalizeProductUrl("https://www.amazon.com/dp/B00TEST123?tag=aff-20&linkCode=ll1&psc=1"),
    "https://www.amazon.com/dp/B00TEST123",
  );
  assert.notEqual(
    canonicalizeProductUrl("https://www.amazon.com/dp/B00TEST123"),
    canonicalizeProductUrl("https://www.amazon.com/dp/B00OTHER99"),
  );
  assert.equal(
    canonicalizeProductUrl("https://brand.myshopify.com/products/widget?ref=tweet"),
    "https://brand.myshopify.com/products/widget",
  );
});

test("SPEC acceptance 7: chat invite t.me is rejected with no charge", async () => {
  assert.throws(
    () => canonicalizeProductUrl("https://t.me/joinchat/abc"),
    (error: unknown) => {
      assert.ok(error instanceof UrlError);
      assert.equal(error.code, "chat_forbidden");
      return true;
    },
  );
  assert.throws(() => canonicalizeProductUrl("https://discord.gg/invite"), /chat/);
  assert.throws(() => canonicalizeProductUrl("https://wa.me/15551234567"), /chat/);

  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());
  const response = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://t.me/joinchat/abc",
      whyTestThisToday: "Chat links must never be charged",
      bidUsd: "12",
    }),
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.body, /chat and invite links are not allowed/);
  assert.equal(listToday(app.db, dayKey()).length, 0);
});

test("SPEC acceptance 8: adult URL or sexual blurb is rejected with no charge", async () => {
  assert.throws(
    () => canonicalizeProductUrl("https://www.pornhub.com/view_video.php?viewkey=1"),
    (error: unknown) => {
      assert.ok(error instanceof UrlError);
      assert.equal(error.code, "nsfw_forbidden");
      return true;
    },
  );
  assert.throws(
    () => normalizeWhyTestThisToday("Try this porn funnel on today's brief"),
    (error: unknown) => {
      assert.ok(error instanceof UrlError);
      assert.equal(error.code, "nsfw_forbidden");
      return true;
    },
  );

  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const adultUrl = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://onlyfans.com/creator",
      whyTestThisToday: "Adult platforms are banned from the brief",
      bidUsd: "12",
    }),
  });
  assert.equal(adultUrl.statusCode, 400);
  assert.match(adultUrl.body, /adult URLs are not allowed/);

  const sexualCopy = await app.inject({
    method: "POST",
    url: "/checkout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: form({
      productUrl: "https://store.example/sku",
      whyTestThisToday: "Sellers should test this NSFW landing page",
      bidUsd: "12",
    }),
  });
  assert.equal(sexualCopy.statusCode, 400);
  assert.match(sexualCopy.body, /sexual content is not allowed/);
  assert.equal(listToday(app.db, dayKey()).length, 0);
});

test("non-https, credentials, localhost, and shorteners are rejected", () => {
  assert.throws(() => canonicalizeProductUrl("http://store.example/p"), /https/);
  assert.throws(() => canonicalizeProductUrl("javascript:alert(1)"), /https/);
  assert.throws(() => canonicalizeProductUrl("https://user:pass@store.example/p"), /credentials/);
  assert.throws(() => canonicalizeProductUrl("https://localhost/p"), /local host/);
  assert.throws(() => canonicalizeProductUrl("https://127.0.0.1/p"), /local host/);
  for (const host of [
    "[::1]",
    "[::]",
    "[fc00::1]",
    "[fd12:3456:789a::1]",
    "[fe80::1]",
    "[::ffff:127.0.0.1]",
    "[::ffff:192.168.1.1]",
    "localhost.",
  ]) {
    assert.throws(
      () => canonicalizeProductUrl(`https://${host}/sku`),
      /local host/,
      host,
    );
  }
  assert.throws(() => canonicalizeProductUrl("https://bit.ly/abc"), /shortener/);
  assert.throws(() => canonicalizeProductUrl("https://t.co/abc"), /shortener/);
  assert.throws(() => normalizeWhyTestThisToday("short"), /8–140/);
});

test("paid apply stores the stripped URL so clicks never keep tracking keys", () => {
  const db = openDatabase(":memory:");
  try {
    const listing = applyPaidBid(db, {
      sessionId: "chk_strip",
      productUrl: "https://store.example/p?utm_source=x&aff=1#deal",
      whyTestThisToday: "Clicks go to the stripped product URL",
      bidUsd: 5,
      day: "2026-08-22",
      paidUsd: 5,
      paidAt: "2026-08-22T09:00:00.000Z",
    });
    assert.equal(listing.productUrl, "https://store.example/p");
    assert.doesNotMatch(listing.productUrl, /utm_source/);
    assert.doesNotMatch(listing.productUrl, /aff=/);
  } finally {
    db.close();
  }
});

test("tracking-only identity with no product path is rejected", () => {
  assert.throws(
    () => canonicalizeProductUrl("https://store.example/?utm_source=x&aff=1"),
    /identify a product after stripping tracking/,
  );
});
