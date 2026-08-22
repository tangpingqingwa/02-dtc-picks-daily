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
5. Live Polar: if `POLAR_LIVE` is not `1` or `POLAR_ACCESS_TOKEN` is empty, prints `BLOCKED-SECRET: POLAR_ACCESS_TOKEN`.
6. Kills the process it started and deletes the temp database.

Overrides: `LIVE_SMOKE_BASE`, `LIVE_SMOKE_PORT`, `BOARD_TZ` (default `UTC`).

Live Polar (operator machine with a real token):

```bash
POLAR_LIVE=1 POLAR_ACCESS_TOKEN=… bash scripts/live-smoke.sh
```

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented product error; nothing invented. |
| `BLOCKED-SECRET` | Live Polar secret missing. Exact env var named. |
| `FAIL` | Broken product or invented listing/count. |

## This session

Ran `bash scripts/live-smoke.sh` on **2026-08-22** from `feat/live-smoke` (parent `0199502`, about/rules on `origin/main`). Local process started by the script on `http://127.0.0.1:51274`. Temp SQLite. `POLAR_LIVE` unset. `POLAR_ACCESS_TOKEN` unset. No invented SKUs: empty board first, then fixture-paid `cover.example` / `under.example` URLs unique to this run.

| Flow | Result | Note |
|---|---|---|
| healthz | **PASS** | `GET /healthz` 200 `{ ok: true }` |
| board | **PASS** | `GET /` 200 empty board + bid form. No invented listings. |
| bid-increment | **PASS** | Whole-dollar − / + (`data-bid-step`) on the claim control. |
| first-bid | **PASS** | Fixture pay $20 → #1, `0 clicks`. |
| underbid | **PASS** | Fixture pay $8 → #2; cover stays #1. |
| raise | **PASS** | Same canonical URL $20 → $25 (tracking query stripped). One cover row. |
| about | **PASS** | `GET /about` 200. No ads / no API keys / no revenue share. UTC. Rank is the bid. |
| rules | **PASS** | `GET /rules` 200. $5 floor, older-wins, raise = difference, NSFW, `utm_*`, `BOARD_TZ`, Polar. |
| click-increment | **PASS** | `GET /r/78645562-f803-4bdb-a7a6-48ba97b30025` 302 to stripped URL. Clicks `0→1`. |
| polar-live | **BLOCKED-SECRET** | `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` |

Process exit 0 (`PASS=9` `PASS-ERROR=0` `BLOCKED-SECRET=1` `FAIL=0`). Re-run with `POLAR_LIVE=1` and a real token to complete Polar Checkout; missing token must stay `BLOCKED-SECRET`, never a fixture listing.

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not set `POLAR_LIVE=1` in CI.
- Does not seed fake SKUs or click counts on an empty morning.
- Does not treat a missing Polar secret as a paid listing.
