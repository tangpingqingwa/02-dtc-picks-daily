import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCheckoutStatusPage } from "../src/http/checkout.js";
import { renderAboutPage } from "../src/http/pages/about.js";
import { renderRulesPage } from "../src/http/pages/rules.js";
import { renderBoardPage } from "../src/views/board.js";
import { BOARD_CSS } from "../src/views/styles.js";

const FOOTER_MARKER = 'data-maker-contact=""';
const CONTACT_HREF = 'href="mailto:tangpingqingwa@gmail.com"';

test("all public layouts include one exact maker contact footer", () => {
  const pages = [
    renderBoardPage({
      day: "2026-09-01",
      tz: "UTC",
      listings: [],
      last24h: [],
      defaultBidUsd: 5,
    }),
    renderAboutPage({ day: "2026-09-01", tz: "UTC" }),
    renderRulesPage({ day: "2026-09-01", tz: "UTC" }),
    renderCheckoutStatusPage(undefined, "2026-09-01", "UTC"),
  ];

  for (const page of pages) {
    assert.equal((page.match(new RegExp(FOOTER_MARKER, "g")) ?? []).length, 1);
    assert.equal((page.match(new RegExp(CONTACT_HREF, "g")) ?? []).length, 1);
    assert.match(
      page,
      /<footer class="maker-footer" data-maker-contact="">\s*<p>Built by <a href="mailto:tangpingqingwa@gmail\.com">tangpingqingwa@gmail\.com<\/a><\/p>/,
    );
  }
});

test("maker contact uses the desk skin and keeps keyboard focus visible", () => {
  assert.match(BOARD_CSS, /\.maker-footer\s*\{/);
  assert.match(BOARD_CSS, /\.maker-footer a:hover\s*\{/);
  assert.match(BOARD_CSS, /\.maker-footer a:focus-visible\s*\{/);
  assert.match(BOARD_CSS, /width:\s*min\(1120px, calc\(100% - 48px\)\)/);
  assert.match(BOARD_CSS, /overflow-wrap:\s*anywhere/);
});
