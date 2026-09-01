import { boardTimeZone, dayKey, formatIssueDate } from "../core/day.js";
import { escapeHtml, formatFolioDate, html } from "./html.js";
import { BOARD_CSS } from "./styles.js";

export const SITE_NAME = "picks.daily";
export const SITE_TITLE = "DTC Picks Daily";
export const SITE_URL = "https://dtcpicks.lol";
export const MAKER_CONTACT_EMAIL = "tangpingqingwa@gmail.com";

function publicCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    /waffo|fixture|reference|outbid|local-only|test-only|implementation|development/i.test(comment)
      ? ""
      : comment,
  );
}

const PUBLIC_BOARD_CSS = publicCss(BOARD_CSS);

const DEFAULT_DESCRIPTION =
  "Discover direct-to-consumer products on a transparent daily merch desk. Sellers bid in USD for the cover and rank is the bid.";

export type NavId = "leaderboard" | "about" | "rules";

export type LayoutInput = {
  title?: string;
  description?: string;
  active: NavId;
  body: string;
  day?: string;
  tz?: string;
  now?: Date;
  canonicalPath?: string;
  noIndex?: boolean;
};

function navItem(href: string, label: string, current: boolean): string {
  return html`<li><a href="${href}"${current ? ' aria-current="page"' : ""}>${label}</a></li>`;
}

type SiteHeaderInput = {
  active: NavId;
  day: string;
  folio: string;
  issueSpoken: string;
};

function renderSearchButton(active: NavId): string {
  return active === "leaderboard"
    ? html`<button type="button" class="search-button" id="search-button" aria-label="Find paid listings" aria-expanded="false" aria-controls="listing-search"><span class="control-label">Find</span></button>`
    : html`<button type="button" class="search-button" aria-label="Find unavailable" aria-disabled="true" disabled><span class="control-label">Find</span></button>`;
}

/** A small public contact line shared by every server-rendered page. */
export function renderMakerFooter(): string {
  const email = escapeHtml(MAKER_CONTACT_EMAIL);
  return html`<footer class="maker-footer" data-maker-contact="">
    <p>Built by <a href="mailto:${email}">${email}</a></p>
  </footer>`;
}

/** The merch-desk header keeps issue metadata independent of board content. */
export function renderSiteHeader(input: SiteHeaderInput): string {
  const day = escapeHtml(input.day);
  const folio = escapeHtml(input.folio);
  const issueSpoken = escapeHtml(input.issueSpoken);
  return html`<header class="site-header" data-site-header="" data-slot="site-header">
    <div class="site-header-inner" data-site-header-inner="" data-slot="shell">
      <a class="brand" href="/" data-slot="brand">
        <img class="brand-mark" src="/icons/brand-mark.svg" width="28" height="28" alt="" aria-hidden="true"/>
        <span class="brand-name">picks<span class="brand-dot">.daily</span></span>
      </a>
      <p class="rail-folio">
        <span class="rail-kicker">MERCH DESK / MORNING ISSUE</span>
        <time datetime="${day}" data-issue-date="${day}">${folio}</time>
      </p>
      <div class="nav-wrap">
        <nav aria-label="Main" data-slot="primary-nav">
          <ul>
            ${navItem("/", "Leaderboard", input.active === "leaderboard")}
            ${navItem("/about", "About", input.active === "about")}
            <li class="nav-rules"><a href="/rules"${input.active === "rules" ? ' aria-current="page"' : ""}>Rules</a></li>
          </ul>
        </nav>
        ${renderSearchButton(input.active)}
        <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch to dark mode">
          <span class="control-label">Theme</span>
        </button>
      </div>
    </div>
    <p class="sr-only">${issueSpoken}. Date is the issue.</p>
  </header>`;
}

export function renderLayout(input: LayoutInput): string {
  const tz = input.tz ?? boardTimeZone();
  const day = input.day ?? dayKey(input.now, tz);
  const title = escapeHtml(input.title ?? SITE_TITLE);
  const description = escapeHtml(
    input.description ?? DEFAULT_DESCRIPTION,
  );
  const canonicalPath = input.canonicalPath ??
    (input.active === "about" ? "/about" : input.active === "rules" ? "/rules" : "/");
  const canonical = `${SITE_URL}${canonicalPath}`;
  const noIndex = input.noIndex ?? /(checkout|payment|return)/i.test(title);
  const robots = noIndex
    ? "noindex,nofollow"
    : "index,follow,max-image-preview:large,max-snippet:-1";
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_TITLE,
    alternateName: SITE_NAME,
    url: SITE_URL,
    description: input.description ?? DEFAULT_DESCRIPTION,
    inLanguage: "en",
    isAccessibleForFree: true,
  }).replace(/</g, "\\u003c");
  const folio = formatFolioDate(day);
  const issueSpoken = formatIssueDate(day, tz);
  const siteHeader = renderSiteHeader({
    active: input.active,
    day,
    folio,
    issueSpoken,
  });
  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <link rel="icon" type="image/svg+xml" href="/icons/brand-mark.svg"/>
  <link rel="manifest" href="/site.webmanifest"/>
  <link rel="canonical" href="${canonical}"/>
  <title>${title}</title>
  <meta name="description" content="${description}"/>
  <meta name="robots" content="${robots}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="${SITE_TITLE}"/>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${description}"/>
  <meta property="og:url" content="${canonical}"/>
  <meta property="og:image" content="${SITE_URL}/icons/brand-mark.png"/>
  <meta property="og:image:width" content="512"/>
  <meta property="og:image:height" content="512"/>
  <meta name="twitter:card" content="summary"/>
  <meta name="twitter:title" content="${title}"/>
  <meta name="twitter:description" content="${description}"/>
  <meta name="twitter:image" content="${SITE_URL}/icons/brand-mark.png"/>
  <script type="application/ld+json">${structuredData}</script>
  <style>${PUBLIC_BOARD_CSS}</style>
</head>
<body>
  ${siteHeader}
  <div class="page">
    ${input.body}
  </div>
  ${renderMakerFooter()}
  <script>
    (function () {
      var root = document.documentElement;
      var key = "theme";
      var btn = document.getElementById("theme-toggle");
      function apply(theme) {
        root.classList.toggle("dark", theme === "dark");
        if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
      }
      try { apply(localStorage.getItem(key) || "light"); } catch (e) { apply("light"); }
      if (btn) {
        btn.addEventListener("click", function () {
          var next = root.classList.contains("dark") ? "light" : "dark";
          try { localStorage.setItem(key, next); } catch (e) {}
          apply(next);
        });
      }
    })();
  </script>
</body>
</html>`;
}
