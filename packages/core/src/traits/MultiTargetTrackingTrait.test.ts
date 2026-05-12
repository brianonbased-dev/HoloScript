/**
 * MultiTargetTrackingTrait + MultiTargetTracker tests
 *
 * Validates: trait declaration validation, compile-target outputs,
 * cosineSimilarity correctness, Hungarian optimality + threshold rejection,
 * Kalman predict/update behavior, and end-to-end multi-frame tracker
 * integration (spawn, maintain identity, occlusion, ReID recovery + the
 * G.GOLD.013 false-case for mismatched embeddings).
 *
 * Sovereign HoloScript primitive (NMoS sovereign-revival; lifts uaa2
 * MTT to HoloScript-portable form).
 */

import { describe, it, expect } from 'vitest';

import { MultiTargetTrackingTrait } from './MultiTargetTrackingTrait';
import {
  createTracker,
  stepTracker,
  hungarianAssign,
  cosineSimilarity,
  _internal,
  type Detection,
  type Vec3,
} from './MultiTargetTracker';

// =============================================================================
// FIXTURES
// =============================================================================

const REID_DIM = 32; // smaller than production 256 for compact tests
const baseConfig = {
  update_rate_hz: 90,
  hungarian_cost_threshold: 0.5,
  max_occluded_frames: 5,
  reid_embedding_dim: REID_DIM,
  reid_similarity_threshold: 0.75,
  reid_features: ['appearance', 'gait', 'face', 'skeleton', 'accessory'] as const,
  position_vs_reid_weight: 0.5,
};

// Deterministic embedding generator — different seeds yield different
// embeddings; same seed always yields same embedding.
function makeEmbedding(seed: number): number[] {
  const v = new Array(REID_DIM);
  // Simple xorshift32 seeded generator for reproducibility.
  let s = seed | 0;
  if (s === 0) s = 1;
  for (let i = 0; i < REID_DIM; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s |= 0;
    v[i] = ((s >>> 0) % 1000) / 1000 - 0.5;
  }
  return _internal.normalize(v);
}

function det(position: Vec3, seed: number): Detection {
  return { position, appearance_embedding: makeEmbedding(seed) };
}

function identityDet(feature: 'voice' | 'dm_stream' | 'intent', seed: number): Detection {
  return {
    identity_embedding: makeEmbedding(seed),
    feature,
    modality: feature === 'voice' ? 'voice' : feature === 'dm_stream' ? 'dm_stream' : 'intent',
    source_id: `${feature}-${seed}`,
  };
}

// =============================================================================
// TRAIT DECLARATION TESTS
// =============================================================================

describe('MultiTargetTrackingTrait.validate', () => {
  it('accepts an empty config (all defaults)', () => {
    expect(MultiTargetTrackingTrait.validate({})).toBe(true);
  });

  it('accepts a fully-specified config', () => {
    expect(
      MultiTargetTrackingTrait.validate({
        update_rate_hz: 60,
        hungarian_cost_threshold: 0.3,
        max_occluded_frames: 20,
        reid_embedding_dim: 128,
        reid_similarity_threshold: 0.8,
        reid_features: ['appearance', 'face'],
        position_vs_reid_weight: 0.7,
      })
    ).toBe(true);
  });

  it('accepts non-spatial ReID feature families for voice, DM streams, and intent fusion', () => {
    expect(
      MultiTargetTrackingTrait.validate({
        reid_features: ['voice', 'dm_stream', 'intent', 'multimodal'],
      })
    ).toBe(true);
  });

  it('rejects an update_rate_hz below 30Hz', () => {
    expect(() => MultiTargetTrackingTrait.validate({ update_rate_hz: 15 })).toThrow(/30Hz minimum/);
  });

  it('rejects a non-positive update_rate_hz', () => {
    expect(() => MultiTargetTrackingTrait.validate({ update_rate_hz: 0 })).toThrow(/positive number/);
  });

  it('rejects hungarian_cost_threshold outside [0, 1]', () => {
    expect(() => MultiTargetTrackingTrait.validate({ hungarian_cost_threshold: 1.5 })).toThrow(/in \[0, 1\]/);
    expect(() => MultiTargetTrackingTrait.validate({ hungarian_cost_threshold: -0.1 })).toThrow(/in \[0, 1\]/);
  });

  it('rejects an unknown reid_feature', () => {
    expect(() =>
      MultiTargetTrackingTrait.validate({ reid_features: ['appearance', 'thermal' as never] })
    ).toThrow(/unknown feature 'thermal'/);
  });

  it('rejects reid_embedding_dim below 8', () => {
    expect(() => MultiTargetTrackingTrait.validate({ reid_embedding_dim: 4 })).toThrow(/>= 8/);
  });

  it('rejects reid_similarity_threshold outside [-1, 1]', () => {
    expect(() => MultiTargetTrackingTrait.validate({ reid_similarity_threshold: 2 })).toThrow(/in \[-1, 1\]/);
  });

  it('rejects negative max_occluded_frames', () => {
    expect(() => MultiTargetTrackingTrait.validate({ max_occluded_frames: -1 })).toThrow(/non-negative integer/);
  });

  it('rejects position_vs_reid_weight outside [0, 1]', () => {
    expect(() => MultiTargetTrackingTrait.validate({ position_vs_reid_weight: 1.1 })).toThrow(/in \[0, 1\]/);
  });
});

describe('MultiTargetTrackingTrait.compile', () => {
  it('emits web scaffolding referencing the tracker runtime', () => {
    const out = MultiTargetTrackingTrait.compile({}, 'web');
    expect(out).toContain('createTracker');
    expect(out).toContain('stepTracker');
    expect(out).toContain('appearance_embedding');
    expect(out).toContain('identity_embedding');
  });

  it('emits glasses scaffolding (Brilliant Labs / OpenXR target)', () => {
    const out = MultiTargetTrackingTrait.compile({}, 'glasses');
    expect(out).toContain('newGlassesTracker');
    expect(out).toContain('on-device SLAM');
  });

  it('emits node scaffolding without DOM references', () => {
    const out = MultiTargetTrackingTrait.compile({}, 'node');
    expect(out).toContain('multiTargetTrackingConfig');
    expect(out).not.toContain('navigator');
  });

  it('emits generic scaffolding for unknown targets', () => {
    const out = MultiTargetTrackingTrait.compile({}, 'cobol');
    expect(out).toContain('multiTargetTrackingConfig');
  });
});

// =============================================================================
// COSINE SIMILARITY TESTS
// =============================================================================

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical unit vectors', () => {
    const v = _internal.normalize([1, 2, 3, 4]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
  });

  it('returns -1 for anti-parallel vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 6);
  });

  it('returns 0 for zero-norm input (graceful)', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0);
  });

  it('returns 0 for mismatched-length vectors (graceful)', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});

// =============================================================================
// HUNGARIAN TESTS
// =============================================================================

describe('hungarianAssign', () => {
  it('returns empty for empty cost matrix', () => {
    expect(hungarianAssign([], 1)).toEqual([]);
  });

  it('handles 1x1 trivial assignment', () => {
    expect(hungarianAssign([[0.2]], 1)).toEqual([0]);
  });

  it('finds the optimal assignment where greedy would fail', () => {
    // Costs designed so greedy picks (0→0) first (cost 1) leaving (1→1)
    // forced to cost 10, total 11. Optimal is (0→1, 1→0) total 4 + 2 = 6.
    const cost = [
      [1, 4],
      [2, 10],
    ];
    const assignment = hungarianAssign(cost, 100);
    expect(assignment).toEqual([1, 0]);
  });

  it('rejects matches above the threshold', () => {
    const cost = [
      [0.1, 0.9],
      [0.9, 0.1],
    ];
    const assignment = hungarianAssign(cost, 0.5);
    expect(assignment).toEqual([0, 1]);
  });

  it('rejects ALL matches when every cost exceeds threshold', () => {
    const cost = [
      [0.9, 0.9],
      [0.9, 0.9],
    ];
    const assignment = hungarianAssign(cost, 0.5);
    expect(assignment.every((j) => j === -1)).toBe(true);
  });

  it('handles rectangular matrices (more detections than tracks)', () => {
    const cost = [
      [0.1, 0.4, 0.9],
      [0.9, 0.1, 0.5],
    ];
    const assignment = hungarianAssign(cost, 1);
    expect(assignment[0]).toBe(0);
    expect(assignment[1]).toBe(1);
  });

  it('handles rectangular matrices (more tracks than detections)', () => {
    const cost = [
      [0.1, 0.9],
      [0.5, 0.1],
      [0.9, 0.9],
    ];
    const assignment = hungarianAssign(cost, 1);
    expect(assignment.filter((j) => j !== -1).length).toBe(2);
  });
});

// =============================================================================
// KALMAN TESTS
// =============================================================================

describe('Kalman predict/update', () => {
  it('predict advances position by velocity * dt (Kalman smoothes; verify motion is being tracked, not converged-to-zero)', () => {
    const config = resolveConfig(baseConfig);
    const tracker = createTracker(config);
    let s = stepTracker(tracker, [det([0, 0, 0], 1)], 0, 0.01);
    expect(s.state.tracks.length).toBe(1);

    // Target moves +0.1m per frame at dt=0.01s (effective 10 m/s). The
    // Kalman filter smoothes measurement noise vs motion model so the
    // estimate lags the truth — that's the filter's job. We only assert
    // (a) position moved in +x and (b) velocity is in the right direction
    // and magnitude ballpark, not exact convergence.
    for (let f = 1; f <= 10; f++) {
      s = stepTracker(s.state, [det([f * 0.1, 0, 0], 1)], f, 0.01);
    }
    const trackState = s.state.tracks[0].state;
    expect(trackState[0]).toBeGreaterThan(0.5); // pulled in +x direction
    expect(trackState[0]).toBeLessThan(1.1); // doesn't overshoot
    expect(trackState[3]).toBeGreaterThan(0); // velocity in +x direction
  });

  it('update reduces position covariance after a measurement', () => {
    const config = resolveConfig(baseConfig);
    const tracker = createTracker(config);
    const r1 = stepTracker(tracker, [det([0, 0, 0], 1)], 0, 0.01);
    const initialPosVar = r1.state.tracks[0].covariance[0]; // P[0][0]
    const r2 = stepTracker(r1.state, [det([0, 0, 0], 1)], 1, 0.01);
    const updatedPosVar = r2.state.tracks[0].covariance[0];
    expect(updatedPosVar).toBeLessThan(initialPosVar);
  });
});

// =============================================================================
// TRACKER INTEGRATION TESTS
// =============================================================================

describe('Tracker integration', () => {
  it('spawns a new track for a previously-unseen detection', () => {
    const config = resolveConfig(baseConfig);
    const tracker = createTracker(config);
    const result = stepTracker(tracker, [det([1, 2, 3], 42)], 0);
    expect(result.spawned.length).toBe(1);
    expect(result.state.tracks.length).toBe(1);
    expect(result.state.tracks[0].state.slice(0, 3)).toEqual([1, 2, 3]);
    expect(result.state.tracks[0].status).toBe('tentative');
  });

  it('maintains identity across consecutive frames (2 targets in parallel motion)', () => {
    const config = resolveConfig(baseConfig);
    let s = createTracker(config);

    // Two targets walking in opposite directions; distinct embeddings.
    let r = stepTracker(s, [det([0, 0, 0], 100), det([5, 0, 0], 200)], 0);
    expect(r.spawned.length).toBe(2);
    const idA = r.state.tracks.find((t) => t.state[0] === 0)!.id;
    const idB = r.state.tracks.find((t) => t.state[0] === 5)!.id;
    s = r.state;

    // 10 frames of motion; A moves +x, B moves -x.
    for (let f = 1; f <= 10; f++) {
      const detA = det([f * 0.05, 0, 0], 100);
      const detB = det([5 - f * 0.05, 0, 0], 200);
      r = stepTracker(s, [detA, detB], f);
      s = r.state;
    }

    // Final positions should still map to original IDs. Verify identity
    // preservation + direction-of-motion (not exact convergence — Kalman
    // smoother lags by design).
    const trackA = s.tracks.find((t) => t.id === idA)!;
    const trackB = s.tracks.find((t) => t.id === idB)!;
    expect(trackA.state[0]).toBeGreaterThan(0.2); // A pulled toward +x
    expect(trackA.state[0]).toBeLessThan(0.6); // doesn't overshoot
    expect(trackB.state[0]).toBeGreaterThan(4.4); // B pulled toward -x from 5
    expect(trackB.state[0]).toBeLessThan(4.8);
    expect(trackA.status).toBe('confirmed'); // promoted after 3+ frames
    expect(trackB.status).toBe('confirmed');
  });

  it('marks a track as occluded when its detection drops out', () => {
    const config = resolveConfig({ ...baseConfig, max_occluded_frames: 3 });
    let s = createTracker(config);

    // Spawn one track + observe 3 frames to confirm.
    for (let f = 0; f <= 3; f++) {
      s = stepTracker(s, [det([0, 0, 0], 50)], f).state;
    }
    expect(s.tracks[0].status).toBe('confirmed');

    // Drop the detection for 2 frames (within tolerance).
    const r1 = stepTracker(s, [], 4);
    const r2 = stepTracker(r1.state, [], 5);
    expect(r2.state.tracks[0].occluded_frames).toBe(2);
    expect(r2.state.tracks[0].status).toBe('confirmed'); // not yet lost

    // One more frame puts us over the limit → lost.
    const r3 = stepTracker(r2.state, [], 6);
    expect(r3.state.tracks[0].status).toBe('lost');
    expect(r3.lost).toContain(r3.state.tracks[0].id);
  });

  it('re-identifies a lost track via ReID when same embedding reappears', () => {
    const config = resolveConfig({ ...baseConfig, max_occluded_frames: 3 });
    let s = createTracker(config);

    // Frame 0: spawn track for target 50.
    const r0 = stepTracker(s, [det([0, 0, 0], 50)], 0);
    const originalId = r0.state.tracks[0].id;
    s = r0.state;

    // Frames 1-3: confirm.
    for (let f = 1; f <= 3; f++) {
      s = stepTracker(s, [det([f * 0.01, 0, 0], 50)], f).state;
    }

    // Frames 4-7: occluded (no detections) → goes lost at frame 7.
    for (let f = 4; f <= 7; f++) {
      s = stepTracker(s, [], f).state;
    }
    expect(s.tracks[0].status).toBe('lost');

    // Frame 8: target 50 reappears far away. ReID should recover it.
    const r = stepTracker(s, [det([3, 0, 0], 50)], 8);
    expect(r.reidentified.length).toBe(1);
    expect(r.reidentified[0].track_id).toBe(originalId);
    expect(r.reidentified[0].similarity).toBeGreaterThanOrEqual(config.reid_similarity_threshold);
    expect(r.spawned.length).toBe(0);
  });

  it('G.GOLD.013 false case: DOES NOT re-identify with a mismatched embedding', () => {
    const config = resolveConfig({ ...baseConfig, max_occluded_frames: 3 });
    let s = createTracker(config);

    // Frame 0: spawn track A with embedding seed=111.
    const r0 = stepTracker(s, [det([0, 0, 0], 111)], 0);
    const trackAId = r0.state.tracks[0].id;
    s = r0.state;

    // Frames 1-3: confirm.
    for (let f = 1; f <= 3; f++) {
      s = stepTracker(s, [det([f * 0.01, 0, 0], 111)], f).state;
    }

    // Frames 4-7: occluded → lost.
    for (let f = 4; f <= 7; f++) {
      s = stepTracker(s, [], f).state;
    }
    expect(s.tracks[0].status).toBe('lost');

    // Frame 8: someone NEW appears (embedding seed=999, very different).
    // ReID must NOT recover trackA; the new detection should spawn a fresh track.
    const r = stepTracker(s, [det([0, 0, 0], 999)], 8);
    expect(r.reidentified.length).toBe(0);
    expect(r.spawned.length).toBe(1);
    expect(r.spawned[0]).not.toBe(trackAId);
  });

  it('tracks non-spatial voice utterances by embedding alone', () => {
    const config = resolveConfig(baseConfig);
    let s = createTracker(config);

    let r = stepTracker(s, [identityDet('voice', 707)], 0);
    const voiceTrackId = r.state.tracks[0].id;
    expect(r.spawned).toEqual([voiceTrackId]);
    expect(r.state.tracks[0].has_position).toBe(false);
    expect(r.state.tracks[0].modality).toBe('voice');
    s = r.state;

    for (let f = 1; f <= 4; f++) {
      r = stepTracker(s, [identityDet('voice', 707)], f);
      s = r.state;
    }

    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0].id).toBe(voiceTrackId);
    expect(s.tracks[0].status).toBe('confirmed');
    expect(s.tracks[0].has_position).toBe(false);
  });

  it('does not merge unrelated non-spatial DM streams', () => {
    const config = resolveConfig(baseConfig);
    const s0 = createTracker(config);
    const r0 = stepTracker(s0, [identityDet('dm_stream', 11)], 0);
    const firstTrackId = r0.state.tracks[0].id;

    const r1 = stepTracker(r0.state, [identityDet('dm_stream', 999)], 1);

    expect(r1.associations).toHaveLength(0);
    expect(r1.spawned).toHaveLength(1);
    expect(r1.spawned[0]).not.toBe(firstTrackId);
  });

  it('rejects detections with wrong embedding length (validation gate)', () => {
    const config = resolveConfig(baseConfig);
    const s = createTracker(config);
    const badDet: Detection = { position: [0, 0, 0], appearance_embedding: [1, 2, 3] }; // length 3, not 32
    expect(() => stepTracker(s, [badDet], 0)).toThrow(/appearance_embedding must have length=32/);
  });

  it('rejects detections with non-finite position components', () => {
    const config = resolveConfig(baseConfig);
    const s = createTracker(config);
    const badDet: Detection = {
      position: [NaN, 0, 0],
      appearance_embedding: makeEmbedding(1),
    };
    expect(() => stepTracker(s, [badDet], 0)).toThrow(/non-finite component/);
  });
});

// =============================================================================
// HELPER
// =============================================================================

function resolveConfig(c: typeof baseConfig): Required<import('./MultiTargetTrackingTrait').MultiTargetTrackingConfig> {
  return {
    update_rate_hz: c.update_rate_hz,
    hungarian_cost_threshold: c.hungarian_cost_threshold,
    max_occluded_frames: c.max_occluded_frames,
    reid_embedding_dim: c.reid_embedding_dim,
    reid_similarity_threshold: c.reid_similarity_threshold,
    reid_features: [...c.reid_features],
    position_vs_reid_weight: c.position_vs_reid_weight,
  };
}
