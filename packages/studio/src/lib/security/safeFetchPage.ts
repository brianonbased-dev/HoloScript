/**
 * SSRF-safe single-page fetch for caller-supplied URLs.
 *
 * - Only http: and https:, no credentials in the URL.
 * - Every address the host resolves to is checked; one blocked address refuses
 *   the URL (private, loopback, link-local incl. cloud metadata, CGNAT,
 *   unique-local IPv6, multicast/reserved, and IPv4-mapped/compatible/NAT64
 *   forms of any of these).
 * - The connection goes to the address that was checked (pinned through the
 *   socket `lookup`), so a DNS answer cannot change between check and connect.
 * - Redirects are followed by hand, at most MAX_REDIRECTS, and every hop gets
 *   the full check again.
 * - No cookies or credentials are sent. Body size, time and content type are
 *   capped.
 */
import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';

export const MAX_REDIRECTS = 3;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const PAGE_TIMEOUT_MS = 15_000;

export class UnsafeUrlError extends Error {
  constructor(
    message: string,
    readonly reason:
      | 'invalid_url'
      | 'scheme_not_allowed'
      | 'credentials_in_url'
      | 'blocked_address'
      | 'dns_failed'
      | 'too_many_redirects'
      | 'bad_redirect'
      | 'upstream_status'
      | 'content_type'
      | 'too_large'
      | 'timeout'
  ) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, incl. 169.254.169.254 metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4], // reserved, incl. 255.255.255.255
] as const) {
  blocked.addSubnet(addr, prefix, 'ipv4');
}
for (const [addr, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds an IPv4 address)
  ['fc00::', 7], // unique-local, incl. fd00:ec2::254 metadata
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(addr, prefix, 'ipv6');
}

/** The IPv4 address embedded in an IPv4-mapped, -compatible or NAT64 IPv6 address. */
function embeddedIpv4(ipv6: string): string | null {
  const groups = expandIpv6(ipv6);
  if (!groups) return null;
  const tail = `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  const zeroTo = (n: number) => groups.slice(0, n).every((g) => g === 0);
  if (zeroTo(5) && groups[5] === 0xffff) return tail; // ::ffff:a.b.c.d
  if (zeroTo(4) && groups[4] === 0xffff && groups[5] === 0) return tail; // ::ffff:0:a.b.c.d
  if (zeroTo(6)) return tail; // ::a.b.c.d (compatible)
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return tail; // 64:ff9b::/96 NAT64
  }
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups[2] === 1) return tail; // 64:ff9b:1::/48
  return null;
}

function expandIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  // A trailing dotted IPv4 becomes two hex groups.
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const p = dotted[2].split('.').map(Number);
    if (p.some((n) => n > 255)) return null;
    s = `${dotted[1]}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const nums = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.length === 8 && nums.every((n) => !Number.isNaN(n)) ? nums : null;
}

/** True when the address must never be fetched. Unparseable input is blocked. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '');
  const family = net.isIP(ip.split('%')[0]);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family === 6) {
    const v4 = embeddedIpv4(ip);
    if (v4 !== null) return isBlockedAddress(v4);
    try {
      return blocked.check(ip.split('%')[0], 'ipv6');
    } catch {
      return true;
    }
  }
  return true;
}

export type ResolveFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultResolve: ResolveFn = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

export interface CheckedUrl {
  url: URL;
  address: string;
  family: 4 | 6;
}

/** Parse and check one URL; resolves the host and checks every address. */
export async function checkUrl(raw: string | URL, resolve: ResolveFn = defaultResolve): Promise<CheckedUrl> {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new UnsafeUrlError('The URL is not valid.', 'invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed.', 'scheme_not_allowed');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('URLs with credentials are not allowed.', 'credentials_in_url');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new UnsafeUrlError('The URL has no host.', 'invalid_url');

  let addresses: Array<{ address: string; family: number }>;
  if (net.isIP(host)) {
    addresses = [{ address: host, family: net.isIP(host) }];
  } else {
    try {
      addresses = await resolve(host);
    } catch {
      throw new UnsafeUrlError('The host could not be resolved.', 'dns_failed');
    }
  }
  if (!addresses.length) throw new UnsafeUrlError('The host could not be resolved.', 'dns_failed');
  if (addresses.some((a) => isBlockedAddress(a.address))) {
    throw new UnsafeUrlError('The URL points to a private or reserved address.', 'blocked_address');
  }
  const first = addresses[0];
  return { url, address: first.address, family: first.family === 6 ? 6 : 4 };
}

export interface PinnedResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}

export type PinnedRequestFn = (target: CheckedUrl, signal: AbortSignal) => Promise<PinnedResponse>;

/** GET `target.url`, connecting only to `target.address` (pinned). No cookies or credentials. */
export const pinnedRequest: PinnedRequestFn = (target, signal) =>
  new Promise((resolvePromise, reject) => {
    const mod = target.url.protocol === 'https:' ? https : http;
    const req = mod.request(
      target.url,
      {
        method: 'GET',
        signal,
        headers: { Accept: 'text/html, text/plain, text/markdown;q=0.9', 'User-Agent': 'HoloScript-Studio-Knowledge/1' },
        // Pin: whatever name the socket looks up, it gets the checked address.
        lookup: (_hostname, options, cb) => {
          const opts = options as { all?: boolean };
          if (opts && opts.all) {
            (cb as unknown as (e: null, a: Array<{ address: string; family: number }>) => void)(null, [
              { address: target.address, family: target.family },
            ]);
          } else {
            cb(null, target.address, target.family);
          }
        },
      },
      (res) =>
        resolvePromise({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: res,
          destroy: () => res.destroy(),
        })
    );
    req.on('error', reject);
    req.end();
  });

export interface FetchedPage {
  url: string;
  title?: string;
  bodyText: string;
}

const TEXT_TYPES = /^(text\/(html|plain|markdown)|application\/xhtml\+xml)\b/i;

function header(h: PinnedResponse['headers'], name: string): string | undefined {
  const v = h[name];
  return Array.isArray(v) ? v[0] : v;
}

function htmlToText(html: string): { title?: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const text = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: title || undefined, text };
}

/**
 * Fetch one caller-supplied page safely and return its text. Throws
 * UnsafeUrlError for every refusal.
 */
export async function fetchPageSafely(
  raw: string,
  opts: {
    resolve?: ResolveFn;
    request?: PinnedRequestFn;
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
  } = {}
): Promise<FetchedPage> {
  const resolve = opts.resolve ?? defaultResolve;
  const request = opts.request ?? pinnedRequest;
  const maxBytes = opts.maxBytes ?? MAX_PAGE_BYTES;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? PAGE_TIMEOUT_MS);
  try {
    let current: string | URL = raw;
    for (let hop = 0; ; hop++) {
      const target = await checkUrl(current, resolve);
      let res: PinnedResponse;
      try {
        res = await request(target, controller.signal);
      } catch {
        if (controller.signal.aborted) throw new UnsafeUrlError('The page took too long.', 'timeout');
        throw new UnsafeUrlError('The page could not be fetched.', 'upstream_status');
      }
      if (res.status >= 300 && res.status < 400) {
        res.destroy();
        const location = header(res.headers, 'location');
        if (!location) throw new UnsafeUrlError('A redirect had no location.', 'bad_redirect');
        if (hop >= maxRedirects) throw new UnsafeUrlError('Too many redirects.', 'too_many_redirects');
        try {
          current = new URL(location, target.url);
        } catch {
          throw new UnsafeUrlError('A redirect location is not valid.', 'bad_redirect');
        }
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        res.destroy();
        throw new UnsafeUrlError(`The page answered ${res.status}.`, 'upstream_status');
      }
      const type = header(res.headers, 'content-type') ?? '';
      if (!TEXT_TYPES.test(type)) {
        res.destroy();
        throw new UnsafeUrlError('Only HTML, plain text or markdown pages are allowed.', 'content_type');
      }
      const declared = Number(header(res.headers, 'content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy();
        throw new UnsafeUrlError('The page is too large.', 'too_large');
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for await (const chunk of res.body) {
          size += chunk.byteLength;
          if (size > maxBytes) {
            res.destroy();
            throw new UnsafeUrlError('The page is too large.', 'too_large');
          }
          chunks.push(chunk);
        }
      } catch (err) {
        if (err instanceof UnsafeUrlError) throw err;
        if (controller.signal.aborted) throw new UnsafeUrlError('The page took too long.', 'timeout');
        throw new UnsafeUrlError('The page could not be read.', 'upstream_status');
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (/html/i.test(type)) {
        const page = htmlToText(text);
        return { url: target.url.toString(), title: page.title, bodyText: page.text };
      }
      return { url: target.url.toString(), bodyText: text };
    }
  } finally {
    clearTimeout(timer);
  }
}