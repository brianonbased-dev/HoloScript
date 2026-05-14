import { describe, expect, it } from 'vitest';
import {
  ADVERSARIAL_TRAJECTORY_SCHEMA,
  createAdversarialTrajectoryReport,
  replayTrajectory,
} from './index';

const FIXED_NOW = '2026-05-14T13:30:00.000Z';
const SEED = 'task_1778659494755_41li-prowl-response-test';

describe('HoloLand adversarial trajectory buffer', () => {
  it('generates a schema-bound report with at least twenty replay handles', () => {
    const report = createAdversarialTrajectoryReport({
      count: 20,
      seed: SEED,
      generatedAt: FIXED_NOW,
      reportPath: 'docs/public/evidence/adversarial-trajectory-report.json',
      taskId: 'task_1778659494755_41li',
    });

    expect(report.schemaVersion).toBe(ADVERSARIAL_TRAJECTORY_SCHEMA);
    expect(report.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(report.scene.sceneHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(report.summary.total).toBeGreaterThanOrEqual(20);
    expect(report.summary.predicateNames).toEqual([
      'violation',
      'novelty',
      'learnability',
      'regression',
      'invalidity',
    ]);
    expect(new Set(report.trajectories.map((trajectory) => trajectory.id)).size).toBe(
      report.trajectories.length,
    );
    expect(report.summary.solved).toBeGreaterThan(0);
    expect(report.summary.unresolved).toBeGreaterThan(0);
    expect(report.summary.invalid).toBeGreaterThan(0);
  });

  it('records object placement, collision/contact, camera motion, and semantic event logs', () => {
    const report = createAdversarialTrajectoryReport({
      count: 20,
      seed: SEED,
      generatedAt: FIXED_NOW,
    });
    const events = report.trajectories.flatMap((trajectory) =>
      trajectory.observationTrace.flatMap((observation) => observation.eventLog),
    );

    expect(events.some((event) => event.type === 'placement')).toBe(true);
    expect(events.some((event) => event.type === 'camera-motion')).toBe(true);
    expect(events.some((event) => event.type === 'contact')).toBe(true);
    expect(events.some((event) => event.type === 'collision')).toBe(true);
    expect(events.some((event) => event.type === 'semantic-violation')).toBe(true);
  });

  it('replays a trajectory id with stable predicate deltas and receipt hashes', () => {
    const report = createAdversarialTrajectoryReport({
      count: 20,
      seed: SEED,
      generatedAt: FIXED_NOW,
    });
    const topId = report.summary.topPriorityTrajectoryIds[0];
    if (!topId) throw new Error('expected a top-priority trajectory id');

    const replay = replayTrajectory(report, topId);

    expect(replay.replayStatus).toBe('pass');
    expect(replay.receiptHashes.sceneHash).toBe(report.scene.sceneHash);
    expect(replay.receiptHashes.caelReceiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(replay.predicateDeltas.map((delta) => delta.name)).toEqual([
      'violation',
      'novelty',
      'learnability',
      'regression',
      'invalidity',
    ]);
    expect(replay.predicateDeltas.every((delta) => delta.stable && delta.delta === 0)).toBe(true);
  });

  it('is deterministic for the same seed and timestamp', () => {
    const left = createAdversarialTrajectoryReport({
      count: 20,
      seed: SEED,
      generatedAt: FIXED_NOW,
    });
    const right = createAdversarialTrajectoryReport({
      count: 20,
      seed: SEED,
      generatedAt: FIXED_NOW,
    });

    expect(right.reportHash).toBe(left.reportHash);
    expect(right.trajectories.map((trajectory) => trajectory.replay.caelReceiptHash)).toEqual(
      left.trajectories.map((trajectory) => trajectory.replay.caelReceiptHash),
    );
  });
});
