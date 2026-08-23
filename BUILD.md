# DTC Picks Daily — Build Plan

**Status:** Ready to implement
**Product contract:** [SPEC.md](./SPEC.md) wins on ranking, listing shape, URL rules, cadence, and Polar behavior.
**This file** wins on stack, module boundaries, test layout, and the PR sequence.
**Git:** [CONTRIBUTING.md](./CONTRIBUTING.md). Every row in the PR plan is one squash-merged PR. `main` stays green.

---

## 0. What we are building

A single public site that auctions **this morning’s cover** of a DTC / Shopify / Amazon picks brief.

1. Anyone can read today’s leaderboard.
2. Anyone can pay Polar (or a fixture checkout in tests) to list or raise a product URL.
3. Rank is the whole-dollar bid. Older listing wins ties. Underbids still list.
4. The cover resets at `00:00` in `BOARD_TZ` (default **UTC**).
5. No ads, no API keys, no revenue share.

Clone the outbid.lol board UX. Do not clone their copy or their $2 floor — ours is **$5** and the listing is **product URL + why test this today**.

---

## 1. Locked stack (do not bikeshed in implementation PRs)

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 LTS | Same fleet runtime |
| Language | TypeScript 5.x, `strict` | Rank math stays typed |
| HTTP | Fastify 5 | One process, schema validation |
| HTML | Server-rendered pages (Fastify view or tagged templates) | Board must work without a client bundle |
| Persistence | SQLite via `better-sqlite3` | One file, backup = copy |
| Money | Polar Checkout + webhook | SPEC; merchant of record |
| Tests | `node:test` + `tsx` | No Jest tax |
| Lint | `tsc --noEmit` in `scripts/test.sh` once `src/` exists |
| Process | `node --import tsx src/server.ts` in dev |
| Host | One VPS, Caddy TLS. No AWS required for v1 |

**Out of stack:** Next.js, Vercel, Prisma, Redis, Kubernetes, Stripe-as-primary (Polar is the rail).

---

## 2. Process architecture

```
 HTTPS :443          Caddy
                        │ :3000
                   Fastify app.ts
          /  /about  /rules  /checkout  /webhooks/polar  /r/:id  /healthz
                        │
                    core/board
              rank · raise · day-key · clicks
                        │
         ┌──────────────┼──────────────┐
         │              │              │
      listings       urls.ts        polar/
      (sqlite)     strip/ban       live OR fixture
```

**Invariant:** HTTP handlers call `core/*` only. They do not talk to Polar SDKs. Fixture and live Polar implement the same `CheckoutPort`.

---

## 3. Target tree

```
02-dtc-picks-daily/
  README.md
  SPEC.md
  BUILD.md
  CONTRIBUTING.md
  package.json
  tsconfig.json
  scripts/test.sh
  scripts/live-smoke.sh          ← PR 6; not called from test.sh or CI
  .github/workflows/ci.yml
  src/
    server.ts
    app.ts
    config.ts                    BOARD_TZ default UTC; POLAR_LIVE
    db.ts
    migrations/001_init.sql
    core/
      board.ts                   listToday, rank, placeBid, raise
      day.ts                     calendar date in BOARD_TZ
      urls.ts                    strip + bans
      clicks.ts
    http/
      pages/
        board.ts
        about.ts
        rules.ts
      checkout.ts
      webhook.ts
      redirect.ts                /r/:id increments clicks
    billing/
      polar.ts                   live
      fixture.ts                 recorded sessions
      port.ts                    CheckoutPort
    views/                       HTML shells like outbid.lol
  tests/
    rank.test.ts
    raise.test.ts
    urls.test.ts
    day.test.ts
    checkout.test.ts
    pages.test.ts
    fixtures/polar/
  docs/live-smoke.md             ← PR 6
```

No application `src/` in the docs PR that lands this file.

---

## 4. Domain rules (implementation-level)

```ts
export const MIN_BID_USD = 5;

export function rankListings(rows: Listing[]): Listing[] {
  return [...rows].sort((a, b) => {
    if (b.bidUsd !== a.bidUsd) return b.bidUsd - a.bidUsd;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}
```

- Identity key: `(day, canonicalProductUrl)`.
- Raise: `charge = newBid - currentBid`; `newBid > currentBid`; integers only.
- `BOARD_TZ` unset → `UTC`. Day key is `YYYY-MM-DD` in that zone.
- Fixture checkout completes synchronously in tests and writes the listing.
- Live Polar writes the listing only after a verified paid event.

---

## 5. Test plan (offline, required for main)

Until `package.json` exists, `scripts/test.sh` only validates contract files.

Once the app exists, **extend** (do not replace) that script with `npx tsc --noEmit` and `npx tsx --test tests/**/*.test.ts`.

| File | Asserts |
|---|---|
| `rank.test.ts` | SPEC acceptance 2–4 |
| `raise.test.ts` | SPEC acceptance 5; difference only; one row |
| `urls.test.ts` | strip utm/aff; reject chat + NSFW |
| `day.test.ts` | UTC default; yesterday gone after midnight |
| `checkout.test.ts` | fixture pay inserts; abandoned session no-op |
| `pages.test.ts` | `/` `/about` `/rules` 200 |

Live Polar is **not** in CI. `POLAR_LIVE=1` is operator-only.

---

## 6. PR plan

Each PR is independently mergeable. Dependencies are hard.

### PR 1: skeleton / CI

- **Description:** Node/TS skeleton, `/healthz`, keep contract checks, run `tsc` + tests once `package.json` exists. CI job stays named `ci`.
- **Files:** `package.json`, `tsconfig.json`, `src/server.ts`, `src/app.ts`, `src/http/health.ts`, `scripts/test.sh`, `.gitignore`
- **Dependencies:** None (this docs PR)
- **Acceptance:** `GET /healthz` 200. `bash scripts/test.sh` green. No Polar, no board yet.

### PR 2: board UI like outbid.lol

- **Description:** Server-render `/` as a public leaderboard: nav, bid −/+, product URL + why-test line, ranked rows with clicks and `$bid`. Empty day is valid. Fixture-seeded rows in tests only.
- **Files:** `src/views/*`, `src/http/pages/board.ts`, `src/core/board.ts`, `src/core/day.ts`, `src/db.ts`, `src/migrations/001_init.sql`, `tests/rank.test.ts`, `tests/pages.test.ts`
- **Dependencies:** PR 1
- **Acceptance:** Looks like outbid.lol’s board (leaderboard, claim-rank, public clicks). SPEC empty-board + rank order. No live Polar.

### PR 3: checkout

- **Description:** `CheckoutPort` fixture + Polar client. Submit bid → checkout → on complete, listing appears at the rank that bid can take. Min $5. Underbid still lists.
- **Files:** `src/billing/*`, `src/http/checkout.ts`, `src/http/webhook.ts`, `tests/checkout.test.ts`, `tests/fixtures/polar/*`
- **Dependencies:** PR 2
- **Acceptance:** SPEC rows 2–3 and 11. CI uses fixture only.

### PR 4: raise-bid

- **Description:** Same canonical URL same day raises; pay difference only; `createdAt` unchanged; re-rank.
- **Files:** `src/core/board.ts` (raise path), `src/core/urls.ts`, `tests/raise.test.ts`, `tests/urls.test.ts`
- **Dependencies:** PR 3
- **Acceptance:** SPEC rows 5–8.

### PR 5: rules / about

- **Description:** `/about` and `/rules` state no ads / no API keys / no revenue share, $5 floor, older-wins ties, raise = difference, daily UTC (or `BOARD_TZ`) reset, banned chat/NSFW, stripped tracking.
- **Files:** `src/http/pages/about.ts`, `src/http/pages/rules.ts`, `tests/pages.test.ts`
- **Dependencies:** PR 2 (can land after PR 2; stack after 4 if needed)
- **Acceptance:** SPEC row 10. Copy matches SPEC sections 6–11.

### PR 6: live-smoke

- **Description:** `scripts/live-smoke.sh` starts (or assumes) a local server. Fixture path always. Live Polar only when `POLAR_LIVE=1`. Record results in `docs/live-smoke.md`. **Not** invoked from `scripts/test.sh` or Actions.
- **Files:** `scripts/live-smoke.sh`, `docs/live-smoke.md`
- **Dependencies:** PR 3 + PR 5
- **Acceptance:** Offline `scripts/test.sh` still green with no Polar secret. Operator run walks board, underbid, raise, about/rules, click increment. Missing Polar secret → `BLOCKED-SECRET` with the exact env var. No invented listings.

**Launch path:** after PR 5 the site is usable on fixture money. PR 6 is the 100% gate.

---

## 7. Env

| Var | Default | Role |
|---|---|---|
| `BOARD_TZ` | `UTC` | Day boundary for the cover reset |
| `POLAR_LIVE` | unset | Opt in to real Polar |
| `POLAR_ACCESS_TOKEN` | unset | Live Polar; name locked for smoke |
| `POLAR_WEBHOOK_SECRET` | unset | Verify live webhooks |
| `POLAR_API_BASE` | `https://api.polar.sh` | Polar API host. Sandbox smoke sets `https://sandbox-api.polar.sh` |
| `POLAR_PRODUCT_ID` | unset | Polar product for hosted Checkout (custom amount) |
| `DATABASE_PATH` | `./data/board.sqlite` | SQLite file |

CI and `scripts/test.sh` must not set `POLAR_LIVE=1`.

---

## 8. Rollback

Any PR that makes `scripts/test.sh` red is reverted with `fix/` or `git revert` via PR. Do not force-push `main`.
