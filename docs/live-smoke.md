# Live smoke — DTC Picks Daily

Operator-only. `bash scripts/live-smoke.sh` is **not** called from `scripts/test.sh` or GitHub Actions. CI and `scripts/test.sh` stay offline and must not set `POLAR_LIVE`.

`100%` for this unit means a **local process** walked every SPEC flow below. Fixture checkout is the default path. Live Polar runs only when `POLAR_LIVE=1`. Missing Polar secret is `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` — that is not a fixture success. Do not invent listings. An empty morning is valid.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` / `GITHUB_ACTIONS=true` (override only with `LIVE_SMOKE_ALLOW_CI=1` for a local dry-run, never in Actions).
2. Starts `node --import tsx src/server.ts` on a free loopback port with a temp SQLite file, Polar env unset (fixture checkout).
3. Or attaches to `LIVE_SMOKE_BASE` if that server already answers `GET /healthz`.
4. Walks board, bid increment, first paid row, underbid, raise, `/about`, `/rules`, click increment.
5. Live Polar: if `POLAR_LIVE` is not `1` or `POLAR_ACCESS_TOKEN` is empty, prints `BLOCKED-SECRET: POLAR_ACCESS_TOKEN`. A sandbox token also needs `POLAR_PRODUCT_ID` or the live row is `BLOCKED-SECRET: POLAR_PRODUCT_ID`.
6. Kills the process it started and deletes the temp database.

Overrides: `LIVE_SMOKE_BASE`, `LIVE_SMOKE_PORT`, `BOARD_TZ` (default `UTC`).

Live Polar (operator machine with a **sandbox** token). Production `https://api.polar.sh` returns 401 for this token. Source `~/.polar/sandbox.env`, set `POLAR_LIVE=1`, unset `POLAR_FIXTURE_ONLY`, and point the client at the sandbox API:

```bash
set -a
source ~/.polar/sandbox.env
set +a
unset POLAR_FIXTURE_ONLY
POLAR_LIVE=1 POLAR_API_BASE=https://sandbox-api.polar.sh bash scripts/live-smoke.sh
```

The live process must redirect to a real `https://sandbox.polar.sh/checkout/…` URL. A fixture `/` listing is a FAIL. Missing secret stays `BLOCKED-SECRET`; do not invent a paid row.

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented product error; nothing invented. |
| `BLOCKED-SECRET` | Live Polar secret missing. Exact env var named. |
| `FAIL` | Broken product or invented listing/count. |

## This session

Ran `bash scripts/live-smoke.sh` on **2026-08-23** from `feat/live-polar-sandbox-smoke` (parent `aa8aa17` / `origin/main`). Sourced `~/.polar/sandbox.env` (mode 600). `POLAR_LIVE=1`. `POLAR_FIXTURE_ONLY` unset. `POLAR_API_BASE=https://sandbox-api.polar.sh`. Token / webhook / product id present by length only (53 / 49 / 36). `bash scripts/test.sh` stayed offline and never set `POLAR_LIVE`.

Fixture walk: script-started local process on `http://127.0.0.1:57821`, temp SQLite. Empty board first, then fixture-paid `cover.example` / `under.example` URLs unique to this run.

Live Polar: second local process, live-flagged, same operator secrets. `POST /checkout` $5 → **303** `https://sandbox.polar.sh/checkout/polar_c_CIbMOQ20KmGGTCiTQE63QaoBqmpC8pdLZ3Jwz4D2lev`. Unpaid session **not** listed. Not a fixture `/` listing. Not production `polar.sh` / `api.polar.sh`.

| Flow | Result | Note |
|---|---|---|
| healthz | **PASS** | `GET /healthz` 200 |
| board | **PASS** | `GET /` 200 empty board + bid form. No invented listings. |
| bid-increment | **PASS** | Whole-dollar − / + (`data-bid-step`) on the claim control. |
| first-bid | **PASS** | Fixture pay $20 → #1, `0 clicks`. |
| underbid | **PASS** | Fixture pay $8 → #2; cover stays #1. |
| raise | **PASS** | Same canonical URL $20 → $25 (tracking query stripped). One cover row. |
| about | **PASS** | `GET /about` 200. No ads / no API keys / no revenue share. UTC. Rank is the bid. |
| rules | **PASS** | `GET /rules` 200. $5 floor, older-wins, raise = difference, NSFW, `utm_*`, `BOARD_TZ`, Polar. |
| click-increment | **PASS** | `GET /r/178d7b8f-e6c9-4c95-8904-925e39abf8ae` 302 to stripped URL. Clicks `0→1`. |
| polar-live | **PASS** | Real Polar sandbox Checkout URL `https://sandbox.polar.sh/checkout/polar_c_CIbMOQ20KmGGTCiTQE63QaoBqmpC8pdLZ3Jwz4D2lev`. Unpaid session not listed. |

Process exit 0 (`PASS=10` `PASS-ERROR=0` `BLOCKED-SECRET=0` `FAIL=0`). Missing secret still records `BLOCKED-SECRET` and must not invent a paid row.

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not set `POLAR_LIVE=1` in CI or `scripts/test.sh`.
- Does not seed fake SKUs or click counts on an empty morning.
- Does not treat a missing Polar secret as a paid listing.
- Does not send the sandbox token to production `https://api.polar.sh`.
