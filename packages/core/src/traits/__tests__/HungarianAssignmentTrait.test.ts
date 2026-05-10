import { describe, it, expect, beforeEach } from 'vitest';
import { hungarianAssignmentHandler } from '../HungarianAssignmentTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
} from './traitTestHelpers';

describe('HungarianAssignmentTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('hg-1');
    ctx = createMockContext();
    attachTrait(hungarianAssignmentHandler, node, {}, ctx);
  });

  it('finds optimal 3x3 assignment', () => {
    sendEvent(hungarianAssignmentHandler, node, {}, ctx, {
      type: 'hungarian_solve',
      cost_matrix: [
        [0.1, 0.4, 0.3],
        [0.4, 0.1, 0.4],
        [0.3, 0.4, 0.1],
      ],
    });
    const r = getLastEvent(ctx, 'hungarian_solved') as { matched_pairs: Array<{ track: number; detection: number }> };
    expect(r.matched_pairs).toHaveLength(3);
    expect(r.matched_pairs.map((p) => `${p.track}:${p.detection}`).sort()).toEqual(['0:0', '1:1', '2:2']);
  });

  it('rejects all matches when every cost exceeds threshold (false-case)', () => {
    sendEvent(hungarianAssignmentHandler, node, { association_threshold: 0.2 }, ctx, {
      type: 'hungarian_solve',
      cost_matrix: [
        [0.9, 0.8],
        [0.7, 0.95],
      ],
    });
    const r = getLastEvent(ctx, 'hungarian_solved') as {
      matched_pairs: unknown[];
      unmatched_tracks: number[];
      new_detections: number[];
    };
    expect(r.matched_pairs).toHaveLength(0);
    expect(r.unmatched_tracks.sort()).toEqual([0, 1]);
    expect(r.new_detections.sort()).toEqual([0, 1]);
  });

  it('handles rectangular 2x3 matrix (more detections than tracks)', () => {
    sendEvent(hungarianAssignmentHandler, node, {}, ctx, {
      type: 'hungarian_solve',
      cost_matrix: [
        [0.1, 0.5, 0.5],
        [0.5, 0.1, 0.5],
      ],
    });
    const r = getLastEvent(ctx, 'hungarian_solved') as {
      matched_pairs: Array<{ track: number; detection: number }>;
      new_detections: number[];
    };
    expect(r.matched_pairs).toHaveLength(2);
    expect(r.new_detections).toEqual([2]);
  });
});
