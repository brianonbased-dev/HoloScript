/**
 * Public API composition for `@holoscript/core`.
 * Split across barrels so the root `index.ts` does not pull the entire graph through one file.
 */

export * from '../legacy-exports';

export * from './hsplus-public-types';

export * from './constants';
export * from './runtime-env';

export * from './exports-core';
export * from './exports-semantics-diff-wasm';
export * from './exports-visual-through-v43';
export * from './exports-graphql-safety';

// Platform / XR (split so culture + agent exports stay in original order)
export * from '../platforms/conditional-modality';
export * from './culture-agents';
export * from '../platforms/cross-reality';

export * from './marketplace';
export * from './hololand-runtime';
export * from './material-io-pipeline';
export * from './trait-stdlib-interop';
export * from './compiler-plugins-crypto';
export * from './registry-deploy-events';

// HoloMap - WebGPU reconstruction runtime (Sprint 1 scaffold)
export * from '../reconstruction';

// Spatial MCP - 3D context payload (research/2026-05-07_spatial-mcp-spec.md)
export * from '../spatial';

// Agent extensions (ISwarmConfig, ISwarmResult, IAgentExtension, etc.)
export * from '../extensions';

// ContentPolicyGate — the CONTENT axis of the legal/illegal system
// (provider-agnostic content moderation; pairs with Twin Earth action envelopes
// and the conformance/founder gates). research/2026-06-13.
export * from '../policy';

// Worker layer exports
export * from '../HoloScriptCodeParser';
export * from '../worker/CompilerWorkerProxy';
export * from '../worker/LSPWorkerProtocol';

// Compiler module resolver (engine HotReloadBridge relies on invalidate()).
export { ModuleResolver } from '../compiler/ModuleResolver';
export type { CachedModule, ModuleHeader, ResolvedImport } from '../compiler/ModuleResolver';
export type { ResolvedImport as ModuleImport } from '../compiler/ModuleResolver';
export type ModuleExport = string;

// Theming (consumed by @holoscript/engine RuntimeBridge)
export * from '../theming/ThemeEngine';
export * from '../theming/StyleResolver';

// Shared trait types (TraitInstanceDelegate consumed by engine traits).
// Keep this explicit so legacy VR exports remain authoritative for overlapping names.
export { extractPayload } from '../traits/TraitTypes';
export type {
  TraitHandler,
  HostExecOptions,
  HostExecResult,
  HostNetworkRequestOptions,
  HostNetworkResponse,
  HostFileSystemCapabilities,
  HostProcessCapabilities,
  HostNetworkCapabilities,
  HostMediaFrame,
  HostMediaCapabilities,
  HostDepthMap,
  HostDepthInferenceCapabilities,
  HostGpuComputeResult,
  HostGpuComputeCapabilities,
  HostCapabilities,
  ARTrackingState,
  ARSessionPose,
  ARSessionContext,
  TraitContext,
  AccessibilityContext,
  VRContext,
  PhysicsContext,
  AudioContext,
  HapticsContext,
  RaycastHit,
  TraitEvent,
  TraitEventPayload,
  TraitInstanceDelegate,
} from '../traits/TraitTypes';

export {
  autoRigHandler,
  createNativeAutoRigPlan,
  generatedMeshHandler,
} from '../traits/AutoRigTrait';
export { provenanceHandler } from '../traits/ProvenanceTrait';
export type { ProvenanceTraitConfig } from '../traits/ProvenanceTrait';
export { provenanceDensifyHandler } from '../traits/ProvenanceDensifyTrait';
export type { ProvenanceDensifyConfig } from '../traits/ProvenanceDensifyTrait';
export { evolveProgramHandler } from '../traits/EvolveProgramTrait';
export type { EvolveProgramConfig } from '../traits/EvolveProgramTrait';
export { freezeWhenHandler } from '../traits/FreezeWhenTrait';
export type { FreezeWhenConfig } from '../traits/FreezeWhenTrait';

// Reconstruction provenance primitives — the observed-vs-invented moat. Exposed
// on the public barrel so other packages (e.g. the ssja FidelityEvalContract)
// can COMPOSE the receipt + histogram rather than re-deriving them.
export {
  provenanceClassToCode,
  provenanceCodeToClass,
  provenanceHistogram,
  uniformProvenance,
  POINT_PROVENANCE_CODE,
  POINT_PROVENANCE_CLASS_BY_CODE,
  HOLOMAP_CAPTURE_DEFAULT_PROVENANCE,
} from '../reconstruction/PointProvenance';
export type { PointProvenanceClass, ProvenanceHistogram } from '../reconstruction/PointProvenance';
export {
  buildProvenanceReceipt,
  PROVENANCE_RECEIPT_VERSION,
} from '../reconstruction/ProvenanceReceipt';
export type { ProvenanceReceipt } from '../reconstruction/ProvenanceReceipt';
export { densifyByInterpolation } from '../reconstruction/densifyByInterpolation';
export type {
  DensifyMode,
  DensifyResult,
  GenerativeDensifierBackend,
} from '../reconstruction/densifyByInterpolation';
// Gated evolutionary self-improvement — the @evolve_program trait's executor backend.
export { runEvolution, makeOllamaProposer, makeOpenAICompatibleProposer, toGradedTraceRow } from '../evolution/EvolveProgramBackend';
export type {
  EvolvePolicy,
  EvolveCandidate,
  Proposer,
  Gate,
  EvolveIO,
  EvolveOutcome,
  EvolveReceipt,
  EvolveResult,
  OpenAICompatibleProposerOptions,
  EvolveTraceRecord,
  GradedTraceRow,
} from '../evolution/EvolveProgramBackend';
// The strategic seed portfolio + native gates + single-step accrual — the
// reusable core the autonomous (Jetson idle-loop) accrual calls per tick.
export { CORPUS_PORTFOLIO, parsesClean, makeSeedGate, accrueOneStep, extractStateMachine, stateMachineWellFormed, stateMachineSemanticCheck } from '../evolution/corpusPortfolio';
export type { SeedFormat, EvolveSeed, AccrueStepResult, StateMachineShape } from '../evolution/corpusPortfolio';
export type {
  AutoRigConfig,
  AutoRigPose,
  AutoRigRigType,
  AutoRigTopology,
  GeneratedMeshConfig,
  NativeAutoRigPlan,
} from '../traits/AutoRigTrait';

// Trust primitives (ADR-2026-05-14)
export * from '../trust';

// Domain simulation receipts (F.058 receipt-is-the-moat pattern)
export * from '../receipts/DomainSimulationReceipt';
export * from '../receipts/hash-policy';

// ParameterEnvelope — valid-parameter domain (H1 proof machinery, §ParameterEnvelope)
export * from '../parameter-envelope';

// PluginManifest — declarative plugin descriptor + combination primitive (H1 proof machinery)
export * from '../plugin-manifest';

// PluginKeywordRegistry — runtime-injectable .hs verb table (H2 language-extension seam)
export * from '../keyword-registry';

// Care-field primitives (D.052 universal love doctrine)
export * from '../care';

// Conversation daemon primitives (D.052 Brittney field / user daemon model)
export * from '../daemon';

// PluginSolverContract — pre/inv/post clause discipline + receipt schema registry (H2 proof machinery)
export * from '../plugin-solver-contract';

// ProofCompositionLaw — algebraic receipt composition across plugin solvers (Paper 29, H2)
export * from '../proof-composition';

// KinematicChainTrait — DH-parameter FK + damped Jacobian IK (H2)
export type {
  DHParameter,
  KinematicChainConfig,
  FKResult,
  IKRequest,
  IKResult,
} from '../traits/KinematicChainTrait';
export { dhTransform, solveFk, solveIk, kinematicChainHandler } from '../traits/KinematicChainTrait';

// ControlLoopTrait — PID + linear MPC receding-horizon control (H2)
export type {
  ControlOutput,
  PIDParams,
  PIDStepRequest,
  PIDState,
  MPCModel,
  MPCParams,
  MPCStepRequest,
  ControlLoopConfig,
} from '../traits/ControlLoopTrait';
export { stepPid, stepMpc, controlLoopHandler } from '../traits/ControlLoopTrait';

// TransactionTrait — x402 ledger: pay/transfer/stake/unstake/deposit (H2)
export type {
  TxReceipt,
  LedgerEntry,
  SpendLimits,
  TransactionConfig,
  PayRequest,
  TransferRequest,
  StakeRequest,
  UnstakeRequest,
  DepositRequest,
  TxNodeState,
} from '../traits/TransactionTrait';
export {
  debitBalance,
  stakeBalance,
  unstakeBalance,
  depositBalance,
  transactionHandler,
} from '../traits/TransactionTrait';

// SensorSamplingTrait — ring-buffer signal acquisition with noise models (H2)
export type {
  GaussianNoise,
  UniformNoise,
  QuantizedNoise,
  NoNoise,
  NoiseModel,
  SensorChannelConfig,
  SensorSamplingConfig,
  SensorReading,
  SensorWindowResult,
  SensorRecordRequest,
  SensorReadWindowRequest,
} from '../traits/SensorSamplingTrait';
export {
  boxMuller,
  applyNoise,
  recordReading,
  computeWindowStats,
  SensorRingBuffer,
  sensorSamplingHandler,
} from '../traits/SensorSamplingTrait';

// StagedMatter — provenance-preserving spatial consolidation (D.059, H2)
export type {
  DerivationEdge,
  MatterManifest,
  MatterUnit,
} from '../matter/StagedMatter';
export { consolidate, createMatterUnit } from '../matter/StagedMatter';
