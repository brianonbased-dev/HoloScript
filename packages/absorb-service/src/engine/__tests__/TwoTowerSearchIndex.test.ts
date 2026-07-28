import { describe, expect, it } from 'vitest';
import { TwoTowerSearchIndex } from '../TwoTowerSearchIndex';
import { CodebaseGraph } from '../CodebaseGraph';
import { GraphRAGEngine } from '../GraphRAGEngine';
import type { ExternalSymbolDefinition } from '../types';
import type { EmbeddingProvider } from '../providers/EmbeddingProvider';

class StaticQueryProvider implements EmbeddingProvider {
  readonly name = 'static-query';

  constructor(private readonly embeddingsByText: Map<string, number[]>) {}

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const embedding = this.embeddingsByText.get(text);
      if (!embedding) throw new Error(`No fixture embedding for ${text}`);
      return embedding;
    });
  }
}

function makeSymbol(overrides: Partial<ExternalSymbolDefinition> = {}): ExternalSymbolDefinition {
  return {
    name: 'target',
    type: 'function',
    language: 'typescript',
    visibility: 'public',
    filePath: 'packages/core/src/target.ts',
    line: 1,
    column: 0,
    isExported: true,
    signature: 'function target(): void',
    ...overrides,
  };
}

describe('TwoTowerSearchIndex', () => {
  it('ranks precomputed symbol embeddings using the query tower', async () => {
    const queryProvider = new StaticQueryProvider(new Map([['find target', [1, 0, 0]]]));
    const index = new TwoTowerSearchIndex({
      queryProvider,
      entries: [
        {
          symbol: makeSymbol({ name: 'other', filePath: 'packages/core/src/other.ts' }),
          embedding: [0, 1, 0],
        },
        { symbol: makeSymbol({ name: 'target' }), embedding: [0.9, 0.1, 0] },
      ],
    });

    const [first] = await index.search('find target', 2);

    expect(first?.symbol.name).toBe('target');
    expect(first?.score).toBeGreaterThan(0.99);
    expect(index.size).toBe(2);
  });

  it('applies language, type, and file filters before scoring', async () => {
    const queryProvider = new StaticQueryProvider(new Map([['query', [1, 0]]]));
    const index = new TwoTowerSearchIndex({
      queryProvider,
      entries: [
        {
          symbol: makeSymbol({ name: 'tsTarget', filePath: 'packages/core/src/a.ts' }),
          embedding: [1, 0],
        },
        {
          symbol: makeSymbol({
            name: 'pyTarget',
            language: 'python',
            filePath: 'packages/absorb-service/src/a.py',
          }),
          embedding: [1, 0],
        },
        {
          symbol: makeSymbol({
            name: 'methodTarget',
            type: 'method',
            filePath: 'packages/core/src/method.ts',
          }),
          embedding: [1, 0],
        },
      ],
    });

    const results = await index.searchWithFilters('query', 10, {
      language: 'typescript',
      type: 'function',
      file: 'core/src',
    });

    expect(results.map((r) => r.symbol.name)).toEqual(['tsTarget']);
  });

  it('can use raw dot-product scoring for HoloDistill/R-GAT receipts', async () => {
    const queryProvider = new StaticQueryProvider(new Map([['query', [2, 0]]]));
    const index = new TwoTowerSearchIndex({
      queryProvider,
      scoreMode: 'dot',
      entries: [{ symbol: makeSymbol(), embedding: [3, 0] }],
    });

    const [first] = await index.search('query', 1);

    expect(first?.score).toBe(6);
  });

  it('preserves exact-name recall when the vector tower prefers another symbol', async () => {
    const queryProvider = new StaticQueryProvider(new Map([['safe-commit', [1, 0]]]));
    const index = new TwoTowerSearchIndex({
      queryProvider,
      entries: [
        {
          symbol: makeSymbol({
            name: 'safe-commit.ps1',
            type: 'file',
            language: 'plaintext',
            filePath: 'scripts/safe-commit.ps1',
          }),
          embedding: [0, 1],
          text: 'plaintext file safe-commit.ps1 in scripts/safe-commit.ps1',
        },
        {
          symbol: makeSymbol({ name: 'repoRoot', filePath: 'src/repo-root.ts' }),
          embedding: [1, 0],
        },
      ],
    });

    const [first] = await index.searchHybrid('safe-commit', 2);

    expect(first).toMatchObject({
      file: 'scripts/safe-commit.ps1',
      exactMatch: true,
      matchKind: 'exact-name',
    });
  });

  it('can back GraphRAGEngine through the search-index contract', async () => {
    const queryProvider = new StaticQueryProvider(new Map([['find target', [1, 0, 0]]]));
    const index = new TwoTowerSearchIndex({
      queryProvider,
      entries: [
        { symbol: makeSymbol({ name: 'target' }), embedding: [1, 0, 0] },
        {
          symbol: makeSymbol({ name: 'other', filePath: 'packages/core/src/other.ts' }),
          embedding: [0, 1, 0],
        },
      ],
    });
    const engine = new GraphRAGEngine(new CodebaseGraph(), index);

    const result = await engine.query('find target', { topK: 1 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.symbol.name).toBe('target');
    expect(result.results[0]?.semanticScore).toBe(1);
  });

  it('rejects query/index dimension mismatches explicitly', async () => {
    const queryProvider = new StaticQueryProvider(new Map([['query', [1, 0, 0]]]));
    const index = new TwoTowerSearchIndex({
      queryProvider,
      entries: [{ symbol: makeSymbol(), embedding: [1, 0] }],
    });

    await expect(index.search('query', 1)).rejects.toThrow(/query dimension 3/);
  });
});
