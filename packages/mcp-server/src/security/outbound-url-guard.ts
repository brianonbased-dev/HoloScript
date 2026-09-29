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
 * The connection is pinned to the check. Checking a name and then letting fetch() resolve it
 * again to connect leaves a gap: a DNS server that answers public to the first lookup and
 * private to the second (DNS rebinding) wins every time, with a zero TTL. So fetchPublicHttp
 * connects through a lookup that applies the same rule to the addresses the socket is about
 * to use, and refuses before connecting when any of them is not public.
 */
import { lookup } from 'node:dns/promises';
import { lookup as lookupWithCallback, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

/** Resolves a host name to every address it answers with. Injectable for tests. */
export type LookupAll = (host: string) => Promise<string[]>;

export interface OutboundGuardOptions {
  /** Used for the check AND for the connection, so a test can make the two answers differ. */
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

/** The IPv4 address held in the last two groups. */
function embeddedV4(g: number[]): string {
  return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
}

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
  // An IPv4 address carried inside IPv6 is that IPv4 address: mapped ::ffff:0:0/96, and the
  // translated form ::ffff:0:0:0/96 that SIIT translators route (::ffff:0:7f00:1 is loopback).
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isNonPublicAddress(embeddedV4(g));
  }
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) {
    return isNonPublicAddress(embeddedV4(g));
  }
  // NAT64, well-known 64:ff9b::/96 and local-use 64:ff9b:1::/48 (RFC 8215), 6to4 (2002::/16)
  // and Teredo (2001::/32) route to an embedded IPv4 address: refuse them all.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return true;
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true;
  if (g[0] === 0x2002) return true;
  if (g[0] === 0x2001 && g[1] === 0) return true;
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local, the old private range
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

const NON_PUBLIC_NAME = /(^localhost$|\.localhost$|\.local$|\.internal$|\.home\.arpa$)/i;

function refusal(host: string): Error {
  // One message for every host refusal: saying "does not resolve" apart from "resolves to a
  // private address" would itself tell a caller which internal names exist.
  return new Error(`refused: ${host} is not a public internet address`);
}

function allowedAddress(opts: OutboundGuardOptions): (address: string, host: string) => boolean {
  return opts.isAllowedAddress ?? ((address: string) => !isNonPublicAddress(address));
}

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
  const allowed = allowedAddress(opts);
  const refuse = (): never => {
    throw refusal(host);
  };
  // "localhost." is localhost: a fully qualified name ends in a dot the rule must not trip on.
  if (!opts.isAllowedAddress && NON_PUBLIC_NAME.test(host.replace(/\.+$/, ''))) refuse();
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
 * The lookup the socket itself connects through. It applies the check to the very addresses the
 * connection will use, so an answer that changed since assertPublicHttpUrl cannot slip past it.
 * An IP literal never reaches it: the socket connects to the literal assertPublicHttpUrl checked.
 */
function pinnedLookup(opts: OutboundGuardOptions): LookupFunction {
  const allowed = allowedAddress(opts);
  return (hostname, options, callback) => {
    const resolved: Promise<LookupAddress[]> = opts.lookupAll
      ? opts
          .lookupAll(hostname)
          .then((list) => list.map((address) => ({ address, family: isIP(address) })))
      : new Promise((resolve, reject) =>
          lookupWithCallback(hostname, { all: true, verbatim: true }, (err, list) =>
            err ? reject(err) : resolve(list)
          )
        );
    resolved.then(
      (list) => {
        if (list.length === 0 || list.some((entry) => !allowed(entry.address, hostname))) {
          callback(refusal(hostname), '');
        } else if (options.all) {
          callback(null, list);
        } else {
          callback(null, list[0].address, list[0].family);
        }
      },
      () => callback(refusal(hostname), '')
    );
  };
}

function toResponse(res: IncomingMessage, method: string): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(res.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  const status = res.statusCode ?? 0;
  const bodyless = method === 'HEAD' || status === 204 || status === 205 || status === 304;
  if (bodyless) res.resume();
  const body = bodyless ? null : (Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>);
  return new Response(body, { status, statusText: res.statusMessage, headers });
}

/** One request, no redirects followed, connected through pinnedLookup. */
function requestPinned(url: URL, init: RequestInit, opts: OutboundGuardOptions): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const body = init.body;
  if (body != null && typeof body !== 'string' && !(body instanceof Uint8Array)) {
    return Promise.reject(new Error('fetchPublicHttp: a request body must be a string or bytes'));
  }
  const headers = new Headers(init.headers);
  // fetch() would decompress a gzip body; this request does not, so ask for none.
  if (!headers.has('accept-encoding')) headers.set('accept-encoding', 'identity');
  const outgoing: Record<string, string> = {};
  headers.forEach((value, name) => {
    outgoing[name] = value;
  });
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        method,
        headers: outgoing,
        lookup: pinnedLookup(opts),
        agent: false,
        signal: init.signal ?? undefined,
      },
      (res) => {
        try {
          resolve(toResponse(res, method));
        } catch (e) {
          res.destroy();
          reject(e);
        }
      }
    );
    req.on('error', reject);
    req.end(body ?? undefined);
  });
}

/**
 * fetch() for a caller-supplied URL: checks the destination, connects only to addresses that
 * pass the same check, and follows redirects by hand, checking each hop the same way, so a
 * public URL cannot bounce the server onto a private one.
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
    const res = await requestPinned(url, init, opts);
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

/**
 * Who may point a server-side request at a non-public address: an operator (admin:* or
 * tools:admin), or, with no signing context at all, the stdio process the local user launched
 * (HOLOSCRIPT_MCP_TRANSPORT === 'stdio', which index.ts main() sets and http-server sets to
 * 'http'). A missing context alone proves nothing: on the hosted server a tool re-entered from
 * inside the server can arrive with none. `externalLane` marks a context-less call that came in
 * through a public lane (handleTool's subjectSourceOverride), which is never local.
 */
export function callerMayReachPrivateNetwork(
  signingCtx: { scopes?: readonly string[] } | undefined,
  opts: { externalLane?: boolean } = {}
): boolean {
  if (!signingCtx) {
    return !opts.externalLane && process.env.HOLOSCRIPT_MCP_TRANSPORT === 'stdio';
  }
  return (signingCtx.scopes ?? []).some((scope) => scope === 'admin:*' || scope === 'tools:admin');
}

/**
 * A response body as text, refused once it passes maxBytes: a caller-chosen server must not be
 * able to make this one buffer without limit.
 */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`refused: the response is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
