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
    json: () => JSON.parse(payload),
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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
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
});
