import { describe, it, expect, vi } from 'vitest';
import { GraphRAGEngine } from './GraphRAGEngine';
import { CodebaseGraph } from './CodebaseGraph';
import type { EmbeddingIndex } from './EmbeddingIndex';

describe('GraphRAGEngine.query', () => {
  it('returns stable empty result when semantic search finds nothing', async () => {
    const graph = new CodebaseGraph();
    const index = {
      search: vi.fn().mockResolvedValue([]),
      searchWithFilters: vi.fn().mockResolvedValue([]),
    } as unknown as EmbeddingIndex;

    const engine = new GraphRAGEngine(graph, index);
    const out = await engine.query('no matches for this query string');

    expect(out.results).toEqual([]);
    expect(out.totalMatches).toBe(0);
    expect(out.communities).toEqual([]);
    expect(out.query).toBe('no matches for this query string');
    expect(index.search).toHaveBeenCalledOnce();
  });
});
