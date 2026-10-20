/**
 * HotReloadPipeline: a cleared or comment-only buffer (HS1001 since #563) resets
 * the preview to an empty scene instead of pushing an error and keeping the old
 * scene. Twin: fails on main (no parser injection, error path taken).
 */
import { describe, it, expect, vi } from 'vitest';
import { HotReloadPipeline } from './HotReloadPipeline';

// The diff itself is not under test: any change between scenes is one mutation.
vi.mock('./SceneDiffer', () => ({
  diffScenes: (a: unknown, b: unknown) => ({ mutations: a === b ? [] : [{ type: 'replace' }], affectedObjectNames: [] }),
}));

const HS1001 = { message: 'Source is empty (HS1001)', code: 'HS1001', line: 1 };
const empty = { type: 'Composition', name: 'untitled', objects: [] } as any;
const full = { type: 'Composition', name: 'scene', objects: [{ name: 'cube', type: 'Object' }] } as any;

function makeBridge() {
  return { reset: vi.fn(), apply: vi.fn() } as any;
}

function makeParser() {
  return {
    parse: vi.fn((code: string) =>
      code.replace(/\/\/[^\n]*/g, '').trim() === ''
        ? { success: false, ast: empty, errors: [HS1001] }
        : code.includes('broken')
          ? { success: false, errors: [{ message: 'Unexpected token', code: 'HS0002' }] }
          : { success: true, ast: full, errors: [] }
    ),
  };
}

describe('HotReloadPipeline blank buffer (HS1001)', () => {
  it('loads a comment-only new scene as an empty composition with no error', () => {
    const parser = makeParser();
    const p = new HotReloadPipeline(makeBridge(), { createParser: () => parser as any });
    const r = p.loadFromString('// start here\n');
    expect(parser.parse).toHaveBeenCalled();
    expect(r).toEqual({ ast: empty, errors: [] });
  });

  it('clearing the editor resets the preview to empty instead of pushing an error', async () => {
    const parser = makeParser();
    const bridge = makeBridge();
    const p = new HotReloadPipeline(bridge, { createParser: () => parser as any, fullSceneFallbackThreshold: true, maxMutationsBeforeFallback: 0 });
    const updates: any[] = [];
    p.onLiveUpdate = (m) => updates.push(m);
    await p.processCodeUpdate('composition scene { object cube {} }');
    const r = await p.processCodeUpdate('');
    expect(r.errors).toEqual([]);
    expect(p.getLastAST()).toBe(empty);
    expect(updates.some((m) => m.type === 'error')).toBe(false);
  });

  it('a real syntax error is still an error', async () => {
    const parser = makeParser();
    const p = new HotReloadPipeline(makeBridge(), { createParser: () => parser as any });
    const r = await p.processCodeUpdate('composition broken {');
    expect(r.ast).toBeNull();
    expect(r.errors[0]).toContain('Unexpected token');
  });
});
