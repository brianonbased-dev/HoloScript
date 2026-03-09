/**
 * Sprint 18 Acceptance Tests — LLM Provider SDK + Comparative Benchmarks
 *
 * Covers:
 *   - @holoscript/llm-provider: MockAdapter, OPENAI/ANTHROPIC/GEMINI model lists, error types
 *   - @holoscript/comparative-benchmarks: ComparativeBenchmarks class, runAll(), generateReport()
 *
 * All tests use only the Mock adapter (no real API calls).
 * Benchmark tests use minimal iterations (warmup=0, iterations=5) to keep CI fast.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// LLM Provider imports (no @holoscript/core dependency — import directly)
// ---------------------------------------------------------------------------
import { MockAdapter } from '../../../llm-provider/src/adapters/mock.js';
import { OPENAI_MODELS } from '../../../llm-provider/src/adapters/openai.js';
import { ANTHROPIC_MODELS } from '../../../llm-provider/src/adapters/anthropic.js';
import { GEMINI_MODELS } from '../../../llm-provider/src/adapters/gemini.js';
import {
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMContextLengthError,
} from '../../../llm-provider/src/types.js';

// ---------------------------------------------------------------------------
// Comparative Benchmarks imports (@holoscript/core resolved via vitest alias)
// ---------------------------------------------------------------------------
import {
  ComparativeBenchmarks,
  runComparativeBenchmarks,
} from '../../../comparative-benchmarks/src/index.js';

// =============================================================================
// Feature 1A: MockAdapter — static properties
// =============================================================================

describe('Feature 1A: MockAdapter — static properties', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter();
  });

  it('MockAdapter can be instantiated', () => {
    expect(mock).toBeDefined();
  });

  it('name is "mock"', () => {
    expect(mock.name).toBe('mock');
  });

  it('models is an array', () => {
    expect(Array.isArray(mock.models)).toBe(true);
  });

  it('models has 3 entries', () => {
    expect(mock.models.length).toBe(3);
  });

  it('models includes mock-gpt-4', () => {
    expect(mock.models).toContain('mock-gpt-4');
  });

  it('models includes mock-claude', () => {
    expect(mock.models).toContain('mock-claude');
  });

  it('models includes mock-gemini', () => {
    expect(mock.models).toContain('mock-gemini');
  });

  it('defaultHoloScriptModel is "mock-gpt-4"', () => {
    expect(mock.defaultHoloScriptModel).toBe('mock-gpt-4');
  });
});

// =============================================================================
// Feature 1B: MockAdapter — initial mutable state
// =============================================================================

describe('Feature 1B: MockAdapter — initial mutable state', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter();
  });

  it('callCount starts at 0', () => {
    expect(mock.callCount).toBe(0);
  });

  it('failOnNextCall starts as false', () => {
    expect(mock.failOnNextCall).toBe(false);
  });

  it('simulatedLatencyMs starts at 0', () => {
    expect(mock.simulatedLatencyMs).toBe(0);
  });
});

// =============================================================================
// Feature 2A: MockAdapter — complete() response shape
// =============================================================================

describe('Feature 2A: MockAdapter — complete() response shape', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter();
  });

  it('complete() returns a Promise', () => {
    const result = mock.complete({
      messages: [{ role: 'user', content: 'create a red cube' }],
    });
    expect(result).toBeInstanceOf(Promise);
  });

  it('content is a non-empty string', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a red cube' }],
    });
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('usage has promptTokens', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a red cube' }],
    });
    expect(typeof result.usage.promptTokens).toBe('number');
  });

  it('usage has completionTokens', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a red cube' }],
    });
    expect(typeof result.usage.completionTokens).toBe('number');
  });

  it('usage has totalTokens', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a red cube' }],
    });
    expect(typeof result.usage.totalTokens).toBe('number');
  });

  it('model is "mock-gpt-4"', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a scene' }],
    });
    expect(result.model).toBe('mock-gpt-4');
  });

  it('provider is "mock"', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a scene' }],
    });
    expect(result.provider).toBe('mock');
  });

  it('finishReason is "stop"', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a scene' }],
    });
    expect(result.finishReason).toBe('stop');
  });
});

// =============================================================================
// Feature 2B: MockAdapter — callCount and keyword scenes
// =============================================================================

describe('Feature 2B: MockAdapter — callCount and keyword scenes', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter();
  });

  it('callCount increments after each complete() call', async () => {
    await mock.complete({ messages: [{ role: 'user', content: 'hello' }] });
    expect(mock.callCount).toBe(1);
    await mock.complete({ messages: [{ role: 'user', content: 'world' }] });
    expect(mock.callCount).toBe(2);
  });

  it('"island" keyword returns island scene code', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a floating island' }],
    });
    expect(result.content).toContain('plane');
  });

  it('"robot" keyword returns robot scene code', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a robot humanoid' }],
    });
    expect(result.content).toContain('cube');
  });

  it('"space" keyword returns space scene code', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'create a space with planets' }],
    });
    expect(result.content).toContain('sphere');
  });

  it('default scene contains cube', async () => {
    const result = await mock.complete({
      messages: [{ role: 'user', content: 'make something cool' }],
    });
    expect(result.content).toContain('cube');
  });
});

// =============================================================================
// Feature 3A: MockAdapter — control: failOnNextCall and reset()
// =============================================================================

describe('Feature 3A: MockAdapter — failOnNextCall and reset()', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter();
  });

  it('failOnNextCall=true causes next call to throw', async () => {
    mock.failOnNextCall = true;
    await expect(
      mock.complete({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toThrow();
  });

  it('after forced failure, failOnNextCall resets to false', async () => {
    mock.failOnNextCall = true;
    try {
      await mock.complete({ messages: [{ role: 'user', content: 'x' }] });
    } catch {}
    expect(mock.failOnNextCall).toBe(false);
  });

  it('after forced failure, next call succeeds', async () => {
    mock.failOnNextCall = true;
    try {
      await mock.complete({ messages: [{ role: 'user', content: 'x' }] });
    } catch {}
    const result = await mock.complete({ messages: [{ role: 'user', content: 'y' }] });
    expect(result.content).toBeDefined();
  });

  it('reset() zeroes callCount', async () => {
    await mock.complete({ messages: [{ role: 'user', content: 'x' }] });
    mock.reset();
    expect(mock.callCount).toBe(0);
  });

  it('reset() sets failOnNextCall to false', () => {
    mock.failOnNextCall = true;
    mock.reset();
    expect(mock.failOnNextCall).toBe(false);
  });

  it('reset() sets simulatedLatencyMs to 0', () => {
    mock.simulatedLatencyMs = 100;
    mock.reset();
    expect(mock.simulatedLatencyMs).toBe(0);
  });
});

// =============================================================================
// Feature 3B: MockAdapter — healthCheck()
// =============================================================================

describe('Feature 3B: MockAdapter — healthCheck()', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter();
  });

  it('healthCheck() returns a Promise', () => {
    expect(mock.healthCheck()).toBeInstanceOf(Promise);
  });

  it('healthCheck() resolves to {ok: true}', async () => {
    const result = await mock.healthCheck();
    expect(result.ok).toBe(true);
  });

  it('healthCheck() latencyMs is 0 by default', async () => {
    const result = await mock.healthCheck();
    expect(result.latencyMs).toBe(0);
  });

  it('healthCheck() latencyMs reflects simulatedLatencyMs', async () => {
    mock.simulatedLatencyMs = 42;
    const result = await mock.healthCheck();
    expect(result.latencyMs).toBe(42);
  });
});

// =============================================================================
// Feature 4: MockAdapter — generateHoloScript()
// =============================================================================

describe('Feature 4: MockAdapter — generateHoloScript()', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter();
  });

  it('generateHoloScript() returns a Promise', () => {
    expect(mock.generateHoloScript({ prompt: 'a red cube' })).toBeInstanceOf(Promise);
  });

  it('result has code string', async () => {
    const result = await mock.generateHoloScript({ prompt: 'a red cube' });
    expect(typeof result.code).toBe('string');
    expect(result.code.length).toBeGreaterThan(0);
  });

  it('result has valid boolean', async () => {
    const result = await mock.generateHoloScript({ prompt: 'a red cube' });
    expect(typeof result.valid).toBe('boolean');
  });

  it('result has errors array', async () => {
    const result = await mock.generateHoloScript({ prompt: 'a red cube' });
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('result has provider string', async () => {
    const result = await mock.generateHoloScript({ prompt: 'a red cube' });
    expect(typeof result.provider).toBe('string');
  });

  it('result has usage with totalTokens', async () => {
    const result = await mock.generateHoloScript({ prompt: 'a red cube' });
    expect(typeof result.usage.totalTokens).toBe('number');
  });

  it('result has detectedTraits array', async () => {
    const result = await mock.generateHoloScript({ prompt: 'a red cube' });
    expect(Array.isArray(result.detectedTraits)).toBe(true);
  });

  it('valid cube scene generates valid HoloScript', async () => {
    const result = await mock.generateHoloScript({ prompt: 'a red cube' });
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Feature 5: Model constant arrays
// =============================================================================

describe('Feature 5: LLM provider model constant arrays', () => {
  it('OPENAI_MODELS is an array', () => {
    expect(Array.isArray(OPENAI_MODELS)).toBe(true);
  });

  it('OPENAI_MODELS has 7 entries', () => {
    expect(OPENAI_MODELS.length).toBe(7);
  });

  it('OPENAI_MODELS includes gpt-4o', () => {
    expect(OPENAI_MODELS).toContain('gpt-4o');
  });

  it('OPENAI_MODELS includes gpt-4', () => {
    expect(OPENAI_MODELS).toContain('gpt-4');
  });

  it('OPENAI_MODELS includes gpt-3.5-turbo', () => {
    expect(OPENAI_MODELS).toContain('gpt-3.5-turbo');
  });

  it('ANTHROPIC_MODELS is an array', () => {
    expect(Array.isArray(ANTHROPIC_MODELS)).toBe(true);
  });

  it('ANTHROPIC_MODELS has at least 8 entries', () => {
    expect(ANTHROPIC_MODELS.length).toBeGreaterThanOrEqual(8);
  });

  it('ANTHROPIC_MODELS includes claude-opus-4-6', () => {
    expect(ANTHROPIC_MODELS).toContain('claude-opus-4-6');
  });

  it('ANTHROPIC_MODELS includes claude-sonnet-4-5-20250929', () => {
    expect(ANTHROPIC_MODELS).toContain('claude-sonnet-4-5-20250929');
  });

  it('GEMINI_MODELS is an array', () => {
    expect(Array.isArray(GEMINI_MODELS)).toBe(true);
  });

  it('GEMINI_MODELS has 5 entries', () => {
    expect(GEMINI_MODELS.length).toBe(5);
  });

  it('GEMINI_MODELS includes gemini-2.0-flash', () => {
    expect(GEMINI_MODELS).toContain('gemini-2.0-flash');
  });

  it('GEMINI_MODELS includes gemini-1.5-pro', () => {
    expect(GEMINI_MODELS).toContain('gemini-1.5-pro');
  });
});

// =============================================================================
// Feature 6: LLM Error types
// =============================================================================

describe('Feature 6: LLM error types', () => {
  it('LLMProviderError is constructable', () => {
    const err = new LLMProviderError('test error', 'mock');
    expect(err).toBeDefined();
  });

  it('LLMProviderError has correct message', () => {
    const err = new LLMProviderError('test error', 'mock');
    expect(err.message).toBe('test error');
  });

  it('LLMProviderError has provider field', () => {
    const err = new LLMProviderError('test error', 'mock');
    expect(err.provider).toBe('mock');
  });

  it('LLMProviderError name is "LLMProviderError"', () => {
    const err = new LLMProviderError('test error', 'mock');
    expect(err.name).toBe('LLMProviderError');
  });

  it('LLMProviderError is instance of Error', () => {
    const err = new LLMProviderError('test error', 'mock');
    expect(err).toBeInstanceOf(Error);
  });

  it('LLMRateLimitError is constructable', () => {
    const err = new LLMRateLimitError('mock');
    expect(err).toBeDefined();
  });

  it('LLMRateLimitError name is "LLMRateLimitError"', () => {
    const err = new LLMRateLimitError('mock');
    expect(err.name).toBe('LLMRateLimitError');
  });

  it('LLMRateLimitError has statusCode 429', () => {
    const err = new LLMRateLimitError('mock');
    expect(err.statusCode).toBe(429);
  });

  it('LLMRateLimitError is retryable', () => {
    const err = new LLMRateLimitError('mock');
    expect(err.retryable).toBe(true);
  });

  it('LLMAuthenticationError is constructable', () => {
    const err = new LLMAuthenticationError('mock');
    expect(err).toBeDefined();
  });

  it('LLMAuthenticationError name is "LLMAuthenticationError"', () => {
    const err = new LLMAuthenticationError('mock');
    expect(err.name).toBe('LLMAuthenticationError');
  });

  it('LLMAuthenticationError statusCode is 401', () => {
    const err = new LLMAuthenticationError('mock');
    expect(err.statusCode).toBe(401);
  });

  it('LLMContextLengthError is constructable', () => {
    const err = new LLMContextLengthError('mock', 9999);
    expect(err).toBeDefined();
  });

  it('LLMContextLengthError stores tokenCount', () => {
    const err = new LLMContextLengthError('mock', 9999);
    expect(err.tokenCount).toBe(9999);
  });
});

// =============================================================================
// Feature 7A: ComparativeBenchmarks — class instantiation
// =============================================================================

describe('Feature 7A: ComparativeBenchmarks — class instantiation', () => {
  it('can be instantiated with no args', () => {
    const bench = new ComparativeBenchmarks();
    expect(bench).toBeDefined();
  });

  it('can be instantiated with custom config', () => {
    const bench = new ComparativeBenchmarks({ iterations: 5, warmupIterations: 0 });
    expect(bench).toBeDefined();
  });

  it('has runAll method', () => {
    const bench = new ComparativeBenchmarks();
    expect(typeof bench.runAll).toBe('function');
  });

  it('has generateReport method', () => {
    const bench = new ComparativeBenchmarks();
    expect(typeof bench.generateReport).toBe('function');
  });
});

// =============================================================================
// Feature 7B: ComparativeBenchmarks — runAll() results shape
// (use minimal iterations for speed)
// =============================================================================

describe('Feature 7B: ComparativeBenchmarks — runAll() results', () => {
  let results: Awaited<ReturnType<ComparativeBenchmarks['runAll']>>;

  // Run once before all tests in this group
  beforeEach(async () => {
    if (!results) {
      const bench = new ComparativeBenchmarks({
        warmupIterations: 0,
        iterations: 5,
      });
      results = await bench.runAll();
    }
  }, 60000);

  it('runAll() returns a Promise', () => {
    const bench = new ComparativeBenchmarks({ warmupIterations: 0, iterations: 2 });
    expect(bench.runAll()).toBeInstanceOf(Promise);
  });

  it('returns an array', () => {
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns 5 benchmark results', () => {
    expect(results.length).toBe(5);
  });

  it('each result has a name string', () => {
    for (const r of results) {
      expect(typeof r.name).toBe('string');
      expect(r.name.length).toBeGreaterThan(0);
    }
  });

  it('each result has holoscript metrics', () => {
    for (const r of results) {
      expect(typeof r.holoscript).toBe('object');
      expect(r.holoscript).not.toBeNull();
    }
  });

  it('each holoscript metrics has opsPerSecond', () => {
    for (const r of results) {
      expect(typeof r.holoscript.opsPerSecond).toBe('number');
    }
  });

  it('each holoscript metrics has meanMs', () => {
    for (const r of results) {
      expect(typeof r.holoscript.meanMs).toBe('number');
    }
  });

  it('each holoscript metrics has p50Ms', () => {
    for (const r of results) {
      expect(typeof r.holoscript.p50Ms).toBe('number');
    }
  });

  it('each holoscript metrics has p95Ms', () => {
    for (const r of results) {
      expect(typeof r.holoscript.p95Ms).toBe('number');
    }
  });

  it('each holoscript metrics has p99Ms', () => {
    for (const r of results) {
      expect(typeof r.holoscript.p99Ms).toBe('number');
    }
  });

  it('each result has a winner string', () => {
    for (const r of results) {
      expect(typeof r.winner).toBe('string');
    }
  });

  it('winner is one of holoscript/unity/gltf', () => {
    const valid = new Set(['holoscript', 'unity', 'gltf']);
    for (const r of results) {
      expect(valid.has(r.winner)).toBe(true);
    }
  });

  it('each result has speedup number', () => {
    for (const r of results) {
      expect(typeof r.speedup).toBe('number');
    }
  });

  it('benchmark names are unique', () => {
    const names = results.map((r) => r.name);
    const unique = new Set(names);
    expect(unique.size).toBe(results.length);
  });
});

// =============================================================================
// Feature 8: ComparativeBenchmarks — generateReport()
// =============================================================================

describe('Feature 8: ComparativeBenchmarks — generateReport()', () => {
  it('generateReport() returns a string', async () => {
    const bench = new ComparativeBenchmarks({ warmupIterations: 0, iterations: 2 });
    const results = await bench.runAll();
    const report = bench.generateReport(results);
    expect(typeof report).toBe('string');
  });

  it('report contains HoloScript heading', async () => {
    const bench = new ComparativeBenchmarks({ warmupIterations: 0, iterations: 2 });
    const results = await bench.runAll();
    const report = bench.generateReport(results);
    expect(report).toContain('HoloScript');
  });

  it('report contains benchmark names', async () => {
    const bench = new ComparativeBenchmarks({ warmupIterations: 0, iterations: 2 });
    const results = await bench.runAll();
    const report = bench.generateReport(results);
    for (const r of results) {
      expect(report).toContain(r.name);
    }
  });

  it('report contains Summary section', async () => {
    const bench = new ComparativeBenchmarks({ warmupIterations: 0, iterations: 2 });
    const results = await bench.runAll();
    const report = bench.generateReport(results);
    expect(report).toContain('Summary');
  });

  it('report contains win rate percentages', async () => {
    const bench = new ComparativeBenchmarks({ warmupIterations: 0, iterations: 2 });
    const results = await bench.runAll();
    const report = bench.generateReport(results);
    expect(report).toMatch(/\d+%/);
  });
});

// =============================================================================
// Feature 9: runComparativeBenchmarks() convenience function
// =============================================================================

describe('Feature 9: runComparativeBenchmarks() convenience function', () => {
  it('is a function', () => {
    expect(typeof runComparativeBenchmarks).toBe('function');
  });

  it('returns a Promise', () => {
    const p = runComparativeBenchmarks({ warmupIterations: 0, iterations: 2 });
    expect(p).toBeInstanceOf(Promise);
    // Suppress unhandled rejection by catching
    p.catch(() => {});
  });

  it('resolves to object with results array', async () => {
    const { results } = await runComparativeBenchmarks({
      warmupIterations: 0,
      iterations: 2,
    });
    expect(Array.isArray(results)).toBe(true);
  });

  it('resolves to object with report string', async () => {
    const { report } = await runComparativeBenchmarks({
      warmupIterations: 0,
      iterations: 2,
    });
    expect(typeof report).toBe('string');
  });
});
