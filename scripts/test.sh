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
list_hop = src.find("data-list-under-cover")
if list_hop < 0 or list_hop > board:
    raise SystemExit(1)
cover_why = src.find("data-cover-why")
cover_hop = src.find("data-cover-hop")
if cover_why < 0 or cover_hop < 0 or cover_why > cover_hop:
    raise SystemExit(1)
list_after = src.find("data-list-after-why")
if list_after < 0 or list_after < cover_why or list_after > cover_hop:
    raise SystemExit(1)
take_after = src.find("data-take-after-list")
if take_after < 0 or take_after < list_after or take_after > cover_hop:
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
host_after = src.find("<p class=\"host\">")
if host_after < 0 or cover_hop > host_after or list_after_take > host_after:
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
  grep -q 'data-list-under-cover' src/views/board.ts \
    || fail "paid morning missing List a product hop"
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
  grep -q 'data-list-after-why' src/views/board.ts \
    || fail "paid cover missing list-after-why hop"
  grep -q 'under this reason' src/views/board.ts \
    || fail "list-after-why hop does not sit under the cover reason"
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
  grep -q 'data-last24h' src/views/board.ts \
    || fail "board missing last-24h strip"
  grep -q 'data-last24h-empty' src/views/board.ts \
    || fail "last-24h strip missing honest empty"
  grep -q 'No invented #1' src/views/board.ts \
    || fail "empty last-24h strip does not refuse an invented #1"
  grep -q 'data-last24h-rank' src/views/board.ts \
    || fail "occupied last-24h strip missing rank that is not cover #1"
  grep -q 'A strip rank is not today’s cover' src/views/board.ts \
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
if "#${listing.rank}" in board.split("renderLast24hRow", 1)[-1].split("renderLast24hStrip", 1)[0]:
    raise SystemExit("strip rank must not print cover #N")
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
