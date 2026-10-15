import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAbsorbHealth, getAbsorbHealthCached, resetAbsorbHealthCache } from './absorbHealth';

const ok = () => vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

describe('checkAbsorbHealth', () => {
  beforeEach(() => resetAbsorbHealthCache());

  it('ok when absorb /health answers 2xx; probes origin/health only', async () => {
    const f = ok();
    const h = await checkAbsorbHealth({ baseUrl: 'https://absorb.example/api', apiKeyConfigured: true, fetchImpl: f });
    expect(h).toMatchObject({ status: 'ok', degraded: false, origin: 'https://absorb.example', httpStatus: 200 });
    expect((f as any).mock.calls[0][0]).toBe('https://absorb.example/health');
    expect((f as any).mock.calls[0][1].headers).toBeUndefined(); // no key sent
  });

  it('misconfigured (no fetch) without a key or with a bad URL', async () => {
    const f = ok();
    expect(await checkAbsorbHealth({ baseUrl: 'https://absorb.example', apiKeyConfigured: false, fetchImpl: f })).toMatchObject({ status: 'misconfigured', degraded: true });
    expect(await checkAbsorbHealth({ baseUrl: '', apiKeyConfigured: true, fetchImpl: f })).toMatchObject({ status: 'misconfigured', degraded: true });
    expect(await checkAbsorbHealth({ baseUrl: 'ftp://x', apiKeyConfigured: true, fetchImpl: f })).toMatchObject({ status: 'misconfigured' });
    expect((f as any).mock.calls).toHaveLength(0);
  });

  it('unhealthy on non-2xx, unreachable on network error or timeout', async () => {
    const bad = vi.fn(async () => new Response('', { status: 502 })) as unknown as typeof fetch;
    expect(await checkAbsorbHealth({ baseUrl: 'https://a.x', apiKeyConfigured: true, fetchImpl: bad })).toMatchObject({ status: 'unhealthy', degraded: true, httpStatus: 502 });
    const down = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await checkAbsorbHealth({ baseUrl: 'https://a.x', apiKeyConfigured: true, fetchImpl: down })).toMatchObject({ status: 'unreachable', reason: 'connection failed' });
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch;
    const t0 = Date.now();
    expect(await checkAbsorbHealth({ baseUrl: 'https://a.x', apiKeyConfigured: true, fetchImpl: hang, timeoutMs: 50 })).toMatchObject({ status: 'unreachable', reason: 'timed out' });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('memoizes: concurrent and repeated calls inside the window share one probe', async () => {
    const f = ok();
    const o = { baseUrl: 'https://a.x', apiKeyConfigured: true, fetchImpl: f };
    await Promise.all([getAbsorbHealthCached(o, 1000), getAbsorbHealthCached(o, 1001), getAbsorbHealthCached(o, 10_000)]);
    expect((f as any).mock.calls).toHaveLength(1);
    await getAbsorbHealthCached(o, 20_000);
    expect((f as any).mock.calls).toHaveLength(2);
  });
});
