/**
 * EmbeddingSearchTrait Tests
 *
 * Tests for semantic similarity search trait covering initialization,
 * query handling, cache hits, result filtering, and state management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { embeddingSearchHandler } from '../EmbeddingSearchTrait';
import type { EmbeddingSearchConfig } from '../EmbeddingSearchTrait';
import { createMockNode } from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Extended mock context with setState/getState for context-based traits
// ---------------------------------------------------------------------------

interface StatefulMockContext {
  emit: (event: string, data: unknown) => void;
  emittedEvents: Array<{ event: string; data: unknown }>;
  clearEvents: () => void;
  getState: () => Record<string, unknown>;
  setState: (updates: Record<string, unknown>) => void;
  player?: { position: { x: number; y: number; z: number } };
}

function createStatefulMockContext(): StatefulMockContext {
  const emittedEvents: Array<{ event: string; data: unknown }> = [];
  let state: Record<string, unknown> = {};
  return {
    emit(event: string, data: unknown) {
      emittedEvents.push({ event, data });
    },
    emittedEvents,
    clearEvents() {
      emittedEvents.length = 0;
    },
    getState() {
      return state;
    },
    setState(updates: Record<string, unknown>) {
      state = { ...state, ...updates };
    },
  };
}

function getLastEvent(ctx: StatefulMockContext, eventType: string) {
  for (let i = ctx.emittedEvents.length - 1; i >= 0; i--) {
    if (ctx.emittedEvents[i].event === eventType) {
      return ctx.emittedEvents[i].data;
    }
  }
  return undefined;
}

function getEventCount(ctx: StatefulMockContext, eventType: string): number {
  return ctx.emittedEvents.filter((e) => e.event === eventType).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmbeddingSearchTrait', () => {
  let node: Record<string, unknown>;
  let ctx: StatefulMockContext;

  beforeEach(() => {
    node = createMockNode('search-node');
    ctx = createStatefulMockContext();
    embeddingSearchHandler.onAttach!(node as any, embeddingSearchHandler.defaultConfig, ctx as any);
  });

  // =========================================================================
  // Default config
  // =========================================================================

  describe('default config', () => {
    it('uses all-minilm-l6-v2 model', () => {
      expect(embeddingSearchHandler.defaultConfig.embedding_model).toBe('all-minilm-l6-v2');
    });

    it('uses cosine similarity', () => {
      expect(embeddingSearchHandler.defaultConfig.similarity_metric).toBe('cosine');
    });

    it('returns top 5 results', () => {
      expect(embeddingSearchHandler.defaultConfig.top_k).toBe(5);
    });

    it('min score defaults to 0.6', () => {
      expect(embeddingSearchHandler.defaultConfig.min_score).toBe(0.6);
    });

    it('enables caching with 1000 max', () => {
      expect(embeddingSearchHandler.defaultConfig.cache_embeddings).toBe(true);
      expect(embeddingSearchHandler.defaultConfig.max_cache_size).toBe(1000);
    });

    it('disables cross-modal search by default', () => {
      expect(embeddingSearchHandler.defaultConfig.cross_modal).toBe(false);
    });
  });

  // =========================================================================
  // onAttach
  // =========================================================================

  describe('onAttach', () => {
    it('initializes embeddingSearch state', () => {
      const state = ctx.getState().embeddingSearch as any;
      expect(state).toBeDefined();
      expect(state.totalQueries).toBe(0);
      expect(state.cacheHits).toBe(0);
      expect(state.isSearching).toBe(false);
      expect(state.lastResults).toEqual([]);
    });

    it('emits search:ready with model and metric', () => {
      expect(getEventCount(ctx, 'search:ready')).toBe(1);
      const data = getLastEvent(ctx, 'search:ready') as any;
      expect(data.model).toBe('all-minilm-l6-v2');
      expect(data.metric).toBe('cosine');
    });
  });

  // =========================================================================
  // onDetach
  // =========================================================================

  describe('onDetach', () => {
    it('clears embedding cache on detach', () => {
      const state = ctx.getState().embeddingSearch as any;
      state.embeddingCache.set('test', new Float32Array(3));

      embeddingSearchHandler.onDetach!(node as any, embeddingSearchHandler.defaultConfig, ctx as any);

      expect(state.embeddingCache.size).toBe(0);
    });
  });

  // =========================================================================
  // search:query event
  // =========================================================================

  describe('search:query event', () => {
    it('increments totalQueries and sets isSearching', () => {
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:query',
        payload: { query: 'find red objects' },
      });

      const state = ctx.getState().embeddingSearch as any;
      expect(state.totalQueries).toBe(1);
      expect(state.isSearching).toBe(true);
    });

    it('emits search:started', () => {
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:query',
        payload: { query: 'nearby doors' },
      });

      expect(getEventCount(ctx, 'search:started')).toBe(1);
      const data = getLastEvent(ctx, 'search:started') as any;
      expect(data.query).toBe('nearby doors');
    });

    it('detects cache hit when query is cached', () => {
      const state = ctx.getState().embeddingSearch as any;
      state.embeddingCache.set('cached query', new Float32Array(3));

      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:query',
        payload: { query: 'cached query' },
      });

      expect(state.cacheHits).toBe(1);
      expect(getEventCount(ctx, 'search:cache_hit')).toBe(1);
    });

    it('does not count cache hit when caching is disabled', () => {
      const noCacheConfig: EmbeddingSearchConfig = {
        ...embeddingSearchHandler.defaultConfig,
        cache_embeddings: false,
      };
      const state = ctx.getState().embeddingSearch as any;
      state.embeddingCache.set('cached', new Float32Array(3));

      embeddingSearchHandler.onEvent!(node as any, noCacheConfig, ctx as any, {
        type: 'search:query',
        payload: { query: 'cached' },
      });

      expect(state.cacheHits).toBe(0);
    });
  });

  // =========================================================================
  // search:results event
  // =========================================================================

  describe('search:results event', () => {
    it('filters results by min_score and top_k', () => {
      // First trigger a query to set totalQueries
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:query',
        payload: { query: 'test' },
      });

      ctx.clearEvents();
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:results',
        payload: {
          results: [
            { id: 'a', score: 0.9, payload: {} },
            { id: 'b', score: 0.7, payload: {} },
            { id: 'c', score: 0.3, payload: {} }, // below min_score 0.6
            { id: 'd', score: 0.8, payload: {} },
          ],
          queryTimeMs: 50,
        },
      });

      const state = ctx.getState().embeddingSearch as any;
      expect(state.lastResults).toHaveLength(3); // 'c' filtered out
      expect(state.isSearching).toBe(false);
    });

    it('limits results to top_k', () => {
      const smallK: EmbeddingSearchConfig = { ...embeddingSearchHandler.defaultConfig, top_k: 2, min_score: 0 };

      embeddingSearchHandler.onEvent!(node as any, smallK, ctx as any, {
        type: 'search:query',
        payload: { query: 'x' },
      });
      embeddingSearchHandler.onEvent!(node as any, smallK, ctx as any, {
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

      const state = ctx.getState().embeddingSearch as any;
      expect(state.lastResults).toHaveLength(2);
    });

    it('emits search:complete with metrics', () => {
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:query',
        payload: { query: 'x' },
      });
      ctx.clearEvents();

      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:results',
        payload: {
          results: [{ id: 'a', score: 0.9, payload: {} }],
          queryTimeMs: 42,
        },
      });

      expect(getEventCount(ctx, 'search:complete')).toBe(1);
      const data = getLastEvent(ctx, 'search:complete') as any;
      expect(data.resultCount).toBe(1);
      expect(data.queryTimeMs).toBe(42);
    });

    it('calculates rolling average query time', () => {
      // Query 1
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:query',
        payload: { query: 'q1' },
      });
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:results',
        payload: { results: [], queryTimeMs: 100 },
      });

      // Query 2
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:query',
        payload: { query: 'q2' },
      });
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, ctx as any, {
        type: 'search:results',
        payload: { results: [], queryTimeMs: 50 },
      });

      const state = ctx.getState().embeddingSearch as any;
      expect(state.avgQueryTimeMs).toBe(75); // (100 + 50) / 2
    });
  });

  // =========================================================================
  // No state guard
  // =========================================================================

  describe('no state guard', () => {
    it('onEvent does nothing when state is not set', () => {
      const freshCtx = createStatefulMockContext();
      embeddingSearchHandler.onEvent!(node as any, embeddingSearchHandler.defaultConfig, freshCtx as any, {
        type: 'search:query',
        payload: { query: 'test' },
      });
      expect(freshCtx.emittedEvents).toHaveLength(0);
    });
  });
});
