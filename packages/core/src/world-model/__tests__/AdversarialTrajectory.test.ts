/**
 * Schema contract tests for AdversarialTrajectory.
 *
 * G.GOLD.013 / F.043: paired FALSE+TRUE tests for every computed
 * predicate. A schema-only file still has one live predicate —
 * `isCurriculumEligible` — and both branches are tested.
 */

import { describe, it, expect } from 'vitest';
import {
  isCurriculumEligible,
  asTrajectoryId,
  asSceneHash,
  asCaelReceiptHash,
  type AdversarialTrajectory,
  type SemanticPredicateScore,
  type CurriculumPriority,
} from '../AdversarialTrajectory';

function buildTrajectory(
  overrides: Partial<AdversarialTrajectory> = {}
): AdversarialTrajectory {
  const score: SemanticPredicateScore = {
    violation: 0.5,
    novelty: 0.5,
    learnability: 0.5,
    regression: 0,
    invalidity: 0,
  };
  const priority: CurriculumPriority = {
    priority: 0.5,
    tieBreaker: 0,
    rationale: 'test fixture',
  };
  return {
    id: asTrajectoryId('traj-test-001'),
    sceneHash: asSceneHash('scene-test-001'),
    seed: 42,
    trustTier: 'replayable',
    caelReceiptHash: asCaelReceiptHash('cael-test-001'),
    actionTrace: [],
    observationTrace: [],
    predicateScore: score,
    priority,
    replayHandle: {
      trajectoryId: asTrajectoryId('traj-test-001'),
      sceneHash: asSceneHash('scene-test-001'),
      seed: 42,
    },
    status: 'open',
    discoveredAtMs: 1_700_000_000_000,
    lastReplayedAtMs: null,
    ...overrides,
  };
}

describe('isCurriculumEligible', () => {
  it('TRUE case: open status + priority > 0 + status !== invalid → eligible', () => {
    const t = buildTrajectory({ status: 'open' });
    expect(isCurriculumEligible(t)).toBe(true);
  });

  it('FALSE case: invalid status → not eligible (even with high priority)', () => {
    // G.GOLD.013: explicit false-case assertion. An "invalid" trajectory
    // must NEVER be replayed, regardless of priority score. This protects
    // the curriculum from prediction-error junk per G.PROWL.AUTO.001.
    const t = buildTrajectory({
      status: 'invalid',
      priority: { priority: 0.99, tieBreaker: 0, rationale: 'high but invalid' },
    });
    expect(isCurriculumEligible(t)).toBe(false);
  });

  it('FALSE case: priority = 0 → not eligible (regardless of status)', () => {
    const t = buildTrajectory({
      status: 'open',
      priority: { priority: 0, tieBreaker: 0, rationale: 'zeroed' },
    });
    expect(isCurriculumEligible(t)).toBe(false);
  });

  it('TRUE case: solved trajectories with priority remain eligible (for regression detection)', () => {
    // A solved trajectory can re-enter the curriculum if a regression
    // signal lifts its priority back above 0. The eligibility predicate
    // intentionally allows this — the curriculum policy filters status.
    const t = buildTrajectory({
      status: 'solved',
      priority: { priority: 0.7, tieBreaker: 0, rationale: 'regression risk' },
    });
    expect(isCurriculumEligible(t)).toBe(true);
  });
});

describe('schema brand helpers', () => {
  it('asTrajectoryId returns the input string (brand is structural-only)', () => {
    expect(asTrajectoryId('abc')).toBe('abc');
  });

  it('asSceneHash returns the input string', () => {
    expect(asSceneHash('scene-xyz')).toBe('scene-xyz');
  });

  it('asCaelReceiptHash returns the input string', () => {
    expect(asCaelReceiptHash('cael-123')).toBe('cael-123');
  });
});
