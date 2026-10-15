import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { HoloScriptGenerator, validateBatch, validateHoloScript } from '../HoloScriptGenerator';
import type { AIAdapter } from '../AIAdapter';

const VALID = 'composition "Red Cube" {\n  object "Cube" @grabbable {\n    geometry: "box"\n    color: "red"\n  }\n}';
const UNKNOWN_TRAIT = 'composition "Odd" {\n  object "Cube" @nope_xyz_trait {\n    geometry: "box"\n  }\n}';
const GRABBABLE_BLOCK = 'composition "Grab" {\n  object "Ball" {\n    @grabbable { snap_to_hand: true }\n    @hand_tracked\n    geometry: "sphere"\n  }\n}';
const REPO = resolve(__dirname, '../../../../..');
const GARBAGE = '{{{@@@';
const UNCLOSED = 'composition "Open" { // comment swallows the brace }';

function mockAdapter(code: string = VALID, confidence = 0.9): AIAdapter {
  return {
    id: 'mock-gen',
    name: 'Mock Generator Adapter',
    isReady: () => true,
    generateHoloScript: vi.fn(async () => ({ holoScript: code, confidence, objectCount: 1 })),
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
    expect(session.sessionId).toContain('session-');
    expect(session.adapter).toBe(adapter);
    expect(session.history).toEqual([]);
  });

  it('createSession with custom config', () => {
    const session = gen.createSession(mockAdapter(), { maxAttempts: 5 });
    expect(session.config.maxAttempts).toBe(5);
  });

  it('getCurrentSession returns latest', () => {
    const s = gen.createSession(mockAdapter());
    expect(gen.getCurrentSession()).toBe(s);
  });

  it('getCurrentSession undefined before createSession', () => {
    expect(gen.getCurrentSession()).toBeUndefined();
  });

  // --- History (P2-7: was `length >= 0`, which can never fail) ---
  it('generate records exactly one history entry, and clearHistory empties it', async () => {
    const session = gen.createSession(mockAdapter());
    await gen.generate('test prompt', session);
    const history = gen.getHistory(session);
    expect(history).toHaveLength(1);
    expect(history[0]!.prompt).toBe('test prompt');
    expect(history[0]!.generated.holoScript).toBe(VALID);
    gen.clearHistory(session);
    expect(gen.getHistory(session)).toEqual([]);
  });

  // --- Stats / cache / analytics ---
  it('getStats counts real parse successes', async () => {
    const session = gen.createSession(mockAdapter());
    expect(gen.getStats(session)!.totalGenerations).toBe(0);
    await gen.generate('a cube', session);
    const stats = gen.getStats(session)!;
    expect(stats.totalGenerations).toBe(1);
    expect(stats.successCount).toBe(1);
  });

  it('getCacheStats / getAnalytics / generateReport are defined', () => {
    expect(gen.getCacheStats()).toBeDefined();
    expect(gen.getAnalytics()).toBeDefined();
    expect(typeof gen.generateReport()).toBe('string');
  });

  // --- generate: real parser ---
  it('valid output parses with success and no errors', async () => {
    const session = gen.createSession(mockAdapter());
    const result = await gen.generate('create a red cube', session);
    expect(result.holoScript).toBe(VALID);
    expect(result.parseResult.success).toBe(true);
    expect(result.parseResult.errors).toHaveLength(0);
    expect(result.attempts).toBe(1);
  });

  it('garbage output is reported as a parse failure, never success', async () => {
    const session = gen.createSession(mockAdapter(GARBAGE), { maxAttempts: 1, autoFix: false });
    const result = await gen.generate('make garbage', session);
    expect(result.parseResult.success).toBe(false);
    expect(result.parseResult.errors.length).toBeGreaterThan(0);
    expect(gen.getStats(session)!.successCount).toBe(0);
  });

  it('an unclosed block is a parse failure', async () => {
    const session = gen.createSession(mockAdapter(UNCLOSED), { maxAttempts: 1, autoFix: false });
    const result = await gen.generate('unclosed', session);
    expect(result.parseResult.success).toBe(false);
  });

  it('empty output is a failure, not an empty-but-valid program', async () => {
    const session = gen.createSession(mockAdapter('   \n'), { maxAttempts: 1, autoFix: false });
    const result = await gen.generate('empty', session);
    expect(result.parseResult.success).toBe(false);
  });

  it('never caches invalid output: a second identical prompt calls the adapter again', async () => {
    const adapter = mockAdapter(GARBAGE);
    const session = gen.createSession(adapter, { maxAttempts: 1, autoFix: false });
    await gen.generate('same prompt', session);
    await gen.generate('same prompt', session);
    expect(adapter.generateHoloScript).toHaveBeenCalledTimes(2);
  });

  it('caches valid output: a second identical prompt is served from cache', async () => {
    const adapter = mockAdapter(VALID);
    const session = gen.createSession(adapter);
    await gen.generate('same prompt', session);
    const second = await gen.generate('same prompt', session);
    expect(adapter.generateHoloScript).toHaveBeenCalledTimes(1);
    expect(second.parseResult.success).toBe(true);
  });

  it('auto-fix replaces invalid output with the adapter fix when the fix parses', async () => {
    const adapter = mockAdapter(GARBAGE);
    adapter.fixHoloScript = vi.fn(async () => ({ holoScript: VALID, fixes: [], confidence: 0.9 }) as any);
    const session = gen.createSession(adapter, { maxAttempts: 2, autoFix: true });
    const result = await gen.generate('fix me', session);
    expect(adapter.fixHoloScript).toHaveBeenCalledTimes(1);
    const errorsSent = (adapter.fixHoloScript as any).mock.calls[0][1] as string[];
    expect(errorsSent.length).toBeGreaterThan(0);
    expect(result.wasFixed).toBe(true);
    expect(result.holoScript).toBe(VALID);
    expect(result.parseResult.success).toBe(true);
  });

  // --- adapter error (P2-7: the old test passed whether or not it threw) ---
  it('adapter error rejects with the adapter message after maxAttempts and records nothing', async () => {
    const adapter = mockAdapter();
    adapter.generateHoloScript = vi.fn(async () => {
      throw new Error('upstream 503');
    });
    const session = gen.createSession(adapter, { maxAttempts: 2 });
    await expect(gen.generate('test', session)).rejects.toThrow('upstream 503');
    expect(adapter.generateHoloScript).toHaveBeenCalledTimes(2);
    expect(gen.getHistory(session)).toEqual([]);
  });

  it('fix() on valid code returns it unchanged without calling the adapter', async () => {
    const adapter = mockAdapter();
    adapter.fixHoloScript = vi.fn();
    const session = gen.createSession(adapter);
    const r = await gen.fix(VALID, session);
    expect(r.wasFixed).toBe(false);
    expect(r.parseResult.success).toBe(true);
    expect(adapter.fixHoloScript).not.toHaveBeenCalled();
  });
});

describe('validateHoloScript', () => {
  it('accepts valid code and rejects garbage, empty and unclosed code', () => {
    expect(validateHoloScript(VALID).success).toBe(true);
    for (const bad of [GARBAGE, '', '   ', UNCLOSED, 'invalid!!!']) {
      const r = validateHoloScript(bad);
      expect(r.success, JSON.stringify(bad)).toBe(false);
      expect(r.errors.length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });

  it('a parser that throws yields a failure, not success', () => {
    const throwing = { parse: () => { throw new Error('boom'); } } as any;
    const r = validateHoloScript(VALID, throwing);
    expect(r.success).toBe(false);
    expect(String((r.errors[0] as any).message)).toContain('boom');
  });
});

describe('validateBatch (P2-7: was shape-only)', () => {
  it('flags invalid entries and passes valid ones', () => {
    const results = validateBatch([VALID, 'invalid!!!', GARBAGE, '']);
    expect(results.map((r) => r.valid)).toEqual([true, false, false, false]);
    expect(results[0]!.errors).toBe(0);
    for (const r of results.slice(1)) expect(r.errors).toBeGreaterThan(0);
  });

  it('empty array returns empty', () => {
    expect(validateBatch([])).toEqual([]);
  });
});

describe('HS1006 unknown trait is a warning (ERROR_CONTRACT.md), garbage still fails (twin)', () => {
  it('a composition with an unknown trait passes, with an HS1006 warning', () => {
    const r = validateHoloScript(UNKNOWN_TRAIT) as any;
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
    const w = r.warnings.find((x: any) => x.code === 'HS1006');
    expect(w).toBeDefined();
    expect(w.severity).toBe('warning');
    expect(w.message).toContain('nope_xyz_trait');
  });

  it('twin: garbage, empty, comment-only and unclosed input still fail with errors', () => {
    for (const bad of [GARBAGE, '', '  \n', '// only a comment', UNCLOSED, 'composition "A" {', 'SELECT * FROM users;']) {
      const r = validateHoloScript(bad) as any;
      expect(r.success, JSON.stringify(bad)).toBe(false);
      expect(r.errors.length, JSON.stringify(bad)).toBeGreaterThan(0);
      expect(r.errors.every((e: any) => e.severity === 'error'), JSON.stringify(bad)).toBe(true);
    }
  });

  it('generate() accepts and caches an unknown-trait composition (no retry burned)', async () => {
    const gen = new HoloScriptGenerator();
    const adapter = mockAdapter(UNKNOWN_TRAIT);
    const session = gen.createSession(adapter, { maxAttempts: 3 });
    const first = await gen.generate('odd cube', session);
    expect(first.parseResult.success).toBe(true);
    expect(first.attempts).toBe(1);
    await gen.generate('odd cube', session);
    expect(adapter.generateHoloScript).toHaveBeenCalledTimes(1);
  });

  it('the @grabbable { } block form and @hand_tracked pass', () => {
    const r = validateHoloScript(GRABBABLE_BLOCK);
    expect(r.success, JSON.stringify(r.errors)).toBe(true);
  });
});

describe('repo sample check: real compositions pass', () => {
  const benchDir = resolve(REPO, 'benchmarks/cross-compilation/compositions');
  const bench = readdirSync(benchDir).filter((f) => f.endsWith('.holo'));
  it('finds the benchmark compositions', () => {
    expect(bench.length).toBeGreaterThan(0);
  });
  for (const f of bench) {
    it(`benchmark ${f} passes`, () => {
      const r = validateHoloScript(readFileSync(resolve(benchDir, f), 'utf8'));
      expect(r.success, JSON.stringify(r.errors.slice(0, 3))).toBe(true);
    });
  }
  for (const f of ['examples/perception-tests/02-physics-blocks.holo', 'examples/perception-tests/06-integrated-perception-stack.holo', 'examples/quickstart/1-floating-cyan-orb.refreshed.holo', 'examples/traits/interaction-grabbable-clickable-hoverable.holo']) {
    it(`@grabbable { } sample ${f} passes`, () => {
      const src = readFileSync(resolve(REPO, f), 'utf8');
      expect(src).toContain('@grabbable {');
      const r = validateHoloScript(src);
      expect(r.success, JSON.stringify(r.errors.slice(0, 3))).toBe(true);
    });
  }
});
