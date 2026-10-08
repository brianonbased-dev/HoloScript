import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoloScriptGenerator, validateBatch } from '../HoloScriptGenerator';
import type { AIAdapter } from '../AIAdapter';
import { HOLOSCRIPT_EXAMPLE_PROGRAM } from '@holoscript/llm-provider';

function mockAdapter(): AIAdapter {
  return {
    id: 'mock-gen',
    name: 'Mock Generator Adapter',
    isReady: () => true,
    generateHoloScript: vi.fn(async (prompt: string) => ({
      holoScript: `composition "${prompt}" {
  object "Cube" { geometry: "cube" }
}`,
      confidence: 0.8,
      objectCount: 1,
    })),
    chat: vi.fn(async () => 'response'),
  };
}

describe('HoloScriptGenerator', () => {
  let gen: HoloScriptGenerator;
  beforeEach(() => {
    gen = new HoloScriptGenerator();
  });

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
    adapter.generateHoloScript = vi.fn(async () => {
      throw new Error('fail');
    });
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

// Until 2026-10-08 the generator "parsed" with a local stand-in that returned success
// for any text: every generation passed, validateBatch called everything valid and
// auto-fix never ran. It now checks with core's canonical .holo validator.
describe('the generator checks what the model wrote', () => {
  const notHoloScript: Array<[string, string]> = [
    ['symbol noise', '{{{@@@'],
    ['an SQL statement', 'SELECT * FROM users;'],
    ['JSON', '{"scene": {"objects": []}}'],
    ['a chatty reply', 'Sure! Here is your scene.'],
    ['an empty answer', ''],
    ['an unclosed program', 'composition "Open" {\n  object "A" { geometry: "cube" }\n'],
  ];

  it.each(notHoloScript)('validateBatch refuses %s', (_label, code) => {
    const [result] = validateBatch([code]);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeGreaterThan(0);
  });

  it('validateBatch accepts a real program', () => {
    expect(validateBatch([HOLOSCRIPT_EXAMPLE_PROGRAM])).toEqual([
      { code: HOLOSCRIPT_EXAMPLE_PROGRAM, valid: true, errors: 0 },
    ]);
  });

  it('runs auto-fix on refused output, passes the refusal codes, and keeps the fixed program', async () => {
    const fixHoloScript = vi.fn(async (_code: string, _errors: string[]) => ({
      holoScript: HOLOSCRIPT_EXAMPLE_PROGRAM,
      fixes: [],
    }));
    const adapter: AIAdapter = {
      ...mockAdapter(),
      generateHoloScript: vi.fn(async () => ({ holoScript: '{{{@@@', confidence: 0.9 })),
      fixHoloScript,
    };
    const gen = new HoloScriptGenerator(false);

    const result = await gen.generate('a red cube', gen.createSession(adapter));

    expect(fixHoloScript).toHaveBeenCalledTimes(1);
    const errors = fixHoloScript.mock.calls[0][1];
    expect(errors.join('\n')).toMatch(/HS100\d/);
    expect(result.wasFixed).toBe(true);
    expect(result.parseResult.success).toBe(true);
    expect(result.holoScript).toBe(HOLOSCRIPT_EXAMPLE_PROGRAM);
  });

  it('returns refused output marked invalid when the adapter cannot fix, instead of a misleading throw', async () => {
    const generateHoloScript = vi.fn(async () => ({ holoScript: 'SELECT 1;', confidence: 0.9 }));
    const adapter: AIAdapter = { ...mockAdapter(), generateHoloScript };
    const gen = new HoloScriptGenerator(false);

    const result = await gen.generate('x', gen.createSession(adapter, { maxAttempts: 2 }));

    expect(generateHoloScript).toHaveBeenCalledTimes(2);
    expect(result.parseResult.success).toBe(false);
    expect(result.parseResult.errors[0].message).toMatch(/^HS100\d: /);
    expect(gen.getStats()?.successCount).toBe(0);
  });
});
