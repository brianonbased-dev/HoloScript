import { describe, expect, it, vi } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import type { ImpactTraversalReceipt } from '../index';
import type { ScannedFile } from '../types';

function makeFile(path: string, imports: ScannedFile['imports'] = []): ScannedFile {
  return {
    path,
    language: 'typescript',
    symbols: [],
    imports,
    calls: [],
    loc: 1,
    sizeBytes: 1,
  };
}

function buildGraph(files: ScannedFile[]): CodebaseGraph {
  const graph = new CodebaseGraph();
  graph.buildFromScanResult({
    rootDir: '/impact-test',
    files,
    stats: {
      totalFiles: files.length,
      totalSymbols: 0,
      totalImports: files.reduce((total, file) => total + file.imports.length, 0),
      totalCalls: 0,
      totalLoc: files.length,
      durationMs: 0,
      errors: [],
      filesByLanguage: { typescript: files.length },
      symbolsByType: {},
    },
  });
  return graph;
}

function makeImportChain(length: number): ScannedFile[] {
  return Array.from({ length }, (_, index) => {
    const path = `src/f${index}.ts`;
    return makeFile(
      path,
      index === 0
        ? []
        : [
            {
              fromFile: path,
              toModule: `./f${index - 1}`,
              resolvedPath: `src/f${index - 1}.ts`,
              line: 1,
            },
          ]
    );
  });
}

describe('CodebaseGraph bounded impact traversal', () => {
  it('preserves complete getImpactSet compatibility', () => {
    const graph = buildGraph(makeImportChain(6));

    expect(Array.from(graph.getImpactSet(['src/f0.ts']))).toEqual([
      'src/f0.ts',
      'src/f1.ts',
      'src/f2.ts',
      'src/f3.ts',
      'src/f4.ts',
      'src/f5.ts',
    ]);

    const result: ImpactTraversalReceipt = graph.getImpactTraversal(['src/f0.ts']);
    expect(result).toMatchObject({
      complete: true,
      truncated: false,
      truncationReasons: [],
      resolvedChangedFiles: ['src/f0.ts'],
      unresolvedChangedFiles: [],
      processedFiles: 6,
      traversedEdges: 5,
      maxDepthReached: 5,
      queuedFilesRemaining: 0,
    });
  });

  it('returns a truthful partial result at the affected-file budget', () => {
    const graph = buildGraph(makeImportChain(8));
    const result = graph.getImpactTraversal(['src/f0.ts'], { maxAffectedFiles: 3 });

    expect(Array.from(result.affectedFiles)).toEqual(['src/f0.ts', 'src/f1.ts', 'src/f2.ts']);
    expect(result).toMatchObject({
      complete: false,
      truncated: true,
      truncationReasons: ['max_affected_files'],
      processedFiles: 3,
      maxDepthReached: 2,
      budgets: { maxAffectedFiles: 3 },
    });
  });

  it('reports depth and deadline truncation without hiding the seed files', () => {
    const graph = buildGraph(makeImportChain(8));
    const depthBounded = graph.getImpactTraversal(['src/f0.ts'], { maxDepth: 1 });
    expect(Array.from(depthBounded.affectedFiles)).toEqual(['src/f0.ts', 'src/f1.ts']);
    expect(depthBounded.truncationReasons).toEqual(['max_depth']);

    const deadlineBounded = graph.getImpactTraversal(['src/f0.ts'], { deadlineMs: 0 });
    expect(Array.from(deadlineBounded.affectedFiles)).toEqual(['src/f0.ts']);
    expect(deadlineBounded).toMatchObject({
      complete: false,
      truncated: true,
      truncationReasons: ['deadline'],
      processedFiles: 0,
      budgets: { deadlineMs: 0 },
    });
  });

  it('canonicalizes path variants and reports missing changed files as partial', () => {
    const graph = buildGraph(makeImportChain(3));
    const result = graph.getImpactTraversal([
      'src\\f0.ts',
      './src/f0.ts',
      '/impact-test/src/f0.ts',
      'src/missing.ts',
      'src/missing.ts',
    ]);

    expect(result.resolvedChangedFiles).toEqual(['src/f0.ts']);
    expect(result.unresolvedChangedFiles).toEqual(['src/missing.ts']);
    expect(Array.from(result.affectedFiles)).toEqual(['src/f0.ts', 'src/f1.ts', 'src/f2.ts']);
    expect(result).toMatchObject({
      complete: false,
      truncated: true,
      truncationReasons: ['changed_file_not_indexed'],
    });
  });

  it('distinguishes exact-cap completion from seed truncation and terminates cycles', () => {
    const exactGraph = buildGraph(makeImportChain(3));
    const exact = exactGraph.getImpactTraversal(['src/f0.ts'], { maxAffectedFiles: 3 });
    expect(exact).toMatchObject({ complete: true, truncated: false });
    expect(exact.affectedFiles.size).toBe(3);

    const tooManySeeds = exactGraph.getImpactTraversal(['src/f0.ts', 'src/f1.ts', 'src/f2.ts'], {
      maxAffectedFiles: 2,
    });
    expect(tooManySeeds.resolvedChangedFiles).toHaveLength(3);
    expect(tooManySeeds.affectedFiles.size).toBe(2);
    expect(tooManySeeds.truncationReasons).toEqual(['max_affected_files']);

    const cyclicFiles = makeImportChain(3);
    cyclicFiles[0].imports.push({
      fromFile: 'src/f0.ts',
      toModule: './f2',
      resolvedPath: 'src/f2.ts',
      line: 1,
    });
    const cyclic = buildGraph(cyclicFiles).getImpactTraversal(['src/f0.ts']);
    expect(cyclic.affectedFiles.size).toBe(3);
    expect(cyclic).toMatchObject({ complete: true, processedFiles: 3 });
  });

  it('bounds first-call community grouping with the same deadline', () => {
    const graph = buildGraph(makeImportChain(5));
    const result = graph.getCommunityAwareImpactTraversal(['src/f0.ts'], { deadlineMs: 0 });

    expect(result).toMatchObject({
      complete: false,
      truncated: true,
      truncationReasons: ['deadline'],
      communityGrouping: 'directory-fallback',
      communityGroupingComplete: false,
      ungroupedAffectedFiles: 1,
    });
    expect(result.impactByCommunity.size).toBe(0);
  });

  it('keeps affected-count certainty when only cached community grouping hits the deadline', () => {
    const graph = buildGraph(makeImportChain(5));
    graph.detectCommunities();
    let clockReads = 0;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      clockReads++;
      return clockReads <= 5 ? 100 : 200;
    });

    try {
      const result = graph.getCommunityAwareImpactTraversal(['src/f4.ts'], { deadlineMs: 5 });
      expect(result).toMatchObject({
        complete: false,
        truncated: true,
        truncationReasons: ['deadline'],
        impactTraversalComplete: true,
        impactTraversalTruncationReasons: [],
        communityGrouping: 'cached',
        communityGroupingComplete: false,
        ungroupedAffectedFiles: 1,
      });
      expect(result.affectedFiles.size).toBe(1);
    } finally {
      now.mockRestore();
    }
  });

  it('bounds a 20k-file fanout without quadratic queue removal', () => {
    const target = makeFile('src/target.ts');
    const importers = Array.from({ length: 19_999 }, (_, index) => {
      const path = `src/importer-${index}.ts`;
      return makeFile(path, [
        {
          fromFile: path,
          toModule: './target',
          resolvedPath: 'src/target.ts',
          line: 1,
        },
      ]);
    });
    const graph = buildGraph([target, ...importers]);
    const startedAt = Date.now();
    const result = graph.getImpactTraversal(['src/target.ts'], { maxAffectedFiles: 250 });

    expect(result.affectedFiles.size).toBe(250);
    expect(result.truncationReasons).toEqual(['max_affected_files']);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });
});
