/**
 * JSON report exporter for the adversarial trajectory buffer.
 *
 * Operationalizes acceptance criterion 5 of the AUTONOMIZE doc:
 *   "JSON report (solved/unresolved/invalid) — UI later, JSON first"
 *
 * Pure function — takes a frozen list of trajectories and produces a
 * deterministic rollup. No I/O, no side effects, no runtime dependency
 * beyond the schema in `AdversarialTrajectory.ts`.
 *
 * Counts are derived directly from `trajectories.filter(...)` so the
 * report is self-validating: consumers can re-verify counts without
 * trusting the producer.
 *
 * @module @holoscript/core/world-model
 */

import type {
  AdversarialTrajectory,
  AdversarialTrajectoryReport,
  SceneHash,
  TrajectoryId,
  TrajectoryStatus,
} from './AdversarialTrajectory';

/**
 * Build the report from a curriculum snapshot.
 *
 * @param trajectories — current curriculum state
 * @param sceneHash    — scene hash to record on the report (all trajectories MUST share it)
 * @param generatedAtMs — wall-clock timestamp for the report (caller-supplied for determinism)
 * @param topPriorityLimit — max ids in the `topPriority` list (default 10)
 *
 * @throws Error when trajectories disagree on scene hash. Mixed-scene
 *         reports are a category error — the report represents one
 *         scene's curriculum, not a portfolio.
 */
export function buildAdversarialTrajectoryReport(
  trajectories: readonly AdversarialTrajectory[],
  sceneHash: SceneHash,
  generatedAtMs: number,
  topPriorityLimit = 10
): AdversarialTrajectoryReport {
  for (const t of trajectories) {
    if (t.sceneHash !== sceneHash) {
      throw new Error(
        `buildAdversarialTrajectoryReport: trajectory ${t.id} has sceneHash ${t.sceneHash} but report sceneHash is ${sceneHash}`
      );
    }
  }

  const countBy = (status: TrajectoryStatus): number =>
    trajectories.filter((t) => t.status === status).length;

  const topPriority: TrajectoryId[] = [...trajectories]
    .filter((t) => t.status !== 'invalid' && t.priority.priority > 0)
    .sort((a, b) => {
      if (a.priority.priority !== b.priority.priority) {
        return b.priority.priority - a.priority.priority;
      }
      return a.priority.tieBreaker - b.priority.tieBreaker;
    })
    .slice(0, topPriorityLimit)
    .map((t) => t.id);

  return {
    generatedAtMs,
    sceneHash,
    trajectories,
    counts: {
      open: countBy('open'),
      solved: countBy('solved'),
      unresolved: countBy('unresolved'),
      invalid: countBy('invalid'),
      archived: countBy('archived'),
    },
    topPriority,
  };
}

/**
 * Serialize a report to a canonical JSON string. The output is
 * deterministic — key order is fixed and arrays preserve insertion
 * order — so two reports of the same curriculum produce byte-identical
 * JSON (suitable for content-addressable hashing and diff-replay).
 */
export function serializeReport(report: AdversarialTrajectoryReport): string {
  return JSON.stringify(report);
}

/**
 * Validate a report's counts against its `trajectories` array. Returns
 * true when every count matches a re-derivation from the array.
 *
 * Use this on consumer side as a defense against trusted-but-stale
 * report payloads (e.g. when a report is round-tripped through a
 * lossy channel).
 */
export function isReportCountsConsistent(report: AdversarialTrajectoryReport): boolean {
  const re = (status: TrajectoryStatus): number =>
    report.trajectories.filter((t) => t.status === status).length;
  return (
    report.counts.open === re('open') &&
    report.counts.solved === re('solved') &&
    report.counts.unresolved === re('unresolved') &&
    report.counts.invalid === re('invalid') &&
    report.counts.archived === re('archived')
  );
}
