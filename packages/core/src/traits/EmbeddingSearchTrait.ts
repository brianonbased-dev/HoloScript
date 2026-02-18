/**
 * Embedding Search Trait (V43 Tier 3)
 *
 * Semantic similarity search over embedded vectors within a VR/AR scene.
 * Works as the query layer on top of VectorDBTrait, providing natural-language
 * search for objects, NPCs, and world content.
 *
 * @version 1.0.0 (V43 Tier 3)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type EmbeddingModel = 'all-minilm-l6-v2' | 'bge-small' | 'e5-small' | 'clip-vit-b32';
export type SimilarityMetric = 'cosine' | 'dot_product' | 'euclidean';

export interface EmbeddingSearchConfig {
  embedding_model: EmbeddingModel;
  similarity_metric: SimilarityMetric;
  top_k: number;
  min_score: number;       // minimum similarity score 0–1
  cache_embeddings: boolean;
  max_cache_size: number;
  cross_modal: boolean;    // allow text→image or image→text search (requires CLIP)
}

interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

interface EmbeddingSearchState {
  totalQueries: number;
  cacheHits: number;
  embeddingCache: Map<string, Float32Array>;
  lastResults: SearchResult[];
  isSearching: boolean;
  avgQueryTimeMs: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const embeddingSearchHandler: TraitHandler<EmbeddingSearchConfig> = {
  name: 'embedding_search' as any,

  defaultConfig: {
    embedding_model: 'all-minilm-l6-v2',
    similarity_metric: 'cosine',
    top_k: 5,
    min_score: 0.6,
    cache_embeddings: true,
    max_cache_size: 1000,
    cross_modal: false,
  },

  onAttach(node, config, context) {
    const state: EmbeddingSearchState = {
      totalQueries: 0,
      cacheHits: 0,
      embeddingCache: new Map(),
      lastResults: [],
      isSearching: false,
      avgQueryTimeMs: 0,
    };
    context.setState({ embeddingSearch: state });
    context.emit('search:ready', {
      model: config.embedding_model,
      metric: config.similarity_metric,
    });
  },

  onDetach(node, config, context) {
    const state = context.getState().embeddingSearch as EmbeddingSearchState | undefined;
    if (state) {
      state.embeddingCache.clear();
    }
  },

  onEvent(node, config, context, event) {
    const state = context.getState().embeddingSearch as EmbeddingSearchState | undefined;
    if (!state) return;

    if (event.type === 'search:query') {
      const payload = event.payload as any;
      const query: string = payload?.query ?? '';

      if (config.cache_embeddings && state.embeddingCache.has(query)) {
        state.cacheHits += 1;
        context.emit('search:cache_hit', { query });
      }

      state.totalQueries += 1;
      state.isSearching = true;
      context.emit('search:started', { query, model: config.embedding_model });
    } else if (event.type === 'search:results') {
      const payload = event.payload as any;
      state.isSearching = false;
      state.lastResults = (payload?.results ?? []).filter(
        (r: SearchResult) => r.score >= config.min_score
      ).slice(0, config.top_k);

      const queryTimeMs: number = payload?.queryTimeMs ?? 0;
      state.avgQueryTimeMs = state.totalQueries > 1
        ? (state.avgQueryTimeMs * (state.totalQueries - 1) + queryTimeMs) / state.totalQueries
        : queryTimeMs;

      context.emit('search:complete', {
        resultCount: state.lastResults.length,
        queryTimeMs,
        cacheHitRate: state.cacheHits / state.totalQueries,
      });
    }
  },
};
