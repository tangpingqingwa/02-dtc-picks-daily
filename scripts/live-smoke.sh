#!/usr/bin/env bash
# Operator smoke against a local process. Not called from scripts/test.sh or CI.
# Fixture path always. Live Polar only when POLAR_LIVE=1.
# Missing Polar live secret → BLOCKED-SECRET: POLAR_ACCESS_TOKEN
# Do not invent listings. Empty board is valid.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  fail "live-smoke must not run in GitHub Actions"
fi
if [[ "${CI:-}" == "true" && "${LIVE_SMOKE_ALLOW_CI:-}" != "1" ]]; then
  fail "live-smoke is opt-in and refuses CI unless LIVE_SMOKE_ALLOW_CI=1"
fi

command -v curl >/dev/null || fail "curl is required"
command -v node >/dev/null || fail "node is required"

if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

PASS=0
PASS_ERROR=0
BLOCKED=0
FAIL=0
STARTED_PID=""
WORKDIR=""
RESULT_LOG=""
BASE="${LIVE_SMOKE_BASE:-}"

cleanup() {
  if [[ -n "${STARTED_PID}" ]] && kill -0 "${STARTED_PID}" 2>/dev/null; then
    kill "${STARTED_PID}" 2>/dev/null || true
    wait "${STARTED_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WORKDIR}" && -d "${WORKDIR}" ]]; then
    rm -rf "${WORKDIR}"
  fi
}
trap cleanup EXIT

record() {
  local flow="$1"
  local status="$2"
  local note="${3:-}"
  printf 'RESULT\t%s\t%s\t%s\n' "$flow" "$status" "$note"
  if [[ -n "${RESULT_LOG}" ]]; then
    printf '%s\t%s\t%s\n' "$flow" "$status" "$note" >>"${RESULT_LOG}"
  fi
  case "$status" in
    PASS) PASS=$((PASS + 1)) ;;
    PASS-ERROR) PASS_ERROR=$((PASS_ERROR + 1)) ;;
    BLOCKED-SECRET) BLOCKED=$((BLOCKED + 1)) ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
    *) fail "unknown smoke status ${status}" ;;
  esac
}

pick_port() {
  node --input-type=module -e '
    import net from "node:net";
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") process.exit(1);
      process.stdout.write(String(addr.port));
      server.close();
    });
  '
}

wait_health() {
  local url="$1/healthz"
  local i
  for i in $(seq 1 50); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

http_get() {
  local path="$1"
  local out="$2"
  curl -sS -o "$out" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    "${BASE}${path}"
}

http_get_headers() {
  local path="$1"
  local body="$2"
  local hdrs="$3"
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    "${BASE}${path}"
}

http_post_form() {
  local path="$1"
  local out="$2"
  local hdrs="$3"
  shift 3
  curl -sS -D "$hdrs" -o "$out" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    -X POST \
    -H "content-type: application/x-www-form-urlencoded" \
    "$@" \
    "${BASE}${path}"
}

header_value() {
  local file="$1"
  local name="$2"
  awk -v name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { FS = ": " }
    tolower($1) == name {
      val = $0
      sub(/^[^:]+:[ \t]*/, "", val)
      gsub(/\r/, "", val)
      print val
      exit
    }
  ' "$file"
}

html_has() {
  local file="$1"
  local pattern="$2"
  grep -Eq "$pattern" "$file"
}

listing_ids() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const ids = [...html.matchAll(/data-listing-id="([^"]+)"/g)].map((m) => m[1]);
    process.stdout.write(ids.join("\n"));
  ' "$1"
}

listing_count() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const ids = [...html.matchAll(/data-listing-id="([^"]+)"/g)];
    process.stdout.write(String(ids.length));
  ' "$1"
}

clicks_for_id() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const id = process.argv[2];
    const re = new RegExp(
      `data-listing-id="${id}"[\\s\\S]*?<span class="clicks">[\\s\\S]*?(\\d+) clicks`,
    );
    const match = html.match(re);
    if (!match) process.exit(2);
    process.stdout.write(match[1]);
  ' "$1" "$2"
}

rank_for_host() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const host = process.argv[2];
    const articles = [...html.matchAll(/<article class="row[\s\S]*?<\/article>/g)].map((m) => m[0]);
    for (const article of articles) {
      if (article.includes(host)) {
        const rank = article.match(/data-rank="(\d+)"/);
        if (rank) {
          process.stdout.write(rank[1]);
          process.exit(0);
        }
      }
    }
    process.exit(2);
  ' "$1" "$2"
}

bid_for_host() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const host = process.argv[2];
    const articles = [...html.matchAll(/<article class="row[\s\S]*?<\/article>/g)].map((m) => m[0]);
    for (const article of articles) {
      if (article.includes(host)) {
        const bid = article.match(/<(?:p|span) class="bid(?: later-fact)?"[^>]*>\$(\d+)<\/(?:p|span)>/);
        if (bid) {
          process.stdout.write(bid[1]);
          process.exit(0);
        }
      }
    }
    process.exit(2);
  ' "$1" "$2"
}

id_for_host() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const host = process.argv[2];
    const articles = [...html.matchAll(/<article class="row[\s\S]*?<\/article>/g)].map((m) => m[0]);
    for (const article of articles) {
      if (article.includes(host)) {
        const id = article.match(/data-listing-id="([^"]+)"/);
        if (id) {
          process.stdout.write(id[1]);
          process.exit(0);
        }
      }
    }
    process.exit(2);
  ' "$1" "$2"
}

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/dtc-picks-live-smoke.XXXXXX")"
RESULT_LOG="${WORKDIR}/results.tsv"
: >"${RESULT_LOG}"

echo "== live-smoke (operator only; not CI) =="
echo "root=${root}"

if [[ -z "${BASE}" ]]; then
  PORT="${LIVE_SMOKE_PORT:-$(pick_port)}"
  BASE="http://127.0.0.1:${PORT}"
  DB_PATH="${WORKDIR}/board.sqlite"
  LOG_PATH="${WORKDIR}/server.log"
  echo "starting local fixture server on ${BASE}"
  echo "database=${DB_PATH}"
  (
    cd "$root"
    unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET POLAR_FIXTURE_ONLY || true
    export PORT
    export DATABASE_PATH="${DB_PATH}"
    export BOARD_TZ="${BOARD_TZ:-UTC}"
    exec node --import tsx src/server.ts
  ) >"${LOG_PATH}" 2>&1 &
  STARTED_PID=$!
  if ! wait_health "$BASE"; then
    echo "server log:" >&2
    cat "${LOG_PATH}" >&2 || true
    fail "local server did not become healthy at ${BASE}/healthz"
  fi
else
  BASE="${BASE%/}"
  echo "assuming existing server at ${BASE}"
  if ! wait_health "$BASE"; then
    fail "existing server at ${BASE} did not answer /healthz"
  fi
fi

echo "base=${BASE}"
echo "POLAR_LIVE=${POLAR_LIVE:-<unset>}"
echo "POLAR_API_BASE=${POLAR_API_BASE:-<unset>}"

# --- healthz ---
health_body="${WORKDIR}/healthz.json"
health_code="$(http_get "/healthz" "$health_body" || true)"
if [[ "$health_code" == "200" ]] && grep -q '"ok":true' "$health_body"; then
  record "healthz" "PASS" "GET /healthz 200"
else
  record "healthz" "FAIL" "GET /healthz HTTP ${health_code}"
fi

# --- board (empty morning is valid; do not seed fake SKUs) ---
board0="${WORKDIR}/board0.html"
board0_code="$(http_get "/" "$board0" || true)"
if [[ "$board0_code" != "200" ]]; then
  record "board" "FAIL" "GET / HTTP ${board0_code}"
elif ! html_has "$board0" 'name="productUrl"' || ! html_has "$board0" 'name="whyTestThisToday"' \
  || ! html_has "$board0" 'name="bidUsd"' || ! html_has "$board0" 'action="/checkout"'; then
  record "board" "FAIL" "GET / missing bid form"
elif html_has "$board0" 'units sold|star rating|review count|trending score'; then
  record "board" "FAIL" "GET / invented social proof"
else
  empty_ok=0
  if html_has "$board0" 'data-empty-board' && html_has "$board0" 'No listings yet today'; then
    empty_ok=1
  fi
  if [[ "$empty_ok" -eq 1 ]]; then
    record "board" "PASS" "GET / 200 empty board + bid form (no invented listings)"
  else
    count="$(listing_count "$board0")"
    record "board" "PASS" "GET / 200 bid form; ${count} already-paid row(s) (not seeded by smoke)"
  fi
fi

# Bid stepper (− / +) is the claim increment control.
if html_has "$board0" 'data-bid-step="-1"' && html_has "$board0" 'data-bid-step="1"' \
  && html_has "$board0" 'aria-label="Increase bid by one dollar"'; then
  record "bid-increment" "PASS" "board exposes whole-dollar − / + increment"
else
  record "bid-increment" "FAIL" "board missing bid increment controls"
fi

# Unique fixture URLs so an assumed server is not polluted with invented SKUs.
STAMP="$(date -u +%Y%m%d%H%M%S)"
COVER_URL="https://cover.example/apps/pick-${STAMP}"
UNDER_URL="https://under.example/sku-${STAMP}"
COVER_HOST="cover.example/apps/pick-${STAMP}"
UNDER_HOST="under.example/sku-${STAMP}"
COVER_WHY="Cover app sellers should install this morning"
UNDER_WHY="Cheaper SKU still belongs on the brief"
RAISE_WHY="Same SKU raised; pay only the difference"

# --- first paid row via fixture checkout ($20 so an $8 underbid can land) ---
cover_body="${WORKDIR}/checkout-cover.body"
cover_hdrs="${WORKDIR}/checkout-cover.hdrs"
cover_code="$(http_post_form "/checkout" "$cover_body" "$cover_hdrs" \
  --data-urlencode "productUrl=${COVER_URL}" \
  --data-urlencode "whyTestThisToday=${COVER_WHY}" \
  --data-urlencode "bidUsd=20" || true)"
cover_loc="$(header_value "$cover_hdrs" "location" || true)"
if [[ "$cover_code" != "303" || "$cover_loc" != "/" ]]; then
  record "first-bid" "FAIL" "POST /checkout \$20 HTTP ${cover_code} loc=${cover_loc}"
else
  board1="${WORKDIR}/board1.html"
  board1_code="$(http_get "/" "$board1" || true)"
  cover_rank="$(rank_for_host "$board1" "$COVER_HOST" || true)"
  cover_bid="$(bid_for_host "$board1" "$COVER_HOST" || true)"
  if [[ "$board1_code" == "200" && "$cover_rank" == "1" && "$cover_bid" == "20" ]] \
    && html_has "$board1" '0 clicks' && ! html_has "$board1" 'data-empty-board'; then
    record "first-bid" "PASS" "fixture \$20 listed at #1 with 0 clicks"
  else
    record "first-bid" "FAIL" "fixture \$20 did not list at #1 (HTTP ${board1_code} rank=${cover_rank} bid=${cover_bid})"
  fi
fi

# --- underbid still lists, not #1 ---
under_body="${WORKDIR}/checkout-under.body"
under_hdrs="${WORKDIR}/checkout-under.hdrs"
under_code="$(http_post_form "/checkout" "$under_body" "$under_hdrs" \
  --data-urlencode "productUrl=${UNDER_URL}" \
  --data-urlencode "whyTestThisToday=${UNDER_WHY}" \
  --data-urlencode "bidUsd=8" || true)"
under_loc="$(header_value "$under_hdrs" "location" || true)"
board2="${WORKDIR}/board2.html"
board2_code="$(http_get "/" "$board2" || true)"
under_rank="$(rank_for_host "$board2" "$UNDER_HOST" || true)"
cover_rank2="$(rank_for_host "$board2" "$COVER_HOST" || true)"
if [[ "$under_code" != "303" ]]; then
  record "underbid" "FAIL" "POST /checkout \$8 HTTP ${under_code}"
elif [[ "$board2_code" == "200" && "$cover_rank2" == "1" && -n "$under_rank" && "$under_rank" != "1" ]]; then
  record "underbid" "PASS" "fixture \$8 listed at #${under_rank}, cover stays #1"
else
  record "underbid" "FAIL" "underbid did not list below #1 (cover=${cover_rank2} under=${under_rank})"
fi

# --- raise same canonical URL; one row; higher bid ---
raise_body="${WORKDIR}/checkout-raise.body"
raise_hdrs="${WORKDIR}/checkout-raise.hdrs"
raise_code="$(http_post_form "/checkout" "$raise_body" "$raise_hdrs" \
  --data-urlencode "productUrl=${COVER_URL}?utm_source=smoke&aff=1" \
  --data-urlencode "whyTestThisToday=${RAISE_WHY}" \
  --data-urlencode "bidUsd=25" || true)"
board3="${WORKDIR}/board3.html"
board3_code="$(http_get "/" "$board3" || true)"
cover_bid3="$(bid_for_host "$board3" "$COVER_HOST" || true)"
cover_count="$(grep -c "$COVER_HOST" "$board3" || true)"
if [[ "$raise_code" != "303" ]]; then
  record "raise" "FAIL" "POST /checkout raise HTTP ${raise_code}"
elif [[ "$board3_code" == "200" && "$cover_bid3" == "25" && "$cover_count" -ge 1 ]] \
  && ! html_has "$board3" 'utm_source' && ! html_has "$board3" 'aff=1'; then
  record "raise" "PASS" "same URL raised to \$25; tracking stripped; still one cover row"
else
  record "raise" "FAIL" "raise did not land at \$25 (bid=${cover_bid3} HTTP ${board3_code})"
fi

# --- about / rules ---
about_body="${WORKDIR}/about.html"
about_code="$(http_get "/about" "$about_body" || true)"
if [[ "$about_code" == "200" ]] && html_has "$about_body" 'No ads' \
  && html_has "$about_body" 'No API keys' && html_has "$about_body" 'No revenue share' \
  && html_has "$about_body" 'Rank is the bid' && html_has "$about_body" 'UTC'; then
  record "about" "PASS" "GET /about 200 copy contract"
else
  record "about" "FAIL" "GET /about HTTP ${about_code}"
fi

rules_body="${WORKDIR}/rules.html"
rules_code="$(http_get "/rules" "$rules_body" || true)"
if [[ "$rules_code" == "200" ]] && html_has "$rules_body" 'Minimum <strong>\$5</strong>' \
  && html_has "$rules_body" 'difference' && html_has "$rules_body" 'older' \
  && html_has "$rules_body" 'NSFW' && html_has "$rules_body" 'utm_\*' \
  && html_has "$rules_body" 'BOARD_TZ' && html_has "$rules_body" 'Polar'; then
  record "rules" "PASS" "GET /rules 200 copy contract"
else
  record "rules" "FAIL" "GET /rules HTTP ${rules_code}"
fi

# --- click increment through /r/:id (do not invent a count) ---
cover_id="$(id_for_host "$board3" "$COVER_HOST" || true)"
if [[ -z "${cover_id}" ]]; then
  record "click-increment" "FAIL" "no paid listing id to click"
else
  before_clicks="$(clicks_for_id "$board3" "$cover_id" || echo "")"
  click_body="${WORKDIR}/click.body"
  click_hdrs="${WORKDIR}/click.hdrs"
  click_code="$(http_get_headers "/r/${cover_id}" "$click_body" "$click_hdrs" || true)"
  click_loc="$(header_value "$click_hdrs" "location" || true)"
  board4="${WORKDIR}/board4.html"
  http_get "/" "$board4" >/dev/null || true
  after_clicks="$(clicks_for_id "$board4" "$cover_id" || echo "")"
  if [[ "$click_code" == "404" ]]; then
    record "click-increment" "FAIL" "GET /r/${cover_id} 404 (redirect hop not registered)"
  elif [[ "$before_clicks" =~ ^[0-9]+$ && "$after_clicks" =~ ^[0-9]+$ ]] \
    && [[ "$after_clicks" -eq $((before_clicks + 1)) ]] \
    && [[ "$click_code" =~ ^30[12378]$ ]] \
    && [[ "$click_loc" == "https://cover.example/apps/pick-${STAMP}" ]]; then
    record "click-increment" "PASS" "GET /r/${cover_id} ${click_code} → stripped URL; clicks ${before_clicks}→${after_clicks}"
  else
    record "click-increment" "FAIL" "GET /r/${cover_id} HTTP ${click_code} loc=${click_loc} clicks ${before_clicks}→${after_clicks}"
  fi
fi

# --- Polar live: never treat missing secret as a fixture success ---
echo "== polar live =="
if [[ "${POLAR_LIVE:-}" == "1" ]]; then
  if [[ -z "${POLAR_ACCESS_TOKEN:-}" ]]; then
    echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
    record "polar-live" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
  elif [[ -z "${POLAR_PRODUCT_ID:-}" ]]; then
    echo "BLOCKED-SECRET: POLAR_PRODUCT_ID"
    record "polar-live" "BLOCKED-SECRET" "POLAR_PRODUCT_ID"
  else
    live_port="$(pick_port)"
    live_db="${WORKDIR}/polar-live.sqlite"
    live_log="${WORKDIR}/polar-live.log"
    live_base="http://127.0.0.1:${live_port}"
    live_pid=""
    (
      cd "$root"
      export POLAR_LIVE=1
      unset POLAR_FIXTURE_ONLY || true
      export POLAR_ACCESS_TOKEN
      export POLAR_WEBHOOK_SECRET="${POLAR_WEBHOOK_SECRET:-}"
      export POLAR_API_BASE="${POLAR_API_BASE:-https://sandbox-api.polar.sh}"
      if [[ -n "${POLAR_PRODUCT_ID:-}" ]]; then
        export POLAR_PRODUCT_ID
      fi
      export PORT="${live_port}"
      export DATABASE_PATH="${live_db}"
      export PUBLIC_BASE_URL="${live_base}"
      export BOARD_TZ="${BOARD_TZ:-UTC}"
      exec node --import tsx src/server.ts
    ) >"${live_log}" 2>&1 &
    live_pid=$!
    if ! wait_health "$live_base"; then
      if grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' "${live_log}"; then
        echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
        record "polar-live" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
      else
        record "polar-live" "FAIL" "live Polar process did not become healthy"
      fi
    else
      live_body="${WORKDIR}/polar-live.body"
      live_hdrs="${WORKDIR}/polar-live.hdrs"
      live_code="$(
        curl -sS -D "$live_hdrs" -o "$live_body" -w "%{http_code}" \
          --connect-timeout 5 --max-time 30 \
          -X POST \
          -H "content-type: application/x-www-form-urlencoded" \
          --data-urlencode "productUrl=https://live.example/sku-${STAMP}" \
          --data-urlencode "whyTestThisToday=Live Polar must not list until paid" \
          --data-urlencode "bidUsd=5" \
          "${live_base}/checkout" || true
      )"
      live_loc="$(header_value "$live_hdrs" "location" || true)"
      live_board="${WORKDIR}/polar-live-board.html"
      curl -sS -o "$live_board" "${live_base}/" >/dev/null || true
      if html_has "$live_board" "live.example/sku-${STAMP}"; then
        record "polar-live" "FAIL" "unpaid live Polar session appeared on the board"
      elif [[ "$live_code" == "303" && "$live_loc" == https://sandbox.polar.sh/* ]]; then
        record "polar-live" "PASS" "live sandbox checkout ${live_loc}; unpaid session not listed"
      elif [[ "$live_code" == "303" && "$live_loc" == https://polar.sh/* ]]; then
        record "polar-live" "FAIL" "live checkout hit production Polar (${live_loc}); sandbox required"
      elif [[ "$live_code" == "303" && "$live_loc" == https://*polar.sh* ]]; then
        record "polar-live" "PASS-ERROR" "live Polar HTTP ${live_code} loc=${live_loc} (not sandbox.polar.sh)"
      else
        record "polar-live" "PASS-ERROR" "live Polar HTTP ${live_code} loc=${live_loc} (no invented listing)"
      fi
    fi
    if [[ -n "${live_pid}" ]] && kill -0 "${live_pid}" 2>/dev/null; then
      kill "${live_pid}" 2>/dev/null || true
      wait "${live_pid}" 2>/dev/null || true
    fi
  fi
else
  if [[ -z "${POLAR_ACCESS_TOKEN:-}" ]]; then
    echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
    record "polar-live" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
  else
    record "polar-live" "PASS-ERROR" "POLAR_LIVE unset; token present but live Polar not invoked"
  fi
fi

echo
echo "== summary =="
echo "PASS=${PASS} PASS-ERROR=${PASS_ERROR} BLOCKED-SECRET=${BLOCKED} FAIL=${FAIL}"
if [[ -f "${RESULT_LOG}" ]]; then
  echo "----"
  while IFS=$'\t' read -r flow status note; do
    printf '%-16s %-16s %s\n' "$flow" "$status" "$note"
  done <"${RESULT_LOG}"
fi

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
