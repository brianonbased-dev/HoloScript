/**
 * ModuleSystem.test.ts
 *
 * Tests for ModuleResolver + HoloScriptPlusParser @import/@export support.
 *
 * Sprint 1 — Module System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { ModuleResolver, CircularImportError, ModuleNotFoundError } from '../ModuleResolver';
import HoloScriptPlusParser from '../../HoloScriptPlusParser';
import { TraitDependencyGraph } from '../TraitDependencyGraph';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build platform-appropriate absolute paths for test fixtures.
 * On Windows, path.resolve('/a/b') → 'C:\a\b'. We want consistent
 * keys in our fake file system.
 */
function p(...parts: string[]): string {
  // Use path.resolve to get the platform's notion of an absolute path.
  // Start from the OS root to avoid cwd contamination.
  return path.join(path.parse(process.cwd()).root, ...parts);
}

function makeResolver(files: Record<string, string>, graph?: TraitDependencyGraph): ModuleResolver {
  return new ModuleResolver({
    graph,
    loader: (canonicalPath: string) => {
      // Normalize both the incoming path and the keys to forward slashes
      const key = canonicalPath.replace(/\\/g, '/');
      // Also look up by normalized key
      for (const [fileKey, content] of Object.entries(files)) {
        if (fileKey.replace(/\\/g, '/') === key) return content;
      }
      throw new ModuleNotFoundError(canonicalPath, '<test>');
    },
  });
}

/** Normalize a path to forward slashes for cross-platform assertions */
function norm(s: string): string {
  return s.replace(/\\/g, '/');
}

// =============================================================================
// PARSER — @import / @export directive parsing
// =============================================================================

describe('HoloScriptPlusParser — @import / @export', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  describe('parseImportDirective()', () => {
    it('parses a single named import', () => {
      const result = parser.parseImportDirective('@import @physics from "./physics.hs"');
      expect(result).toEqual({ specifiers: ['physics'], source: './physics.hs' });
    });

    it('parses multiple named imports', () => {
      const result = parser.parseImportDirective('@import @physics, @ai_npc from "./shared.hs"');
      expect(result).toEqual({ specifiers: ['physics', 'ai_npc'], source: './shared.hs' });
    });

    it('parses wildcard import', () => {
      const result = parser.parseImportDirective('@import * from "./shared.hs"');
      expect(result).toEqual({ specifiers: ['*'], source: './shared.hs' });
    });

    it('parses aliased import', () => {
      const result = parser.parseImportDirective('@import @physics as @p from "./physics.hs"');
      expect(result).toEqual({
        specifiers: ['physics'],
        source: './physics.hs',
        alias: 'p',
      });
    });

    it('returns null for non-import lines', () => {
      expect(parser.parseImportDirective('scene World {')).toBeNull();
      expect(parser.parseImportDirective('@physics')).toBeNull();
      expect(parser.parseImportDirective('// comment')).toBeNull();
    });

    it('supports single-quote delimiters', () => {
      const result = parser.parseImportDirective("@import @ai from './npc.hs'");
      expect(result).toEqual({ specifiers: ['ai'], source: './npc.hs' });
    });
  });

  describe('parseExportDirective()', () => {
    it('parses a single export', () => {
      expect(parser.parseExportDirective('@export @turret')).toEqual(['turret']);
    });

    it('parses multiple exports', () => {
      expect(parser.parseExportDirective('@export @turret, @enemy, @npc')).toEqual([
        'turret',
        'enemy',
        'npc',
      ]);
    });

    it('returns null for non-export lines', () => {
      expect(parser.parseExportDirective('scene World {')).toBeNull();
      expect(parser.parseExportDirective('@import @a from "./b.hs"')).toBeNull();
    });
  });

  describe('parseModuleHeader()', () => {
    it('extracts imports and exports from a file header', () => {
      const code = [
        '@import @physics from "./physics.hs"',
        '@import @ai_npc from "./ai.hs"',
        '@export @turret, @enemy',
        '',
        'scene World {',
        '  cube Player { @physics }',
        '}',
      ].join('\n');

      const header = parser.parseModuleHeader(code, p('project', 'main.hs'));
      expect(header.imports).toHaveLength(2);
      expect(header.imports[0]).toEqual({
        specifiers: ['physics'],
        source: './physics.hs',
      });
      expect(header.imports[1]).toEqual({
        specifiers: ['ai_npc'],
        source: './ai.hs',
      });
      expect(header.exports).toEqual(['turret', 'enemy']);
    });

    it('stops at the first non-directive non-comment line', () => {
      const code = [
        '@import @physics from "./physics.hs"',
        'scene World {', // stop here
        '@import @ai from "./ai.hs"', // not parsed
      ].join('\n');

      const header = parser.parseModuleHeader(code);
      expect(header.imports).toHaveLength(1);
    });

    it('skips comment lines', () => {
      const code = [
        '// Physics module',
        '@import @physics from "./physics.hs"',
        '// End of imports',
        '@export @player',
      ].join('\n');

      const header = parser.parseModuleHeader(code);
      expect(header.imports).toHaveLength(1);
      expect(header.exports).toEqual(['player']);
    });

    it('handles files with no imports or exports', () => {
      const code = 'scene World {\n  cube Foo {}\n}';
      const header = parser.parseModuleHeader(code);
      expect(header.imports).toEqual([]);
      expect(header.exports).toEqual([]);
    });
  });

  describe('parseWithModules()', () => {
    it('returns ast, imports, and exports together', () => {
      const code = ['@import @physics from "./physics.hs"', 'scene World { cube Foo {} }'].join(
        '\n'
      );

      const result = parser.parseWithModules(code, p('project', 'main.hs'));
      expect(result.ast).toBeDefined();
      expect(Array.isArray(result.ast)).toBe(true);
      expect(result.imports).toHaveLength(1);
      expect(result.exports).toEqual([]);
    });
  });
});

// =============================================================================
// MODULE RESOLVER
// =============================================================================

describe('ModuleResolver', () => {
  describe('resolve()', () => {
    it('resolves relative paths from the importing file', () => {
      const resolver = makeResolver({});
      const fromFile = p('project', 'main.hs');
      const expected = p('project', 'physics.hs');
      const canonical = resolver.resolve('./physics.hs', fromFile);
      expect(norm(canonical)).toBe(norm(expected));
    });

    it('resolves deeply nested relative paths', () => {
      const resolver = makeResolver({});
      const fromFile = p('project', 'src', 'main.hs');
      const expected = p('project', 'shared', 'ai.hs');
      const canonical = resolver.resolve('../shared/ai.hs', fromFile);
      expect(norm(canonical)).toBe(norm(expected));
    });
  });

  describe('parseHeader()', () => {
    it('extracts imports and exports from source header', () => {
      const source = [
        '@import @physics from "./physics.hs"',
        '@export @turret',
        'scene World {}',
      ].join('\n');

      const fromFile = p('project', 'main.hs');
      const expectedPhysicsPath = p('project', 'physics.hs');

      const resolver = makeResolver({});
      const header = resolver.parseHeader(source, fromFile);

      expect(header.imports).toHaveLength(1);
      expect(header.imports[0].specifiers).toEqual(['physics']);
      expect(norm(header.imports[0].canonicalPath)).toBe(norm(expectedPhysicsPath));
      expect(header.exports).toEqual(['turret']);
    });
  });

  describe('load()', () => {
    it('loads and caches a simple module', () => {
      const physicsPath = p('project', 'physics.hs');
      const resolver = makeResolver({ [physicsPath]: 'scene Physics {}' });

      const mod = resolver.load(physicsPath);
      expect(norm(mod.canonicalPath)).toBe(norm(physicsPath));
      expect(mod.rawSource).toBe('scene Physics {}');
      expect(resolver.cacheSize).toBe(1);

      // Second call returns cache
      const mod2 = resolver.load(physicsPath);
      expect(mod2).toBe(mod); // same reference
    });

    it('resolves transitive imports', () => {
      const mainPath = p('project', 'main.hs');
      const physicsPath = p('project', 'physics.hs');
      const resolver = makeResolver({
        [mainPath]: '@import @physics from "./physics.hs"\nscene World {}',
        [physicsPath]: 'scene Physics {}',
      });

      resolver.load(mainPath);
      expect(resolver.cacheSize).toBe(2);
    });

    it('throws CircularImportError on direct cycle', () => {
      const aPath = p('project', 'a.hs');
      const bPath = p('project', 'b.hs');
      const resolver = makeResolver({
        [aPath]: '@import @b from "./b.hs"\nscene A {}',
        [bPath]: '@import @a from "./a.hs"\nscene B {}',
      });

      expect(() => resolver.load(aPath)).toThrowError(CircularImportError);
    });

    it('throws CircularImportError on indirect cycle', () => {
      const aPath = p('project', 'a.hs');
      const bPath = p('project', 'b.hs');
      const cPath = p('project', 'c.hs');
      const resolver = makeResolver({
        [aPath]: '@import @b from "./b.hs"\nscene A {}',
        [bPath]: '@import @c from "./c.hs"\nscene B {}',
        [cPath]: '@import @a from "./a.hs"\nscene C {}',
      });

      expect(() => resolver.load(aPath)).toThrowError(CircularImportError);
    });

    it('CircularImportError includes the cycle path', () => {
      const aPath = p('project', 'a.hs');
      const bPath = p('project', 'b.hs');
      const resolver = makeResolver({
        [aPath]: '@import @b from "./b.hs"\nscene A {}',
        [bPath]: '@import @a from "./a.hs"\nscene B {}',
      });

      try {
        resolver.load(aPath);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CircularImportError);
        expect((e as CircularImportError).cycle.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('throws ModuleNotFoundError for missing files', () => {
      const mainPath = p('project', 'main.hs');
      const resolver = makeResolver({
        [mainPath]: '@import @missing from "./missing.hs"\nscene World {}',
      });

      expect(() => resolver.load(mainPath)).toThrowError(ModuleNotFoundError);
    });
  });

  describe('invalidate()', () => {
    it('removes module from cache', () => {
      const physicsPath = p('project', 'physics.hs');
      const resolver = makeResolver({ [physicsPath]: 'scene Physics {}' });

      resolver.load(physicsPath);
      expect(resolver.cacheSize).toBe(1);

      resolver.invalidate(physicsPath);
      expect(resolver.cacheSize).toBe(0);
    });

    it('allows re-loading after invalidation', () => {
      let callCount = 0;
      const resolver = new ModuleResolver({
        loader: () => {
          callCount++;
          return 'scene Physics {}';
        },
      });

      const physicsPath = p('project', 'physics.hs');
      resolver.load(physicsPath);
      expect(callCount).toBe(1);

      resolver.invalidate(physicsPath);
      resolver.load(physicsPath);
      expect(callCount).toBe(2);
    });
  });

  describe('clearAll()', () => {
    it('empties the entire cache', () => {
      const aPath = p('project', 'a.hs');
      const bPath = p('project', 'b.hs');
      const resolver = makeResolver({
        [aPath]: 'scene A {}',
        [bPath]: 'scene B {}',
      });

      resolver.load(aPath);
      resolver.load(bPath);
      expect(resolver.cacheSize).toBe(2);

      resolver.clearAll();
      expect(resolver.cacheSize).toBe(0);
    });
  });

  describe('TraitDependencyGraph integration', () => {
    it('registers import edges in the dependency graph', () => {
      const graph = new TraitDependencyGraph();
      const mainPath = p('project', 'main.hs');
      const physicsPath = p('project', 'physics.hs');

      const resolver = makeResolver(
        {
          [mainPath]: '@import @physics from "./physics.hs"\nscene World {}',
          [physicsPath]: 'scene Physics {}',
        },
        graph
      );

      resolver.load(mainPath);

      const imported = graph.getImportedFiles(mainPath);
      expect(imported.size).toBe(1);
      expect(norm([...imported][0])).toBe(norm(physicsPath));
    });

    it('clears and re-registers import edges on re-load after invalidation', () => {
      const graph = new TraitDependencyGraph();
      const mainPath = p('project', 'main.hs');
      const physicsPath = p('project', 'physics.hs');
      const aiPath = p('project', 'ai.hs');

      let mainSource = '@import @physics from "./physics.hs"\nscene World {}';

      const resolver = new ModuleResolver({
        graph,
        loader: (cp: string) => {
          if (norm(cp) === norm(mainPath)) return mainSource;
          if (norm(cp) === norm(physicsPath)) return 'scene Physics {}';
          if (norm(cp) === norm(aiPath)) return 'scene AI {}';
          throw new ModuleNotFoundError(cp, '<test>');
        },
      });

      resolver.load(mainPath);
      expect(graph.getImportedFiles(mainPath).size).toBe(1);

      // Change the file to import a different module
      mainSource = '@import @ai from "./ai.hs"\nscene World {}';
      resolver.invalidate(mainPath);
      resolver.load(mainPath);

      const imported = graph.getImportedFiles(mainPath);
      expect(imported.size).toBe(1);
      expect(norm([...imported][0])).toBe(norm(aiPath));
    });
  });
});
