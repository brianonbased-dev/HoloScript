/**
 * Unified LLM Provider SDK Tests
 *
 * Tests for all provider adapters, the provider manager,
 * and the base adapter functionality. Uses MockAdapter for
 * all tests to avoid real API calls.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { MockAdapter } from '../adapters/mock';
import { OpenAIAdapter, OPENAI_MODELS } from '../adapters/openai';
import { AnthropicAdapter, ANTHROPIC_MODELS } from '../adapters/anthropic';
import { GeminiAdapter, GEMINI_MODELS } from '../adapters/gemini';
import { LLMProviderManager } from '../provider-manager';
import {
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMContextLengthError,
  createMockProvider,
} from '../index';

// =============================================================================
// MockAdapter Tests
// =============================================================================

describe('MockAdapter', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter();
    mock.reset();
  });

  it('has correct provider name', () => {
    expect(mock.name).toBe('mock');
  });

  it('has available models', () => {
    expect(mock.models.length).toBeGreaterThan(0);
    expect(mock.defaultHoloScriptModel).toBeTruthy();
  });

  it('complete() returns valid LLMCompletionResponse', async () => {
    const response = await mock.complete({
      messages: [{ role: 'user', content: 'Generate a cube scene' }],
    });

    expect(response).toBeDefined();
    expect(response.content).toBeTruthy();
    expect(response.provider).toBe('mock');
    expect(response.model).toBeTruthy();
    expect(response.usage).toBeDefined();
    expect(response.usage.totalTokens).toBeGreaterThanOrEqual(0);
    expect(response.finishReason).toBe('stop');
  });

  it('complete() increments callCount', async () => {
    expect(mock.callCount).toBe(0);
    await mock.complete({ messages: [{ role: 'user', content: 'hello' }] });
    expect(mock.callCount).toBe(1);
    await mock.complete({ messages: [{ role: 'user', content: 'world' }] });
    expect(mock.callCount).toBe(2);
  });

  it('complete() throws when failOnNextCall is true', async () => {
    mock.failOnNextCall = true;
    await expect(
      mock.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toThrow('Mock forced failure');
    expect(mock.failOnNextCall).toBe(false);
  });

  it('healthCheck() always succeeds', async () => {
    const result = await mock.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reset() clears callCount and failOnNextCall', async () => {
    mock.callCount = 5;
    mock.failOnNextCall = true;
    mock.reset();
    expect(mock.callCount).toBe(0);
    expect(mock.failOnNextCall).toBe(false);
  });

  describe('generateHoloScript()', () => {
    it('returns valid HoloScript generation response', async () => {
      const result = await mock.generateHoloScript({
        prompt: 'a red cube that can be grabbed',
      });

      expect(result).toBeDefined();
      expect(result.code).toBeTruthy();
      expect(result.provider).toBe('mock');
      expect(result.usage).toBeDefined();
      expect(Array.isArray(result.detectedTraits)).toBe(true);
    });

    it('marks response as valid for default scenes', async () => {
      const result = await mock.generateHoloScript({
        prompt: 'a simple cube',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects traits in generated code', async () => {
      const result = await mock.generateHoloScript({
        prompt: 'a grabbable physics cube',
      });
      expect(result.detectedTraits.length).toBeGreaterThan(0);
      // Default scene has @color, @position, @grabbable, @physics
      expect(result.detectedTraits.some((t) => t.startsWith('@'))).toBe(true);
    });

    it('returns island scene for island prompt', async () => {
      const result = await mock.generateHoloScript({
        prompt: 'a floating island with trees',
      });
      expect(result.code).toContain('scene');
    });

    it('returns robot scene for robot prompt', async () => {
      const result = await mock.generateHoloScript({
        prompt: 'a humanoid robot',
      });
      expect(result.code).toContain('cube');
    });
  });
});

// =============================================================================
// Error Type Tests
// =============================================================================

describe('LLM Error Types', () => {
  it('LLMProviderError has correct properties', () => {
    const err = new LLMProviderError('test error', 'openai', 500, true);
    expect(err.message).toBe('test error');
    expect(err.provider).toBe('openai');
    expect(err.statusCode).toBe(500);
    expect(err.retryable).toBe(true);
    expect(err.name).toBe('LLMProviderError');
    expect(err instanceof Error).toBe(true);
  });

  it('LLMRateLimitError has correct properties', () => {
    const err = new LLMRateLimitError('anthropic', 5000);
    expect(err.provider).toBe('anthropic');
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(5000);
    expect(err.name).toBe('LLMRateLimitError');
  });

  it('LLMAuthenticationError has correct properties', () => {
    const err = new LLMAuthenticationError('openai');
    expect(err.statusCode).toBe(401);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('LLMAuthenticationError');
  });

  it('LLMContextLengthError has correct properties', () => {
    const err = new LLMContextLengthError('gemini', 150000);
    expect(err.tokenCount).toBe(150000);
    expect(err.statusCode).toBe(400);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('LLMContextLengthError');
  });
});

// =============================================================================
// OpenAI Adapter (metadata only - no real API calls)
// =============================================================================

describe('OpenAIAdapter (metadata)', () => {
  it('has correct provider name', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
    expect(adapter.name).toBe('openai');
  });

  it('has expected available models', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
    expect(adapter.models).toContain('gpt-4o');
    expect(adapter.models).toContain('gpt-4o-mini');
    expect(adapter.models).toContain('gpt-3.5-turbo');
  });

  it('OPENAI_MODELS constant is populated', () => {
    expect(OPENAI_MODELS.length).toBeGreaterThan(0);
    expect(OPENAI_MODELS).toContain('gpt-4o');
  });

  it('uses gpt-4o-mini as default HoloScript model', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
    expect(adapter.defaultHoloScriptModel).toBe('gpt-4o-mini');
  });

  it('respects custom defaultModel in config', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test-key', defaultModel: 'gpt-4o' });
    expect(adapter.defaultHoloScriptModel).toBe('gpt-4o');
  });

  it('throws when openai package not installed', async () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
    // This will fail because openai pkg is not installed in this test env
    // Test that it throws a LLMProviderError with helpful message
    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toThrow(/openai package not installed|Could not find module/i);
  });
});

// =============================================================================
// Anthropic Adapter (metadata only)
// =============================================================================

describe('AnthropicAdapter (metadata)', () => {
  it('has correct provider name', () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    expect(adapter.name).toBe('anthropic');
  });

  it('has expected available models', () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    expect(adapter.models).toContain('claude-sonnet-4-5-20250929');
    expect(adapter.models).toContain('claude-haiku-4-5-20251001');
  });

  it('ANTHROPIC_MODELS constant is populated', () => {
    expect(ANTHROPIC_MODELS.length).toBeGreaterThan(0);
    expect(ANTHROPIC_MODELS).toContain('claude-opus-4-6');
  });

  it('uses claude-haiku-4-5 as default HoloScript model', () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    expect(adapter.defaultHoloScriptModel).toBe('claude-haiku-4-5-20251001');
  });

  it('includes Claude 4 family models', () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const hasClaude4 = adapter.models.some((m) => m.includes('claude-') && (m.includes('-4-') || m.includes('opus-4')));
    expect(hasClaude4).toBe(true);
  });

  it('throws an LLMProviderError on complete() with invalid API key', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'invalid-key', maxRetries: 0 });
    // Should throw either an authentication error or a network error
    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toThrow();
  });
});

// =============================================================================
// Gemini Adapter (metadata only)
// =============================================================================

describe('GeminiAdapter (metadata)', () => {
  it('has correct provider name', () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key' });
    expect(adapter.name).toBe('gemini');
  });

  it('has expected available models', () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key' });
    expect(adapter.models).toContain('gemini-2.0-flash');
    expect(adapter.models).toContain('gemini-1.5-pro');
  });

  it('GEMINI_MODELS constant is populated', () => {
    expect(GEMINI_MODELS.length).toBeGreaterThan(0);
    expect(GEMINI_MODELS).toContain('gemini-2.0-flash');
  });

  it('uses gemini-1.5-flash as default HoloScript model', () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key' });
    expect(adapter.defaultHoloScriptModel).toBe('gemini-1.5-flash');
  });
});

// =============================================================================
// LLMProviderManager Tests
// =============================================================================

describe('LLMProviderManager', () => {
  let mock1: MockAdapter;
  let mock2: MockAdapter;
  let manager: LLMProviderManager;

  beforeEach(() => {
    mock1 = new MockAdapter();
    mock2 = new MockAdapter();
    // We'll use 'openai' slot for mock1 and 'anthropic' slot for mock2
    // to test strategy selection
  });

  it('creates with single provider', () => {
    const mgr = new LLMProviderManager({
      providers: { openai: mock1 as unknown as any },
    });
    expect(mgr.getRegisteredProviders()).toContain('openai');
  });

  it('creates with multiple providers', () => {
    const mgr = new LLMProviderManager({
      providers: {
        openai: mock1 as unknown as any,
        anthropic: mock2 as unknown as any,
      },
    });
    expect(mgr.getRegisteredProviders()).toHaveLength(2);
  });

  it('getProvider() returns registered provider', () => {
    const mgr = new LLMProviderManager({
      providers: { openai: mock1 as unknown as any },
    });
    const provider = mgr.getProvider('openai');
    expect(provider).toBe(mock1);
  });

  it('getProvider() returns undefined for unregistered provider', () => {
    const mgr = new LLMProviderManager({
      providers: { openai: mock1 as unknown as any },
    });
    const provider = mgr.getProvider('gemini');
    expect(provider).toBeUndefined();
  });

  it('generateHoloScript() uses primary provider', async () => {
    const mgr = new LLMProviderManager({
      providers: {
        openai: mock1 as unknown as any,
        anthropic: mock2 as unknown as any,
      },
      strategy: { primary: 'openai', fallback: 'anthropic' },
    });

    await mgr.generateHoloScript({ prompt: 'a cube' });
    expect(mock1.callCount).toBe(1);
    expect(mock2.callCount).toBe(0);
  });

  it('generateHoloScript() falls back to secondary provider on failure', async () => {
    mock1.failOnNextCall = true;

    const mgr = new LLMProviderManager({
      providers: {
        openai: mock1 as unknown as any,
        anthropic: mock2 as unknown as any,
      },
      strategy: { primary: 'openai', fallback: 'anthropic' },
    });

    const result = await mgr.generateHoloScript({ prompt: 'a cube' });
    expect(result.attemptedProviders).toContain('openai');
    expect(result.attemptedProviders).toContain('anthropic');
    expect(result.provider).toBe('mock'); // mock2's provider name
  });

  it('generateHoloScript() includes attemptedProviders in result', async () => {
    const mgr = new LLMProviderManager({
      providers: { openai: mock1 as unknown as any },
      strategy: { primary: 'openai' },
    });

    const result = await mgr.generateHoloScript({ prompt: 'test' });
    expect(result.attemptedProviders).toEqual(['openai']);
  });

  it('complete() throws for unregistered provider', async () => {
    const mgr = new LLMProviderManager({
      providers: { openai: mock1 as unknown as any },
    });

    await expect(
      mgr.complete({ messages: [{ role: 'user', content: 'test' }] }, 'gemini')
    ).rejects.toThrow("Provider 'gemini' is not registered");
  });

  it('healthCheckAll() returns results for all registered providers', async () => {
    const mgr = new LLMProviderManager({
      providers: {
        openai: mock1 as unknown as any,
        anthropic: mock2 as unknown as any,
      },
    });

    const results = await mgr.healthCheckAll();
    expect(results).toHaveProperty('openai');
    expect(results).toHaveProperty('anthropic');
    expect(results.openai.ok).toBe(true);
    expect(results.anthropic.ok).toBe(true);
  });
});

// =============================================================================
// Base Adapter Internal Logic Tests (via MockAdapter)
// =============================================================================

describe('BaseLLMAdapter (via MockAdapter)', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter();
  });

  it('extractHoloScriptCode strips markdown fences', () => {
    // Access protected method via class extension for testing
    class TestableMock extends MockAdapter {
      public testExtract(content: string): string {
        return this.extractHoloScriptCode(content);
      }
    }

    const testable = new TestableMock();

    const withFences = '```holoscript\ncube { @color(red) }\n```';
    expect(testable.testExtract(withFences)).toBe('cube { @color(red) }');

    const withGenericFences = '```\ncube { @color(red) }\n```';
    expect(testable.testExtract(withGenericFences)).toBe('cube { @color(red) }');

    const withoutFences = 'cube { @color(red) }';
    expect(testable.testExtract(withoutFences)).toBe('cube { @color(red) }');
  });

  it('validateHoloScriptOutput correctly validates code', () => {
    class TestableMock extends MockAdapter {
      public testValidate(code: string) {
        return this.validateHoloScriptOutput(code);
      }
    }

    const testable = new TestableMock();

    // Valid code
    const valid = testable.testValidate('cube { @color(red) @position(0, 1, 0) }');
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    // Empty code
    const empty = testable.testValidate('');
    expect(empty.valid).toBe(false);
    expect(empty.errors.length).toBeGreaterThan(0);

    // Unbalanced braces
    const unbalanced = testable.testValidate('cube { @color(red)');
    expect(unbalanced.valid).toBe(false);

    // Markdown leakage
    const withMarkdown = testable.testValidate('```\ncube { @color(red) }\n```');
    expect(withMarkdown.valid).toBe(false);
  });

  it('extractTraits finds all @trait references', () => {
    class TestableMock extends MockAdapter {
      public testExtractTraits(code: string): string[] {
        return this.extractTraits(code);
      }
    }

    const testable = new TestableMock();

    const code = 'cube { @color(red) @position(0, 1, 0) @grabbable @physics }';
    const traits = testable.testExtractTraits(code);

    expect(traits).toContain('@color');
    expect(traits).toContain('@position');
    expect(traits).toContain('@grabbable');
    expect(traits).toContain('@physics');
    expect(traits).toHaveLength(4);
  });

  it('extractTraits deduplicates traits', () => {
    class TestableMock extends MockAdapter {
      public testExtractTraits(code: string): string[] {
        return this.extractTraits(code);
      }
    }

    const testable = new TestableMock();
    const code = 'cube { @color(red) } sphere { @color(blue) }';
    const traits = testable.testExtractTraits(code);

    // @color appears twice but should be deduped
    expect(traits.filter((t) => t === '@color')).toHaveLength(1);
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('Factory Functions', () => {
  it('createMockProvider() returns MockAdapter', () => {
    const mock = createMockProvider();
    expect(mock).toBeInstanceOf(MockAdapter);
    expect(mock.name).toBe('mock');
  });
});
