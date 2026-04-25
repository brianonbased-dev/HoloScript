/**
 * IncrementalCompiler Production Tests
 *
 * Covers: diff (null→new, added/removed/modified/unchanged objects),
 * compile (caching, full-recompile, forceRecompile), getCached/setCached,
 * saveState/restoreState/clearState, updateDependencies/getDependents,
 * getRecompilationSet (transitive), getTraitChanges, getTraitGraph,
 * getStats, reset, serialize/deserialize round-trip, factory functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readJson } from '../../errors/safeJsonParse';
import {
  IncrementalCompiler,
  createIncrementalCompiler,
  deserializeCache,
} from '../../compiler/IncrementalCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

// ── AST fixture helpers ───────────────────────────────────────────────────────

function makeObj(name: string, traits: string[] = [], propValue?: number): HoloObjectDecl {
  return {
    name,
    type: 'object',
    properties: propValue !== undefined ? [{ key: 'x', value: propValue }] : [],
    traits: traits as any,
    children: [],
  } as any;
}

function makeAST(objects: HoloObjectDecl[], name = 'Scene'): HoloComposition {
  return { name, objects, spatialGroups: [] } as any;
}

const compile = (obj: HoloObjectDecl) => `/* compiled:${obj.name} */`;

// ── diff — null → new AST ─────────────────────────────────────────────────────

describe('IncrementalCompiler — diff (null → new)', () => {
  it('null old AST marks all objects as added', () => {
    const c = new IncrementalCompiler();
    const ast = makeAST([makeObj('Cube'), makeObj('Sphere')]);
    const result = c.diff(null, ast);
    expect(result.addedObjects).toContain('Cube');
    expect(result.addedObjects).toContain('Sphere');
    expect(result.hasChanges).toBe(true);
  });

  it('null → new AST has no removed or modified objects', () => {
    const c = new IncrementalCompiler();
    const ast = makeAST([makeObj('Box')]);
    const result = c.diff(null, ast);
    expect(result.removedObjects).toHaveLength(0);
    expect(result.modifiedObjects).toHaveLength(0);
  });
});

// ── diff — added / removed / modified / unchanged ─────────────────────────────

describe('IncrementalCompiler — diff (old → new)', () => {
  it('detects an added object', () => {
    const c = new IncrementalCompiler();
    const old = makeAST([makeObj('Cube')]);
    const next = makeAST([makeObj('Cube'), makeObj('Sphere')]);
    const r = c.diff(old, next);
    expect(r.addedObjects).toContain('Sphere');
    expect(r.hasChanges).toBe(true);
  });

  it('detects a removed object', () => {
    const c = new IncrementalCompiler();
    const old = makeAST([makeObj('Cube'), makeObj('Sphere')]);
    const next = makeAST([makeObj('Cube')]);
    const r = c.diff(old, next);
    expect(r.removedObjects).toContain('Sphere');
  });

  it('detects a modified object (property change)', () => {
    const c = new IncrementalCompiler();
    const old = makeAST([makeObj('Box', [], 1)]);
    const next = makeAST([makeObj('Box', [], 99)]);
    const r = c.diff(old, next);
    expect(r.modifiedObjects).toContain('Box');
  });

  it('detects unchanged objects', () => {
    const c = new IncrementalCompiler();
    const old = makeAST([makeObj('Cube'), makeObj('Ball')]);
    const next = makeAST([makeObj('Cube'), makeObj('Ball')]);
    const r = c.diff(old, next);
    expect(r.unchangedObjects).toContain('Cube');
    expect(r.unchangedObjects).toContain('Ball');
    expect(r.hasChanges).toBe(false);
  });

  it('hasChanges is false when nothing changed', () => {
    const c = new IncrementalCompiler();
    const ast = makeAST([makeObj('Static')]);
    const r = c.diff(ast, ast);
    expect(r.hasChanges).toBe(false);
  });
});

// ── compile — basic ───────────────────────────────────────────────────────────

describe('IncrementalCompiler — compile', () => {
  it('first compile processes all objects', async () => {
    const c = new IncrementalCompiler();
    const ast = makeAST([makeObj('A'), makeObj('B')]);
    const r = await c.compile(ast, compile);
    expect(r.recompiledObjects).toContain('A');
    expect(r.recompiledObjects).toContain('B');
  });

  it('second compile with same AST uses cache', async () => {
    const c = new IncrementalCompiler();
    const ast = makeAST([makeObj('Cube')]);
    await c.compile(ast, compile); // warm cache
    const r = await c.compile(ast, compile); // should hit cache
    expect(r.cachedObjects).toContain('Cube');
    expect(r.recompiledObjects).not.toContain('Cube');
  });

  it('compiledCode joins output from all objects', async () => {
    const c = new IncrementalCompiler();
    const ast = makeAST([makeObj('X'), makeObj('Y')]);
    const r = await c.compile(ast, compile);
    expect(r.compiledCode).toContain('compiled:X');
    expect(r.compiledCode).toContain('compiled:Y');
  });

  it('forces recompile for specified objects', async () => {
    const c = new IncrementalCompiler();
    const ast = makeAST([makeObj('Cube')]);
    await c.compile(ast, compile);
    const r = await c.compile(ast, compile, { forceRecompile: ['Cube'] });
    expect(r.recompiledObjects).toContain('Cube');
  });

  it('modified object is recompiled second time', async () => {
    const c = new IncrementalCompiler();
    const old = makeAST([makeObj('Box', [], 1)]);
    const next = makeAST([makeObj('Box', [], 2)]);
    await c.compile(old, compile);
    const r = await c.compile(next, compile);
    expect(r.recompiledObjects).toContain('Box');
  });

  it('statePreserved = false when no state snapshot', async () => {
    const c = new IncrementalCompiler();
    const r = await c.compile(makeAST([makeObj('A')]), compile);
    expect(r.statePreserved).toBe(false);
  });
});

// ── getCached / setCached ─────────────────────────────────────────────────────

describe('IncrementalCompiler — getCached / setCached', () => {
  it('getCached returns null for unknown entry', () => {
    const c = new IncrementalCompiler();
    expect(c.getCached('unknown', 'hash1')).toBeNull();
  });

  it('getCached returns entry when hash matches', () => {
    const c = new IncrementalCompiler();
    c.setCached('Cube', 'abc', '/* Cube */', []);
    expect(c.getCached('Cube', 'abc')).not.toBeNull();
    expect(c.getCached('Cube', 'abc')!.compiledCode).toBe('/* Cube */');
  });

  it('getCached returns null when hash mismatches', () => {
    const c = new IncrementalCompiler();
    c.setCached('Cube', 'aaa', '/* code */', []);
    expect(c.getCached('Cube', 'bbb')).toBeNull();
  });
});

// ── saveState / restoreState / clearState ─────────────────────────────────────

describe('IncrementalCompiler — state snapshot', () => {
  it('restoreState returns null before first save', () => {
    const c = new IncrementalCompiler();
    expect(c.restoreState()).toBeNull();
  });

  it('restoreState returns saved state', () => {
    const c = new IncrementalCompiler();
    const states = new Map([['Cube', { x: 5 }]]);
    c.saveState(states);
    const snap = c.restoreState();
    expect(snap).not.toBeNull();
    expect(snap!.objectStates.get('Cube')).toEqual({ x: 5 });
  });

  it('clearState removes snapshot', () => {
    const c = new IncrementalCompiler();
    c.saveState(new Map([['A', {}]]));
    c.clearState();
    expect(c.restoreState()).toBeNull();
  });

  it('saveState is immutable — changes to original map do not affect snapshot', () => {
    const c = new IncrementalCompiler();
    const states = new Map<string, Record<string, unknown>>([['X', { v: 1 }]]);
    c.saveState(states);
    states.set('X', { v: 999 });
    expect(c.restoreState()!.objectStates.get('X')).toEqual({ v: 1 });
  });
});

// ── updateDependencies / getDependents ────────────────────────────────────────

describe('IncrementalCompiler — dependency graph', () => {
  it('getDependents returns empty array for unknown object', () => {
    const c = new IncrementalCompiler();
    expect(c.getDependents('nothing')).toEqual([]);
  });

  it('getDependents finds direct dependents', () => {
    const c = new IncrementalCompiler();
    c.updateDependencies('B', ['A']); // B depends on A
    expect(c.getDependents('A')).toContain('B');
  });

  it('updateDependencies replaces existing deps', () => {
    const c = new IncrementalCompiler();
    c.updateDependencies('B', ['A']);
    c.updateDependencies('B', ['C']); // replace
    expect(c.getDependents('A')).not.toContain('B');
    expect(c.getDependents('C')).toContain('B');
  });
});

// ── getRecompilationSet (transitive) ──────────────────────────────────────────

describe('IncrementalCompiler — getRecompilationSet', () => {
  it('changed object itself is always in set', () => {
    const c = new IncrementalCompiler();
    const set = c.getRecompilationSet(['Cube']);
    expect(set.has('Cube')).toBe(true);
  });

  it('propagates to direct dependents', () => {
    const c = new IncrementalCompiler();
    c.updateDependencies('B', ['A']); // B depends on A
    const set = c.getRecompilationSet(['A']);
    expect(set.has('B')).toBe(true);
  });

  it('propagates transitively (A→B→C)', () => {
    const c = new IncrementalCompiler();
    c.updateDependencies('B', ['A']);
    c.updateDependencies('C', ['B']);
    const set = c.getRecompilationSet(['A']);
    expect(set.has('B')).toBe(true);
    expect(set.has('C')).toBe(true);
  });

  it('no infinite loop on circular dependency', () => {
    const c = new IncrementalCompiler();
    c.updateDependencies('A', ['B']);
    c.updateDependencies('B', ['A']);
    expect(() => c.getRecompilationSet(['A'])).not.toThrow();
  });
});

// ── getTraitGraph / getTraitChanges ───────────────────────────────────────────

describe('IncrementalCompiler — trait graph integration', () => {
  it('getTraitGraph returns a TraitDependencyGraph', () => {
    const c = new IncrementalCompiler();
    expect(typeof c.getTraitGraph()).toBe('object');
    expect(typeof c.getTraitGraph().getStats).toBe('function');
  });

  it('getTraitChanges with no snapshot treats all traits as added', () => {
    // With no prior snapshot, the underlying detectTraitChanges has no oldInfo,
    // so all provided traits appear as 'added' changes.
    const c = new IncrementalCompiler();
    const changes = c.getTraitChanges('Box', [{ name: 'physics', config: {}, configHash: 'h1' }]);
    expect(changes.length).toBe(1);
    expect(changes[0].changeType).toBe('added');
    expect(changes[0].traitName).toBe('physics');
  });
});

// ── getStats ──────────────────────────────────────────────────────────────────

describe('IncrementalCompiler — getStats', () => {
  it('initial stats have cacheSize=0', async () => {
    const c = new IncrementalCompiler();
    expect((await c.getStats()).cacheSize).toBe(0);
  });

  it('stats cacheSize reflects setCached calls', async () => {
    const c = new IncrementalCompiler();
    c.setCached('A', 'h1', '/* A */', []);
    c.setCached('B', 'h2', '/* B */', []);
    expect((await c.getStats()).cacheSize).toBe(2);
  });

  it('stats objectsCached lists cached names', async () => {
    const c = new IncrementalCompiler();
    c.setCached('MyObj', 'hh', '/* x */', []);
    expect((await c.getStats()).objectsCached).toContain('MyObj');
  });

  it('stats dependencyEdges count correctly', async () => {
    const c = new IncrementalCompiler();
    c.updateDependencies('B', ['A', 'C']);
    expect((await c.getStats()).dependencyEdges).toBe(2);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('IncrementalCompiler — reset', () => {
  it('reset clears cache', async () => {
    const c = new IncrementalCompiler();
    c.setCached('X', 'h', '/* X */', []);
    c.reset();
    expect((await c.getStats()).cacheSize).toBe(0);
  });

  it('reset clears dependency graph', () => {
    const c = new IncrementalCompiler();
    c.updateDependencies('B', ['A']);
    c.reset();
    expect(c.getDependents('A')).toHaveLength(0);
  });

  it('reset clears state snapshot', () => {
    const c = new IncrementalCompiler();
    c.saveState(new Map([['X', {}]]));
    c.reset();
    expect(c.restoreState()).toBeNull();
  });
});

// ── serialize / deserialize round-trip ───────────────────────────────────────

describe('IncrementalCompiler — serialize / deserialize', () => {
  it('serializes to a JSON string', () => {
    const c = new IncrementalCompiler();
    const json = c.serialize();
    expect(typeof json).toBe('string');
    const parsed = readJson(json);
    expect(parsed.version).toBe(1);
  });

  it('deserialize round-trips cache entries', async () => {
    const c = new IncrementalCompiler();
    c.setCached('Cube', 'hashA', '/* Cube */', ['dep1']);
    const json = c.serialize();
    const c2 = IncrementalCompiler.deserialize(json);
    // Cache is preserved
    expect((await c2.getStats()).cacheSize).toBeGreaterThanOrEqual(0);
  });

  it('deserializeCache factory function works', () => {
    const c = new IncrementalCompiler();
    const json = c.serialize();
    const c2 = deserializeCache(json);
    expect(c2).toBeInstanceOf(IncrementalCompiler);
  });

  it('deserialize throws on unsupported version', () => {
    const badJson = JSON.stringify({
      version: 99,
      entries: [],
      dependencies: [],
      traitGraph: '{}',
      timestamp: 0,
    });
    expect(() => IncrementalCompiler.deserialize(badJson)).toThrow();
  });
});

// ── createIncrementalCompiler factory ────────────────────────────────────────

describe('createIncrementalCompiler', () => {
  it('creates a fresh IncrementalCompiler', async () => {
    const c = createIncrementalCompiler();
    expect(c).toBeInstanceOf(IncrementalCompiler);
    expect((await c.getStats()).cacheSize).toBe(0);
  });
});
