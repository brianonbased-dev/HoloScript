/**
 * Outbound URL guard: stop a server-side fetch from reaching this host's own network.
 *
 * A tool that fetches a caller-supplied URL (holo_reconstruct_from_video fetches a video and
 * reports its size and sha256) lets any caller who may run the tool make THIS server request
 * an address the caller cannot reach: localhost ports, private-network neighbours such as
 * Railway's *.railway.internal services, link-local metadata endpoints. Even without the
 * body, "exists, this size, this hash" is a probe (task_1790594666743_g1lo).
 *
 * The guard resolves the host and refuses when ANY resolved address is not public, and it
 * re-checks every redirect hop, because a public URL can answer 302 to a private one.
 *
 * Known limit: the check resolves the name, then fetch resolves it again to connect, so a
 * DNS server that answers public first and private second (DNS rebinding) can slip between
 * the two. Pinning the checked address into the connection would close that; this guard
 * does not.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Resolves a host name to every address it answers with. Injectable for tests. */
export type LookupAll = (host: string) => Promise<string[]>;

export interface OutboundGuardOptions {
  lookupAll?: LookupAll;
  /** Test seam: decides whether an address may be reached. Defaults to "public only". */
  isAllowedAddress?: (address: string, host: string) => boolean;
  /** Redirect hops to follow, each re-checked. Default 5. */
  maxRedirects?: number;
}

const defaultLookupAll: LookupAll = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
}

/** Same /bits prefix? Division, not &, because JS bitwise operators are signed 32-bit. */
function inV4(ip: string, base: string, bits: number): boolean {
  const size = 2 ** (32 - bits);
  return Math.floor(ipv4ToNumber(ip) / size) === Math.floor(ipv4ToNumber(base) / size);
}

/** The eight 16-bit groups of an IPv6 literal (a trailing dotted IPv4 becomes two groups). */
function expandV6(ip: string): number[] | null {
  let s = ip;
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const n = ipv4ToNumber(dotted[1]);
    s = `${s.slice(0, -dotted[1].length)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  return groups.length === 8 ? groups.map((g) => parseInt(g || '0', 16)) : null;
}

const NON_PUBLIC_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // RFC 1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
];

/** True when an IP literal is loopback, private, link-local or otherwise not on the public internet. */
export function isNonPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  const version = isIP(ip);
  if (version === 4) return NON_PUBLIC_V4.some(([base, bits]) => inV4(ip, base, bits));
  if (version !== 6) return true; // not an address at all: refuse rather than guess
  const g = expandV6(ip);
  if (!g) return true;
  // ::/96 holds ::, ::1 and the old IPv4-compatible form (::7f00:1): none is a public host.
  if (g.slice(0, 6).every((x) => x === 0)) return true;
  // An IPv4 address carried inside IPv6 is that IPv4 address: mapped ::ffff:0:0/96.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isNonPublicAddress(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  // NAT64 (64:ff9b::/96) and 6to4 (2002::/16) route to an embedded IPv4 address: refuse both.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return true;
  if (g[0] === 0x2002) return true;
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

const NON_PUBLIC_NAME = /(^localhost$|\.localhost$|\.local$|\.internal$|\.home\.arpa$)/i;

/**
 * Refuses a URL this server must not fetch for an ordinary caller: a scheme other than http or
 * https, a name that is local by definition, or a host that resolves to any non-public address.
 * Returns the parsed URL when it may be fetched.
 */
export async function assertPublicHttpUrl(
  raw: string,
  opts: OutboundGuardOptions = {}
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`refused: not an absolute URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`refused: only http and https may be fetched, not ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const allowed = opts.isAllowedAddress ?? ((address: string) => !isNonPublicAddress(address));
  // One message for every host refusal: saying "does not resolve" apart from "resolves to a
  // private address" would itself tell a caller which internal names exist.
  const refuse = (): never => {
    throw new Error(`refused: ${host} is not a public internet address`);
  };
  if (!opts.isAllowedAddress && NON_PUBLIC_NAME.test(host)) refuse();
  let addresses: string[] = [];
  try {
    addresses = isIP(host) ? [host] : await (opts.lookupAll ?? defaultLookupAll)(host);
  } catch {
    refuse();
  }
  if (addresses.length === 0) refuse();
  for (const address of addresses) {
    if (!allowed(address, host)) refuse();
  }
  return url;
}

/**
 * fetch() for a caller-supplied URL: checks the destination, follows redirects by hand and
 * checks each hop the same way, so a public URL cannot bounce the server onto a private one.
 */
export async function fetchPublicHttp(
  raw: string,
  init: RequestInit = {},
  opts: OutboundGuardOptions = {}
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicHttpUrl(current, opts);
    const res = await fetch(url, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {});
      current = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new Error(`refused: more than ${maxRedirects} redirects`);
}
