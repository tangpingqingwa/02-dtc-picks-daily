export const BOARD_CSS = /* css */ `
:root {
  --background: #f4efe4;
  --foreground: #1c1914;
  --card: #fbf7ee;
  --primary: #9a3412;
  --primary-foreground: #fff8ef;
  --muted: #ebe3d4;
  --muted-foreground: #6b6256;
  --border: #d8cbb6;
  --input: #d8cbb6;
  --ring: #9a3412;
  --rule: #1c1914;
  --radius: 0.25rem;
  --font: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --serif: "Newsreader", "Iowan Old Style", "Palatino Linotype", Palatino, serif;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { height: 100%; }
body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  font-family: var(--font);
  background:
    radial-gradient(900px 280px at 50% -120px, color-mix(in oklab, var(--primary) 10%, transparent), transparent),
    var(--background);
  color: var(--foreground);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.5; }
.site-header {
  width: 100%;
}
.site-header-inner,
.page {
  width: 100%;
  max-width: 56rem;
  margin: 0 auto;
  padding-left: 1rem;
  padding-right: 1rem;
}
.site-header-inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.85rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-family: var(--serif);
  font-size: 1.2rem;
  font-weight: 650;
  letter-spacing: -0.03em;
}
.brand-mark {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 1px;
  background: var(--primary);
  box-shadow: 0.22rem 0.22rem 0 0 color-mix(in oklab, var(--primary) 45%, transparent);
}
.brand-dot { color: var(--primary); }
.rail-folio {
  margin: 0;
  text-align: center;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.rail-kicker {
  display: block;
  font-weight: 700;
  color: var(--primary);
}
.rail-folio time {
  display: block;
  margin-top: 0.15rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
}
@media (max-width: 640px) {
  .site-header-inner {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "brand nav"
      "folio folio";
  }
  .brand { grid-area: brand; }
  .rail-folio { grid-area: folio; text-align: left; }
  .nav-wrap { grid-area: nav; }
}
.nav-wrap { display: flex; align-items: center; justify-content: flex-end; gap: 1rem; }
nav[aria-label="Main"] ul {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.875rem;
}
nav[aria-label="Main"] a {
  font-weight: 500;
  color: var(--muted-foreground);
}
nav[aria-label="Main"] a[aria-current="page"],
nav[aria-label="Main"] a:hover {
  color: var(--foreground);
}
.theme-toggle {
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--foreground);
}
.theme-toggle:hover { background: var(--muted); }
.page {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-top: 1rem;
  padding-bottom: 4rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.masthead {
  margin: 0 0 1.75rem;
  padding: 1.35rem 0 1.15rem;
  border-bottom: 3px double var(--rule);
  text-align: center;
}
.masthead-kicker {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--primary);
}
.masthead-title {
  margin: 0;
  font-family: var(--serif);
  font-size: clamp(2.1rem, 6vw, 3.4rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 0.95;
}
.masthead-issue {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.45rem 0.7rem;
  margin: 0.85rem 0 0;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.issue-label {
  font-weight: 700;
  color: var(--primary);
}
.masthead-issue time {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.issue-rule {
  width: 2.5rem;
  height: 1px;
  background: var(--border);
}
.issue-tz { color: var(--muted-foreground); }
.masthead-dek {
  margin: 0.55rem 0 0;
  color: var(--muted-foreground);
  font-size: 0.95rem;
}
.masthead-list {
  margin: 0.85rem 0 0;
  font-size: 0.9rem;
  color: var(--muted-foreground);
  text-wrap: pretty;
}
.list-under-cover {
  font-weight: 700;
  color: var(--primary);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 4px;
  text-decoration-thickness: 1px;
}
.list-under-cover:hover {
  color: var(--foreground);
}
#leaderboard { scroll-margin-top: 1.5rem; margin-top: 0; }
/* Empty morning: Claim #1 is the only first click. Occupied cover hops stay off. */
.desk:has(.empty) .cover-hop,
.desk:has(.empty) .cover-hop-wrap,
.desk:has(.empty) .cover-later,
.desk:has(.empty) .cover-why,
.desk:has(.empty) .list-under-cover,
.desk:has(.empty) .list-after-why,
.desk:has(.empty) .list-after-take,
.desk:has(.empty) .list-after-cover,
.desk:has(.empty) .row-cover,
.desk:has(.empty) .later-stack,
.desk:has(.empty) .later-listing,
.desk:has(.empty) .why-first,
.desk:has(.empty) [data-list-land],
.desk:has(.empty) .later-rail,
.desk:has(.empty) [data-paid-name],
.desk:has(.empty) .claim-kicker,
.desk:has(.empty) .claim-after-cover,
.desk:has(.empty) .claim-after-row {
  display: none;
}
.desk:has(.empty) #claim .claim-title {
  font-size: clamp(2.1rem, 5vw, 2.85rem);
}
.last24h {
  margin-top: 1.75rem;
  padding-top: 1.15rem;
  border-top: 1px dashed var(--border);
}
.last24h-kicker {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.last24h-dek {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: var(--muted-foreground);
  text-wrap: pretty;
}
.last24h-empty {
  margin: 0.75rem 0 0;
  padding: 0.85rem 0.9rem;
  font-size: 0.875rem;
  color: var(--muted-foreground);
  border: 1px dashed var(--border);
}
.last24h-list {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
}
.last24h-row + .last24h-row { border-top: 1px solid var(--border); }
.last24h-link {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
  padding: 0.45rem 0;
}
.last24h-rank {
  flex-shrink: 0;
  min-width: 2.75rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.last24h-body {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.last24h-host {
  font-family: var(--serif);
  font-size: 0.95rem;
  font-weight: 650;
}
.last24h-why {
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.last24h-meta {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: flex-end;
  gap: 0.45rem 0.65rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
.last24h-bid {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 3px;
}
.last24h-slot {
  margin: 0 0 0.15rem;
  font-family: var(--font);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.last24h-row[data-last24h-prize] .last24h-host {
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.3;
}
.last24h-row[data-last24h-prize] .last24h-rank {
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.desk[data-two-prizes] .row-cover[data-morning-slot] .host[data-cover-name] {
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.desk[data-two-prizes] .last24h-row[data-last24h-prize] .last24h-host {
  font-size: 0.88rem;
  font-weight: 500;
}
.desk[data-two-prizes] .last24h-row[data-last24h-prize] .last24h-rank {
  font-size: 0.62rem;
}
.desk[data-two-prizes] .row-cover[data-morning-slot][data-paid-name] .host[data-cover-name] {
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
#claim {
  scroll-margin-top: 1.5rem;
  margin-top: 2.25rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}
/* Occupied morning: Take is the only first click. Claim #1 is a later write after the cover. */
.desk[data-occupied="true"] .claim-after-cover[data-claim-after-cover] {
  margin-top: 1.6rem;
}
.desk[data-occupied="true"] .claim-after-cover[data-claim-after-cover] #claim {
  margin-top: 0;
  padding-top: 1.1rem;
  border-top: 1px dashed var(--border);
}
.desk[data-occupied="true"] .claim-after-cover[data-claim-after-cover] #claim .claim-title {
  font-size: 1.15rem;
  font-weight: 500;
  letter-spacing: 0;
}
@media (min-width: 768px) {
  .desk[data-occupied="true"] .claim-after-cover[data-claim-after-cover] #claim .claim-title {
    font-size: 1.25rem;
  }
}
.desk[data-occupied="true"] .claim-after-cover[data-claim-after-cover] #claim .outbid {
  height: 2.2rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.desk[data-occupied="true"] .claim-after-cover[data-claim-after-cover] #claim .bid-field {
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}
/* Empty morning: Product URL is a later write after Claim #1 / Outbid. */
#claim.empty-claim-first[data-empty-claim-first] {
  display: flex;
  flex-direction: column;
  align-items: center;
}
#claim.empty-claim-first[data-empty-claim-first] .bid-form {
  width: 100%;
  align-items: center;
}
#claim.empty-claim-first[data-empty-claim-first] .outbid {
  width: auto;
  min-width: 9rem;
  margin: 0 auto;
}
#claim.empty-claim-first[data-empty-claim-first] .listing-identity[data-later-write] {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
  max-width: 28rem;
  margin: 0.85rem auto 0;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--border);
}
#claim.empty-claim-first[data-empty-claim-first] .later-write-label {
  margin: 0;
  text-align: center;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
#claim.empty-claim-first[data-empty-claim-first] .listing-identity[data-later-write] .field-label {
  font-weight: 600;
  letter-spacing: 0.08em;
}
#claim.empty-claim-first[data-empty-claim-first] .listing-identity[data-later-write] .field input {
  height: 2.2rem;
  font-size: 0.88rem;
  color: var(--muted-foreground);
}
/* Empty morning: Why test this today is a later write after the product URL. */
#claim.empty-claim-first[data-empty-claim-first] .why-later[data-why-later] {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  max-width: 22rem;
  margin: 0.55rem auto 0;
  padding-top: 0.55rem;
  border-top: 1px dotted var(--border);
}
#claim.empty-claim-first[data-empty-claim-first] .why-later-label {
  margin: 0;
  text-align: center;
  font-size: 0.58rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
#claim.empty-claim-first[data-empty-claim-first] .why-later[data-why-later] .field-label {
  font-size: 0.58rem;
  font-weight: 500;
  letter-spacing: 0.1em;
}
#claim.empty-claim-first[data-empty-claim-first] .why-later[data-why-later] .field input {
  height: 1.85rem;
  font-size: 0.78rem;
  color: var(--muted-foreground);
}
.claim-kicker {
  margin: 0 0 0.45rem;
  text-align: center;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.claim-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem 0.5rem;
  margin: 0;
  text-align: center;
  font-family: var(--serif);
  font-size: 1.75rem;
  font-weight: 650;
  letter-spacing: -0.03em;
  text-wrap: pretty;
}
@media (min-width: 768px) {
  .claim-title { font-size: 2.5rem; }
}
.bid-stepper { display: inline-flex; align-items: center; gap: 0.5rem; }
.step {
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid color-mix(in oklab, var(--primary) 35%, transparent);
  border-radius: 2px;
  background: color-mix(in oklab, var(--primary) 10%, transparent);
  color: var(--primary);
  font-weight: 700;
  font-size: 0.875rem;
  line-height: 1;
}
.step:hover {
  background: color-mix(in oklab, var(--primary) 25%, transparent);
}
.bid-field {
  position: relative;
  display: inline-block;
  color: var(--primary);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 6px;
  text-decoration-thickness: 2px;
}
.bid-sizer {
  visibility: hidden;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.bid-input-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: baseline;
}
.bid-input-wrap input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 0;
  outline: none;
  font: inherit;
  letter-spacing: inherit;
  font-variant-numeric: tabular-nums;
}
.claim-note {
  margin: 0.5rem auto 0;
  max-width: 28rem;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.625;
  color: var(--muted-foreground);
  text-wrap: pretty;
}
.claim-note .accent { color: color-mix(in oklab, var(--primary) 70%, transparent); }
/* Unpaid Polar checkout stays off the merch desk until Polar reports paid. */
.desk[data-unpaid-off] .row-cover,
.desk[data-unpaid-off] .later-stack,
.desk[data-unpaid-off] .cover-hop,
.desk[data-unpaid-off] .cover-hop-wrap,
.desk[data-unpaid-off] .cover-later,
.desk[data-unpaid-off] .cover-why,
.desk[data-unpaid-off] .list-under-cover,
.desk[data-unpaid-off] .list-after-why,
.desk[data-unpaid-off] .list-after-take,
.desk[data-unpaid-off] .list-after-cover,
.desk[data-unpaid-off] .later-listing,
.desk[data-unpaid-off] .why-first,
.desk[data-unpaid-off] [data-list-land],
.desk[data-unpaid-off] .later-rail,
.desk[data-unpaid-off] .claim-kicker,
.desk[data-unpaid-off] .claim-after-cover,
.desk[data-unpaid-off] .claim-after-row {
  display: none;
}
.claim-note[data-unpaid-off] {
  max-width: 32rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--foreground);
}
.claim-note[data-unpaid-off] .unpaid-off-line {
  display: block;
  margin: 0 0 0.45rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--foreground);
}
#claim.empty-claim-first[data-empty-claim-first] .claim-note[data-unpaid-off] {
  max-width: 26rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--muted-foreground);
}
#claim.empty-claim-first[data-empty-claim-first] .claim-note[data-unpaid-off] .unpaid-off-line {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--muted-foreground);
}
.bid-form {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.bid-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
@media (min-width: 768px) {
  .bid-row { flex-direction: row; align-items: center; }
}
.field {
  position: relative;
  min-width: 0;
  flex: 1;
}
.field-label {
  display: block;
  margin: 0 0 0.3rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.field input,
.field textarea {
  width: 100%;
  min-width: 0;
  height: 2.75rem;
  border: 1px solid var(--input);
  border-radius: 2px;
  background: var(--card);
  padding: 0.25rem 0.75rem;
  outline: none;
}
.field textarea {
  height: auto;
  min-height: 2.75rem;
  resize: vertical;
  padding-top: 0.7rem;
}
.field input:focus,
.field textarea:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
}
.field input::placeholder,
.field textarea::placeholder { color: var(--muted-foreground); }
.why-field input { padding-left: 0.75rem; }
.outbid {
  height: 2.75rem;
  width: 100%;
  flex-shrink: 0;
  align-self: flex-end;
  border: 0;
  border-radius: 2px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 700;
  font-size: 0.875rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0 1.25rem;
}
@media (min-width: 768px) {
  .outbid { width: auto; }
}
.outbid:hover { background: color-mix(in oklab, var(--primary) 80%, black); }
.form-hint {
  margin: 0;
  text-align: center;
  font-size: 0.75rem;
  line-height: 1.625;
  color: var(--muted-foreground);
  text-wrap: pretty;
}
.empty {
  margin-top: 0.25rem;
  padding: 2.4rem 1.25rem;
  text-align: center;
  color: var(--muted-foreground);
  border: 1px dashed var(--border);
  background: color-mix(in oklab, var(--card) 70%, transparent);
}
.empty-kicker {
  margin: 0 0 0.45rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--primary);
}
.empty strong { color: var(--foreground); }
.row {
  position: relative;
  padding: 0 0.75rem;
}
@media (min-width: 768px) {
  .row { padding: 0 1rem; }
}
.row + .row { border-top: 1px solid var(--border); }
.row-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}
a.row-link { text-decoration: none; }
@media (min-width: 768px) {
  .row-link { gap: 0.75rem; padding: 0.75rem 0; }
}
a.row-link:hover { color: var(--primary); }
.row-meta {
  display: flex;
  width: 2.5rem;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
}
.row-kicker {
  margin: 0 0 0.2rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--primary);
}
.cover-hop-wrap {
  margin: 0.15rem 0 0.7rem;
}
.cover-hop {
  display: inline-flex;
  align-items: center;
  height: 2.25rem;
  padding: 0 0.95rem;
  border: 0;
  border-radius: 2px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
}
.cover-hop-first {
  min-height: 2.75rem;
  height: auto;
  padding: 0.55rem 1.15rem;
  font-size: 0.95rem;
  letter-spacing: 0.1em;
  box-shadow: 0.22rem 0.22rem 0 0 color-mix(in oklab, var(--primary) 45%, transparent);
}
.take-after-list-first {
  min-height: 3.15rem;
  padding: 0.7rem 1.4rem;
  font-size: 1.05rem;
  letter-spacing: 0.12em;
  box-shadow: 0.28rem 0.28rem 0 0 color-mix(in oklab, var(--primary) 45%, transparent);
}
.take-after-list-two {
  min-height: 3.55rem;
  padding: 0.85rem 1.65rem;
  font-size: 1.15rem;
  letter-spacing: 0.14em;
  box-shadow: 0.34rem 0.34rem 0 0 color-mix(in oklab, var(--primary) 45%, transparent);
}
.take-after-list-three {
  min-height: 3.95rem;
  padding: 1rem 1.9rem;
  font-size: 1.25rem;
  letter-spacing: 0.16em;
  box-shadow: 0.4rem 0.4rem 0 0 color-mix(in oklab, var(--primary) 45%, transparent);
}
.take-after-list-four {
  min-height: 4.35rem;
  padding: 1.15rem 2.15rem;
  font-size: 1.35rem;
  letter-spacing: 0.18em;
  box-shadow: 0.46rem 0.46rem 0 0 color-mix(in oklab, var(--primary) 45%, transparent);
}
.take-after-list-five {
  min-height: 4.75rem;
  padding: 1.3rem 2.4rem;
  font-size: 1.45rem;
  letter-spacing: 0.2em;
  box-shadow: 0.52rem 0.52rem 0 0 color-mix(in oklab, var(--primary) 45%, transparent);
}
.take-after-list-six {
  min-height: 5.15rem;
  padding: 1.45rem 2.65rem;
  font-size: 1.55rem;
  letter-spacing: 0.22em;
  box-shadow: 0.58rem 0.58rem 0 0 color-mix(in oklab, var(--primary) 45%, transparent);
}
.cover-hop:hover {
  background: color-mix(in oklab, var(--primary) 80%, black);
  color: var(--primary-foreground);
}
.cover-why {
  margin: 0.15rem 0 0.35rem;
}
.cover-why-label {
  margin: 0 0 0.25rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.cover-why-line {
  margin: 0;
  font-family: var(--serif);
  font-size: 1.2rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.3;
  color: var(--foreground);
  text-wrap: pretty;
}
.cover-why-line[data-prize-before-price] {
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.list-after-why-wrap {
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
  font-family: var(--font);
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.45;
  text-transform: none;
  color: var(--muted-foreground);
  text-wrap: pretty;
}
.list-after-why {
  font-weight: 700;
  color: var(--primary);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 4px;
  text-decoration-thickness: 1px;
}
.list-after-why:hover {
  color: var(--foreground);
}
.cover-why + .cover-hop-wrap {
  margin-top: 0;
}
.list-after-take-wrap {
  margin: 0.35rem 0 0.7rem;
  font-size: 0.9rem;
  font-family: var(--font);
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.45;
  text-transform: none;
  color: var(--muted-foreground);
  text-wrap: pretty;
}
.list-after-take {
  font-weight: 700;
  color: var(--primary);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 4px;
  text-decoration-thickness: 1px;
}
.list-after-take-first {
  display: inline-flex;
  align-items: center;
  min-height: 2.25rem;
  height: auto;
  padding: 0 0.95rem;
  border: 1px solid var(--rule);
  border-radius: 2px;
  background: transparent;
  color: var(--foreground);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  vertical-align: middle;
}
.list-after-take-two {
  min-height: 2.75rem;
  padding: 0 1.15rem;
  font-size: 0.95rem;
  letter-spacing: 0.1em;
}
.list-after-take-three {
  min-height: 3.25rem;
  padding: 0 1.4rem;
  font-size: 1.05rem;
  letter-spacing: 0.12em;
}
.list-after-take-four {
  min-height: 3.75rem;
  padding: 0 1.65rem;
  font-size: 1.15rem;
  letter-spacing: 0.14em;
}
.list-after-take-five {
  min-height: 4.25rem;
  padding: 0 1.9rem;
  font-size: 1.25rem;
  letter-spacing: 0.16em;
}
.list-after-take-six {
  min-height: 4.65rem;
  padding: 0 2.15rem;
  font-size: 1.35rem;
  letter-spacing: 0.18em;
}
.list-after-take:hover {
  color: var(--foreground);
}
.list-after-take-first:hover {
  background: var(--foreground);
  color: var(--background);
}
.cover-hop-wrap + .list-after-take-wrap {
  margin-top: 0.35rem;
}
/* Occupied cover: Take is the one first click. One later List write after Take recedes after that hop. */
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] {
  margin: 0.25rem 0 0;
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--muted-foreground);
}
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] .list-after-take,
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] .list-after-take-first,
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] .list-after-take-two,
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] .list-after-take-three,
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] .list-after-take-four,
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] .list-after-take-five,
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] .list-after-take-six {
  display: inline;
  min-height: 0;
  height: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: none;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  color: var(--muted-foreground);
  vertical-align: baseline;
}
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] .list-after-take:hover,
.desk[data-occupied="true"] .list-after-cover[data-list-after-cover] .list-after-take-first:hover {
  background: none;
  color: var(--foreground);
}
@media (min-width: 768px) {
  .row-meta {
    width: auto;
    flex-direction: row;
    gap: 0.75rem;
  }
}
.rank {
  display: inline-flex;
  min-width: 1.75rem;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted-foreground);
}
@media (min-width: 768px) {
  .rank { min-width: 2.5rem; font-size: 1rem; }
}
.row-body { min-width: 0; flex: 1; }
.row-top {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.host {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--serif);
  font-size: 1rem;
  font-weight: 650;
}
.bid {
  flex-shrink: 0;
  font-size: 0.875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--primary);
}
@media (min-width: 768px) {
  .host, .bid { font-size: 1rem; }
}
.blurb {
  margin: 0.15rem 0 0;
  min-width: 0;
  font-size: 0.875rem;
  color: color-mix(in oklab, var(--muted-foreground) 85%, var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (min-width: 768px) {
  .blurb {
    font-size: 0.875rem;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}
.row-foot {
  margin-top: 0.125rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 0.375rem;
  font-size: 0.6875rem;
}
@media (min-width: 768px) {
  .row-foot { font-size: 0.75rem; }
}
.when { color: color-mix(in oklab, var(--muted-foreground) 70%, transparent); }
.clicks {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
}
.live-dot {
  position: relative;
  display: inline-flex;
  width: 0.375rem;
  height: 0.375rem;
  flex-shrink: 0;
}
.live-dot::before,
.live-dot::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--primary);
}
.live-dot::before {
  animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  opacity: 0.75;
}
@keyframes ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}
.claim-rank {
  display: inline;
  margin: 0;
  border: 0;
  padding: 0;
  background: none;
  color: var(--muted-foreground);
  font-size: 0.58rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 3px;
  white-space: nowrap;
}
.claim-rank:hover,
.claim-rank:focus {
  color: var(--foreground);
}
.row-cover {
  margin: 0 0 1rem;
  padding: 0.85rem 0.85rem 0.65rem;
  border: 1px solid var(--rule);
  background: var(--card);
  box-shadow: 0.4rem 0.4rem 0 0 color-mix(in oklab, var(--primary) 18%, transparent);
}
.row-cover + .row { border-top: 0; }
.later-stack {
  margin: 0 0 0.35rem;
  padding: 0.65rem 0.15rem 0.15rem;
  border-top: 1px dashed var(--border);
}
.later-stack-kicker {
  margin: 0 0 0.2rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.later-stack-dek {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
  color: var(--muted-foreground);
  text-wrap: pretty;
}
.later-stack[data-later-stack] .row[data-later-rank] {
  display: flex;
  flex-direction: column;
  padding-left: 0;
  padding-right: 0;
}
.later-stack[data-later-stack] .row[data-later-rank] + .row[data-later-rank] {
  border-top: 1px dashed var(--border);
}
.later-stack[data-later-stack] .row[data-later-rank] .row-link {
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.35rem 0;
}
.later-stack[data-later-stack] .row[data-later-rank] .row-meta {
  width: 1.85rem;
  padding-top: 0.15rem;
}
.later-stack[data-later-stack] .row[data-later-rank] .rank {
  min-width: 1.5rem;
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--muted-foreground);
}
.later-stack[data-later-stack] .row[data-later-rank] .dek {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  font-family: var(--font);
  font-size: 0.78rem;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.35;
  color: var(--muted-foreground);
}
.later-stack[data-later-stack] .row[data-later-rank] .slot {
  margin: 0.15rem 0 0;
  min-width: 0;
  font-family: var(--font);
  font-size: 0.78rem;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.35;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.later-stack[data-later-stack] .row[data-later-rank] .bid {
  font-size: 0.78rem;
  font-weight: 600;
}
.later-stack[data-later-stack] .row[data-later-rank] .row-foot {
  font-size: 0.62rem;
}
@media (min-width: 768px) {
  .later-stack[data-later-stack] .row[data-later-rank] .dek,
  .later-stack[data-later-stack] .row[data-later-rank] .slot {
    font-size: 0.82rem;
    white-space: normal;
  }
  .later-stack[data-later-stack] .row[data-later-rank] .rank {
    font-size: 0.75rem;
  }
}
.later-listing[data-later-listing] {
  margin-top: 0.15rem;
}
.later-listing[data-later-listing] .field-label {
  font-size: 0.58rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--muted-foreground);
}
.later-listing[data-later-listing] .field input {
  height: 1.85rem;
  font-size: 0.78rem;
  color: var(--muted-foreground);
}
/* Occupied listing field after List is Why — the prize line, not a second generic line. */
.desk[data-occupied="true"] .why-first[data-why-first] .why-field[data-prize-line] .field-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.desk[data-occupied="true"] .why-first[data-why-first] .why-field[data-prize-line] input {
  height: 2.25rem;
  font-family: var(--serif);
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--foreground);
}
/* Occupied write after List starts at Why — the prize line, not Product URL first. */
.desk[data-occupied="true"] .why-first[data-why-first] {
  margin: 0 0 0.35rem;
}
.desk[data-occupied="true"] .bid-row .later-listing[data-later-listing] {
  flex: 1;
  min-width: 0;
  margin-top: 0;
}
/* Occupied List landing starts at Why — the prize line, not louder Claim #1 chrome first. */
.desk[data-occupied="true"] .why-first[data-why-first][data-list-land] {
  scroll-margin-top: 1.5rem;
  margin: 0 0 0.85rem;
}
.desk[data-occupied="true"] .why-first[data-why-first][data-list-land] .why-field[data-prize-line] input {
  height: 2.35rem;
  font-family: var(--serif);
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--foreground);
}
.desk[data-occupied="true"] .claim-after-cover[data-claim-after-cover] #claim .claim-title {
  font-size: 0.92rem;
  font-weight: 500;
  letter-spacing: 0;
}
@media (min-width: 768px) {
  .desk[data-occupied="true"] .claim-after-cover[data-claim-after-cover] #claim .claim-title {
    font-size: 0.95rem;
  }
}
/* Occupied claim rail after Why land is later rail — quieter than Why, not a second first read. */
.desk[data-occupied="true"] .later-rail[data-later-rail] {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  margin: 0.1rem 0 0;
  padding-top: 0.55rem;
  border-top: 1px dotted var(--border);
}
.desk[data-occupied="true"] #claim .later-rail[data-later-rail] .claim-title {
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--muted-foreground);
}
@media (min-width: 768px) {
  .desk[data-occupied="true"] #claim .later-rail[data-later-rail] .claim-title {
    font-size: 0.82rem;
  }
}
.desk[data-occupied="true"] #claim .later-rail[data-later-rail] .outbid {
  height: 1.85rem;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.desk[data-occupied="true"] #claim .later-rail[data-later-rail] .bid-field {
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
.desk[data-occupied="true"] #claim .later-rail[data-later-rail] .claim-note {
  margin-top: 0.1rem;
  font-size: 0.68rem;
  font-weight: 500;
}
.desk[data-occupied="true"] #claim .later-rail[data-later-rail] .bid-form {
  margin-top: 0.25rem;
  width: 100%;
}
.desk[data-occupied="true"] #claim .later-rail[data-later-rail] .step {
  width: 1.15rem;
  height: 1.15rem;
  font-size: 0.7rem;
}
/* Occupied later merch: claim-this-rank is a quieter later write after the product, not a filled pill on the name. */
.later-stack[data-later-stack] .row[data-later-rank] .claim-after-row[data-claim-after-row] {
  margin: 0 0 0.2rem;
  padding: 0 0 0.05rem 1.85rem;
  font-size: 0.58rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
}
.later-stack[data-later-stack] .row[data-later-rank] .claim-after-row[data-claim-after-row] .claim-rank {
  font-size: 0.58rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
}
.row-1 .rank {
  min-width: 1.75rem;
  border-radius: 2px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 700;
  padding: 0.1rem 0.375rem;
}
.row-cover .host {
  font-size: 1.25rem;
  white-space: normal;
}
.row-cover .host[data-cover-name] {
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.row-cover[data-paid-name] .host[data-cover-name] {
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.desk[data-occupied="true"] .row-cover[data-paid-name] .host[data-cover-name] {
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.row-cover .bid {
  font-size: 0.8rem;
}
.row-cover .clicks {
  font-size: 0.7rem;
}
.cover-later[data-later-fact] {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.65rem;
  margin: 0.2rem 0 0;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--muted-foreground);
  letter-spacing: 0.02em;
}
.row-cover .bid.later-fact[data-later-fact],
.cover-later[data-later-fact] .bid.later-fact,
.cover-later[data-later-fact] .clicks.later-fact {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--muted-foreground);
}
.cover-later[data-later-fact] .live-dot::before,
.cover-later[data-later-fact] .live-dot::after {
  background: var(--muted-foreground);
}
.row-cover .row-link { padding-bottom: 0.35rem; }
.row-stack { padding-left: 0.25rem; }
@media (min-width: 768px) {
  .row-cover { padding: 1.1rem 1.15rem 0.85rem; }
}
.band {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 0.75rem;
}
.band-line {
  height: 2px;
  flex: 1;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary) 30%, transparent);
}
.band-label {
  border: 1px solid color-mix(in oklab, var(--primary) 25%, transparent);
  background: color-mix(in oklab, var(--primary) 10%, transparent);
  color: var(--primary);
  border-radius: 999px;
  padding: 0.25rem 0.625rem;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}
.doc {
  max-width: 42rem;
  margin: 0 auto;
}
.doc h1 {
  margin: 0 0 1rem;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.doc h2 {
  margin: 2rem 0 0.75rem;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.doc p, .doc li {
  color: var(--muted-foreground);
}
.doc p { margin: 0 0 0.85rem; }
.doc ol, .doc ul {
  margin: 0 0 0.85rem;
  padding-left: 1.25rem;
}
.doc li { margin: 0.35rem 0; }
.doc strong { color: var(--foreground); }
.doc a {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.doc code {
  font-size: 0.875em;
  background: var(--muted);
  border-radius: 0.35rem;
  padding: 0.1rem 0.35rem;
}
.doc table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 1rem;
  font-size: 0.875rem;
}
.doc th, .doc td {
  text-align: left;
  vertical-align: top;
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
.doc th {
  font-weight: 600;
  color: var(--foreground);
  white-space: nowrap;
}
.doc td { color: var(--muted-foreground); }
html.dark {
  --background: #16130f;
  --foreground: #f4efe4;
  --card: #211c16;
  --muted: #2a241c;
  --muted-foreground: #b3a896;
  --border: #ffffff1f;
  --input: #ffffff26;
  --rule: #f4efe4;
}
`;
