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

export {
  mutateTrace,
  exploreAdversarialTraces,
  BUILT_IN_PROFILES,
} from './AdversarialMutator';
export type {
  MutationStrategy,
  MutatorProfile,
  MutatedTrace,
  AdversarialExplorerOptions,
} from './AdversarialMutator';
export type { SoftAnchor, ScorerInputs, ScorerOutput } from './PredicateScorer';

export {
  DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
  hashDeterministicSceneValue,
  createDeterministicFailureDiscoveryScene,
  runDeterministicFailureDiscoveryScene,
  buildDeterministicFailureTrajectory,
  DETERMINISTIC_FAILURE_CONTRACT,
} from './DeterministicFailureScene';
export type {
  Vec3,
  DeterministicSceneObjectKind,
  DeterministicSceneObject,
  DeterministicSceneCamera,
  DeterministicFailureSceneState,
  DeterministicSceneAction,
  DeterministicSceneEventType,
  DeterministicSceneEvent,
  DeterministicFailureSceneResult,
  DeterministicFailureTrajectoryBuild,
  DeterministicFailureSceneOptions,
} from './DeterministicFailureScene';

export {
  HUMANOID_ROCK_THROW_SCENE_ID,
  HUMANOID_ROCK_THROW_CONTRACT,
  createHumanoidRockThrowScene,
  runHumanoidRockThrowReplay,
  buildHumanoidRockThrowTrajectory,
} from './HumanoidRockThrowScene';
export type {
  HumanoidRockThrowObject,
  HumanoidRockThrowSceneState,
  HumanoidRockThrowEventType,
  HumanoidRockThrowEvent,
  HumanoidRockThrowReplayResult,
  HumanoidRockThrowTrajectoryBuild,
  HumanoidRockThrowSceneOptions,
} from './HumanoidRockThrowScene';

export {
  TWO_AGENT_HANDOFF_CATCH_SCENE_ID,
  TWO_AGENT_HANDOFF_CATCH_CONTRACT,
  createTwoAgentHandoffCatchScene,
  runTwoAgentHandoffCatchReplay,
  buildTwoAgentHandoffCatchTrajectory,
} from './TwoAgentHandoffCatchScene';
export type {
  TwoAgentHandoffObject,
  TwoAgentHandoffCatchSceneState,
  TwoAgentHandoffCatchEventType,
  TwoAgentHandoffCatchEvent,
  TwoAgentHandoffCatchReplayResult,
  TwoAgentHandoffCatchTrajectoryBuild,
  TwoAgentHandoffCatchSceneOptions,
} from './TwoAgentHandoffCatchScene';

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
  FailureCluster,
  ScoreComponentSummary,
  ScoreSummary,
  ReplaySummary,
} from './AdversarialTrajectory';
