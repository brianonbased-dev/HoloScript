import { describe, expect, it } from 'vitest';
import { GraphRAGEngine } from '../GraphRAGEngine';
import type { SymbolSearchIndex } from '../SearchIndex';
import type { CodebaseGraph } from '../CodebaseGraph';
import type { ExternalSymbolDefinition } from '../types';

function symbol(
  name: string,
  filePath: string,
  type: ExternalSymbolDefinition['type'] = 'function'
): ExternalSymbolDefinition {
  return {
    name,
    type,
    language: type === 'file' ? 'plaintext' : 'typescript',
    visibility: 'public',
    filePath,
    line: 1,
    column: 0,
  };
}

describe('GraphRAGEngine hybrid rank preservation', () => {
  it('does not let unrelated graph centrality bury an explicitly named file', async () => {
    const exact = symbol('safe-commit.ps1', 'scripts/safe-commit.ps1', 'file');
    const central = symbol('repoRoot', 'src/repo-root.ts');
    const index: SymbolSearchIndex = {
      search: async () => [],
      searchWithFilters: async () => [],
      searchHybrid: async () => [
        {
          symbol: exact,
          file: exact.filePath,
          type: exact.type,
          score: 0.7,
          vectorScore: 0.1,
          lexicalScore: 0.9,
          exactMatch: true,
          matchKind: 'exact-name',
        },
        {
          symbol: central,
          file: central.filePath,
          type: central.type,
          score: 0.99,
          vectorScore: 0.99,
          lexicalScore: 0,
          exactMatch: false,
          matchKind: 'semantic',
        },
      ],
    };
    const graph = {
      getCallersOf: (name: string) =>
        name === 'repoRoot' ? Array.from({ length: 20 }, (_, i) => ({ callerId: `caller${i}` })) : [],
      getCalleesOf: () => [],
      getSymbolImpact: (name: string) =>
        name === 'repoRoot' ? new Set(Array.from({ length: 20 }, (_, i) => `file${i}`)) : new Set(),
      getCommunityForFile: () => undefined,
    } as unknown as CodebaseGraph;
    const engine = new GraphRAGEngine(graph, index);

    const result = await engine.query('safe-commit', { topK: 2 });

    expect(result.results.map((item) => item.file)).toEqual([
      'scripts/safe-commit.ps1',
      'src/repo-root.ts',
    ]);
    expect(result.results[0]).toMatchObject({
      exactMatch: true,
      lexicalScore: 0.9,
      vectorScore: 0.1,
    });
  });
});
