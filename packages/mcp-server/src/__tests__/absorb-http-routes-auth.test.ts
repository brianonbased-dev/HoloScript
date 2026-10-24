import { Readable } from 'stream';
import type http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleAbsorbRoute } from '../absorb/http-routes';

function makeReq(method: string, headers: http.IncomingHttpHeaders = {}, body = '') {
  const req = Readable.from(body ? [Buffer.from(body)] : []) as http.IncomingMessage;
  req.method = method;
  req.headers = headers;
  return req;
}

function makeRes() {
  let status = 0;
  let payload = '';
  const res = {
    writeHead: vi.fn((code: number) => {
      status = code;
      return res;
    }),
    end: vi.fn((chunk?: unknown) => {
      payload += typeof chunk === 'string' ? chunk : chunk ? String(chunk) : '';
      return res;
    }),
  } as unknown as http.ServerResponse;

  return {
    res,
    status: () => status,
    json: () => {
      try {
        return JSON.parse(payload);
      } catch (error) {
        throw new Error(`Invalid JSON test payload: ${String(error)}`);
      }
    },
  };
}

describe('absorb HTTP proxy auth boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not lend the server absorb key to anonymous callers', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = makeRes();

    const handled = await handleAbsorbRoute(
      makeReq('GET'),
      out.res,
      '/api/absorb/knowledge/earnings'
    );

    expect(handled).toBe(true);
    expect(out.status()).toBe(401);
    expect(out.json()).toMatchObject({ error: 'missing_absorb_proxy_auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the caller Authorization header to absorb-service', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = makeRes();

    const handled = await handleAbsorbRoute(
      makeReq('GET', { authorization: 'Bearer caller-token' }),
      out.res,
      '/api/absorb/knowledge/earnings'
    );

    expect(handled).toBe(true);
    expect(out.status()).toBe(200);
    expect(out.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://absorb.holoscript.net/api/knowledge/earnings',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer caller-token' }),
      })
    );
  });

  it('accepts x-api-key as an explicit caller credential', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = makeRes();

    const handled = await handleAbsorbRoute(
      makeReq('GET', { 'x-api-key': 'caller-key' }),
      out.res,
      '/api/absorb/knowledge/earnings'
    );

    expect(handled).toBe(true);
    expect(out.status()).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://absorb.holoscript.net/api/knowledge/earnings',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer caller-key' }),
      })
    );
  });
  describe('service keys', () => {
    const prev = {
      ABSORB_API_KEY: process.env.ABSORB_API_KEY,
      HOLOSCRIPT_API_KEY: process.env.HOLOSCRIPT_API_KEY,
      ABSORB_PROXY_SERVICE_KEY_FALLBACK: process.env.ABSORB_PROXY_SERVICE_KEY_FALLBACK,
    };
    afterEach(() => {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    it('refuses the absorb service key presented as a Bearer token with 401, no fetch', async () => {
      process.env.ABSORB_API_KEY = 'svc-absorb-test';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const out = makeRes();
      await handleAbsorbRoute(
        makeReq('GET', { authorization: 'Bearer svc-absorb-test' }),
        out.res,
        '/api/absorb/knowledge/earnings'
      );
      expect(out.status()).toBe(401);
      expect(out.json()).toMatchObject({ error: 'absorb_service_key_refused' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses the HoloScript service key presented as x-api-key with 401, no fetch', async () => {
      process.env.HOLOSCRIPT_API_KEY = 'svc-holo-test';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const out = makeRes();
      await handleAbsorbRoute(
        makeReq('POST', { 'x-api-key': 'svc-holo-test' }, '{}'),
        out.res,
        '/api/absorb/knowledge/publish'
      );
      expect(out.status()).toBe(401);
      expect(out.json()).toMatchObject({ error: 'absorb_service_key_refused' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never falls back to the server key, even with the old opt-in flag set', async () => {
      process.env.ABSORB_API_KEY = 'svc-absorb-test';
      process.env.ABSORB_PROXY_SERVICE_KEY_FALLBACK = 'true';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const out = makeRes();
      await handleAbsorbRoute(makeReq('GET'), out.res, '/api/absorb/knowledge/earnings');
      expect(out.status()).toBe(401);
      expect(out.json()).toMatchObject({ error: 'missing_absorb_proxy_auth' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still forwards a user credential when service keys are configured', async () => {
      process.env.ABSORB_API_KEY = 'svc-absorb-test';
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
      vi.stubGlobal('fetch', fetchMock);
      const out = makeRes();
      await handleAbsorbRoute(
        makeReq('GET', { authorization: 'Bearer user-token' }),
        out.res,
        '/api/absorb/knowledge/earnings'
      );
      expect(out.status()).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer user-token' }),
        })
      );
    });
  });
});
