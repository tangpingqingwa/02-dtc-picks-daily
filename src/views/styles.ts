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
#claim {
  scroll-margin-top: 1.5rem;
  margin-top: 2.25rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
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
  margin: 0.55rem 0 0.15rem;
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
.cover-hop:hover {
  background: color-mix(in oklab, var(--primary) 80%, black);
  color: var(--primary-foreground);
}
.cover-why {
  margin: 0.15rem 0 0.55rem;
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
  position: absolute;
  left: 50%;
  top: 0.375rem;
  z-index: 20;
  transform: translateX(-50%);
  border: 0;
  border-radius: 2px;
  background: var(--primary);
  color: var(--primary-foreground);
  padding: 0.125rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgb(40 38 36 / 0.12);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
.row:hover .claim-rank,
.row:focus-within .claim-rank {
  opacity: 1;
  pointer-events: auto;
}
.row-cover {
  margin: 0 0 1rem;
  padding: 0.85rem 0.85rem 0.65rem;
  border: 1px solid var(--rule);
  background: var(--card);
  box-shadow: 0.4rem 0.4rem 0 0 color-mix(in oklab, var(--primary) 18%, transparent);
}
.row-cover + .row { border-top: 0; }
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
.row-cover .cover-why-line {
  font-size: 1.35rem;
}
.row-cover .row-link { padding-bottom: 0.35rem; }
.row-cover .claim-rank {
  top: 0;
  transform: translate(-50%, -50%);
}
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
