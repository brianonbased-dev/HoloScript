import { describe, expect, it, vi, afterEach } from 'vitest';
import { AnthropicLLMProvider } from '../llmProvider';

/**
 * Backoff retry tests for the absorb-service llmProvider.
 *
 * Provider type doesn't matter for retry semantics — fetchWithRetry is shared
 * across all five. We exercise via AnthropicLLMProvider as the canonical case;
 * the same loop wraps OpenAI / xAI / OpenRouter / Ollama identically.
 */

interface MockResponseInit {
  ok?: boolean;
  status?: number;
  body?: unknown;
  retryAfter?: string;
}

function mockResponse(init: MockResponseInit): Response {
  const status = init.status ?? (init.ok ? 200 : 500);
  const ok = init.ok ?? (status >= 200 && status < 300);
  const headersMap = new Map<string, string>();
  if (init.retryAfter !== undefined) headersMap.set('retry-after', init.retryAfter);
  return {
    ok,
    status,
    headers: { get: (name: string) => headersMap.get(name.toLowerCase()) ?? null },
    json: () => Promise.resolve(init.body ?? {}),
    text: () => Promise.resolve(typeof init.body === 'string' ? init.body : ''),
  } as unknown as Response;
}

const ANTHROPIC_OK = mockResponse({
  ok: true,
  body: { content: [{ type: 'text', text: 'hi' }] },
});

describe('llmProvider backoff retry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retries 429 then succeeds within retry budget', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 429, body: 'rate limited' }))
      .mockResolvedValueOnce(ANTHROPIC_OK);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicLLMProvider('test-key');
    const result = await provider.chat({ system: 's', prompt: 'p', maxTokens: 10 });

    expect(result.text).toBe('hi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 5xx then succeeds within retry budget', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 503, body: 'unavailable' }))
      .mockResolvedValueOnce(ANTHROPIC_OK);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicLLMProvider('test-key');
    const result = await provider.chat({ system: 's', prompt: 'p', maxTokens: 10 });

    expect(result.text).toBe('hi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retry budget on persistent 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 429, body: 'rate limited' }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicLLMProvider('test-key');
    await expect(provider.chat({ system: 's', prompt: 'p', maxTokens: 10 })).rejects.toThrow(
      'Anthropic API error 429'
    );
    // 3 attempts total per DEFAULT_RETRY.maxAttempts.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 400 — falls through immediately', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 400, body: 'bad request' }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicLLMProvider('test-key');
    await expect(provider.chat({ system: 's', prompt: 'p', maxTokens: 10 })).rejects.toThrow(
      'Anthropic API error 400'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 401 — falls through immediately', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 401, body: 'unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicLLMProvider('test-key');
    await expect(provider.chat({ system: 's', prompt: 'p', maxTokens: 10 })).rejects.toThrow(
      'Anthropic API error 401'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries network error once then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ANTHROPIC_OK);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicLLMProvider('test-key');
    const result = await provider.chat({ system: 's', prompt: 'p', maxTokens: 10 });

    expect(result.text).toBe('hi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on second consecutive network error (1 retry budget exhausted)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed again'));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicLLMProvider('test-key');
    await expect(provider.chat({ system: 's', prompt: 'p', maxTokens: 10 })).rejects.toThrow(
      'fetch failed again'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors Retry-After header (seconds) before retrying', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 429, retryAfter: '1' }))
      .mockResolvedValueOnce(ANTHROPIC_OK);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicLLMProvider('test-key');
    const promise = provider.chat({ system: 's', prompt: 'p', maxTokens: 10 });

    // Drain the first fetch + read of retry-after header.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Retry-After = 1s. Advance < 1s — should NOT have retried yet.
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance past the 1s mark — second fetch fires.
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;
    expect(result.text).toBe('hi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('applies exponential backoff between retries (fake timers)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 503 }))
      .mockResolvedValueOnce(mockResponse({ status: 503 }))
      .mockResolvedValueOnce(ANTHROPIC_OK);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicLLMProvider('test-key');
    const promise = provider.chat({ system: 's', prompt: 'p', maxTokens: 10 });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // First retry: 2^0 * 100ms + jitter (≤100ms). 200ms covers worst case.
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second retry: 2^1 * 100ms + jitter (≤100ms). 300ms covers worst case.
    await vi.advanceTimersByTimeAsync(300);
    const result = await promise;
    expect(result.text).toBe('hi');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
