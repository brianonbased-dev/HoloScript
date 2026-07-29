import { describe, expect, it, vi } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import { EmbeddingIndex } from '../EmbeddingIndex';
import type { EmbeddingProvider } from '../providers/EmbeddingProvider';
import type { CallEdge, ExternalSymbolDefinition, ScannedFile, ScanResult } from '../types';

function makeSymbol(index: number): ExternalSymbolDefinition {
  return {
    name: `Symbol${index}`,
    type: 'function',
    filePath: `src/symbol-${index}.ts`,
    line: index + 1,
    column: 1,
    language: 'typescript',
    visibility: 'public',
    signature: `function Symbol${index}(): void`,
  };
}

function makeNamedSymbol(
  name: string,
  filePath: string,
  overrides: Partial<ExternalSymbolDefinition> = {}
): ExternalSymbolDefinition {
  return {
    name,
    type: 'function',
    filePath,
    line: overrides.line ?? 1,
    column: 1,
    language: 'typescript',
    visibility: 'public',
    signature: `function ${name}(): void`,
    ...overrides,
  };
}

function makeScannedFile(
  filePath: string,
  symbols: ExternalSymbolDefinition[],
  calls: CallEdge[] = [],
  docComment?: string
): ScannedFile {
  return {
    path: filePath,
    language: 'typescript',
    symbols,
    imports: [],
    calls,
    loc: Math.max(symbols.length, 1),
    sizeBytes: 100,
    docComment,
  };
}

function makeGraph(files: ScannedFile[]): CodebaseGraph {
  const stats = {
    totalFiles: files.length,
    filesByLanguage: { typescript: files.length },
    totalSymbols: files.reduce((sum, file) => sum + file.symbols.length, 0),
    symbolsByType: { function: files.reduce((sum, file) => sum + file.symbols.length, 0) },
    totalImports: 0,
    totalCalls: files.reduce((sum, file) => sum + file.calls.length, 0),
    totalLoc: files.reduce((sum, file) => sum + file.loc, 0),
    durationMs: 1,
    errors: [],
  };
  const scanResult: ScanResult = {
    rootDir: 'src',
    rootDirs: ['src'],
    files,
    stats,
  };
  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);
  return graph;
}

describe('EmbeddingIndex streaming batches', () => {
  it('converts symbols to text per embedding batch instead of one monorepo-sized batch', async () => {
    const batchSizes: number[] = [];
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => {
        batchSizes.push(texts.length);
        return texts.map((_, index) => [batchSizes.length, index]);
      }),
    };
    const symbols = Array.from({ length: 5 }, (_, index) => makeSymbol(index));
    const progress: Array<{ batch: number; total: number; processed: number }> = [];
    const index = new EmbeddingIndex({ provider, batchSize: 2, useWorkers: false });

    await index.buildIndex({ getAllSymbols: () => symbols } as any, (batch, total, processed) =>
      progress.push({ batch, total, processed })
    );

    expect(batchSizes).toEqual([2, 2, 1]);
    expect(progress).toEqual([
      { batch: 1, total: 3, processed: 2 },
      { batch: 2, total: 3, processed: 4 },
      { batch: 3, total: 3, processed: 5 },
    ]);
    expect(JSON.parse(index.serialize()).entries).toHaveLength(5);
  });

  it('folds HoloGraph caller, callee, and sibling vocabulary into full builds', async () => {
    const embeddedTexts: string[] = [];
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => {
        embeddedTexts.push(...texts);
        return texts.map((_, index) => [1, index]);
      }),
    };

    const target = makeNamedSymbol('runSearch', 'src/search.ts', { line: 5 });
    const sibling = makeNamedSymbol('rankResults', 'src/search.ts', { line: 12 });
    const caller = makeNamedSymbol('orchestrateQuery', 'src/orchestrator.ts', { line: 3 });
    const graph = makeGraph([
      makeScannedFile(
        'src/search.ts',
        [target, sibling],
        [
          {
            callerId: 'runSearch',
            calleeName: 'rankResults',
            filePath: 'src/search.ts',
            line: 8,
            column: 2,
          },
        ]
      ),
      makeScannedFile(
        'src/orchestrator.ts',
        [caller],
        [
          {
            callerId: 'orchestrateQuery',
            calleeName: 'runSearch',
            filePath: 'src/orchestrator.ts',
            line: 6,
            column: 2,
          },
        ]
      ),
    ]);
    const index = new EmbeddingIndex({ provider, batchSize: 10, useWorkers: false });

    await index.buildIndex(graph);

    const targetText = embeddedTexts.find((text) => text.includes('function runSearch'));
    expect(targetText).toContain('graph context:');
    expect(targetText).toContain('called by orchestrateQuery');
    expect(targetText).toContain('calls rankResults');
    expect(targetText).toContain('file siblings rankResults');
  });

  it('gates graph-context terms for benchmark ablations without changing defaults', async () => {
    const makeProvider = () => {
      const embeddedTexts: string[] = [];
      const provider: EmbeddingProvider = {
        name: 'test-provider',
        getEmbeddings: vi.fn(async (texts: string[]) => {
          embeddedTexts.push(...texts);
          return texts.map((_, index) => [1, index]);
        }),
      };
      return { embeddedTexts, provider };
    };

    const target = makeNamedSymbol('runSearch', 'src/search.ts', { line: 5 });
    const sibling = makeNamedSymbol('rankResults', 'src/search.ts', { line: 12 });
    const graph = {
      getAllSymbols: () => [target],
      getCommunityForFile: () => 'search-pipeline',
      getCallersOf: () => [{ callerId: 'orchestrateQuery' }],
      getCalleesOf: () => [{ calleeName: 'rankResults' }],
      getFile: () => ({ docComment: 'Routes query text through search ranking.' }),
      getSymbolsInFile: () => [target, sibling],
    } as unknown as CodebaseGraph;

    const defaultRun = makeProvider();
    await new EmbeddingIndex({
      provider: defaultRun.provider,
      batchSize: 10,
      useWorkers: false,
    }).buildIndex(graph);

    expect(defaultRun.embeddedTexts[0]).toContain('community search-pipeline');
    expect(defaultRun.embeddedTexts[0]).toContain(
      'file purpose Routes query text through search ranking.'
    );
    expect(defaultRun.embeddedTexts[0]).toContain('called by orchestrateQuery');
    expect(defaultRun.embeddedTexts[0]).toContain('calls rankResults');
    expect(defaultRun.embeddedTexts[0]).toContain('file siblings rankResults');

    const callersOnly = makeProvider();
    await new EmbeddingIndex({
      provider: callersOnly.provider,
      batchSize: 10,
      useWorkers: false,
      graphTextTerms: {
        community: false,
        fileDoc: false,
        callees: false,
        siblings: false,
      },
    }).buildIndex(graph);

    expect(callersOnly.embeddedTexts[0]).toContain('graph context: called by orchestrateQuery');
    expect(callersOnly.embeddedTexts[0]).not.toContain('community search-pipeline');
    expect(callersOnly.embeddedTexts[0]).not.toContain('file purpose');
    expect(callersOnly.embeddedTexts[0]).not.toContain('calls rankResults');
    expect(callersOnly.embeddedTexts[0]).not.toContain('file siblings rankResults');

    const noGraphTerms = makeProvider();
    await new EmbeddingIndex({
      provider: noGraphTerms.provider,
      batchSize: 10,
      useWorkers: false,
      graphTextTerms: {
        community: false,
        fileDoc: false,
        callers: false,
        callees: false,
        siblings: false,
      },
    }).buildIndex(graph);

    expect(noGraphTerms.embeddedTexts[0]).not.toContain('graph context:');
  });

  it('uses the same graph-fused text path for incremental symbol adds', async () => {
    const embeddedTexts: string[] = [];
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => {
        embeddedTexts.push(...texts);
        return texts.map((_, index) => [1, index]);
      }),
    };

    const target = makeNamedSymbol('refreshCache', 'src/cache.ts', { line: 5 });
    const sibling = makeNamedSymbol('evictExpiredEntries', 'src/cache.ts', { line: 16 });
    const caller = makeNamedSymbol('serveRequest', 'src/http.ts', { line: 2 });
    const graph = makeGraph([
      makeScannedFile(
        'src/cache.ts',
        [target, sibling],
        [
          {
            callerId: 'refreshCache',
            calleeName: 'evictExpiredEntries',
            filePath: 'src/cache.ts',
            line: 7,
            column: 2,
          },
        ]
      ),
      makeScannedFile(
        'src/http.ts',
        [caller],
        [
          {
            callerId: 'serveRequest',
            calleeName: 'refreshCache',
            filePath: 'src/http.ts',
            line: 9,
            column: 2,
          },
        ]
      ),
    ]);
    const index = new EmbeddingIndex({ provider, batchSize: 10, useWorkers: false });

    await index.addSymbols([target], graph);

    expect(embeddedTexts).toHaveLength(1);
    expect(embeddedTexts[0]).toContain('called by serveRequest');
    expect(embeddedTexts[0]).toContain('calls evictExpiredEntries');
    expect(embeddedTexts[0]).toContain('file siblings evictExpiredEntries');
  });

  it('reuses exact symbol texts and embeds only the changed delta', async () => {
    const embeddedBatches: string[][] = [];
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => {
        embeddedBatches.push([...texts]);
        return texts.map((text) => [text.length, embeddedBatches.length]);
      }),
    };
    const initialGraph = makeGraph([
      makeScannedFile('src/a.ts', [makeNamedSymbol('alpha', 'src/a.ts')]),
      makeScannedFile('src/b.ts', [makeNamedSymbol('beta', 'src/b.ts')]),
      makeScannedFile('src/c.ts', [makeNamedSymbol('gamma', 'src/c.ts')]),
    ]);
    const refreshedGraph = makeGraph([
      makeScannedFile('src/a.ts', [
        makeNamedSymbol('alpha', 'src/a.ts', {
          signature: 'function alpha(input: string): string',
        }),
      ]),
      makeScannedFile('src/b.ts', [makeNamedSymbol('beta', 'src/b.ts', { line: 200 })]),
      makeScannedFile('src/d.ts', [makeNamedSymbol('delta', 'src/d.ts')]),
    ]);
    const index = new EmbeddingIndex({ provider, batchSize: 10, useWorkers: false });
    await index.buildIndex(initialGraph);
    embeddedBatches.length = 0;

    const receipt = await index.refreshIndex(refreshedGraph);

    expect(receipt).toEqual({
      kind: 'EmbeddingRefreshReceipt',
      previousSymbols: 3,
      totalSymbols: 3,
      reusedSymbols: 1,
      embeddedSymbols: 2,
      retiredSymbols: 2,
      reuseRatio: 0.333333,
      batchCount: 1,
    });
    expect(embeddedBatches).toHaveLength(1);
    expect(embeddedBatches[0]).toHaveLength(2);
    expect(embeddedBatches[0].some((text) => text.includes('alpha'))).toBe(true);
    expect(embeddedBatches[0].some((text) => text.includes('delta'))).toBe(true);
    expect(embeddedBatches[0].some((text) => text.includes('beta'))).toBe(false);
    expect(JSON.parse(index.serialize()).entries.map((entry: any) => entry.symbol.name)).toEqual([
      'alpha',
      'beta',
      'delta',
    ]);
  });

  it('coalesces refresh scheduling while preserving exact reuse and terminal progress', async () => {
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => texts.map((text) => [text.length, 1])),
    };
    const symbols = Array.from({ length: 1025 }, (_, symbolIndex) => makeSymbol(symbolIndex));
    const graph = { getAllSymbols: () => symbols } as CodebaseGraph;
    const index = new EmbeddingIndex({ provider, batchSize: 2048, useWorkers: false });
    await index.buildIndex(graph);
    vi.mocked(provider.getEmbeddings).mockClear();

    // Force a high reconciliation-batch count without making the initial test
    // fixture pay the sequential full-build scheduler cost.
    (index as unknown as { batchSize: number }).batchSize = 1;
    const progress: Array<{ batch: number; total: number; processed: number }> = [];
    const receipt = await index.refreshIndex(graph, (batch, total, processed) => {
      progress.push({ batch, total, processed });
    });

    expect(receipt).toEqual({
      kind: 'EmbeddingRefreshReceipt',
      previousSymbols: 1025,
      totalSymbols: 1025,
      reusedSymbols: 1025,
      embeddedSymbols: 0,
      retiredSymbols: 0,
      reuseRatio: 1,
      batchCount: 1025,
    });
    expect(provider.getEmbeddings).not.toHaveBeenCalled();
    expect(progress[0]).toEqual({ batch: 1, total: 1025, processed: 1 });
    expect(progress.at(-1)).toEqual({ batch: 1025, total: 1025, processed: 1025 });
    expect(progress.length).toBeLessThan(32);
  });

  it('checks cancellation within the coalesced batch bound without replacing the live index', async () => {
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => texts.map((text) => [text.length, 1])),
    };
    const symbols = Array.from({ length: 513 }, (_, symbolIndex) => makeSymbol(symbolIndex));
    const graph = { getAllSymbols: () => symbols } as CodebaseGraph;
    const index = new EmbeddingIndex({ provider, batchSize: 1024, useWorkers: false });
    await index.buildIndex(graph);
    const before = index.serialize();
    (index as unknown as { batchSize: number }).batchSize = 1;
    const checkedBatches: number[] = [];

    await expect(
      index.refreshIndex(graph, (batch) => {
        checkedBatches.push(batch);
        if (batch === 256) throw new Error('refresh cancelled by test');
      })
    ).rejects.toThrow('refresh cancelled by test');

    expect(checkedBatches).toEqual([1, 256]);
    expect(index.serialize()).toBe(before);
  });

  it('invalidates reused symbols when their graph-context text changes', async () => {
    const embeddedTexts: string[] = [];
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => {
        embeddedTexts.push(...texts);
        return texts.map((text) => [text.length, 1]);
      }),
    };
    const target = makeNamedSymbol('refreshCache', 'src/cache.ts');
    const stable = makeNamedSymbol('serveRequest', 'src/http.ts');
    const initialGraph = makeGraph([
      makeScannedFile('src/cache.ts', [target]),
      makeScannedFile('src/http.ts', [stable]),
    ]);
    const sibling = makeNamedSymbol('evictExpiredEntries', 'src/cache.ts');
    const refreshedGraph = makeGraph([
      makeScannedFile('src/cache.ts', [target, sibling]),
      makeScannedFile('src/http.ts', [stable]),
    ]);
    const index = new EmbeddingIndex({ provider, batchSize: 10, useWorkers: false });
    await index.buildIndex(initialGraph);
    embeddedTexts.length = 0;

    const receipt = await index.refreshIndex(refreshedGraph);

    expect(receipt).toMatchObject({
      totalSymbols: 3,
      reusedSymbols: 1,
      embeddedSymbols: 2,
    });
    expect(embeddedTexts.some((text) => text.includes('refreshCache'))).toBe(true);
    expect(embeddedTexts.some((text) => text.includes('evictExpiredEntries'))).toBe(true);
    expect(embeddedTexts.some((text) => text.includes('serveRequest'))).toBe(false);
  });

  it('adds bounded code-intelligence aliases from symbol and module vocabulary', async () => {
    const embeddedTexts: string[] = [];
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => {
        embeddedTexts.push(...texts);
        return texts.map((_, index) => [1, index]);
      }),
    };

    const detector = makeNamedSymbol('CommunityDetector', 'src/CommunityDetector.ts', {
      type: 'class',
      signature: 'class CommunityDetector',
    });
    const graph = makeGraph([
      makeScannedFile(
        'src/CommunityDetector.ts',
        [detector],
        [],
        'Detects module boundaries with Louvain communities.'
      ),
    ]);
    const index = new EmbeddingIndex({ provider, batchSize: 10, useWorkers: false });

    await index.buildIndex(graph);

    expect(embeddedTexts[0]).toContain('semantic aliases:');
    expect(embeddedTexts[0]).toContain('group related files clusters');
  });

  it('anchors outbuild intent aliases on implementation files rather than tests', async () => {
    const embeddedTexts: string[] = [];
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => {
        embeddedTexts.push(...texts);
        return texts.map((_, index) => [1, index]);
      }),
    };
    const index = new EmbeddingIndex({ provider, batchSize: 10, useWorkers: false });

    await index.addSymbols([
      makeNamedSymbol('GitChangeDetector', 'src/GitChangeDetector.ts', {
        type: 'class',
        signature: 'class GitChangeDetector',
      }),
      makeNamedSymbol('GitChangeDetector', 'src/__tests__/GitChangeDetector.test.ts', {
        type: 'class',
        signature: 'class GitChangeDetector',
      }),
      makeNamedSymbol('CodebaseSceneCompiler', 'src/visualization/CodebaseSceneCompiler.ts', {
        type: 'class',
        signature: 'class CodebaseSceneCompiler',
      }),
      makeNamedSymbol('GraphRAGEngine', 'src/GraphRAGEngine.ts', {
        type: 'class',
        signature: 'class GraphRAGEngine',
      }),
      makeNamedSymbol('HoloEmitter', 'src/HoloEmitter.ts', {
        type: 'class',
        signature: 'class HoloEmitter',
      }),
      makeNamedSymbol('ClaimNetworkGraph', 'src/ClaimNetworkGraph.ts', {
        type: 'class',
        signature: 'class ClaimNetworkGraph',
      }),
    ]);

    const gitSourceText = embeddedTexts.find((text) =>
      text.includes('in src/GitChangeDetector.ts')
    );
    const gitTestText = embeddedTexts.find((text) =>
      text.includes('in src/__tests__/GitChangeDetector.test.ts')
    );
    const sceneCompilerText = embeddedTexts.find((text) => text.includes('CodebaseSceneCompiler'));
    const graphRagText = embeddedTexts.find((text) => text.includes('GraphRAGEngine'));
    const holoEmitterText = embeddedTexts.find((text) => text.includes('HoloEmitter'));
    const claimNetworkText = embeddedTexts.find((text) => text.includes('ClaimNetworkGraph'));

    expect(gitSourceText).toContain('figure out files changed since last run');
    expect(gitTestText).not.toContain('semantic aliases:');
    expect(sceneCompilerText).toContain('render graph navigable 3d scene');
    expect(graphRagText).toContain('answer natural language question about code');
    expect(holoEmitterText).toContain('turn codebase into holoscript world');
    expect(claimNetworkText).toContain('measure how tangled and complex code is');
  });

  it('keeps semantic search results diverse by file before returning duplicates', async () => {
    const provider: EmbeddingProvider = {
      name: 'rank-provider',
      getEmbeddings: vi.fn(async (texts: string[]) =>
        texts.map((text) => {
          if (text === 'find query') return [1, 0];
          if (text.includes('firstDuplicate')) return [1, 0];
          if (text.includes('secondDuplicate')) return [0.999, 0.001];
          if (text.includes('otherFileMatch')) return [0.998, 0.002];
          return [0, 1];
        })
      ),
    };
    const firstDuplicate = makeNamedSymbol('firstDuplicate', 'src/same.ts');
    const secondDuplicate = makeNamedSymbol('secondDuplicate', 'src/same.ts', { line: 2 });
    const otherFileMatch = makeNamedSymbol('otherFileMatch', 'src/other.ts');
    const index = new EmbeddingIndex({ provider, batchSize: 10, useWorkers: false });

    await index.addSymbols([firstDuplicate, secondDuplicate, otherFileMatch]);
    const results = await index.search('find query', 2);

    expect(results.map((result) => result.file)).toEqual(['src/same.ts', 'src/other.ts']);
    expect(results.map((result) => result.symbol.name)).toEqual([
      'firstDuplicate',
      'otherFileMatch',
    ]);
  });

  it('indexes parser-light files and returns an explicitly named shell file in the top result', async () => {
    const provider: EmbeddingProvider = {
      name: 'adversarial-vector-provider',
      getEmbeddings: vi.fn(async (texts: string[]) =>
        texts.map((text) => {
          if (text === 'safe-commit') return [1, 0];
          if (text.includes('safe-commit')) return [0, 1];
          return [1, 0];
        })
      ),
    };
    const unrelated = makeNamedSymbol('repoRoot', 'src/repo-root.ts');
    const graph = makeGraph([
      makeScannedFile('src/repo-root.ts', [unrelated]),
      {
        path: 'scripts/safe-commit.ps1',
        language: 'plaintext',
        symbols: [],
        imports: [],
        calls: [],
        loc: 48,
        sizeBytes: 1200,
        docComment: 'Atomic commit wrapper using explicit paths.',
      },
      {
        path: 'scripts/safe-commit.sh',
        language: 'plaintext',
        symbols: [],
        imports: [],
        calls: [],
        loc: 42,
        sizeBytes: 1000,
        docComment: 'POSIX atomic commit wrapper using explicit paths.',
      },
    ]);
    const index = new EmbeddingIndex({ provider, batchSize: 10, useWorkers: false });

    await index.buildIndex(graph);
    const vectorOnly = await index.search('safe-commit', 3);
    const hybrid = await index.searchHybrid('safe-commit', 3);

    expect(index.size).toBe(3);
    expect(vectorOnly[0]?.file).toBe('src/repo-root.ts');
    expect(
      hybrid
        .slice(0, 2)
        .map((result) => result.file)
        .sort()
    ).toEqual(['scripts/safe-commit.ps1', 'scripts/safe-commit.sh']);
    expect(hybrid[0]).toMatchObject({
      type: 'file',
      exactMatch: true,
      matchKind: 'exact-name',
    });
  });

  it('does not give generic interactive scenes the codebase scene compiler alias', async () => {
    const embeddedTexts: string[] = [];
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => {
        embeddedTexts.push(...texts);
        return texts.map((_, index) => [1, index]);
      }),
    };
    const enricher = makeNamedSymbol(
      'InteractiveSceneEnricher',
      'src/InteractiveSceneEnricher.ts',
      {
        type: 'class',
        signature: 'class InteractiveSceneEnricher',
        docComment: 'Adds hover and click behavior to an interactive scene.',
      }
    );
    const compiler = makeNamedSymbol('CodebaseSceneCompiler', 'src/CodebaseSceneCompiler.ts', {
      type: 'class',
      signature: 'class CodebaseSceneCompiler',
      docComment: 'Transforms a CodebaseGraph into a HoloComposition scene.',
    });
    const index = new EmbeddingIndex({ provider, batchSize: 10, useWorkers: false });

    await index.addSymbols([enricher, compiler]);

    const enricherText = embeddedTexts.find((text) => text.includes('InteractiveSceneEnricher'));
    const compilerText = embeddedTexts.find((text) => text.includes('CodebaseSceneCompiler'));
    expect(enricherText).not.toContain('render graph navigable 3d scene');
    expect(compilerText).toContain('render graph navigable 3d scene');
  });
});
