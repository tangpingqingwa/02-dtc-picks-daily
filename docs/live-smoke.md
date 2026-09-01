# Waffo live smoke — DTC Picks Daily

Operator-only, fixture-only. `bash scripts/live-smoke.sh` is **not** called from
`scripts/test.sh` or GitHub Actions. CI always uses explicit
`PAYMENT_MODE=fixture`, stays offline, and never enables a Waffo live mode.

The smoke script always starts its own local fixture process and walks the
accepted board journey: empty board, bid increment, first paid row, underbid,
same-URL difference raise, `/about`, `/rules`, and the click redirect. It does
not call Waffo, create a checkout, charge a card, or invent a paid row. A
missing live configuration is reported as `BLOCKED-SECRET` or
`BLOCKED-CONFIG`, never treated as a successful fixture payment.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` / `GITHUB_ACTIONS=true` (override only with
   `LIVE_SMOKE_ALLOW_CI=1` for a local dry-run, never in Actions).
2. Always starts and owns a loopback `node --import tsx src/server.ts` fixture
   process with `PAYMENT_MODE=fixture` and a disposable SQLite database. Any
   non-empty `LIVE_SMOKE_BASE` is deliberately unsupported: the script prints
   `BLOCKED-CONFIG` and exits `2` before dependency installation, fixture
   setup, or making an HTTP request. It never attaches to an existing server.
3. Verifies the local HTTP journey, including a `30x` click redirect to the
   canonical URL and click count `0→1`.
4. Checks the Waffo boundary without making a provider call. With an explicit
   `PAYMENT_MODE=waffo-test` or `waffo-prod`, missing credentials are named;
   fixture mode records `BLOCKED-SECRET: WAFFO_MERCHANT_ID` because Waffo was
   intentionally not invoked.
5. Removes only its temporary process/database on exit.

Overrides: `LIVE_SMOKE_PORT` for the script-owned loopback fixture and
`BOARD_TZ` (default `UTC`). `LIVE_SMOKE_BASE` is not an override and must remain
unset; a non-empty value is rejected with `BLOCKED-CONFIG` and exit `2` before
any side effects. Waffo API configuration belongs only to the separately
authorized operator path below; this fixture-only script never sends a Waffo
request.

## Authorized Waffo operator smoke

After a stable public HTTPS deployment and explicit approval for an external
provider call, use a separate operator run with `PAYMENT_MODE=waffo-test` and
the Waffo test merchant/store/product/private key plus the matching test
webhook public key. Production requires `PAYMENT_MODE=waffo-prod`, the
official Waffo API origin, a durable `DATABASE_PATH`, and a registered HTTPS
`/webhooks/waffo` endpoint. The browser return URL is informational; only a
raw-body-verified `order.completed` event can settle a live listing.

No checkout, charge, refund, payout, key, product, or webhook registration is
authorized by this repository smoke. Provider calls and dashboard changes are
outside this offline gate.

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented boundary/error; nothing invented. |
| `BLOCKED-SECRET` | A required Waffo secret is absent; the exact variable is named. |
| `BLOCKED-CONFIG` | Explicit mode or safe Waffo/public URL/database configuration is absent or invalid. |
| `FAIL` | Broken product, unexpected network, or invented listing/count. |

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not infer fixture mode from missing variables or `CI`.
- Does not call Waffo or any other provider in the fixture smoke.
- Does not seed fake SKUs or click counts on an empty morning.
- Does not treat a missing Waffo secret/configuration as a paid listing.
