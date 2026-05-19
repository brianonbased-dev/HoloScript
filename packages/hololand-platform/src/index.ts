export { AffectiveMemory } from './memory/affective';
export type { AffectScore, AffectiveSceneContext } from './memory/affective';

export { resolveWorldCreation } from './world/byzantineWorldConsensus';
export type {
  ByzantineConsensusConfig,
  WorldCreationResolution,
  WorldCreationVote,
  WorldProposal,
} from './world/byzantineWorldConsensus';

export { BlockoutCRDTSession } from './collaboration/blockoutCRDT';
export type { BlockoutVec3, BlockoutVolume } from './collaboration/blockoutCRDT';

export { CausalWorldModel, createVRPhysicsModel } from './world/causal';
export type { CausalVariable, CausalEdge, CausalQueryResult } from './world/causal';

// Frontier Shard 0 — bootstrap shard built on @holoscript/framework primitives
// (task_1778186605462_2mlp).
export { buildFrontierShardZero, validateFrontierShardZero } from './world/frontier-shard-zero';

// Creator Playable-Template Pipeline (task_1778186605462_muzd)
export {
  compileTemplateToChallenge,
  submitForReview,
  approveChallenge,
  rejectChallenge,
  resetCreatorRegistry,
  getCreatorRegistry,
  listPublishedChallenges,
  getPublishedChallenge,
  getKioskSlice,
  buildKioskCard,
  paginateKioskCards,
  kioskSearch,
  kioskFeatured,
} from './creator';

export type { CompileOptions, KioskSlice, KioskCard, KioskGrid } from './creator';

// Device Lab — hardware-native readiness probes and receipt CLI
export {
  DEFAULT_DEVICE_LAB_OUTPUT_DIR,
  collectRuntimeInventory,
  defaultReceiptPath,
  deriveDeviceGotchas,
  detectWasmSimd,
  parseQuestProbeMarkdown,
  runDeviceLabProbe,
  writeDeviceLabReceipt,
} from './device-lab';

export type {
  ArtifactReceipt,
  CommandResult,
  CommandRunner,
  CommandRunnerOptions,
  DeviceGotcha,
  DeviceLabOptions,
  DeviceLabReceipt,
  GpuController,
  ProbeCheck,
  ProbeStatus,
  RuntimeInventory,
  WebGpuProbeCommand,
} from './device-lab';

// Evidence — reviewer-safe CAEL/user-study trace corpus export
export {
  HOLOLAND_TRACE_CORPUS_SCHEMA,
  HOLOLAND_TRACE_EXPORTER,
  HOLOLAND_TRACE_GENESIS_HASH,
  HololandTraceCorpusExporter,
  exportHololandTraceCorpus,
  exportHololandTraceJSONL,
  hashReviewerSubject,
  ingestHololandTraceCorpus,
  parseHololandTraceJSONL,
  redactReviewerPayload,
  toHololandTraceJSONL,
  verifyHololandTraceCorpus,
} from './evidence';

export type {
  AdaptiveInterfaceGate,
  HololandTraceCorpus,
  HololandTraceCorpusIngestion,
  HololandTraceCorpusOptions,
  HololandTraceCorpusSummary,
  HololandTraceEventInput,
  HololandTraceEventType,
  HololandTraceProvenanceInput,
  HololandTraceVerification,
  LearnedSceneCompositionSignals,
  ReviewerSafeJSON,
  ReviewerSafeTraceEntry,
  ReviewerSafeTraceProvenance,
} from './evidence';

// Headset Share — owned HTTPS transport for Quest proof (task_1778964942978_iuct)
export {
  startHeadsetShareServer,
  buildHeadsetShareReceipt,
  detectLanIp,
  detectAllLanIps,
  adbAvailable,
  adbListDevices,
  adbReverseForward,
  adbReverseRemove,
  generateShareId,
  renderScenePage,
  DEFAULT_HEADSET_SHARE_OUTPUT_DIR,
} from './headset-share';

export type {
  HeadsetTransportKind,
  HeadsetShareOptions,
  HeadsetShareReceipt,
  HeadsetShareArtifact,
  ShareRecord,
  SelfSignedCert,
  HeadsetShareServer,
} from './headset-share';

// Adversarial Trajectory — PROWL response substrate
export {
  ADVERSARIAL_TRAJECTORY_SCHEMA,
  ADVERSARIAL_TRAJECTORY_GENERATOR,
  createAdversarialTrajectoryReport,
  createDeterministicFailureScene,
  simulateScene,
  replayTrajectory,
  scoreTrajectory,
  hashValue,
  canonicalJson,
} from './adversarial-trajectory';

export type {
  PredicateName,
  TrajectoryStatus as AdversarialTrajectoryStatus,
  AdversarialActionKind,
  SemanticEventType,
  Vector3,
  SceneObject,
  DeterministicScene,
  AdversarialAction,
  SemanticEvent,
  AdversarialObservation,
  SemanticPredicateScore as HololandPredicateScore,
  CurriculumPriority as HololandCurriculumPriority,
  ValidityAnchor as HololandValidityAnchor,
  ReplayHandle as HololandReplayHandle,
  AdversarialTrajectory as HololandAdversarialTrajectory,
  AdversarialTrajectorySummary,
  AdversarialTrajectoryReport as HololandAdversarialTrajectoryReport,
  AdversarialTrajectoryReportOptions,
  PredicateReplayDelta,
  AdversarialTrajectoryReplayResult,
} from './adversarial-trajectory';
