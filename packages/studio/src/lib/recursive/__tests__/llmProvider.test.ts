import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  AnthropicLLMProvider,
  XAILLMProvider,
  OpenAILLMProvider,
  OllamaLLMProvider,
  createLLMProvider,
  detectLLMProviderName,
} from '../llmProvider';

// ─── Provider Detection ──────────────────────────────────────────────────────

describe('detectLLMProviderName', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns anthropic when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(detectLLMProviderName()).toBe('anthropic');
  });

  it('returns xai when XAI_API_KEY is set (no anthropic)', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.XAI_API_KEY = 'xai-test';
    expect(detectLLMProviderName()).toBe('xai');
  });

  it('returns openai when OPENAI_API_KEY is set (no anthropic/xai)', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.XAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('openai');
  });

  it('returns ollama as fallback', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(detectLLMProviderName()).toBe('ollama');
  });

  it('prefers anthropic over xai and openai', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.XAI_API_KEY = 'xai-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('anthropic');
  });

  it('prefers xai over openai', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.XAI_API_KEY = 'xai-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectLLMProviderName()).toBe('xai');
  });
});

// ─── Factory ─────────────────────────────────────────────────────────────────

describe('createLLMProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates AnthropicLLMProvider when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const provider = createLLMProvider();
    expect(provider).toBeInstanceOf(AnthropicLLMProvider);
  });

  it('creates XAILLMProvider when XAI_API_KEY is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.XAI_API_KEY = 'xai-test';
    const provider = createLLMProvider();
    expect(provider).toBeInstanceOf(XAILLMProvider);
  });

  it('creates OpenAILLMProvider when OPENAI_API_KEY is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.XAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    const provider = createLLMProvider();
    expect(provider).toBeInstanceOf(OpenAILLMProvider);
  });

  it('creates OllamaLLMProvider as fallback', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const provider = createLLMProvider();
    expect(provider).toBeInstanceOf(OllamaLLMProvider);
  });
});

// ─── Provider Interface Compliance ───────────────────────────────────────────

describe('provider interface', () => {
  it('AnthropicLLMProvider has chat method', () => {
    const p = new AnthropicLLMProvider('test-key');
    expect(typeof p.chat).toBe('function');
  });

  it('XAILLMProvider has chat method', () => {
    const p = new XAILLMProvider('test-key');
    expect(typeof p.chat).toBe('function');
  });

  it('OpenAILLMProvider has chat method', () => {
    const p = new OpenAILLMProvider('test-key');
    expect(typeof p.chat).toBe('function');
  });

  it('OllamaLLMProvider has chat method', () => {
    const p = new OllamaLLMProvider();
    expect(typeof p.chat).toBe('function');
  });
});

// ─── Anthropic Response Parsing ──────────────────────────────────────────────

describe('AnthropicLLMProvider.chat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses Anthropic Messages API response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: '{"focusRotationChange":null,"rationale":"test"}' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new AnthropicLLMProvider('test-key');
    const result = await provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 });

    expect(result.text).toBe('{"focusRotationChange":null,"rationale":"test"}');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    }));

    const provider = new AnthropicLLMProvider('test-key');
    await expect(provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 }))
      .rejects.toThrow('Anthropic API error 429');
  });
});

// ─── xAI Response Parsing ────────────────────────────────────────────────────

describe('XAILLMProvider.chat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses xAI OpenAI-compatible response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'grok response' } }],
      }),
    }));

    const provider = new XAILLMProvider('test-key');
    const result = await provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 });
    expect(result.text).toBe('grok response');
  });

  it('uses x.ai base URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '' } }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new XAILLMProvider('test-key');
    await provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.x.ai/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ─── OpenAI Response Parsing ─────────────────────────────────────────────────

describe('OpenAILLMProvider.chat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses OpenAI chat completion response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'openai response' } }],
      }),
    }));

    const provider = new OpenAILLMProvider('test-key');
    const result = await provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 });
    expect(result.text).toBe('openai response');
  });
});

// ─── Ollama Response Parsing ─────────────────────────────────────────────────

describe('OllamaLLMProvider.chat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses Ollama chat response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        message: { content: 'ollama response' },
      }),
    }));

    const provider = new OllamaLLMProvider();
    const result = await provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 });
    expect(result.text).toBe('ollama response');
  });

  it('uses configured base URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { content: '' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new OllamaLLMProvider('http://custom:8080');
    await provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://custom:8080/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('strips trailing slashes from base URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { content: '' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new OllamaLLMProvider('http://localhost:11434///');
    await provider.chat({ system: 'sys', prompt: 'test', maxTokens: 100 });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.any(Object),
    );
  });
});
