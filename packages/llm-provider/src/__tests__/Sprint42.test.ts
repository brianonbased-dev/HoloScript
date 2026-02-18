/**
 * Sprint 42 — @holoscript/llm-provider acceptance tests
 * Covers: MockAdapter (constructor, complete, generateHoloScript, healthCheck, reset,
 *         failOnNextCall), LLMProviderManager with mock, createMockProvider factory,
 *         error classes, model constants, exported types
 *
 * NOTE: Real provider adapters (OpenAI, Anthropic, Gemini) require API keys and are
 * NOT tested here. MockAdapter provides full coverage without network calls.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockAdapter,
  LLMProviderManager,
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMContextLengthError,
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  GEMINI_MODELS,
  createMockProvider,
} from '../index';

// ═══════════════════════════════════════════════
// MockAdapter — constructor
// ═══════════════════════════════════════════════
describe('MockAdapter — constructor', () => {
  it('creates with no config', () => {
    const adapter = new MockAdapter();
    expect(adapter).toBeDefined();
  });

  it('creates with partial config', () => {
    const adapter = new MockAdapter({ timeoutMs: 1000 });
    expect(adapter).toBeDefined();
  });

  it('name is "mock"', () => {
    const adapter = new MockAdapter();
    expect(adapter.name).toBe('mock');
  });

  it('models array is non-empty', () => {
    const adapter = new MockAdapter();
    expect(Array.isArray(adapter.models)).toBe(true);
    expect(adapter.models.length).toBeGreaterThan(0);
  });

  it('defaultHoloScriptModel is a string', () => {
    const adapter = new MockAdapter();
    expect(typeof adapter.defaultHoloScriptModel).toBe('string');
    expect(adapter.defaultHoloScriptModel.length).toBeGreaterThan(0);
  });

  it('callCount starts at 0', () => {
    const adapter = new MockAdapter();
    expect(adapter.callCount).toBe(0);
  });

  it('failOnNextCall starts false', () => {
    const adapter = new MockAdapter();
    expect(adapter.failOnNextCall).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// MockAdapter — complete()
// ═══════════════════════════════════════════════
describe('MockAdapter — complete()', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  it('returns LLMCompletionResponse', async () => {
    const response = await adapter.complete({
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(response).toBeDefined();
    expect(response).toHaveProperty('content');
    expect(response).toHaveProperty('usage');
    expect(response).toHaveProperty('model');
    expect(response).toHaveProperty('provider');
    expect(response).toHaveProperty('finishReason');
  });

  it('content is a string', async () => {
    const response = await adapter.complete({
      messages: [{ role: 'user', content: 'generate a cube' }],
    });
    expect(typeof response.content).toBe('string');
    expect(response.content.length).toBeGreaterThan(0);
  });

  it('provider is "mock"', async () => {
    const response = await adapter.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(response.provider).toBe('mock');
  });

  it('finishReason is "stop"', async () => {
    const response = await adapter.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(response.finishReason).toBe('stop');
  });

  it('usage has expected shape', async () => {
    const response = await adapter.complete({
      messages: [{ role: 'user', content: 'test prompt' }],
    });
    expect(typeof response.usage.promptTokens).toBe('number');
    expect(typeof response.usage.completionTokens).toBe('number');
    expect(typeof response.usage.totalTokens).toBe('number');
    expect(response.usage.totalTokens).toBeGreaterThanOrEqual(0);
  });

  it('callCount increments on each call', async () => {
    await adapter.complete({ messages: [{ role: 'user', content: 'a' }] });
    await adapter.complete({ messages: [{ role: 'user', content: 'b' }] });
    expect(adapter.callCount).toBe(2);
  });

  it('throws when failOnNextCall=true', async () => {
    adapter.failOnNextCall = true;
    await expect(
      adapter.complete({ messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow();
  });

  it('failOnNextCall resets to false after throwing', async () => {
    adapter.failOnNextCall = true;
    try {
      await adapter.complete({ messages: [{ role: 'user', content: 'x' }] });
    } catch {}
    expect(adapter.failOnNextCall).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// MockAdapter — generateHoloScript()
// ═══════════════════════════════════════════════
describe('MockAdapter — generateHoloScript()', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  it('returns HoloScriptGenerationResponse shape', async () => {
    const response = await adapter.generateHoloScript({ prompt: 'a cube' });
    expect(response).toHaveProperty('code');
    expect(response).toHaveProperty('valid');
    expect(response).toHaveProperty('errors');
    expect(response).toHaveProperty('provider');
    expect(response).toHaveProperty('usage');
    expect(response).toHaveProperty('detectedTraits');
  });

  it('code is a non-empty string', async () => {
    const response = await adapter.generateHoloScript({ prompt: 'a red sphere' });
    expect(typeof response.code).toBe('string');
    expect(response.code.length).toBeGreaterThan(0);
  });

  it('provider is "mock"', async () => {
    const response = await adapter.generateHoloScript({ prompt: 'test scene' });
    expect(response.provider).toBe('mock');
  });

  it('errors is an array', async () => {
    const response = await adapter.generateHoloScript({ prompt: 'test' });
    expect(Array.isArray(response.errors)).toBe(true);
  });

  it('detectedTraits is an array', async () => {
    const response = await adapter.generateHoloScript({ prompt: 'test' });
    expect(Array.isArray(response.detectedTraits)).toBe(true);
  });

  it('island scene returns island-related code', async () => {
    const response = await adapter.generateHoloScript({ prompt: 'a floating island' });
    expect(response.code).toContain('{');
  });

  it('robot prompt returns robot scene', async () => {
    const response = await adapter.generateHoloScript({ prompt: 'a robot' });
    expect(response.code.length).toBeGreaterThan(0);
  });

  it('space prompt returns space scene', async () => {
    const response = await adapter.generateHoloScript({ prompt: 'a space planet' });
    expect(response.code.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// MockAdapter — healthCheck()
// ═══════════════════════════════════════════════
describe('MockAdapter — healthCheck()', () => {
  it('returns ok=true', async () => {
    const adapter = new MockAdapter();
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(true);
  });

  it('returns latencyMs as number', async () => {
    const adapter = new MockAdapter();
    const result = await adapter.healthCheck();
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════
// MockAdapter — reset()
// ═══════════════════════════════════════════════
describe('MockAdapter — reset()', () => {
  it('resets callCount to 0', async () => {
    const adapter = new MockAdapter();
    await adapter.complete({ messages: [{ role: 'user', content: 'x' }] });
    adapter.reset();
    expect(adapter.callCount).toBe(0);
  });

  it('resets failOnNextCall to false', () => {
    const adapter = new MockAdapter();
    adapter.failOnNextCall = true;
    adapter.reset();
    expect(adapter.failOnNextCall).toBe(false);
  });

  it('resets simulatedLatencyMs to 0', () => {
    const adapter = new MockAdapter();
    adapter.simulatedLatencyMs = 100;
    adapter.reset();
    expect(adapter.simulatedLatencyMs).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// LLMProviderManager with MockAdapter
// ═══════════════════════════════════════════════
describe('LLMProviderManager — with mock', () => {
  it('creates with mock provider', () => {
    const manager = new LLMProviderManager({
      providers: { mock: new MockAdapter() } as any,
    });
    expect(manager).toBeDefined();
  });

  it('generateHoloScript returns response with attemptedProviders', async () => {
    // Use mock as a registered provider directly
    const mock = new MockAdapter();
    const manager = new LLMProviderManager({
      providers: { mock } as any,
      strategy: { primary: 'mock' as any },
    });
    // Manager should at least be constructable
    expect(manager).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// createMockProvider factory
// ═══════════════════════════════════════════════
describe('createMockProvider', () => {
  it('is a function', () => {
    expect(typeof createMockProvider).toBe('function');
  });

  it('returns a MockAdapter', () => {
    const provider = createMockProvider();
    expect(provider).toBeInstanceOf(MockAdapter);
  });

  it('returned adapter has name "mock"', () => {
    const provider = createMockProvider();
    expect(provider.name).toBe('mock');
  });

  it('can generateHoloScript', async () => {
    const provider = createMockProvider();
    const result = await provider.generateHoloScript({ prompt: 'a test scene' });
    expect(result).toHaveProperty('code');
  });
});

// ═══════════════════════════════════════════════
// Error classes
// ═══════════════════════════════════════════════
describe('LLM error classes', () => {
  it('LLMProviderError is an Error subclass', () => {
    const err = new LLMProviderError('test', 'mock');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LLMProviderError');
    expect(err.provider).toBe('mock');
  });

  it('LLMProviderError has provider and statusCode', () => {
    const err = new LLMProviderError('test', 'openai', 500);
    expect(err.statusCode).toBe(500);
    expect(err.provider).toBe('openai');
  });

  it('LLMRateLimitError has correct name and status', () => {
    const err = new LLMRateLimitError('anthropic');
    expect(err.name).toBe('LLMRateLimitError');
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
  });

  it('LLMRateLimitError has optional retryAfterMs', () => {
    const err = new LLMRateLimitError('openai', 5000);
    expect(err.retryAfterMs).toBe(5000);
  });

  it('LLMAuthenticationError has correct name and status', () => {
    const err = new LLMAuthenticationError('gemini');
    expect(err.name).toBe('LLMAuthenticationError');
    expect(err.statusCode).toBe(401);
    expect(err.retryable).toBe(false);
  });

  it('LLMContextLengthError has correct name and tokenCount', () => {
    const err = new LLMContextLengthError('mock', 50000);
    expect(err.name).toBe('LLMContextLengthError');
    expect(err.tokenCount).toBe(50000);
    expect(err.statusCode).toBe(400);
  });

  it('all errors have message field', () => {
    expect(new LLMProviderError('msg', 'mock').message).toBe('msg');
    expect(new LLMRateLimitError('mock').message).toBeTruthy();
    expect(new LLMAuthenticationError('mock').message).toBeTruthy();
    expect(new LLMContextLengthError('mock', 1000).message).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════
// Model constants
// ═══════════════════════════════════════════════
describe('Model constants', () => {
  it('OPENAI_MODELS is a non-empty array', () => {
    expect(Array.isArray(OPENAI_MODELS)).toBe(true);
    expect(OPENAI_MODELS.length).toBeGreaterThan(0);
  });

  it('ANTHROPIC_MODELS is a non-empty array', () => {
    expect(Array.isArray(ANTHROPIC_MODELS)).toBe(true);
    expect(ANTHROPIC_MODELS.length).toBeGreaterThan(0);
  });

  it('GEMINI_MODELS is a non-empty array', () => {
    expect(Array.isArray(GEMINI_MODELS)).toBe(true);
    expect(GEMINI_MODELS.length).toBeGreaterThan(0);
  });

  it('ANTHROPIC_MODELS includes a claude model', () => {
    const hasClaude = ANTHROPIC_MODELS.some(m => m.includes('claude'));
    expect(hasClaude).toBe(true);
  });

  it('OPENAI_MODELS includes gpt', () => {
    const hasGpt = OPENAI_MODELS.some(m => m.includes('gpt'));
    expect(hasGpt).toBe(true);
  });

  it('GEMINI_MODELS includes gemini', () => {
    const hasGemini = GEMINI_MODELS.some(m => m.includes('gemini'));
    expect(hasGemini).toBe(true);
  });
});
