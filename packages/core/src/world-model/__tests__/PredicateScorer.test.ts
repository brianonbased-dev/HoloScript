/**
 * Tests for PredicateScorer — paired FALSE+TRUE per G.GOLD.013/F.043.
 */

import { describe, it, expect } from 'vitest';
import { scoreTrajectory, type SoftAnchor } from '../PredicateScorer';
import {
  asTrajectoryId,
  asSceneHash,
  asCaelReceiptHash,
  type AdversarialTrajectory,
  type ActionStep,
  type SimulationContractReference,
  type ValidityAnchor,
} from '../AdversarialTrajectory';

const SCENE = asSceneHash('scene-001');
const CONTRACT: SimulationContractReference = {
  contractId: 'contract-1',
  hashMode: 'fnv1a',
  adapterFingerprint: null,
  replayDigestMode: 'epsilon-cross-adapter',
  fieldQuantization: [
    { fieldPattern: 'position', quantum: 1e-5, units: 'm' },
  ],
};

function buildTrajectory(actions: ActionStep[] = []): AdversarialTrajectory {
  return {
    id: asTrajectoryId('t1'),
    sceneHash: SCENE,
    seed: 1,
    trustTier: 'replayable',
    caelReceiptHash: asCaelReceiptHash('cael-1'),
    simulationContract: CONTRACT,
    actionTrace: actions,
    observationTrace: [],
    predicateScore: {
      violation: 0,
      novelty: 0,
      learnability: 0,
      regression: 0,
      invalidity: 0,
    },
    priority: { priority: 0, tieBreaker: 0, rationale: '' },
    replayHandle: {
      trajectoryId: asTrajectoryId('t1'),
      sceneHash: SCENE,
      simulationContractId: CONTRACT.contractId,
      seed: 1,
      replayCommand: 'holoscript replay --trajectory t1 --scene scene-001 --contract contract-1',
    },
    status: 'open',
    discoveredAtMs: 0,
    lastReplayedAtMs: null,
  };
}

const action = (i: number, type: string): ActionStep => ({
  stepIndex: i,
  timestampMs: i,
  type,
  payload: {},
});

describe('scoreTrajectory', () => {
  it('TRUE case: clean trajectory with no anchors → all scores zero, priority zero', () => {
    const out = scoreTrajectory({
      trajectory: buildTrajectory([action(0, 'move')]),
      hardAnchors: [],
      softAnchors: [],
      historyActionTypes: new Set(['move']),
    });
    expect(out.predicateScore.invalidity).toBe(0);
    expect(out.predicateScore.violation).toBe(0);
    expect(out.priority.priority).toBe(0);
  });

  it('FALSE case: hard-anchor failure → invalidity=1, priority=0 (G.PROWL.AUTO.001)', () => {
    // G.GOLD.013: an invalid trajectory must NEVER be replayed. Even if
    // soft anchors flag high violation, the hard-anchor failure
    // short-circuits priority to 0.
    const failingAnchor: ValidityAnchor = {
      id: 'no-nan',
      description: 'observations must not contain NaN',
      evaluate: () => false,
    };
    const highViolationSoftAnchor: SoftAnchor = {
      id: 'big-drift',
      description: 'huge pose drift',
      evaluate: () => 0.9,
    };
    const out = scoreTrajectory({
      trajectory: buildTrajectory([action(0, 'move')]),
      hardAnchors: [failingAnchor],
      softAnchors: [highViolationSoftAnchor],
      historyActionTypes: new Set(),
    });
    expect(out.predicateScore.invalidity).toBe(1);
    expect(out.priority.priority).toBe(0);
    expect(out.priority.rationale).toBe('invalid');
  });

  it('TRUE case: soft-anchor violation + novelty → priority > 0', () => {
    const violating: SoftAnchor = {
      id: 'drift',
      description: 'pose drift',
      evaluate: () => 0.8,
    };
    const out = scoreTrajectory({
      trajectory: buildTrajectory([action(0, 'jump')]), // novel action type
      hardAnchors: [],
      softAnchors: [violating],
      historyActionTypes: new Set(['move', 'grasp']),
      learnabilityEstimate: 0.8,
    });
    expect(out.predicateScore.violation).toBe(0.8);
    expect(out.predicateScore.novelty).toBe(1); // no overlap with history
    expect(out.priority.priority).toBeGreaterThan(0);
    expect(out.priority.priority).toBeLessThanOrEqual(0.8);
  });

  it('TRUE case: regression detected → priority lifted from solved status', () => {
    const violating: SoftAnchor = {
      id: 'drift',
      description: 'drift',
      evaluate: () => 0.5,
    };
    const out = scoreTrajectory({
      trajectory: buildTrajectory([action(0, 'move')]),
      hardAnchors: [],
      softAnchors: [violating],
      historyActionTypes: new Set(['move']),
      previousStatus: 'solved',
    });
    expect(out.predicateScore.regression).toBe(1);
    expect(out.priority.rationale).toMatch(/regression/);
  });

  it('FALSE case: solved + no violation → no regression', () => {
    const out = scoreTrajectory({
      trajectory: buildTrajectory([action(0, 'move')]),
      hardAnchors: [],
      softAnchors: [{ id: 'ok', description: 'ok', evaluate: () => 0 }],
      historyActionTypes: new Set(['move']),
      previousStatus: 'solved',
    });
    expect(out.predicateScore.regression).toBe(0);
  });

  it('FALSE case: pure novelty without violation → low priority (G.PROWL.AUTO.001 anti-junk)', () => {
    // G.PROWL.AUTO.001: prediction-error rewards select high-error junk.
    // A trajectory with novel action types but ZERO violation should NOT
    // climb the curriculum just because it's novel.
    const out = scoreTrajectory({
      trajectory: buildTrajectory([action(0, 'exotic-action')]),
      hardAnchors: [],
      softAnchors: [{ id: 'ok', description: 'ok', evaluate: () => 0 }],
      historyActionTypes: new Set(['move']),
      learnabilityEstimate: 1,
    });
    expect(out.predicateScore.novelty).toBe(1);
    expect(out.predicateScore.violation).toBe(0);
    expect(out.priority.priority).toBe(0);
  });

  it('TRUE case: tieBreaker = action-trace length (shorter wins)', () => {
    const violating: SoftAnchor = {
      id: 'drift',
      description: 'drift',
      evaluate: () => 0.5,
    };
    const short = scoreTrajectory({
      trajectory: buildTrajectory([action(0, 'a')]),
      hardAnchors: [],
      softAnchors: [violating],
      historyActionTypes: new Set(),
    });
    const long = scoreTrajectory({
      trajectory: buildTrajectory([
        action(0, 'a'),
        action(1, 'b'),
        action(2, 'c'),
      ]),
      hardAnchors: [],
      softAnchors: [violating],
      historyActionTypes: new Set(),
    });
    expect(short.priority.tieBreaker).toBe(1);
    expect(long.priority.tieBreaker).toBe(3);
    expect(short.priority.tieBreaker).toBeLessThan(long.priority.tieBreaker);
  });

  it('TRUE case: scoreTrajectory is deterministic (same inputs → same output)', () => {
    const inputs = {
      trajectory: buildTrajectory([action(0, 'move')]),
      hardAnchors: [],
      softAnchors: [{ id: 'd', description: 'd', evaluate: () => 0.3 }],
      historyActionTypes: new Set(['move']),
      learnabilityEstimate: 0.7,
    };
    const r1 = scoreTrajectory(inputs);
    const r2 = scoreTrajectory(inputs);
    expect(r1).toEqual(r2);
  });

  it('FALSE case: soft-anchor returning NaN/Infinity is clamped to 0 (defense against junk anchors)', () => {
    const buggyAnchor: SoftAnchor = {
      id: 'buggy',
      description: 'NaN producer',
      evaluate: () => NaN,
    };
    const out = scoreTrajectory({
      trajectory: buildTrajectory([action(0, 'move')]),
      hardAnchors: [],
      softAnchors: [buggyAnchor],
      historyActionTypes: new Set(),
    });
    expect(out.predicateScore.violation).toBe(0);
  });
});
