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

/** All env vars that influence provider detection/creation (HoloLlama-default, sovereign-first). */
const PROVIDER_ENV_KEYS = [
  // provider selection + HoloLlama (the sovereign inference-layer default)
  'HOLO_LLM_PROVIDER',
  'BRITTNEY_PROVIDER',
  'HOLOLLAMA_URL',
  'HOLOLLAMA_ENDPOINT',
  'HOLO_LLM_SERVICE_URL',
  'BRITTNEY_SERVICE_URL',
  'OLLAMA_HOST',
  'OLLAMA_URL',
  'OLLAMA_BASE_URL',
  'VAST_API_KEY',
  'FLEET_PROVIDER_ENDPOINT',
  // frontier BYOK (explicit opt-in only)
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

  it('defaults to HoloLlama (the sovereign inference layer) when nothing is configured', () => {
    expect(detectLLMProviderName()).toBe('holollama');
  });

  it('still defaults to HoloLlama even when a frontier key is present (cloud is explicit opt-in)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('holollama');
  });

  it('honors an explicit HOLO_LLM_PROVIDER=holollama', () => {
    process.env.HOLO_LLM_PROVIDER = 'holollama';
    expect(detectLLMProviderName()).toBe('holollama');
  });

  it('returns anthropic ONLY when explicitly selected (BYOK opt-in)', () => {
    process.env.HOLO_LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(detectLLMProviderName()).toBe('anthropic');
  });

  it('returns xai when explicitly selected', () => {
    process.env.HOLO_LLM_PROVIDER = 'xai';
    process.env.XAI_API_KEY = 'xai-test';
    expect(detectLLMProviderName()).toBe('xai');
  });

  it('returns openai when explicitly selected', () => {
    process.env.HOLO_LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('openai');
  });

  it('returns ollama ONLY when explicitly selected — never the default (D.117 retire Ollama)', () => {
    process.env.HOLO_LLM_PROVIDER = 'ollama';
    process.env.OLLAMA_URL = 'http://localhost:11434';
    expect(detectLLMProviderName()).toBe('ollama');
  });

  it('detects an explicit HoloKey-resolved BYOK provider (anthropic) in the async path', async () => {
    process.env.HOLO_LLM_PROVIDER = 'anthropic';
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

  it('creates the HoloLlama provider by default (no env, no throw)', () => {
    const provider = createPipelineLLMProvider();
    // Provider has the chat() method (the pipeline LLMProvider interface)
    expect(typeof provider.chat).toBe('function');
  });

  it('creates HoloLlama even when a frontier key is set (cloud is explicit opt-in)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('creates a provider for an explicit anthropic selection (BYOK)', () => {
    process.env.HOLO_LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('creates a provider for an explicit openai selection (BYOK)', () => {
    process.env.HOLO_LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    const provider = createPipelineLLMProvider();
    expect(typeof provider.chat).toBe('function');
  });

  it('throws when an explicit BYOK provider is selected without its key', () => {
    process.env.HOLO_LLM_PROVIDER = 'anthropic';
    expect(() => createPipelineLLMProvider()).toThrow('ANTHROPIC_API_KEY');
  });

  it('creates a provider from HoloKey in the async path (explicit anthropic BYOK)', async () => {
    process.env.HOLO_LLM_PROVIDER = 'anthropic';
    configureConfigSecretResolver({
      async resolve(nameOrRef: string) {
        return nameOrRef === 'ANTHROPIC_API_KEY' ? 'vault-anthropic-key' : undefined;
      },
    });

    const provider = await createPipelineLLMProviderAsync();
    expect(typeof provider.chat).toBe('function');
  });

  it('creates the HoloLlama provider by default in the async path (no explicit provider)', async () => {
    // No explicit provider → HoloLlama is the default; whether the local server is
    // up or not, a valid pipeline provider is returned (up → HoloLlama, down →
    // graceful sovereign fallback). Deterministic assertion: it has chat().
    process.env.HOLO_LLM_PROVIDER = 'holollama'; // force (skip network probe) for a deterministic unit test
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
