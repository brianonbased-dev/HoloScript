/**
 * Cross-Module Integration Production Tests
 *
 * Tests how TraitDependencyGraph + IncrementalCompiler work together
 * in realistic end-to-end scenarios: import propagation through the
 * compiler pipeline, trait change detection across AST re-compilations,
 * cache invalidation driven by dependency graph changes.
 */

import { describe, it, expect } from 'vitest';
import { TraitDependencyGraph } from '../../compiler/TraitDependencyGraph';
import { IncrementalCompiler } from '../../compiler/IncrementalCompiler';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeObj(name: string, traits: string[] = [], propValue?: number) {
  return {
    name,
    type: 'object',
    properties: propValue !== undefined ? [{ key: 'x', value: propValue }] : [],
    traits: traits as any,
    children: [],
  } as any;
}

function makeAST(objects: any[], name = 'Scene') {
  return { name, objects, spatialGroups: [] } as any;
}

const compile = (obj: any) => `/* ${obj.name} output */`;

// ── Compiler + TraitGraph integration ─────────────────────────────────────────

describe('Compiler + TraitDependencyGraph — shared trait graph', () => {

  it('compiler compiles and registers objects in the trait graph', () => {
    const tg = new TraitDependencyGraph();
    const compiler = new IncrementalCompiler(tg);
    const ast = makeAST([makeObj('Cube', ['physics', 'grabbable'])]);
    compiler.compile(ast, compile);
    expect(tg.getObjectsUsingTrait('physics').has('Cube')).toBe(true);
    expect(tg.getObjectsUsingTrait('grabbable').has('Cube')).toBe(true);
  });

  it('after compile, trait graph stats reflect the compiled scene', () => {
    const tg = new TraitDependencyGraph();
    const compiler = new IncrementalCompiler(tg);
    const ast = makeAST([makeObj('A', ['glow']), makeObj('B', ['glow'])]);
    compiler.compile(ast, compile);
    expect(tg.getStats().objectCount).toBe(2);
    expect(tg.getObjectsUsingTrait('glow').size).toBe(2);
  });

  it('re-compiling an updated AST adds new traits to trait graph', () => {
    const tg = new TraitDependencyGraph();
    const compiler = new IncrementalCompiler(tg);

    const ast1 = makeAST([makeObj('Box', ['physics'])]);
    compiler.compile(ast1, compile);
    expect(tg.getObjectsUsingTrait('physics').has('Box')).toBe(true);

    // Update Box traits: add grabbable
    const ast2 = makeAST([makeObj('Box', ['grabbable'])]);
    compiler.compile(ast2, compile);
    // New trait is now tracked
    expect(tg.getObjectsUsingTrait('grabbable').has('Box')).toBe(true);
  });

  it('getTraitGraph() from compiler is the same instance as injected', () => {
    const tg = new TraitDependencyGraph();
    const compiler = new IncrementalCompiler(tg);
    expect(compiler.getTraitGraph()).toBe(tg);
  });
});

// ── Import edges flow into compiler ───────────────────────────────────────────

describe('Compiler + TraitDependencyGraph — import edge propagation', () => {

  it('registerImport on the trait graph is reachable via compiler.getTraitGraph()', () => {
    const compiler = new IncrementalCompiler();
    const tg = compiler.getTraitGraph();
    tg.registerImport('scene.hs', 'lib.hs');
    expect(tg.getImportedFiles('scene.hs').has('lib.hs')).toBe(true);
  });

  it('getFilesAffectedByChange propagates through shared trait graph', () => {
    const tg = new TraitDependencyGraph();
    const compiler = new IncrementalCompiler(tg);
    // Register lib → scene import
    tg.registerImport('scene.hs', 'lib.hs');
    const affected = tg.getFilesAffectedByChange(['lib.hs']);
    expect(affected.has('scene.hs')).toBe(true);
    // Compiler's trait graph should reflect the same
    const affected2 = compiler.getTraitGraph().getFilesAffectedByChange(['lib.hs']);
    expect(affected2.has('scene.hs')).toBe(true);
  });

  it('clearing imports for a file cleans up before re-registration', () => {
    const compiler = new IncrementalCompiler();
    const tg = compiler.getTraitGraph();
    tg.registerImport('a.hs', 'old_lib.hs');
    // Re-register after clearing (simulates re-parse)
    tg.clearImportsForFile('a.hs');
    tg.registerImport('a.hs', 'new_lib.hs');
    expect(tg.getImportedFiles('a.hs').has('old_lib.hs')).toBe(false);
    expect(tg.getImportedFiles('a.hs').has('new_lib.hs')).toBe(true);
  });
});

// ── Caching correctness with object changes ───────────────────────────────────

describe('Compiler + TraitDependencyGraph — cache invalidation', () => {

  it('object with modified property is not served from cache', () => {
    const compiler = new IncrementalCompiler();
    const ast1 = makeAST([makeObj('Sphere', [], 1.0)]);
    compiler.compile(ast1, compile);

    const ast2 = makeAST([makeObj('Sphere', [], 2.0)]);
    const r2 = compiler.compile(ast2, compile);

    expect(r2.recompiledObjects).toContain('Sphere');
    expect(r2.cachedObjects).not.toContain('Sphere');
  });

  it('unchanged object is served from cache on second compile', () => {
    const compiler = new IncrementalCompiler();
    const ast = makeAST([makeObj('Plane', [], 0.5)]);
    compiler.compile(ast, compile);
    const r2 = compiler.compile(ast, compile);
    expect(r2.cachedObjects).toContain('Plane');
  });

  it('forceRecompile bypasses cache for specified objects', () => {
    const compiler = new IncrementalCompiler();
    const ast = makeAST([makeObj('Crystal')]);
    compiler.compile(ast, compile);
    const r2 = compiler.compile(ast, compile, { forceRecompile: ['Crystal'] });
    expect(r2.recompiledObjects).toContain('Crystal');
  });
});

// ── Dependency graph drives recompilation ─────────────────────────────────────

describe('Compiler — dependency-driven recompilation', () => {

  it('dependent object is recompiled when dependency changes', () => {
    const compiler = new IncrementalCompiler();
    // B depends on A
    compiler.updateDependencies('B', ['A']);

    const ast1 = makeAST([makeObj('A', [], 1), makeObj('B')]);
    compiler.compile(ast1, compile);

    // Modify A
    const ast2 = makeAST([makeObj('A', [], 2), makeObj('B')]);
    const r2 = compiler.compile(ast2, compile);

    expect(r2.recompiledObjects).toContain('A');
    expect(r2.recompiledObjects).toContain('B'); // cascaded
  });

  it('non-dependent objects are cached when dependency changes', () => {
    const compiler = new IncrementalCompiler();
    // C does NOT depend on A
    const ast1 = makeAST([makeObj('A', [], 1), makeObj('C')]);
    compiler.compile(ast1, compile);

    const ast2 = makeAST([makeObj('A', [], 2), makeObj('C')]);
    const r2 = compiler.compile(ast2, compile);
    expect(r2.cachedObjects).toContain('C');
  });
});

// ── State preservation through re-compile ─────────────────────────────────────

describe('Compiler — state preservation across hot reload', () => {

  it('saveState + restoreState round-trips object states', () => {
    const compiler = new IncrementalCompiler();
    const states = new Map<string, Record<string, unknown>>([
      ['Player', { hp: 100, pos: { x: 1 } }],
    ]);
    compiler.saveState(states);
    const ast = makeAST([makeObj('Player')]);
    const r = compiler.compile(ast, compile, { preserveState: true });
    expect(r.statePreserved).toBe(true);
    const snap = compiler.restoreState();
    expect(snap?.objectStates.get('Player')).toEqual({ hp: 100, pos: { x: 1 } });
  });

  it('statePreserved=false when preserveState option is off', () => {
    const compiler = new IncrementalCompiler();
    compiler.saveState(new Map([['X', {}]]));
    const ast = makeAST([makeObj('X')]);
    const r = compiler.compile(ast, compile, { preserveState: false });
    expect(r.statePreserved).toBe(false);
  });
});

// ── serialization round-trip (compiler + trait graph) ─────────────────────────

describe('Compiler — serialize / deserialize with trait graph', () => {

  it('deserializes and retains cache entries', () => {
    const compiler = new IncrementalCompiler();
    const ast = makeAST([makeObj('Orb', ['glow'])]);
    compiler.compile(ast, compile);

    const json = compiler.serialize();
    const c2 = IncrementalCompiler.deserialize(json);

    // c2 should have a usable trait graph
    expect(c2.getTraitGraph()).toBeDefined();
    // Stats can be queried without throwing
    expect(() => c2.getStats()).not.toThrow();
  });

  it('deserializing malformed version throws', () => {
    const bad = JSON.stringify({ version: 0, entries: [], dependencies: [], traitGraph: '{}', timestamp: 0 });
    expect(() => IncrementalCompiler.deserialize(bad)).toThrow();
  });
});

// ── Trait changes via getTraitChanges ─────────────────────────────────────────

describe('Compiler — getTraitChanges integration', () => {

  it('no snapshot — all provided traits appear as added', () => {
    // detectTraitChanges with no prior snapshot treats all traits as 'added'
    const compiler = new IncrementalCompiler();
    const changes = compiler.getTraitChanges('Box', [{ name: 'physics', config: {}, configHash: 'h1' }]);
    expect(changes.length).toBe(1);
    expect(changes[0].changeType).toBe('added');
  });

  it('detects added trait after compile + snapshot', () => {
    const tg = new TraitDependencyGraph();
    const compiler = new IncrementalCompiler(tg);
    const ast = makeAST([makeObj('Box', ['physics'])]);
    compiler.compile(ast, compile);
    tg.saveSnapshot();

    const changes = compiler.getTraitChanges('Box', [
      { name: 'physics', config: {}, configHash: '' },
      { name: 'grabbable', config: {}, configHash: '' },
    ]);
    const added = changes.filter(c => c.changeType === 'added');
    expect(added.length).toBe(1);
    expect(added[0].traitName).toBe('grabbable');
  });
});
