#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# When application code lands, add unit/contract tests here. Do not delete the
# contract checks. Do not require live Polar or other third-party networks.
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
grep -q 'Polar' SPEC.md || fail "SPEC.md missing Polar checkout"

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
if grep -q 'POLAR_LIVE=1' .github/workflows/ci.yml; then
  fail "ci.yml must not set POLAR_LIVE=1"
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
if grep -E '^[[:space:]]*(export[[:space:]]+)?POLAR_LIVE=1' scripts/test.sh >/dev/null; then
  fail "test.sh must not set POLAR_LIVE=1"
fi
grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' scripts/live-smoke.sh \
  || fail "live-smoke.sh must name BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
grep -q 'POLAR_LIVE' scripts/live-smoke.sh \
  || fail "live-smoke.sh must gate live Polar on POLAR_LIVE"

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
    src/config.ts src/billing/port.ts src/billing/fixture.ts src/billing/polar.ts \
    src/http/checkout.ts src/http/webhook.ts src/migrations/002_checkouts.sql \
    tests/checkout.test.ts tests/fixtures/polar/checkout-paid.json \
    tests/fixtures/polar/checkout-expired.json tests/fixtures/polar/underbid-paid.json \
    tests/fixtures/polar/checkout-created.json \
    src/core/urls.ts tests/raise.test.ts tests/urls.test.ts \
    src/http/pages/about.ts src/http/pages/rules.ts tests/day.test.ts; do
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

  echo "== Polar stays offline =="
  unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET || true
  export POLAR_FIXTURE_ONLY=1
  [[ "${POLAR_LIVE:-}" != "1" ]] || fail "POLAR_LIVE must stay unset in test.sh"
  if grep -E '"@polar-sh/sdk"|"@polar-sh/' package.json >/dev/null 2>&1; then
    fail "do not add a live Polar SDK; polar.ts is env-gated fetch only"
  fi
  if grep -R --include='*.ts' -E "from ['\"]@polar-sh" src tests >/dev/null 2>&1; then
    fail "src/tests must not import a Polar SDK"
  fi
  if grep -R --include='*.ts' -E "https://api\\.polar\\.sh" tests >/dev/null 2>&1; then
    fail "tests must not call live Polar"
  fi
  if grep -R --include='*.ts' -E "https://api\\.polar\\.sh" src >/dev/null 2>&1; then
    if grep -R --include='*.ts' -E "https://api\\.polar\\.sh" src | grep -v 'src/billing/polar.ts' >/dev/null 2>&1; then
      fail "only src/billing/polar.ts may mention the Polar API host"
    fi
  fi
  grep -q 'polarLiveEnabled' src/config.ts \
    || fail "live Polar client is not env-gated"

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  echo "== unit tests =="
  # Quoted so bash 3.2 does not eat **; Node 22's test runner expands the glob.
  # Inject only — never hit live Polar.
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
  grep -q 'empty board' "$test_log" \
    || fail "pages empty-board test did not run"
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
  grep -q 'utm_source' "$test_log" \
    || fail "utm strip assertion did not run"
  grep -q 'SPEC acceptance 7' "$test_log" \
    || fail "chat ban test did not run"
  grep -q 't.me' "$test_log" \
    || fail "telegram ban assertion did not run"
  grep -q 'SPEC acceptance 8' "$test_log" \
    || fail "NSFW ban test did not run"
  grep -q 'SPEC acceptance 10' "$test_log" \
    || fail "about/rules pages test did not run"
  grep -q '/about' "$test_log" \
    || fail "about page test did not run"
  grep -q '/rules' "$test_log" \
    || fail "rules page test did not run"
  grep -q 'dayKey is YYYY-MM-DD' "$test_log" \
    || fail "day key test did not run"
  grep -q 'formatIssueDate' "$test_log" \
    || fail "issue date test did not run"
  grep -q 'date as the issue' "$test_log" \
    || fail "morning cover issue-date test did not run"
  grep -q 'Test this today hop' "$test_log" \
    || fail "cover-hop shopper test did not run"
  grep -q 'List a product hop' "$test_log" \
    || fail "seller list-under-cover test did not run"
  grep -q 'why this is today’s cover' "$test_log" \
    || fail "cover why-line shopper test did not run"
  grep -q 'lists after the why-line' "$test_log" \
    || fail "seller list-after-why test did not run"
  grep -q 'takes the cover after list-after-why' "$test_log" \
    || fail "shopper take-after-list test did not run"
  grep -q 'lists after Test this today' "$test_log" \
    || fail "seller list-after-take test did not run"
  grep -q 'win the first click after list-after-take' "$test_log" \
    || fail "shopper take-after-list-hop first-click test did not run"
  grep -q 'concentrates List a product as the first write' "$test_log" \
    || fail "seller list-after-take first-write test did not run"
  grep -q 'concentrates Test this today after List a product' "$test_log" \
    || fail "shopper take-after-list-first test did not run"
  grep -q 'concentrates List a product after Test this today is re-concentrated' "$test_log" \
    || fail "seller list-after-take-two test did not run"
  grep -q 'concentrates Test this today after List a product is re-concentrated' "$test_log" \
    || fail "shopper take-after-list-two test did not run"
  grep -q 'concentrates List a product after Test this today is re-concentrated again' "$test_log" \
    || fail "seller list-after-take-three test did not run"
  grep -q 'concentrates Test this today after List a product is re-concentrated again' "$test_log" \
    || fail "shopper take-after-list-three test did not run"
  grep -q 'concentrates List a product after Test this today is re-concentrated a fourth time' "$test_log" \
    || fail "seller list-after-take-four test did not run"
  grep -q 'concentrates Test this today after List a product is re-concentrated a fourth time' "$test_log" \
    || fail "shopper take-after-list-four test did not run"
  grep -q 'concentrates List a product after Test this today is re-concentrated a fifth time' "$test_log" \
    || fail "seller list-after-take-five test did not run"
  grep -q 'concentrates Test this today after List a product is re-concentrated a fifth time' "$test_log" \
    || fail "shopper take-after-list-five test did not run"
  grep -q 'concentrates List a product after Test this today is re-concentrated a sixth time' "$test_log" \
    || fail "seller list-after-take-six test did not run"
  grep -q 'concentrates Test this today after List a product is re-concentrated a sixth time' "$test_log" \
    || fail "shopper take-after-list-six test did not run"
  grep -q 'why-line read first and larger than $bid' "$test_log" \
    || fail "prize-before-price shopper test did not run"
  grep -q 'honest last-24h strip' "$test_log" \
    || fail "rolling last-24h strip test did not run"
  grep -q 'rolling 24h window, not civil midnight' "$test_log" \
    || fail "listLast24h window test did not run"
  grep -q 'quiet morning honest' "$test_log" \
    || fail "quiet-morning honesty test did not run"
  grep -q 'no invented cover on the last-24h strip' "$test_log" \
    || fail "quiet-morning no-invented-cover test did not run"
  grep -q 'last-24h strip rank a last-24h fact' "$test_log" \
    || fail "strip-rank-is-not-cover test did not run"
  grep -q 'not today’s cover #1' "$test_log" \
    || fail "strip-not-cover leftover test did not run"
  grep -q 'occupied cover product name the prize' "$test_log" \
    || fail "cover-prize shopper test did not run"
  grep -q '\$bid stays a later fact' "$test_log" \
    || fail "cover-prize later-fact leftover test did not run"
  grep -q 'empty cover Claim #1 the only first click' "$test_log" \
    || fail "empty-cover Claim #1 leftover test did not run"
  grep -q 'Test this today stays off empty' "$test_log" \
    || fail "empty-cover Test this today off-empty leftover test did not run"
  grep -q 'occupied cover #1 and last-24h #1 two prizes' "$test_log" \
    || fail "two-prizes leftover test did not run"
  grep -q 'strip 24h 1 is not this morning’s cover' "$test_log" \
    || fail "two-prizes strip-not-cover leftover test did not run"
  grep -q 'empty morning Claim #1 the first click' "$test_log" \
    || fail "empty-morning later-write leftover test did not run"
  grep -q 'product URL is a later write' "$test_log" \
    || fail "empty-morning product-URL later-write leftover test did not run"
  grep -q 'Claim #1 the first click — Why test this today is a later write' "$test_log" \
    || fail "empty-morning Why later-write leftover test did not run"
  grep -q 'occupied later product names quieter than this morning’s cover' "$test_log" \
    || fail "later-rank quiet leftover test did not run"
  grep -q 'prize stays first' "$test_log" \
    || fail "later-rank prize-stays-first leftover test did not run"
  grep -q 'occupied cover #1 as the paid product' "$test_log" \
    || fail "paid-name leftover test did not run"
  grep -q 'later ranks cannot wear it' "$test_log" \
    || fail "paid-name later-rank leftover test did not run"
  grep -q 'unpaid off the merch desk' "$test_log" \
    || fail "unpaid-off leftover test did not run"
  grep -q 'No cover #1 until Polar reports paid' "$test_log" \
    || fail "unpaid-off Polar leftover test did not run"
  grep -q 'unpaid Polar checkout stays off the live board until paid' "$test_log" \
    || fail "unpaid Polar filter leftover test did not run"
  grep -q 'occupied morning one first click' "$test_log" \
    || fail "occupied take-before-claim leftover test did not run"
  grep -q 'Take the cover, Claim stays after' "$test_log" \
    || fail "occupied Claim-after-cover leftover test did not run"
  grep -q 'occupied later merch claim-this-rank quieter than Take' "$test_log" \
    || fail "later-claim-quiet leftover test did not run"
  grep -q 'cover stays the prize' "$test_log" \
    || fail "later-claim-quiet prize leftover test did not run"
  grep -q 'occupied cover one first click' "$test_log" \
    || fail "occupied list-after-cover leftover test did not run"
  grep -q 'List stays after the cover' "$test_log" \
    || fail "occupied List-after-cover leftover test did not run"
  grep -q 'occupied cover one later List write' "$test_log" \
    || fail "occupied one-later-List leftover test did not run"
  grep -q 'not three List rails' "$test_log" \
    || fail "occupied one-later-List collapse leftover test did not run"
  grep -q 'occupied later List write the only List label' "$test_log" \
    || fail "occupied one-List-label leftover test did not run"
  grep -q 'claim rail drops the second List' "$test_log" \
    || fail "occupied claim-rail List-label leftover test did not run"
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
  grep -q 'data-empty-claim-first' src/views/board.ts \
    || fail "empty cover missing Claim #1 first-click stamp"
  grep -q 'empty-claim-first' src/views/board.ts \
    || fail "empty claim must use the empty-claim-first class"
  grep -q 'data-first-click="claim"' src/views/board.ts \
    || fail "empty Claim #1 must win the first click"
  grep -q 'data-later-write' src/views/board.ts \
    || fail "empty morning missing later-write stamp on the product URL"
  grep -q 'data-later-stack' src/views/board.ts \
    || fail "occupied later ranks missing later-stack grouping"
  grep -q 'data-later-rank' src/views/board.ts \
    || fail "occupied later ranks missing later-rank card stamp"
  grep -q 'class="dek"' src/views/board.ts \
    || fail "later-rank product names must drop cover host anatomy"
  grep -q 'class="slot"' src/views/board.ts \
    || fail "later-rank blurbs must sit as a slot, not the paid name"
  grep -q 'data-paid-name' src/views/board.ts \
    || fail "occupied cover missing paid-name stamp"
  grep -q 'data-later-listing' src/views/board.ts \
    || fail "occupied claim rail missing later-listing stamp"
  grep -q 'One-line listing' src/views/board.ts \
    || fail "occupied claim rail must not wear the cover why placeholder"
  grep -q 'These product names are not this morning’s cover' src/views/board.ts \
    || fail "later stack must name later products as not the cover"
  grep -q 'data-listing-identity' src/views/board.ts \
    || fail "empty morning missing listing-identity wrap"
  grep -q 'Then the product URL' src/views/board.ts \
    || fail "empty morning must name the product URL as a later write"
  grep -q 'data-why-later' src/views/board.ts \
    || fail "empty morning missing later-write stamp on Why test this today"
  grep -q 'Then why test this today' src/views/board.ts \
    || fail "empty morning must name Why test this today as a later write"
  grep -q 'desk:has(.empty)' src/views/styles.ts \
    || fail "empty cover CSS missing Claim #1 first-click composition"
  grep -q 'listing-identity\[data-later-write\]' src/views/styles.ts \
    || fail "empty morning CSS missing later-write product URL composition"
  grep -q 'why-later\[data-why-later\]' src/views/styles.ts \
    || fail "empty morning CSS missing later-write Why composition"
  grep -q 'later-stack\[data-later-stack\]' src/views/styles.ts \
    || fail "later-rank CSS missing later-stack grouping"
  grep -q 'row\[data-later-rank\] \.dek' src/views/styles.ts \
    || fail "later-rank CSS missing quieter dek anatomy"
  grep -q 'row\[data-later-rank\] \.slot' src/views/styles.ts \
    || fail "later-rank CSS missing quieter slot anatomy"
  grep -q 'row-cover\[data-paid-name\]' src/views/styles.ts \
    || fail "paid-name CSS missing occupied cover identity"
  grep -q 'later-listing\[data-later-listing\]' src/views/styles.ts \
    || fail "occupied claim CSS missing later-listing composition"
  grep -q 'Occupied later List write after Take is the only List label' src/views/board.ts \
    || fail "occupied claim rail must name the later List write as the only List label"
  if grep -q 'class="claim-kicker"' src/views/board.ts; then
    fail "occupied claim rail must drop the second List kicker"
  fi
  if grep -q 'claimKicker' src/views/board.ts; then
    fail "occupied claim rail must not keep a List kicker variable"
  fi
  grep -q 'data-claim-after-cover' src/views/board.ts \
    || fail "occupied morning missing claim-after-cover wrap on Claim #1"
  grep -q 'claim-after-cover' src/views/board.ts \
    || fail "occupied claim must use the claim-after-cover wrap"
  grep -q 'claim-after-cover\[data-claim-after-cover\]' src/views/styles.ts \
    || fail "occupied morning CSS missing claim-after-cover composition"
  grep -q 'data-claim-after-row' src/views/board.ts \
    || fail "occupied later merch missing claim-after-row wrap on claim-this-rank"
  grep -q 'claim-after-row' src/views/board.ts \
    || fail "later merch must wrap claim-this-rank as claim-after-row"
  grep -q 'claim-after-row\[data-claim-after-row\]' src/views/styles.ts \
    || fail "later merch CSS missing claim-after-row later-write composition"
  grep -q 'not a filled pill on the name' src/views/styles.ts \
    || fail "later merch CSS must name claim-this-rank as not a filled pill"
  grep -q 'data-list-after-cover' src/views/board.ts \
    || fail "occupied cover missing list-after-cover wrap on the later List write"
  grep -q 'list-after-cover' src/views/board.ts \
    || fail "occupied later List write must use the list-after-cover wrap"
  grep -q 'list-after-cover\[data-list-after-cover\]' src/views/styles.ts \
    || fail "occupied cover CSS missing list-after-cover recede composition"
  grep -q 'Occupied cover: Take is the one first click' src/views/styles.ts \
    || fail "occupied cover CSS must name Take as the one first click"
  grep -q 'One later List write after Take recedes' src/views/styles.ts \
    || fail "occupied cover CSS must recede one later List write after Take"
  if grep -q 'data-list-under-cover' src/views/board.ts; then
    fail "do not keep masthead List; occupied cover keeps one later List write after Take"
  fi
  if grep -q 'data-list-after-why' src/views/board.ts; then
    fail "do not keep List under Why; occupied cover keeps one later List write after Take"
  fi
  if grep -q 'under this reason' src/views/board.ts; then
    fail "do not keep List under Why copy on occupied cover"
  fi
  if grep -q 'under today’s cover' src/views/board.ts; then
    fail "do not keep masthead List copy on occupied cover"
  fi
  if grep -nE 'data-empty-claim-after|data-claim-after-empty-[0-9]|take-after-list-seven|list-after-take-seven|data-later-rank-quiet|data-later-quiet|data-why-later-quiet|data-paid-name-quiet|data-unpaid-off-quiet|data-unpaid-off-board|data-later-claim|data-later-claim-quiet' \
    src/views/board.ts src/views/styles.ts >/dev/null; then
    fail "do not stamp another named hop; compose empty vs occupied"
  fi
  grep -q 'export function isPaidListing' src/core/board.ts \
    || fail "board core missing isPaidListing so unpaid never ranks"
  grep -q 'export function paidListings' src/core/board.ts \
    || fail "board core missing paidListings filter"
  grep -q 'paidListings(rows)' src/core/board.ts \
    || fail "rankListings must rank Polar-paid rows only"
  grep -q 'paid_usd >= 1' src/core/board.ts \
    || fail "listToday / listLast24h must drop unpaid occupancy"
  grep -q 'getPaidListing' src/core/board.ts \
    || fail "board core missing getPaidListing for public hops"
  grep -q 'getPaidListing' src/core/clicks.ts \
    || fail "outbound hops must refuse unpaid cover"
  grep -q 'paidListings(listToday' src/http/pages/board.ts \
    || fail "board HTTP must compose Polar-paid occupancy only"
  grep -q 'hasLeftoverUnpaid' src/http/pages/board.ts \
    || fail "board HTTP must surface leftover unpaid Polar occupancy"
  grep -q 'leftoverUnpaid' src/views/board.ts \
    || fail "merch desk must compose leftover unpaid Polar occupancy"
  grep -q 'withRanks(paidListings(model.listings))' src/views/board.ts \
    || fail "merch desk occupancy must compose Polar-paid rows only"
  grep -q 'if (!isPaidListing(listing))' src/views/board.ts \
    || fail "listing row must not print unpaid cover #1"
  grep -q 'data-unpaid-off' src/views/board.ts \
    || fail "unpaid leftover missing unpaid-off composition stamp"
  grep -q 'Unpaid Polar checkout stays off this desk until Polar reports paid' src/views/board.ts \
    || fail "claim rail must say unpaid Polar stays off the desk"
  grep -q 'An abandoned listing is not cover #1' src/views/board.ts \
    || fail "claim rail must say an abandoned listing is not cover #1"
  grep -q 'desk\[data-unpaid-off\]' src/views/styles.ts \
    || fail "unpaid-off CSS missing merch-desk composition"
  grep -q 'claim-note\[data-unpaid-off\]' src/views/styles.ts \
    || fail "unpaid-off CSS missing claim-note composition"
  grep -q 'desk\[data-occupied="true"\] \.row-cover\[data-paid-name\]' src/views/styles.ts \
    || fail "occupied paid-name CSS must stay paid-only"
  python3 - <<'PY' || fail "today’s cover or quiet morning must precede claim chrome"
from pathlib import Path
src = Path("src/views/board.ts").read_text()
board = src.find('id="leaderboard"')
claim = src.find('id="claim"')
if board < 0 or claim < 0 or board > claim:
    raise SystemExit(1)
strip = src.find("renderLast24hStrip", board)
if strip < 0 or strip > claim:
    raise SystemExit(1)
wrap = src.find("data-claim-after-cover")
if wrap < 0 or wrap > claim:
    raise SystemExit(1)
if "data-list-under-cover" in src:
    raise SystemExit(1)
if "data-list-after-why" in src:
    raise SystemExit(1)
cover_why = src.find("data-cover-why")
cover_hop = src.find("data-cover-hop")
if cover_why < 0 or cover_hop < 0 or cover_why > cover_hop:
    raise SystemExit(1)
take_after = src.find("data-take-after-list")
if take_after < 0 or take_after < cover_why or take_after > cover_hop:
    raise SystemExit(1)
list_after_take = src.find("data-list-after-take")
if list_after_take < 0 or list_after_take < cover_hop:
    raise SystemExit(1)
first_click = src.find('data-first-click="take"')
if first_click < 0 or first_click < take_after or first_click > list_after_take:
    raise SystemExit(1)
first_write = src.find('data-first-write="list"')
if first_write < 0 or first_write < list_after_take:
    raise SystemExit(1)
take_first = src.find("data-take-after-list-first")
if take_first < 0 or take_first < first_click or take_first > list_after_take:
    raise SystemExit(1)
list_two = src.find("data-list-after-take-two")
if list_two < 0 or list_two < first_write:
    raise SystemExit(1)
take_two = src.find("data-take-after-list-two")
if take_two < 0 or take_two < take_first or take_two > list_after_take:
    raise SystemExit(1)
take_three = src.find("data-take-after-list-three")
if take_three < 0 or take_three < take_two or take_three > list_after_take:
    raise SystemExit(1)
list_three = src.find("data-list-after-take-three")
if list_three < 0 or list_three < list_two:
    raise SystemExit(1)
list_four = src.find("data-list-after-take-four")
if list_four < 0 or list_four < list_three:
    raise SystemExit(1)
take_four = src.find("data-take-after-list-four")
if take_four < 0 or take_four < take_three or take_four > list_after_take:
    raise SystemExit(1)
list_five = src.find("data-list-after-take-five")
if list_five < 0 or list_five < list_four:
    raise SystemExit(1)
take_five = src.find("data-take-after-list-five")
if take_five < 0 or take_five < take_four or take_five > list_after_take:
    raise SystemExit(1)
list_six = src.find("data-list-after-take-six")
if list_six < 0 or list_six < list_five:
    raise SystemExit(1)
take_six = src.find("data-take-after-list-six")
if take_six < 0 or take_six < take_five or take_six > list_after_take:
    raise SystemExit(1)
host_after = src.find("<p class=\"host\"")
if host_after < 0 or cover_hop > host_after or list_after_take > host_after:
    raise SystemExit(1)
later_stack = src.find("data-later-stack")
later_rank = src.find("data-later-rank")
if later_stack < 0 or later_rank < 0 or later_stack < cover_hop:
    raise SystemExit(1)
name_prize = src.find("data-cover-name")
later_money = src.find("data-later-fact")
if name_prize < 0 or later_money < 0 or name_prize > later_money:
    raise SystemExit(1)
morning = src.find("data-morning-slot")
two_prizes = src.find("data-two-prizes")
if morning < 0 or two_prizes < 0:
    raise SystemExit(1)
PY
  grep -q 'Morning merch desk' src/views/board.ts \
    || fail "board missing morning-desk chrome"
  grep -q 'data-issue-date' src/views/board.ts \
    || fail "board missing issue date"
  grep -q 'Why test this today' src/views/board.ts \
    || fail "listing missing why-test-this-today"
  grep -q 'data-cover-hop' src/views/board.ts \
    || fail "paid cover missing Test this today hop"
  grep -q '>Test this today<' src/views/board.ts \
    || fail "cover hop is not labeled Test this today"
  grep -q 'data-list-after-take' src/views/board.ts \
    || fail "paid morning missing one later List a product write after Take"
  grep -q 'href="#claim"' src/views/board.ts \
    || fail "seller hop does not jump to the listing form"
  grep -q 'data-cover-why' src/views/board.ts \
    || fail "paid cover missing labeled why-line"
  grep -q 'cover-why-line' src/views/board.ts \
    || fail "cover reason is not a first-read why-line"
  grep -q 'data-prize-before-price' src/views/board.ts \
    || fail "occupied #1 missing prize-before-price mark"
  grep -q 'cover-why-line\[data-prize-before-price\]' src/views/styles.ts \
    || fail "cover why-line is not larger than \$bid + clicks"
  grep -q 'data-cover-name' src/views/board.ts \
    || fail "occupied cover missing product-name prize mark"
  grep -q 'host\[data-cover-name\]' src/views/styles.ts \
    || fail "cover product name is not larger than later-fact \$bid"
  grep -q 'data-later-fact' src/views/board.ts \
    || fail "occupied cover missing later-fact stamp on \$bid"
  grep -q 'bid.later-fact' src/views/board.ts \
    || fail "occupied cover \$bid is not a later-fact class"
  grep -q 'later-fact\[data-later-fact\]' src/views/styles.ts \
    || grep -q 'bid.later-fact' src/views/styles.ts \
    || fail "later-fact \$bid is not muted off the cover prize"
  grep -q 'data-take-after-list' src/views/board.ts \
    || fail "paid cover missing take-after-list wrap on Test this today"
  grep -q 'data-list-after-take' src/views/board.ts \
    || fail "paid cover missing list-after-take hop after Test this today"
  grep -q 'after Test this today' src/views/board.ts \
    || fail "list-after-take hop does not sit after Test this today"
  grep -q 'data-first-click="take"' src/views/board.ts \
    || fail "paid cover missing first-click take on Test this today"
  grep -q 'cover-hop-first' src/views/styles.ts \
    || fail "first-click take is not louder than list-after-take"
  grep -q 'data-first-write="list"' src/views/board.ts \
    || fail "paid cover missing first-write list on List a product"
  grep -q 'list-after-take-first' src/views/board.ts \
    || fail "list-after-take is not concentrated as the first write"
  grep -q 'list-after-take-first' src/views/styles.ts \
    || fail "first-write list is not more certain than dashed ink"
  grep -q 'data-take-after-list-first' src/views/board.ts \
    || fail "paid cover missing take-after-list-first stamp on Test this today"
  grep -q 'take-after-list-first' src/views/styles.ts \
    || fail "Test this today is not louder than the first-write list hop"
  grep -q 'data-list-after-take-two' src/views/board.ts \
    || fail "paid cover missing list-after-take-two stamp on List a product"
  grep -q 'list-after-take-two' src/views/styles.ts \
    || fail "List a product is not taller than the first-write outline after the take"
  grep -q 'data-take-after-list-two' src/views/board.ts \
    || fail "paid cover missing take-after-list-two stamp on Test this today"
  grep -q 'take-after-list-two' src/views/styles.ts \
    || fail "Test this today is not louder than the re-concentrated list hop"
  grep -q 'data-list-after-take-three' src/views/board.ts \
    || fail "paid cover missing list-after-take-three stamp on List a product"
  grep -q 'list-after-take-three' src/views/styles.ts \
    || fail "List a product is not taller than the outlined write after the louder take"
  grep -q 'data-take-after-list-three' src/views/board.ts \
    || fail "paid cover missing take-after-list-three stamp on Test this today"
  grep -q 'take-after-list-three' src/views/styles.ts \
    || fail "Test this today is not louder than the taller list-after-take-three hop"
  python3 - <<'PY' || fail "take-after-list-three must stay taller than list-after-take-three"
import re
from pathlib import Path
css = Path("src/views/styles.ts").read_text()

def min_height(name: str) -> float:
    m = re.search(rf"\.{re.escape(name)}\s*\{{[^}}]*min-height:\s*([0-9.]+)rem", css)
    if not m:
        raise SystemExit(1)
    return float(m.group(1))

take = min_height("take-after-list-three")
listed = min_height("list-after-take-three")
prior = min_height("take-after-list-two")
if take <= listed or take <= prior:
    raise SystemExit(1)
PY
  grep -q 'data-list-after-take-four' src/views/board.ts \
    || fail "paid cover missing list-after-take-four stamp on List a product"
  grep -q 'list-after-take-four' src/views/styles.ts \
    || fail "List a product is not taller than the outlined write after the taller take"
  python3 - <<'PY' || fail "list-after-take-four must stay taller than list-after-take-three and shorter than take-after-list-three"
import re
from pathlib import Path
css = Path("src/views/styles.ts").read_text()

def min_height(name: str) -> float:
    m = re.search(rf"\.{re.escape(name)}\s*\{{[^}}]*min-height:\s*([0-9.]+)rem", css)
    if not m:
        raise SystemExit(1)
    return float(m.group(1))

listed = min_height("list-after-take-four")
prior = min_height("list-after-take-three")
take = min_height("take-after-list-three")
block = re.search(r"\.list-after-take-four\s*\{[^}]*\}", css)
if listed <= prior or listed >= take:
    raise SystemExit(1)
if not block or "var(--primary)" in block.group(0) or "background:" in block.group(0):
    raise SystemExit(1)
PY
  grep -q 'data-take-after-list-four' src/views/board.ts \
    || fail "paid cover missing take-after-list-four stamp on Test this today"
  grep -q 'take-after-list-four' src/views/styles.ts \
    || fail "Test this today is not louder than the taller list-after-take-four hop"
  python3 - <<'PY' || fail "take-after-list-four must stay taller than list-after-take-four and take-after-list-three"
import re
from pathlib import Path
css = Path("src/views/styles.ts").read_text()

def min_height(name: str) -> float:
    m = re.search(rf"\.{re.escape(name)}\s*\{{[^}}]*min-height:\s*([0-9.]+)rem", css)
    if not m:
        raise SystemExit(1)
    return float(m.group(1))

take = min_height("take-after-list-four")
listed = min_height("list-after-take-four")
prior = min_height("take-after-list-three")
if take <= listed or take <= prior:
    raise SystemExit(1)
PY
  grep -q 'data-list-after-take-five' src/views/board.ts \
    || fail "paid cover missing list-after-take-five stamp on List a product"
  grep -q 'list-after-take-five' src/views/styles.ts \
    || fail "List a product is not taller than the outlined write after the taller take"
  python3 - <<'PY' || fail "list-after-take-five must stay taller than list-after-take-four and shorter than take-after-list-four"
import re
from pathlib import Path
css = Path("src/views/styles.ts").read_text()

def min_height(name: str) -> float:
    m = re.search(rf"\.{re.escape(name)}\s*\{{[^}}]*min-height:\s*([0-9.]+)rem", css)
    if not m:
        raise SystemExit(1)
    return float(m.group(1))

listed = min_height("list-after-take-five")
prior = min_height("list-after-take-four")
take = min_height("take-after-list-four")
block = re.search(r"\.list-after-take-five\s*\{[^}]*\}", css)
if listed <= prior or listed >= take:
    raise SystemExit(1)
if not block or "var(--primary)" in block.group(0) or "background:" in block.group(0):
    raise SystemExit(1)
PY
  grep -q 'data-take-after-list-five' src/views/board.ts \
    || fail "paid cover missing take-after-list-five stamp on Test this today"
  grep -q 'take-after-list-five' src/views/styles.ts \
    || fail "Test this today is not louder than the taller list-after-take-five hop"
  python3 - <<'PY' || fail "take-after-list-five must stay taller than list-after-take-five and take-after-list-four"
import re
from pathlib import Path
css = Path("src/views/styles.ts").read_text()

def min_height(name: str) -> float:
    m = re.search(rf"\.{re.escape(name)}\s*\{{[^}}]*min-height:\s*([0-9.]+)rem", css)
    if not m:
        raise SystemExit(1)
    return float(m.group(1))

take = min_height("take-after-list-five")
listed = min_height("list-after-take-five")
prior = min_height("take-after-list-four")
if take <= listed or take <= prior:
    raise SystemExit(1)
PY
  grep -q 'data-list-after-take-six' src/views/board.ts \
    || fail "paid cover missing list-after-take-six stamp on List a product"
  grep -q 'list-after-take-six' src/views/styles.ts \
    || fail "List a product is not taller than the outlined write after the taller take"
  python3 - <<'PY' || fail "list-after-take-six must stay taller than list-after-take-five and shorter than take-after-list-five"
import re
from pathlib import Path
css = Path("src/views/styles.ts").read_text()

def min_height(name: str) -> float:
    m = re.search(rf"\.{re.escape(name)}\s*\{{[^}}]*min-height:\s*([0-9.]+)rem", css)
    if not m:
        raise SystemExit(1)
    return float(m.group(1))

listed = min_height("list-after-take-six")
prior = min_height("list-after-take-five")
take = min_height("take-after-list-five")
block = re.search(r"\.list-after-take-six\s*\{[^}]*\}", css)
if listed <= prior or listed >= take:
    raise SystemExit(1)
if not block or "var(--primary)" in block.group(0) or "background:" in block.group(0):
    raise SystemExit(1)
PY
  grep -q 'data-take-after-list-six' src/views/board.ts \
    || fail "paid cover missing take-after-list-six stamp on Test this today"
  grep -q 'take-after-list-six' src/views/styles.ts \
    || fail "Test this today is not louder than the taller list-after-take-six hop"
  python3 - <<'PY' || fail "take-after-list-six must stay taller than list-after-take-six and take-after-list-five"
import re
from pathlib import Path
css = Path("src/views/styles.ts").read_text()

def min_height(name: str) -> float:
    m = re.search(rf"\.{re.escape(name)}\s*\{{[^}}]*min-height:\s*([0-9.]+)rem", css)
    if not m:
        raise SystemExit(1)
    return float(m.group(1))

take = min_height("take-after-list-six")
listed = min_height("list-after-take-six")
prior = min_height("take-after-list-five")
if take <= listed or take <= prior:
    raise SystemExit(1)
PY
  python3 - <<'PY' || fail "occupied #1 why-line must read larger than \$bid and clicks; later ranks stay quieter"
import re
from pathlib import Path

board = Path("src/views/board.ts").read_text()
css = Path("src/views/styles.ts").read_text()

if board.count("data-prize-before-price") != 1:
    raise SystemExit("prize mark must stamp only the occupied cover why-line")
if "data-take-after-list-seven" in board or "data-list-after-take-seven" in board:
    raise SystemExit("do not add another named hop")
if "take-after-list-seven" in css or "list-after-take-seven" in css:
    raise SystemExit("do not stamp take-after-list-N / list-after-take-N")

prize = re.search(r"\.cover-why-line\[data-prize-before-price\]\s*\{[^}]*font-size:\s*([0-9.]+)rem", css)
bid = re.search(r"\.row-cover \.bid\s*\{[^}]*font-size:\s*([0-9.]+)rem", css)
clicks = re.search(r"\.row-cover \.clicks\s*\{[^}]*font-size:\s*([0-9.]+)rem", css)
later_bid = re.search(r"\.bid \{\n(?:.*\n)*?\s*font-size:\s*([0-9.]+)rem", css)
later_blurb = re.search(r"\.blurb \{\n(?:.*\n)*?\s*font-size:\s*([0-9.]+)rem", css)
if not prize or not bid or not clicks or not later_bid or not later_blurb:
    raise SystemExit(1)
if float(prize.group(1)) <= float(bid.group(1)):
    raise SystemExit("prize must be larger than \$bid")
if float(prize.group(1)) <= float(clicks.group(1)):
    raise SystemExit("prize must be larger than clicks")
if float(later_bid.group(1)) >= float(prize.group(1)):
    raise SystemExit("later ranks must stay quieter than the cover prize")
if float(later_blurb.group(1)) >= float(prize.group(1)):
    raise SystemExit("later blurbs must stay quieter than the cover prize")
if "var(--primary)" in prize.group(0):
    raise SystemExit("do not recolor")
PY
  python3 - <<'PY' || fail "occupied cover product name must stay the prize; \$bid stays a muted later fact"
import re
from pathlib import Path

board = Path("src/views/board.ts").read_text()
css = Path("src/views/styles.ts").read_text()

if board.count("data-cover-name") != 1:
    raise SystemExit("cover name prize must stamp only occupied #1")
if board.count('data-later-fact=""') < 2:
    raise SystemExit("later-fact must stamp occupied cover money")
if "data-take-after-list-seven" in board or "data-list-after-take-seven" in board:
    raise SystemExit("do not add another named hop")
if "take-after-list-seven" in css or "list-after-take-seven" in css:
    raise SystemExit("do not stamp take-after-list-N / list-after-take-N")
if "var(--primary)" in css.split(".row-cover .host[data-cover-name]", 1)[-1].split("}", 1)[0]:
    raise SystemExit("do not recolor the cover name")

name = re.search(r"\.row-cover \.host\[data-cover-name\]\s*\{[^}]*font-size:\s*([0-9.]+)rem", css)
later_bid = re.search(
    r"\.cover-later\[data-later-fact\] \.bid\.later-fact\s*,[\s\S]*?font-size:\s*([0-9.]+)rem",
    css,
)
if not later_bid:
    later_bid = re.search(
        r"\.cover-later\[data-later-fact\]\s*\{[^}]*font-size:\s*([0-9.]+)rem",
        css,
    )
why = re.search(r"\.cover-why-line\[data-prize-before-price\]\s*\{[^}]*font-size:\s*([0-9.]+)rem", css)
stack_bid = re.search(r"\.bid \{\n(?:.*\n)*?\s*font-size:\s*([0-9.]+)rem", css)
if not name or not later_bid or not why or not stack_bid:
    raise SystemExit("missing cover-prize CSS")
if float(name.group(1)) <= float(later_bid.group(1)):
    raise SystemExit("cover product name must be larger than later-fact \$bid")
if float(name.group(1)) < float(why.group(1)):
    raise SystemExit("cover product name must stay at least as loud as the why-line")
if float(stack_bid.group(1)) >= float(name.group(1)):
    raise SystemExit("later-rank \$bid must stay quieter than the cover name")
later_block = re.search(
    r"\.cover-later\[data-later-fact\] \.bid\.later-fact[\s\S]*?color:\s*([^;]+);",
    css,
)
if not later_block or "var(--primary)" in later_block.group(1):
    raise SystemExit("later-fact \$bid must not shout in primary")
if "var(--muted-foreground)" not in later_block.group(1) and "var(--muted)" not in later_block.group(1):
    raise SystemExit("later-fact \$bid must recede to muted")
row = board.split("export function renderListingRow", 1)[-1].split("export function renderBoardBody", 1)[0]
if 'data-cover-name=""' not in row:
    raise SystemExit("cover host must stamp data-cover-name")
if "later-fact" not in row or "data-later-fact" not in row:
    raise SystemExit("cover \$bid must stamp later-fact")
if row.find("data-cover-name") > row.find("data-later-fact"):
    raise SystemExit("cover name must precede later-fact money in markup")
PY
  grep -q 'data-last24h' src/views/board.ts \
    || fail "board missing last-24h strip"
  grep -q 'data-last24h-empty' src/views/board.ts \
    || fail "last-24h strip missing honest empty"
  grep -q 'No invented #1' src/views/board.ts \
    || fail "empty last-24h strip does not refuse an invented #1"
  grep -q 'data-last24h-rank' src/views/board.ts \
    || fail "occupied last-24h strip missing rank that is not cover #1"
  grep -q 'data-last24h-fact' src/views/board.ts \
    || fail "occupied last-24h strip rank is not stamped as a last-24h fact"
  grep -q '24h ${listing.rank}' src/views/board.ts \
    || fail "occupied last-24h strip still prints a bare rank that can read as cover #1"
  grep -q 'data-morning-slot' src/views/board.ts \
    || fail "occupied cover missing morning-slot stamp"
  grep -q 'data-two-prizes' src/views/board.ts \
    || fail "occupied desk missing two-prizes composition stamp"
  grep -q 'data-last24h-prize' src/views/board.ts \
    || fail "occupied last-24h #1 missing window-prize stamp"
  grep -q 'data-last24h-slot' src/views/board.ts \
    || fail "occupied last-24h #1 missing Rolling 24h spend slot"
  grep -q 'Rolling 24h spend' src/views/board.ts \
    || fail "last-24h #1 does not name the rolling-window prize"
  grep -q 'Cover #1 is this morning’s slot' src/views/board.ts \
    || fail "strip dek must name cover as this morning’s slot"
  grep -q 'A strip rank is a last-24h fact, not today’s cover #1' src/views/board.ts \
    || fail "last-24h strip must not claim today’s cover"
  grep -q 'rolling last 24 hours' src/views/board.ts \
    || fail "last-24h strip must name the rolling window"
  grep -q 'listLast24h' src/core/board.ts \
    || fail "board core missing listLast24h"
  grep -q 'ROLLING_WINDOW_MS' src/core/board.ts \
    || fail "last-24h window is not a rolling 24 hours"
  if grep -q 'href="/today"' src/views/board.ts src/http/pages/board.ts; then
    fail "do not clone /today chrome onto a second board"
  fi
  if grep -Eq 'outbid\.lol/today|Today Board|Daily Board' src/views/board.ts src/http/pages/board.ts; then
    fail "do not paste /today copy onto the merch desk"
  fi
  python3 - <<'PY' || fail "last-24h strip must stay one strip under the one cover, not a second hop"
from pathlib import Path
board = Path("src/views/board.ts").read_text()
css = Path("src/views/styles.ts").read_text()
if board.count("data-last24h=") != 1:
    raise SystemExit("one last-24h strip")
if "data-take-after-list-seven" in board or "data-list-after-take-seven" in board:
    raise SystemExit("do not add another named hop")
if "take-after-list-seven" in css or "list-after-take-seven" in css:
    raise SystemExit("do not stamp take-after-list-N / list-after-take-N")
if 'id="today"' in board or "aria-label=\"Today\"" in board:
    raise SystemExit("do not clone /today chrome")
cover = board.find('id="leaderboard"')
claim = board.find('id="claim"')
strip = board.find("renderLast24hStrip", cover)
if cover < 0 or strip < 0 or claim < 0 or not (cover < strip < claim):
    raise SystemExit("strip must sit under the one cover, before claim")
if "No paid listings in the last 24 hours" not in board:
    raise SystemExit("empty strip must stay honest")
if 'data-empty-cover=""' not in board:
    raise SystemExit("empty cover must stay stamped")
if "No invented #1" not in board:
    raise SystemExit("empty strip must refuse an invented #1")
if "not an invented cover" not in board:
    raise SystemExit("empty cover must refuse an invented #1")
row = board.split("renderLast24hRow", 1)[-1].split("renderLast24hStrip", 1)[0]
if "#${listing.rank}" in row:
    raise SystemExit("strip rank must not print cover #N")
if 'data-last24h-fact=""' not in row:
    raise SystemExit("occupied strip rank must be a last-24h fact")
if "24h ${listing.rank}" not in row:
    raise SystemExit("occupied strip rank must read as a last-24h fact, not a bare 1")
if ">${listing.rank}<" in row.replace("24h ${listing.rank}", ""):
    raise SystemExit("bare strip rank 1 still reads as today’s cover")
if 'data-last24h-prize=""' not in row:
    raise SystemExit("strip #1 must stamp a last-24h prize, not the morning cover")
if "Rolling 24h spend" not in row:
    raise SystemExit("strip #1 must name rolling-window spend, not this morning’s cover")
if row.find("last24h-host") > row.find("data-last24h-rank"):
    raise SystemExit("strip 24h N must recede after the rolling-window host")
if 'data-morning-slot=""' not in board:
    raise SystemExit("occupied cover must stamp the morning slot")
if 'data-two-prizes=""' not in board:
    raise SystemExit("occupied cover + occupied strip must stamp two prizes")
if "Cover #1 is this morning’s slot" not in board:
    raise SystemExit("dek must keep cover as the morning slot")
if 'data-last24h-empty=""' not in board:
    raise SystemExit("empty strip must stay data-last24h-empty")
if "data-take-after-list-seven" in board:
    raise SystemExit("do not add another named hop")
if 'data-empty-claim-first=""' not in board:
    raise SystemExit("empty Claim #1 must stamp data-empty-claim-first")
if 'data-first-click="claim"' not in board:
    raise SystemExit("empty Claim #1 must stamp the first click")
if "empty-claim-first" not in board:
    raise SystemExit("empty claim must use the empty-claim-first class")
if 'data-claim-after-cover=""' not in board:
    raise SystemExit("occupied Claim #1 must stamp data-claim-after-cover")
if "claim-after-cover" not in board:
    raise SystemExit("occupied claim must use the claim-after-cover wrap")
if 'data-occupied="false"' not in board or 'data-occupied="true"' not in board:
    raise SystemExit("desk must compose empty vs occupied")
if 'data-later-write=""' not in board:
    raise SystemExit("empty morning must stamp product URL as a later write")
if 'data-listing-identity=""' not in board:
    raise SystemExit("empty morning must wrap the product URL as listing identity")
if "Then the product URL" not in board:
    raise SystemExit("empty morning must name the later product URL write")
if 'data-why-later=""' not in board:
    raise SystemExit("empty morning must stamp Why as a later write")
if "Then why test this today" not in board:
    raise SystemExit("empty morning must name Why as a later write after the product URL")
forms = board.split("const bidForm = occupied", 1)[-1]
occupied_form = forms.split("? html`", 1)[-1].split(": html`", 1)[0]
empty_form_html = forms.split(": html`", 1)[-1].split("</form>`", 1)[0]
if 'class="bid-row"' not in occupied_form:
    raise SystemExit("occupied claim must keep Product URL on the bid-row with Outbid")
if "${productUrlField}" not in occupied_form or ">Outbid<" not in occupied_form:
    raise SystemExit("occupied bid-row must still hold Product URL and Outbid")
if "data-later-listing" not in occupied_form:
    raise SystemExit("occupied form must stamp later-listing off the paid name")
if "${occupiedListingField}" not in occupied_form:
    raise SystemExit("occupied claim rail must not wear the cover why placeholder")
if "${whyField}" in occupied_form:
    raise SystemExit("occupied claim rail must drop empty Why later-write chrome")
if 'class="bid-row"' in empty_form_html:
    raise SystemExit("empty morning must not keep Product URL in the same claim rail as Outbid")
outbid_at = empty_form_html.find(">Outbid<")
later_at = empty_form_html.find("data-later-write")
url_at = empty_form_html.find("${productUrlField}")
why_later_at = empty_form_html.find("data-why-later")
why_at = empty_form_html.find("${whyField}")
identity_end = empty_form_html.find("</div>", later_at)
if outbid_at < 0 or later_at < 0 or url_at < 0 or why_later_at < 0 or why_at < 0:
    raise SystemExit("empty form must keep Outbid, then later product URL, then later Why")
if not (outbid_at < later_at < url_at < why_later_at < why_at):
    raise SystemExit("empty Why must be a later write after the product URL")
if identity_end > 0 and why_at < identity_end:
    raise SystemExit("Why must not sit as a twin field inside listing-identity")
if "${whyField}" in empty_form_html[later_at:why_later_at]:
    raise SystemExit("listing-identity must hold only the product URL, not Why")
empty_rule = css.split("Empty morning: Claim #1 is the only first click", 1)
if len(empty_rule) < 2:
    raise SystemExit("empty CSS must name Claim #1 as the only first click")
block = empty_rule[1].split(".last24h {", 1)[0]
hide = block.split("display: none", 1)[0]
if ".cover-hop" not in hide or ".cover-later" not in hide or ".list-under-cover" not in hide:
    raise SystemExit("empty CSS must keep occupied cover hops off empty")
if ".later-listing" not in hide or "[data-paid-name]" not in hide:
    raise SystemExit("empty CSS must keep paid-name and later-listing off empty")
if "claim-after-cover" not in hide:
    raise SystemExit("empty CSS must keep occupied later Claim wrap off empty")
if "claim-after-row" not in hide:
    raise SystemExit("empty CSS must keep later-row claim-this-rank off empty")
if "list-after-cover" not in hide:
    raise SystemExit("empty CSS must keep occupied List-after-cover rails off empty")
if "display: none" not in block:
    raise SystemExit("empty occupied chrome must stay off, not restyled")
if "background:" in hide:
    raise SystemExit("do not recolor empty; hide occupied chrome")
if "data-cover-hop" in hide or 'data-first-click="take"' in hide:
    raise SystemExit("do not leak occupied hop stamps into empty CSS")
if "data-empty-claim-after" in board or "take-after-list-seven" in css:
    raise SystemExit("do not stamp another named hop")
later_rule = css.split("Empty morning: Product URL is a later write after Claim #1 / Outbid", 1)
if len(later_rule) < 2:
    raise SystemExit("empty CSS must name the product URL as a later write")
later_block = later_rule[1].split("Empty morning: Why test this today is a later write after the product URL", 1)[0]
if ".listing-identity[data-later-write]" not in later_block:
    raise SystemExit("later-write CSS must compose listing identity off the claim rail")
if "background:" in later_block or "var(--primary)" in later_block:
    raise SystemExit("do not recolor the later product URL write")
if "take-after-list-seven" in later_block or "data-empty-claim-after" in later_block:
    raise SystemExit("do not stamp another named hop on the later write")
if "why-later" in later_block:
    raise SystemExit("product-URL later-write CSS must not swallow Why later-write")
why_rule = css.split("Empty morning: Why test this today is a later write after the product URL", 1)
if len(why_rule) < 2:
    raise SystemExit("empty CSS must name Why as a later write after the product URL")
why_block = why_rule[1].split(".claim-kicker {", 1)[0]
if ".why-later[data-why-later]" not in why_block:
    raise SystemExit("Why later-write CSS must compose Why off the product URL")
if "listing-identity" in why_block or "data-later-write" in why_block:
    raise SystemExit("Why later-write CSS must not restyle the product URL as a twin")
if "background:" in why_block or "var(--primary)" in why_block:
    raise SystemExit("do not recolor the later Why write")
if "take-after-list-seven" in why_block or "data-empty-claim-after" in why_block:
    raise SystemExit("do not stamp another named hop on the later Why write")
if ".desk[data-two-prizes]" not in css:
    raise SystemExit("two-prize CSS must compose cover vs strip")
if ".last24h-row[data-last24h-prize] .last24h-host" not in css:
    raise SystemExit("strip prize host must stay quieter than the cover name")
import re
url_w = re.search(r"max-width:\s*([0-9.]+)rem", later_block)
why_w = re.search(r"max-width:\s*([0-9.]+)rem", why_block)
url_h = re.search(r"height:\s*([0-9.]+)rem", later_block)
why_h = re.search(r"height:\s*([0-9.]+)rem", why_block)
if not url_w or not why_w or not url_h or not why_h:
    raise SystemExit("Why later-write CSS must recede vs the product URL")
if float(why_w.group(1)) >= float(url_w.group(1)):
    raise SystemExit("Why later write must stay narrower than the product URL")
if float(why_h.group(1)) >= float(url_h.group(1)):
    raise SystemExit("Why later write must stay shorter than the product URL")
cover_m = re.search(
    r"\.desk\[data-two-prizes\] \.row-cover\[data-morning-slot\] \.host\[data-cover-name\]\s*\{[^}]*font-size:\s*([0-9.]+)rem",
    css,
)
strip_m = re.search(
    r"\.desk\[data-two-prizes\] \.last24h-row\[data-last24h-prize\] \.last24h-host\s*\{[^}]*font-size:\s*([0-9.]+)rem",
    css,
)
if not cover_m or not strip_m:
    raise SystemExit("two-prize CSS missing cover vs strip sizes")
if float(cover_m.group(1)) <= float(strip_m.group(1)):
    raise SystemExit("cover product name must stay larger than strip #1 host")
two = css.split(".desk[data-two-prizes]", 1)[-1].split("Occupied morning: Take is the only first click", 1)[0]
if "empty-claim-first" in two or "data-later-write" in two or "data-why-later" in two:
    raise SystemExit("two-prize CSS must not swallow empty later-write composition")
if "var(--primary)" in two:
    raise SystemExit("do not recolor the two prizes")
if "take-after-list-seven" in two or "list-after-take-seven" in two:
    raise SystemExit("do not stamp another named hop")
if "data-later-stack" not in board:
    raise SystemExit("later ranks must group under the cover")
if "data-later-rank" not in board:
    raise SystemExit("later ranks must stamp later-rank cards")
if 'data-paid-name=""' not in board:
    raise SystemExit("occupied cover must stamp paid-name")
if 'class="dek"' not in board:
    raise SystemExit("later product names must drop cover host anatomy")
if 'class="slot"' not in board:
    raise SystemExit("later ranks must sit as a slot, not the paid name")
if 'data-later-listing=""' not in board:
    raise SystemExit("occupied claim rail must stamp later-listing")
if "One-line listing" not in board:
    raise SystemExit("occupied claim rail must not wear the cover why placeholder")
row_fn = board.split("export function renderListingRow", 1)[-1].split("export function renderBoardBody", 1)[0]
if 'data-cover-name=""' not in row_fn:
    raise SystemExit("cover host must still stamp data-cover-name")
if 'data-paid-name=""' not in row_fn:
    raise SystemExit("occupied cover row must stamp paid-name")
if 'class="dek"' not in row_fn or 'class="slot"' not in row_fn:
    raise SystemExit("later ranks must use dek + slot, not cover prize chrome")
if 'data-later-rank=""' not in row_fn:
    raise SystemExit("later cards must stamp data-later-rank")
if "Also on the desk · #" in row_fn:
    raise SystemExit("later ranks must not share the cover prize kicker")
if 'class="host" data-cover-name' in row_fn and "stack-host" in row_fn[row_fn.find('class="host" data-cover-name'):row_fn.find('class="host" data-cover-name') + 80]:
    raise SystemExit("do not mute the cover name node for later ranks")
if 'class="host" data-cover-name' not in row_fn:
    raise SystemExit("cover prize must keep host anatomy")
if 'class="host stack-host"' in row_fn:
    raise SystemExit("later ranks must drop stack-host; stamp-only mute is REJECT")
if "data-later-rank-quiet" in board or "data-later-quiet" in css or "data-paid-name-quiet" in board:
    raise SystemExit("stamp-only later-quiet is REJECT")
later_css = css.split(".later-stack[data-later-stack] .row[data-later-rank] .dek", 1)
if len(later_css) < 2:
    raise SystemExit("later-rank CSS must target dek, not the cover name")
later_host_block = later_css[1].split("}", 1)[0]
if "var(--primary)" in later_host_block or "background:" in later_host_block:
    raise SystemExit("do not recolor later-rank product names")
later_size = re.search(r"font-size:\s*([0-9.]+)rem", later_host_block)
cover_size = re.search(
    r"\.row-cover \.host\[data-cover-name\]\s*\{[^}]*font-size:\s*([0-9.]+)rem",
    css,
)
paid_size = re.search(
    r"\.row-cover\[data-paid-name\] \.host\[data-cover-name\]\s*\{[^}]*font-size:\s*([0-9.]+)rem",
    css,
)
slot_css = css.split(".later-stack[data-later-stack] .row[data-later-rank] .slot", 1)
if len(slot_css) < 2:
    raise SystemExit("later-rank CSS must target slot, not the cover name")
slot_block = slot_css[1].split("}", 1)[0]
slot_size = re.search(r"font-size:\s*([0-9.]+)rem", slot_block)
listing_css = css.split(".later-listing[data-later-listing] .field input", 1)
if len(listing_css) < 2:
    raise SystemExit("occupied claim CSS must compose later-listing")
listing_block = listing_css[1].split("}", 1)[0]
if "var(--primary)" in listing_block or "background:" in listing_block:
    raise SystemExit("do not recolor the occupied later-listing rail")
listing_size = re.search(r"font-size:\s*([0-9.]+)rem", listing_block)
if not later_size or not cover_size or not paid_size or not slot_size or not listing_size:
    raise SystemExit("later-rank, paid name, and later-listing must all have sizes")
if float(later_size.group(1)) >= float(cover_size.group(1)):
    raise SystemExit("later-rank product names must stay quieter than the cover prize")
if float(later_size.group(1)) >= float(paid_size.group(1)):
    raise SystemExit("later-rank dek must stay quieter than the paid name")
if float(slot_size.group(1)) >= float(paid_size.group(1)):
    raise SystemExit("later-rank slot must stay quieter than the paid name")
if float(listing_size.group(1)) >= float(paid_size.group(1)):
    raise SystemExit("occupied claim listing must stay quieter than the paid name")
if "0.78rem" in later_host_block and "--muted" in later_host_block and "font-family: var(--serif)" in later_host_block:
    raise SystemExit("do not stamp 0.78rem --muted on the same name node")
if ".desk:has(.empty) .later-stack" not in css:
    raise SystemExit("empty CSS must keep later-stack off empty")
if ".desk:has(.empty) .later-listing" not in css:
    raise SystemExit("empty CSS must keep later-listing off empty")
if board.count("data-paid-name") < 1:
    raise SystemExit("data-paid-name must stamp occupied cover #1")
if row_fn.count("data-paid-name") != 1:
    raise SystemExit("data-paid-name must stamp only occupied cover #1")
if "What a seller should try this morning" not in board:
    raise SystemExit("empty Why later-write placeholder must stay")
if "${occupiedListingField}" not in occupied_form:
    raise SystemExit("occupied claim must use One-line listing")
if "What a seller should try this morning" in occupied_form:
    raise SystemExit("occupied claim must drop the cover why placeholder")
if "isPaidListing" not in board or "paidListings" not in board:
    raise SystemExit("board view must drop unpaid occupancy before cover")
if 'data-unpaid-off=""' not in board:
    raise SystemExit("unpaid leftover must stamp data-unpaid-off")
if "Unpaid Polar checkout stays off this desk until Polar reports paid" not in board:
    raise SystemExit("claim rail must name unpaid Polar off the desk")
if "An abandoned listing is not cover #1" not in board:
    raise SystemExit("claim rail must refuse abandoned cover #1")
if "data-unpaid-off-quiet" in board or "data-unpaid-off-board" in board:
    raise SystemExit("stamp-only unpaid-off is REJECT")
unpaid_rule = css.split("Unpaid Polar checkout stays off the merch desk until Polar reports paid.", 1)
if len(unpaid_rule) < 2:
    raise SystemExit("unpaid-off CSS must name Polar-paid occupancy")
unpaid_block = unpaid_rule[1].split(".claim-note[data-unpaid-off]", 1)[0]
if ".desk[data-unpaid-off] .row-cover" not in unpaid_block:
    raise SystemExit("unpaid-off CSS must keep unpaid cover off the desk")
if ".desk[data-unpaid-off] .later-stack" not in unpaid_block:
    raise SystemExit("unpaid-off CSS must keep later-stack off unpaid leftover")
if ".desk[data-unpaid-off] .cover-hop" not in unpaid_block:
    raise SystemExit("unpaid-off CSS must keep occupied cover hops off leftover")
if ".desk[data-unpaid-off] .later-listing" not in unpaid_block:
    raise SystemExit("unpaid-off CSS must keep later-listing off leftover")
if ".desk[data-unpaid-off] .claim-after-row" not in unpaid_block:
    raise SystemExit("unpaid-off CSS must keep later-row claim-this-rank off leftover")
if ".desk[data-unpaid-off] .list-after-cover" not in unpaid_block:
    raise SystemExit("unpaid-off CSS must keep occupied List-after-cover rails off leftover")
if "display: none" not in unpaid_block:
    raise SystemExit("unpaid leftover cover must stay off, not restyled")
if "background:" in unpaid_block or "var(--primary)" in unpaid_block:
    raise SystemExit("do not recolor unpaid leftover; hide unpaid cover")
if "take-after-list-seven" in unpaid_block or "data-empty-claim-after" in unpaid_block:
    raise SystemExit("do not stamp another named hop on unpaid-off")
note_css = css.split(".claim-note[data-unpaid-off]", 1)
if len(note_css) < 2:
    raise SystemExit("claim-note unpaid-off CSS missing")
note_block = note_css[1].split("}", 1)[0]
if "background:" in note_block or "var(--primary)" in note_block:
    raise SystemExit("do not recolor the unpaid-off claim note")
if ".desk[data-occupied=\"true\"] .row-cover[data-paid-name] .host[data-cover-name]" not in css:
    raise SystemExit("occupied paid-name prize CSS must stay paid-only")
if "data-later-stack" not in board:
    raise SystemExit("later ranks must group under the cover")
occupied_claim = css.split("Occupied morning: Take is the only first click", 1)
if len(occupied_claim) < 2:
    raise SystemExit("occupied CSS must name Take as the only first click")
later_claim_css = occupied_claim[1].split("Empty morning: Product URL is a later write after Claim #1 / Outbid", 1)[0]
if ".desk[data-occupied=\"true\"] .claim-after-cover[data-claim-after-cover]" not in later_claim_css:
    raise SystemExit("claim-after-cover CSS must recede occupied Claim after the cover")
if "background:" in later_claim_css or "var(--primary)" in later_claim_css:
    raise SystemExit("do not recolor occupied later Claim")
if "take-after-list-seven" in later_claim_css or "data-empty-claim-after" in later_claim_css:
    raise SystemExit("do not stamp another named hop on later Claim")
if "empty-claim-first" in later_claim_css or "data-why-later" in later_claim_css or "data-unpaid-off" in later_claim_css:
    raise SystemExit("occupied claim-after-cover CSS must not swallow empty later-write or unpaid-off")
if "later-claim" in later_claim_css or "data-later-claim" in later_claim_css:
    raise SystemExit("do not revive take-one-first hop restamp")
claim_title = re.search(
    r"\.desk\[data-occupied=\"true\"\] \.claim-after-cover\[data-claim-after-cover\] #claim \.claim-title\s*\{[^}]*font-size:\s*([0-9.]+)rem",
    later_claim_css,
)
empty_title = re.search(
    r"\.desk:has\(\.empty\) #claim \.claim-title\s*\{[^}]*font-size:\s*clamp\(([0-9.]+)rem",
    css,
)
take_h = re.search(r"\.take-after-list-six\s*\{[^}]*min-height:\s*([0-9.]+)rem", css)
outbid_h = re.search(
    r"\.desk\[data-occupied=\"true\"\] \.claim-after-cover\[data-claim-after-cover\] #claim \.outbid\s*\{[^}]*height:\s*([0-9.]+)rem",
    later_claim_css,
)
if not claim_title or not empty_title or not take_h or not outbid_h:
    raise SystemExit("occupied later Claim, empty Claim, Take, and Outbid must all have sizes")
if float(claim_title.group(1)) >= float(empty_title.group(1)):
    raise SystemExit("occupied later Claim must stay quieter than empty Claim #1")
if float(claim_title.group(1)) >= float(take_h.group(1)):
    raise SystemExit("occupied later Claim must stay quieter than Test this today")
if float(outbid_h.group(1)) >= float(take_h.group(1)):
    raise SystemExit("occupied Outbid must stay quieter than Test this today")
if float(claim_title.group(1)) >= float(paid_size.group(1)):
    raise SystemExit("occupied later Claim must stay quieter than the paid cover name")
if 'class="claim-after-cover"' not in board or 'data-claim-after-cover=""' not in board:
    raise SystemExit("occupied claim markup must wrap later Claim after the cover")
empty_claim_attrs = board.split("const claimAttrs = occupied", 1)[-1]
if "data-claim-after-cover" in empty_claim_attrs.split(": '", 1)[-1].split(";", 1)[0]:
    raise SystemExit("empty Claim must not stamp claim-after-cover")
occupied_wrap = board.split("const claimAfterOpen = occupied", 1)
if len(occupied_wrap) < 2 or "data-claim-after-cover" not in occupied_wrap[1].split(': "";', 1)[0]:
    raise SystemExit("occupied Claim must wrap after the cover, not as empty-claim-first")
if 'data-first-click="claim"' in occupied_form:
    raise SystemExit("occupied Claim must not steal the first click from Take")
if board.find("data-claim-after-cover") > board.find('id="claim"'):
    raise SystemExit("occupied Claim wrap must precede #claim in source")
if ".desk[data-unpaid-off] .claim-after-cover" not in unpaid_block:
    raise SystemExit("unpaid leftover must keep occupied later Claim wrap off")
if "data-later-claim" in board or "#claim.later-claim" in css:
    raise SystemExit("do not revive take-one-first hop restamp")
row_cover = row_fn.split("if (isCover)", 1)[-1].split("const claim =", 1)[0]
if "claim-rank" in row_cover or "claim this rank" in row_cover:
    raise SystemExit("occupied cover must not hang Claim on the prize")
if "data-claim-after-row" in row_cover:
    raise SystemExit("occupied cover must not wrap claim-this-rank on the prize")
later_row = row_fn.split("const claim =", 1)[-1]
if 'data-claim-after-row=""' not in later_row or 'class="claim-after-row"' not in later_row:
    raise SystemExit("later merch must wrap claim-this-rank as a later write after the product")
dek_at = later_row.find('class="dek"')
link_end = later_row.find("</a>")
claim_wrap = later_row.find("data-claim-after-row")
claim_btn = later_row.find("claim this rank")
if dek_at < 0 or link_end < 0 or claim_wrap < 0 or claim_btn < 0:
    raise SystemExit("later merch must keep the product, then claim-this-rank")
if not (dek_at < link_end < claim_wrap < claim_btn):
    raise SystemExit("claim-this-rank must recede after the later product, not sit on the name")
if later_row.find("class=\"claim-rank\"") < claim_wrap:
    raise SystemExit("claim-rank node must live inside the later-write wrap")
if 'data-claim-after-row=""' not in board:
    raise SystemExit("later merch must stamp data-claim-after-row")
if "data-later-claim-quiet" in board or "data-later-claim" in board:
    raise SystemExit("stamp-only later-claim mute is REJECT")
if ".row:hover .claim-rank" in css:
    raise SystemExit("claim-this-rank must not hover-reveal a pill on the product")
claim_rank_css = re.search(r"\.claim-rank\s*\{[^}]*\}", css)
if not claim_rank_css:
    raise SystemExit("claim-this-rank CSS missing")
pill = claim_rank_css.group(0)
if "position: absolute" in pill or "position:absolute" in pill:
    raise SystemExit("claim-this-rank must leave the overlay on the product name")
if "var(--primary)" in pill:
    raise SystemExit("later claim-this-rank must not stay a filled primary pill")
later_write_rule = css.split("Occupied later merch: claim-this-rank is a quieter later write after the product, not a filled pill on the name.", 1)
if len(later_write_rule) < 2:
    raise SystemExit("later merch CSS must name claim-this-rank as a quieter later write")
later_write_css = later_write_rule[1].split(".row-1 .rank", 1)[0]
if ".later-stack[data-later-stack] .row[data-later-rank] .claim-after-row[data-claim-after-row]" not in later_write_css:
    raise SystemExit("later merch CSS must compose claim-after-row after the product")
if "background:" in later_write_css or "var(--primary)" in later_write_css:
    raise SystemExit("do not recolor later merch claim-this-rank")
if "take-after-list-seven" in later_write_css or "data-later-claim" in later_write_css:
    raise SystemExit("do not stamp another named hop on later claim-this-rank")
if "empty-claim-first" in later_write_css or "data-why-later" in later_write_css or "data-unpaid-off" in later_write_css:
    raise SystemExit("later merch claim CSS must not swallow empty later-write or unpaid-off")
row_claim_size = re.search(r"font-size:\s*([0-9.]+)rem", later_write_css)
if not row_claim_size:
    raise SystemExit("later merch claim-this-rank must recede in size")
if float(row_claim_size.group(1)) >= float(take_h.group(1)):
    raise SystemExit("later merch claim-this-rank must stay quieter than Test this today")
if float(row_claim_size.group(1)) >= float(paid_size.group(1)):
    raise SystemExit("later merch claim-this-rank must stay quieter than the paid cover name")
if ".desk:has(.empty) .claim-after-row" not in css:
    raise SystemExit("empty CSS must keep later-row claim-this-rank off empty")
if ".desk:has(.empty) .list-after-cover" not in css:
    raise SystemExit("empty CSS must keep occupied List-after-cover rails off empty")
if 'data-list-after-cover=""' not in board:
    raise SystemExit("occupied later List write must stamp data-list-after-cover")
if board.count('data-list-after-cover=""') != 1:
    raise SystemExit("occupied cover keeps one later List write after Take, not three List rails")
if "class=\"list-after-why-wrap list-after-cover\"" in board or "data-list-after-why" in board:
    raise SystemExit("do not keep List under Why; one later List write after Take")
if "class=\"masthead-list list-after-cover\"" in board or "data-list-under-cover" in board:
    raise SystemExit("do not keep masthead List; one later List write after Take")
if "class=\"list-after-take-wrap list-after-cover\"" not in board:
    raise SystemExit("List after Take must recede in the list-after-cover wrap")
if "under this reason" in board or "under today’s cover" in board:
    raise SystemExit("do not keep extra List rail copy on occupied cover")
list_recede_rule = css.split("Occupied cover: Take is the one first click. One later List write after Take recedes after that hop.", 1)
if len(list_recede_rule) < 2:
    raise SystemExit("occupied cover CSS must name Take as the one first click")
list_recede_css = list_recede_rule[1].split("@media (min-width: 768px)", 1)[0]
if ".desk[data-occupied=\"true\"] .list-after-cover[data-list-after-cover]" not in list_recede_css:
    raise SystemExit("list-after-cover CSS must recede occupied List after Take")
if "var(--primary)" in list_recede_css:
    raise SystemExit("do not recolor occupied List rails")
if "take-after-list-seven" in list_recede_css or "list-after-take-seven" in list_recede_css:
    raise SystemExit("do not stamp another named hop on occupied List")
if "empty-claim-first" in list_recede_css or "data-why-later" in list_recede_css or "data-unpaid-off" in list_recede_css:
    raise SystemExit("occupied List recede CSS must not swallow empty later-write or unpaid-off")
if "claim-after-row" in list_recede_css or "data-later-claim" in list_recede_css:
    raise SystemExit("do not restamp later merch claim-this-rank")
if "list-under-cover" in list_recede_css or "list-after-why" in list_recede_css or "masthead-list" in list_recede_css:
    raise SystemExit("recede CSS must not keep collapsed List rails")
list_size = re.search(r"font-size:\s*([0-9.]+)rem", list_recede_css)
if not list_size or not take_h or not paid_size:
    raise SystemExit("occupied List recede, Take, and paid name must all have sizes")
if float(list_size.group(1)) >= float(take_h.group(1)):
    raise SystemExit("occupied List write must stay quieter than Test this today")
if float(list_size.group(1)) >= float(paid_size.group(1)):
    raise SystemExit("occupied List write must stay quieter than the why / paid cover prize")
why_prize = re.search(
    r"\.cover-why-line\[data-prize-before-price\]\s*\{[^}]*font-size:\s*([0-9.]+)rem",
    css,
)
if not why_prize:
    raise SystemExit("why prize CSS missing")
if float(list_size.group(1)) >= float(why_prize.group(1)):
    raise SystemExit("occupied List write must stay quieter than the why prize")
if 'data-first-click="take"' not in board:
    raise SystemExit("Test this today must stay the occupied first click")
if "data-prize-before-price" not in board:
    raise SystemExit("why must stay the occupied cover prize")
if 'data-claim-after-row=""' not in board:
    raise SystemExit("later merch claim-this-rank quiet already shipped — do not drop it")
if "claimKicker" in board or 'class="claim-kicker"' in board:
    raise SystemExit("occupied claim rail must drop the second List kicker")
if board.count(">List a product<") != 1:
    raise SystemExit("occupied later List write after Take should stay the only List label")
claim_src = board.split('id="claim"', 1)[-1]
if "List a product" in claim_src:
    raise SystemExit("claim rail must not label a second List")
if "${claimCopy}" not in claim_src or "${bidForm}" not in claim_src:
    raise SystemExit("claim rail must stay Claim #1 / Outbid")
if 'data-bid-step="-1"' not in claim_src or 'data-bid-step="1"' not in claim_src:
    raise SystemExit("claim rail must stay dashed $amount / ±")
if "Claim #1 for" not in board or ">Outbid<" not in board:
    raise SystemExit("claim rail must keep Claim #1 / Outbid copy")
if ".desk[data-occupied=\"true\"] .claim-after-cover[data-claim-after-cover] #claim .claim-kicker" in css:
    raise SystemExit("occupied claim CSS must not restyle a second List kicker")
if "Occupied later List write after Take is the only List label" not in board:
    raise SystemExit("occupied claim rail comment must name the only List label")
PY
  grep -q 'You pay only the difference' src/views/board.ts \
    || fail "board missing raise-pays-difference copy"
  grep -q 'text-decoration-style: dashed' src/views/styles.ts \
    || fail "bid amount is not dashed"
  grep -q 'no ads' src/http/pages/about.ts \
    || grep -q 'No ads' src/http/pages/about.ts \
    || fail "about copy missing no ads"
  grep -q 'No API keys' src/http/pages/about.ts \
    || fail "about copy missing no API keys"
  grep -q 'revenue share' src/http/pages/about.ts \
    || fail "about copy missing no revenue share"
  grep -q '\$5' src/http/pages/rules.ts \
    || fail "rules copy missing \$5 floor"
  grep -q 'older' src/http/pages/rules.ts \
    || fail "rules copy missing older-wins ties"
  grep -q 'difference' src/http/pages/rules.ts \
    || fail "rules copy missing raise difference"
  grep -q 'BOARD_TZ' src/http/pages/rules.ts \
    || fail "rules copy missing BOARD_TZ"
  grep -q 'NSFW' src/http/pages/rules.ts \
    || fail "rules copy missing NSFW ban"
  grep -q 'utm_' src/http/pages/rules.ts \
    || fail "rules copy missing stripped tracking"
fi

echo "OK: buildable and testable"
