#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# When application code lands, add unit/contract tests here. Do not delete the
# contract checks. Do not require live Polar or other third-party networks.
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
  echo "== app tests =="
  command -v npx >/dev/null || fail "npx missing but package.json exists"
  npx tsc --noEmit
  npx tsx --test tests/**/*.test.ts
fi

echo "OK: buildable and testable"
