/**
 * Tests for KnowledgeExtractor
 *
 * Verifies that W/P/G entries are correctly extracted from CodebaseGraph data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import { KnowledgeExtractor } from '../KnowledgeExtractor';
import type { ScannedFile } from '../types';
import type { KnowledgeEntry, ExtractionResult } from '../KnowledgeExtractor';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function makeFile(overrides: Partial<ScannedFile> & { path: string }): ScannedFile {
  return {
    language: 'typescript',
    symbols: [],
    imports: [],
    calls: [],
    loc: 50,
    sizeBytes: 1000,
    ...overrides,
  };
}

function buildGraph(files: ScannedFile[]): CodebaseGraph {
  const graph = new CodebaseGraph();
  graph.buildFromScanResult({
    rootDir: '/project',
    files,
    stats: {
      totalFiles: files.length,
      filesByLanguage: {},
      totalSymbols: files.reduce((s, f) => s + f.symbols.length, 0),
      symbolsByType: {},
      totalImports: files.reduce((s, f) => s + f.imports.length, 0),
      totalCalls: files.reduce((s, f) => s + f.calls.length, 0),
      totalLoc: files.reduce((s, f) => s + f.loc, 0),
      durationMs: 0,
      errors: [],
    },
  });
  return graph;
}

// =============================================================================
// TESTS
// =============================================================================

describe('KnowledgeExtractor', () => {
  let extractor: KnowledgeExtractor;

  beforeEach(() => {
    extractor = new KnowledgeExtractor();
  });

  describe('basic extraction', () => {
    it('returns empty entries for empty graph', () => {
      const graph = buildGraph([]);
      const result = extractor.extract(graph);
      expect(result.entries).toEqual([]);
      expect(result.stats.totalExtracted).toBe(0);
    });

    it('extracts entries from a simple graph', () => {
      const graph = buildGraph([
        makeFile({
          path: 'src/foo.ts',
          symbols: [
            {
              name: 'Foo',
              type: 'class',
              filePath: 'src/foo.ts',
              line: 1,
              language: 'typescript',
              visibility: 'public',
            },
          ],
          loc: 100,
        }),
        makeFile({
          path: 'src/bar.ts',
          symbols: [
            {
              name: 'bar',
              type: 'function',
              filePath: 'src/bar.ts',
              line: 1,
              language: 'typescript',
              visibility: 'public',
            },
          ],
          imports: [
            { fromFile: 'src/bar.ts', toModule: './foo', resolvedPath: 'src/foo.ts', line: 1 },
          ],
          loc: 50,
        }),
      ]);
      const result = extractor.extract(graph);
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.stats.totalExtracted).toBeGreaterThan(0);
    });

    it('assigns unique IDs to entries', () => {
      const graph = buildGraph([
        makeFile({
          path: 'src/a.ts',
          symbols: [
            {
              name: 'A',
              type: 'class',
              filePath: 'src/a.ts',
              line: 1,
              language: 'typescript',
              visibility: 'public',
            },
          ],
          loc: 100,
        }),
        makeFile({
          path: 'src/b.ts',
          symbols: [
            {
              name: 'B',
              type: 'class',
              filePath: 'src/b.ts',
              line: 1,
              language: 'typescript',
              visibility: 'public',
            },
          ],
          loc: 100,
        }),
      ]);
      const result = extractor.extract(graph);
      const ids = result.entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('wisdom extraction', () => {
    it('detects polyglot codebase', () => {
      const graph = buildGraph([
        makeFile({ path: 'src/app.ts', language: 'typescript', loc: 100 }),
        makeFile({ path: 'src/lib.py', language: 'python', loc: 80 }),
      ]);
      const result = extractor.extract(graph);
      const polyglot = result.entries.find((e) => e.content.includes('Polyglot'));
      expect(polyglot).toBeDefined();
      expect(polyglot!.type).toBe('wisdom');
    });

    it('detects monoglot codebase', () => {
      const graph = buildGraph([
        makeFile({ path: 'src/a.ts', loc: 100 }),
        makeFile({ path: 'src/b.ts', loc: 100 }),
      ]);
      const result = extractor.extract(graph);
      const mono = result.entries.find((e) => e.content.includes('Monoglot'));
      expect(mono).toBeDefined();
    });

    it('produces scale insight', () => {
      const graph = buildGraph([
        makeFile({ path: 'src/a.ts', loc: 200 }),
        makeFile({ path: 'src/b.ts', loc: 300 }),
      ]);
      const result = extractor.extract(graph);
      const scale = result.entries.find((e) => e.content.includes('Codebase scale'));
      expect(scale).toBeDefined();
      expect(scale!.content).toContain('500');
    });
  });

  describe('pattern extraction', () => {
    it('detects adapter/strategy patterns', () => {
      const graph = buildGraph([
        makeFile({
          path: 'src/adapters/PostgresAdapter.ts',
          symbols: [
            {
              name: 'PostgresAdapter',
              type: 'class',
              filePath: 'src/adapters/PostgresAdapter.ts',
              line: 1,
              language: 'typescript',
              visibility: 'public',
            },
          ],
        }),
        makeFile({
          path: 'src/adapters/MySQLAdapter.ts',
          symbols: [
            {
              name: 'MySQLAdapter',
              type: 'class',
              filePath: 'src/adapters/MySQLAdapter.ts',
              line: 1,
              language: 'typescript',
              visibility: 'public',
            },
          ],
        }),
      ]);
      const result = extractor.extract(graph);
      const adapter = result.entries.find((e) => e.content.includes('Adapter pattern'));
      expect(adapter).toBeDefined();
      expect(adapter!.type).toBe('pattern');
    });

    it('detects barrel file pattern', () => {
      const graph = buildGraph([
        makeFile({ path: 'src/models/index.ts' }),
        makeFile({ path: 'src/utils/index.ts' }),
        makeFile({ path: 'src/services/index.ts' }),
        makeFile({ path: 'src/app.ts' }),
      ]);
      const result = extractor.extract(graph);
      const barrel = result.entries.find((e) => e.content.includes('Barrel'));
      expect(barrel).toBeDefined();
      expect(barrel!.type).toBe('pattern');
    });

    it('detects community module boundaries', () => {
      // Create files in different directories to trigger directory-based communities
      const graph = buildGraph([
        makeFile({
          path: 'src/auth/login.ts',
          imports: [
            {
              fromFile: 'src/auth/login.ts',
              toModule: './session',
              resolvedPath: 'src/auth/session.ts',
              line: 1,
            },
          ],
        }),
        makeFile({ path: 'src/auth/session.ts' }),
        makeFile({
          path: 'src/api/routes.ts',
          imports: [
            {
              fromFile: 'src/api/routes.ts',
              toModule: './handlers',
              resolvedPath: 'src/api/handlers.ts',
              line: 1,
            },
          ],
        }),
        makeFile({ path: 'src/api/handlers.ts' }),
      ]);
      const result = extractor.extract(graph);
      const community = result.entries.find((e) => e.content.includes('module communit'));
      expect(community).toBeDefined();
    });
  });

  describe('gotcha extraction', () => {
    it('detects high fan-in files', () => {
      const hubFile = makeFile({ path: 'src/utils/helpers.ts' });
      const importers: ScannedFile[] = [];
      for (let i = 0; i < 10; i++) {
        importers.push(
          makeFile({
            path: `src/modules/mod${i}.ts`,
            imports: [
              {
                fromFile: `src/modules/mod${i}.ts`,
                toModule: '../utils/helpers',
                resolvedPath: 'src/utils/helpers.ts',
                line: 1,
              },
            ],
          })
        );
      }
      const graph = buildGraph([hubFile, ...importers]);
      const result = extractor.extract(graph);
      const fanIn = result.entries.find((e) => e.content.includes('fan-in'));
      expect(fanIn).toBeDefined();
      expect(fanIn!.type).toBe('gotcha');
    });

    it('detects large files', () => {
      const graph = buildGraph([makeFile({ path: 'src/godfile.ts', loc: 500 })]);
      const result = extractor.extract(graph);
      const large = result.entries.find((e) => e.content.includes('Large file'));
      expect(large).toBeDefined();
      expect(large!.type).toBe('gotcha');
    });

    it('detects test coverage gaps', () => {
      const graph = buildGraph([
        makeFile({ path: 'src/service.ts', loc: 100 }),
        makeFile({ path: 'src/repo.ts', loc: 80 }),
        // No test files
      ]);
      const result = extractor.extract(graph);
      const coverage = result.entries.find((e) => e.content.includes('Test coverage gap'));
      expect(coverage).toBeDefined();
      expect(coverage!.type).toBe('gotcha');
    });

    it('does not flag files that have tests', () => {
      const graph = buildGraph([
        makeFile({ path: 'src/service.ts', loc: 100 }),
        makeFile({ path: 'src/service.test.ts', loc: 50 }),
      ]);
      const result = extractor.extract(graph);
      const coverage = result.entries.find((e) => e.content.includes('Test coverage gap'));
      // If found, the untested count should be 0 (the source file has a test)
      if (coverage) {
        expect(coverage.metadata.value).toBe(0);
      }
    });
  });

  describe('options', () => {
    it('respects minConfidence filter', () => {
      const graph = buildGraph([
        makeFile({ path: 'src/a.ts', loc: 100 }),
        makeFile({ path: 'src/b.ts', loc: 100 }),
      ]);
      const lowConf = extractor.extract(graph, { minConfidence: 0.1 });
      const highConf = extractor.extract(graph, { minConfidence: 0.95 });
      expect(lowConf.entries.length).toBeGreaterThanOrEqual(highConf.entries.length);
    });

    it('respects maxPerType cap', () => {
      // Build a graph with many files to generate many entries
      const files: ScannedFile[] = [];
      for (let i = 0; i < 30; i++) {
        files.push(makeFile({ path: `src/mod${i}.ts`, loc: 400 })); // All large -> many gotchas
      }
      const graph = buildGraph(files);
      const result = extractor.extract(graph, { maxPerType: 3 });
      const gotchas = result.entries.filter((e) => e.type === 'gotcha');
      expect(gotchas.length).toBeLessThanOrEqual(3);
    });

    it('uses custom workspaceId in entry IDs', () => {
      const graph = buildGraph([makeFile({ path: 'src/a.ts', loc: 100 })]);
      const result = extractor.extract(graph, { workspaceId: 'my-project' });
      const hasCustomWs = result.entries.some((e) => e.id.includes('my-project'));
      expect(hasCustomWs).toBe(true);
    });
  });

  describe('stats', () => {
    it('reports correct stats', () => {
      const graph = buildGraph([
        makeFile({ path: 'src/a.ts', loc: 100 }),
        makeFile({ path: 'src/b.ts', loc: 200 }),
      ]);
      const result = extractor.extract(graph);
      expect(result.stats.totalExtracted).toBe(result.entries.length);
      expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.stats.byType.wisdom).toBe('number');
      expect(typeof result.stats.byType.pattern).toBe('number');
      expect(typeof result.stats.byType.gotcha).toBe('number');
    });
  });
});
