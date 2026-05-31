// ═══════════════════════════════════════════════════════════════════
// HoloLand Runtime Integration
// ═══════════════════════════════════════════════════════════════════

// Lazy: @holoscript/framework, @holoscript/engine, @holoscript/mesh, and
// @holoscript/platform value symbols are deferred to first use so merely
// importing @holoscript/core does NOT eager-resolve packages that a bare
// `npm install @holoscript/core` may not pull (task_1780207572551_ax8w;
// W.667). `export type` lines are erased at build and stay static.
import { lazyPeerSymbol } from './lazy-peer';

const FW_AI = '@holoscript/framework/ai';
const ENGINE = '@holoscript/engine';
const PLATFORM = '@holoscript/platform';
const MESH = '@holoscript/mesh';

// ── AI: Behavior Tree ──────────────────────────────────────────────
export const BehaviorTree = lazyPeerSymbol(
  FW_AI,
  'BehaviorTree'
) as typeof import('@holoscript/framework/ai').BehaviorTree;
export type { BTTreeContext, BTTreeDef } from '@holoscript/framework/ai';
export const BTNode = lazyPeerSymbol(FW_AI, 'BTNode') as typeof import('@holoscript/framework/ai').BTNode;
export const SequenceNode = lazyPeerSymbol(
  FW_AI,
  'SequenceNode'
) as typeof import('@holoscript/framework/ai').SequenceNode;
export const SelectorNode = lazyPeerSymbol(
  FW_AI,
  'SelectorNode'
) as typeof import('@holoscript/framework/ai').SelectorNode;
export const ParallelNode = lazyPeerSymbol(
  FW_AI,
  'ParallelNode'
) as typeof import('@holoscript/framework/ai').ParallelNode;
export const InverterNode = lazyPeerSymbol(
  FW_AI,
  'InverterNode'
) as typeof import('@holoscript/framework/ai').InverterNode;
export const RepeaterNode = lazyPeerSymbol(
  FW_AI,
  'RepeaterNode'
) as typeof import('@holoscript/framework/ai').RepeaterNode;
export const GuardNode = lazyPeerSymbol(FW_AI, 'GuardNode') as typeof import('@holoscript/framework/ai').GuardNode;
export const ActionNode = lazyPeerSymbol(
  FW_AI,
  'ActionNode'
) as typeof import('@holoscript/framework/ai').ActionNode;
export const ConditionNode = lazyPeerSymbol(
  FW_AI,
  'ConditionNode'
) as typeof import('@holoscript/framework/ai').ConditionNode;
export const WaitNode = lazyPeerSymbol(FW_AI, 'WaitNode') as typeof import('@holoscript/framework/ai').WaitNode;
export type { BTStatus } from '@holoscript/framework/ai';
export const Blackboard = lazyPeerSymbol(
  FW_AI,
  'Blackboard'
) as typeof import('@holoscript/framework/ai').Blackboard;

// ── Dialogue ───────────────────────────────────────────────────────
export const DialogueGraph = lazyPeerSymbol(
  '@holoscript/engine/dialogue',
  'DialogueGraph'
) as typeof import('@holoscript/engine/dialogue').DialogueGraph;
export const DialogueRunner = lazyPeerSymbol(
  '@holoscript/engine/dialogue',
  'DialogueRunner'
) as typeof import('@holoscript/engine/dialogue').DialogueRunner;
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
export const CameraController = lazyPeerSymbol(
  '@holoscript/engine/camera',
  'CameraController'
) as typeof import('@holoscript/engine/camera').CameraController;
export const InventorySystem = lazyPeerSymbol(
  '@holoscript/engine/gameplay',
  'InventorySystem'
) as typeof import('@holoscript/engine/gameplay').InventorySystem;
export const TerrainSystem = lazyPeerSymbol(
  '@holoscript/engine/environment',
  'TerrainSystem'
) as typeof import('@holoscript/engine/environment').TerrainSystem;
export const LightingModel = lazyPeerSymbol(
  '@holoscript/engine/rendering',
  'LightingModel'
) as typeof import('@holoscript/engine/rendering').LightingModel;
export const ShaderGraph = lazyPeerSymbol(
  '@holoscript/engine/rendering',
  'ShaderGraph'
) as typeof import('@holoscript/engine/rendering').ShaderGraph;
export const SHADER_NODES = lazyPeerSymbol(
  '@holoscript/engine/rendering',
  'SHADER_NODES'
) as typeof import('@holoscript/engine/rendering').SHADER_NODES;
export const CombatManager = lazyPeerSymbol(
  '@holoscript/engine/combat',
  'CombatManager'
) as typeof import('@holoscript/engine/combat').CombatManager;
export const AStarPathfinder = lazyPeerSymbol(
  '@holoscript/engine/navigation',
  'AStarPathfinder'
) as typeof import('@holoscript/engine/navigation').AStarPathfinder;
export const NavMesh = lazyPeerSymbol(
  '@holoscript/engine/navigation',
  'NavMesh'
) as typeof import('@holoscript/engine/navigation').NavMesh;
export const ParticleSystem = lazyPeerSymbol(
  '@holoscript/engine/particles',
  'ParticleSystem'
) as typeof import('@holoscript/engine/particles').ParticleSystem;
export const LODManager = lazyPeerSymbol(
  '@holoscript/engine/world',
  'LODManager'
) as typeof import('@holoscript/engine/world').LODManager;
export const InputManager = lazyPeerSymbol(
  '@holoscript/engine/input',
  'InputManager'
) as typeof import('@holoscript/engine/input').InputManager;
export const CultureRuntime = lazyPeerSymbol(
  '@holoscript/engine/runtime',
  'CultureRuntime'
) as typeof import('@holoscript/engine/runtime').CultureRuntime;

export type { ActorMark, CuePoint, CinematicScene } from '../cinematic/CinematicDirector';
export { CameraRig } from '../cinematic/CameraRig';
export { SequenceTrack } from '../cinematic/SequenceTrack';

// ── Collaboration ──────────────────────────────────────────────────
// CollaborationSession migrated natively to @holoscript/mesh
export const CollaborationSession = lazyPeerSymbol(
  MESH,
  'CollaborationSession'
) as typeof import('@holoscript/mesh').CollaborationSession;
export const NetworkManager = lazyPeerSymbol(
  MESH,
  'NetworkManager'
) as typeof import('@holoscript/mesh').NetworkManager;

// ── Security / Sandbox ─────────────────────────────────────────────
// Hashing
export const sha256 = lazyPeerSymbol(PLATFORM, 'sha256') as typeof import('@holoscript/platform').sha256;
export const sha512 = lazyPeerSymbol(PLATFORM, 'sha512') as typeof import('@holoscript/platform').sha512;
export const hmacSha256 = lazyPeerSymbol(PLATFORM, 'hmacSha256') as typeof import('@holoscript/platform').hmacSha256;
export const verifyHmacSha256 = lazyPeerSymbol(
  PLATFORM,
  'verifyHmacSha256'
) as typeof import('@holoscript/platform').verifyHmacSha256;
// Encryption
export const encrypt = lazyPeerSymbol(PLATFORM, 'encrypt') as typeof import('@holoscript/platform').encrypt;
export const decrypt = lazyPeerSymbol(PLATFORM, 'decrypt') as typeof import('@holoscript/platform').decrypt;
export const generateEncryptionKey = lazyPeerSymbol(
  PLATFORM,
  'generateEncryptionKey'
) as typeof import('@holoscript/platform').generateEncryptionKey;
export const exportKey = lazyPeerSymbol(PLATFORM, 'exportKey') as typeof import('@holoscript/platform').exportKey;
export const importKey = lazyPeerSymbol(PLATFORM, 'importKey') as typeof import('@holoscript/platform').importKey;
// Random
export const randomBytes = lazyPeerSymbol(PLATFORM, 'randomBytes') as typeof import('@holoscript/platform').randomBytes;
export const randomHex = lazyPeerSymbol(PLATFORM, 'randomHex') as typeof import('@holoscript/platform').randomHex;
export const randomUUID = lazyPeerSymbol(PLATFORM, 'randomUUID') as typeof import('@holoscript/platform').randomUUID;
// Key Derivation
export const deriveKey = lazyPeerSymbol(PLATFORM, 'deriveKey') as typeof import('@holoscript/platform').deriveKey;
// Validation
export const validateWalletAddress = lazyPeerSymbol(
  PLATFORM,
  'validateWalletAddress'
) as typeof import('@holoscript/platform').validateWalletAddress;
export const validateApiKey = lazyPeerSymbol(
  PLATFORM,
  'validateApiKey'
) as typeof import('@holoscript/platform').validateApiKey;
export const sanitizeInput = lazyPeerSymbol(
  PLATFORM,
  'sanitizeInput'
) as typeof import('@holoscript/platform').sanitizeInput;
export const validateUrl = lazyPeerSymbol(PLATFORM, 'validateUrl') as typeof import('@holoscript/platform').validateUrl;
// Rate Limiting
export const checkRateLimit = lazyPeerSymbol(
  PLATFORM,
  'checkRateLimit'
) as typeof import('@holoscript/platform').checkRateLimit;
export const resetRateLimit = lazyPeerSymbol(
  PLATFORM,
  'resetRateLimit'
) as typeof import('@holoscript/platform').resetRateLimit;

export const createSandbox = lazyPeerSymbol(
  PLATFORM,
  'createSandbox'
) as typeof import('@holoscript/platform').createSandbox;
export const executeSandbox = lazyPeerSymbol(
  PLATFORM,
  'execute'
) as typeof import('@holoscript/platform').execute;
export const destroySandbox = lazyPeerSymbol(
  PLATFORM,
  'destroy'
) as typeof import('@holoscript/platform').destroy;
export type { Sandbox, SandboxState, SandboxExecutionResult } from '@holoscript/platform';
export type { SecurityPolicy } from '@holoscript/platform';
export const createDefaultPolicy = lazyPeerSymbol(
  PLATFORM,
  'createDefaultPolicy'
) as typeof import('@holoscript/platform').createDefaultPolicy;
export const createStrictPolicy = lazyPeerSymbol(
  PLATFORM,
  'createStrictPolicy'
) as typeof import('@holoscript/platform').createStrictPolicy;

// ── Package Signing (Ed25519) ────────────────────────────────────────────
export const generateKeyPair = lazyPeerSymbol(
  PLATFORM,
  'generateKeyPair'
) as typeof import('@holoscript/platform').generateKeyPair;
export const signPackage = lazyPeerSymbol(PLATFORM, 'signPackage') as typeof import('@holoscript/platform').signPackage;
export const verifySignature = lazyPeerSymbol(
  PLATFORM,
  'verifySignature'
) as typeof import('@holoscript/platform').verifySignature;
export const createPackageManifest = lazyPeerSymbol(
  PLATFORM,
  'createPackageManifest'
) as typeof import('@holoscript/platform').createPackageManifest;
export const canonicalizeManifest = lazyPeerSymbol(
  PLATFORM,
  'canonicalizeManifest'
) as typeof import('@holoscript/platform').canonicalizeManifest;
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
export const StateMachine = lazyPeerSymbol(
  FW_AI,
  'StateMachine'
) as typeof import('@holoscript/framework/ai').StateMachine;
export type { StateConfig, TransitionConfig, StateAction, GuardFn } from '@holoscript/framework/ai';
