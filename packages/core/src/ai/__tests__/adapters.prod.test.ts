/**
 * AI Adapters — Production Tests (sync/configuration surface)
 *
 * Tests: OpenAIAdapter, AnthropicAdapter, OllamaAdapter, LMStudioAdapter,
 * GeminiAdapter — constructor defaults, isReady(), factory functions,
 * and id/name fields. Network calls require real keys; we skip those
 * and focus entirely on the synchronous, pure-logic surface.
 */

import { describe, it, expect } from 'vitest';
import {
  OpenAIAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  LMStudioAdapter,
  GeminiAdapter,
  useOpenAI,
  useAnthropic,
  useOllama,
  useLMStudio,
} from '../adapters';

// =============================================================================
// OpenAIAdapter
// =============================================================================

describe('OpenAIAdapter', () => {
  it('has id="openai" and name="OpenAI"', () => {
    const a = new OpenAIAdapter({ apiKey: 'sk-test' });
    expect(a.id).toBe('openai');
    expect(a.name).toBe('OpenAI');
  });

  it('isReady() returns true when apiKey is present', () => {
    expect(new OpenAIAdapter({ apiKey: 'sk-test' }).isReady()).toBe(true);
  });

  it('isReady() returns false when apiKey is empty string', () => {
    expect(new OpenAIAdapter({ apiKey: '' }).isReady()).toBe(false);
  });

  it('accepts custom model override', () => {
    // No direct getter — but constructor should not throw
    expect(() => new OpenAIAdapter({ apiKey: 'x', model: 'gpt-4' })).not.toThrow();
  });

  it('accepts custom baseUrl', () => {
    expect(
      () =>
        new OpenAIAdapter({
          apiKey: 'x',
          baseUrl: 'https://my-proxy.com/v1',
        })
    ).not.toThrow();
  });

  it('accepts organization field', () => {
    expect(
      () =>
        new OpenAIAdapter({
          apiKey: 'x',
          organization: 'org-123',
        })
    ).not.toThrow();
  });
});

// =============================================================================
// AnthropicAdapter
// =============================================================================

describe('AnthropicAdapter', () => {
  it('has id="anthropic" and name="Anthropic Claude"', () => {
    const a = new AnthropicAdapter({ apiKey: 'ant-test' });
    expect(a.id).toBe('anthropic');
    expect(a.name).toBe('Anthropic Claude');
  });

  it('isReady() returns true when apiKey present', () => {
    expect(new AnthropicAdapter({ apiKey: 'ant-test' }).isReady()).toBe(true);
  });

  it('isReady() returns false when apiKey is empty', () => {
    expect(new AnthropicAdapter({ apiKey: '' }).isReady()).toBe(false);
  });

  it('accepts custom model', () => {
    expect(
      () =>
        new AnthropicAdapter({
          apiKey: 'x',
          model: 'claude-3-opus',
        })
    ).not.toThrow();
  });
});

// =============================================================================
// OllamaAdapter
// =============================================================================

describe('OllamaAdapter', () => {
  it('has id="ollama" and name contains "Ollama"', () => {
    const a = new OllamaAdapter();
    expect(a.id).toBe('ollama');
    expect(a.name).toContain('Ollama');
  });

  it('constructs with no config (defaults)', () => {
    expect(() => new OllamaAdapter()).not.toThrow();
  });

  it('accepts custom baseUrl', () => {
    expect(() => new OllamaAdapter({ baseUrl: 'http://192.168.1.1:11434' })).not.toThrow();
  });

  it('accepts custom model', () => {
    expect(() => new OllamaAdapter({ model: 'llama3:8b' })).not.toThrow();
  });

  it('isReady() method exists and is callable', () => {
    // isReady is async for Ollama — just verify it returns a Promise
    const a = new OllamaAdapter({ baseUrl: 'http://localhost:11434' });
    expect(typeof a.isReady).toBe('function');
  });
});

// =============================================================================
// LMStudioAdapter
// =============================================================================

describe('LMStudioAdapter', () => {
  it('has id="lmstudio" and name contains "LM Studio"', () => {
    const a = new LMStudioAdapter();
    expect(a.id).toBe('lmstudio');
    expect(a.name).toContain('LM Studio');
  });

  it('isReady() always returns true', () => {
    expect(new LMStudioAdapter().isReady()).toBe(true);
  });

  it('constructs with no config', () => {
    expect(() => new LMStudioAdapter()).not.toThrow();
  });

  it('accepts custom baseUrl', () => {
    expect(() => new LMStudioAdapter({ baseUrl: 'http://localhost:1234/v1' })).not.toThrow();
  });

  it('accepts custom model', () => {
    expect(() => new LMStudioAdapter({ model: 'mistral-7b' })).not.toThrow();
  });
});

// =============================================================================
// GeminiAdapter
// =============================================================================

describe('GeminiAdapter', () => {
  it('has id="gemini" and name="Google Gemini"', () => {
    const a = new GeminiAdapter({ apiKey: 'gem-test' });
    expect(a.id).toBe('gemini');
    expect(a.name).toBe('Google Gemini');
  });

  it('isReady() returns true when apiKey present', () => {
    expect(new GeminiAdapter({ apiKey: 'gem-key' }).isReady()).toBe(true);
  });

  it('isReady() returns false when apiKey missing', () => {
    expect(new GeminiAdapter({ apiKey: '' }).isReady()).toBe(false);
  });

  it('accepts custom model', () => {
    expect(
      () =>
        new GeminiAdapter({
          apiKey: 'x',
          model: 'gemini-1.5-pro',
        })
    ).not.toThrow();
  });

  it('accepts custom embeddingModel', () => {
    expect(
      () =>
        new GeminiAdapter({
          apiKey: 'x',
          embeddingModel: 'text-multilingual-embedding-002',
        })
    ).not.toThrow();
  });
});

// =============================================================================
// Factory functions (useOpenAI, useAnthropic, useOllama, useLMStudio)
// =============================================================================

describe('Factory functions', () => {
  it('useOpenAI returns an OpenAIAdapter instance', () => {
    const a = useOpenAI({ apiKey: 'sk-test' });
    expect(a).toBeInstanceOf(OpenAIAdapter);
    expect(a.id).toBe('openai');
  });

  it('useAnthropic returns an AnthropicAdapter instance', () => {
    const a = useAnthropic({ apiKey: 'ant-test' });
    expect(a).toBeInstanceOf(AnthropicAdapter);
    expect(a.id).toBe('anthropic');
  });

  it('useOllama returns an OllamaAdapter instance', () => {
    const a = useOllama();
    expect(a).toBeInstanceOf(OllamaAdapter);
    expect(a.id).toBe('ollama');
  });

  it('useLMStudio returns an LMStudioAdapter instance', () => {
    const a = useLMStudio();
    expect(a).toBeInstanceOf(LMStudioAdapter);
    expect(a.id).toBe('lmstudio');
  });

  it('useOpenAI passes config (isReady reflects key)', () => {
    const a = useOpenAI({ apiKey: 'sk-abc123' });
    expect(a.isReady()).toBe(true);
  });

  it('useAnthropic isReady reflects provided key', () => {
    const a = useAnthropic({ apiKey: 'ant-xyz' });
    expect(a.isReady()).toBe(true);
  });
});

// =============================================================================
// Adapter interface conformance
// =============================================================================

describe('Adapter interface conformance', () => {
  const adapters = [
    new OpenAIAdapter({ apiKey: 'sk-test' }),
    new AnthropicAdapter({ apiKey: 'ant-test' }),
    new OllamaAdapter(),
    new LMStudioAdapter(),
    new GeminiAdapter({ apiKey: 'gem-test' }),
  ];

  for (const adapter of adapters) {
    it(`${adapter.id} has required methods`, () => {
      expect(typeof adapter.generateHoloScript).toBe('function');
      expect(typeof adapter.explainHoloScript).toBe('function');
      expect(typeof adapter.optimizeHoloScript).toBe('function');
      expect(typeof adapter.fixHoloScript).toBe('function');
      expect(typeof adapter.chat).toBe('function');
    });

    it(`${adapter.id} has non-empty id and name`, () => {
      expect(adapter.id.length).toBeGreaterThan(0);
      expect(adapter.name.length).toBeGreaterThan(0);
    });
  }
});
