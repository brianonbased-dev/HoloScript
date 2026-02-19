/**
 * IncrementalCompiler — Production Test Suite
 *
 * Tests public API only: diff(), compile(), cache management,
 * state snapshots, dependency graph, stats, serialize/deserialize.
 */
import { describe, it, expect } from 'vitest';
import { IncrementalCompiler } from '../IncrementalCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

// ─── Helpers ────────────────────────────────────────────────────────
function makeObj(name: string, props: Array<{ key: string; value: unknown }> = [], traits: unknown[] = []): HoloObjectDecl {
  return { name, properties: props, traits, children: [] } as HoloObjectDecl;
}

function makeComp(name: string, objects: HoloObjectDecl[] = []): HoloComposition {
  return { name, objects, spatialGroups: [] } as HoloComposition;
}

describe('IncrementalCompiler — Production', () => {
  // ─── Diff: Added / Removed / Modified / Unchanged ─────────────────
  it('diff detects added objects', () => {
    const ic = new IncrementalCompiler();
    const oldAST = makeComp('Scene', [makeObj('A')]);
    const newAST = makeComp('Scene', [makeObj('A'), makeObj('B')]);
    const result = ic.diff(oldAST, newAST);
    expect(result.hasChanges).toBe(true);
    expect(result.addedObjects).toContain('B');
  });

  it('diff detects removed objects', () => {
    const ic = new IncrementalCompiler();
    const oldAST = makeComp('Scene', [makeObj('A'), makeObj('B')]);
    const newAST = makeComp('Scene', [makeObj('A')]);
    const result = ic.diff(oldAST, newAST);
    expect(result.removedObjects).toContain('B');
  });

  it('diff detects modified properties', () => {
    const ic = new IncrementalCompiler();
    const oldAST = makeComp('Scene', [makeObj('A', [{ key: 'x', value: 1 }])]);
    const newAST = makeComp('Scene', [makeObj('A', [{ key: 'x', value: 2 }])]);
    const result = ic.diff(oldAST, newAST);
    expect(result.modifiedObjects).toContain('A');
  });

  it('diff reports no changes for identical ASTs', () => {
    const ic = new IncrementalCompiler();
    const ast = makeComp('Scene', [makeObj('A', [{ key: 'x', value: 1 }])]);
    const result = ic.diff(ast, ast);
    expect(result.hasChanges).toBe(false);
    expect(result.unchangedObjects).toContain('A');
  });

  it('diff from null old AST treats all as added', () => {
    const ic = new IncrementalCompiler();
    const newAST = makeComp('Scene', [makeObj('A'), makeObj('B')]);
    const result = ic.diff(null, newAST);
    expect(result.hasChanges).toBe(true);
    expect(result.addedObjects.length).toBe(2);
  });

  // ─── Cache ────────────────────────────────────────────────────────
  it('getCached returns null for unknown object', () => {
    const ic = new IncrementalCompiler();
    expect(ic.getCached('unknown', 'abc')).toBeNull();
  });

  it('setCached + getCached round-trip', () => {
    const ic = new IncrementalCompiler();
    ic.setCached('A', 'hash1', 'code_A', ['B']);
    const entry = ic.getCached('A', 'hash1');
    expect(entry).not.toBeNull();
    expect(entry!.compiledCode).toBe('code_A');
  });

  it('getCached returns null on hash mismatch', () => {
    const ic = new IncrementalCompiler();
    ic.setCached('A', 'hash1', 'code_A', []);
    expect(ic.getCached('A', 'different_hash')).toBeNull();
  });

  // ─── State Snapshots ──────────────────────────────────────────────
  it('saveState + restoreState round-trip', () => {
    const ic = new IncrementalCompiler();
    const states = new Map<string, Record<string, unknown>>();
    states.set('Player', { health: 100 });
    ic.saveState(states);
    const restored = ic.restoreState();
    expect(restored).not.toBeNull();
    expect(restored!.objectStates.get('Player')).toEqual({ health: 100 });
  });

  it('clearState removes snapshot', () => {
    const ic = new IncrementalCompiler();
    ic.saveState(new Map());
    ic.clearState();
    expect(ic.restoreState()).toBeNull();
  });

  // ─── Dependency Graph ─────────────────────────────────────────────
  it('updateDependencies + getDependents', () => {
    const ic = new IncrementalCompiler();
    ic.updateDependencies('B', ['A']); // B depends on A
    expect(ic.getDependents('A')).toContain('B');
  });

  it('getDependents returns empty for no dependents', () => {
    const ic = new IncrementalCompiler();
    expect(ic.getDependents('nobody')).toEqual([]);
  });

  // ─── Stats ────────────────────────────────────────────────────────
  it('getStats reports cache and dependency info', () => {
    const ic = new IncrementalCompiler();
    ic.setCached('A', 'h', 'code', []);
    ic.updateDependencies('B', ['A']);
    const stats = ic.getStats();
    expect(stats.cacheSize).toBe(1);
    expect(stats.objectsCached).toContain('A');
    expect(stats.dependencyEdges).toBe(1);
  });

  // ─── Reset ────────────────────────────────────────────────────────
  it('reset clears all state', () => {
    const ic = new IncrementalCompiler();
    ic.setCached('A', 'h', 'code', []);
    ic.saveState(new Map());
    ic.updateDependencies('B', ['A']);
    ic.reset();
    expect(ic.getCached('A', 'h')).toBeNull();
    expect(ic.restoreState()).toBeNull();
    expect(ic.getDependents('A')).toEqual([]);
  });

  // ─── Compile ──────────────────────────────────────────────────────
  it('compile invokes compileObject for each object', () => {
    const ic = new IncrementalCompiler();
    const ast = makeComp('Scene', [makeObj('A'), makeObj('B')]);
    const compiled: string[] = [];
    const result = ic.compile(ast, (obj) => {
      compiled.push(obj.name);
      return `code_${obj.name}`;
    });
    expect(compiled.sort()).toEqual(['A', 'B']);
    expect(result.recompiledObjects.sort()).toEqual(['A', 'B']);
    expect(result.compiledCode).toContain('code_A');
  });
});
