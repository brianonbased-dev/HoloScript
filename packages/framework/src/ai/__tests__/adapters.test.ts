import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OpenAIAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  LMStudioAdapter,
  GeminiAdapter,
  XAIAdapter,
  TogetherAdapter,
} from '../adapters';

vi.mock('@holoscript/llm-provider', () => {
  type MockConfig = { apiKey?: string; baseURL?: string; defaultModel?: string; model?: string };
  type MockRequest = {
    messages?: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
  };

  async function postJSON(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('rate limited');
      if (response.status === 401 || response.status === 403) throw new Error('auth failed');
      throw new Error(response.statusText || 'provider error');
    }

    return response.json();
  }

  class MockOpenAIAdapter {
    private config: MockConfig;

    constructor(config: MockConfig) {
      this.config = config;
    }

    async complete(request: MockRequest) {
      const model = this.config.defaultModel ?? this.config.model ?? 'mock-model';
      const baseURL = this.config.baseURL ?? 'https://api.openai.com/v1';
      const data = await postJSON(baseURL + '/chat/completions', {
        model,
        messages: request.messages ?? [],
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      });
      const content = data.choices?.[0]?.message?.content ?? data.response ?? '';

      return {
        content,
        model: data.model ?? model,
        provider: 'openai',
        usage: { completionTokens: data.usage?.completion_tokens ?? 0 },
      };
    }
  }

  class MockAnthropicAdapter {
    private config: MockConfig;

    constructor(config: MockConfig) {
      this.config = config;
    }

    async complete(request: MockRequest) {
      const model = this.config.defaultModel ?? this.config.model ?? 'mock-model';
      const baseURL = this.config.baseURL ?? 'https://api.anthropic.com/v1';
      const data = await postJSON(baseURL + '/messages', {
        model,
        messages: request.messages ?? [],
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      });
      const content = data.content?.[0]?.text ?? '';

      return {
        content,
        model: data.model ?? model,
        provider: 'anthropic',
        usage: { completionTokens: data.usage?.output_tokens ?? 0 },
      };
    }
  }

  class MockLocalLLMAdapter extends MockOpenAIAdapter {
    constructor(config: MockConfig = {}) {
      const baseURL = (config.baseURL ?? 'http://localhost:8080')
        .replace(/\/$/, '')
        .replace(/\/v1$/, '');
      super({ ...config, baseURL: baseURL + '/v1' });
    }
  }

  class MockGeminiAdapter {
    private config: MockConfig;

    constructor(config: MockConfig) {
      this.config = config;
    }

    async complete(request: MockRequest) {
      const model = this.config.defaultModel ?? this.config.model ?? 'gemini-pro';
      const data = await postJSON(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { contents: request.messages ?? [] }
      );
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      return {
        content,
        model,
        provider: 'gemini',
        usage: { completionTokens: 0 },
      };
    }
  }

  class MockXAIAdapter extends MockOpenAIAdapter {
    constructor(config: MockConfig) {
      super({ ...config, baseURL: config.baseURL ?? 'https://api.x.ai/v1' });
    }
  }

  return {
    OpenAIAdapter: MockOpenAIAdapter,
    AnthropicAdapter: MockAnthropicAdapter,
    OpenRouterAdapter: MockOpenAIAdapter,
    XAIAdapter: MockXAIAdapter,
    GeminiAdapter: MockGeminiAdapter,
    LocalLLMAdapter: MockLocalLLMAdapter,
  };
});

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockOKResponse(body: any) {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
  });
}

function mockErrorResponse(status: number, statusText: string = 'Error') {
  return new Response(JSON.stringify({ error: { message: statusText } }), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AI Adapters', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==============================
  // OpenAI
  // ==============================
  describe('OpenAIAdapter', () => {
    let adapter: OpenAIAdapter;

    beforeEach(() => {
      adapter = new OpenAIAdapter({ apiKey: 'test-key' });
    });

    it('has correct id and name', () => {
      expect(adapter.id).toBe('openai');
      expect(adapter.name).toBe('OpenAI');
    });

    it('isReady returns true with api key', () => {
      expect(adapter.isReady()).toBe(true);
    });

    it('isReady returns false without api key', () => {
      const empty = new OpenAIAdapter({ apiKey: '' });
      expect(empty.isReady()).toBe(false);
    });

    it('uses custom model', () => {
      const custom = new OpenAIAdapter({ apiKey: 'key', model: 'gpt-4' });
      expect(custom.isReady()).toBe(true);
    });

    it('generateHoloScript calls fetch and extracts code', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOKResponse({
          choices: [{ message: { content: '```holoscript\ncomposition test {}\n```' } }],
        })
      );

      const result = await adapter.generateHoloScript('make a cube');
      expect(result.holoScript).toBe('composition test {}');
      expect(result.confidence).toBe(0.85);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws on 429 rate limit', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(429));
      await expect(adapter.explainHoloScript('test')).rejects.toThrow('rate limited');
    });

    it('throws on 401 auth error', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(401));
      await expect(adapter.explainHoloScript('test')).rejects.toThrow('auth failed');
    });

    it('getEmbeddings returns vectors', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOKResponse({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        })
      );

      const result = await adapter.getEmbeddings('test text');
      expect(result).toEqual([[0.1, 0.2, 0.3]]);
    });
  });

  // ==============================
  // Anthropic
  // ==============================
  describe('AnthropicAdapter', () => {
    let adapter: AnthropicAdapter;

    beforeEach(() => {
      adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    });

    it('has correct id and name', () => {
      expect(adapter.id).toBe('anthropic');
      expect(adapter.name).toBe('Anthropic Claude');
    });

    it('isReady returns true with api key', () => {
      expect(adapter.isReady()).toBe(true);
    });

    it('generateHoloScript calls Anthropic API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOKResponse({
          content: [{ text: '```holo\ncomposition room {}\n```' }],
        })
      );

      const result = await adapter.generateHoloScript('make a room');
      expect(result.holoScript).toBe('composition room {}');
    });

    it('getEmbeddings returns mock vectors', async () => {
      const result = await adapter.getEmbeddings('test');
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(1024);
    });
  });

  // ==============================
  // Ollama
  // ==============================
  describe('OllamaAdapter', () => {
    let adapter: OllamaAdapter;

    beforeEach(() => {
      adapter = new OllamaAdapter();
    });

    it('has correct id and name', () => {
      expect(adapter.id).toBe('ollama');
      expect(adapter.name).toBe('Ollama (Local)');
    });

    it('isReady checks API availability', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const ready = await adapter.isReady();
      expect(ready).toBe(true);
    });

    it('isReady returns false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const ready = await adapter.isReady();
      expect(ready).toBe(false);
    });

    it('generateHoloScript calls local API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOKResponse({
          response: 'composition cube { geometry: "cube" }',
        })
      );

      const result = await adapter.generateHoloScript('a cube');
      expect(result.holoScript).toBe('composition cube { geometry: "cube" }');
      expect(result.confidence).toBe(0.75);
    });
  });

  // ==============================
  // LMStudio
  // ==============================
  describe('LMStudioAdapter', () => {
    let adapter: LMStudioAdapter;

    beforeEach(() => {
      adapter = new LMStudioAdapter();
    });

    it('has correct id and name', () => {
      expect(adapter.id).toBe('lmstudio');
      expect(adapter.name).toBe('LM Studio (Local)');
    });

    it('isReady always returns true', () => {
      expect(adapter.isReady()).toBe(true);
    });

    it('delegates generateHoloScript to OpenAI adapter', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOKResponse({
          choices: [{ message: { content: 'test output' } }],
        })
      );

      const result = await adapter.generateHoloScript('test');
      expect(result.holoScript).toBe('test output');
      // Verify it used localhost:1234 (LM Studio default)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('localhost:1234'),
        expect.any(Object)
      );
    });
  });

  // ==============================
  // Gemini
  // ==============================
  describe('GeminiAdapter', () => {
    let adapter: GeminiAdapter;

    beforeEach(() => {
      adapter = new GeminiAdapter({ apiKey: 'test-key' });
    });

    it('has correct id and name', () => {
      expect(adapter.id).toBe('gemini');
      expect(adapter.name).toBe('Google Gemini');
    });

    it('isReady returns true with api key', () => {
      expect(adapter.isReady()).toBe(true);
    });

    it('generateHoloScript calls Gemini API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOKResponse({
          candidates: [{ content: { parts: [{ text: 'composition sphere {}' }] } }],
        })
      );

      const result = await adapter.generateHoloScript('a sphere');
      expect(result.holoScript).toBe('composition sphere {}');
    });

    it('getEmbeddings calls embedding API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOKResponse({
          embedding: { values: [0.5, 0.6, 0.7] },
        })
      );

      const result = await adapter.getEmbeddings('test');
      expect(result).toEqual([[0.5, 0.6, 0.7]]);
    });
  });

  // ==============================
  // XAI (Grok)
  // ==============================
  describe('XAIAdapter', () => {
    let adapter: XAIAdapter;

    beforeEach(() => {
      adapter = new XAIAdapter({ apiKey: 'test-key' });
    });

    it('has correct id and name', () => {
      expect(adapter.id).toBe('xai');
      expect(adapter.name).toBe('xAI Grok');
    });

    it('isReady returns true with api key', () => {
      expect(adapter.isReady()).toBe(true);
    });

    it('generateHoloScript calls xAI API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOKResponse({
          choices: [{ message: { content: '```holo\nscene {}\n```' } }],
        })
      );

      const result = await adapter.generateHoloScript('test');
      expect(result.holoScript).toBe('scene {}');
    });
  });

  // ==============================
  // Together AI
  // ==============================
  describe('TogetherAdapter', () => {
    let adapter: TogetherAdapter;

    beforeEach(() => {
      adapter = new TogetherAdapter({ apiKey: 'test-key' });
    });

    it('has correct id and name', () => {
      expect(adapter.id).toBe('together');
      expect(adapter.name).toBe('Together AI');
    });

    it('isReady returns true with api key', () => {
      expect(adapter.isReady()).toBe(true);
    });

    it('generateHoloScript calls Together API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOKResponse({
          choices: [{ message: { content: 'output' } }],
        })
      );

      const result = await adapter.generateHoloScript('test');
      expect(result.holoScript).toBe('output');
      expect(result.confidence).toBe(0.8);
    });
  });
});
