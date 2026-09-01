#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# When application code lands, add unit/contract tests here. Do not delete the
# contract checks. Do not require live Waffo or other third-party networks.
# Operator live smoke is scripts/live-smoke.sh and is never invoked from here.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== contract files =="
for f in README.md SPEC.md BUILD.md CONTRIBUTING.md scripts/test.sh .github/workflows/ci.yml; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done

echo "== contributing rules are documented =="
grep -q 'main must always be buildable' CONTRIBUTING.md \
  || grep -q 'main` must always be buildable' CONTRIBUTING.md \
  || fail "CONTRIBUTING.md does not state the main-branch rule"

echo "== SPEC mentions git collaboration =="
grep -q 'Git collaboration' SPEC.md || fail "SPEC.md missing Git collaboration section"

echo "== SPEC clones outbid.lol ranking =="
grep -q 'no ads' SPEC.md || fail "SPEC.md missing no-ads rule"
grep -q 'no API keys' SPEC.md || fail "SPEC.md missing no-API-keys rule"
grep -q 'no revenue share' SPEC.md || fail "SPEC.md missing no-revenue-share rule"
grep -q '\$5' SPEC.md || fail "SPEC.md missing \$5 minimum bid"
grep -q 'older' SPEC.md || fail "SPEC.md missing older-wins-ties rule"
grep -q 'difference' SPEC.md || fail "SPEC.md missing raise-pays-difference rule"
grep -q 'UTC' SPEC.md || fail "SPEC.md missing UTC default timezone"
grep -q 'why test this today' SPEC.md || fail "SPEC.md missing listing blurb"
grep -q 'Waffo' SPEC.md || fail "SPEC.md missing Waffo checkout"
grep -q 'PAYMENT_MODE=waffo-test' SPEC.md || fail "SPEC.md missing explicit Waffo test mode"
grep -q '/webhooks/waffo' SPEC.md || fail "SPEC.md missing Waffo webhook path"
grep -q 'Waffo Pancake' BUILD.md || fail "BUILD.md missing Waffo provider"
grep -q 'PAYMENT_MODE=waffo-test' docs/live-smoke.md || fail "live-smoke docs missing Waffo mode"
if grep -Eiq 'POLAR_LIVE=1|POLAR_ACCESS_TOKEN|api\.polar\.sh' SPEC.md BUILD.md docs/live-smoke.md; then
  fail "authoritative Waffo contracts must not select legacy Polar"
fi

echo "== BUILD has ordered PR sequence =="
grep -q '### PR 1: skeleton' BUILD.md || fail "BUILD.md missing ### PR 1: skeleton"
grep -q '### PR 2: board UI' BUILD.md || fail "BUILD.md missing ### PR 2: board UI"
grep -q '### PR 3: checkout' BUILD.md || fail "BUILD.md missing ### PR 3: checkout"
grep -q '### PR 4: raise-bid' BUILD.md || fail "BUILD.md missing ### PR 4: raise-bid"
grep -q '### PR 5: rules' BUILD.md || fail "BUILD.md missing ### PR 5: rules/about"
grep -q '### PR 6: live-smoke' BUILD.md || fail "BUILD.md missing ### PR 6: live-smoke"

echo "== CI job is named ci =="
grep -q '^name: ci$' .github/workflows/ci.yml || fail "workflow name is not ci"
grep -Eq '^  ci:' .github/workflows/ci.yml || fail "missing jobs.ci"
grep -q 'bash scripts/test.sh' .github/workflows/ci.yml || fail "ci.yml does not run scripts/test.sh"
if grep -Eq 'POLAR_LIVE=1|PAYMENT_MODE=waffo-(test|prod)' .github/workflows/ci.yml; then
  fail "ci.yml must not enable a live payment provider"
fi
if grep -q 'scripts/live-smoke.sh' .github/workflows/ci.yml; then
  fail "live-smoke.sh must not be called from Actions"
fi

echo "== live-smoke stays operator-only =="
[[ -f scripts/live-smoke.sh ]] || fail "missing scripts/live-smoke.sh"
[[ -x scripts/live-smoke.sh ]] || fail "scripts/live-smoke.sh must be executable"
[[ -f docs/live-smoke.md ]] || fail "missing docs/live-smoke.md"
[[ -s docs/live-smoke.md ]] || fail "empty docs/live-smoke.md"
if grep -Eq '^\s*(bash )?(\./)?scripts/live-smoke\.sh' scripts/test.sh; then
  fail "test.sh must not invoke live-smoke.sh"
fi
if grep -E '^[[:space:]]*(export[[:space:]]+)?PAYMENT_MODE=waffo-(test|prod)' scripts/test.sh >/dev/null; then
  fail "test.sh must not enable a live Waffo mode"
fi
grep -q 'BLOCKED-SECRET: WAFFO_' scripts/live-smoke.sh \
  || fail "live-smoke.sh must name a Waffo blocked secret"
grep -q 'PAYMENT_MODE' scripts/live-smoke.sh \
  || fail "live-smoke.sh must gate Waffo on PAYMENT_MODE"
echo "== fixture smoke owns its server =="
python3 - <<'PY' || fail "live-smoke.sh must reject LIVE_SMOKE_BASE before side effects or requests"
from pathlib import Path

smoke = Path("scripts/live-smoke.sh").read_text()
guard = smoke.find("LIVE_SMOKE_BASE is disabled")
install_ci = smoke.find("npm ci")
install_npm = smoke.find("npm install")
workdir = smoke.find('WORKDIR="$(mktemp')
first_request = smoke.find('health_body="${WORKDIR}/healthz.json"')
guard_start = smoke.rfind('if [[ -n "${BASE}" ]]', 0, guard + 1)
guard_end = smoke.find("\nfi", guard_start)
guard_block = smoke[guard_start:guard_end] if guard_start >= 0 and guard_end >= 0 else ""
if (guard < 0 or guard_start < 0 or guard_end < 0 or install_ci < 0 or install_npm < 0
        or workdir < 0 or first_request < 0 or guard_start > install_ci
        or guard_start > install_npm or guard_start > workdir or guard_start > first_request
        or "exit 2" not in guard_block):
    raise SystemExit("LIVE_SMOKE_BASE guard must precede side effects and requests")
if "assuming existing server" in smoke:
    raise SystemExit("external server attachment must remain removed")
PY

echo "== operator docs match fixture boundary =="
python3 - <<'PY' || fail "operator docs must describe the fixture-only smoke boundary"
from pathlib import Path

live_docs = Path("docs/live-smoke.md").read_text()
build_docs = Path("BUILD.md").read_text()
for name, text in (("docs/live-smoke.md", live_docs), ("BUILD.md", build_docs)):
    folded = text.casefold()
    for marker in ("fixture-only", "loopback", "disposable sqlite", "live_smoke_base", "blocked-config", "before", "exit `2`"):
        if marker.casefold() not in folded:
            raise SystemExit(f"{name} missing operator-boundary marker {marker!r}")
    for forbidden in ("attaches to `live_smoke_base`", "starts (or assumes)"):
        if forbidden.casefold() in folded:
            raise SystemExit(f"{name} retains disabled external-server wording {forbidden!r}")
if "overrides: `live_smoke_base`" in live_docs.casefold():
    raise SystemExit("docs/live-smoke.md must not list LIVE_SMOKE_BASE as an override")
PY

echo "== no committed secrets =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files | grep -E '(^|/)\.env$|(^|/)id_rsa$|\.pem$|credentials\.json$' >/dev/null; then
    fail "secret-like path is tracked"
  fi
fi

echo "== markdown is UTF-8 text =="
file -b --mime-encoding README.md SPEC.md BUILD.md CONTRIBUTING.md | grep -qiE 'utf-8|us-ascii' \
  || fail "docs are not UTF-8/ASCII"

if [[ -f package.json ]]; then
  echo "== skeleton + board files =="
  for f in tsconfig.json src/server.ts src/app.ts src/http/health.ts tests/health.test.ts \
    src/db.ts src/migrations/001_init.sql src/core/board.ts src/core/day.ts \
    src/http/pages/board.ts src/views/board.ts src/views/layout.ts src/views/html.ts \
    src/views/styles.ts tests/rank.test.ts tests/pages.test.ts \
    src/config.ts src/billing/port.ts src/billing/fixture.ts \
    src/billing/waffo.ts src/billing/waffo-session.ts \
    src/http/checkout.ts src/http/webhook.ts src/migrations/002_checkouts.sql \
    src/migrations/003_checkout_reservations.sql \
    src/migrations/004_polar_webhook_deliveries.sql \
    src/migrations/005_waffo_payment_boundary.sql \
    src/migrations/006_waffo_webhook_conflicts.sql \
    src/migrations/007_waffo_tax_audit.sql \
    src/migrations/008_waffo_webhook_rejections.sql \
    src/migrations/009_waffo_conflict_identity_indexes.sql \
    tests/checkout.test.ts tests/fixtures/waffo/order-completed.json \
    src/core/network.ts src/core/urls.ts tests/raise.test.ts tests/urls.test.ts \
    src/http/pages/about.ts src/http/pages/rules.ts tests/day.test.ts \
    scripts/copy-migrations.mjs scripts/verify-built-artifact.mjs; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done

  echo "== install =="
  command -v npx >/dev/null || fail "npx missing but package.json exists"
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  echo "== Waffo verification stays offline =="
  unset WAFFO_LIVE WAFFO_MERCHANT_ID WAFFO_STORE_ID WAFFO_PRODUCT_ID WAFFO_PRIVATE_KEY \
    WAFFO_PRIVATE_KEY_FILE WAFFO_WEBHOOK_PUBLIC_KEY WAFFO_WEBHOOK_TEST_PUBLIC_KEY \
    WAFFO_WEBHOOK_PROD_PUBLIC_KEY || true
  export PAYMENT_MODE=fixture
  grep -q '"@waffo/pancake-ts": "0.19.1"' package.json \
    || fail "Waffo provider must use the pinned official SDK"
  grep -q 'WaffoPancake' src/billing/waffo-session.ts \
    || fail "Waffo provider must use the official SDK"
  grep -q 'verifyWebhook' src/billing/waffo-session.ts \
    || fail "Waffo webhook must use official verifyWebhook"
  grep -q 'waffo_webhook_deliveries' src/core/board.ts \
    || fail "Waffo webhook route must persist delivery identity"
  grep -q 'x-waffo-signature' src/billing/waffo.ts \
    || fail "Waffo webhook must read X-Waffo-Signature"
  if grep -Eiq 'WAFFO_LIVE.*return|return.*WAFFO_LIVE' src/billing/port.ts; then
    fail "legacy WAFFO_LIVE must not bypass explicit PAYMENT_MODE"
  fi
  if [[ -f .env.example ]]; then
    grep -q 'PAYMENT_MODE=fixture' .env.example \
      || fail ".env.example must show explicit fixture mode"
    grep -q 'POLAR variables below are retained as inert' .env.example \
      || fail ".env.example must quarantine legacy Polar variables"
  fi

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  echo "== unit tests =="
  # Quoted so bash 3.2 does not eat **; Node 22's test runner expands the glob.
  # Inject only — never hit a live payment provider.
  test_log="$(mktemp)"
  trap 'rm -f "$test_log"' EXIT
  set +e
  npx tsx --test --test-reporter spec 'tests/**/*.test.ts' | tee "$test_log"
  test_status=${PIPESTATUS[0]}
  set -e
  [[ $test_status -eq 0 ]] || fail "unit tests failed"
  grep -Eq 'tests[[:space:]]+[1-9][0-9]*' "$test_log" \
    || fail "test runner reported 0 tests"
  grep -q '/healthz' "$test_log" \
    || fail "healthz test did not run"
  grep -q 'rankListings' "$test_log" \
    || fail "rank test did not run"
  grep -q 'GET / is a public empty board' "$test_log" \
    || fail "empty-board page test did not run"
  grep -q 'fixture pay' "$test_log" \
    || fail "checkout fixture test did not run"
  grep -q 'underbid' "$test_log" \
    || fail "checkout underbid test did not run"
  grep -q 'abandoned' "$test_log" \
    || fail "abandoned checkout test did not run"
  grep -q 'SPEC acceptance 5' "$test_log" \
    || fail "raise test did not run"
  grep -q 'pays \$5 more' "$test_log" \
    || fail "raise difference test did not run"
  grep -q 'SPEC acceptance 6' "$test_log" \
    || fail "url strip test did not run"
  grep -q 'SPEC acceptance 7' "$test_log" \
    || fail "chat ban test did not run"
  grep -q 'SPEC acceptance 8' "$test_log" \
    || fail "NSFW ban test did not run"
  grep -q 'SPEC acceptance 10' "$test_log" \
    || fail "about/rules pages test did not run"
  grep -q 'GET /about publishes customer-facing product and cadence copy' "$test_log" \
    || fail "About public-promise test did not run"
  grep -q 'GET /rules publishes ranking, safety, and settlement rules without implementation copy' "$test_log" \
    || fail "Rules public-settlement test did not run"
  grep -q 'dayKey is YYYY-MM-DD' "$test_log" \
    || fail "day key test did not run"
  grep -q 'truthful readiness' "$test_log" \
    || fail "health readiness test did not run"
  grep -q 'formatIssueDate' "$test_log" \
    || fail "issue date test did not run"
  grep -q 'date as the issue' "$test_log" \
    || fail "morning cover issue-date test did not run"
  grep -q 'one Test action, one quiet List route' "$test_log" \
    || fail "occupied action-count test did not run"
  grep -q 'why-line read first and larger than \$bid' "$test_log" \
    || fail "cover why-line test did not run"
  grep -q 'honest last-24h strip' "$test_log" \
    || fail "rolling last-24h strip test did not run"
  grep -q 'rolling 24h window, not civil midnight' "$test_log" \
    || fail "rolling-window test did not run"
  grep -q 'quiet morning honest' "$test_log" \
    || fail "quiet-morning test did not run"
  grep -q 'last-24h strip rank a last-24h fact' "$test_log" \
    || fail "strip-rank test did not run"
  grep -q 'empty desk direct' "$test_log" \
    || fail "empty direct-form test did not run"
  grep -q 'morning and rolling-window prizes distinct' "$test_log" \
    || fail "two-prize test did not run"
  grep -q 'paid later ranks quieter' "$test_log" \
    || fail "later-rank test did not run"
  grep -q 'unpaid sessions off the desk' "$test_log" \
    || fail "unpaid-off test did not run"
  grep -q 'occupied Claim rail after the desk' "$test_log" \
    || fail "occupied claim-rail test did not run"
  grep -q 'Waffo signed settlement' "$test_log" \
    || fail "Waffo settlement test did not run"
  grep -q 'provider capture before local intent' "$test_log" \
    || fail "provider-time causality test did not run"
  grep -q 'migration DDL and marker roll back together' "$test_log" \
    || fail "migration atomicity test did not run"
  echo "== compiled artifact =="
  npm run build
  node scripts/verify-built-artifact.mjs
  echo "== board contract =="
  grep -q 'class="merch-desk desk' src/views/board.ts \
    || fail "board missing the DTC merch-desk shell"
  grep -q 'class="cover-board"' src/views/board.ts \
    || fail "board missing the cover surface"
  grep -q 'class="claim-drawer"' src/views/board.ts \
    || fail "board missing the claim drawer"
  grep -q 'data-identity-slot="ledger-row"' src/views/board.ts \
    || fail "board missing the later ledger identity"
  grep -q 'MERCH DESK / MORNING ISSUE' src/views/board.ts src/views/layout.ts \
    || fail "board missing the DTC issue voice"
  grep -Fq 'grid-template-columns: minmax(0, 720px) minmax(300px, 360px)' src/views/styles.ts \
    || fail "desktop merch-desk columns are missing"
  grep -Fq '"cover claim"' src/views/styles.ts \
    || fail "desktop cover/claim grid areas are missing"
  if grep -Eq 'OUTBID_REFERENCE_LISTINGS|isOutbidReferenceFixture|data-reference-fixture|outbid-today-reference|outbid-activity-reference|outbid-reference-fourth|1,404,927|see\\.io|tutti\\.so|joni\\.ai|/icons/outbid-mark\\.svg|outbid\\.lol' src/views/board.ts src/views/layout.ts src/views/styles.ts; then
    fail "reference fixture or copied Outbid shell remains in the DTC runtime"
  fi
  grep -q 'class="brand-mark" src="/icons/brand-mark.svg"' src/views/layout.ts \
    || fail "DTC identity must expose its owned brand mark"
  if grep -Eq 'renderDeskMark|renderSearchIcon|renderMoonIcon|renderLaneIcon|lane-icon|card-avatar|<svg\b' src/views/board.ts src/views/layout.ts src/views/styles.ts; then
    fail "DTC identity must not use handcrafted inline SVG or avatar layers"
  fi
  grep -q 'class="control-label">Find' src/views/layout.ts \
    || fail "Find control must be text-labelled"
  grep -q 'class="control-label">Theme' src/views/layout.ts \
    || fail "Theme control must be text-labelled"
  if grep -Fq 'name="category"' src/views/board.ts; then
    fail "presentation-only desk lanes must not enter the checkout payload"
  fi
  grep -q 'Claim #1 for' src/views/board.ts \
    || fail "board missing Claim #1 chrome"
  grep -q 'Outbid' src/views/board.ts \
    || fail "board missing Outbid button"
  grep -q 'data-empty-board' src/views/board.ts \
    || fail "board missing honest empty marker"
  grep -q 'data-empty-cover' src/views/board.ts \
    || fail "empty cover is not stamped honest"
  grep -q 'Quiet morning' src/views/board.ts \
    || fail "empty state is not a quiet morning"
  grep -q 'not an invented cover' src/views/board.ts \
    || fail "empty cover does not refuse an invented #1"
  grep -q 'data-occupied="false"' src/views/board.ts \
    || fail "empty desk missing occupied=false state"
  grep -q 'data-occupied="true"' src/views/board.ts \
    || fail "occupied desk missing occupied=true state"
  grep -q 'data-later-stack' src/views/board.ts \
    || fail "occupied later ranks missing later-stack grouping"
  grep -q 'data-later-rank' src/views/board.ts \
    || fail "occupied later ranks missing later-rank card stamp"
  grep -q 'class="dek"' src/views/board.ts \
    || fail "later-rank product names must drop cover host anatomy"
  grep -q 'class="slot"' src/views/board.ts \
    || fail "later-rank blurbs must sit as a slot"
  grep -q 'data-paid-name' src/views/board.ts \
    || fail "occupied cover missing paid-name stamp"
  grep -q 'data-cover-hop' src/views/board.ts \
    || fail "paid cover missing Test this today action"
  grep -q '>Test this today<' src/views/board.ts \
    || fail "cover action is not labeled Test this today"
  grep -q 'data-first-click="take"' src/views/board.ts \
    || fail "paid cover missing first-click take"
  grep -q 'data-list-route' src/views/board.ts \
    || fail "paid cover missing quiet List route"
  grep -q 'href="#why"' src/views/board.ts \
    || fail "List route does not land at Why"
  grep -q '>List a product<' src/views/board.ts \
    || fail "quiet List route is not labeled"
  grep -q 'data-cover-why' src/views/board.ts \
    || fail "paid cover missing why-line"
  grep -q 'data-prize-before-price' src/views/board.ts \
    || fail "cover missing prize-before-price mark"
  grep -q 'data-cover-name' src/views/board.ts \
    || fail "occupied cover missing product-name prize mark"
  grep -q 'data-later-fact' src/views/board.ts \
    || fail "occupied cover missing later-fact stamp"
  grep -q 'data-last24h' src/views/board.ts \
    || fail "board missing rolling last-24h strip"
  grep -q 'data-two-prizes' src/views/board.ts \
    || fail "occupied board missing two-prize composition"
  grep -q 'data-last24h-prize' src/views/board.ts \
    || fail "strip missing rolling-window prize mark"
  grep -q 'data-later-listing' src/views/board.ts \
    || fail "occupied claim rail missing later Product URL"
  grep -q 'data-prize-line' src/views/board.ts \
    || fail "occupied Why field missing prize-line mark"
  grep -q 'data-why-first' src/views/board.ts \
    || fail "occupied Why field missing why-first mark"
  grep -q 'data-list-land' src/views/board.ts \
    || fail "occupied List landing missing Why land mark"
  grep -q 'id="why"' src/views/board.ts \
    || fail "occupied List landing missing Why id"
  grep -q 'data-later-rail' src/views/board.ts \
    || fail "occupied claim rail missing later-rail mark"
  grep -q 'data-claim-after-cover' src/views/board.ts \
    || fail "occupied claim missing claim-after-cover wrap"
  grep -q 'data-claim-after-row' src/views/board.ts \
    || fail "later merch missing claim-after-row wrap"
  grep -q 'These product names are not this morning’s cover' src/views/board.ts \
    || fail "later stack must name later products as not the cover"
  if grep -Eq 'take-after-list|list-after-take|after Test this today|data-first-write="list"|empty-claim-first|data-empty-claim|data-first-click="claim"|data-later-write|data-why-later|data-listing-identity|Then the product URL|Then why test this today|data-list-after-cover' src/views/board.ts src/views/styles.ts; then
    fail "obsolete hop or empty staging residue remains in shipped board/styles"
  fi

  echo "== styles contract =="
  grep -q 'desk:has(.empty)' src/views/styles.ts \
    || fail "empty cover CSS missing honest occupied-chrome hiding"
  grep -Fq 'desk[data-occupied="false"] #claim' src/views/styles.ts \
    || fail "empty form CSS missing direct composition"
  grep -q 'list-route' src/views/styles.ts \
    || fail "quiet List route CSS missing"
  grep -Fq 'desk[data-occupied="true"] .list-route-wrap' src/views/styles.ts \
    || fail "occupied List route is not quiet"
  grep -Fq 'later-stack[data-later-stack]' src/views/styles.ts \
    || fail "later-rank CSS missing later-stack grouping"
  grep -Fq '[data-identity-slot="ledger-row"] .dek' src/views/styles.ts \
    || fail "ledger CSS missing quieter dek anatomy"
  grep -Fq '[data-identity-slot="ledger-row"] .slot' src/views/styles.ts \
    || fail "ledger CSS missing quieter slot anatomy"
  grep -Fq 'row-cover[data-paid-name]' src/views/styles.ts \
    || fail "paid-name CSS missing occupied cover identity"
  grep -Fq 'claim-after-cover[data-claim-after-cover]' src/views/styles.ts \
    || fail "occupied CSS missing claim-after-cover composition"
  grep -Fq 'claim-after-row[data-claim-after-row]' src/views/styles.ts \
    || fail "later merch CSS missing claim-after-row composition"
  grep -Fq 'later-rail[data-later-rail]' src/views/styles.ts \
    || fail "occupied claim rail CSS missing later-rail composition"
  grep -Fq '#claim .later-rail[data-later-rail] .claim-title' src/views/styles.ts \
    || fail "later-rail Claim #1 must include #claim"
  grep -Fq '#claim .later-rail[data-later-rail] .outbid' src/views/styles.ts \
    || fail "later-rail Outbid must include #claim"
  grep -Fq 'later-listing[data-later-listing]' src/views/styles.ts \
    || fail "occupied Product URL CSS missing later-listing composition"
  grep -Fq 'cover-why-line[data-prize-before-price]' src/views/styles.ts \
    || fail "cover why-line is not the prize"

  python3 - <<'PY' || fail "board markup contract is not direct and unambiguous"
from pathlib import Path
board = Path("src/views/board.ts").read_text()
css = Path("src/views/styles.ts").read_text()
for token in (
    "take-after-list", "list-after-take", "after Test this today",
    "data-first-write=\"list\"", "empty-claim-first", "data-empty-claim",
    "data-first-click=\"claim\"", "data-later-write", "data-why-later",
    "data-listing-identity", "Then the product URL", "Then why test this today",
    "data-list-after-cover",
):
    if token in board or token in css:
        raise SystemExit(token)
if board.count('data-cover-hop=""') != 1 or board.count('>Test this today</') != 1:
    raise SystemExit("one paid-cover Test action required")
if board.count('data-list-route=""') != 1 or board.count('>List a product</') != 1:
    raise SystemExit("one quiet paid-cover List route required")
form_start = board.find("const bidForm = html`")
form_end = board.find("</form>`", form_start)
if form_start < 0 or form_end < 0:
    raise SystemExit("claim form template missing")
form = board[form_start:form_end]
why_token = "${whyField}" if "${whyField}" in form else "${occupiedWhyLand}"
if "${productUrlField}" not in form or why_token not in form or ">Outbid<" not in form:
    raise SystemExit("claim form fields missing")
if not (form.find("${productUrlField}") < form.find(why_token) < form.find(">Outbid<")):
    raise SystemExit("claim form must order Product URL, Why, Outbid")
if board.count('data-first-click="take"') != 1:
    raise SystemExit("only the paid cover may own the first-click take stamp")
PY
  python3 scripts/assert-later-rail-cascade.py \
    || fail "occupied later-rail Claim #1 / Outbid lost the cascade to occupied #claim"
  grep -q 'You pay only the difference' src/views/board.ts \
    || fail "board missing raise-pays-difference copy"
  grep -q 'text-decoration-style: dashed' src/views/styles.ts \
    || fail "bid amount is not dashed"
  grep -q 'public auction for the cover' src/http/pages/about.ts \
    || fail "about copy missing customer-facing product purpose"
  grep -q 'transparent paid-placement board' src/http/pages/about.ts \
    || fail "about copy missing transparent paid-placement purpose"
  grep -q 'appears only after payment' src/http/pages/about.ts \
    || fail "about copy missing payment-confirmation rule"
  grep -q '\$5' src/http/pages/rules.ts \
    || fail "rules copy missing \$5 floor"
  grep -q 'listing placed first keeps the higher rank' src/http/pages/rules.ts \
    || fail "rules copy missing first-placed-wins ties"
  grep -q 'difference' src/http/pages/rules.ts \
    || fail "rules copy missing raise difference"
  grep -q 'This board follows' src/http/pages/rules.ts \
    || fail "rules copy missing public timezone rule"
  grep -q 'adult content' src/http/pages/rules.ts \
    || fail "rules copy missing adult-content ban"
  grep -q 'Tracking, referral, and affiliate parameters are removed' src/http/pages/rules.ts \
    || fail "rules copy missing tracking-removal rule"
  python3 - <<'PY' || fail "rules copy missing public product/payment contract"
from pathlib import Path

source = Path("src/http/pages/rules.ts").read_text()
start = source.index("export function renderRulesBody")
end = source.index("export function renderRulesPage")
body = source[start:end]
for marker in ("A listing appears only after its payment is confirmed", "incomplete", "failed", "canceled", "abandoned"):
    if marker not in body:
        raise SystemExit(f"rules body missing {marker!r}")
for marker in ("API key", "Waffo", "provider", "webhook", "order.completed", "valid signature"):
    if marker.lower() in body.lower():
        raise SystemExit(f"rules body exposes implementation marker {marker!r}")
PY
fi

echo "OK: buildable and testable"
