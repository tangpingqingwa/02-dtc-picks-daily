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
  unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET POLAR_FIXTURE_ONLY || true
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
  grep -q 'Claim #1 for' src/views/board.ts \
    || fail "board missing Claim #1 chrome"
  grep -q 'Outbid' src/views/board.ts \
    || fail "board missing Outbid button"
  grep -q 'data-empty-board' src/views/board.ts \
    || fail "board missing honest empty marker"
  grep -q 'Quiet morning' src/views/board.ts \
    || fail "empty state is not a quiet morning"
  grep -q 'Morning merch desk' src/views/board.ts \
    || fail "board missing morning-desk chrome"
  grep -q 'data-issue-date' src/views/board.ts \
    || fail "board missing issue date"
  grep -q 'Why test this today' src/views/board.ts \
    || fail "listing missing why-test-this-today"
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
