export const BOARD_CSS = /* css */ `
:root {
  --background: #fffdfa;
  --foreground: #282624;
  --card: #fffdfa;
  --primary: #e57255;
  --primary-foreground: #fff;
  --muted: #f6f3ef;
  --muted-foreground: #67625d;
  --border: #e6e0da;
  --input: #e6e0da;
  --ring: #e57255;
  --radius: 0.875rem;
  --font: "DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { height: 100%; }
body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  font-family: var(--font);
  background: var(--background);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.25rem;
  padding-bottom: 1rem;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.375rem;
  font-weight: 500;
  letter-spacing: -0.04em;
}
.brand-mark { height: 1.25rem; width: auto; }
.brand-dot { color: var(--primary); }
.nav-wrap { display: flex; align-items: center; gap: 1rem; }
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
#claim { scroll-margin-top: 1.5rem; }
.claim-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem 0.5rem;
  margin: 0;
  text-align: center;
  font-size: 1.75rem;
  font-weight: 700;
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
  border: 0;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary) 15%, transparent);
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
.field-icon {
  pointer-events: none;
  position: absolute;
  top: 50%;
  left: 0.625rem;
  transform: translateY(-50%);
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--muted);
  color: var(--muted-foreground);
}
.field input,
.field textarea {
  width: 100%;
  min-width: 0;
  height: 2.75rem;
  border: 1px solid var(--input);
  border-radius: 0.75rem;
  background: transparent;
  padding: 0.25rem 0.75rem 0.25rem 2.75rem;
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
  border: 0;
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 700;
  font-size: 0.875rem;
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
#leaderboard { scroll-margin-top: 1.5rem; margin-top: 1.5rem; }
.empty {
  margin-top: 2rem;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--muted-foreground);
  border: 1px dashed var(--border);
  border-radius: 1rem;
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
@media (min-width: 768px) {
  .row-link { gap: 0.75rem; padding: 0.75rem 0; }
}
.row-link:hover { color: var(--primary); }
.row-meta {
  display: flex;
  width: 2.5rem;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
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
.avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.375rem;
  background: var(--muted);
  color: var(--muted-foreground);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  flex-shrink: 0;
}
@media (min-width: 768px) {
  .avatar { width: 3.5rem; height: 3.5rem; }
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
  font-size: 0.875rem;
  font-weight: 500;
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
  margin: 0;
  min-width: 0;
  font-size: 0.75rem;
  color: color-mix(in oklab, var(--muted-foreground) 70%, transparent);
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
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-foreground);
  padding: 0.125rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 700;
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
.row-top3 {
  margin: 0.375rem 0;
  padding: 0 0.625rem;
  border: 2px solid color-mix(in oklab, var(--primary) 15%, transparent);
  border-radius: 0.75rem;
  background: color-mix(in oklab, var(--primary) 3%, transparent);
}
.row-top3 + .row-top3 { border-top: 2px solid color-mix(in oklab, var(--primary) 15%, transparent); }
.row-1 {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 22%, transparent);
}
.row-2 {
  border-color: color-mix(in oklab, var(--primary) 40%, transparent);
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}
@media (min-width: 768px) {
  .row-top3 {
    margin: 0.75rem 0;
    padding: 0 0.875rem;
    border-radius: 1rem;
  }
}
.row-top3 .rank {
  min-width: 1.75rem;
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 600;
  padding: 0 0.375rem;
}
.row-top3 .host { font-weight: 700; }
.row-top3 .claim-rank {
  top: 0;
  transform: translate(-50%, -50%);
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
  --background: #1a1512;
  --foreground: #f7f5f1;
  --card: #231e1b;
  --muted: #2d2824;
  --muted-foreground: #aba39b;
  --border: #ffffff1a;
  --input: #ffffff26;
}
`;
