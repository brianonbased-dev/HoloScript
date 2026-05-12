import { describe, it, expect, beforeEach } from 'vitest';
import { reidEmbeddingHandler } from '../ReidEmbeddingTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

function makeVec(dim: number, seed: number): number[] {
  const v = new Array<number>(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.sin(seed + i * 0.01);
  return v;
}

describe('ReidEmbeddingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('reid-1');
    ctx = createMockContext();
    attachTrait(reidEmbeddingHandler, node, { embedding_dimension: 8 }, ctx);
  });

  it('matches when similarity is above threshold', () => {
    const v = makeVec(8, 0.5);
    sendEvent(reidEmbeddingHandler, node, { embedding_dimension: 8 }, ctx, {
      type: 'reid_enroll',
      embedding: { track_id: 'A', vector: v, feature: 'appearance', captured_at: Date.now() },
    });
    sendEvent(reidEmbeddingHandler, node, { embedding_dimension: 8 }, ctx, {
      type: 'reid_match_request',
      embedding: { track_id: 'B', vector: v, feature: 'appearance', captured_at: Date.now() },
    });
    expect(getEventCount(ctx, 'reid_matched')).toBe(1);
    const m = getLastEvent(ctx, 'reid_matched') as { gallery_track_id: string };
    expect(m.gallery_track_id).toBe('A');
  });

  it('matches non-spatial voice embeddings when the feature family agrees', () => {
    const v = makeVec(8, 1.5);
    sendEvent(reidEmbeddingHandler, node, { embedding_dimension: 8 }, ctx, {
      type: 'reid_enroll',
      embedding: { track_id: 'speaker-A', vector: v, feature: 'voice', captured_at: Date.now() },
    });
    sendEvent(reidEmbeddingHandler, node, { embedding_dimension: 8 }, ctx, {
      type: 'reid_match_request',
      embedding: { track_id: 'utterance-9', vector: v, feature: 'voice', captured_at: Date.now() },
    });
    const m = getLastEvent(ctx, 'reid_matched') as { gallery_track_id: string; feature: string };
    expect(m.gallery_track_id).toBe('speaker-A');
    expect(m.feature).toBe('voice');
  });

  it('emits reid_no_match when similarity is below threshold (false-case)', () => {
    const dim = 8;
    const orthogonalA = [1, 0, 0, 0, 0, 0, 0, 0];
    const orthogonalB = [0, 1, 0, 0, 0, 0, 0, 0];
    sendEvent(reidEmbeddingHandler, node, { embedding_dimension: dim }, ctx, {
      type: 'reid_enroll',
      embedding: { track_id: 'A', vector: orthogonalA, feature: 'appearance', captured_at: Date.now() },
    });
    sendEvent(reidEmbeddingHandler, node, { embedding_dimension: dim }, ctx, {
      type: 'reid_match_request',
      embedding: { track_id: 'B', vector: orthogonalB, feature: 'appearance', captured_at: Date.now() },
    });
    expect(getEventCount(ctx, 'reid_matched')).toBe(0);
    expect(getEventCount(ctx, 'reid_no_match')).toBe(1);
    const r = getLastEvent(ctx, 'reid_no_match') as { best_similarity: number; threshold: number };
    expect(r.best_similarity).toBeLessThan(r.threshold);
  });

  it('rejects dimension mismatch (false-case input validation)', () => {
    sendEvent(reidEmbeddingHandler, node, { embedding_dimension: 8 }, ctx, {
      type: 'reid_enroll',
      embedding: { track_id: 'X', vector: [1, 2, 3], feature: 'appearance', captured_at: Date.now() },
    });
    expect(getEventCount(ctx, 'reid_rejected')).toBe(1);
    expect(getEventCount(ctx, 'reid_enrolled')).toBe(0);
  });
});
