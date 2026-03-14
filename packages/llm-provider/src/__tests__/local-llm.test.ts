/**
 * LocalLLMAdapter Tests
 *
 * All network calls are intercepted with vi.stubGlobal / vi.fn so no
 * real server is required. Tests cover the happy path, error mapping,
 * healthCheck, and the createLocalLLMProvider() factory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { LocalLLMAdapter, LOCAL_LLM_MODELS } from '../adapters/local-llm';
import type { LocalLLMModel } from '../adapters/local-llm';
import { createLocalLLMProvider } from '../index';
import { LLMProviderError } from '../types';

// =============================================================================
// Helpers — build a minimal OpenAI-compatible response body
// =============================================================================

function makeOkResponse(content: string, model = 'mistral-7b-instruct') {
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
// LocalLLMAdapter — structure
// =============================================================================

describe('LocalLLMAdapter — structure', () => {
  it('has correct provider name', () => {
    const adapter = new LocalLLMAdapter();
    expect(adapter.name).toBe('local-llm');
  });

  it('exposes all known models', () => {
    const adapter = new LocalLLMAdapter();
    expect(adapter.models).toEqual(LOCAL_LLM_MODELS);
    expect(adapter.models.length).toBeGreaterThan(0);
  });

  it('defaults to mistral-7b-instruct model', () => {
    const adapter = new LocalLLMAdapter();
    expect(adapter.defaultHoloScriptModel).toBe('mistral-7b-instruct');
  });

  it('accepts custom model override', () => {
    const adapter = new LocalLLMAdapter({ model: 'llama-3.1-8b-instruct' });
    expect(adapter.defaultHoloScriptModel).toBe('llama-3.1-8b-instruct');
  });

  it('LOCAL_LLM_MODELS type guard works', () => {
    const m: LocalLLMModel = 'mistral-7b-instruct';
    expect(LOCAL_LLM_MODELS).toContain(m);
  });
});

// =============================================================================
// LocalLLMAdapter — complete()
// =============================================================================

describe('LocalLLMAdapter — complete()', () => {
  let adapter: LocalLLMAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new LocalLLMAdapter({ baseURL: 'http://localhost:8080' });
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
    expect(resp.provider).toBe('local-llm');
    expect(resp.model).toBe('mistral-7b-instruct');
    expect(resp.finishReason).toBe('stop');
    expect(resp.usage.totalTokens).toBe(30);
  });

  it('strips trailing slash from baseURL', async () => {
    const adapterSlash = new LocalLLMAdapter({ baseURL: 'http://localhost:8080/' });
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
    ).rejects.toMatchObject({ provider: 'local-llm', statusCode: 500 });
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
    expect(err.message).toMatch(/local LLM server/);
    expect(err.retryable).toBe(false);
  });

  it('handles empty choices array gracefully', async () => {
    fetchMock = mockFetch({ choices: [], usage: {}, model: 'mistral-7b-instruct' });
    vi.stubGlobal('fetch', fetchMock);

    const resp = await adapter.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(resp.content).toBe('');
  });
});

// =============================================================================
// LocalLLMAdapter — healthCheck()
// =============================================================================

describe('LocalLLMAdapter — healthCheck()', () => {
  let adapter: LocalLLMAdapter;

  beforeEach(() => {
    adapter = new LocalLLMAdapter();
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
      .mockResolvedValueOnce({ ok: false, status: 404 })  // /health
      .mockResolvedValueOnce({ ok: true, status: 200 });   // /v1/models

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
    expect(result.error).toMatch(/Local LLM server unreachable/);
  });

  it('returns latencyMs as number', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await adapter.healthCheck();
    expect(typeof result.latencyMs).toBe('number');
  });
});

// =============================================================================
// LocalLLMAdapter — generateHoloScript() (via base class)
// =============================================================================

describe('LocalLLMAdapter — generateHoloScript()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns code and detectedTraits for a simple prompt', async () => {
    const code = 'cube { @color(red) @position(0,1,0) @grabbable }';
    vi.stubGlobal('fetch', mockFetch(makeOkResponse(code)));

    const adapter = new LocalLLMAdapter();
    const result = await adapter.generateHoloScript({ prompt: 'a red grabbable cube' });

    expect(result.code).toBeTruthy();
    expect(result.provider).toBe('local-llm');
    expect(Array.isArray(result.detectedTraits)).toBe(true);
  });
});

// =============================================================================
// createLocalLLMProvider() factory
// =============================================================================

describe('createLocalLLMProvider()', () => {
  it('returns a LocalLLMAdapter with default config', () => {
    const provider = createLocalLLMProvider();
    expect(provider).toBeInstanceOf(LocalLLMAdapter);
    expect(provider.name).toBe('local-llm');
  });

  it('passes custom config through', () => {
    const provider = createLocalLLMProvider({
      baseURL: 'http://localhost:11434',
      model: 'qwen2.5-7b-instruct',
    });
    expect(provider.defaultHoloScriptModel).toBe('qwen2.5-7b-instruct');
  });
});
