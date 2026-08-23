import { boardTimeZone, dayKey, formatIssueDate } from "../core/day.js";
import { escapeHtml, formatFolioDate, html } from "./html.js";
import { BOARD_CSS } from "./styles.js";

export const SITE_NAME = "picks.daily";
export const SITE_TITLE = "DTC Picks Daily";

export type NavId = "leaderboard" | "about" | "rules";

export type LayoutInput = {
  title?: string;
  description?: string;
  active: NavId;
  body: string;
  day?: string;
  tz?: string;
  now?: Date;
};

function navItem(href: string, label: string, current: boolean): string {
  return html`<li><a href="${href}"${current ? ' aria-current="page"' : ""}>${label}</a></li>`;
}

export function renderLayout(input: LayoutInput): string {
  const tz = input.tz ?? boardTimeZone();
  const day = input.day ?? dayKey(input.now, tz);
  const title = escapeHtml(input.title ?? SITE_TITLE);
  const description = escapeHtml(
    input.description ??
      "Bid USD. Own this morning’s cover. Sellers see your product link first.",
  );
  const folio = escapeHtml(formatFolioDate(day));
  const issueSpoken = escapeHtml(formatIssueDate(day, tz));
  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <meta name="description" content="${description}"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,650;0,6..72,700;1,6..72,500&display=swap" rel="stylesheet"/>
  <style>${BOARD_CSS}</style>
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>picks<span class="brand-dot">.</span>daily</span>
      </a>
      <p class="rail-folio">
        <span class="rail-kicker">Morning edition</span>
        <time datetime="${escapeHtml(day)}" data-issue-date="${escapeHtml(day)}">${folio}</time>
      </p>
      <div class="nav-wrap">
        <nav aria-label="Main">
          <ul>
            ${navItem("/", "Leaderboard", input.active === "leaderboard")}
            ${navItem("/about", "About", input.active === "about")}
            ${navItem("/rules", "Rules", input.active === "rules")}
          </ul>
        </nav>
        <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch to dark mode">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"></path></svg>
        </button>
      </div>
    </div>
    <p class="sr-only">${issueSpoken}. Date is the issue.</p>
  </header>
  <div class="page">
    ${input.body}
  </div>
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
