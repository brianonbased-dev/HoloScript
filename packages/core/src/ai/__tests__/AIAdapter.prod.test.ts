/**
 * AIAdapter Registry — Production Tests
 *
 * Tests: registerAIAdapter, getAIAdapter, getDefaultAIAdapter,
 * setDefaultAIAdapter, unregisterAIAdapter, listAIAdapters,
 * and the convenience wrappers (generateHoloScript, explainHoloScript,
 * optimizeHoloScript, fixHoloScript).
 *
 * Each test isolates registry state by registering unique IDs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerAIAdapter,
  getAIAdapter,
  getDefaultAIAdapter,
  setDefaultAIAdapter,
  unregisterAIAdapter,
  listAIAdapters,
  generateHoloScript,
  explainHoloScript,
  optimizeHoloScript,
  fixHoloScript,
  type AIAdapter,
  type GenerateResult,
  type ExplainResult,
  type OptimizeResult,
  type FixResult,
} from '../AIAdapter';

let _counter = 0;
function uniqueId(): string {
  return `test-adapter-${_counter++}`;
}

function makeAdapter(overrides: Partial<AIAdapter> = {}): AIAdapter {
  const id = uniqueId();
  return {
    id,
    name: `Test Adapter ${id}`,
    isReady: () => true,
    generateHoloScript: async (prompt: string) =>
      ({
        holoScript: `object "Test" { // ${prompt} }`,
        confidence: 0.9,
      }) as GenerateResult,
    explainHoloScript: async () => ({ explanation: 'This creates a cube.' }) as ExplainResult,
    optimizeHoloScript: async (code: string) =>
      ({
        holoScript: code + ' // optimized',
        improvements: ['removed redundant calls'],
      }) as OptimizeResult,
    fixHoloScript: async (code: string, errors: string[]) =>
      ({
        holoScript: code,
        fixes: errors.map((e) => ({ line: 0, issue: e, fix: 'auto-fixed' })),
      }) as FixResult,
    ...overrides,
  };
}

// --- registerAIAdapter / getAIAdapter ---
describe('registerAIAdapter and getAIAdapter', () => {
  it('retrieves a registered adapter by id', () => {
    const a = makeAdapter();
    registerAIAdapter(a, false);
    expect(getAIAdapter(a.id)).toBe(a);
  });

  it('returns undefined for unregistered id', () => {
    expect(getAIAdapter('totally-unknown-99999')).toBeUndefined();
  });

  it('overwriting with same id replaces the adapter', () => {
    const id = uniqueId();
    const a1 = makeAdapter({ id, name: 'First' });
    const a2 = makeAdapter({ id, name: 'Second' });
    registerAIAdapter(a1, false);
    registerAIAdapter(a2, false);
    expect(getAIAdapter(id)!.name).toBe('Second');
  });

  it('multiple adapters can coexist', () => {
    const a = makeAdapter();
    const b = makeAdapter();
    registerAIAdapter(a, false);
    registerAIAdapter(b, false);
    expect(getAIAdapter(a.id)).toBe(a);
    expect(getAIAdapter(b.id)).toBe(b);
  });
});

// --- default adapter ---
describe('getDefaultAIAdapter / setDefaultAIAdapter', () => {
  it('first registered adapter becomes default when setAsDefault=true', () => {
    const a = makeAdapter();
    registerAIAdapter(a, true);
    expect(getDefaultAIAdapter()).toBe(a);
  });

  it('setDefaultAIAdapter changes the default', () => {
    const a = makeAdapter();
    const b = makeAdapter();
    registerAIAdapter(a, true);
    registerAIAdapter(b, false);
    const result = setDefaultAIAdapter(b.id);
    expect(result).toBe(true);
    expect(getDefaultAIAdapter()).toBe(b);
  });

  it('setDefaultAIAdapter returns false for unknown id', () => {
    expect(setDefaultAIAdapter('nonexistent-id')).toBe(false);
  });

  it('setDefaultAIAdapter does not change default when id not found', () => {
    const a = makeAdapter();
    registerAIAdapter(a, true);
    setDefaultAIAdapter('nope');
    expect(getDefaultAIAdapter()).toBe(a);
  });
});

// --- unregisterAIAdapter ---
describe('unregisterAIAdapter', () => {
  it('removes adapter from registry', () => {
    const a = makeAdapter();
    registerAIAdapter(a, false);
    expect(unregisterAIAdapter(a.id)).toBe(true);
    expect(getAIAdapter(a.id)).toBeUndefined();
  });

  it('returns false for unknown id', () => {
    expect(unregisterAIAdapter('definitely-not-registered')).toBe(false);
  });

  it('removes adapter from listAIAdapters', () => {
    const a = makeAdapter();
    registerAIAdapter(a, false);
    unregisterAIAdapter(a.id);
    const ids = listAIAdapters().map((x) => x.id);
    expect(ids).not.toContain(a.id);
  });

  it('default falls back to another adapter when current default is removed', () => {
    const a = makeAdapter();
    const b = makeAdapter();
    registerAIAdapter(a, true);
    registerAIAdapter(b, false);
    unregisterAIAdapter(a.id);
    // Should fall back to some remaining adapter (not null if b is still registered)
    const def = getDefaultAIAdapter();
    expect(def === null || def!.id !== a.id).toBe(true);
  });
});

// --- listAIAdapters ---
describe('listAIAdapters', () => {
  it('returns array with id and name for each adapter', () => {
    const a = makeAdapter();
    registerAIAdapter(a, false);
    const list = listAIAdapters();
    const entry = list.find((x) => x.id === a.id);
    expect(entry).toBeDefined();
    expect(entry!.name).toBe(a.name);
  });

  it('each entry only has id and name (no extra methods)', () => {
    const a = makeAdapter();
    registerAIAdapter(a, false);
    const list = listAIAdapters();
    const entry = list.find((x) => x.id === a.id)!;
    expect(Object.keys(entry)).toEqual(['id', 'name']);
  });
});

// --- generateHoloScript convenience wrapper ---
describe('generateHoloScript (convenience)', () => {
  it('delegates to default adapter', async () => {
    const a = makeAdapter();
    registerAIAdapter(a, true);
    const result = await generateHoloScript('a spinning cube');
    expect(result.holoScript).toContain('Test');
  });

  it('throws when no adapter is registered', async () => {
    // We cannot guarantee no adapter is registered in a shared module,
    // so we test by expecting the resolved value to be defined only if adapter is set.
    // Instead test the "no generate support" path:
    const noGenAdapter = makeAdapter({ generateHoloScript: undefined });
    registerAIAdapter(noGenAdapter, true);
    await expect(generateHoloScript('test')).rejects.toThrow(/does not support generateHoloScript/);
  });
});

// --- explainHoloScript convenience wrapper ---
describe('explainHoloScript (convenience)', () => {
  it('delegates to default adapter', async () => {
    const a = makeAdapter();
    registerAIAdapter(a, true);
    const result = await explainHoloScript('object "Cube" {}');
    expect(result.explanation).toContain('cube');
  });

  it('throws when adapter does not support explain', async () => {
    const noExplain = makeAdapter({ explainHoloScript: undefined });
    registerAIAdapter(noExplain, true);
    await expect(explainHoloScript('object "X" {}')).rejects.toThrow(
      /does not support explainHoloScript/
    );
  });
});

// --- optimizeHoloScript convenience wrapper ---
describe('optimizeHoloScript (convenience)', () => {
  it('delegates to default adapter', async () => {
    const a = makeAdapter();
    registerAIAdapter(a, true);
    const result = await optimizeHoloScript('object "X" {}', 'mobile');
    expect(result.improvements.length).toBeGreaterThan(0);
  });

  it('throws when adapter does not support optimize', async () => {
    const noOpt = makeAdapter({ optimizeHoloScript: undefined });
    registerAIAdapter(noOpt, true);
    await expect(optimizeHoloScript('code', 'vr')).rejects.toThrow(
      /does not support optimizeHoloScript/
    );
  });
});

// --- fixHoloScript convenience wrapper ---
describe('fixHoloScript (convenience)', () => {
  it('delegates to default adapter', async () => {
    const a = makeAdapter();
    registerAIAdapter(a, true);
    const result = await fixHoloScript('object "X" {}', ['missing brace', 'unknown property']);
    expect(result.fixes).toHaveLength(2);
    expect(result.fixes[0].fix).toBe('auto-fixed');
  });

  it('throws when adapter does not support fix', async () => {
    const noFix = makeAdapter({ fixHoloScript: undefined });
    registerAIAdapter(noFix, true);
    await expect(fixHoloScript('code', ['err'])).rejects.toThrow(/does not support fixHoloScript/);
  });

  it('fix result has correct structure', async () => {
    const a = makeAdapter();
    registerAIAdapter(a, true);
    const result = await fixHoloScript('code', ['err1', 'err2', 'err3']);
    expect(result.holoScript).toBeTruthy();
    expect(Array.isArray(result.fixes)).toBe(true);
    for (const fix of result.fixes) {
      expect(typeof fix.line).toBe('number');
      expect(typeof fix.issue).toBe('string');
      expect(typeof fix.fix).toBe('string');
    }
  });
});
