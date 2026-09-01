# DTC Picks Daily — Product Development Spec

**Version:** 1.0
**Status:** Ready to build
**Repo:** https://github.com/tangpingqingwa/02-dtc-picks-daily
**Market:** global English-speaking DTC / Shopify / Amazon sellers
**Currency:** USD only
**Language:** English

This is a pay-to-rank public board cloned from [outbid.lol](https://outbid.lol). Rank is the bid. Nothing else.

---

## 1. Product statement

Every morning, sellers scan a short “what to test today” brief: Shopify apps, Amazon products, supplier SKUs, fulfillment tools. The **cover slot** is the first link they see.

Suppliers and tools bid whole US dollars so their product URL sits at the top of today’s brief. Paying less than #1 still lists at whatever rank that bid can take. The cover resets daily.

One-line pitch: **Bid USD. Own this morning’s cover. Sellers see your link first.**

---

## 2. Goals and non-goals

### Goals

- Public leaderboard. Anyone can read the board without an account.
- No ads, no API keys, no revenue share with listed products.
- Whole-dollar USD bids. Minimum **$5**. Increments of **$1**.
- Rank = current bid, descending. Equal bids: the **older** listing keeps the higher rank.
- A bid below today’s #1 still appears at the rank that amount can take.
- Same canonical product URL can raise. Raiser pays only the **difference**.
- Strip tracking and affiliate query strings before identity or outbound click.
- Reject chat / invite links and NSFW.
- Each listing is a product URL plus one line: **why test this today**.
- Daily reset of the cover (timezone documented; default **UTC**).
- Public click counts on every listing.
- Waffo Pancake Checkout for live money. Fixture checkout for tests and CI.
- Three pages only in v1: board, about, rules.
- Global sellers. English copy. USD.

### Non-goals

- Accounts, API keys, or a developer platform.
- Ads, sponsorship packages, or revenue share with listed products.
- Invented ratings, review stars, “trending” scores, or fake social proof.
- Multi-currency, localized languages, or geo-priced bids.
- Chat, comments, DMs, or community features.
- Holding or recommending inventory. This is a ranking board, not a store.
- Editorial picks that override money. Rank is the bid.

---

## 3. Users

| Persona | Need |
|---|---|
| Supplier / tool vendor | Put a product URL on this morning’s cover so sellers click it first |
| DTC / Shopify / Amazon seller | See today’s ranked “test this” list; click through; trust that #1 paid the most |
| Spectator | Watch the auction. No login. |

There is no logged-in “member.” Payment is the only write path.

---

## 4. Product surfaces

| Path | Job |
|---|---|
| `/` | Public leaderboard for **today’s** cover auction. Bid form. Click-throughs. |
| `/about` | What this is: no ads, no API keys, no revenue share. Daily cover. UTC. |
| `/rules` | Ranking, raise, URL stripping, banned links, reset, Waffo settlement. |

No other marketing pages in v1. No dashboard. No `/api` for third parties.

---

## 5. Listing

A listing is created only after Waffo (or the fixture checkout) reports a completed payment.

```ts
type Listing = {
  id: string;
  day: string;              // YYYY-MM-DD in BOARD_TZ (default UTC)
  productUrl: string;       // canonical https URL, query string stripped
  whyTestThisToday: string; // one line, 8–140 chars, English
  bidUsd: number;           // integer >= 5
  paidUsd: number;          // sum of completed payments for this listing on this day
  clicks: number;           // public, increment on outbound click
  createdAt: string;        // ISO-8601; used for equal-bid tie-break
  updatedAt: string;        // last successful raise
};
```

Required fields on submit:

1. **Product URL** — `https` only. Host must be a product, store, app, or supplier page (Shopify, Amazon, brand site, tool site).
2. **Why test this today** — one line. What a seller should try this morning. Not a slogan dump.
3. **Bid** — whole USD, minimum $5.

No title field. Display host + path from the canonical URL. Do not invent product names, prices, ratings, or review counts.

---

## 6. Ranking (normative)

Copied from outbid.lol, with a **$5** floor instead of $2.

1. Rank is the bid. Nothing else (no recency boost, no editorial score, no click-through rate).
2. Bids are whole US dollars. Minimum **$5**. Step **$1**.
3. Sort today’s listings by `bidUsd` descending. On a tie, the **older** `createdAt` keeps the higher rank.
4. Paying less than the current #1 still lists at whatever rank that bid can take.
5. A completed payment is what claims the rank. An unpaid Waffo session does not appear.
6. After a successful raise, re-sort. The listing keeps its original `createdAt`.

Example, same day:

| Order paid | Bid | Rank |
|---|---|---|
| A $20 | 20 | #1 |
| B $12 | 12 | #2 |
| C $12 | 12 | #3 (newer than B) |
| D $5 | 5 | #4 |

D is on the board even though D did not take #1.

---

## 7. Raise

The same **canonical product URL** on the **same day** raises the existing listing. It does not create a second row.

- New bid must be a whole dollar **strictly greater** than this listing’s current `bidUsd`.
- Raiser pays only `newBid - currentBid`.
- To take #1, `newBid` must be at least **$1 above** the current top bid (unless this listing is already #1 and is only increasing its own number).
- Another bidder cannot steal this listing’s rank by paying only this listing’s difference. They must submit **their** URL at a bid that outranks, paying that full bid (or their own difference if they already have a row).
- `createdAt` does not change on raise. `paidUsd` increases by the difference.

---

## 8. URL identity and bans

Before compare, store, or outbound redirect:

1. Require `https:`. Reject `http:`, `javascript:`, `data:`.
2. Resolve one redirect hop for known shorteners **or** reject shortener hosts. Never keep `bit.ly` / `t.co` / `tinyurl.com` as the stored URL.
3. Drop the fragment.
4. Strip tracking and affiliate query keys, including: `utm_*`, `ref`, `ref_`, `affiliate`, `aff`, `tag`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `si`, `pp`, `ascsubtag`, and Amazon `tag` / `linkCode` / `psc`. If the only remaining identity is those keys, reject.
5. Lowercase host. Strip default ports. Strip a trailing slash on the path except `/`.
6. Amazon / Shopify / App Store style paths are keyed by path, not by leftover query. Different ASINs or product handles are different listings.

**Reject (do not charge):**

- Chat and invite links: Telegram, WhatsApp, Discord, Messenger, Signal, Line, and similar.
- NSFW / porn / adult-platform URLs and blurbs that are sexual content.
- Empty or >140 character “why test this today.”
- Non-https, credentials-in-URL, or localhost / link-local hosts.

Clicks go to the **stripped** URL. Affiliate and tracking query strings must not survive.

---

## 9. Daily cadence

The auction is **today’s cover**, not a forever directory.

| Rule | Value |
|---|---|
| Timezone | `BOARD_TZ` IANA name. **Default `UTC`.** Documented on `/about` and `/rules`. |
| Day key | Calendar date in `BOARD_TZ` (`YYYY-MM-DD`). |
| Reset | At `00:00` in `BOARD_TZ`, a new empty board starts. Yesterday’s listings leave the cover. |
| Cover | Rank #1 **right now** for today’s `day` is the cover slot of this morning’s brief. Occupied cover #1 and last-24h #1 stay two prizes. No hold on the cover. |
| Last 24h | A strip on `/` ranks paid rows whose `createdAt` falls in the **rolling last 24 hours**. Not civil midnight. Empty strip is valid. Not a second cover. Cover #1 is this morning’s slot. Strip ranks are last-24h facts, not today’s cover #1. |
| History | Keep paid rows for audit. The public cover shows **today’s** `day` only. The last-24h strip can still show last night’s paid rows. |

Do not carry bids across the reset. Raising yesterday’s URL today is a **new** listing on the new day and pays a full bid ≥ $5.

A newcomer can appear on the last-24h strip without beating today’s cover #1. The window is fair across timezones because it rolls; it does not reset at `00:00` UTC.

---

## 10. Clicks

Every listing shows a public integer click count.

- Increment once per outbound navigation through the board (redirect hop we control).
- Do not invent clicks. Start at 0.
- Do not hide low counts.
- Clicking does not change rank.

---

## 11. Checkout (Waffo Pancake)

Money in v1 is **Waffo Pancake Checkout** (merchant of record). The official
`@waffo/pancake-ts@0.19.1` SDK is the only live provider path; legacy Polar
variables and adapters are inert compatibility debris.

| Mode | When | Behavior |
|---|---|---|
| Fixture | explicit `PAYMENT_MODE=fixture` in tests and CI | Completing a fixture session inserts/raises the listing. No network. |
| Waffo test | explicit `PAYMENT_MODE=waffo-test` plus test credentials | Waffo test Checkout. Listing appears only after a signed `order.completed` webhook. |
| Waffo production | explicit `PAYMENT_MODE=waffo-prod` plus production credentials | Production Checkout. Requires the official HTTPS API origin, durable DB, public HTTPS webhook URL, and signed `order.completed` settlement. |

Missing Waffo live configuration during operator smoke is reported as the exact
`BLOCKED-SECRET: WAFFO_*` or `BLOCKED-CONFIG: ...` variable. That is not a
fixture success. A production-like process never infers fixture mode.

The app persists an immutable checkout intent (URL, day, target bid, exact
charge, expected Waffo product/store/USD binding, and fingerprints) before
provider I/O. A timeout, 5xx, malformed response, or lost response remains
recoverable and cannot rank. Live ranking accepts only a raw-body-verified
`order.completed` event whose event/payment identity, metadata, decimal
subtotal/tax/total, and intent all match; the provider timestamp supplies the
initial tie time. `/webhooks/waffo` is the only live settlement path, and the
browser return URL never settles a listing.

No ads. No API-key product. No revenue share cut to the listed URL.

Failed or abandoned checkout: 0 listing change, 0 rank change.

---

## 12. Pages (copy contract)

### Board (`/`)

Looks and works like outbid.lol’s leaderboard, adapted to this brief:

- Site name + nav: Leaderboard, About, Rules.
- Bid control: whole dollars, − / +, minimum $5, claim-this-rank affordance.
- Fields: product URL, one-line “why test this today.”
- Ranked rows: `#N`, host, blurb, relative time, **N clicks**, **$bid**.
- Paying less than #1 still explains it will land at the rank that bid can take.

### About (`/about`)

- No ads, no API keys, no revenue sharing.
- Daily public auction for the cover of a DTC / Shopify / Amazon picks brief.
- Global sellers, English, USD.
- Reset timezone (default UTC).
- Rank is the bid.

### Rules (`/rules`)

Must state every rule in sections 6–11 in operator language. No extra ranking factors.

---

## 13. Honesty

- Do not invent product titles, prices, star ratings, review counts, or “units sold.”
- Do not invent click counts or visitor stats.
- Do not show a listing that has not paid.
- Empty board is a valid morning. Show the empty state; do not seed fake SKUs.
- Empty cover stays empty. Do not invent a #1 on the cover slot or the last-24h strip.
- Occupied last-24h strip ranks are last-24h facts. They are not today’s cover #1.
- Occupied cover #1 and last-24h #1 stay two prizes. Cover is the morning slot; strip #1 is only who spent in the rolling window. Empty strip stays empty. No hold on the cover.

---

## 14. Acceptance (v1)

| # | Behavior | Pass |
|---|---|---|
| 1 | Empty day | `/` renders with no listings and a bid form. |
| 2 | First $5 | Fixture pay $5 → listing is #1, clicks 0. |
| 3 | Underbid | #1 is $20; fixture pay $8 → new row exists, not #1. |
| 4 | Tie | Two $10 bids → older is above newer. |
| 5 | Raise | Same URL $10 → $15 pays $5 more; one row; bid $15. |
| 6 | Strip | `https://store.example/p?utm_source=x&aff=1` stores and clicks without those keys. |
| 7 | Chat ban | `https://t.me/joinchat/…` rejected; no charge. |
| 8 | NSFW | Adult URL or sexual blurb rejected; no charge. |
| 9 | Reset | After `00:00` `BOARD_TZ`, `/` does not show yesterday’s cover. |
| 10 | Pages | `/`, `/about`, `/rules` all 200. |
| 11 | Waffo fixture | CI / `scripts/test.sh` never call Waffo or any live provider. |
| 12 | Waffo live | Explicit `waffo-test`/`waffo-prod` smoke can complete or record `BLOCKED-SECRET`/`BLOCKED-CONFIG`; fixture smoke remains offline. |

---

## 15. Git collaboration (normative)

Development is GitHub trunk-based. **`main` is always cloneable, buildable, and testable.**

| Rule | Requirement |
|---|---|
| Integration branch | `main` only. No long-lived `develop`. |
| How code lands | Pull request into `main`. No direct push. |
| Required check | GitHub Actions workflow `ci` (job id `ci`) must be green. |
| Local / CI test | `bash scripts/test.sh` — offline, no production secrets. |
| Branch names | `feat/` `fix/` `docs/` `chore/` `test/` + short slug. |
| Merge | Squash. Delete the head branch. |
| Broken `main` | Treat as an incident. Fix on `fix/…` via PR. |

Full process: [CONTRIBUTING.md](./CONTRIBUTING.md).

Implementation plan (stack, modules, PR DAG): [BUILD.md](./BUILD.md).

Until there is an application binary, `scripts/test.sh` still has to pass: contract files exist, SPEC/CONTRIBUTING agree, no tracked secrets. Adding a server means **extending** that script with unit/contract tests. Live Waffo is optional and must not be required for `main` to stay green.
