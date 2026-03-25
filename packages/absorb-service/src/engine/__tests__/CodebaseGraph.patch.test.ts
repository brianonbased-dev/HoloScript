/**
 * Tests for CodebaseGraph incremental patching
 *
 * Verifies removeFile(), patchFiles(), and v2 serialization.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import type { ScannedFile } from '../types';

describe('CodebaseGraph - Incremental Patching', () => {
  let graph: CodebaseGraph;

  const mockFile1: ScannedFile = {
    path: 'src/foo.ts',
    language: 'typescript',
    symbols: [
      {
        name: 'Foo',
        type: 'class',
        filePath: 'src/foo.ts',
        line: 1,
        language: 'typescript',
      },
    ],
    imports: [{ fromFile: 'src/foo.ts', toModule: './bar', line: 1 }],
    calls: [{ filePath: 'src/foo.ts', line: 5, callerId: 'Foo', calleeName: 'bar' }],
    loc: 10,
    sizeBytes: 200,
  };

  const mockFile2: ScannedFile = {
    path: 'src/bar.ts',
    language: 'typescript',
    symbols: [
      {
        name: 'bar',
        type: 'function',
        filePath: 'src/bar.ts',
        line: 1,
        language: 'typescript',
      },
    ],
    imports: [],
    calls: [],
    loc: 5,
    sizeBytes: 100,
  };

  beforeEach(() => {
    graph = new CodebaseGraph();
    graph.buildFromScanResult({
      rootDir: '/test',
      files: [mockFile1, mockFile2],
      stats: {
        totalFiles: 2,
        totalSymbols: 2,
        totalImports: 1,
        totalCalls: 1,
        totalLoc: 15,
        durationMs: 0,
        errors: [],
        filesByLanguage: { typescript: 2 },
        symbolsByType: { class: 1, function: 1 },
      },
    });
  });

  describe('removeFile', () => {
    it('removes file and returns true', () => {
      const result = graph.removeFile('src/foo.ts');
      expect(result).toBe(true);
      expect(graph.getFile('src/foo.ts')).toBeUndefined();
    });

    it('returns false for non-existent file', () => {
      const result = graph.removeFile('src/missing.ts');
      expect(result).toBe(false);
    });

    it('removes all symbols from the file', () => {
      graph.removeFile('src/foo.ts');
      graph.buildIndexes();
      const symbols = graph.getSymbolsInFile('src/foo.ts');
      expect(symbols.length).toBe(0);
    });

    it('removes imports originating from the file', () => {
      graph.removeFile('src/foo.ts');
      graph.buildIndexes();
      const imports = graph.getImportsOf('src/foo.ts');
      expect(imports.length).toBe(0);
    });

    it('removes calls originating from the file', () => {
      graph.removeFile('src/foo.ts');
      graph.buildIndexes();
      const callees = graph.getCalleesOf('Foo');
      expect(callees.length).toBe(0);
    });

    it('invalidates community cache', () => {
      const communities1 = graph.detectCommunities();
      expect(communities1.size).toBeGreaterThanOrEqual(0);

      graph.removeFile('src/foo.ts');
      // Community cache should be null (will be recomputed on next access)
      const communities2 = graph.detectCommunities();
      expect(communities2).toBeDefined();
    });
  });

  describe('patchFiles', () => {
    it('removes stale and adds fresh files', () => {
      const newFile: ScannedFile = {
        path: 'src/baz.ts',
        language: 'typescript',
        symbols: [
          {
            name: 'baz',
            type: 'function',
            filePath: 'src/baz.ts',
            line: 1,
            language: 'typescript',
          },
        ],
        imports: [],
        calls: [],
        loc: 3,
        sizeBytes: 50,
      };

      graph.patchFiles(['src/foo.ts'], [newFile]);

      expect(graph.getFile('src/foo.ts')).toBeUndefined();
      expect(graph.getFile('src/baz.ts')).toBeDefined();
      expect(graph.getFile('src/bar.ts')).toBeDefined();
    });

    it('rebuilds indexes after patching', () => {
      const newFile: ScannedFile = {
        path: 'src/baz.ts',
        language: 'typescript',
        symbols: [
          {
            name: 'baz',
            type: 'function',
            filePath: 'src/baz.ts',
            line: 1,
            language: 'typescript',
          },
        ],
        imports: [],
        calls: [],
        loc: 3,
        sizeBytes: 50,
      };

      graph.patchFiles(['src/foo.ts'], [newFile]);

      const bazSymbols = graph.findSymbolsByName('baz');
      expect(bazSymbols.length).toBe(1);
      expect(bazSymbols[0].name).toBe('baz');
    });

    it('correctly updates stats after patching', () => {
      const newFile: ScannedFile = {
        path: 'src/baz.ts',
        language: 'typescript',
        symbols: [
          {
            name: 'baz',
            type: 'function',
            filePath: 'src/baz.ts',
            line: 1,
            language: 'typescript',
          },
        ],
        imports: [],
        calls: [],
        loc: 3,
        sizeBytes: 50,
      };

      graph.patchFiles(['src/foo.ts'], [newFile]);

      const stats = graph.getStats();
      expect(stats.totalFiles).toBe(2); // bar + baz (foo removed)
      expect(stats.totalSymbols).toBe(2); // bar + baz symbols
    });
  });

  describe('v2 serialization', () => {
    it('serializes with gitCommitHash and fileHashes', () => {
      graph.gitCommitHash = 'abc123def456';
      graph.fileHashes = { 'src/foo.ts': 'hash1', 'src/bar.ts': 'hash2' };

      const serialized = graph.serialize();
      const data = JSON.parse(serialized);

      expect(data.version).toBe(2);
      expect(data.gitCommitHash).toBe('abc123def456');
      expect(data.fileHashes).toEqual({ 'src/foo.ts': 'hash1', 'src/bar.ts': 'hash2' });
    });

    it('deserializes v2 format preserving git data', () => {
      graph.gitCommitHash = 'abc123def456';
      graph.fileHashes = { 'src/foo.ts': 'hash1', 'src/bar.ts': 'hash2' };

      const serialized = graph.serialize();
      const deserialized = CodebaseGraph.deserialize(serialized);

      expect(deserialized.gitCommitHash).toBe('abc123def456');
      expect(deserialized.fileHashes).toEqual({ 'src/foo.ts': 'hash1', 'src/bar.ts': 'hash2' });
    });

    it('deserializes v1 format (backward compatibility)', () => {
      const v1Data = {
        version: 1,
        rootDir: '/test',
        files: [mockFile1, mockFile2],
        communities: {},
      };

      const v1Serialized = JSON.stringify(v1Data);
      const deserialized = CodebaseGraph.deserialize(v1Serialized);

      expect(deserialized.getStats().totalFiles).toBe(2);
      expect(deserialized.gitCommitHash).toBeUndefined();
      expect(deserialized.fileHashes).toBeUndefined();
    });

    it('round-trips v2 serialization', () => {
      graph.gitCommitHash = 'test-commit-hash';
      graph.fileHashes = { 'src/foo.ts': 'aaa', 'src/bar.ts': 'bbb' };

      const serialized = graph.serialize();
      const deserialized = CodebaseGraph.deserialize(serialized);

      expect(deserialized.getStats().totalFiles).toBe(graph.getStats().totalFiles);
      expect(deserialized.getStats().totalSymbols).toBe(graph.getStats().totalSymbols);
      expect(deserialized.gitCommitHash).toBe(graph.gitCommitHash);
      expect(deserialized.fileHashes).toEqual(graph.fileHashes);
    });
  });

  describe('indexes after patching', () => {
    it('maintains correct caller index', () => {
      const callersBefore = graph.getCallersOf('bar');
      expect(callersBefore.length).toBeGreaterThan(0);

      graph.removeFile('src/foo.ts');
      graph.buildIndexes();

      const callersAfter = graph.getCallersOf('bar');
      expect(callersAfter.length).toBe(0); // foo.ts called bar, now removed
    });

    it('maintains correct callees index', () => {
      const calleesBefore = graph.getCalleesOf('Foo');
      expect(calleesBefore.length).toBeGreaterThan(0);

      graph.removeFile('src/foo.ts');
      graph.buildIndexes();

      const calleesAfter = graph.getCalleesOf('Foo');
      expect(calleesAfter.length).toBe(0);
    });

    it('maintains correct import indexes', () => {
      graph.removeFile('src/foo.ts');
      graph.buildIndexes();

      const importsOf = graph.getImportsOf('src/foo.ts');
      expect(importsOf.length).toBe(0);
    });
  });
});
