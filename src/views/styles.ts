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
html {
  height: 100%;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
html::-webkit-scrollbar,
body::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  scrollbar-width: none;
  -ms-overflow-style: none;
  font-family: var(--font);
  background:
    radial-gradient(900px 280px at 50% -120px, color-mix(in oklab, var(--primary) 10%, transparent), transparent),
    var(--background);
  color: var(--foreground);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
html,
body {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
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
/* Empty morning: the direct Product URL, Why, Outbid form stays quiet. */
.desk:has(.empty) .cover-hop,
.desk:has(.empty) .cover-hop-wrap,
.desk:has(.empty) .cover-later,
.desk:has(.empty) .cover-why,
.desk:has(.empty) .list-under-cover,
.desk:has(.empty) .list-after-why,
.desk:has(.empty) .list-route,
.desk:has(.empty) .list-route-wrap,
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
  font-size: clamp(1.55rem, 2.35vw, 1.75rem);
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
/* Occupied cover claim stays in the right-hand drawer grid area. */
.desk[data-occupied="true"] .claim-after-cover[data-claim-after-cover] {
  min-width: 0;
}
/* Empty morning: Product URL and Why lead directly to one Outbid submit. */
.desk[data-occupied="false"] #claim {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.desk[data-occupied="false"] #claim .bid-form {
  width: 100%;
  align-items: center;
}
.desk[data-occupied="false"] #claim .field {
  width: 100%;
  max-width: 28rem;
}
.desk[data-occupied="false"] #claim .outbid {
  width: auto;
  min-width: 9rem;
  margin: 0 auto;
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
  text-decoration: none;
}
.bid-field:focus-within {
  outline: 2px solid var(--ring);
  outline-offset: 4px;
  border-radius: 2px;
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
/* Unpaid Waffo checkout stays off the merch desk until Waffo reports paid. */
.desk[data-unpaid-off] .row-cover,
.desk[data-unpaid-off] .later-stack,
.desk[data-unpaid-off] .cover-hop,
.desk[data-unpaid-off] .cover-hop-wrap,
.desk[data-unpaid-off] .cover-later,
.desk[data-unpaid-off] .cover-why,
.desk[data-unpaid-off] .list-under-cover,
.desk[data-unpaid-off] .list-after-why,
.desk[data-unpaid-off] .list-route,
.desk[data-unpaid-off] .list-route-wrap,
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
.desk[data-occupied="false"] #claim .claim-note[data-unpaid-off] {
  max-width: 26rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--muted-foreground);
}
.desk[data-occupied="false"] #claim .claim-note[data-unpaid-off] .unpaid-off-line {
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
/* Occupied cover: Take is the one first click. List stays a quiet route after it. */
.list-route-wrap {
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
.list-route {
  font-weight: 700;
  color: var(--primary);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 4px;
  text-decoration-thickness: 1px;
}
.list-route:hover {
  color: var(--foreground);
}
.desk[data-occupied="true"] .list-route-wrap[data-list-route-wrap] {
  margin: 0.25rem 0 0;
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--muted-foreground);
}
.desk[data-occupied="true"] .list-route-wrap[data-list-route-wrap] .list-route {
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
.desk[data-occupied="true"] .list-route-wrap[data-list-route-wrap] .list-route:hover {
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
/* Occupied Product URL after later claim rail is later write — not a twin on the bid-row. */
.desk[data-occupied="true"] .merch-desk-main #claim .later-rail[data-later-rail] + .later-listing[data-later-listing] {
  display: none;
  flex-direction: column;
  width: 100%;
  max-width: 14.5rem;
  margin: 0.55rem auto 0;
  padding-top: 0.5rem;
  border-top: 1px dotted var(--border);
}
.desk[data-occupied="true"] #claim .later-rail[data-later-rail] + .later-listing[data-later-listing] .field-label {
  font-size: 0.5rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}
.desk[data-occupied="true"] #claim .later-rail[data-later-rail] + .later-listing[data-later-listing] .field input {
  height: 1.35rem;
  font-size: 0.58rem;
  color: var(--muted-foreground);
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



/* MERCH DESK identity layer. The homepage is a paper ledger for DTC
   operators with its own cover, ledger, and claim-drawer composition. */
:root {
  --background: #f4efe4;
  --foreground: #211d18;
  --card: #fffaf0;
  --primary: #a44725;
  --primary-foreground: #fffaf0;
  --muted: #eae0cf;
  --muted-foreground: #6e6255;
  --border: #cfc0a9;
  --input: #c9b99f;
  --ring: #a44725;
  --rule: #211d18;
  --radius: 3px;
  --font: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --serif: "Newsreader", "Iowan Old Style", "Palatino Linotype", Palatino, serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
html.dark {
  --background: #181511;
  --foreground: #f4efe4;
  --card: #241e17;
  --primary: #e07b4c;
  --primary-foreground: #1e1712;
  --muted: #31281e;
  --muted-foreground: #c2b29b;
  --border: #ffffff30;
  --input: #ffffff38;
  --ring: #e07b4c;
  --rule: #f4efe4;
}
html, body, button, input { font-family: var(--font); }
body {
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent 31px, color-mix(in srgb, var(--border) 14%, transparent) 32px),
    radial-gradient(900px 280px at 50% -120px, color-mix(in srgb, var(--primary) 10%, transparent), transparent),
    var(--background);
  color: var(--foreground);
}
.site-header-inner,
.page {
  width: min(1120px, calc(100% - 48px));
  max-width: 1120px;
  padding-left: 0;
  padding-right: 0;
}
.site-header-inner {
  height: 72px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 24px;
  border-bottom: 1px solid var(--rule);
}
.brand {
  gap: 0;
  min-width: 0;
  color: var(--foreground);
  font-family: var(--serif);
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.035em;
}
.brand-name { white-space: nowrap; }
.brand-dot { color: var(--primary); }
.brand { gap: 10px; }
.brand-mark { display: block; width: 28px; height: 28px; flex: 0 0 28px; border-radius: 8px; }
.rail-folio {
  margin: 0;
  text-align: center;
  font-family: var(--mono);
  font-size: 0.62rem;
  line-height: 1.3;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.rail-kicker {
  display: block;
  color: var(--primary);
  font-weight: 700;
}
.rail-folio time {
  display: block;
  margin-top: 4px;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
}
.nav-wrap { display: flex; align-items: center; justify-content: flex-end; gap: 14px; min-width: 0; }
nav[aria-label="Main"] ul {
  display: flex;
  align-items: center;
  gap: 17px;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.78rem;
  white-space: nowrap;
}
nav[aria-label="Main"] a {
  color: var(--muted-foreground);
  font-weight: 600;
}
nav[aria-label="Main"] a[aria-current="page"],
nav[aria-label="Main"] a:hover { color: var(--foreground); }
nav[aria-label="Main"] .nav-rules { display: list-item; }
.search-button,
.theme-toggle {
  width: auto;
  min-width: 0;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--foreground);
  font-family: var(--mono);
  font-size: 0.59rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}
.search-button:hover,
.theme-toggle:hover { background: var(--muted); }
.page {
  flex: 1;
  padding-top: 28px;
  padding-bottom: 64px;
}
.maker-footer {
  width: min(1120px, calc(100% - 48px));
  max-width: 1120px;
  margin: 0 auto;
  padding: 20px 0 30px;
  border-top: 1px dashed var(--border);
  color: var(--muted-foreground);
  font-family: var(--mono);
  font-size: 0.64rem;
  line-height: 1.5;
  letter-spacing: 0.04em;
  text-align: center;
}
.maker-footer p { margin: 0; }
.maker-footer a {
  color: var(--primary);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 4px;
  overflow-wrap: anywhere;
}
.maker-footer a:hover { color: var(--foreground); }
.maker-footer a:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 4px;
}
.merch-desk-main {
  display: grid;
  grid-template-columns: minmax(0, 720px) minmax(300px, 360px);
  grid-template-areas:
    "cover claim"
    "ledger claim"
    "handoff handoff";
  justify-content: space-between;
  align-items: start;
  column-gap: 32px;
  row-gap: 28px;
  min-width: 0;
}
.merch-desk-main > #leaderboard { grid-area: cover; }
.merch-desk-main > #claim,
.merch-desk-main > .claim-after-cover { grid-area: claim; }
.merch-desk-main > .later-stack { grid-area: ledger; }
.merch-desk-main > .last24h { grid-area: handoff; }
.claim-after-cover { min-width: 0; }
.merch-desk-main #claim {
  scroll-margin-top: 24px;
  min-width: 0;
  margin: 0;
  padding: 22px 22px 20px;
  border: 1px solid var(--rule);
  background: var(--card);
  box-shadow: 6px 6px 0 color-mix(in srgb, var(--primary) 14%, transparent);
}
.merch-desk-main #claim .claim-context {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  margin: 0 0 24px;
}
.desk-status {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 8px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 0.63rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.desk-status-stamp { color: var(--primary); font-weight: 700; }
.desk-periods {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border);
}
.desk-periods-label {
  flex: 0 0 auto;
  font-family: var(--mono);
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.desk-periods .ranking-tab {
  min-height: 30px;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 3px 4px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 0.73rem;
  font-weight: 700;
}
.desk-periods .ranking-tab.is-selected,
.desk-periods .ranking-tab:hover {
  border-bottom-color: var(--primary);
  color: var(--foreground);
}
.claim-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  font-family: var(--serif);
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.04;
  text-align: center;
  white-space: normal;
}
.bid-stepper {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 0;
}
.step {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--muted);
  color: var(--primary);
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1;
}
.step:hover { background: color-mix(in srgb, var(--primary) 13%, var(--muted)); }
.bid-field {
  position: relative;
  display: block;
  flex: 0 0 auto;
  width: max-content;
  min-width: 3.25rem;
  color: var(--primary);
  text-align: center;
  text-decoration: none;
}
.bid-field:focus-within {
  outline: 2px solid var(--ring);
  outline-offset: 5px;
}
.bid-sizer { visibility: hidden; white-space: nowrap; }
.bid-input-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bid-input-wrap input {
  width: 100%;
  min-width: 0;
  border: 0;
  padding: 0;
  outline: none;
  background: transparent;
  color: inherit;
  text-align: center;
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.claim-note {
  margin: 18px 0 0;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--muted-foreground);
}
.claim-note .accent { color: var(--primary); font-weight: 700; }
.claim-note[data-unpaid-off] { color: var(--foreground); }
.unpaid-off-line { display: block; margin-bottom: 8px; font-weight: 700; }
.bid-form {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 13px;
  margin-top: 18px;
}
.url-field,
.claim-note-field,
.desk-lane-picker,
.claim-submit,
.form-hint {
  display: block;
  width: 100%;
  max-width: 28rem;
  min-width: 0;
}
.url-field input,
.claim-note-field input {
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--input);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--background);
  color: var(--foreground);
  outline: none;
}
.url-field input { font-family: var(--mono); font-size: 0.74rem; }
.claim-note-field .field-label {
  display: block;
  margin: 0 0 5px;
  font-family: var(--mono);
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.claim-note-field input { font-family: var(--serif); font-size: 1rem; }
.url-field input:focus,
.claim-note-field input:focus,
.lane-select:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 22%, transparent);
}
.url-field input::placeholder,
.claim-note-field input::placeholder { color: var(--muted-foreground); }
.desk-lane-picker { position: relative; }
.lane-select {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px dashed var(--input);
  border-radius: var(--radius);
  padding: 8px 10px;
  background: transparent;
  text-align: left;
  color: var(--muted-foreground);
  font-family: var(--mono);
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.lane-select-label { color: var(--primary); font-weight: 700; }
.lane-menu,
.category-overflow {
  position: absolute;
  z-index: 5;
  top: calc(100% + 6px);
  left: 0;
  width: 100%;
  max-height: 260px;
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--rule);
  background: var(--card);
  box-shadow: 5px 5px 0 color-mix(in srgb, var(--primary) 16%, transparent);
}
.lane-menu-option,
.category-overflow-option {
  width: 100%;
  display: block;
  min-height: 36px;
  border: 0;
  border-bottom: 1px solid var(--border);
  padding: 7px 8px;
  background: transparent;
  text-align: left;
  font-size: 0.77rem;
}
.lane-menu-option:last-child,
.category-overflow-option:last-child { border-bottom: 0; }
.lane-menu-option:hover,
.category-overflow-option:hover { background: var(--muted); }
.claim-submit {
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--primary);
  border-radius: var(--radius);
  padding: 0 16px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-family: var(--mono);
  font-size: 0.73rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.claim-submit:hover { background: color-mix(in srgb, var(--primary) 82%, black); }
.claim-submit:focus-visible,
.cover-hop:focus-visible,
.list-route:focus-visible,
.claim-rank:focus-visible,
.category-chip:focus-visible,
.category-more:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
}
.form-hint {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--muted-foreground);
}
.desk-lanes {
  position: relative;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px dashed var(--border);
}
.desk-lanes-label {
  margin: 0 0 9px;
  font-family: var(--mono);
  font-size: 0.61rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.category-rail-scroll {
  overflow-x: auto;
  scrollbar-width: thin;
}
.category-chip-list {
  display: flex;
  gap: 7px;
  min-width: max-content;
}
.category-chip,
.category-more {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 5px 9px;
  background: transparent;
  color: var(--muted-foreground);
  font-family: var(--mono);
  font-size: 0.61rem;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.category-chip:hover,
.category-chip.is-selected,
.category-more:hover { border-color: var(--primary); color: var(--foreground); }
.category-more {
  margin-top: 8px;
  border-style: dashed;
}
.category-overflow {
  top: auto;
  bottom: calc(100% - 14px);
  left: auto;
  right: 0;
  width: min(260px, 100%);
}
.cover-board { min-width: 0; }
.cover-board .masthead {
  margin: 0 0 18px;
  padding: 0 0 17px;
  border-bottom: 3px double var(--rule);
  text-align: left;
}
.cover-board .masthead-kicker {
  margin: 0 0 7px;
  color: var(--primary);
  font-family: var(--mono);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.cover-board .masthead-title {
  margin: 0;
  font-family: var(--serif);
  font-size: clamp(2.55rem, 5vw, 4.3rem);
  font-weight: 700;
  letter-spacing: -0.055em;
  line-height: 0.92;
}
.cover-board .masthead-issue {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px 11px;
  margin: 14px 0 0;
  font-family: var(--mono);
  font-size: 0.64rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.cover-board .issue-label { color: var(--primary); font-weight: 700; }
.cover-board .issue-rule { width: 25px; height: 1px; background: var(--border); }
.cover-board .issue-tz { color: var(--muted-foreground); }
.cover-board .masthead-dek {
  max-width: 620px;
  margin: 11px 0 0;
  color: var(--muted-foreground);
  font-size: 0.9rem;
  line-height: 1.45;
}
.merch-desk-main .row {
  min-width: 0;
  padding: 0;
}
.merch-desk-main .row-cover {
  min-height: 176px;
  margin: 0;
  padding: 15px 16px 13px;
  border: 1px solid var(--rule);
  border-radius: 0;
  background: var(--card);
  box-shadow: 8px 8px 0 color-mix(in srgb, var(--primary) 18%, transparent);
}
.merch-desk-main .row-cover .row-link {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  grid-template-areas:
    "leading body"
    ". action"
    ". route"
    ". facts";
  align-items: start;
  gap: 0 16px;
  padding: 0;
}
.merch-desk-main .row-cover .row-leading { grid-area: leading; }
.merch-desk-main .row-cover .podium-hit { grid-area: body; min-width: 0; }
.merch-desk-main .row-cover .cover-hop-wrap { grid-area: action; }
.merch-desk-main .row-cover .list-route-wrap { grid-area: route; }
.merch-desk-main .row-cover .cover-later { grid-area: facts; }
.row-leading {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.row-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: auto;
}
.rank {
  min-width: 0;
  display: inline-flex;
  color: var(--foreground);
  font-family: var(--mono);
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1;
}
.rank-label {
  color: var(--primary);
  font-family: var(--mono);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.14em;
}
.row-body { min-width: 0; }
.podium-body { min-width: 0; }
.row-kicker {
  margin: 0 0 8px;
  color: var(--primary);
  font-family: var(--mono);
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.cover-why { margin: 0 0 10px; }
.cover-why-label {
  margin: 0 0 4px;
  color: var(--muted-foreground);
  font-family: var(--mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.cover-why-line,
.cover-why-line[data-prize-before-price] {
  margin: 0;
  color: var(--foreground);
  font-family: var(--serif);
  font-size: 1.08rem;
  font-weight: 650;
  letter-spacing: -0.018em;
  line-height: 1.28;
}
.row-top {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.host,
.dek {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  color: var(--foreground);
  font-family: var(--mono);
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.3;
}
.podium-description,
.slot {
  margin: 9px 0 0;
  color: var(--muted-foreground);
  font-family: var(--serif);
  font-size: 0.93rem;
  line-height: 1.38;
}
.podium-meta,
.row-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 3px 7px;
  margin: 12px 0 0;
  color: var(--muted-foreground);
  font-family: var(--mono);
  font-size: 0.61rem;
  line-height: 1.45;
}
.podium-category { color: var(--primary); font-weight: 700; }
.podium-details { text-decoration: underline; text-decoration-style: dashed; text-underline-offset: 3px; }
.cover-hop-wrap { margin: 13px 0 0; }
.cover-hop {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--primary);
  border-radius: var(--radius);
  padding: 0 16px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-family: var(--mono);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.cover-hop:hover { background: color-mix(in srgb, var(--primary) 82%, black); }
.list-route-wrap {
  margin: 8px 0 0;
  color: var(--muted-foreground);
  font-size: 0.68rem;
  line-height: 1.4;
}
.list-route {
  color: var(--primary);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 4px;
}
.cover-later[data-later-fact] {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin: 10px 0 0;
  padding-top: 9px;
  border-top: 1px dashed var(--border);
  color: var(--muted-foreground);
  font-family: var(--mono);
  font-size: 0.64rem;
}
.cover-later .bid,
.cover-later .clicks { color: var(--muted-foreground); font-size: 0.64rem; font-weight: 600; }
.live-dot {
  width: 5px;
  height: 5px;
  display: inline-block;
  margin-right: 4px;
  border-radius: 50%;
  background: var(--primary);
}
.merch-desk-main .desk-ledger {
  min-width: 0;
  margin: 0;
  padding: 15px 0 0;
  border-top: 1px dashed var(--border);
}
.desk-ledger .later-stack-kicker,
.last24h-kicker {
  margin: 0 0 6px;
  color: var(--primary);
  font-family: var(--mono);
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}
.later-stack-dek,
.last24h-dek {
  max-width: 720px;
  margin: 0 0 12px;
  color: var(--muted-foreground);
  font-size: 0.76rem;
  line-height: 1.45;
}
.desk-ledger [data-identity-slot="ledger-row"] {
  border-top: 1px solid var(--border);
}
.merch-desk-main .desk-ledger .row-link {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  grid-template-areas: "leading body";
  align-items: start;
  gap: 0 16px;
  padding: 14px 0 10px;
}
.desk-ledger [data-identity-slot="ledger-row"] .row-leading {
  grid-area: leading;
  gap: 7px;
}
.desk-ledger [data-identity-slot="ledger-row"] .row-body { grid-area: body; }
.desk-ledger [data-identity-slot="ledger-row"] .rank { font-size: 0.95rem; }
.desk-ledger [data-identity-slot="ledger-row"] .row-top { justify-content: space-between; }
.desk-ledger [data-identity-slot="ledger-row"] .dek {
  max-width: 570px;
  font-size: 0.88rem;
}
.desk-ledger [data-identity-slot="ledger-row"] .bid {
  color: var(--primary);
  font-family: var(--mono);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}
.desk-ledger [data-identity-slot="ledger-row"] .slot {
  max-width: 570px;
  margin-top: 6px;
  font-size: 0.88rem;
}
.desk-ledger [data-identity-slot="ledger-row"] .row-foot {
  margin-top: 8px;
  font-size: 0.59rem;
}
.claim-after-row {
  margin: 0;
  padding: 0 0 10px 94px;
}
.claim-rank {
  border: 0;
  padding: 0;
  background: none;
  color: var(--muted-foreground);
  font-family: var(--mono);
  font-size: 0.59rem;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 3px;
}
.claim-rank:hover { color: var(--foreground); }
.merch-desk-main .last24h {
  grid-area: handoff;
  min-width: 0;
  margin: 0;
  padding: 18px 0 0;
  border-top: 3px double var(--rule);
}
.last24h-dek { max-width: 900px; }
.last24h-empty {
  margin: 12px 0 0;
  padding: 14px;
  border: 1px dashed var(--border);
  color: var(--muted-foreground);
  font-size: 0.78rem;
  line-height: 1.5;
}
.last24h-list { margin: 12px 0 0; }
.last24h-row { border-top: 1px solid var(--border); }
.last24h-row:first-child { border-top: 0; }
.last24h-link {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 16px;
  align-items: baseline;
  padding: 10px 0;
}
.last24h-body { min-width: 0; }
.last24h-host {
  display: block;
  color: var(--foreground);
  font-family: var(--mono);
  font-size: 0.76rem;
  font-weight: 700;
}
.last24h-why {
  display: block;
  margin-top: 3px;
  overflow-wrap: anywhere;
  color: var(--muted-foreground);
  font-family: var(--serif);
  font-size: 0.83rem;
  line-height: 1.35;
}
.last24h-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px 9px;
  color: var(--muted-foreground);
  font-family: var(--mono);
  font-size: 0.6rem;
}
.last24h-bid {
  color: var(--primary);
  font-weight: 700;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 3px;
}
.last24h-rank { color: var(--primary); font-weight: 700; }
@media (max-width: 767px) {
  .site-header-inner,
  .page,
  .maker-footer {
    width: calc(100% - 32px);
    max-width: none;
  }
  .site-header-inner {
    height: 68px;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "brand nav"
      "folio folio";
    gap: 0 12px;
  }
  .brand { grid-area: brand; font-size: 1.15rem; }
  .rail-folio {
    grid-area: folio;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    text-align: left;
    font-size: 0.56rem;
  }
  .rail-kicker { display: inline; }
  .rail-folio time { display: inline; margin-top: 0; }
  .nav-wrap { grid-area: nav; gap: 8px; }
  nav[aria-label="Main"] ul { gap: 9px; font-size: 0.68rem; }
  .search-button,
  .theme-toggle { width: auto; min-width: 0; height: 28px; padding: 0 7px; }
  .page { padding-top: 20px; padding-bottom: 44px; }
  .maker-footer { padding: 16px 0 26px; }
  .merch-desk-main {
    display: flex;
    flex-direction: column;
    gap: 23px;
  }
  .merch-desk-main > #leaderboard { order: 1; }
  .merch-desk-main > #claim,
  .merch-desk-main > .claim-after-cover { order: 2; width: 100%; }
  .merch-desk-main > .later-stack { order: 3; }
  .merch-desk-main > .last24h { order: 4; }
  .desk[data-occupied="false"] .merch-desk-main > #claim { order: 1; }
  .desk[data-occupied="false"] .merch-desk-main > #leaderboard { order: 2; }
  .desk[data-occupied="false"] .merch-desk-main > .last24h { order: 3; }
  .merch-desk-main #claim {
    padding: 18px 16px 17px;
    box-shadow: 5px 5px 0 color-mix(in srgb, var(--primary) 14%, transparent);
  }
  .claim-title {
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    font-size: 1.55rem;
    text-align: center;
    white-space: normal;
  }
  .bid-stepper {
    flex: 0 0 auto;
    justify-content: center;
    gap: 6px;
  }
  .step { width: 38px; height: 38px; flex-basis: 38px; }
  .cover-board .masthead { margin-bottom: 15px; padding-bottom: 14px; }
  .cover-board .masthead-title { font-size: clamp(2.3rem, 12vw, 3.35rem); }
  .cover-board .masthead-dek { font-size: 0.82rem; }
  .merch-desk-main .row-cover {
    min-height: 176px;
    padding: 13px 13px 12px;
    box-shadow: 5px 5px 0 color-mix(in srgb, var(--primary) 18%, transparent);
  }
  .merch-desk-main .row-cover .row-link {
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 0 10px;
  }
  .row-cover .rank { font-size: 1rem; }
  .cover-why-line,
  .cover-why-line[data-prize-before-price] { font-size: 1rem; }
  .host,
  .dek { font-size: 0.77rem; }
  .podium-description,
  .slot { font-size: 0.86rem; }
  .podium-meta,
  .row-foot { font-size: 0.57rem; }
  .cover-hop-wrap { margin-top: 11px; }
  .cover-hop { width: 100%; justify-content: center; }
  .list-route-wrap { margin-top: 7px; }
  .merch-desk-main .desk-ledger .row-link {
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 0 10px;
    padding: 12px 0 9px;
  }
  .desk-ledger [data-identity-slot="ledger-row"] .slot { font-size: 0.82rem; }
  .claim-after-row { padding-left: 66px; }
  .last24h-link { grid-template-columns: 1fr; gap: 7px; }
  .last24h-meta { justify-content: flex-start; }
  .last24h-why { font-size: 0.78rem; }
  .category-chip,
  .category-more { min-height: 36px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; }
}
`;
