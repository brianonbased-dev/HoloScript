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
