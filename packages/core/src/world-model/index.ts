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
} from './AdversarialTrajectory';

export type {
  TrajectoryId,
  SceneHash,
  CaelReceiptHash,
  TrustTier,
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
