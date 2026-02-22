/**
 * EmbeddingSearchTrait — Production Test Suite
 *
 * Uses context.setState / context.getState pattern (different from node.__state).
 */
import { describe, it, expect, vi } from 'vitest';
import { embeddingSearchHandler } from '../EmbeddingSearchTrait';

function makeNode() { return { id: 'emb_node' }; }

function makeCtx() {
  let _state: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: vi.fn((update: Record<string, any>) => { _state = { ..._state, ...update }; }),
    getState: vi.fn(() => _state),
  };
}

function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...embeddingSearchHandler.defaultConfig!, ...cfg };
  embeddingSearchHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('embeddingSearchHandler.defaultConfig', () => {
  const d = embeddingSearchHandler.defaultConfig!;
  it('embedding_model=all-minilm-l6-v2', () => expect(d.embedding_model).toBe('all-minilm-l6-v2'));
  it('similarity_metric=cosine', () => expect(d.similarity_metric).toBe('cosine'));
  it('top_k=5', () => expect(d.top_k).toBe(5));
  it('min_score=0.6', () => expect(d.min_score).toBe(0.6));
  it('cache_embeddings=true', () => expect(d.cache_embeddings).toBe(true));
  it('max_cache_size=1000', () => expect(d.max_cache_size).toBe(1000));
  it('cross_modal=false', () => expect(d.cross_modal).toBe(false));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('embeddingSearchHandler.onAttach', () => {
  it('calls context.setState with embeddingSearch state', () => {
    const { ctx } = attach();
    expect(ctx.setState).toHaveBeenCalled();
    const callArg = ctx.setState.mock.calls[0][0];
    expect(callArg).toHaveProperty('embeddingSearch');
  });
  it('initializes totalQueries=0', () => {
    const { ctx } = attach();
    const state = ctx.getState().embeddingSearch;
    expect(state.totalQueries).toBe(0);
  });
  it('initializes cacheHits=0', () => {
    const { ctx } = attach();
    expect(ctx.getState().embeddingSearch.cacheHits).toBe(0);
  });
  it('initializes embeddingCache as empty Map', () => {
    const { ctx } = attach();
    expect(ctx.getState().embeddingSearch.embeddingCache.size).toBe(0);
  });
  it('initializes lastResults=[]', () => {
    const { ctx } = attach();
    expect(ctx.getState().embeddingSearch.lastResults).toEqual([]);
  });
  it('initializes isSearching=false', () => {
    const { ctx } = attach();
    expect(ctx.getState().embeddingSearch.isSearching).toBe(false);
  });
  it('initializes avgQueryTimeMs=0', () => {
    const { ctx } = attach();
    expect(ctx.getState().embeddingSearch.avgQueryTimeMs).toBe(0);
  });
  it('emits search:ready with model and metric', () => {
    const { ctx } = attach({ embedding_model: 'bge-small', similarity_metric: 'dot_product' });
    expect(ctx.emit).toHaveBeenCalledWith('search:ready', { model: 'bge-small', metric: 'dot_product' });
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('embeddingSearchHandler.onDetach', () => {
  it('clears the embeddingCache on detach', () => {
    const { node, ctx, config } = attach();
    const state = ctx.getState().embeddingSearch;
    state.embeddingCache.set('hello', new Float32Array([1, 2, 3]));
    expect(state.embeddingCache.size).toBe(1);
    embeddingSearchHandler.onDetach!(node, config, ctx);
    expect(state.embeddingCache.size).toBe(0);
  });
  it('no error when state is missing on detach', () => {
    const { node, config } = attach();
    const emptyCtx = { emit: vi.fn(), setState: vi.fn(), getState: vi.fn(() => ({})) };
    expect(() => embeddingSearchHandler.onDetach!(node, config, emptyCtx)).not.toThrow();
  });
});

// ─── onEvent — search:query ───────────────────────────────────────────────────

describe('embeddingSearchHandler.onEvent — search:query', () => {
  it('increments totalQueries', () => {
    const { node, ctx, config } = attach();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'glowing sword' } });
    expect(ctx.getState().embeddingSearch.totalQueries).toBe(1);
  });
  it('cumulative totalQueries', () => {
    const { node, ctx, config } = attach();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'a' } });
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'b' } });
    expect(ctx.getState().embeddingSearch.totalQueries).toBe(2);
  });
  it('sets isSearching=true', () => {
    const { node, ctx, config } = attach();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'test' } });
    expect(ctx.getState().embeddingSearch.isSearching).toBe(true);
  });
  it('emits search:started with query and model', () => {
    const { node, ctx, config } = attach({ embedding_model: 'e5-small' });
    ctx.emit.mockClear();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'fire spell' } });
    expect(ctx.emit).toHaveBeenCalledWith('search:started', expect.objectContaining({ query: 'fire spell', model: 'e5-small' }));
  });
  it('emits search:cache_hit when query is cached and cache_embeddings=true', () => {
    const { node, ctx, config } = attach({ cache_embeddings: true });
    const state = ctx.getState().embeddingSearch;
    state.embeddingCache.set('cached query', new Float32Array([0.1, 0.2]));
    ctx.emit.mockClear();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'cached query' } });
    expect(ctx.emit).toHaveBeenCalledWith('search:cache_hit', { query: 'cached query' });
  });
  it('increments cacheHits on cache hit', () => {
    const { node, ctx, config } = attach({ cache_embeddings: true });
    const state = ctx.getState().embeddingSearch;
    state.embeddingCache.set('hit!', new Float32Array([0.5]));
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'hit!' } });
    expect(ctx.getState().embeddingSearch.cacheHits).toBe(1);
  });
  it('no cache_hit emit when cache_embeddings=false even if entry exists', () => {
    const { node, ctx, config } = attach({ cache_embeddings: false });
    const state = ctx.getState().embeddingSearch;
    state.embeddingCache.set('q', new Float32Array([0.1]));
    ctx.emit.mockClear();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q' } });
    expect(ctx.emit).not.toHaveBeenCalledWith('search:cache_hit', expect.anything());
  });
  it('no cacheHits increment when query not cached', () => {
    const { node, ctx, config } = attach({ cache_embeddings: true });
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'new query' } });
    expect(ctx.getState().embeddingSearch.cacheHits).toBe(0);
  });
});

// ─── onEvent — search:results ─────────────────────────────────────────────────

describe('embeddingSearchHandler.onEvent — search:results', () => {
  it('sets isSearching=false', () => {
    const { node, ctx, config } = attach();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q' } });
    embeddingSearchHandler.onEvent!(node, config, ctx, {
      type: 'search:results',
      payload: { results: [], queryTimeMs: 10 },
    });
    expect(ctx.getState().embeddingSearch.isSearching).toBe(false);
  });
  it('filters results below min_score', () => {
    const { node, ctx, config } = attach({ min_score: 0.7, top_k: 10 });
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q' } });
    embeddingSearchHandler.onEvent!(node, config, ctx, {
      type: 'search:results',
      payload: {
        results: [
          { id: 'a', score: 0.9, payload: {} },
          { id: 'b', score: 0.5, payload: {} }, // below threshold
          { id: 'c', score: 0.8, payload: {} },
        ],
        queryTimeMs: 5,
      },
    });
    expect(ctx.getState().embeddingSearch.lastResults).toHaveLength(2);
  });
  it('trims results to top_k', () => {
    const { node, ctx, config } = attach({ min_score: 0, top_k: 2 });
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q' } });
    embeddingSearchHandler.onEvent!(node, config, ctx, {
      type: 'search:results',
      payload: {
        results: [
          { id: '1', score: 0.9, payload: {} },
          { id: '2', score: 0.8, payload: {} },
          { id: '3', score: 0.7, payload: {} },
        ],
        queryTimeMs: 5,
      },
    });
    expect(ctx.getState().embeddingSearch.lastResults).toHaveLength(2);
  });
  it('stores lastResults correctly', () => {
    const { node, ctx, config } = attach({ min_score: 0.5, top_k: 5 });
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q' } });
    embeddingSearchHandler.onEvent!(node, config, ctx, {
      type: 'search:results',
      payload: { results: [{ id: 'sword', score: 0.95, payload: { name: 'Fire Sword' } }], queryTimeMs: 12 },
    });
    expect(ctx.getState().embeddingSearch.lastResults[0].id).toBe('sword');
  });
  it('emits search:complete with resultCount', () => {
    const { node, ctx, config } = attach({ min_score: 0.5, top_k: 10 });
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q' } });
    ctx.emit.mockClear();
    embeddingSearchHandler.onEvent!(node, config, ctx, {
      type: 'search:results',
      payload: { results: [{ id: 'a', score: 0.8, payload: {} }], queryTimeMs: 20 },
    });
    expect(ctx.emit).toHaveBeenCalledWith('search:complete', expect.objectContaining({ resultCount: 1, queryTimeMs: 20 }));
  });
  it('avgQueryTimeMs = queryTimeMs on first query', () => {
    const { node, ctx, config } = attach();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q' } });
    embeddingSearchHandler.onEvent!(node, config, ctx, {
      type: 'search:results',
      payload: { results: [], queryTimeMs: 42 },
    });
    expect(ctx.getState().embeddingSearch.avgQueryTimeMs).toBe(42);
  });
  it('avgQueryTimeMs is running average across queries', () => {
    const { node, ctx, config } = attach({ min_score: 0 });
    // First query
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q1' } });
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:results', payload: { results: [], queryTimeMs: 10 } });
    // Second query
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q2' } });
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:results', payload: { results: [], queryTimeMs: 30 } });
    // avg should be (10*1 + 30)/2 = 20
    expect(ctx.getState().embeddingSearch.avgQueryTimeMs).toBeCloseTo(20);
  });
  it('cacheHitRate reported in search:complete', () => {
    const { node, ctx, config } = attach({ cache_embeddings: true, min_score: 0 });
    const state = ctx.getState().embeddingSearch;
    state.embeddingCache.set('hit', new Float32Array([0.1]));
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'hit' } }); // cache hit
    ctx.emit.mockClear();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:results', payload: { results: [], queryTimeMs: 5 } });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'search:complete')!;
    expect(call[1].cacheHitRate).toBeCloseTo(1.0); // 1/1
  });
  it('handles empty results gracefully', () => {
    const { node, ctx, config } = attach();
    embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:query', payload: { query: 'q' } });
    expect(() =>
      embeddingSearchHandler.onEvent!(node, config, ctx, { type: 'search:results', payload: { results: [], queryTimeMs: 0 } })
    ).not.toThrow();
    expect(ctx.getState().embeddingSearch.lastResults).toHaveLength(0);
  });
});

// ─── early-return guard ───────────────────────────────────────────────────────

describe('embeddingSearchHandler.onEvent — guard', () => {
  it('no-ops when state is missing', () => {
    const node = makeNode();
    const emptyCtx = { emit: vi.fn(), setState: vi.fn(), getState: vi.fn(() => ({})) };
    const config = { ...embeddingSearchHandler.defaultConfig! };
    expect(() =>
      embeddingSearchHandler.onEvent!(node, config, emptyCtx, { type: 'search:query', payload: { query: 'q' } })
    ).not.toThrow();
  });
});
