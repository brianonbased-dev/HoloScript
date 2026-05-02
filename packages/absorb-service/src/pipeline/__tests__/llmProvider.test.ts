import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createPipelineLLMProvider,
  detectLLMProviderName,
  adaptToChatProvider,
} from '../llmProvider';
import { AnthropicAdapter, MockAdapter } from '@holoscript/llm-provider';

/** All env vars that influence provider detection/creation. */
const PROVIDER_ENV_KEYS = [
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'OPENAI_API_KEY',
  'OLLAMA_URL',
  'OLLAMA_BASE_URL',
  'OPENROUTER_MODEL',
  'ANTHROPIC_MODEL',
  'XAI_MODEL',
  'OPENAI_MODEL',
  'OLLAMA_MODEL',
  'BRITTNEY_MODEL',
] as const;

/** Remove all provider env vars so each test starts from a clean slate. */
function clearProviderEnv(): void {
  for (const key of PROVIDER_ENV_KEYS) {
    delete process.env[key];
  }
}

// ─── Provider Detection ──────────────────────────────────────────────────────

describe('detectLLMProviderName', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearProviderEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns openrouter when OPENROUTER_API_KEY is set (highest priority)', () => {
    process.env.OPENROUTER_API_KEY = 'or-test';
    expect(detectLLMProviderName()).toBe('openrouter');
  });

  it('returns anthropic when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(detectLLMProviderName()).toBe('anthropic');
  });

  it('returns xai when XAI_API_KEY is set (no anthropic/openrouter)', () => {
    process.env.XAI_API_KEY = 'xai-test';
    expect(detectLLMProviderName()).toBe('xai');
  });

  it('returns openai when OPENAI_API_KEY is set (no anthropic/xai/openrouter)', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('openai');
  });

  it('returns ollama as fallback', () => {
    expect(detectLLMProviderName()).toBe('ollama');
  });

  it('prefers openrouter over all others', () => {
    process.env.OPENROUTER_API_KEY = 'or-test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.XAI_API_KEY = 'xai-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('openrouter');
  });

  it('prefers anthropic over xai and openai', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.XAI_API_KEY = 'xai-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('anthropic');
  });

  it('prefers xai over openai', () => {
    process.env.XAI_API_KEY = 'xai-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('xai');
  });
});

// ─── Factory ─────────────────────────────────────────────────────────────────

describe('createPipelineLLMProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearProviderEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates a provider when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const provider = createPipelineLLMProvider();
    // Provider has the chat() method (the pipeline LLMProvider interface)
    expect(typeof provider.chat).toBe('function');
  });

  it('creates a provider when OPENROUTER_API_KEY is set', () => {
    process.env.OPENROUTER_API_KEY = 'or-test';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('creates a provider when XAI_API_KEY is set', () => {
    process.env.XAI_API_KEY = 'xai-test';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('creates a provider when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('creates a provider when OLLAMA_URL is set (fallback)', () => {
    process.env.OLLAMA_URL = 'http://localhost:11434';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('throws when no provider env vars are set', () => {
    expect(() => createPipelineLLMProvider()).toThrow('No AI provider configured');
  });
});

// ─── adaptToChatProvider ────────────────────────────────────────────────────

describe('adaptToChatProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adapts ILLMProvider.complete() to chat() interface', async () => {
    const mockProvider = new MockAdapter();
    // MockAdapter returns a predictable response for generateHoloScript;
    // for complete(), it echoes back content based on the last user message.
    const adapted = adaptToChatProvider(mockProvider);

    // The adapted provider should have a chat method
    expect(typeof adapted.chat).toBe('function');

    // Calling chat() should internally call complete() and return { text }
    const result = await adapted.chat({
      system: 'You are a test assistant.',
      prompt: 'Say hello.',
      maxTokens: 100,
    });

    // MockAdapter.complete() returns content, so adapted.chat() should return { text }
    expect(result).toHaveProperty('text');
    expect(typeof result.text).toBe('string');
  });

  it('maps system+prompt to messages array correctly', async () => {
    // Use a spy-friendly adapter: AnthropicAdapter with a mock complete()
    const mockComplete = vi.fn().mockResolvedValue({
      content: 'test response',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'test-model',
      provider: 'anthropic' as const,
      finishReason: 'stop' as const,
    });

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    adapter.complete = mockComplete;

    const adapted = adaptToChatProvider(adapter);
    await adapted.chat({ system: 'system prompt', prompt: 'user prompt', maxTokens: 500 });

    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'user prompt' },
        ],
        maxTokens: 500,
      })
    );
  });

  it('returns content as text from complete() response', async () => {
    const mockComplete = vi.fn().mockResolvedValue({
      content: 'the answer is 42',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'test-model',
      provider: 'anthropic' as const,
      finishReason: 'stop' as const,
    });

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    adapter.complete = mockComplete;

    const adapted = adaptToChatProvider(adapter);
    const result = await adapted.chat({ system: 'sys', prompt: 'prompt', maxTokens: 100 });

    expect(result.text).toBe('the answer is 42');
  });

  it('propagates errors from complete()', async () => {
    const mockComplete = vi.fn().mockRejectedValue(new Error('API error 429'));
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    adapter.complete = mockComplete;

    const adapted = adaptToChatProvider(adapter);
    await expect(adapted.chat({ system: 'sys', prompt: 'prompt', maxTokens: 100 })).rejects.toThrow(
      'API error 429'
    );
  });
});

// ─── Provider interface compliance ───────────────────────────────────────────

describe('pipeline LLMProvider interface', () => {
  it('createPipelineLLMProvider returns an object with chat method', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('chat returns an object with text property', async () => {
    // Use adaptToChatProvider with a mock to verify the return shape
    const mockComplete = vi.fn().mockResolvedValue({
      content: 'hello world',
      usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
      model: 'test',
      provider: 'mock' as const,
      finishReason: 'stop' as const,
    });
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    adapter.complete = mockComplete;

    const adapted = adaptToChatProvider(adapter);
    const result = await adapted.chat({ system: 'sys', prompt: 'hi', maxTokens: 10 });
    expect(result).toEqual({ text: 'hello world' });
  });
});