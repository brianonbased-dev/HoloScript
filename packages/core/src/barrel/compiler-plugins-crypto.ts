// ── Sprint 1: Identity & Validation ─────────────────────────────────────────
export { AgentOutputSchemaValidator } from '@holoscript/platform';

// ── Sprint 2: Compiler Extensions ───────────────────────────────────────────
export { COCOExporter } from '../compiler/COCOExporter';
export { RemotionBridge } from '../compiler/RemotionBridge';
export { CompilerBase, type BaseCompilerOptions } from '../compiler/CompilerBase';
export {
  HolobCompiler,
  type HolobCompilerOptions,
  type HolobCompileResult,
} from '../compiler/HolobCompiler';

// ── Trait System Base Types ─────────────────────────────────────────────────
export type { TraitHandler } from '../traits/TraitTypes';
export type { TraitConstraint } from '../types';
export { BUILTIN_CONSTRAINTS } from '../traits/traitConstraints';

// ── Sprint 3: Agent Inference Export ────────────────────────────────────────
export { default as AgentInferenceExportTarget } from '../compiler/AgentInferenceExportTarget';

// ── Sprint 1: Procedural Geometry Patch ─────────────────────────────────────
export * from '../compiler/ProceduralGeometry';

// ── Pillar 2: Semantic Scene Graph ──────────────────────────────────────────
export { SemanticSceneGraph } from '../compiler/SemanticSceneGraph';

// ── @draft Trait (Draft→Mesh→Simulation Pipeline) ───────────────────────────
export {
  DRAFT_TRAIT,
  DRAFT_DEFAULTS,
  DraftManager,
  type AssetMaturity,
  type DraftShape,
  type DraftConfig,
} from '../traits/DraftTrait';

// ── VR Performance Regression Monitor ───────────────────────────────────────
export {
  PerformanceRegressionMonitor,
  PERF_REGRESSION_DEFAULTS,
  type PerformanceRegressionConfig,
  type PerformanceRegressionState,
} from '../traits/PerformanceRegressionMonitor';

// ── Plugin System (Sandboxing, API, Lifecycle Management) ─────────────────
export { PluginSandbox, createPluginSandbox } from '../plugins/PluginSandbox';
export type {
  PluginSandboxOptions,
  PluginManifest as SandboxPluginManifest,
} from '../plugins/PluginSandbox';
export { PluginAPI } from '../plugins/PluginAPI';
export { PluginLoader } from '../plugins/PluginLoader';
export { ModRegistry } from '../plugins/ModRegistry';
export { HololandExtensionRegistry } from '../plugins/HololandExtensionRegistry';

// ── v5.7 Plugin Ecosystem (Sandbox Runner, Signature, Dependencies, Lifecycle) ──
export { PluginSandboxRunner, DEFAULT_CAPABILITY_BUDGET } from '../plugins/PluginSandboxRunner';
export type {
  SandboxPermission,
  CapabilityBudget,
  PluginSandboxRunnerConfig,
  SandboxTool,
  SandboxHandler,
  SandboxRunResult,
  SandboxRunnerState,
} from '../plugins/PluginSandboxRunner';

export {
  PluginSignatureVerifier,
  getPluginSignatureVerifier,
  resetPluginSignatureVerifier,
  DEFAULT_VERIFIER_CONFIG,
} from '../plugins/PluginSignatureVerifier';
export type {
  TrustedKey,
  VerificationResult,
  SignatureVerifierConfig,
} from '../plugins/PluginSignatureVerifier';

export { DependencyResolver } from '../plugins/DependencyResolver';
export type {
  PluginEntry,
  ResolutionResult,
  VersionConflict,
  MissingDependency,
} from '../plugins/DependencyResolver';

export {
  PluginLifecycleManager,
  getPluginLifecycleManager,
  resetPluginLifecycleManager,
  DEFAULT_LIFECYCLE_CONFIG,
} from '../plugins/PluginLifecycleManager';
export type {
  ManagedPlugin,
  InstallPluginOptions,
  PluginLifecycleState as ManagedPluginState,
  LifecycleManagerConfig,
} from '../plugins/PluginLifecycleManager';

// ── Post-Quantum Cryptography (Hybrid Classical+PQ) ──────────────────────
export {
  HybridCryptoProvider,
  getHybridCryptoProvider,
  resetHybridCryptoProvider,
} from '@holoscript/platform';
export type {
  HybridKeyPair,
  HybridSignature,
  HybridCryptoConfig,
} from '@holoscript/platform';

// -- Economy Module ----------------------------------------------------------
// NOTE: Economy implementations (X402Facilitator, PaymentWebhookService,
// UsageMeter, AgentBudgetEnforcer, UnifiedBudgetOptimizer,
// CreatorRevenueAggregator, SubscriptionManager) have moved to
// `@holoscript/framework/economy`. Import from there instead.
// ----------------------------------------------------------------------------

// --- Web3 Connector Protocol ---
export { MockWeb3Connector, createWeb3EventBridge } from '@holoscript/platform';
export type { Web3Connector, Web3ConnectorConfig } from '@holoscript/platform';
