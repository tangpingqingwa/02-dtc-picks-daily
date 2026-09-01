import { isIP } from "node:net";

/**
 * Return true for hostnames that must never be used as a public callback,
 * provider origin, or outbound product destination. URL.hostname keeps IPv6
 * brackets, so normalize those before parsing. IPv4-mapped IPv6 addresses are
 * reduced to their IPv4 address before applying the private-range checks.
 */
export function isPrivateOrLocalHostname(
  hostname: string,
  options: { rejectReservedHostnames?: boolean } = {},
): boolean {
  const rejectReservedHostnames = options.rejectReservedHostnames ?? false;
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  if (
    normalized === "" ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    (rejectReservedHostnames && isReservedDnsName(normalized)) ||
    normalized.includes("%")
  ) {
    return true;
  }

  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return false;

  const words = parseIpv6(normalized);
  if (!words) return true;
  if (words.every((word) => word === 0)) return true;
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;

  // fc00::/7 (unique local) and fe80::/10 (link local).
  if ((words[0]! & 0xfe00) === 0xfc00) return true;
  if ((words[0]! & 0xffc0) === 0xfe80) return true;
  if ((words[0]! & 0xffc0) === 0xfec0) return true; // deprecated site-local

  // ::ffff:0:0/96 carries an IPv4 address in the final 32 bits.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return isPrivateIpv4(`${words[6]! >>> 8}.${words[6]! & 0xff}.${words[7]! >>> 8}.${words[7]! & 0xff}`);
  }
  // IPv4-compatible IPv6 addresses are obsolete special-use values. Treat
  // them as their embedded address rather than allowing a private/multicast
  // endpoint through a syntactic IPv6 spelling.
  if (words.slice(0, 6).every((word) => word === 0)) {
    return true;
  }
  // Special-use IPv6 blocks: unspecified/loopback were handled above;
  // these cover link-local, multicast, documentation, benchmarking,
  // transition, discard-only, and other non-public allocations.
  if (
    hasIpv6Prefix(words, [0xff00], 8) || // multicast
    hasIpv6Prefix(words, [0x64ff, 0x9b00, 0, 0, 0, 0], 96) || // NAT64 well-known
    hasIpv6Prefix(words, [0x64ff, 0x9b00, 0x0001], 48) || // NAT64 local-use
    hasIpv6Prefix(words, [0x2001, 0x0db8], 32) || // documentation
    hasIpv6Prefix(words, [0x2001, 0x0002, 0x0000], 48) || // benchmarking
    hasIpv6Prefix(words, [0x2001, 0x0003], 32) || // AMT
    hasIpv6Prefix(words, [0x2001, 0x0004, 0x0112], 48) || // AS112
    hasIpv6Prefix(words, [0x2001, 0x0010], 28) || // ORCHID
    hasIpv6Prefix(words, [0x2001, 0x0020], 28) || // ORCHIDv2
    hasIpv6Prefix(words, [0x2001, 0x0000], 32) || // Teredo
    hasIpv6Prefix(words, [0x0100, 0x0000, 0x0000, 0x0000], 64) || // discard-only 100::/64
    hasIpv6Prefix(words, [0x3fff, 0x0000], 20) || // documentation 3fff::/20
    hasIpv6Prefix(words, [0x2002], 16) // 6to4 transition space
  ) {
    return true;
  }
  return false;
}

function isPrivateIpv4(value: string): boolean {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 0 || b === 2 || b === 88 || b === 168)) ||
    (a === 192 && b === 31 && c === 196) ||
    (a === 192 && b === 52 && c === 193) ||
    (a === 192 && b === 175 && c === 48) ||
    (a === 198 && (b! >= 18 && b! <= 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isReservedDnsName(value: string): boolean {
  return ["example", "test", "invalid", "localhost", "local", "home.arpa", "onion"].some(
    (suffix) => value === suffix || value.endsWith(`.${suffix}`),
  );
}

function hasIpv6Prefix(words: readonly number[], prefix: readonly number[], bits: number): boolean {
  const fullWords = Math.floor(bits / 16);
  for (let index = 0; index < fullWords; index += 1) {
    if (words[index] !== prefix[index]) return false;
  }
  const remainingBits = bits % 16;
  if (remainingBits === 0) return true;
  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return (words[fullWords]! & mask) === (prefix[fullWords]! & mask);
}

function parseIpv6(value: string): number[] | undefined {
  const sections = value.split("::");
  if (sections.length > 2) return undefined;
  const left = sections[0] ? sections[0].split(":") : [];
  const right = sections.length === 2 && sections[1] ? sections[1].split(":") : [];
  const leftWords = expandIpv6Parts(left);
  const rightWords = expandIpv6Parts(right);
  if (!leftWords || !rightWords) return undefined;
  if (sections.length === 1) {
    return leftWords.length === 8 ? leftWords : undefined;
  }
  const missing = 8 - leftWords.length - rightWords.length;
  if (missing < 1) return undefined;
  return [...leftWords, ...Array.from({ length: missing }, () => 0), ...rightWords];
}

function expandIpv6Parts(parts: string[]): number[] | undefined {
  const words: number[] = [];
  for (const part of parts) {
    if (part.includes(".")) {
      const octets = part.split(".").map(Number);
      if (
        octets.length !== 4 ||
        octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
      ) {
        return undefined;
      }
      words.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return undefined;
    words.push(Number.parseInt(part, 16));
  }
  return words;
}
