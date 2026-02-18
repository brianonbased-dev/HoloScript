/**
 * EmbeddingSearchTrait Production Tests
 *
 * Semantic similarity search: query dispatch, cache hits, result filtering,
 * average query time, and detach cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embeddingSearchHandler } from '../EmbeddingSearchTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'search-node') {
  return { id } as any;
}

function makeConfig(overrides: Partial<Parameters<typeof embeddingSearchHandler.onAttach>[1]> = {}) {
  return { ...embeddingSearchHandler.defaultConfig, ...overrides };
}

function makeContext() {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
  };
}

function getSearchState(ctx: ReturnType<typeof makeContext>) {
  return ctx.getState().embeddingSearch;
}

// =============================================================================
// TESTS
// =============================================================================

describe('EmbeddingSearchTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    embeddingSearchHandler.onAttach(node, config, ctx);
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('initializes with zeroed counters', () => {
      const s = getSearchState(ctx);
      expect(s.totalQueries).toBe(0);
      expect(s.cacheHits).toBe(0);
      expect(s.lastResults).toEqual([]);
      expect(s.isSearching).toBe(false);
      expect(s.avgQueryTimeMs).toBe(0);
    });

    it('emits search:ready with model and metric', () => {
      expect(ctx.emit).toHaveBeenCalledWith('search:ready', {
        model: 'all-minilm-l6-v2',
        metric: 'cosine',
      });
    });

    it('has proper defaults', () => {
      const d = embeddingSearchHandler.defaultConfig;
      expect(d.embedding_model).toBe('all-minilm-l6-v2');
      expect(d.similarity_metric).toBe('cosine');
      expect(d.top_k).toBe(5);
      expect(d.min_score).toBe(0.6);
      expect(d.cache_embeddings).toBe(true);
      expect(d.max_cache_size).toBe(1000);
      expect(d.cross_modal).toBe(false);
    });

    it('handler name is embedding_search', () => {
      expect(embeddingSearchHandler.name).toBe('embedding_search');
    });
  });

  // ======== QUERY DISPATCH ========

  describe('query dispatch', () => {
    it('emits search:started and increments total queries', () => {
      ctx.emit.mockClear();

      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:query',
        payload: { query: 'find red objects' },
      });

      const s = getSearchState(ctx);
      expect(s.totalQueries).toBe(1);
      expect(s.isSearching).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('search:started', {
        query: 'find red objects',
        model: 'all-minilm-l6-v2',
      });
    });

    it('tracks cache hit when query is cached', () => {
      const s = getSearchState(ctx);
      s.embeddingCache.set('cached query', new Float32Array([1, 2, 3]));
      ctx.emit.mockClear();

      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:query',
        payload: { query: 'cached query' },
      });

      expect(s.cacheHits).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('search:cache_hit', { query: 'cached query' });
    });

    it('does NOT report cache hit when caching disabled', () => {
      const cfg = makeConfig({ cache_embeddings: false });
      const c = makeContext();
      embeddingSearchHandler.onAttach(node, cfg, c);
      getSearchState(c).embeddingCache.set('q', new Float32Array([1]));
      c.emit.mockClear();

      embeddingSearchHandler.onEvent!(node, cfg, c, {
        type: 'search:query',
        payload: { query: 'q' },
      });

      expect(c.emit).not.toHaveBeenCalledWith('search:cache_hit', expect.anything());
    });

    it('handles empty query string', () => {
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:query',
        payload: {},
      });

      expect(getSearchState(ctx).totalQueries).toBe(1);
    });
  });

  // ======== RESULTS FILTERING ========

  describe('results filtering', () => {
    it('filters results below min_score', () => {
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:query',
        payload: { query: 'test' },
      });

      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:results',
        payload: {
          results: [
            { id: 'a', score: 0.9, payload: {} },
            { id: 'b', score: 0.3, payload: {} }, // below 0.6 min
            { id: 'c', score: 0.7, payload: {} },
          ],
          queryTimeMs: 50,
        },
      });

      const s = getSearchState(ctx);
      expect(s.lastResults).toHaveLength(2);
      expect(s.lastResults.map((r: any) => r.id)).toEqual(['a', 'c']);
    });

    it('limits to top_k results', () => {
      const cfg = makeConfig({ top_k: 2, min_score: 0 });
      const c = makeContext();
      embeddingSearchHandler.onAttach(node, cfg, c);

      embeddingSearchHandler.onEvent!(node, cfg, c, {
        type: 'search:query',
        payload: { query: 'x' },
      });
      embeddingSearchHandler.onEvent!(node, cfg, c, {
        type: 'search:results',
        payload: {
          results: [
            { id: '1', score: 0.9, payload: {} },
            { id: '2', score: 0.8, payload: {} },
            { id: '3', score: 0.7, payload: {} },
          ],
          queryTimeMs: 10,
        },
      });

      expect(getSearchState(c).lastResults).toHaveLength(2);
    });

    it('sets isSearching false after results', () => {
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:query',
        payload: { query: 'q' },
      });
      expect(getSearchState(ctx).isSearching).toBe(true);

      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:results',
        payload: { results: [], queryTimeMs: 5 },
      });
      expect(getSearchState(ctx).isSearching).toBe(false);
    });

    it('emits search:complete with result count and cache rate', () => {
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:query',
        payload: { query: 'test' },
      });
      ctx.emit.mockClear();

      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:results',
        payload: {
          results: [{ id: 'r1', score: 0.8, payload: {} }],
          queryTimeMs: 25,
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith('search:complete', {
        resultCount: 1,
        queryTimeMs: 25,
        cacheHitRate: 0,
      });
    });
  });

  // ======== AVERAGE QUERY TIME ========

  describe('average query time', () => {
    it('sets query time on first result', () => {
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:query',
        payload: { query: 'q1' },
      });
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:results',
        payload: { results: [], queryTimeMs: 100 },
      });

      expect(getSearchState(ctx).avgQueryTimeMs).toBe(100);
    });

    it('calculates rolling average over multiple queries', () => {
      // Query 1: 100ms
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:query',
        payload: { query: 'q1' },
      });
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:results',
        payload: { results: [], queryTimeMs: 100 },
      });

      // Query 2: 200ms → avg = (100 + 200) / 2 = 150
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:query',
        payload: { query: 'q2' },
      });
      embeddingSearchHandler.onEvent!(node, config, ctx, {
        type: 'search:results',
        payload: { results: [], queryTimeMs: 200 },
      });

      expect(getSearchState(ctx).avgQueryTimeMs).toBe(150);
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('clears embedding cache on detach', () => {
      const s = getSearchState(ctx);
      s.embeddingCache.set('a', new Float32Array([1]));
      s.embeddingCache.set('b', new Float32Array([2]));

      embeddingSearchHandler.onDetach!(node, config, ctx);

      expect(s.embeddingCache.size).toBe(0);
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const bare = makeNode('bare');
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };

      embeddingSearchHandler.onEvent!(bare, config, noCtx, {
        type: 'search:query',
        payload: { query: 'test' },
      });

      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
