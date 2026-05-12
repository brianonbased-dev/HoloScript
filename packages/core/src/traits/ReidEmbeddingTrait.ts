/**
 * ReID Embedding Trait
 *
 * Person/object/stream re-identification via cosine similarity on identity
 * embeddings. Maintains a gallery of recently-lost tracks and matches new
 * detections or non-spatial observations against them when similarity exceeds
 * the configured threshold.
 *
 * Embedding dimension is configurable (uaa2 glasses lab uses 256). Features
 * are tagged (appearance / gait / skeleton / accessory / voice / DM / intent)
 * so callers can report which feature drove the match.
 *
 * Lifted from uaa2-service mtt-algorithm-panel.hsplus.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type ReidFeature =
  | 'appearance'
  | 'gait'
  | 'face'
  | 'skeleton'
  | 'accessory'
  | 'voice'
  | 'voiceprint'
  | 'utterance'
  | 'dm_stream'
  | 'intent'
  | 'multimodal'
  | 'custom';

export interface ReidEmbedding {
  track_id: string;
  vector: number[];
  feature: ReidFeature;
  captured_at: number;
}

export interface ReidMatch {
  query_track_id: string;
  gallery_track_id: string;
  similarity: number;
  feature: ReidFeature;
  matched_at: number;
}

export interface ReidEmbeddingConfig {
  similarity_threshold: number;
  embedding_dimension: number;
  gallery_size: number;
  gallery_ttl_ms: number;
  enabled_features: ReidFeature[];
}

interface ReidInternalState {
  gallery: ReidEmbedding[];
  totalMatches: number;
  pendingMatches: number;
  lastSampleEmbedding: number[] | null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// =============================================================================
// HANDLER
// =============================================================================

export const reidEmbeddingHandler: TraitHandler<ReidEmbeddingConfig> = {
  name: 'reid_embedding',

  defaultConfig: {
    similarity_threshold: 0.75,
    embedding_dimension: 256,
    gallery_size: 64,
    gallery_ttl_ms: 60_000,
    enabled_features: [
      'appearance',
      'gait',
      'face',
      'skeleton',
      'accessory',
      'voice',
      'voiceprint',
      'utterance',
      'dm_stream',
      'intent',
      'multimodal',
    ],
  },

  onAttach(node, _config, _context) {
    const internal: ReidInternalState = {
      gallery: [],
      totalMatches: 0,
      pendingMatches: 0,
      lastSampleEmbedding: null,
    };
    node.__reidState = internal;
  },

  onDetach(node, _config, _context) {
    delete node.__reidState;
  },

  onUpdate(node, config, _context, _delta) {
    const internal = node.__reidState as ReidInternalState | undefined;
    if (!internal) return;

    const now = Date.now();
    const beforePrune = internal.gallery.length;
    internal.gallery = internal.gallery.filter((e) => now - e.captured_at <= config.gallery_ttl_ms);
    if (internal.gallery.length !== beforePrune) {
      // Pruned silently — no event emit needed on every tick.
    }
  },

  onEvent(node, config, context, event) {
    const internal = node.__reidState as ReidInternalState | undefined;
    if (!internal) return;

    if (event.type === 'reid_enroll') {
      const embedding = event.embedding as ReidEmbedding;
      if (!embedding || !embedding.vector) return;
      if (embedding.vector.length !== config.embedding_dimension) {
        context.emit?.('reid_rejected', {
          node,
          reason: 'dimension_mismatch',
          expected: config.embedding_dimension,
          got: embedding.vector.length,
        });
        return;
      }
      if (!config.enabled_features.includes(embedding.feature)) return;

      internal.gallery.push(embedding);
      if (internal.gallery.length > config.gallery_size) {
        internal.gallery.shift();
      }
      internal.lastSampleEmbedding = embedding.vector;
      context.emit?.('reid_enrolled', {
        node,
        track_id: embedding.track_id,
        feature: embedding.feature,
        gallery_size: internal.gallery.length,
      });
      return;
    }

    if (event.type === 'reid_match_request') {
      const query = event.embedding as ReidEmbedding;
      if (!query || !query.vector) return;
      if (query.vector.length !== config.embedding_dimension) {
        context.emit?.('reid_rejected', {
          node,
          reason: 'dimension_mismatch',
          expected: config.embedding_dimension,
          got: query.vector.length,
        });
        return;
      }

      internal.pendingMatches++;

      let best: { embedding: ReidEmbedding; similarity: number } | null = null;
      for (const candidate of internal.gallery) {
        if (candidate.feature !== query.feature) continue;
        const sim = cosineSimilarity(query.vector, candidate.vector);
        if (!best || sim > best.similarity) {
          best = { embedding: candidate, similarity: sim };
        }
      }

      internal.pendingMatches = Math.max(0, internal.pendingMatches - 1);

      if (best && best.similarity >= config.similarity_threshold) {
        internal.totalMatches++;
        const match: ReidMatch = {
          query_track_id: query.track_id,
          gallery_track_id: best.embedding.track_id,
          similarity: best.similarity,
          feature: query.feature,
          matched_at: Date.now(),
        };
        context.emit?.('reid_matched', { node, ...match });
      } else {
        context.emit?.('reid_no_match', {
          node,
          query_track_id: query.track_id,
          best_similarity: best?.similarity ?? 0,
          threshold: config.similarity_threshold,
        });
      }
      return;
    }

    if (event.type === 'reid_clear') {
      const count = internal.gallery.length;
      internal.gallery = [];
      context.emit?.('reid_cleared', { node, removed: count });
      return;
    }

    if (event.type === 'reid_query') {
      context.emit?.('reid_status', {
        queryId: event.queryId,
        node,
        enabled: config.enabled_features.length > 0,
        gallery_size: internal.gallery.length,
        total_matches: internal.totalMatches,
        pending_matches: internal.pendingMatches,
        sample_embedding: internal.lastSampleEmbedding,
      });
      return;
    }
  },
};

export default reidEmbeddingHandler;
