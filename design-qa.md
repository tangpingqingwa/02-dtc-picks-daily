# Design QA — dollar underline removal (2026-08-31)

## Evidence

- Source visual truth: `/var/folders/wr/2073jwr96_q68h23sfdqtvf00000gn/T/codex-clipboard-c7a079c8-3b1a-4024-ae1e-ae43d1ab390b.png`
- Single source-versus-render comparison: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/comparison-source-vs-ten-sites.png`
- DTC picks desktop render: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4202-desktop-full.png`
- DTC picks mobile render: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4202-mobile-full.png`
- Focused desktop amount crop: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4202-desktop-amount.png`
- Focused mobile amount crop: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4202-mobile-amount.png`

## Findings

- No actionable P0, P1, or P2 findings remain for this scoped correction.
- The dollar sign and numeric value render with `text-decoration-line: none`; the amount wrapper and input both have `border-bottom-style: none` and `border-bottom-width: 0px`.
- Existing typography, spacing, buttons, project skin, and Waffo payment behavior are unchanged.
- Existing keyboard focus selectors remain in place; only the persistent dashed amount decoration was removed.
- At `390 x 844`, the amount control remains inside the viewport with no horizontal overflow.
- Increase/decrease interaction passed: `$5 → $6 → $5`.
- Chrome console errors: `0`.

## Comparison History

1. Source defect — a dashed line appeared directly below the dollar amount.
2. Fix — removed the amount wrapper/input underline or dashed bottom border without changing form geometry.
3. Post-fix evidence — desktop and mobile crops show the amount cleanly, while controls stay aligned and interactive.

## Verification

- `npm test`: passed, 0 failed.
- `git diff --check`: passed.
- Chrome desktop computed-style check: passed.
- Chrome `390 x 844` responsive computed-style and containment check: passed.
- Chrome amount stepper interaction and console checks: passed.

## Follow-up Polish

- None required for this scoped correction.

final result: passed

## Maker contact footer · 2026-09-01

- Source visual truth: `/var/folders/wr/2073jwr96_q68h23sfdqtvf00000gn/T/codex-clipboard-856d0520-4293-4865-a587-ff7cf0f23936.png` (`2400 x 1664`, browser chrome included).
- Browser-rendered implementation: `/Users/yann/chat2/artifacts/design-qa/2026-09-01-maker-footer/02-desktop.jpg` (`1200 x 689`) and `/Users/yann/chat2/artifacts/design-qa/2026-09-01-maker-footer/02-mobile.jpg` (`390 x 844`). The focused desktop footer was normalized beside the source in `/Users/yann/chat2/artifacts/design-qa/2026-09-01-maker-footer/desktop-comparison.jpg`.
- State: morning issue board, empty paid-placement strip, maker-email link keyboard-focused.
- Full-view evidence: the author contact sits after the issue content at true page bottom and uses the restrained merch-desk rule treatment.
- Focused evidence: one visible marker; exact `Built by` copy and mailto; `2px` visible focus outline; desktop/mobile horizontal overflow `0px`.
- Required surfaces: compact monospace typography, spacing rhythm, rust accent, paper background, and public copy match the site's established skin; no new imagery/icons were required.
- Findings: P0 `0`, P1 `0`, P2 `0`; source badge/legal navigation is outside this contact-only scope.
- Comparison history: pass 1 found no actionable P0/P1/P2 difference; no correction loop was required.
- Regression: `99/99` tests passed; Waffo/payment behavior was untouched.

final result: passed

## Prelaunch public-copy cleanup — 2026-08-31

- Chrome routes checked: home, About, and Rules at the normal desktop viewport and `390 x 844`.
- Public copy contains no clone, development, test-fixture, internal field-name, or payment-provider implementation language.
- Claim controls share one visual centerline; amount decoration is clean and the step buttons stay inside their boxes.
- Responsive result: no horizontal document overflow on any checked route.
- Regression result: `npm test` passed `97/97`; `git diff --check` passed.
- Payment behavior remains unchanged; customer-facing wording is provider-neutral while Waffo stays internal.

## Claim-row containment correction — 2026-09-01

### Evidence

- Source visual truth: `/var/folders/wr/2073jwr96_q68h23sfdqtvf00000gn/T/codex-clipboard-8f65dc1f-4cdd-4705-b5c0-64359d15e61f.png`.
- Browser implementation: `/Users/yann/chat2/artifacts/design-qa/2026-09-01-dtc-claim-overflow/implementation-after-viewport.png`.
- Mobile implementation: `/Users/yann/chat2/artifacts/design-qa/2026-09-01-dtc-claim-overflow/implementation-after-mobile.png`.
- Normalized full comparison: `/Users/yann/chat2/artifacts/design-qa/2026-09-01-dtc-claim-overflow/comparison-full.png`.
- Focused claim-row comparison: `/Users/yann/chat2/artifacts/design-qa/2026-09-01-dtc-claim-overflow/comparison-claim-row.png`.
- Source capture: `2400 x 1644` pixels at macOS `2x`, normalized to `1200 x 822` CSS-equivalent pixels.
- Implementation capture: Chrome `1200 x 745` CSS viewport; screenshot output `1200 x 745` pixels. Full comparison uses equal `1200 x 689` page crops; the focused comparison uses equal `450 x 95` regions.
- State: empty morning desk, `period=today`, light theme, `$5` default bid.

### Comparison history

1. Earlier P1 finding — the empty-state selector enlarged the no-wrap claim row to `45.6px`. The title had `43px` of scroll overflow, with both child groups extending about `42px` beyond the card content edges.
2. Fix — constrained the empty-state display size to `clamp(1.55rem, 2.35vw, 1.75rem)` while preserving the existing typeface, `8px` gap, one-line layout, button size, colors, and interaction behavior.
3. Post-fix desktop evidence — at `1200 x 745`, computed size is `28px`; left overflow `0px`, right overflow `0px`, title scroll overflow `0px`, document overflow `0px`, and child centerline spread `0.004px`.
4. Post-fix mobile evidence — at `390 x 844`, left/right/title/document overflow are all `0px`, and child centerline spread is `0px`.
5. Narrow desktop evidence — at `768 x 844`, left/right/title/document overflow are all `0px`, and child centerline spread is `0px`.

### Required fidelity surfaces

- Fonts and typography: original serif family, weight, tracking, and single-line hierarchy retained; only the unsafe empty-state size was constrained.
- Spacing and layout rhythm: label, decrement, amount, and increment remain on one centerline with the established `8px` group gap and remain inside the card padding.
- Colors and tokens: unchanged.
- Image quality and assets: no image assets are present in the corrected region.
- Copy and content: unchanged.

### Verification

- `npm test`: passed `97/97`.
- `git diff --check`: passed.
- No remaining P0, P1, or P2 finding in the corrected claim row.

final result: passed
