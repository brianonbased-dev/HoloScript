import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createPipelineLLMProvider,
  createPipelineLLMProviderAsync,
  detectLLMProviderName,
  detectLLMProviderNameAsync,
  adaptToChatProvider,
} from '../llmProvider';
import { AnthropicAdapter, MockAdapter } from '@holoscript/llm-provider';
import { configureConfigSecretResolver, resetConfigSecretResolver } from '@holoscript/config';

/** All env vars that influence provider detection/creation (sovereign-first resolver). */
const PROVIDER_ENV_KEYS = [
  // sovereign-serving + local (these WIN over frontier BYOK)
  'HOLO_LLM_PROVIDER',
  'BRITTNEY_PROVIDER',
  'HOLO_LLM_SERVICE_URL',
  'BRITTNEY_SERVICE_URL',
  'OLLAMA_HOST',
  'OLLAMA_URL',
  'OLLAMA_BASE_URL',
  'VAST_API_KEY',
  'FLEET_PROVIDER_ENDPOINT',
  // frontier BYOK fallback
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  // model overrides
  'HOLO_LLM_MODEL',
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
    resetConfigSecretResolver();
  });

  it('returns the sovereign local provider (ollama) when OLLAMA_URL is set', () => {
    process.env.OLLAMA_URL = 'http://localhost:11434';
    expect(detectLLMProviderName()).toBe('ollama');
  });

  it('prefers the sovereign local provider over frontier BYOK keys', () => {
    process.env.OLLAMA_URL = 'http://localhost:11434';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('ollama');
  });

  it('returns anthropic BYOK when only ANTHROPIC_API_KEY is set (no sovereign env)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(detectLLMProviderName()).toBe('anthropic');
  });

  it('returns xai BYOK when only XAI_API_KEY is set', () => {
    process.env.XAI_API_KEY = 'xai-test';
    expect(detectLLMProviderName()).toBe('xai');
  });

  it('returns openai BYOK when only OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('openai');
  });

  it('returns none when nothing is configured (sovereign-by-default, no silent cloud)', () => {
    expect(detectLLMProviderName()).toBe('none');
  });

  it('prefers anthropic over xai and openai in the BYOK fallback order', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.XAI_API_KEY = 'xai-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('anthropic');
  });

  it('prefers xai over openai in the BYOK fallback order', () => {
    process.env.XAI_API_KEY = 'xai-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('xai');
  });

  it('detects a HoloKey-resolved BYOK provider (anthropic) in the async path', async () => {
    configureConfigSecretResolver({
      async resolve(nameOrRef: string) {
        return nameOrRef === 'ANTHROPIC_API_KEY' ? 'vault-anthropic-key' : undefined;
      },
    });

    expect(await detectLLMProviderNameAsync()).toBe('anthropic');
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
    resetConfigSecretResolver();
  });

  it('creates the sovereign local provider when OLLAMA_URL is set', () => {
    process.env.OLLAMA_URL = 'http://localhost:11434';
    const provider = createPipelineLLMProvider();
    // Provider has the chat() method (the pipeline LLMProvider interface)
    expect(typeof provider.chat).toBe('function');
  });

  it('creates a provider when ANTHROPIC_API_KEY is set (BYOK fallback)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('creates a provider when XAI_API_KEY is set (BYOK fallback)', () => {
    process.env.XAI_API_KEY = 'xai-test';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('creates a provider when OPENAI_API_KEY is set (BYOK fallback)', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('throws when no provider env vars are set (sovereign-by-default, no silent cloud)', () => {
    expect(() => createPipelineLLMProvider()).toThrow('No LLM provider configured');
  });

  it('creates a provider from HoloKey in the async path', async () => {
    configureConfigSecretResolver({
      async resolve(nameOrRef: string) {
        return nameOrRef === 'ANTHROPIC_API_KEY' ? 'vault-anthropic-key' : undefined;
      },
    });

    const provider = await createPipelineLLMProviderAsync();
    expect(typeof provider.chat).toBe('function');
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
