// ═══════════════════════════════════════════════════════════════════
// HoloLand Runtime Integration
// ═══════════════════════════════════════════════════════════════════

// ── AI: Behavior Tree ──────────────────────────────────────────────
// VALUE exports (BehaviorTree, BTNode, SequenceNode, SelectorNode, ParallelNode,
// InverterNode, RepeaterNode, GuardNode, ActionNode, ConditionNode, WaitNode,
// Blackboard) moved to '@holoscript/core/runtime' (optional peer @holoscript/framework).
export type { BTTreeContext, BTTreeDef } from '@holoscript/framework/ai';
export type { BTStatus } from '@holoscript/framework/ai';

// ── Dialogue ───────────────────────────────────────────────────────
// VALUE exports (DialogueGraph, DialogueRunner) moved to '@holoscript/core/runtime'.
export type {
  GraphDialogueNode as DialogueGraphNode,
  GraphDialogueNodeType,
  DialogueState,
  RunnerDialogueNode,
  RunnerDialogueNodeType,
} from '@holoscript/engine/dialogue';

// ── ECS ────────────────────────────────────────────────────────────
export { ECSWorld } from '../traits/ECSWorldTrait';
export type {
  TransformComponent,
  VelocityComponent,
  ColliderComponent,
  RenderableComponent,
  AgentComponent,
  SystemStats,
} from '../traits/ECSWorldTrait';
export { ComponentType } from '../traits/ECSWorldTrait';

// ── Cinematic ──────────────────────────────────────────────────────
export { CinematicDirector } from '../cinematic/CinematicDirector';
// ── Camera / Gameplay / Environment / Lighting (engine re-exports) ───────────
// VALUE exports (CameraController, InventorySystem, TerrainSystem, LightingModel,
// ShaderGraph, SHADER_NODES, CombatManager, AStarPathfinder, NavMesh, ParticleSystem,
// LODManager, InputManager, CultureRuntime) moved to '@holoscript/core/runtime'
// (optional peer @holoscript/engine).

export type { ActorMark, CuePoint, CinematicScene } from '../cinematic/CinematicDirector';
export { CameraRig } from '../cinematic/CameraRig';
export { SequenceTrack } from '../cinematic/SequenceTrack';

// ── Collaboration ──────────────────────────────────────────────────
// VALUE exports (CollaborationSession, NetworkManager) moved to
// '@holoscript/core/runtime' (optional peer @holoscript/mesh).

// ── Security / Sandbox ─────────────────────────────────────────────
export {
  // Hashing
  sha256,
  sha512,
  hmacSha256,
  verifyHmacSha256,
  // Encryption
  encrypt,
  decrypt,
  generateEncryptionKey,
  exportKey,
  importKey,
  // Random
  randomBytes,
  randomHex,
  randomUUID,
  // Key Derivation
  deriveKey,
  // Validation
  validateWalletAddress,
  validateApiKey,
  sanitizeInput,
  validateUrl,
  // Rate Limiting
  checkRateLimit,
  resetRateLimit,
} from '@holoscript/platform';

export {
  createSandbox,
  execute as executeSandbox,
  destroy as destroySandbox,
} from '@holoscript/platform';
export type { Sandbox, SandboxState, SandboxExecutionResult } from '@holoscript/platform';
export type { SecurityPolicy } from '@holoscript/platform';
export { createDefaultPolicy, createStrictPolicy } from '@holoscript/platform';

// ── Package Signing (Ed25519) ────────────────────────────────────────────
export {
  generateKeyPair,
  signPackage,
  verifySignature,
  createPackageManifest,
  canonicalizeManifest,
} from '@holoscript/platform';
export type { Ed25519KeyPair, SigningManifest as PackageManifest, SignedPackage } from '@holoscript/platform';

// ── Persistence / Save ─────────────────────────────────────────────
export { SaveManager } from '../persistence/SaveManager';
export type { SaveSlot, SaveConfig } from '../persistence/SaveManager';

// ── Debug / Profiler ───────────────────────────────────────────────
// Profiling module (legacy barrel) already exports `Profiler` + `ProfileSummary` — use distinct names for the debug/scene profiler
export { Profiler as HoloScriptDebugProfiler } from '../debug/Profiler';
export type {
  ProfileScope as HoloScriptDebugProfileScope,
  FrameProfile as HoloScriptDebugFrameProfile,
  ProfileSummary as HoloScriptDebugProfileSummary,
} from '../debug/Profiler';

// ── Debug / TelemetryCollector ────────────────────────────────────
export {
  TelemetryCollector,
  getTelemetryCollector,
  resetTelemetryCollector,
} from '../debug/TelemetryCollector';

// ── v5.6 Observability ────────────────────────────────────────────
export { OTLPExporter, OTLPHttpError } from '../debug/OTLPExporter';
export type { OTLPExporterConfig, OTLPExportResult } from '../debug/OTLPExporter';
export {
  TraceContextPropagator,
  getTraceContextPropagator,
  resetTraceContextPropagator,
} from '../debug/TraceContextPropagator';
export type { PropagationHeaders, TraceStateEntry } from '../debug/TraceContextPropagator';
export {
  PrometheusMetricsRegistry,
  getPrometheusMetrics,
  resetPrometheusMetrics,
} from '../debug/PrometheusMetrics';
export type { MetricType, MetricLabels } from '../debug/PrometheusMetrics';
export {
  StructuredLogger,
  JsonArraySink,
  ChildLogger,
  getStructuredLogger,
  resetStructuredLogger,
} from '../debug/StructuredLogger';
export type {
  LogLevel,
  LogSinkType,
  LogEntry,
  LogSink,
  StructuredLoggerConfig,
} from '../debug/StructuredLogger';

// ── Trace Waterfall Renderer (v5.9) ────────────────────────────────
export { TraceWaterfallRenderer } from '../debug/TraceWaterfallRenderer';
export type {
  WaterfallRow,
  WaterfallData,
  WaterfallSummary,
  WaterfallRendererConfig,
} from '../debug/TraceWaterfallRenderer';

// ── AI / State Machine ─────────────────────────────────────────────
// VALUE export (StateMachine) moved to '@holoscript/core/runtime'
// (optional peer @holoscript/framework).
export type { StateConfig, TransitionConfig, StateAction, GuardFn } from '@holoscript/framework/ai';
