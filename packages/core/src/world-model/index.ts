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
  HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
  validatePortableHardwareReceiptMetadata,
  isPortableHardwareReceiptMetadata,
} from './HardwareReceiptMetadata';

export {
  COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION,
  buildComputeExecutionReceipt,
  validateComputeExecutionReceipt,
} from './ComputeExecutionReceipt';

export {
  COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION,
  COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION,
  COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION,
  COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION,
  COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION,
  COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION,
  COMPUTE_CAPACITY_LEASE_MAX_TTL_MS,
  COMPUTE_EVIDENCE_MAX_FUTURE_SKEW_MS,
  COMPUTE_CAPACITY_SNAPSHOT_MAX_TTL_MS,
  COMPUTE_BRIDGE_ADMISSION_MAX_TTL_MS,
  computeCapacityAllocationEtag,
  validateComputeCapacityAllocationCursor,
  buildComputeCapacitySnapshot,
  validateComputeCapacitySnapshot,
  buildComputeBridgeAdmission,
  validateComputeBridgeAdmission,
  planComputePlacement,
  validateComputePlacementPlan,
  verifyComputePlacementPlan,
  prepareComputeCapacityLease,
  validateComputeCapacityLease,
  verifyComputeCapacityLeaseReceipt,
  authorizeComputeCapacityLeaseUse,
  attestComputeExecutionReceipt,
  validateComputeSubjectAttestation,
  verifyComputeExecutionEvidence,
  buildComputeBudgetEvidence,
  validateComputeBudgetEvidence,
  verifyComputeBudgetEvidence,
} from './ComputePlacementEvidence';

export {
  COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION,
  COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION,
  COMPUTE_UTILITY_MINIMUM_AGGREGATE,
  buildComputeUtilityObservation,
  validateComputeUtilityObservation,
  aggregateComputeUtilityObservations,
  validateComputeUtilityAggregate,
} from './ComputeUtilityDiscovery';

export {
  COMPUTE_JOB_SCHEMA_VERSION,
  COMPUTE_JOB_TRANSITION_SCHEMA_VERSION,
  COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION,
  COMPUTE_JOB_REQUEST_SCHEMA_VERSION,
  computeJobIdempotencyKeyHash,
  computeJobRequestHash,
  validateComputeJobReceipt,
  prepareComputeJob,
  prepareComputeJobTransition,
  validateComputeJobTransitionReceipt,
  validateComputeAllocatorCommitReceipt,
  verifyComputeJobTransition,
} from './ComputeJobLifecycle';

export {
  buildAdversarialTrajectoryReport,
  serializeReport,
  isReportCountsConsistent,
} from './AdversarialTrajectoryReport';

export { scoreTrajectory } from './PredicateScorer';

export { mutateTrace, exploreAdversarialTraces, BUILT_IN_PROFILES } from './AdversarialMutator';
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

export {
  N4_RESIDUAL_WORLD_SCHEMA_VERSION,
  N4_METRIC_CONTRACT_SHA256,
  N4_DT,
  N4_LONG_HORIZON,
  N4_TRAIN_SEEDS,
  N4_OOD_SEEDS,
  N4_PLANNING_SEEDS,
  N4_BOOTSTRAP_SEEDS,
  N4_SAMPLE_BUDGETS,
  N4_RESIDUAL_TARGETS,
  N4_ARMS,
  compileN4ResidualWorldSource,
  generateN4Scene,
  stepN4Exact,
  stepN4Truth,
  trainN4Models,
  predictN4Scene,
  projectN4TypedFeatures,
  verifyN4Prediction,
  evaluateN4Arm,
  buildN4WeightsManifest,
  generateN4Artifacts,
  proposeN4TypedMove,
  verifyN4TypedMove,
  runN4Experiment,
} from './N4ResidualWorldLoop';
export type {
  N4ResidualTarget,
  N4Arm,
  N4Vec2,
  N4Object2D,
  N4WorldEvent,
  N4WorldScene,
  N4SourceContract,
  N4LinearModel,
  N4ModelSet,
  N4ObjectPrediction,
  N4ScenePrediction,
  N4ArmMetrics,
  N4TypedMoveAction,
  N4WeightsManifest,
  N4GeneratedArtifacts,
  N4ExperimentReceipt,
} from './N4ResidualWorldLoop';

export {
  N4_RUNTIME_PARITY_TOLERANCE,
  inferN4Cpu,
  inferN4Wasm,
  inferN4WebGPU,
  verifyN4RuntimeParity,
} from './N4ResidualRuntimeParity';
export type { N4RuntimeInference, N4RuntimeParityVerdict } from './N4ResidualRuntimeParity';
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

export type {
  HardwareReceiptSchemaVersion,
  HardwareReceiptTarget,
  HardwareReceiptDevice,
  HardwareReceiptRuntime,
  HardwareReceiptConstraint,
  HardwareReceiptMeasuredResult,
  HardwareReceiptReplayInput,
  HardwareReceiptProvenance,
  HardwareReceiptOwner,
  PortableHardwareReceiptMetadata,
  HardwareReceiptMetadataValidation,
} from './HardwareReceiptMetadata';

export type {
  ComputeExecutionAccelerator,
  ComputeExecutionTerminalStatus,
  ComputeExecutionQualityOperator,
  ComputeExecutionQualityReference,
  ComputeExecutionPlacementOutcome,
  ComputeExecutionCost,
  ComputeExecutionWorkUnitBinding,
  ComputeExecutionPlacementBinding,
  ComputeExecutionOutcome,
  ComputeExecutionQualityResult,
  ComputeExecutionReceipt,
  BuildComputeExecutionReceiptInput,
  ComputeExecutionReceiptValidation,
} from './ComputeExecutionReceipt';

export type {
  ComputeEvidenceRole,
  ComputeCapacityLane,
  ComputeCapacityHealth,
  ComputePlacementVerdict,
  ComputeBridgeAdmissionVerdict,
  ComputeBridgeAdmissionReason,
  ComputePlacementReason,
  ComputeCapacityCostEstimate,
  ComputeEvidenceSigner,
  ComputeEvidenceTrustAnchor,
  ComputeIssuerAttestation,
  ComputeBudgetEvidenceStatus,
  ComputeBudgetAccountProjection,
  ComputeBudgetEvidenceBinding,
  ComputeBudgetEvidence,
  BuildComputeBudgetEvidenceInput,
  VerifyComputeBudgetEvidenceInput,
  ComputeBudgetEvidenceVerification,
  ComputeCapacitySnapshot,
  BuildComputeCapacitySnapshotInput,
  ComputeBridgeAdmission,
  BuildComputeBridgeAdmissionInput,
  ComputePlacementPlan,
  PlanComputePlacementInput,
  VerifyComputePlacementPlanInput,
  ComputeCapacityLease,
  ComputeCapacityAllocationCursor,
  PrepareComputeCapacityLeaseInput,
  PreparedComputeCapacityLease,
  VerifyComputeCapacityLeaseReceiptInput,
  AuthorizeComputeCapacityLeaseUseInput,
  ComputeSubjectAttestation,
  AttestComputeExecutionReceiptInput,
  VerifyComputeExecutionEvidenceInput,
  ComputeEvidenceValidation,
  ComputeExecutionEvidenceVerification,
} from './ComputePlacementEvidence';

export type {
  ComputeUtilityNotMeasuredReason,
  ComputeUtilityFallbackBucket,
  ComputeUtilityQualityBucket,
  ComputeUtilityLatencyBucket,
  ComputeUtilityCostBucket,
  ComputeUtilityBuckets,
  ComputeUtilityObservation,
  BuildComputeUtilityObservationInput,
  ComputeUtilityMeasurementResult,
  ComputeUtilityAggregateBucket,
  ComputeUtilityAggregate,
  ComputeUtilityAggregateResult,
  ComputeUtilityValidation,
} from './ComputeUtilityDiscovery';

export type {
  ComputeJobState,
  ComputeJobTerminalState,
  ComputeJobTransitionAction,
  ComputeJobFailureReason,
  ComputeJobCancellationReason,
  ComputeJobReasonCode,
  ComputeJobExecutionUnobservedReason,
  ComputeJobCompletionDisposition,
  ComputeAllocatorCommitOperation,
  ComputeJobRequest,
  ComputeJobRequestBinding,
  ComputeJobWorkUnitBinding,
  ComputeJobPlacementBinding,
  ComputeJobLeaseBinding,
  ComputeJobTerminalEvidence,
  ComputeJobTerminal,
  ComputeJobReceipt,
  ComputeJobStateReference,
  ComputeJobTransitionReceipt,
  ComputeAllocatorCommitReceipt,
  PrepareComputeJobInput,
  PreparedComputeJob,
  PrepareQueueComputeJobInput,
  PrepareLeaseComputeJobInput,
  PrepareStartComputeJobInput,
  PrepareRunningComputeJobInput,
  PrepareSucceededComputeJobInput,
  PrepareFailedComputeJobInput,
  PrepareCancelledComputeJobInput,
  PrepareComputeJobTransitionInput,
  PreparedComputeJobTransition,
  VerifyComputeJobTransitionInput,
  ComputeJobLifecycleValidation,
} from './ComputeJobLifecycle';
