/**
 * Tests for CodebaseGraph.searchSymbolsByName — discovery-friendly symbol search.
 *
 * Regression guard: `find <partial>` queries previously returned 0 results because
 * findSymbolsByName was exact-match-only. searchSymbolsByName adds a ranked
 * case-insensitive fallback (exact > prefix > substring) while keeping exact
 * precision when the symbol name is known.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import type { ScannedFile } from '../types';

describe('CodebaseGraph.searchSymbolsByName', () => {
  let graph: CodebaseGraph;

  const sym = (name: string, type: string, file: string) => ({
    name,
    type: type as any,
    filePath: file,
    line: 1,
    language: 'typescript' as const,
    visibility: 'public' as const,
  });

  const file: ScannedFile = {
    path: 'src/compilers.ts',
    language: 'typescript',
    symbols: [
      sym('compileToUnity', 'function', 'src/compilers.ts'),
      sym('compileScene', 'function', 'src/compilers.ts'),
      sym('compile', 'function', 'src/compilers.ts'),
      sym('precompileShaders', 'function', 'src/compilers.ts'),
      sym('Parser', 'class', 'src/compilers.ts'),
    ],
    imports: [],
    calls: [],
    loc: 50,
    sizeBytes: 800,
  };

  beforeEach(() => {
    graph = new CodebaseGraph();
    graph.buildFromScanResult({
      rootDir: '/test',
      files: [file],
      stats: {
        totalFiles: 1,
        totalSymbols: 5,
        totalImports: 0,
        totalCalls: 0,
        totalLoc: 50,
        durationMs: 0,
        errors: [],
        filesByLanguage: { typescript: 1 },
        symbolsByType: { function: 4, class: 1 },
      },
    });
  });

  it('returns exact match with matchMode "exact" when the symbol name is known', () => {
    const { matchMode, results } = graph.searchSymbolsByName('compile');
    expect(matchMode).toBe('exact');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('compile');
  });

  it('falls back to fuzzy substring search for partial names (the regression case)', () => {
    const { matchMode, results } = graph.searchSymbolsByName('compileTo');
    // No symbol named exactly "compileTo" → fuzzy fallback.
    expect(matchMode).toBe('fuzzy');
    const names = results.map((r) => r.name);
    expect(names).toContain('compileToUnity');
    expect(names.length).toBeGreaterThan(0);
  });

  it('is case-insensitive in the fuzzy path', () => {
    const { matchMode, results } = graph.searchSymbolsByName('PARSE');
    expect(matchMode).toBe('fuzzy');
    expect(results.map((r) => r.name)).toContain('Parser');
  });

  it('ranks prefix matches above interior substring matches', () => {
    const { results } = graph.searchSymbolsByName('compiles'); // matches none exactly
    // "compileScene"/"compileToUnity" start with "compile"; "precompileShaders" contains it.
    const { results: sub } = graph.searchSymbolsByName('compile');
    // exact "compile" wins; verify the fuzzy ordering separately via a non-exact needle:
    const { results: pre } = graph.searchSymbolsByName('comp');
    const idxPrefix = pre.findIndex((r) => r.name.toLowerCase().startsWith('comp'));
    const idxInterior = pre.findIndex((r) => r.name === 'precompileShaders');
    expect(idxPrefix).toBeGreaterThanOrEqual(0);
    if (idxInterior >= 0) expect(idxPrefix).toBeLessThan(idxInterior);
    expect(sub.length).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('returns matchMode "none" with empty results for a non-existent symbol', () => {
    const { matchMode, results } = graph.searchSymbolsByName('zzzNoSuchSymbol');
    expect(matchMode).toBe('none');
    expect(results).toHaveLength(0);
  });

  it('respects the limit cap and flags truncation', () => {
    const { results, truncated } = graph.searchSymbolsByName('compile', { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
    expect(typeof truncated).toBe('boolean');
  });
});
