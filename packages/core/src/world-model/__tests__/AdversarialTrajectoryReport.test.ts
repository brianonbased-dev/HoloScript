/**
 * Tests for AdversarialTrajectoryReport — paired FALSE+TRUE per G.GOLD.013/F.043.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAdversarialTrajectoryReport,
  serializeReport,
  isReportCountsConsistent,
} from '../AdversarialTrajectoryReport';
import {
  asTrajectoryId,
  asSceneHash,
  asCaelReceiptHash,
  type AdversarialTrajectory,
  type SimulationContractReference,
  type TrajectoryStatus,
} from '../AdversarialTrajectory';

const SCENE = asSceneHash('scene-fixture-001');
const NOW = 1_700_000_000_000;

function buildT(
  id: string,
  status: TrajectoryStatus,
  priority: number,
  tieBreaker = 0,
  scene = SCENE,
  scoreOverrides?: Partial<AdversarialTrajectory['predicateScore']>
): AdversarialTrajectory {
  const contract: SimulationContractReference = {
    contractId: `contract-${id}`,
    hashMode: 'fnv1a',
    adapterFingerprint: null,
    replayDigestMode: 'epsilon-cross-adapter',
    fieldQuantization: [
      { fieldPattern: 'position', quantum: 1e-5, units: 'm' },
    ],
  };

  return {
    id: asTrajectoryId(id),
    sceneHash: scene,
    seed: 1,
    trustTier: 'replayable',
    caelReceiptHash: asCaelReceiptHash(`cael-${id}`),
    simulationContract: contract,
    actionTrace: [],
    observationTrace: [],
    predicateScore: {
      violation: 0,
      novelty: 0,
      learnability: 0,
      regression: 0,
      invalidity: status === 'invalid' ? 1 : 0,
      ...scoreOverrides,
    },
    priority: { priority, tieBreaker, rationale: 'fixture' },
    replayHandle: {
      trajectoryId: asTrajectoryId(id),
      sceneHash: scene,
      simulationContractId: contract.contractId,
      seed: 1,
      replayCommand: `holoscript replay --trajectory ${id} --scene ${scene} --contract ${contract.contractId}`,
    },
    status,
    discoveredAtMs: NOW,
    lastReplayedAtMs: null,
  };
}

describe('buildAdversarialTrajectoryReport', () => {
  it('TRUE case: counts every status correctly', () => {
    const trajectories = [
      buildT('t1', 'open', 0.9),
      buildT('t2', 'open', 0.8),
      buildT('t3', 'solved', 0.5),
      buildT('t4', 'unresolved', 0.7),
      buildT('t5', 'invalid', 0),
      buildT('t6', 'archived', 0),
    ];

    const report = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);

    expect(report.counts).toEqual({
      open: 2,
      solved: 1,
      unresolved: 1,
      invalid: 1,
      archived: 1,
    });
    expect(report.sceneHash).toBe(SCENE);
    expect(report.generatedAtMs).toBe(NOW);
  });

  it('TRUE case: topPriority is priority-sorted descending', () => {
    const trajectories = [
      buildT('low', 'open', 0.2),
      buildT('high', 'open', 0.9),
      buildT('mid', 'open', 0.5),
    ];
    const report = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);
    expect(report.topPriority).toEqual([
      asTrajectoryId('high'),
      asTrajectoryId('mid'),
      asTrajectoryId('low'),
    ]);
  });

  it('FALSE case: invalid trajectories are EXCLUDED from topPriority (even with high priority)', () => {
    // G.PROWL.AUTO.001: invalid trajectories must never replay.
    // Even if a producer sets a high priority on an invalid trajectory
    // (bug or attack), the report rollup MUST exclude it.
    const trajectories = [
      buildT('valid-mid', 'open', 0.5),
      buildT('invalid-high', 'invalid', 0.99),
    ];
    const report = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);
    expect(report.topPriority).toEqual([asTrajectoryId('valid-mid')]);
    expect(report.topPriority).not.toContain(asTrajectoryId('invalid-high'));
  });

  it('FALSE case: priority=0 trajectories are excluded from topPriority', () => {
    const trajectories = [
      buildT('zero', 'open', 0),
      buildT('nonzero', 'open', 0.1),
    ];
    const report = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);
    expect(report.topPriority).toEqual([asTrajectoryId('nonzero')]);
  });

  it('TRUE case: tieBreaker resolves equal priorities (lower wins)', () => {
    const trajectories = [
      buildT('tie-second', 'open', 0.5, 10),
      buildT('tie-first', 'open', 0.5, 1),
    ];
    const report = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);
    expect(report.topPriority).toEqual([
      asTrajectoryId('tie-first'),
      asTrajectoryId('tie-second'),
    ]);
  });

  it('FALSE case: mixed-scene trajectories throw (category error)', () => {
    const otherScene = asSceneHash('scene-different');
    const trajectories = [
      buildT('a', 'open', 0.5),
      buildT('b', 'open', 0.5, 0, otherScene),
    ];
    expect(() => buildAdversarialTrajectoryReport(trajectories, SCENE, NOW)).toThrow(
      /sceneHash/
    );
  });

  it('TRUE case: topPriorityLimit truncates the list', () => {
    const trajectories = Array.from({ length: 15 }, (_, i) =>
      buildT(`t${i}`, 'open', 1 - i * 0.05)
    );
    const report = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW, 3);
    expect(report.topPriority).toHaveLength(3);
    expect(report.topPriority[0]).toBe(asTrajectoryId('t0'));
  });

  it('TRUE case: failure clusters group by status and dominant predicate', () => {
    const trajectories = [
      buildT('open-violation', 'open', 0.5, 0, SCENE, { violation: 0.8, novelty: 0.1 }),
      buildT('open-novelty', 'open', 0.6, 0, SCENE, { violation: 0.1, novelty: 0.9 }),
      buildT('solved-violation', 'solved', 0.4, 0, SCENE, { violation: 0.7, novelty: 0.2 }),
      buildT('invalid-high', 'invalid', 0, 0, SCENE, { invalidity: 1 }),
    ];
    const report = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);

    const clusterLabels = report.failureClusters.map((c) => c.label);
    expect(clusterLabels).toContain('open (violation)');
    expect(clusterLabels).toContain('open (novelty)');
    expect(clusterLabels).toContain('solved (violation)');
    expect(clusterLabels).toContain('invalid (invalidity)');

    const invalidCluster = report.failureClusters.find((c) => c.status === 'invalid');
    expect(invalidCluster?.count).toBe(1);
    expect(invalidCluster?.dominantPredicate).toBe('invalidity');
  });

  it('TRUE case: score summary computes min/max/avg per predicate', () => {
    const trajectories = [
      buildT('low', 'open', 0.5, 0, SCENE, { violation: 0.2, novelty: 0.1 }),
      buildT('high', 'open', 0.5, 0, SCENE, { violation: 0.8, novelty: 0.9 }),
    ];
    const report = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);

    expect(report.scoreSummary.violation.min).toBe(0.2);
    expect(report.scoreSummary.violation.max).toBe(0.8);
    expect(report.scoreSummary.violation.avg).toBe(0.5);
    expect(report.scoreSummary.novelty.min).toBe(0.1);
    expect(report.scoreSummary.novelty.max).toBe(0.9);
    expect(report.scoreSummary.novelty.avg).toBe(0.5);
  });

  it('TRUE case: replay summary counts trajectories with and without replay evidence', () => {
    const withEvidence = buildT('with', 'open', 0.5);
    const withoutEvidence: AdversarialTrajectory = {
      ...buildT('without', 'open', 0.5),
      replayHandle: {
        trajectoryId: asTrajectoryId('without'),
        sceneHash: SCENE,
        simulationContractId: 'mismatched-contract',
        seed: 1,
        replayCommand: '',
      },
    };
    const report = buildAdversarialTrajectoryReport([withEvidence, withoutEvidence], SCENE, NOW);

    expect(report.replaySummary.withEvidence).toBe(1);
    expect(report.replaySummary.withoutEvidence).toBe(1);
  });
});

describe('serializeReport', () => {
  it('TRUE case: produces deterministic JSON for identical input', () => {
    const trajectories = [
      buildT('t1', 'open', 0.5),
      buildT('t2', 'invalid', 0),
    ];
    const r1 = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);
    const r2 = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);
    expect(serializeReport(r1)).toBe(serializeReport(r2));
  });
});

describe('isReportCountsConsistent', () => {
  it('TRUE case: builder output is always self-consistent', () => {
    const trajectories = [
      buildT('a', 'open', 0.5),
      buildT('b', 'solved', 0.3),
      buildT('c', 'invalid', 0),
    ];
    const report = buildAdversarialTrajectoryReport(trajectories, SCENE, NOW);
    expect(isReportCountsConsistent(report)).toBe(true);
  });

  it('FALSE case: tampered counts detected', () => {
    // G.GOLD.013: explicit detect-the-tamper assertion. A trusted-but-stale
    // report payload that lies about its counts must be detectable by
    // the consumer — re-derivation catches it.
    const trajectories = [buildT('a', 'open', 0.5)];
    const tampered = {
      ...buildAdversarialTrajectoryReport(trajectories, SCENE, NOW),
      counts: { open: 99, solved: 0, unresolved: 0, invalid: 0, archived: 0 },
    };
    expect(isReportCountsConsistent(tampered)).toBe(false);
  });
});
