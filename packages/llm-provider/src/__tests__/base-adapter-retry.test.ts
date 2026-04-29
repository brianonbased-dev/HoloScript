import { describe, expect, it, vi, afterEach } from 'vitest';
import { BaseLLMAdapter } from '../base-adapter';
import {
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMContextLengthError,
  type LLMCompletionRequest,
  type LLMCompletionResponse,
} from '../types';

/**
 * Test-only adapter that exposes `withRetry` and lets each test inject the
 * sequence of errors / values the wrapped operation will produce.
 */
class RetryTestAdapter extends BaseLLMAdapter {
  readonly name = 'mock' as const;
  readonly models = ['test-model'] as const;
  readonly defaultHoloScriptModel = 'test-model';

  protected getDefaultModel(): string {
    return 'test-model';
  }

  async complete(_req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    throw new Error('not used in these tests');
  }

  /** Public delegate to the protected `withRetry` so tests can call it directly. */
  async runWithRetry<T>(op: () => Promise<T>): Promise<T> {
    return this.withRetry(op);
  }
}

const ok = { content: 'ok' } as unknown as LLMCompletionResponse;

function makeAdapter(maxRetries = 3): RetryTestAdapter {
  return new RetryTestAdapter({ apiKey: 'test', maxRetries, timeoutMs: 1000 });
}

/**
 * Make `withRetry` fast in tests by stubbing the protected `sleep` to a no-op.
 * `sleep` is the only thing that introduces real wall time.
 */
function stubSleep(adapter: RetryTestAdapter): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(adapter as any, 'sleep').mockResolvedValue(undefined);
}

describe('BaseLLMAdapter.withRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns operation result on first success — no retry', async () => {
    const adapter = makeAdapter(3);
    stubSleep(adapter);
    const op = vi.fn().mockResolvedValue(ok);

    const result = await adapter.runWithRetry(op);

    expect(result).toBe(ok);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries LLMRateLimitError then succeeds within budget', async () => {
    const adapter = makeAdapter(3);
    stubSleep(adapter);
    const op = vi
      .fn()
      .mockRejectedValueOnce(new LLMRateLimitError('anthropic'))
      .mockResolvedValueOnce(ok);

    const result = await adapter.runWithRetry(op);

    expect(result).toBe(ok);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('retries retryable LLMProviderError (5xx) then succeeds', async () => {
    const adapter = makeAdapter(3);
    stubSleep(adapter);
    const op = vi
      .fn()
      .mockRejectedValueOnce(new LLMProviderError('upstream', 'anthropic', 503, true))
      .mockResolvedValueOnce(ok);

    const result = await adapter.runWithRetry(op);

    expect(result).toBe(ok);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retry budget on persistent rate-limit', async () => {
    const adapter = makeAdapter(2);
    stubSleep(adapter);
    const err = new LLMRateLimitError('anthropic');
    const op = vi.fn().mockRejectedValue(err);

    await expect(adapter.runWithRetry(op)).rejects.toBe(err);
    // maxRetries=2 → attempts = 1 initial + 2 retries = 3 total.
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry LLMAuthenticationError — throws immediately', async () => {
    const adapter = makeAdapter(3);
    stubSleep(adapter);
    const err = new LLMAuthenticationError('anthropic');
    const op = vi.fn().mockRejectedValue(err);

    await expect(adapter.runWithRetry(op)).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry LLMContextLengthError — throws immediately', async () => {
    const adapter = makeAdapter(3);
    stubSleep(adapter);
    const err = new LLMContextLengthError('anthropic', 999_999);
    const op = vi.fn().mockRejectedValue(err);

    await expect(adapter.runWithRetry(op)).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry non-retryable LLMProviderError (e.g. 400)', async () => {
    const adapter = makeAdapter(3);
    stubSleep(adapter);
    const err = new LLMProviderError('bad request', 'anthropic', 400, false);
    const op = vi.fn().mockRejectedValue(err);

    await expect(adapter.runWithRetry(op)).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries non-LLMProviderError (network) once then re-throws', async () => {
    const adapter = makeAdapter(3);
    stubSleep(adapter);
    const networkErr = new TypeError('fetch failed');
    const op = vi.fn().mockRejectedValue(networkErr);

    await expect(adapter.runWithRetry(op)).rejects.toBe(networkErr);
    // 1 initial + 1 unknown-error retry = 2 total. NOT 1+maxRetries=4.
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('honors LLMRateLimitError.retryAfterMs over backoff', async () => {
    const adapter = makeAdapter(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sleepSpy = vi.spyOn(adapter as any, 'sleep').mockResolvedValue(undefined);
    const op = vi
      .fn()
      .mockRejectedValueOnce(new LLMRateLimitError('anthropic', 5000))
      .mockResolvedValueOnce(ok);

    const result = await adapter.runWithRetry(op);

    expect(result).toBe(ok);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy).toHaveBeenCalledWith(5000);
  });

  it('uses exponential backoff (2^attempt * 100ms + jitter) when no retryAfterMs', async () => {
    const adapter = makeAdapter(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sleepSpy = vi.spyOn(adapter as any, 'sleep').mockResolvedValue(undefined);
    const op = vi
      .fn()
      .mockRejectedValueOnce(new LLMProviderError('first', 'anthropic', 503, true))
      .mockRejectedValueOnce(new LLMProviderError('second', 'anthropic', 503, true))
      .mockResolvedValueOnce(ok);

    await adapter.runWithRetry(op);

    expect(sleepSpy).toHaveBeenCalledTimes(2);
    // attempt=0 backoff range: [100, 200), attempt=1 backoff range: [200, 300).
    const [first] = sleepSpy.mock.calls[0];
    const [second] = sleepSpy.mock.calls[1];
    expect(first).toBeGreaterThanOrEqual(100);
    expect(first).toBeLessThan(200);
    expect(second).toBeGreaterThanOrEqual(200);
    expect(second).toBeLessThan(300);
  });

  it('respects maxRetries=0 — single attempt, no retry on rate limit', async () => {
    const adapter = makeAdapter(0);
    stubSleep(adapter);
    const err = new LLMRateLimitError('anthropic');
    const op = vi.fn().mockRejectedValue(err);

    await expect(adapter.runWithRetry(op)).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });
});
