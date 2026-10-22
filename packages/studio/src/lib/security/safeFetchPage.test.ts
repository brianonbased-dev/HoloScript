import * as http from 'http';
import type { AddressInfo } from 'net';
import { describe, expect, it, vi } from 'vitest';
import {
  checkUrl,
  fetchPageSafely,
  isBlockedAddress,
  pinnedRequest,
  UnsafeUrlError,
  type PinnedRequestFn,
  type PinnedResponse,
  type ResolveFn,
} from './safeFetchPage';

const publicDns: ResolveFn = async () => [{ address: '93.184.216.34', family: 4 }];

function resp(status: number, headers: Record<string, string>, body = ''): PinnedResponse {
  return {
    status,
    headers,
    body: (async function* () {
      if (body) yield Buffer.from(body);
    })(),
    destroy: () => {},
  };
}

async function reason(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof UnsafeUrlError) return err.reason;
    throw err;
  }
  return 'allowed';
}

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::1', '::', 'fd00:ec2::254', 'fc00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe',
    '::ffff:0:7f00:1', '::127.0.0.1', '64:ff9b::a00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', 'ff02::1', 'not-an-ip',
  ])('blocks %s', (a) => expect(isBlockedAddress(a)).toBe(true));

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '64:ff9b::808:808'])('allows %s', (a) =>
    expect(isBlockedAddress(a)).toBe(false)
  );
});

describe('checkUrl', () => {
  it.each(['file:///etc/passwd', 'gopher://x/', 'ftp://x/', 'data:text/plain,hi', 'javascript:alert(1)'])(
    'refuses scheme %s',
    async (u) => expect(await reason(checkUrl(u, publicDns))).toBe('scheme_not_allowed')
  );
  it('refuses credentials in the url', async () => {
    expect(await reason(checkUrl('https://u:p@example.com/', publicDns))).toBe('credentials_in_url');
  });
  it('refuses an invalid url', async () => {
    expect(await reason(checkUrl('not a url', publicDns))).toBe('invalid_url');
  });
  it('refuses a name that resolves to a private address', async () => {
    const r: ResolveFn = async () => [{ address: '10.0.0.5', family: 4 }];
    expect(await reason(checkUrl('https://internal.example/', r))).toBe('blocked_address');
  });
  it('refuses when any one of several addresses is private', async () => {
    const r: ResolveFn = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: 'fd00:ec2::254', family: 6 },
    ];
    expect(await reason(checkUrl('https://mixed.example/', r))).toBe('blocked_address');
  });
  it('refuses when DNS fails or returns nothing', async () => {
    expect(await reason(checkUrl('https://x.example/', async () => { throw new Error('ENOTFOUND'); }))).toBe('dns_failed');
    expect(await reason(checkUrl('https://x.example/', async () => []))).toBe('dns_failed');
  });
  it('uses a literal IP without DNS', async () => {
    const r = vi.fn(publicDns);
    expect(await reason(checkUrl('http://[::ffff:7f00:1]/', r))).toBe('blocked_address');
    expect(r).not.toHaveBeenCalled();
  });
  it('returns the checked address to pin', async () => {
    const c = await checkUrl('https://example.com/a', publicDns);
    expect(c.address).toBe('93.184.216.34');
    expect(c.family).toBe(4);
  });
});

describe('fetchPageSafely', () => {
  it('happy path: html to text with title, pinned to the checked address', async () => {
    const request = vi.fn<PinnedRequestFn>(async () =>
      resp(200, { 'content-type': 'text/html; charset=utf-8' }, '<title>T</title><script>x()</script><p>Hello &amp; bye</p>')
    );
    const page = await fetchPageSafely('https://example.com/', { resolve: publicDns, request });
    expect(page).toEqual({ url: 'https://example.com/', title: 'T', bodyText: 'T Hello & bye' });
    expect(request.mock.calls[0][0].address).toBe('93.184.216.34');
  });

  it('re-checks every redirect hop and refuses one to a private address', async () => {
    const request = vi.fn<PinnedRequestFn>(async () => resp(302, { location: 'http://169.254.169.254/latest/meta-data/' }));
    expect(await reason(fetchPageSafely('https://example.com/', { resolve: publicDns, request }))).toBe('blocked_address');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('re-resolves a redirect target name (DNS rebinding on the next hop is refused)', async () => {
    const resolve: ResolveFn = async (h) =>
      h === 'evil.example' ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '93.184.216.34', family: 4 }];
    const request = vi.fn<PinnedRequestFn>(async () => resp(301, { location: 'https://evil.example/' }));
    expect(await reason(fetchPageSafely('https://example.com/', { resolve, request }))).toBe('blocked_address');
  });

  it('caps redirects', async () => {
    const request = vi.fn<PinnedRequestFn>(async () => resp(302, { location: '/again' }));
    expect(await reason(fetchPageSafely('https://example.com/', { resolve: publicDns, request }))).toBe('too_many_redirects');
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('refuses a redirect to another scheme', async () => {
    const request = vi.fn<PinnedRequestFn>(async () => resp(302, { location: 'file:///etc/passwd' }));
    expect(await reason(fetchPageSafely('https://example.com/', { resolve: publicDns, request }))).toBe('scheme_not_allowed');
  });

  it('refuses non-2xx, wrong content types and oversized pages', async () => {
    const r = (res: PinnedResponse, maxBytes?: number) =>
      reason(fetchPageSafely('https://example.com/', { resolve: publicDns, request: async () => res, maxBytes }));
    expect(await r(resp(500, { 'content-type': 'text/html' }))).toBe('upstream_status');
    expect(await r(resp(200, { 'content-type': 'application/octet-stream' }, 'x'))).toBe('content_type');
    expect(await r(resp(200, { 'content-type': 'image/png' }, 'x'))).toBe('content_type');
    expect(await r(resp(200, { 'content-type': 'text/plain', 'content-length': '99999' }), 10)).toBe('too_large');
    expect(await r(resp(200, { 'content-type': 'text/plain' }, 'x'.repeat(50)), 10)).toBe('too_large');
  });

  it('times out', async () => {
    const request: PinnedRequestFn = (_t, signal) =>
      new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
    expect(await reason(fetchPageSafely('https://example.com/', { resolve: publicDns, request, timeoutMs: 20 }))).toBe('timeout');
  });
});

describe('pinnedRequest', () => {
  it('connects to the pinned address even though the hostname does not resolve', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`host=${req.headers.host};cookie=${req.headers.cookie ?? ''};auth=${req.headers.authorization ?? ''}`);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await pinnedRequest(
        { url: new URL(`http://pinned.invalid:${port}/p`), address: '127.0.0.1', family: 4 },
        new AbortController().signal
      );
      const chunks: Uint8Array[] = [];
      for await (const c of res.body) chunks.push(c);
      expect(res.status).toBe(200);
      expect(Buffer.concat(chunks).toString()).toBe(`host=pinned.invalid:${port};cookie=;auth=`);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});