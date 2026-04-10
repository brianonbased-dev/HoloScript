import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpClientHandler } from '../HttpClientTrait';
import type { HttpClientConfig } from '../HttpClientTrait';

function makeCtx(overrides: Record<string, unknown> = {}) {
  const events: Array<{ type: string; payload: unknown }> = [];
  return {
    emit: (type: string, payload: unknown) => {
      events.push({ type, payload });
    },
    events,
    byType: (type: string) => events.filter((event) => event.type === type),
    ...overrides,
  };
}

function defaultConfig(overrides: Partial<HttpClientConfig> = {}): HttpClientConfig {
  return {
    base_url: 'https://api.example.com',
    method: 'GET',
    headers: {},
    timeout_ms: 30000,
    response_type: 'json',
    include_credentials: false,
    ...overrides,
  };
}

async function waitForEventCount(
  ctx: ReturnType<typeof makeCtx>,
  type: string,
  expected: number,
  attempts = 20
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (ctx.byType(type).length >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('HttpClientTrait', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handles http:request and emits http:response', async () => {
    const node = {} as any;
    const ctx = makeCtx();
    const config = defaultConfig();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          forEach: (cb: (value: string, key: string) => void) =>
            cb('application/json', 'content-type'),
        },
        json: async () => ({ ok: true, id: 'abc' }),
        text: async () => JSON.stringify({ ok: true, id: 'abc' }),
      })
    );

    httpClientHandler.onAttach!(node, config, ctx as any);
    httpClientHandler.onEvent!(node, config, ctx as any, {
      type: 'http:request',
      payload: {
        requestId: 'req-1',
        path: '/status',
      },
    });

    await waitForEventCount(ctx, 'http:response', 1);

    const responses = ctx.byType('http:response');
    expect(responses.length).toBe(1);
    expect(responses[0].payload).toMatchObject({
      requestId: 'req-1',
      status: 200,
      ok: true,
      data: { ok: true, id: 'abc' },
    });
  });

  it('maps action:http_request success to action:result success', async () => {
    const node = {} as any;
    const ctx = makeCtx({
      hostCapabilities: {
        network: {
          fetch: vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            body: { value: 42 },
            headers: { 'content-type': 'application/json' },
          }),
        },
      },
    });
    const config = defaultConfig();

    httpClientHandler.onAttach!(node, config, ctx as any);
    httpClientHandler.onEvent!(node, config, ctx as any, {
      type: 'action:http_request',
      payload: {
        requestId: 'bt-req-1',
        params: {
          path: '/compute',
          method: 'POST',
          body: { input: 10 },
        },
      },
    });

    await waitForEventCount(ctx, 'action:result', 1);

    const actionResults = ctx.byType('action:result');
    expect(actionResults.length).toBe(1);
    expect(actionResults[0].payload).toMatchObject({
      requestId: 'bt-req-1',
      status: 'success',
      success: true,
      output: { value: 42 },
    });
  });

  it('maps action:http_request failures to action:result failure', async () => {
    const node = {} as any;
    const ctx = makeCtx({
      hostCapabilities: {
        network: {
          fetch: vi.fn().mockResolvedValue({
            ok: false,
            status: 502,
            body: { message: 'bad gateway' },
            headers: { 'content-type': 'application/json' },
          }),
        },
      },
    });
    const config = defaultConfig();

    httpClientHandler.onAttach!(node, config, ctx as any);
    httpClientHandler.onEvent!(node, config, ctx as any, {
      type: 'action:http_request',
      payload: {
        requestId: 'bt-req-2',
        params: {
          path: '/failing',
        },
      },
    });

    await waitForEventCount(ctx, 'action:result', 1);

    const actionResults = ctx.byType('action:result');
    expect(actionResults.length).toBe(1);
    expect(actionResults[0].payload).toMatchObject({
      requestId: 'bt-req-2',
      status: 'failure',
      success: false,
      error: 'HTTP 502',
    });

    const httpErrors = ctx.byType('http:error');
    expect(httpErrors.length).toBe(1);
  });
});
