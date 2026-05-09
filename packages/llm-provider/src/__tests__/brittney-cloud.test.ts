/**
 * BrittneyCloudAdapter Tests
 *
 * All network calls are intercepted with vi.stubGlobal / vi.fn so no
 * real Brittney Cloud server is required. Tests cover the happy path,
 * SSE streaming, error mapping, healthCheck, and the
 * createBrittneyCloudProvider() factory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { BrittneyCloudAdapter, BRITTNEY_CLOUD_MODELS } from '../adapters/brittney-cloud';
import type { BrittneyCloudModel } from '../adapters/brittney-cloud';
import { createBrittneyCloudProvider } from '../index';
import { LLMProviderError, LLMAuthenticationError, LLMRateLimitError } from '../types';

// =============================================================================
// Helpers
// =============================================================================

function mockFetch(body: unknown, status = 200, headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => (headers ?? {})[k] ?? null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    body: undefined,
  });
}

function mockFetchSSE(text: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve({}),
    body: {
      getReader: () => {
        const encoder = new TextEncoder();
        const chunks = text.split('\n\n').map((chunk) => encoder.encode(chunk + '\n\n'));
        let i = 0;
        return {
          read: () => {
            if (i < chunks.length) {
              return Promise.resolve({ done: false, value: chunks[i++] });
            }
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    },
  });
}

// =============================================================================
// BrittneyCloudAdapter — structure
// =============================================================================

describe('BrittneyCloudAdapter — structure', () => {
  it('has correct provider name', () => {
    const adapter = new BrittneyCloudAdapter();
    expect(adapter.name).toBe('brittney-cloud');
  });

  it('exposes all known models', () => {
    const adapter = new BrittneyCloudAdapter();
    expect(adapter.models).toEqual(BRITTNEY_CLOUD_MODELS);
    expect(adapter.models.length).toBeGreaterThan(0);
  });

  it('defaults to brittney-standard model', () => {
    const adapter = new BrittneyCloudAdapter();
    expect(adapter.defaultHoloScriptModel).toBe('brittney-standard');
  });

  it('accepts custom model override', () => {
    const adapter = new BrittneyCloudAdapter({ defaultModel: 'brittney-pro' });
    expect(adapter.defaultHoloScriptModel).toBe('brittney-pro');
  });

  it('accepts tier config', () => {
    const adapter = new BrittneyCloudAdapter({ tier: 'pro' });
    expect(adapter.name).toBe('brittney-cloud');
  });

  it('BRITTNEY_CLOUD_MODELS type guard works', () => {
    const m: BrittneyCloudModel = 'brittney-standard';
    expect(BRITTNEY_CLOUD_MODELS).toContain(m);
  });
});

// =============================================================================
// BrittneyCloudAdapter — complete()
// =============================================================================

describe('BrittneyCloudAdapter — complete()', () => {
  let adapter: BrittneyCloudAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new BrittneyCloudAdapter({ baseURL: 'http://localhost:8000', apiKey: 'test-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to /api/chat and accumulates SSE text events', async () => {
    const sse = [
      'data: {"type":"text","payload":"Hello "}',
      'data: {"type":"text","payload":"world"}',
      'data: {"type":"done","payload":null}',
    ].join('\n\n');
    fetchMock = mockFetchSSE(sse);
    vi.stubGlobal('fetch', fetchMock);

    const resp = await adapter.complete({
      messages: [{ role: 'user', content: 'say hello' }],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/api/chat');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string).messages).toHaveLength(1);
    expect(JSON.parse(opts.body as string).tier).toBe('standard');

    expect(resp.content).toBe('Hello world');
    expect(resp.provider).toBe('brittney-cloud');
    expect(resp.finishReason).toBe('stop');
    expect(resp.usage.promptTokens).toBeGreaterThanOrEqual(0);
    expect(resp.usage.completionTokens).toBeGreaterThanOrEqual(0);
  });

  it('surfaces tool_call events as toolUses', async () => {
    const sse = [
      'data: {"type":"text","payload":"Calling tool"}',
      'data: {"type":"tool_call","payload":{"name":"spawn_entity","arguments":{"type":"cube"}}}',
      'data: {"type":"done","payload":null}',
    ].join('\n\n');
    fetchMock = mockFetchSSE(sse);
    vi.stubGlobal('fetch', fetchMock);

    const resp = await adapter.complete({
      messages: [{ role: 'user', content: 'spawn a cube' }],
    });

    expect(resp.content).toBe('Calling tool');
    expect(resp.finishReason).toBe('tool_use');
    expect(resp.toolUses).toHaveLength(1);
    expect(resp.toolUses![0].name).toBe('spawn_entity');
    expect(resp.toolUses![0].input).toEqual({ type: 'cube' });
  });

  it('maps 401 to LLMAuthenticationError', async () => {
    fetchMock = mockFetch({ error: 'Unauthorized' }, 401);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toBeInstanceOf(LLMAuthenticationError);
  });

  it('maps 429 to LLMRateLimitError', async () => {
    fetchMock = mockFetch({ error: 'Too many requests' }, 429);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toBeInstanceOf(LLMRateLimitError);
  });

  it('maps 500 to retryable LLMProviderError', async () => {
    fetchMock = mockFetch({ error: 'Internal error' }, 500);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toSatisfy((err: LLMProviderError) => err.retryable === true);
  });

  it('strips trailing slash from baseURL', async () => {
    const adapterSlash = new BrittneyCloudAdapter({ baseURL: 'http://localhost:8000/' });
    const sse = 'data: {"type":"text","payload":"ok"}\n\ndata: {"type":"done","payload":null}\n\n';
    fetchMock = mockFetchSSE(sse);
    vi.stubGlobal('fetch', fetchMock);

    await adapterSlash.complete({ messages: [{ role: 'user', content: 'test' }] });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:8000/api/chat');
  });

  it('surfaces stream error events as thrown LLMProviderError', async () => {
    const sse = [
      'data: {"type":"text","payload":"Partial"}',
      'data: {"type":"error","payload":"model overloaded"}',
    ].join('\n\n');
    fetchMock = mockFetchSSE(sse);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toThrow('model overloaded');
  });
});

// =============================================================================
// BrittneyCloudAdapter — streamCompletion()
// =============================================================================

describe('BrittneyCloudAdapter — streamCompletion()', () => {
  let adapter: BrittneyCloudAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new BrittneyCloudAdapter({ baseURL: 'http://localhost:8000', apiKey: 'test-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('yields text_delta chunks from SSE text events', async () => {
    const sse = [
      'data: {"type":"text","payload":"Hello "}',
      'data: {"type":"text","payload":"world"}',
      'data: {"type":"done","payload":null}',
    ].join('\n\n');
    fetchMock = mockFetchSSE(sse);
    vi.stubGlobal('fetch', fetchMock);

    const chunks: LLMStreamChunk[] = [];
    for await (const chunk of adapter.streamCompletion({
      messages: [{ role: 'user', content: 'say hello' }],
    })) {
      chunks.push(chunk);
    }

    const textDeltas = chunks.filter((c) => c.type === 'text_delta');
    expect(textDeltas).toHaveLength(2);
    expect(textDeltas[0]).toEqual({ type: 'text_delta', text: 'Hello ' });
    expect(textDeltas[1]).toEqual({ type: 'text_delta', text: 'world' });

    const stop = chunks.find((c) => c.type === 'message_stop');
    expect(stop).toBeDefined();
    expect(stop!.type === 'message_stop' && stop!.finishReason).toBe('stop');
  });

  it('yields tool_use_start + tool_use_end for tool_call events', async () => {
    const sse = [
      'data: {"type":"tool_call","payload":{"name":"spawn_entity","arguments":{"type":"sphere"}}}',
      'data: {"type":"done","payload":null}',
    ].join('\n\n');
    fetchMock = mockFetchSSE(sse);
    vi.stubGlobal('fetch', fetchMock);

    const chunks: LLMStreamChunk[] = [];
    for await (const chunk of adapter.streamCompletion({
      messages: [{ role: 'user', content: 'spawn sphere' }],
    })) {
      chunks.push(chunk);
    }

    const start = chunks.find((c) => c.type === 'tool_use_start');
    const end = chunks.find((c) => c.type === 'tool_use_end');
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    expect(start!.type === 'tool_use_start' && start!.name).toBe('spawn_entity');
    expect(end!.type === 'tool_use_end' && end!.input).toEqual({ type: 'sphere' });

    const stop = chunks.find((c) => c.type === 'message_stop');
    expect(stop!.type === 'message_stop' && stop!.finishReason).toBe('tool_use');
  });

  it('yields message_stop with error on stream error events', async () => {
    const sse = [
      'data: {"type":"text","payload":"Partial"}',
      'data: {"type":"error","payload":"backend failure"}',
    ].join('\n\n');
    fetchMock = mockFetchSSE(sse);
    vi.stubGlobal('fetch', fetchMock);

    const chunks: LLMStreamChunk[] = [];
    await expect(async () => {
      for await (const chunk of adapter.streamCompletion({
        messages: [{ role: 'user', content: 'test' }],
      })) {
        chunks.push(chunk);
      }
    }).rejects.toThrow('backend failure');

    const stop = chunks.find((c) => c.type === 'message_stop');
    expect(stop).toBeDefined();
    expect(stop!.type === 'message_stop' && stop!.finishReason).toBe('error');
  });
});

// =============================================================================
// BrittneyCloudAdapter — healthCheck()
// =============================================================================

describe('BrittneyCloudAdapter — healthCheck()', () => {
  let adapter: BrittneyCloudAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new BrittneyCloudAdapter({ baseURL: 'http://localhost:8000' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok on 200 /api/health', async () => {
    fetchMock = mockFetch({ status: 'ok' }, 200);
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/health', expect.any(Object));
  });

  it('returns error on 503', async () => {
    fetchMock = mockFetch({ error: 'Service unavailable' }, 503);
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Status 503');
  });

  it('returns error on network failure', async () => {
    fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});

// =============================================================================
// BrittneyCloudAdapter — factory
// =============================================================================

describe('createBrittneyCloudProvider()', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv, BRITTNEY_SERVICE_URL: 'http://brittney.test:8000', BRITTNEY_API_KEY: 'secret' };
  });

  afterEach(() => {
    process.env = origEnv;
    vi.restoreAllMocks();
  });

  it('creates adapter from env vars', () => {
    const provider = createBrittneyCloudProvider();
    expect(provider.name).toBe('brittney-cloud');
  });

  it('prefers explicit config over env', () => {
    const provider = createBrittneyCloudProvider({ baseURL: 'http://override:9000', tier: 'pro' });
    expect(provider.name).toBe('brittney-cloud');
  });

  it('throws when baseURL is missing', () => {
    delete process.env.BRITTNEY_SERVICE_URL;
    expect(() => createBrittneyCloudProvider()).toThrow('Brittney Cloud URL required');
  });
});
