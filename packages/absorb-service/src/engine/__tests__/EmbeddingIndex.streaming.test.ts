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
});
