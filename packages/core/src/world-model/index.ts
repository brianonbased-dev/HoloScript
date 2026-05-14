/**
 * @holoscript/core/world-model — barrel exports
 *
 * PROWL response substrate. Schema lives in `AdversarialTrajectory.ts`;
 * implementation (buffer, scorer, mutator, replay) lands in sibling
 * files as the loop matures.
 */

export {
  isCurriculumEligible,
  asTrajectoryId,
  asSceneHash,
  asCaelReceiptHash,
  hasReplayEvidence,
} from './AdversarialTrajectory';

export {
  buildAdversarialTrajectoryReport,
  serializeReport,
  isReportCountsConsistent,
} from './AdversarialTrajectoryReport';

export { scoreTrajectory } from './PredicateScorer';
export type { SoftAnchor, ScorerInputs, ScorerOutput } from './PredicateScorer';

export type {
  TrajectoryId,
  SceneHash,
  CaelReceiptHash,
  TrustTier,
  SimulationContractHashMode,
  ReplayDigestMode,
  SimulationFieldQuantum,
  SimulationContractReference,
  ActionStep,
  ObservationStep,
  SemanticPredicateScore,
  CurriculumPriority,
  ValidityAnchor,
  ReplayHandle,
  TrajectoryStatus,
  AdversarialTrajectory,
  AdversarialTrajectoryReport,
} from './AdversarialTrajectory';
