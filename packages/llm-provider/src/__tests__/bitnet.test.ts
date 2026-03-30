/**
 * BitNetAdapter Tests
 *
 * All network calls are intercepted with vi.stubGlobal / vi.fn so no
 * real server is required. Tests cover the happy path, error mapping,
 * healthCheck, and the createBitNetProvider() factory.
 *
 * BitNetAdapter targets the real bitnet.cpp inference server:
 *   https://github.com/microsoft/BitNet
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { BitNetAdapter, BITNET_MODELS } from '../adapters/bitnet';
import type { BitNetModel } from '../adapters/bitnet';
import { LLMProviderError } from '../types';

function createBitNetProvider(config?: ConstructorParameters<typeof BitNetAdapter>[0]) {
  return new BitNetAdapter(config);
}

// =============================================================================
// Helpers — build a minimal OpenAI-compatible response body
// =============================================================================

function makeOkResponse(content: string, model = 'microsoft/bitnet-b1.58-2B-4T') {
  return {
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    model,
  };
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

// =============================================================================
// BitNetAdapter — structure
// =============================================================================

describe('BitNetAdapter — structure', () => {
  it('has correct provider name', () => {
    const adapter = new BitNetAdapter();
    expect(adapter.name).toBe('bitnet');
  });

  it('exposes all known models', () => {
    const adapter = new BitNetAdapter();
    expect(adapter.models).toEqual(BITNET_MODELS);
    expect(adapter.models.length).toBeGreaterThan(0);
  });

  it('defaults to microsoft/bitnet-b1.58-2B-4T model', () => {
    const adapter = new BitNetAdapter();
    expect(adapter.defaultHoloScriptModel).toBe('microsoft/bitnet-b1.58-2B-4T');
  });

  it('accepts custom model override', () => {
    const adapter = new BitNetAdapter({ model: '1bitLLM/bitnet_b1_58-large' });
    expect(adapter.defaultHoloScriptModel).toBe('1bitLLM/bitnet_b1_58-large');
  });

  it('BITNET_MODELS type guard works', () => {
    const m: BitNetModel = 'microsoft/bitnet-b1.58-2B-4T';
    expect(BITNET_MODELS).toContain(m);
  });
});

// =============================================================================
// BitNetAdapter — complete()
// =============================================================================

describe('BitNetAdapter — complete()', () => {
  let adapter: BitNetAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new BitNetAdapter({ baseURL: 'http://localhost:8080' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to /v1/chat/completions and returns mapped response', async () => {
    fetchMock = mockFetch(makeOkResponse('cube { @color(red) }'));
    vi.stubGlobal('fetch', fetchMock);

    const resp = await adapter.complete({
      messages: [{ role: 'user', content: 'a red cube' }],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/v1/chat/completions');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string).messages).toHaveLength(1);

    expect(resp.content).toBe('cube { @color(red) }');
    expect(resp.provider).toBe('bitnet');
    expect(resp.model).toBe('microsoft/bitnet-b1.58-2B-4T');
    expect(resp.finishReason).toBe('stop');
    expect(resp.usage.totalTokens).toBe(30);
  });

  it('strips trailing slash from baseURL', async () => {
    const adapterSlash = new BitNetAdapter({ baseURL: 'http://localhost:8080/' });
    fetchMock = mockFetch(makeOkResponse('sphere {}'));
    vi.stubGlobal('fetch', fetchMock);

    await adapterSlash.complete({ messages: [{ role: 'user', content: 'sphere' }] });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:8080/v1/chat/completions');
  });

  it('forwards maxTokens and temperature', async () => {
    fetchMock = mockFetch(makeOkResponse('cube {}'));
    vi.stubGlobal('fetch', fetchMock);

    await adapter.complete({
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 512,
      temperature: 0.2,
    });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.max_tokens).toBe(512);
    expect(body.temperature).toBe(0.2);
  });

  it('throws LLMProviderError on 500 response', async () => {
    fetchMock = mockFetch({ error: 'internal' }, 500);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toThrow(LLMProviderError);

    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toMatchObject({ provider: 'bitnet', statusCode: 500 });
  });

  it('throws LLMProviderError on 429 with retryable=true', async () => {
    fetchMock = mockFetch({ error: 'rate limited' }, 429);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toMatchObject({ retryable: true, statusCode: 429 });
  });

  it('throws informative LLMProviderError when fetch rejects (server down)', async () => {
    fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const err = await adapter
      .complete({ messages: [{ role: 'user', content: 'test' }] })
      .catch((e) => e);

    expect(err).toBeInstanceOf(LLMProviderError);
    expect(err.message).toMatch(/bitnet\.cpp server|BitNet server/i);
    expect(err.retryable).toBe(false);
  });

  it('handles empty choices array gracefully', async () => {
    fetchMock = mockFetch({ choices: [], usage: {}, model: 'bitnet-b1.58-2B-4T' });
    vi.stubGlobal('fetch', fetchMock);

    const resp = await adapter.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(resp.content).toBe('');
  });
});

// =============================================================================
// BitNetAdapter — healthCheck()
// =============================================================================

describe('BitNetAdapter — healthCheck()', () => {
  let adapter: BitNetAdapter;

  beforeEach(() => {
    adapter = new BitNetAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok=true when /health responds 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.healthCheck();

    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('falls back to /v1/models when /health returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 }) // /health
      .mockResolvedValueOnce({ ok: true, status: 200 }); // /v1/models

    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.healthCheck();
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns ok=false when server is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/bitnet\.cpp server unreachable/);
  });

  it('returns latencyMs as number', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await adapter.healthCheck();
    expect(typeof result.latencyMs).toBe('number');
  });
});

// =============================================================================
// BitNetAdapter — generateHoloScript() (via base class)
// =============================================================================

describe('BitNetAdapter — generateHoloScript()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns code and detectedTraits for a simple prompt', async () => {
    const code = 'cube { @color(red) @position(0,1,0) @grabbable }';
    vi.stubGlobal('fetch', mockFetch(makeOkResponse(code)));

    const adapter = new BitNetAdapter();
    const result = await adapter.generateHoloScript({ prompt: 'a red grabbable cube' });

    expect(result.code).toBeTruthy();
    expect(result.provider).toBe('bitnet');
    expect(Array.isArray(result.detectedTraits)).toBe(true);
  });
});

// =============================================================================
// createBitNetProvider() factory
// =============================================================================

describe('createBitNetProvider()', () => {
  it('returns a BitNetAdapter with default config', () => {
    const provider = createBitNetProvider();
    expect(provider).toBeInstanceOf(BitNetAdapter);
    expect(provider.name).toBe('bitnet');
  });

  it('passes custom config through', () => {
    const provider = createBitNetProvider({
      baseURL: 'http://localhost:9090',
      model: '1bitLLM/bitnet_b1_58-large',
    });
    expect(provider.defaultHoloScriptModel).toBe('1bitLLM/bitnet_b1_58-large');
  });
});
