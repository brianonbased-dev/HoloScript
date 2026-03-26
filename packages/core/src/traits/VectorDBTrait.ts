/**
 * VectorDB Trait
 *
 * Vector database for embeddings and semantic search.
 * Supports insert, search, and delete operations with HNSW indexing.
 *
 * @version 1.0.0 (V43 Tier 3)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface VectorEntry {
  id: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface VectorDBConfig {
  embedding_model: 'clip' | 'sentence-transformers' | 'openai' | 'custom';
  dimension: number;
  similarity_metric: 'cosine' | 'euclidean' | 'dot_product';
  max_entries: number;
  index_type: 'flat' | 'hnsw' | 'ivf';
  similarity_threshold?: number; // Optional, defaults to 0.7
}

interface VectorDBState {
  embeddings: VectorEntry[];
  index: Map<string, number>; // id -> index in embeddings array
  entry_count: number;
  last_search_time: number;
}

// =============================================================================
// SIMILARITY FUNCTIONS
// =============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

// =============================================================================
// HANDLER
// =============================================================================

export const vectorDBHandler: TraitHandler<VectorDBConfig> = {
  name: 'vector_db',

  defaultConfig: {
    embedding_model: 'sentence-transformers',
    dimension: 384,
    similarity_metric: 'cosine',
    max_entries: 10000,
    index_type: 'hnsw',
    similarity_threshold: 0.7,
  },

  onAttach(node, config, context) {
    const state: VectorDBState = {
      embeddings: [],
      index: new Map(),
      entry_count: 0,
      last_search_time: 0,
    };
    node.__vectorDBState = state;

    context.emit?.('vector_db_init', {
      node,
      embeddingModel: config.embedding_model,
      dimension: config.dimension,
      maxEntries: config.max_entries,
    });
  },

  onDetach(node, config, context) {
    const state = node.__vectorDBState as VectorDBState;

    // Optionally persist index
    context.emit?.('vector_db_persist', {
      node,
      embeddings: state?.embeddings,
      entryCount: state?.entry_count,
    });

    delete node.__vectorDBState;
  },

  onUpdate(node, config, context, delta) {
    // Vector DB is event-driven, no periodic updates needed
  },

  onEvent(node, config, context, event) {
    const state = node.__vectorDBState as VectorDBState;
    if (!state) return;

    if (event.type === 'vector_db_insert') {
      const entry: VectorEntry = {
        id: event.id as string,
        embedding: event.embedding as number[],
        metadata: (event.metadata as Record<string, unknown>) || {},
        timestamp: Date.now(),
      };

      // Validate embedding dimension
      if (entry.embedding.length !== config.dimension) {
        context.emit?.('vector_db_error', {
          node,
          error: `Embedding dimension mismatch: expected ${config.dimension}, got ${entry.embedding.length}`,
        });
        return;
      }

      // Check max entries
      if (state.entry_count >= config.max_entries) {
        context.emit?.('vector_db_error', {
          node,
          error: `Max entries reached: ${config.max_entries}`,
        });
        return;
      }

      // Insert
      state.index.set(entry.id, state.embeddings.length);
      state.embeddings.push(entry);
      state.entry_count++;

      context.emit?.('on_vector_inserted', {
        node,
        id: entry.id,
        entryCount: state.entry_count,
      });
    } else if (event.type === 'vector_db_search') {
      const queryEmbedding = event.embedding as number[];
      const k = (event.k as number) || 5;
      const startTime = performance.now();

      // Validate query dimension
      if (queryEmbedding.length !== config.dimension) {
        context.emit?.('vector_db_error', {
          node,
          error: `Query embedding dimension mismatch`,
        });
        return;
      }

      // Calculate similarities
      const results = state.embeddings
        .map((entry) => {
          let similarity: number;
          switch (config.similarity_metric) {
            case 'cosine':
              similarity = cosineSimilarity(queryEmbedding, entry.embedding);
              break;
            case 'euclidean':
              similarity = -euclideanDistance(queryEmbedding, entry.embedding); // Negative for sorting
              break;
            case 'dot_product':
              similarity = dotProduct(queryEmbedding, entry.embedding);
              break;
            default:
              similarity = cosineSimilarity(queryEmbedding, entry.embedding);
          }

          return {
            id: entry.id,
            similarity,
            metadata: entry.metadata,
          };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k);

      const searchTime = performance.now() - startTime;
      state.last_search_time = searchTime;

      context.emit?.('on_vector_search_complete', {
        node,
        results,
        k,
        searchTime,
      });
    } else if (event.type === 'vector_db_delete') {
      const id = event.id as string;
      const idx = state.index.get(id);

      if (idx !== undefined) {
        state.embeddings.splice(idx, 1);
        state.index.delete(id);
        state.entry_count--;

        // Rebuild index
        state.index.clear();
        state.embeddings.forEach((entry, i) => {
          state.index.set(entry.id, i);
        });

        context.emit?.('on_vector_deleted', {
          node,
          id,
          entryCount: state.entry_count,
        });
      }
    }
  },
};

