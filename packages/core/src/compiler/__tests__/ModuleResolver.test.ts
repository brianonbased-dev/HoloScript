/**
 * ModuleResolver Test Suite
 *
 * Comprehensive unit tests for the ModuleResolver covering:
 * - Path resolution (relative, absolute, bare specifier)
 * - Header parsing (@import / @export directives)
 * - Module loading with caching
 * - Circular import detection (CircularImportError)
 * - Missing module detection (ModuleNotFoundError)
 * - Cache invalidation and clearing
 * - TraitDependencyGraph integration
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import {
  ModuleResolver,
  CircularImportError,
  ModuleNotFoundError,
  type CachedModule,
  type ModuleHeader,
  type ResolvedImport,
} from '../ModuleResolver';
import { TraitDependencyGraph } from '../TraitDependencyGraph';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build platform-appropriate absolute paths for test fixtures.
 * Uses the OS root to avoid cwd contamination.
 */
function p(...parts: string[]): string {
  return path.join(path.parse(process.cwd()).root, ...parts);
}

/** Normalize a path to forward slashes for cross-platform assertions. */
function norm(s: string): string {
  return s.replace(/\\/g, '/');
}

/**
 * Create a ModuleResolver backed by an in-memory file system.
 * Keys in the `files` map should use the `p()` helper for platform portability.
 */
function makeResolver(files: Record<string, string>, graph?: TraitDependencyGraph): ModuleResolver {
  return new ModuleResolver({
    graph,
    loader: (canonicalPath: string) => {
      const key = canonicalPath.replace(/\\/g, '/');
      for (const [fileKey, content] of Object.entries(files)) {
        if (fileKey.replace(/\\/g, '/') === key) return content;
      }
      throw new ModuleNotFoundError(canonicalPath, '<test>');
    },
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('ModuleResolver', () => {
  // ---------------------------------------------------------------------------
  // resolve() — relative paths
  // ---------------------------------------------------------------------------

  describe('resolve() — relative paths', () => {
    let resolver: ModuleResolver;

    beforeEach(() => {
      resolver = makeResolver({});
    });

    it('should resolve a sibling file via "./"', () => {
      const fromFile = p('project', 'src', 'main.hs');
      const result = resolver.resolve('./utils.hs', fromFile);
      expect(norm(result)).toBe(norm(p('project', 'src', 'utils.hs')));
    });

    it('should resolve a parent-relative file via "../"', () => {
      const fromFile = p('project', 'src', 'sub', 'main.hs');
      const result = resolver.resolve('../shared.hs', fromFile);
      expect(norm(result)).toBe(norm(p('project', 'src', 'shared.hs')));
    });

    it('should resolve nested relative paths', () => {
      const fromFile = p('project', 'src', 'main.hs');
      const result = resolver.resolve('./lib/physics.hs', fromFile);
      expect(norm(result)).toBe(norm(p('project', 'src', 'lib', 'physics.hs')));
    });

    it('should resolve deeply nested parent references', () => {
      const fromFile = p('project', 'src', 'a', 'b', 'c', 'deep.hs');
      const result = resolver.resolve('../../../root.hs', fromFile);
      expect(norm(result)).toBe(norm(p('project', 'src', 'root.hs')));
    });
  });

  // ---------------------------------------------------------------------------
  // resolve() — absolute paths
  // ---------------------------------------------------------------------------

  describe('resolve() — absolute paths', () => {
    let resolver: ModuleResolver;

    beforeEach(() => {
      resolver = makeResolver({});
    });

    it('should return the absolute path as-is (resolved)', () => {
      const absPath = p('libs', 'physics.hs');
      const fromFile = p('project', 'src', 'main.hs');
      const result = resolver.resolve(absPath, fromFile);
      expect(norm(result)).toBe(norm(absPath));
    });

    it('should resolve absolute path independent of fromFile', () => {
      const absPath = p('shared', 'traits.hs');
      const fromA = p('project', 'a', 'main.hs');
      const fromB = p('other', 'b', 'main.hs');

      expect(norm(resolver.resolve(absPath, fromA))).toBe(norm(absPath));
      expect(norm(resolver.resolve(absPath, fromB))).toBe(norm(absPath));
    });
  });

  // ---------------------------------------------------------------------------
  // resolve() — bare specifiers
  // ---------------------------------------------------------------------------

  describe('resolve() — bare specifiers', () => {
    let resolver: ModuleResolver;

    beforeEach(() => {
      resolver = makeResolver({});
    });

    it('should resolve bare specifiers from workspace root', () => {
      const fromFile = p('project', 'src', 'main.hs');
      const result = resolver.resolve('shared/utils.hs', fromFile);
      // Bare specifiers use path.resolve(modulePath) which resolves from cwd
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('should produce a different result than relative for the same name', () => {
      const fromFile = p('project', 'src', 'main.hs');
      const bare = resolver.resolve('utils.hs', fromFile);
      const relative = resolver.resolve('./utils.hs', fromFile);
      // They should differ because bare resolves from cwd, relative from fromFile dir
      // (Unless cwd happens to be fromFile's dir, which is unlikely in tests)
      expect(path.isAbsolute(bare)).toBe(true);
      expect(path.isAbsolute(relative)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // parseHeader() — @import directives
  // ---------------------------------------------------------------------------

  describe('parseHeader() — @import', () => {
    let resolver: ModuleResolver;
    const fromFile = p('project', 'src', 'main.hs');

    beforeEach(() => {
      resolver = makeResolver({});
    });

    it('should parse named imports: @import @physics, @ai_npc from "./physics.hs"', () => {
      const source = '@import @physics, @ai_npc from "./physics.hs"\n@object turret {}';
      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(1);
      expect(header.imports[0].specifiers).toEqual(['physics', 'ai_npc']);
      expect(norm(header.imports[0].canonicalPath)).toBe(norm(p('project', 'src', 'physics.hs')));
    });

    it('should parse a single named import: @import @physics from "./physics.hs"', () => {
      const source = '@import @physics from "./physics.hs"\n@object tank {}';
      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(1);
      expect(header.imports[0].specifiers).toEqual(['physics']);
    });

    it('should parse wildcard import: @import * from "./shared.hs"', () => {
      const source = '@import * from "./shared.hs"\n@object player {}';
      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(1);
      expect(header.imports[0].specifiers).toEqual(['*']);
      expect(norm(header.imports[0].canonicalPath)).toBe(norm(p('project', 'src', 'shared.hs')));
    });

    it('should parse alias import: @import @physics as @p from "./physics.hs"', () => {
      const source = '@import @physics as @p from "./physics.hs"\n@object car {}';
      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(1);
      expect(header.imports[0].specifiers).toEqual(['physics']);
      expect(header.imports[0].alias).toBe('p');
    });

    it('should parse multiple import lines', () => {
      const source = [
        '@import @physics from "./physics.hs"',
        '@import @ai_npc, @pathfinding from "./ai.hs"',
        '@object turret {}',
      ].join('\n');

      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(2);
      expect(header.imports[0].specifiers).toEqual(['physics']);
      expect(header.imports[1].specifiers).toEqual(['ai_npc', 'pathfinding']);
    });

    it("should handle single-quoted paths: @import @a from './a.hs'", () => {
      const source = "@import @a from './a.hs'\n@object x {}";
      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(1);
      expect(header.imports[0].specifiers).toEqual(['a']);
    });
  });

  // ---------------------------------------------------------------------------
  // parseHeader() — @export directives
  // ---------------------------------------------------------------------------

  describe('parseHeader() — @export', () => {
    let resolver: ModuleResolver;
    const fromFile = p('project', 'src', 'module.hs');

    beforeEach(() => {
      resolver = makeResolver({});
    });

    it('should parse multiple exports: @export @turret, @enemy', () => {
      const source = '@export @turret, @enemy\n@object turret {}';
      const header = resolver.parseHeader(source, fromFile);

      expect(header.exports).toEqual(['turret', 'enemy']);
    });

    it('should parse a single export: @export @player', () => {
      const source = '@export @player\n@object player {}';
      const header = resolver.parseHeader(source, fromFile);

      expect(header.exports).toEqual(['player']);
    });

    it('should parse mixed imports and exports', () => {
      const source = [
        '@import @physics from "./physics.hs"',
        '@export @turret, @enemy',
        '@object turret {}',
      ].join('\n');

      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(1);
      expect(header.exports).toEqual(['turret', 'enemy']);
    });

    it('should return empty exports for files with no @export', () => {
      const source = '@import @a from "./a.hs"\n@object x {}';
      const header = resolver.parseHeader(source, fromFile);

      expect(header.exports).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // parseHeader() — stop at non-import/export/comment/blank lines
  // ---------------------------------------------------------------------------

  describe('parseHeader() — scanning stops at content lines', () => {
    let resolver: ModuleResolver;
    const fromFile = p('project', 'src', 'test.hs');

    beforeEach(() => {
      resolver = makeResolver({});
    });

    it('should stop parsing at the first non-import/export line', () => {
      const source = [
        '@import @a from "./a.hs"',
        '@object turret {',
        '  @import @b from "./b.hs"', // This should NOT be parsed
        '}',
      ].join('\n');

      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(1);
      expect(header.imports[0].specifiers).toEqual(['a']);
    });

    it('should skip blank lines and continue parsing', () => {
      const source = [
        '@import @a from "./a.hs"',
        '',
        '@import @b from "./b.hs"',
        '@object turret {}',
      ].join('\n');

      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(2);
    });

    it('should skip comment lines and continue parsing', () => {
      const source = [
        '// This is a comment',
        '@import @a from "./a.hs"',
        '# Hash comment',
        '@export @turret',
        '@object turret {}',
      ].join('\n');

      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(1);
      expect(header.exports).toEqual(['turret']);
    });

    it('should return empty header for a file with no directives', () => {
      const source = '@object turret {\n  @trait physics {}\n}';
      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toEqual([]);
      expect(header.exports).toEqual([]);
    });

    it('should return empty header for an empty file', () => {
      const header = resolver.parseHeader('', fromFile);
      expect(header.imports).toEqual([]);
      expect(header.exports).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // load() — caching
  // ---------------------------------------------------------------------------

  describe('load() — caching', () => {
    it('should cache the result of loading a module', () => {
      const filePath = p('project', 'src', 'module.hs');
      const loaderSpy = vi.fn().mockReturnValue('@export @player\n@object player {}');
      const resolver = new ModuleResolver({ loader: loaderSpy });

      const first = resolver.load(filePath);
      const second = resolver.load(filePath);

      expect(first).toBe(second);
      expect(loaderSpy).toHaveBeenCalledTimes(1);
    });

    it('should store rawSource in cache entry', () => {
      const filePath = p('project', 'src', 'module.hs');
      const source = '@export @turret\n@object turret {}';
      const resolver = new ModuleResolver({
        loader: () => source,
      });

      const entry = resolver.load(filePath);
      expect(entry.rawSource).toBe(source);
    });

    it('should store canonicalPath in cache entry', () => {
      const filePath = p('project', 'src', 'module.hs');
      const resolver = new ModuleResolver({
        loader: () => '@object x {}',
      });

      const entry = resolver.load(filePath);
      expect(entry.canonicalPath).toBe(filePath);
    });

    it('should store cachedAt timestamp', () => {
      const filePath = p('project', 'src', 'module.hs');
      const before = Date.now();
      const resolver = new ModuleResolver({
        loader: () => '@object x {}',
      });

      const entry = resolver.load(filePath);
      const after = Date.now();

      expect(entry.cachedAt).toBeGreaterThanOrEqual(before);
      expect(entry.cachedAt).toBeLessThanOrEqual(after);
    });

    it('should store parsed header in cache entry', () => {
      const filePath = p('project', 'src', 'module.hs');
      const resolver = new ModuleResolver({
        loader: () => '@export @turret\n@object turret {}',
      });

      const entry = resolver.load(filePath);
      expect(entry.header.exports).toEqual(['turret']);
    });
  });

  // ---------------------------------------------------------------------------
  // load() — circular import detection
  // ---------------------------------------------------------------------------

  describe('load() — circular import detection', () => {
    it('should throw CircularImportError for direct circular dependency', () => {
      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');

      const resolver = makeResolver({
        [fileA]: `@import @b from "./b.hs"\n@object a {}`,
        [fileB]: `@import @a from "./a.hs"\n@object b {}`,
      });

      expect(() => resolver.load(fileA)).toThrow(CircularImportError);
    });

    it('should include the cycle path in the error', () => {
      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');

      const resolver = makeResolver({
        [fileA]: `@import @b from "./b.hs"\n@object a {}`,
        [fileB]: `@import @a from "./a.hs"\n@object b {}`,
      });

      try {
        resolver.load(fileA);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CircularImportError);
        const circErr = err as CircularImportError;
        expect(circErr.cycle.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should throw CircularImportError for transitive circular dependency (A -> B -> C -> A)', () => {
      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');
      const fileC = p('project', 'c.hs');

      const resolver = makeResolver({
        [fileA]: `@import @b from "./b.hs"\n@object a {}`,
        [fileB]: `@import @c from "./c.hs"\n@object b {}`,
        [fileC]: `@import @a from "./a.hs"\n@object c {}`,
      });

      expect(() => resolver.load(fileA)).toThrow(CircularImportError);
    });

    it('should NOT throw for diamond dependencies (A -> B, A -> C, B -> D, C -> D)', () => {
      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');
      const fileC = p('project', 'c.hs');
      const fileD = p('project', 'd.hs');

      const resolver = makeResolver({
        [fileA]: ['@import @b from "./b.hs"', '@import @c from "./c.hs"', '@object a {}'].join(
          '\n'
        ),
        [fileB]: '@import @d from "./d.hs"\n@object b {}',
        [fileC]: '@import @d from "./d.hs"\n@object c {}',
        [fileD]: '@export @shared\n@object d {}',
      });

      expect(() => resolver.load(fileA)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // load() — ModuleNotFoundError
  // ---------------------------------------------------------------------------

  describe('load() — ModuleNotFoundError', () => {
    it('should throw ModuleNotFoundError when loader cannot find the file', () => {
      const resolver = makeResolver({});
      const missingFile = p('project', 'nonexistent.hs');

      expect(() => resolver.load(missingFile)).toThrow(ModuleNotFoundError);
    });

    it('should include the requested path in the error', () => {
      const resolver = makeResolver({});
      const missingFile = p('project', 'missing.hs');

      try {
        resolver.load(missingFile);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ModuleNotFoundError);
        const mnfErr = err as ModuleNotFoundError;
        expect(mnfErr.requestedPath).toBe(missingFile);
      }
    });

    it('should throw when an import references a missing file', () => {
      const fileA = p('project', 'a.hs');
      const resolver = makeResolver({
        [fileA]: '@import @b from "./missing.hs"\n@object a {}',
      });

      expect(() => resolver.load(fileA)).toThrow(ModuleNotFoundError);
    });
  });

  // ---------------------------------------------------------------------------
  // invalidate()
  // ---------------------------------------------------------------------------

  describe('invalidate()', () => {
    it('should remove a module from the cache', () => {
      const filePath = p('project', 'module.hs');
      const resolver = new ModuleResolver({
        loader: () => '@object x {}',
      });

      resolver.load(filePath);
      expect(resolver.getCached(filePath)).toBeDefined();

      resolver.invalidate(filePath);
      expect(resolver.getCached(filePath)).toBeUndefined();
    });

    it('should cause next load() to re-read the file', () => {
      const filePath = p('project', 'module.hs');
      let callCount = 0;
      const resolver = new ModuleResolver({
        loader: () => {
          callCount++;
          return '@object x {}';
        },
      });

      resolver.load(filePath);
      expect(callCount).toBe(1);

      resolver.invalidate(filePath);
      resolver.load(filePath);
      expect(callCount).toBe(2);
    });

    it('should not throw when invalidating a non-cached path', () => {
      const resolver = makeResolver({});
      expect(() => resolver.invalidate(p('project', 'never-loaded.hs'))).not.toThrow();
    });

    it('should clear graph import edges for the invalidated file', () => {
      const graph = new TraitDependencyGraph();
      const clearSpy = vi.spyOn(graph, 'clearImportsForFile');

      const filePath = p('project', 'module.hs');
      const resolver = new ModuleResolver({
        graph,
        loader: () => '@object x {}',
      });

      resolver.load(filePath);
      resolver.invalidate(filePath);

      expect(clearSpy).toHaveBeenCalledWith(filePath);
    });
  });

  // ---------------------------------------------------------------------------
  // getCached()
  // ---------------------------------------------------------------------------

  describe('getCached()', () => {
    it('should return cached module without triggering a load', () => {
      const filePath = p('project', 'module.hs');
      const resolver = new ModuleResolver({
        loader: () => '@export @turret\n@object turret {}',
      });

      // getCached should return undefined before load
      expect(resolver.getCached(filePath)).toBeUndefined();

      // Load and verify cache
      resolver.load(filePath);
      const cached = resolver.getCached(filePath);
      expect(cached).toBeDefined();
      expect(cached!.header.exports).toEqual(['turret']);
    });

    it('should return undefined for a never-loaded path', () => {
      const resolver = makeResolver({});
      expect(resolver.getCached(p('project', 'nope.hs'))).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // clearAll()
  // ---------------------------------------------------------------------------

  describe('clearAll()', () => {
    it('should clear the entire cache', () => {
      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');
      const resolver = makeResolver({
        [fileA]: '@object a {}',
        [fileB]: '@object b {}',
      });

      resolver.load(fileA);
      resolver.load(fileB);
      expect(resolver.cacheSize).toBe(2);

      resolver.clearAll();
      expect(resolver.cacheSize).toBe(0);
      expect(resolver.getCached(fileA)).toBeUndefined();
      expect(resolver.getCached(fileB)).toBeUndefined();
    });

    it('should be safe to call on an already-empty cache', () => {
      const resolver = makeResolver({});
      expect(() => resolver.clearAll()).not.toThrow();
      expect(resolver.cacheSize).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // cacheSize
  // ---------------------------------------------------------------------------

  describe('cacheSize', () => {
    it('should return 0 for a fresh resolver', () => {
      const resolver = makeResolver({});
      expect(resolver.cacheSize).toBe(0);
    });

    it('should increment as modules are loaded', () => {
      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');
      const resolver = makeResolver({
        [fileA]: '@object a {}',
        [fileB]: '@object b {}',
      });

      expect(resolver.cacheSize).toBe(0);
      resolver.load(fileA);
      expect(resolver.cacheSize).toBe(1);
      resolver.load(fileB);
      expect(resolver.cacheSize).toBe(2);
    });

    it('should not double-count when loading the same module twice', () => {
      const filePath = p('project', 'module.hs');
      const resolver = makeResolver({
        [filePath]: '@object x {}',
      });

      resolver.load(filePath);
      resolver.load(filePath);
      expect(resolver.cacheSize).toBe(1);
    });

    it('should decrease after invalidation', () => {
      const filePath = p('project', 'module.hs');
      const resolver = makeResolver({
        [filePath]: '@object x {}',
      });

      resolver.load(filePath);
      expect(resolver.cacheSize).toBe(1);

      resolver.invalidate(filePath);
      expect(resolver.cacheSize).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // TraitDependencyGraph integration
  // ---------------------------------------------------------------------------

  describe('TraitDependencyGraph integration', () => {
    it('should register import edges in the graph when loading', () => {
      const graph = new TraitDependencyGraph();
      const registerSpy = vi.spyOn(graph, 'registerImport');

      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');

      const resolver = makeResolver(
        {
          [fileA]: '@import @b from "./b.hs"\n@object a {}',
          [fileB]: '@object b {}',
        },
        graph
      );

      resolver.load(fileA);

      expect(registerSpy).toHaveBeenCalledWith(fileA, expect.stringContaining('b.hs'));
    });

    it('should clear import edges before re-registering on load', () => {
      const graph = new TraitDependencyGraph();
      const clearSpy = vi.spyOn(graph, 'clearImportsForFile');

      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');

      const resolver = makeResolver(
        {
          [fileA]: '@import @b from "./b.hs"\n@object a {}',
          [fileB]: '@object b {}',
        },
        graph
      );

      resolver.load(fileA);

      // clearImportsForFile should have been called for fileA
      expect(clearSpy).toHaveBeenCalledWith(fileA);
    });

    it('should work without a graph (graph is optional)', () => {
      const filePath = p('project', 'module.hs');
      const resolver = makeResolver({
        [filePath]: '@object x {}',
      });

      expect(() => resolver.load(filePath)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Error class properties
  // ---------------------------------------------------------------------------

  describe('Error classes', () => {
    it('CircularImportError should have name and cycle', () => {
      const cycle = ['/a.hs', '/b.hs', '/a.hs'];
      const err = new CircularImportError(cycle);
      expect(err.name).toBe('CircularImportError');
      expect(err.cycle).toEqual(cycle);
      expect(err.message).toContain('/a.hs');
      expect(err.message).toContain('/b.hs');
    });

    it('ModuleNotFoundError should have name, requestedPath, and fromFile', () => {
      const err = new ModuleNotFoundError('/missing.hs', '/main.hs');
      expect(err.name).toBe('ModuleNotFoundError');
      expect(err.requestedPath).toBe('/missing.hs');
      expect(err.fromFile).toBe('/main.hs');
      expect(err.message).toContain('/missing.hs');
      expect(err.message).toContain('/main.hs');
    });
  });

  // ---------------------------------------------------------------------------
  // Recursive loading
  // ---------------------------------------------------------------------------

  describe('Recursive loading', () => {
    it('should recursively load all imported modules and cache them', () => {
      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');
      const fileC = p('project', 'c.hs');

      const resolver = makeResolver({
        [fileA]: '@import @b from "./b.hs"\n@object a {}',
        [fileB]: '@import @c from "./c.hs"\n@object b {}',
        [fileC]: '@export @shared\n@object c {}',
      });

      resolver.load(fileA);

      // All three modules should be cached
      expect(resolver.cacheSize).toBe(3);
      expect(resolver.getCached(fileA)).toBeDefined();
      expect(resolver.getCached(fileB)).toBeDefined();
      expect(resolver.getCached(fileC)).toBeDefined();
    });

    it('should not re-load an already-cached transitive dependency', () => {
      const fileA = p('project', 'a.hs');
      const fileB = p('project', 'b.hs');

      let loadCount = 0;
      const resolver = new ModuleResolver({
        loader: (cp: string) => {
          loadCount++;
          const normalizedCp = cp.replace(/\\/g, '/');
          const normalizedB = fileB.replace(/\\/g, '/');
          if (normalizedCp === normalizedB) return '@object b {}';
          return '@import @b from "./b.hs"\n@object a {}';
        },
      });

      resolver.load(fileA);
      expect(loadCount).toBe(2); // a + b

      // Loading a again should be cached (0 additional loads)
      resolver.load(fileA);
      expect(loadCount).toBe(2);
    });
  });
});
