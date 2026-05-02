import { describe, expect, it, vi, afterEach } from 'vitest';
import { adaptToChatProvider } from '../llmProvider';
import { AnthropicAdapter } from '@holoscript/llm-provider';

/**
 * Backoff retry tests for the absorb-service pipeline LLM adapter.
 *
 * With Phase C, retry logic lives in BaseLLMAdapter.withRetry() inside
 * @holoscript/llm-provider — those tests are in
 * llm-provider/src/__tests__/base-adapter-retry.test.ts.
 *
 * This file verifies that the adaptToChatProvider shim correctly delegates
 * to the upstream adapter's complete() method, which includes the retry
 * logic.  We test the integration point, not the retry loop itself.
 */

describe('adaptToChatProvider delegation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates chat() calls to the adapter.complete() method', async () => {
    const mockComplete = vi.fn().mockResolvedValue({
      content: 'delegated response',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'test-model',
      provider: 'anthropic' as const,
      finishReason: 'stop' as const,
    });

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    adapter.complete = mockComplete;

    const provider = adaptToChatProvider(adapter);
    const result = await provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 });

    expect(result.text).toBe('delegated response');
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'test' },
        ],
        maxTokens: 100,
      })
    );
  });

  it('passes through errors from the underlying adapter', async () => {
    const mockComplete = vi.fn().mockRejectedValue(new Error('provider error'));
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    adapter.complete = mockComplete;

    const provider = adaptToChatProvider(adapter);
    await expect(provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 })).rejects.toThrow(
      'provider error'
    );
  });

  it('maps system+prompt to messages in correct order', async () => {
    const mockComplete = vi.fn().mockResolvedValue({
      content: 'ok',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'test',
      provider: 'anthropic' as const,
      finishReason: 'stop' as const,
    });

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    adapter.complete = mockComplete;

    const provider = adaptToChatProvider(adapter);
    await provider.chat({ system: 'be helpful', prompt: 'what is 2+2?', maxTokens: 50 });

    const call = mockComplete.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(call.messages[0]).toEqual({ role: 'system', content: 'be helpful' });
    expect(call.messages[1]).toEqual({ role: 'user', content: 'what is 2+2?' });
  });

  it('returns text content from complete() response', async () => {
    const mockComplete = vi.fn().mockResolvedValue({
      content: 'response text',
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
      model: 'test-model',
      provider: 'openai' as const,
      finishReason: 'stop' as const,
    });

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    adapter.complete = mockComplete;

    const provider = adaptToChatProvider(adapter);
    const result = await provider.chat({ system: 'sys', prompt: 'prompt', maxTokens: 200 });

    expect(result).toEqual({ text: 'response text' });
  });

  it('handles empty content from adapter', async () => {
    const mockComplete = vi.fn().mockResolvedValue({
      content: '',
      usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
      model: 'test-model',
      provider: 'anthropic' as const,
      finishReason: 'length' as const,
    });

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    adapter.complete = mockComplete;

    const provider = adaptToChatProvider(adapter);
    const result = await provider.chat({ system: 'sys', prompt: 'prompt', maxTokens: 10 });

    expect(result.text).toBe('');
  });
});