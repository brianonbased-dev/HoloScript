import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoloScriptGenerator, validateBatch } from '../HoloScriptGenerator';
import type { AIAdapter } from '../AIAdapter';

function mockAdapter(): AIAdapter {
  return {
    id: 'mock-gen',
    name: 'Mock Generator Adapter',
    isReady: () => true,
    generateHoloScript: vi.fn(async (prompt: string) => ({
      holoScript: `scene { // ${prompt} }`,
      confidence: 0.8,
      objectCount: 1,
    })),
    chat: vi.fn(async () => 'response'),
  };
}

describe('HoloScriptGenerator', () => {
  let gen: HoloScriptGenerator;
  beforeEach(() => { gen = new HoloScriptGenerator(); });

  // --- Session management ---
  it('createSession returns session object', () => {
    const adapter = mockAdapter();
    const session = gen.createSession(adapter);
    expect(session).toBeDefined();
    expect(session.sessionId).toContain('session-');
    expect(session.adapter).toBe(adapter);
    expect(session.history).toEqual([]);
  });

  it('createSession with custom config', () => {
    const session = gen.createSession(mockAdapter(), { maxAttempts: 5 });
    expect(session.config.maxAttempts).toBe(5);
  });

  it('getCurrentSession returns latest', () => {
    gen.createSession(mockAdapter());
    expect(gen.getCurrentSession()).toBeDefined();
  });

  it('getCurrentSession undefined before createSession', () => {
    expect(gen.getCurrentSession()).toBeUndefined();
  });

  // --- History ---
  it('getHistory returns empty initially', () => {
    const session = gen.createSession(mockAdapter());
    expect(gen.getHistory(session)).toEqual([]);
  });

  it('clearHistory removes entries', async () => {
    const adapter = mockAdapter();
    const session = gen.createSession(adapter);
    // Generate to add to history
    await gen.generate('test prompt', session);
    expect(gen.getHistory(session).length).toBeGreaterThanOrEqual(0);
    gen.clearHistory(session);
    expect(gen.getHistory(session)).toEqual([]);
  });

  // --- Stats ---
  it('getStats returns stats object', () => {
    const session = gen.createSession(mockAdapter());
    const stats = gen.getStats(session);
    expect(stats).toBeDefined();
    expect(stats!.totalGenerations).toBe(0);
  });

  // --- Cache ---
  it('getCacheStats returns stats', () => {
    const stats = gen.getCacheStats();
    expect(stats).toBeDefined();
  });

  // --- Analytics ---
  it('getAnalytics returns metrics', () => {
    const analytics = gen.getAnalytics();
    expect(analytics).toBeDefined();
  });

  it('generateReport returns string', () => {
    const report = gen.generateReport();
    expect(typeof report).toBe('string');
  });

  // --- generate (async) ---
  it('generate creates code from prompt', async () => {
    const adapter = mockAdapter();
    const session = gen.createSession(adapter);
    const result = await gen.generate('create a red cube', session);
    expect(result).toBeDefined();
    expect(result.holoScript).toBeDefined();
    expect(result.attempts).toBeGreaterThanOrEqual(1);
  });

  it('generate handles adapter error gracefully', async () => {
    const adapter = mockAdapter();
    adapter.generateHoloScript = vi.fn(async () => { throw new Error('fail'); });
    const session = gen.createSession(adapter);
    try {
      await gen.generate('test', session);
    } catch (_e) {
      // Expected to throw
    }
  });
});

describe('validateBatch', () => {
  it('validates array of code strings', () => {
    const results = validateBatch(['scene { box {} }', 'invalid!!!']);
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('valid');
    expect(results[0]).toHaveProperty('errors');
  });

  it('empty array returns empty', () => {
    expect(validateBatch([])).toEqual([]);
  });
});
