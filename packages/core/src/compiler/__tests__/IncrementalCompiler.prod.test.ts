/**
 * IncrementalCompiler — Production Test Suite
 *
 * Tests public API only: diff(), compile(), cache management,
 * state snapshots, dependency graph, stats, serialize/deserialize.
 */
import { describe, it, expect, vi } from 'vitest';
import { IncrementalCompiler } from '../IncrementalCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────
function makeObj(
  name: string,
  props: Array<{ key: string; value: unknown }> = [],
  traits: unknown[] = []
): HoloObjectDecl {
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
  it('getStats reports cache and dependency info', async () => {
    const ic = new IncrementalCompiler();
    ic.setCached('A', 'h', 'code', []);
    ic.updateDependencies('B', ['A']);
    const stats = await ic.getStats();
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
  it('compile invokes compileObject for each object', async () => {
    const ic = new IncrementalCompiler();
    const ast = makeComp('Scene', [makeObj('A'), makeObj('B')]);
    const compiled: string[] = [];
    const result = await ic.compile(ast, (obj) => {
      compiled.push(obj.name);
      return `code_${obj.name}`;
    });
    expect(compiled.sort()).toEqual(['A', 'B']);
    expect(result.recompiledObjects.sort()).toEqual(['A', 'B']);
    expect(result.compiledCode).toContain('code_A');
  });

  // ─── resolveImports (Asset Pipeline) ────────────────────────────────

  describe('resolveImports()', () => {
    // Helper: build a minimal HSPlusCompileResult-like object
    function makeParseResult(
      imports: Array<{
        path: string;
        alias: string;
        namedImports?: string[];
        isWildcard?: boolean;
      }> = []
    ) {
      return {
        ast: { imports },
        errors: [],
      };
    }

    // In-memory file system for tests
    function makeReadFile(fs: Record<string, string>): (p: string) => Promise<string> {
      return async (p) => {
        const content = fs[p];
        if (content === undefined) throw new Error(`File not found: ${p}`);
        return content;
      };
    }

    it('returns empty scope when there are no imports', async () => {
      const ic = new IncrementalCompiler();
      const result = makeParseResult();
      const resolution = await ic.resolveImports(result, {
        baseDir: '/project',
        sourceFile: '/project/scene.hs',
      });
      expect(resolution.scope.size).toBe(0);
      expect(resolution.errors).toHaveLength(0);
    });

    it('registers import edges in TraitDependencyGraph', async () => {
      const ic = new IncrementalCompiler();
      const sharedSrc = `@export
trait GlowOrb { color: "gold" }`;
      const readFile = makeReadFile({ '/project/shared.hs': sharedSrc });
      const result = makeParseResult([{ path: './shared.hs', alias: 'shared' }]);
      await ic.resolveImports(result, {
        baseDir: '/project',
        sourceFile: '/project/scene.hs',
        readFile,
      });
      // scene.hs should now import /project/shared.hs in the trait graph
      const graph = ic.getTraitGraph();
      const imported = graph.getImportedFiles('/project/scene.hs');
      expect(imported.has('/project/shared.hs')).toBe(true);
    });

    it('propagates file-changed recompilation via TraitDependencyGraph', async () => {
      const ic = new IncrementalCompiler();
      const sharedSrc = `@export
trait Orb {}`;
      const readFile = makeReadFile({ '/project/shared.hs': sharedSrc });
      const result = makeParseResult([{ path: './shared.hs', alias: 'shared' }]);
      await ic.resolveImports(result, {
        baseDir: '/project',
        sourceFile: '/project/scene.hs',
        readFile,
      });
      const graph = ic.getTraitGraph();
      const affected = graph.getFilesAffectedByChange(['/project/shared.hs']);
      expect(affected.has('/project/scene.hs')).toBe(true);
    });

    it('clears previous import edges on re-resolve', async () => {
      const ic = new IncrementalCompiler();
      const readFile = makeReadFile({
        '/project/a.hs': '@export\ntrait A {}',
        '/project/b.hs': '@export\ntrait B {}',
      });
      // First resolve: scene imports a
      await ic.resolveImports(makeParseResult([{ path: './a.hs', alias: 'a' }]), {
        baseDir: '/project',
        sourceFile: '/project/scene.hs',
        readFile,
      });
      // Second resolve: scene now imports b instead
      await ic.resolveImports(makeParseResult([{ path: './b.hs', alias: 'b' }]), {
        baseDir: '/project',
        sourceFile: '/project/scene.hs',
        readFile,
      });
      const graph = ic.getTraitGraph();
      // old edge to a.hs should be gone
      expect(graph.getImportedFiles('/project/scene.hs').has('/project/a.hs')).toBe(false);
      // new edge to b.hs should be present
      expect(graph.getImportedFiles('/project/scene.hs').has('/project/b.hs')).toBe(true);
    });

    it('reports error for missing import file', async () => {
      const ic = new IncrementalCompiler();
      const readFile = makeReadFile({}); // empty filesystem
      const result = makeParseResult([{ path: './missing.hs', alias: 'missing' }]);
      const resolution = await ic.resolveImports(result, {
        baseDir: '/project',
        sourceFile: '/project/scene.hs',
        readFile,
      });
      expect(resolution.errors.length).toBeGreaterThan(0);
      expect(resolution.errors[0].code).toBe('not_found');
    });
  });
});
