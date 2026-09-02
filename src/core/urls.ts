import { isPrivateOrLocalHostname } from "./network.js";

export class UrlError extends Error {
  readonly code: string;
  readonly statusCode = 400;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UrlError";
    this.code = code;
  }
}

const TRACKING_KEYS = new Set([
  "ref",
  "affiliate",
  "aff",
  "tag",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "si",
  "pp",
  "ascsubtag",
  "linkcode",
  "psc",
]);

const SHORTENER_HOSTS = [
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "cutt.ly",
  "rebrand.ly",
  "amzn.to",
];

const CHAT_HOSTS = [
  "t.me",
  "telegram.me",
  "telegram.org",
  "telegram.dog",
  "wa.me",
  "whatsapp.com",
  "discord.gg",
  "discord.com",
  "discordapp.com",
  "m.me",
  "messenger.com",
  "signal.me",
  "signal.org",
  "line.me",
  "line.naver.jp",
];

const NSFW_HOSTS = [
  "pornhub.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "onlyfans.com",
  "fansly.com",
  "chaturbate.com",
  "stripchat.com",
  "manyvids.com",
  "youporn.com",
  "redtube.com",
  "brazzers.com",
  "spankbang.com",
];

const NSFW_PATH_RE = /(?:^|\/)(?:porn|xxx|nsfw|onlyfans|fansly)(?:\/|$)/i;
const SEXUAL_COPY_RE =
  /\b(porn|porno|xxx|nsfw|onlyfans|fansly|nude|nudes|naked|hentai|escort|camgirl|cam girls|sex tape|erotic|blowjob|handjob|anal|cumshot|fetish|sexual)\b/i;
const URL_INPUT_CONTROL_RE = /[\s\\\u0000-\u001f\u007f-\u009f]/u;
const URL_SCHEME_RE = /^([a-z][a-z\d+.-]*):/i;
const BARE_AUTHORITY_RE =
  /^(?:(?:(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.?|(?:\d{1,3}\.){3}\d{1,3}|localhost|\[[^\]]+\])(?::\d+)?(?:[/?#].*)?)$/i;

export function isTrackingQueryKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (lower.startsWith("utm_")) {
    return true;
  }
  if (lower.startsWith("ref_")) {
    return true;
  }
  return TRACKING_KEYS.has(lower);
}

/** Strip tracking, drop fragment, reject chat / NSFW / non-https. Clicks use this URL. */
export function canonicalizeProductUrl(raw: string): string {
  const trimmed = raw.trim();
  const candidate = productUrlCandidate(trimmed);
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new UrlError("invalid_url", "product URL must be a valid https URL");
  }
  if (url.protocol !== "https:") {
    throw new UrlError("invalid_url", "product URL must be https");
  }
  if (url.username !== "" || url.password !== "") {
    throw new UrlError("invalid_url", "product URL must not include credentials");
  }

  // DNS treats a trailing root label as equivalent, so normalize every
  // trailing dot before denylist checks and before storing the identity. This
  // prevents `t.me.`, `t.me..`, and subdomain variants from bypassing policy.
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "") {
    throw new UrlError("invalid_url", "product URL must be a valid https URL");
  }
  if (isBlockedLocalHost(host)) {
    throw new UrlError("invalid_url", "product URL must not be a local host");
  }
  if (hostMatchesAny(host, SHORTENER_HOSTS)) {
    throw new UrlError("shortener_forbidden", "shortener URLs are not allowed");
  }
  if (hostMatchesAny(host, CHAT_HOSTS)) {
    throw new UrlError("chat_forbidden", "chat and invite links are not allowed");
  }
  if (hostMatchesAny(host, NSFW_HOSTS) || NSFW_PATH_RE.test(url.pathname)) {
    throw new UrlError("nsfw_forbidden", "adult URLs are not allowed");
  }

  url.hash = "";
  url.hostname = host;
  if (url.port === "443") {
    url.port = "";
  }

  const queryKeys = [...url.searchParams.keys()];
  const hadQuery = queryKeys.length > 0;
  const allQueryWasTracking = hadQuery && queryKeys.every((key) => isTrackingQueryKey(key));
  for (const key of queryKeys) {
    if (isTrackingQueryKey(key)) {
      url.searchParams.delete(key);
    }
  }
  if (isPathKeyedHost(host)) {
    url.search = "";
  }
  if (url.searchParams.size === 0) {
    url.search = "";
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  const path = url.pathname === "" ? "/" : url.pathname;
  if (path === "/" && url.search === "" && allQueryWasTracking) {
    throw new UrlError("invalid_url", "product URL must identify a product after stripping tracking");
  }
  return url.toString();
}

function productUrlCandidate(trimmed: string): string {
  // WHATWG URL parsing discards ASCII whitespace and treats backslashes as
  // slashes for special schemes. Reject those characters before parsing so
  // an obfuscated unsafe scheme cannot become an apparently safe HTTPS host.
  if (URL_INPUT_CONTROL_RE.test(trimmed)) {
    throw new UrlError("invalid_url", "product URL must be a valid https URL");
  }

  // A leading slash without an authority is a path, not a product URL. The
  // only accepted slash-prefixed form is an exact protocol-relative authority;
  // reject `///host` before URL normalisation turns it into `//host`.
  if (trimmed.startsWith("/")) {
    if (!trimmed.startsWith("//") || trimmed.startsWith("///")) {
      throw new UrlError("invalid_url", "product URL must be a valid https URL");
    }
    return `https:${trimmed}`;
  }

  // A dotted authority with an optional numeric port is a valid scheme-less
  // form (for example, hartevo.com:8443/jobs). Check it before the scheme
  // regex because WHATWG interprets the hostname's colon as a scheme marker.
  if (BARE_AUTHORITY_RE.test(trimmed)) {
    return `https://${trimmed}`;
  }

  const scheme = URL_SCHEME_RE.exec(trimmed);
  if (scheme) {
    if (scheme[1]!.toLowerCase() === "https") {
      const remainder = trimmed.slice(scheme[0].length);
      // Do not let WHATWG repair malformed HTTPS spellings such as
      // `https:example.com` or `https:///example.com` into a valid URL.
      if (!remainder.startsWith("//") || remainder.startsWith("///")) {
        throw new UrlError("invalid_url", "product URL must be a valid https URL");
      }
    }
    // Keep explicit schemes intact so the existing protocol check rejects
    // http:, javascript:, data:, and any other non-HTTPS scheme.
    return trimmed;
  }

  throw new UrlError("invalid_url", "product URL must be a valid https URL");
}

export function normalizeWhyTestThisToday(raw: string): string {
  const text = raw.trim();
  if (text.length < 8 || text.length > 140) {
    throw new UrlError("invalid_blurb", "why test this today must be 8–140 characters");
  }
  if (/[\r\n]/.test(text)) {
    throw new UrlError("invalid_blurb", "why test this today must be a single line");
  }
  if (SEXUAL_COPY_RE.test(text)) {
    throw new UrlError("nsfw_forbidden", "sexual content is not allowed");
  }
  return text;
}

function hostMatchesAny(hostname: string, listed: readonly string[]): boolean {
  return listed.some((candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`));
}

function isPathKeyedHost(hostname: string): boolean {
  return (
    hostname === "amazon.com" ||
    hostname.endsWith(".amazon.com") ||
    /^amazon\.[a-z.]+$/.test(hostname) ||
    hostname.endsWith(".myshopify.com") ||
    hostname === "apps.apple.com" ||
    hostname === "itunes.apple.com" ||
    hostname === "play.google.com"
  );
}

function isBlockedLocalHost(hostname: string): boolean {
  return isPrivateOrLocalHostname(hostname);
}
