/**
 * @holoscript/core
 *
 * HoloScript+ - VR language with declarative syntax, state management, and VR interactions.
 * Enhanced version of HoloScript with:
 * - VR interaction traits (@grabbable, @throwable, @hoverable, etc.)
 * - Reactive state management (@state { ... })
 * - Control flow (@for, @if directives)
 * - TypeScript companion imports
 * - Expression interpolation ${...}
 *
 * Fully backward compatible with original HoloScript syntax.
 *
 * @example
 * ```typescript
 * import { HoloScriptPlusParser, HoloScriptPlusRuntime } from '@holoscript/core';
 *
 * const parser = new HoloScriptPlusParser();
 * const result = parser.parse(`
 *   orb#myOrb {
 *     position: [0, 0, 0]
 *     @grabbable(snap_to_hand: true)
 *     @throwable(bounce: true)
 *   }
 * `);
 *
 * const runtime = new HoloScriptPlusRuntime(result.ast);
 * await runtime.mount(document.body);
 * ```
 *
 * @packageDocumentation
 */

// Import for use in utility functions
import { HoloScriptParser } from './HoloScriptParser';
import { HoloScriptRuntime } from './HoloScriptRuntime';

// Composition Parser (Tier 3 migration from Hololand — pure language-level AST traversal)
export * from './legacy-exports';
// Version is now exported from './version' (build-time injected)

// Supported Platforms
export const HOLOSCRIPT_SUPPORTED_PLATFORMS = [
  'WebXR',
  'Oculus Quest',
  'HTC Vive',
  'Valve Index',
  'Apple Vision Pro',
  'Windows Mixed Reality',
] as const;

// Voice Commands Reference
export const HOLOSCRIPT_VOICE_COMMANDS = [
  // 3D VR Commands
  'create orb [name]',
  'summon function [name]',
  'connect [from] to [to]',
  'execute [function]',
  'debug program',
  'visualize [data]',
  'gate [condition]',
  'stream [source] through [transformations]',
  // 2D UI Commands
  'create button [name]',
  'add textinput [name]',
  'create panel [name]',
  'add slider [name]',
] as const;

// Gesture Reference
export const HOLOSCRIPT_GESTURES = [
  'pinch - create object',
  'swipe - connect objects',
  'rotate - modify properties',
  'grab - select object',
  'spread - expand view',
  'fist - execute action',
] as const;

// Demo Scripts
export const HOLOSCRIPT_DEMO_SCRIPTS = {
  helloWorld: `orb greeting {
  message: "Hello, HoloScript World!"
  color: "#00ffff"
  glow: true
}

function displayGreeting() {
  show greeting
}`,

  aiAgent: `orb agentCore {
  personality: "helpful"
  capabilities: ["conversation", "problem_solving", "learning"]
  energy: 100
}

function processQuery(query: string): string {
  analyze query
  generate response
  return response
}`,

  neuralNetwork: `orb inputLayer { neurons: 784 }
orb hiddenLayer { neurons: 128 }
orb outputLayer { neurons: 10 }

connect inputLayer to hiddenLayer as "weights"
connect hiddenLayer to outputLayer as "weights"

function trainNetwork(data: array): object {
  forward_pass data
  calculate_loss
  backward_pass
  update_weights
  return metrics
}`,

  loginForm: `button loginBtn {
  text: "Login"
  x: 100
  y: 150
  width: 200
  height: 40
  onClick: handleLogin
}

textinput usernameInput {
  placeholder: "Username"
  x: 100
  y: 50
  width: 200
  height: 36
}

textinput passwordInput {
  placeholder: "Password"
  x: 100
  y: 100
  width: 200
  height: 36
}`,

  dashboard: `panel sidebar {
  x: 0
  y: 0
  width: 200
  height: 600
  backgroundColor: "#2c3e50"
}

text title {
  content: "Dashboard"
  x: 220
  y: 20
  fontSize: 24
  color: "#34495e"
}

button refreshBtn {
  text: "Refresh Data"
  x: 220
  y: 60
  onClick: refreshData
}`,
} as const;

// Utility Functions

/**
 * Create a pre-configured HoloScript environment
 */
export function createHoloScriptEnvironment() {
  return {
    parser: new HoloScriptParser(),
    runtime: new HoloScriptRuntime(),
    version: '6.0.0',
  };
}

/**
 * Check if the current environment supports VR/XR
 */
export function isHoloScriptSupported(): boolean {
  if (typeof globalThis === 'undefined') return false;
  const win = globalThis as {
    window?: {
      navigator?: { xr?: unknown; getVRDisplays?: unknown };
      webkitGetUserMedia?: unknown;
    };
  };
  if (!win.window) return false;

  return !!(
    win.window.navigator?.xr ||
    win.window.navigator?.getVRDisplays ||
    win.window.webkitGetUserMedia
  );
}

// Source Maps
export {
  SourceMapGenerator,
  SourceMapConsumer,
  combineSourceMaps,
  type SourceMap,
  type MappingSegment,
  type LineMapping,
} from './SourceMapGenerator';

// Incremental Parsing
export { IncrementalParser, createIncrementalParser } from './IncrementalParser';

// HoloScript+ Incremental Parsing
export {
  ChunkBasedIncrementalParser,
  type IncrementalParseResult,
} from './parser/IncrementalParser';
export { globalParseCache, type ParseCache } from './parser/ParseCache';

// Tree Shaking
export {
  TreeShaker,
  treeShake,
  eliminateDeadCode,
  type TreeShakeOptions,
  type TreeShakeResult,
} from './TreeShaker';

// =============================================================================
// AI Integration (Provider-Agnostic)
// =============================================================================

export {
  // Core adapter interface
  type AIAdapter,
  type GenerateResult,
  type ExplainResult,
  type OptimizeResult,
  type FixResult,
  type GenerateOptions,

  // Registry functions
  registerAIAdapter,
  getAIAdapter,
  getDefaultAIAdapter,
  setDefaultAIAdapter,
  listAIAdapters,
  unregisterAIAdapter,

  // Convenience functions
  generateHoloScript,
  explainHoloScript,
  optimizeHoloScript,
  fixHoloScript,

  // Built-in adapters
  OpenAIAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  LMStudioAdapter,
  GeminiAdapter,
  XAIAdapter,
  TogetherAdapter,
  FireworksAdapter,
  NVIDIAAdapter,

  // Semantic Search
  SemanticSearchService,
  type SearchResult as SemanticSearchResult,

  // Config types
  type OpenAIAdapterConfig,
  type AnthropicAdapterConfig,
  type OllamaAdapterConfig,
  type LMStudioAdapterConfig,
  type GeminiAdapterConfig,
  type XAIAdapterConfig,
  type TogetherAdapterConfig,
  type FireworksAdapterConfig,
  type NVIDIAAdapterConfig,

  // Factory functions
  useOpenAI,
  useAnthropic,
  useOllama,
  useLMStudio,
  useGemini,
  useXAI,
  useGrok,
  useTogether,
  useFireworks,
  useNVIDIA,
} from '@holoscript/framework/ai';

// =============================================================================
// Asset System (Hololand Integration)
// =============================================================================

export * from './assets';

// =============================================================================
// Semantic Annotation System (Hololand Integration)
// =============================================================================

export * from './semantics';

// =============================================================================
// Hololand Consumer Integration (Legacy Namespace)
// =============================================================================

export * as hololand from './hololand';

// =============================================================================
// Semantic Diff Engine (Sprint 2 - Visual Diff Tools)
// =============================================================================

export {
  SemanticDiffEngine,
  semanticDiff,
  formatDiffResult,
  diffToJSON,
  type ChangeType as DiffChangeType,
  type DiffChange,
  type SemanticDiffResult,
  type DiffOptions,
} from './diff';

// =============================================================================
// W3C Web of Things Integration (Sprint 3 - Priority 1)
// =============================================================================

export {
  ThingDescriptionGenerator,
  generateThingDescription,
  generateAllThingDescriptions,
  serializeThingDescription,
  validateThingDescription,
  type ThingDescription,
  type PropertyAffordance,
  type ActionAffordance,
  type EventAffordance,
  type DataSchema,
  type Form,
  type Link,
  type SecurityScheme,
  type WoTThingConfig,
  type ThingDescriptionGeneratorOptions,
} from '@holoscript/platform';

// WoT Thing Trait Handler
export {
  wotThingHandler,
  hasWoTThingTrait,
  getWoTThingState,
  getCachedThingDescription,
  invalidateThingDescription,
  type WoTThingConfig as WoTThingTraitConfig,
  type WoTThingState,
} from './traits/WoTThingTrait';

// =============================================================================
// MQTT Protocol Bindings (Sprint 3 - Priority 2)
// =============================================================================

// MQTT Source Trait Handler
export {
  mqttSourceHandler,
  hasMQTTSourceTrait,
  getMQTTSourceState,
  getMQTTSourceClient,
  isMQTTSourceConnected,
  type MQTTSourceConfig,
  type MQTTSourceState,
} from './traits/MQTTSourceTrait';

// MQTT Sink Trait Handler
export {
  mqttSinkHandler,
  hasMQTTSinkTrait,
  getMQTTSinkState,
  getMQTTSinkClient,
  isMQTTSinkConnected,
  publishToMQTTSink,
  type MQTTSinkConfig,
  type MQTTSinkState,
} from './traits/MQTTSinkTrait';

// =============================================================================
// Runtime Profiles (Sprint 3 - Priority 3)
// =============================================================================

// =============================================================================
// Real-time Sync Protocol (Sprint 3 - Priority 7)
// =============================================================================

export {
  // Protocol
  SyncProtocol,
  createSyncProtocol,
  createLocalSync,
  // Delta Encoding
  DeltaEncoder,
  // Interest Management
  InterestManager,
  // Transports
  type Transport,
  WebSocketTransport,
  WebRTCTransport,
  LocalBroadcastTransport,
  // Types
  type TransportType,
  type SerializationType,
  type ConflictStrategy,
  type SyncProtocolConfig,
  type SyncOptimizations,
  type SyncState,
  type SyncDelta,
  type DeltaChange,
  type SyncMessage,
  type PresenceInfo,
  type InterestArea,
  type SyncStats,
  type SyncEventType,
  type SyncEventCallback,
} from '@holoscript/mesh';

// Local Network Adapter (existing)
export {
  LocalNetworkAdapter,
  createLocalNetworkAdapter,
  type NetworkUpdate,
  type UpdateCallback,
} from '@holoscript/mesh';

// =============================================================================
// Package Certification (Sprint 9-10)
// =============================================================================

export {
  // Certification Checker
  CertificationChecker,
  createCertificationChecker,
  DEFAULT_CERTIFICATION_CONFIG,
  type CertificationConfig,
  type CertificationResult,
  type CheckResult,
  type CheckCategory,
  type CheckStatus,
  type PackageManifest as CertificationPackageManifest,
  type PackageFiles as CertificationPackageFiles,
  // Badge Generator
  BadgeGenerator,
  createBadgeGenerator,
  defaultBadgeGenerator,
  type BadgeFormat,
  type BadgeStyle,
  type BadgeOptions,
  type Certificate,
} from '@holoscript/platform';

// =============================================================================
// Workspace Management (Sprint 8)
// =============================================================================

export {
  WorkspaceManager,
  createWorkspaceManager,
  type WorkspaceRole,
  type WorkspaceMember,
  type WorkspaceSettings,
  type Workspace,
  type ActivityType as WorkspaceActivityType,
  type ActivityEntry,
  type WorkspaceSecret,
} from '@holoscript/platform';

// =============================================================================
// Agents Module (v3.1 Agentic Choreography)
// =============================================================================

export * from '@holoscript/framework/agents';

// =============================================================================
// Choreography Module (v3.1 Agentic Choreography)
// =============================================================================

export * from '@holoscript/engine/choreography';

// =============================================================================
// Negotiation Module (v3.1 Agentic Choreography)
// =============================================================================

export * from '@holoscript/framework/negotiation';

// =============================================================================
// Swarm Module � MOVED to @holoscript/framework (v6.0)
// All swarm primitives (ACOEngine, LeaderElection, SwarmManager,
// SwarmCoordinator, PSOEngine, CollectiveIntelligence, VotingRound,
// ContributionSynthesizer, SwarmMembership, QuorumPolicy) now live in
// `@holoscript/framework`. Import from there directly.
// =============================================================================
// =============================================================================
// Recovery Module (v3.2 Self-Healing Infrastructure)
// =============================================================================

export * from './recovery';

// =============================================================================
// Render Module (v3.3 WebGPU Rendering)
// =============================================================================

// =============================================================================
// Shader Module (v3.3 Visual Shader Graph)
// =============================================================================

export * from '@holoscript/engine/shader';

// =============================================================================
// Post-Processing Module (v3.3 Screen-Space Effects)
// =============================================================================

export * from '@holoscript/engine/postfx';

// =============================================================================
// Physics Module (v3.3 Rigid Body Dynamics)
// =============================================================================

// Explicit re-exports to resolve conflicts between physics and audio modules
// (both define IVector3 and zeroVector — physics is canonical source)

// =============================================================================
// Audio Module (v3.3 Spatial Audio & Sequencing)
// =============================================================================

// =============================================================================
// Network Module (v3.3 State Synchronization)
// =============================================================================

export * as network from '@holoscript/mesh';

// =============================================================================
// WASM Parser Bridge (v3.3 Performance Optimization)
// =============================================================================

export * as wasm from './wasm';
export { WasmModuleCache, type CachedModule, type WasmModuleCacheConfig } from './wasm';
export { WasmParserBridge, type ParseResult, type WasmParserConfig } from './wasm';

// =============================================================================
// High-Frequency Sync (v3.3 60Hz Spatial Optimization)
// =============================================================================

export * as sync from '@holoscript/mesh';

// =============================================================================
// LOD Module — MOVED to @holoscript/engine (A.011 migration)
// =============================================================================

// =============================================================================
// Trait Visual System (Trait-to-PBR Mapping)
// =============================================================================

export {
  TraitVisualRegistry,
  registerAllPresets,
  type TraitVisualConfig,
  type R3FMaterialProps,
  type VisualLayer,
  VISUAL_LAYER_PRIORITY,
} from './traits/visual/index';

export { TraitCompositor } from './traits/visual/TraitCompositor';
export { COMPOSITION_RULES } from './traits/visual/composition-rules';

// =============================================================================
// glTF/GLB Export Pipeline (Growth Vector 1 — Universal 3D Interop)
// =============================================================================

export {
  GLTFPipeline,
  createGLTFPipeline,
  generateScaleTexture,
  generateScaleNormalMap,
  type GLTFPipelineOptions,
  type GLTFExportResult,
  type GLTFExportStats,
} from './compiler/GLTFPipeline';

// SceneGraph IR + GLTFExporter (for advanced pipelines)
export { GLTFExporter } from './export/gltf/GLTFExporter';
export type { IGLTFExportOptions, IGLTFExportResult } from './export/gltf/GLTFTypes';
export type {
  ISceneGraph,
  ISceneNode,
  IMaterial as ISceneGraphMaterial,
} from './export/SceneGraph';
export { createEmptySceneGraph, createEmptyNode, createDefaultMaterial } from './export/SceneGraph';

// USDZ Pipeline
export { USDZPipeline, type USDZPipelineOptions } from './compiler/USDZPipeline';

// Semantic Caching System
export {
  type MessageHandler,
  type BroadcastHandler,
  type ChannelEventHandler,
  type ChannelEventType,
  type ChannelEventBase,
  type ChannelLifecycleEvent,
  type ChannelMembershipEvent,
  type MessageEvent,
  type ChannelEvent,
  type ChannelSubscription,
  type BroadcastSubscription,
  generateMessageId,
  generateChannelId,
  isMessageExpired,
  validateMessageSchema,
} from '@holoscript/mesh';
export { AgentMessaging } from '@holoscript/mesh';
export {
  ProtocolBridgeRegistry,
  type IAgentProtocolBridge,
  type GenericAgentMessage,
} from '@holoscript/mesh';

// =============================================================================
// Audit Logging & Compliance (Sprint 9 - Priority 6)
// =============================================================================

export {
  AuditLogger,
  InMemoryAuditStorage,
  AuditQuery,
  ComplianceReporter,
  type AuditEvent,
  type AuditEventInput,
  type AuditQueryFilter,
  type AuditStorageBackend,
  type DateRange,
  type ReportSection,
  type ReportItem,
  type ReportSummary,
  type ComplianceReport,
} from './audit';

// =============================================================================
// IPFS Storage (NFT Asset Uploads)
// =============================================================================

export {
  IPFSService,
  PinataProvider,
  NFTStorageProvider,
  InfuraProvider,
  IPFSUploadError,
  IPFSPinError,
  FileSizeExceededError,
  type IPFSProvider,
  type IPFSServiceOptions,
  type FallbackProvider,
  type IPFSFile,
  type UploadProgress,
  type UploadOptions,
  type UploadResult,
  type PinStatus,
  type PinInfo,
  type IIPFSProvider,
} from './storage';

// =============================================================================
// V43 Trait Handlers (Tier 2: AI Generation & visionOS)
// =============================================================================

export {
  aiInpaintingHandler,
  type AiInpaintingConfig,
  type InpaintModel,
  type MaskSource,
  type BlendMode,
} from './traits/AiInpaintingTrait';

export {
  aiTextureGenHandler,
  type AiTextureGenConfig,
  type TextureStyle,
  type TextureResolution,
  type MaterialType as AiTextureMaterialType,
} from './traits/AiTextureGenTrait';

export {
  controlNetHandler,
  type ControlNetConfig,
  type ControlNetModel,
} from './traits/ControlNetTrait';

export {
  diffusionRealtimeHandler,
  type DiffusionRealtimeConfig,
  type DiffusionBackend,
  type StreamMode,
} from './traits/DiffusionRealtimeTrait';

export {
  sharePlayHandler,
  type SharePlayConfig,
  type SharePlayState,
  type SyncPolicy,
} from './traits/SharePlayTrait';

export {
  spatialPersonaHandler,
  type SpatialPersonaConfig,
  type PersonaStyle,
  type PersonaVisibility,
} from './traits/SpatialPersonaTrait';

// =============================================================================
// GraphQL Circuit Breaker (v3.44.0 - Frontend Reliability)
// =============================================================================

export {
  CircuitBreaker as GraphQLCircuitBreaker,
  CircuitBreakerManager as GraphQLCircuitBreakerManager,
  CircuitState as GraphQLCircuitState,
  type CircuitBreakerConfig as GraphQLCircuitBreakerConfig,
  type CircuitMetrics as GraphQLCircuitMetrics,
  type RequestResult as GraphQLRequestResult,
} from './CircuitBreaker';

export {
  GraphQLCircuitBreakerClient,
  FallbackDataProvider,
  createApolloCircuitBreakerLink,
  createUrqlCircuitBreakerExchange,
  type GraphQLClientOptions,
  type GraphQLRequest,
  type GraphQLResponse,
  type CircuitBreakerStats as GraphQLCircuitStats,
} from './GraphQLCircuitBreakerClient';

export {
  CircuitBreakerMetrics as GraphQLMetrics,
  MetricsMonitor as GraphQLMetricsMonitor,
  type MetricsSnapshot as GraphQLMetricsSnapshot,
  type CircuitMetricsReport as GraphQLCircuitMetricsReport,
  type AggregateMetrics as GraphQLAggregateMetrics,
  type HealthScore as GraphQLHealthScore,
  type MetricsExportOptions as GraphQLMetricsExportOptions,
} from './CircuitBreakerMetrics';

// DegradedModeBanner requires React — do NOT export from core barrel.
// Import directly from '@holoscript/core/DegradedModeBanner' if needed in React apps.
export type { DegradedModeBannerProps } from './DegradedModeBanner';

// =============================================================================
// GPU Codecs - Gaussian Splat Codec Abstraction Layer (W.038)
// =============================================================================
// Codec-agnostic interface for encoding, decoding, and streaming Gaussian splats.
// Supports KHR/SPZ (Niantic), glTF KHR_gaussian_splatting, and MPEG GSC (stub).

export {
  // Registry (primary entry point for consumers)
  GaussianCodecRegistry,
  createDefaultCodecRegistry,
  getGlobalCodecRegistry,
  resetGlobalCodecRegistry,

  // Codec implementations
  SpzCodec,
  GltfGaussianSplatCodec,
  MpegGscCodec,

  // Abstract base class & errors
  AbstractGaussianCodec,
  GaussianCodecError,
  CodecNotSupportedError,
  CodecDecodeError,
  CodecEncodeError,
  CodecMemoryError,
  CodecDecompressError,
} from '@holoscript/engine/gpu';

export type {
  // Core data types
  GaussianSplatData,
  EncodedGaussianData,
  CodecMetadata,
  CodecResult,

  // Codec identification
  GaussianCodecId,
  GaussianFileExtension,
  GaussianCodecCapabilities,

  // Options
  GaussianEncodeOptions,
  GaussianDecodeOptions,
  GaussianStreamDecodeOptions,

  // Streaming
  GaussianStreamChunk,
  StreamProgress,
  StreamProgressCallback,

  // Interface
  IGaussianCodec,

  // Registry types
  CodecDetectOptions,
  RegisteredCodec,
} from '@holoscript/engine/gpu';

// ═══════════════════════════════════════════════════════════════════
// Compile-Time Safety System (Sprint CXXIV - 5-Layer Safety Stack)
// ═══════════════════════════════════════════════════════════════════

export { EffectRow } from './types/effects';
export type {
  VREffect,
  EffectCategory,
  EffectViolation,
  EffectViolationSeverity,
  EffectDeclaration,
} from './types/effects';

export {
  TRAIT_EFFECTS,
  inferFromTraits,
  inferFromBuiltins,
  knownTraits,
  knownBuiltins,
} from './compiler/safety/EffectInference';
export type { InferredEffects } from './compiler/safety/EffectInference';

export {
  EffectChecker,
  createEffectChecker,
  isSafeTraitSet,
  dangerLevel,
} from './compiler/safety/EffectChecker';
export type {
  EffectCheckerConfig,
  EffectCheckResult,
  ModuleEffectCheckResult,
  EffectASTNode,
} from './compiler/safety/EffectChecker';

export {
  ResourceBudgetAnalyzer,
  PLATFORM_BUDGETS,
  TRAIT_RESOURCE_COSTS,
} from './compiler/safety/ResourceBudgetAnalyzer';
export type {
  ResourceCategory,
  BudgetAnalysisResult,
  BudgetDiagnostic,
  ResourceUsageNode,
} from './compiler/safety/ResourceBudgetAnalyzer';

export {
  checkCapabilities,
  expandCapabilities,
  deriveRequirements,
  TRUST_LEVEL_CAPABILITIES,
  EFFECT_TO_CAPABILITY,
  CAPABILITY_HIERARCHY,
} from './compiler/safety/CapabilityTypes';
export type { CapabilityScope, CapabilityRequirement } from './compiler/safety/CapabilityTypes';

export { runSafetyPass, quickSafetyCheck } from './compiler/safety/CompilerSafetyPass';
export type { SafetyPassResult, SafetyPassConfig } from './compiler/safety/CompilerSafetyPass';

export {
  buildSafetyReport,
  formatReport,
  generateCertificate,
} from './compiler/safety/SafetyReport';
export type { SafetyReport, SafetyVerdict } from './compiler/safety/SafetyReport';

export type { EffectCertificate, EffectTrustLevel } from './types/effects';

// Linear Resource Types (Layer 6 — Move-inspired ownership)
export {
  LinearTypeChecker,
  BUILTIN_RESOURCES,
  TRAIT_RESOURCE_MAP,
} from './compiler/safety/LinearTypeChecker';
export type { LinearCheckerConfig } from './compiler/safety/LinearTypeChecker';
export type {
  ResourceType,
  ResourceAbility,
  OwnershipState,
  LinearViolation,
  LinearCheckResult,
} from './types/linear';

// ═══════════════════════════════════════════════════════════════════
// @platform() Conditional Compilation (Cross-Reality)
// ═══════════════════════════════════════════════════════════════════

export {
  PLATFORM_CATEGORIES as XR_PLATFORM_CATEGORIES,
  ALL_PLATFORMS as XR_ALL_PLATFORMS,
  PLATFORM_CAPABILITIES as XR_PLATFORM_CAPABILITIES,
  platformCategory,
  embodimentFor,
  agentBudgetFor,
  hasCapability,
  resolvePlatforms,
  matchesPlatform,
  selectBlock,
  DEFAULT_EMBODIMENT,
} from './compiler/platform/PlatformConditional';
export type {
  PlatformTarget as XRPlatformTarget,
  PlatformCategory as XRPlatformCategory,
  PlatformCapabilities as XRPlatformCapabilities,
  EmbodimentType,
  PlatformCondition,
  PlatformBlock,
} from './compiler/platform/PlatformConditional';

// Canonical (non-aliased) re-exports for engine backward compatibility (A.011)
export {
  PLATFORM_CAPABILITIES,
  PLATFORM_CATEGORIES,
  ALL_PLATFORMS,
} from './compiler/platform/PlatformConditional';
export type { PlatformTarget, PlatformCapabilities } from './compiler/platform/PlatformConditional';

// @platform() Compiler Mixin (Composition-level filtering)
export {
  PlatformConditionalCompilerMixin,
  matchesPlatformConstraint,
  createPlatformTarget,
} from './compiler/PlatformConditionalCompilerMixin';
export type { CompilePlatformTarget } from './compiler/PlatformConditionalCompilerMixin';

// @platform() Annotation Compiler (Block-level dead-code elimination)
export {
  PlatformConditionalCompiler,
  createPlatformConditionalCompiler,
} from './compiler/platform/PlatformConditionalCompiler';
export type {
  PlatformBlock as PlatformAnnotationBlock,
  PlatformConditionalResult,
} from './compiler/platform/PlatformConditionalCompiler';

// Modality Selector (Pillar 1: Transliteration, not degradation)
export {
  selectModality,
  selectModalityForAll,
  bestCategoryForTraits,
} from './compiler/platform/ModalitySelector';
export type {
  ModalitySelection,
  ModalitySelectorOptions,
} from './compiler/platform/ModalitySelector';

// ═══════════════════════════════════════════════════════════════════
// Culture Traits (Emergent Agent Culture)
// ═══════════════════════════════════════════════════════════════════

export {
  BUILTIN_NORMS,
  getBuiltinNorm,
  normsByCategory,
  criticalMassForChange,
} from './traits/CultureTraits';
export type {
  CulturalNorm,
  NormCategory,
  NormEnforcement,
  NormScope,
} from './traits/CultureTraits';

export { CulturalMemory } from '@holoscript/framework/agents';
export type { EpisodicMemory, StigmergicTrace, SemanticSOP } from '@holoscript/framework/agents';

export { NormEngine } from '@holoscript/framework/agents';
export type { NormViolation, NormProposal } from '@holoscript/framework/agents';

// ═══════════════════════════════════════════════════════════════════
// Cross-Reality Handoff + Authenticated CRDTs
// ═══════════════════════════════════════════════════════════════════

export {
  negotiateHandoff,
  createMVCPayload,
  estimatePayloadSize,
  validatePayloadBudget,
} from '@holoscript/framework/agents';
export type {
  MVCPayload,
  DecisionEntry,
  TaskState as AgentTaskState,
  UserPreferences,
  SpatialContext,
  EvidenceEntry,
  HandoffNegotiation,
} from '@holoscript/framework/agents';

export {
  signOperation,
  verifyOperation,
  LWWRegister,
  GCounter,
  ORSet,
  createAgentState,
  setRegister,
  getRegister,
  incrementCounter,
  getCounter,
  mergeStates,
} from '@holoscript/framework/agents';
export type { DID, SignedOperation, AuthenticatedAgentState } from '@holoscript/framework/agents';

// Cross-Reality Trait Registry (Compile-time cross-reality trait declarations)
export {
  CrossRealityTraitRegistry,
  getCrossRealityTraitRegistry,
  resetCrossRealityTraitRegistry,
  createCrossRealityTraitRegistry,
  CATEGORY_DEFAULT_EMBODIMENT,
  PLATFORM_EMBODIMENT_OVERRIDES,
  HANDOFF_PATH_RULES,
  MVC_BUDGET_CONSTRAINTS,
} from './compiler/platform/CrossRealityTraitRegistry';
export type {
  CrossRealityTraitCategory,
  CrossRealityTrait,
  CompileTimeEmbodiment,
  HandoffPathRule,
  MVCBudgetConstraint,
} from './compiler/platform/CrossRealityTraitRegistry';

// ═══════════════════════════════════════════════════════════════════
// Marketplace Pipeline
// ═══════════════════════════════════════════════════════════════════

export {
  createSubmission,
  verifySubmission,
  publishSubmission,
  submissionSummary,
} from '@holoscript/platform';
export type {
  MarketplacePackage,
  MarketplaceSubmission as MarketplaceSubmissionType,
  PackageMetadata as MarketplacePackageMetadata,
  Publisher,
  ContentCategory,
  SemanticVersion,
  SubmissionStatus,
  SubmissionConfig,
} from '@holoscript/platform';

export { MarketplaceRegistry } from '@holoscript/platform';
export type {
  PackageListing,
  SearchFilters as MarketplaceSearchFilters,
  SearchResult as MarketplaceSearchResult,
  InstallManifest,
} from '@holoscript/platform';

// ═══════════════════════════════════════════════════════════════════
// HoloLand Runtime Integration
// ═══════════════════════════════════════════════════════════════════

// ── AI: Behavior Tree ──────────────────────────────────────────────
export { BehaviorTree } from '@holoscript/framework/ai';
export type { BTTreeContext, BTTreeDef } from '@holoscript/framework/ai';
export {
  BTNode,
  SequenceNode,
  SelectorNode,
  ParallelNode,
  InverterNode,
  RepeaterNode,
  GuardNode,
  ActionNode,
  ConditionNode,
  WaitNode,
} from '@holoscript/framework/ai';
export type { BTStatus } from '@holoscript/framework/ai';
export { Blackboard } from '@holoscript/framework/ai';

// ── Dialogue ───────────────────────────────────────────────────────
export type {
  GraphDialogueNode as DialogueGraphNode,
  GraphDialogueNodeType,
  DialogueState,
  RunnerDialogueNode,
  RunnerDialogueNodeType,
} from '@holoscript/engine/dialogue';

// ── ECS ────────────────────────────────────────────────────────────
export { ECSWorld } from './traits/ECSWorldTrait';
export type {
  TransformComponent,
  VelocityComponent,
  ColliderComponent,
  RenderableComponent,
  AgentComponent,
  SystemStats,
} from './traits/ECSWorldTrait';
export { ComponentType } from './traits/ECSWorldTrait';

// ── Animation Engine ───────────────────────────────────────────────
// Engine Subsystem Shims (A.011 migration) � consolidated wildcard re-exports.
// LOD moved to @holoscript/engine (A.011 migration).
// Duplicate explicit re-exports for AudioEngine, ShaderGraph, LightingModel removed.

// ── Cinematic ──────────────────────────────────────────────────────
export { CinematicDirector } from './cinematic/CinematicDirector';
export type { ActorMark, CuePoint, CinematicScene } from './cinematic/CinematicDirector';
export { CameraRig } from './cinematic/CameraRig';
export { SequenceTrack } from './cinematic/SequenceTrack';

// ── Collaboration ──────────────────────────────────────────────────
export { CollaborationSession } from '@holoscript/mesh';
export type {
  SessionPeer,
  SessionConfig,
  SessionStats,
  SessionState,
} from '@holoscript/mesh';

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
export type { Ed25519KeyPair, PackageManifest, SignedPackage } from '@holoscript/platform';

// ── Persistence / Save ─────────────────────────────────────────────
export { SaveManager } from './persistence/SaveManager';
export type { SaveSlot, SaveConfig } from './persistence/SaveManager';

// ── Debug / Profiler ───────────────────────────────────────────────
export { Profiler } from './debug/Profiler';
export type { ProfileScope, FrameProfile, ProfileSummary } from './debug/Profiler';

// ── Debug / TelemetryCollector ────────────────────────────────────
export {
  TelemetryCollector,
  getTelemetryCollector,
  resetTelemetryCollector,
} from './debug/TelemetryCollector';

// ── v5.6 Observability ────────────────────────────────────────────
export { OTLPExporter, OTLPHttpError } from './debug/OTLPExporter';
export type { OTLPExporterConfig, OTLPExportResult } from './debug/OTLPExporter';
export {
  TraceContextPropagator,
  getTraceContextPropagator,
  resetTraceContextPropagator,
} from './debug/TraceContextPropagator';
export type { PropagationHeaders, TraceStateEntry } from './debug/TraceContextPropagator';
export {
  PrometheusMetricsRegistry,
  getPrometheusMetrics,
  resetPrometheusMetrics,
} from './debug/PrometheusMetrics';
export type { MetricType, MetricLabels } from './debug/PrometheusMetrics';
export {
  StructuredLogger,
  JsonArraySink,
  ChildLogger,
  getStructuredLogger,
  resetStructuredLogger,
} from './debug/StructuredLogger';
export type {
  LogLevel,
  LogSinkType,
  LogEntry,
  LogSink,
  StructuredLoggerConfig,
} from './debug/StructuredLogger';

// ── Trace Waterfall Renderer (v5.9) ────────────────────────────────
export { TraceWaterfallRenderer } from './debug/TraceWaterfallRenderer';
export type {
  WaterfallRow,
  WaterfallData,
  WaterfallSummary,
  WaterfallRendererConfig,
} from './debug/TraceWaterfallRenderer';

// ── LOD ── MOVED to @holoscript/engine (A.011) ──────────────────────

// ── AI / State Machine ─────────────────────────────────────────────
export { StateMachine } from '@holoscript/framework/ai';
export type { StateConfig, TransitionConfig, StateAction, GuardFn } from '@holoscript/framework/ai';

// ── Input ──────────────────────────────────────────────────────────

// ── Network ────────────────────────────────────────────────────────
export { NetworkManager } from '@holoscript/mesh';
export type { NetworkMessage, PeerInfo, MessageType } from '@holoscript/mesh';

// ── Animation Timeline ─────────────────────────────────────────────

// ── Scene Manager ──────────────────────────────────────────────────

// ── Asset Registry ─────────────────────────────────────────────────
// AssetRegistry already exported via `export * from './assets'` above

// =============================================================================
// Material Parser (migrated from Hololand renderer)
// =============================================================================

export { HoloScriptMaterialParser } from './parser/HoloScriptMaterialParser';
export type {
  ASTNode as MaterialASTNode,
  CompositionMaterialNode,
} from './parser/HoloScriptMaterialParser';

export type {
  MaterialDefinition,
  HoloMaterialType,
  TextureMapDef,
  ShaderPassDef,
} from './parser/MaterialTypes';

// =============================================================================
// Compiler Bridge (migrated from Hololand ai-bridge)
// =============================================================================

export {
  CompilerBridge,
  getCompilerBridge,
  type CompilationResult,
} from './compiler/CompilerBridge';

// =============================================================================
// HoloScript I/O — Core Language Serialization (migrated from Hololand builder)
// =============================================================================

export {
  initHoloScriptParser,
  parseWithCoreParser,
  expressionToValue,
  programToInternalAST,
  extractWorldSettings,
  orbToASTNode,
  parseHoloScriptSimplified,
  parseProperties,
  parseValue,
  escapeHoloString,
  formatHoloValue,
} from './io/HoloScriptIO';

export type {
  CoreParseResult,
  CoreProgram,
  CoreDeclaration,
  CoreStatement,
  CoreWorldDeclaration,
  CoreOrbDeclaration,
  CoreOrbProperty,
  CoreExpression,
  HoloScriptAST,
  HoloScriptASTNode,
  HoloScriptASTLogic,
  HoloScriptExportOptions,
  HoloScriptImportOptions,
  HoloScriptParseResult,
  HoloScriptError,
} from './io/HoloScriptIO';

// =============================================================================
// HSPlus Validator (migrated from Hololand creator-tools)
// =============================================================================

export { validateHSPlus } from './validation/HSPlusValidator';
export type {
  ParserValidationError,
  DeviceOptimizationContext,
  CodeGenerationOptions,
  ParserRegistrationResult,
  HSPlusValidationResult,
} from './validation/HSPlusValidator';

// =============================================================================
// HS Knowledge Parser (migrated from Hololand brittney-service)
// =============================================================================

export {
  parseMeta,
  parseKnowledge,
  parsePrompts,
  parseServerRoutes,
} from './parser/HSKnowledgeParser';

export type {
  HSMeta,
  HSKnowledgeChunk,
  HSPrompt,
  HSRoute,
  HSProvider,
  HSParsedFile,
  HSKnowledgeFile,
  HSPromptFile,
  HSServerFile,
} from './parser/HSKnowledgeParser';

// ── Pipeline Parser (.hs data pipelines) ────────────────────────────────────
export { parsePipeline, isPipelineSource } from './parser/PipelineParser';

export type {
  Pipeline,
  PipelineParseResult,
  PipelineStep,
  PipelineSource,
  PipelineTransform,
  PipelineFilter,
  PipelineValidate,
  PipelineMerge,
  PipelineBranch,
  PipelineSink,
  FieldMapping,
  BranchRoute,
} from './parser/PipelineParser';

export {
  compilePipelineSource,
  compilePipelineToNode,
  compilePipelineToPython,
  compilePipelineSourceToNode,
  compilePipelineSourceToPython,
} from './compiler/PipelineNodeCompiler';
export type {
  PipelineCompileTarget,
  PipelineCompilerOptions,
  PipelineNodeCompilerOptions,
  PipelinePythonCompilerOptions,
} from './compiler/PipelineNodeCompiler';

// ── NextJS Compiler (.holo → Next.js App Router pages) ─────────────────────
export { compileToNextJS, compileAllToNextJS } from './compiler/NextJSCompiler';

export type { NextJSCompilerOptions, NextJSCompileResult } from './compiler/NextJSCompiler';

// =============================================================================
// Trait Runtime Integration (migrated from Hololand platform-core)
// =============================================================================

export type {
  PhysicsProvider,
  AudioProvider,
  HapticsProvider,
  AccessibilityProvider,
  VRProvider,
  NetworkProvider,
  RendererProvider,
  TraitContextFactoryConfig,
} from '@holoscript/engine/runtime/TraitContextFactory';

// Mathematical utilities
export {
  calculateAverage,
  calculateSuccessRate,
  calculateStandardDeviation,
  calculateMedian,
} from './utils/math';

// ── Headless Runtime (CLI & Server-Side Execution) ──────────────────────────

// ── Error Recovery (Parser Error-Handling & Suggestions) ────────────────────
export {
  ErrorRecovery,
  HOLOSCHEMA_KEYWORDS,
  HOLOSCHEMA_GEOMETRIES,
  HOLOSCHEMA_PROPERTIES,
} from './parser/ErrorRecovery';

// ── Stdlib (General-Purpose I/O Action Handlers for BehaviorTree) ───────────
export {
  createStdlibActions,
  registerStdlib,
  DEFAULT_STDLIB_POLICY,
  resolveRepoRelativePath,
  isPathAllowed,
  parseHostFromUrl,
  truncateText,
  toStringArray,
} from './stdlib';
export type { StdlibPolicy, StdlibOptions } from './stdlib';

export type {
  DepthBackend,
  DepthEstimationConfig,
  DepthResult,
  DepthSequenceConfig,
  GIFFrame,
  GIFDecomposerConfig,
  QuiltConfig,
  QuiltTile,
  QuiltCompilationResult,
  MVHEVCConfig,
  MVHEVCStereoView,
  MVHEVCCompilationResult,
  WebCodecsDepthConfig,
  WebCodecsDepthStats,
} from '@holoscript/engine/hologram';

// ── @script_test Trait (Headless Unit Testing for .hs Logic) ────────────────
export {
  ScriptTestRunner,
  SCRIPT_TEST_TRAIT,
  type ScriptTestResult,
  type ScriptTestBlock,
  type ScriptTestRunnerOptions,
} from './traits/ScriptTestTrait';

export {
  CompositionTestRunner,
  testHandler,
  TEST_TRAIT,
  type CompositionTestConfig,
} from './traits/TestTrait';

// ── Python/JS Interop Binding Generator ─────────────────────────────────────
export {
  InteropBindingGenerator,
  type BindingExport,
  type BindingParameter,
  type GeneratedBinding,
} from './interop/InteropBindingGenerator';

// ── Interoperability (Module Resolution, Async, Error Boundaries) ───────────
export {
  ModuleResolver,
  ExportImportHandler,
  AsyncFunctionHandler,
  ErrorBoundary,
  TypeScriptTypeLoader,
  InteropContext,
} from './interop/Interoperability';

// ── MCP Circuit Breaker (Resilient MCP Tool Calls) ──────────────────────────
export {
  MCPCircuitBreaker,
  getMCPCircuitBreaker,
  type MCPToolCallOptions,
  type MCPToolResult,
} from './mcp/MCPCircuitBreaker';

// ── Resilience Patterns (Circuit Breaker, Retry, Timeout) ───────────────────
export {
  CircuitBreaker as ResilienceCircuitBreaker,
  CircuitBreakerState,
  retryWithBackoff,
  withTimeout,
} from './resilience/ResiliencePatterns';

// ── @absorb Trait (Reverse-Mode: Legacy → .hsplus) ──────────────────────────
export {
  AbsorbProcessor,
  ABSORB_TRAIT,
  type AbsorbSource,
  type AbsorbResult,
  type AbsorbedFunction,
  type AbsorbedClass,
  type AbsorbedImport,
} from './traits/AbsorbTrait';

// ── @hot_reload Trait (Live-Reload .hs Files on Disk Change) ────────────────
export {
  HotReloadWatcher,
  HOT_RELOAD_TRAIT,
  type HotReloadConfig,
  type HotReloadEvent,
  type HotReloadCallback,
} from './traits/HotReloadTrait';

// ── Sprint 1: Identity & Validation ─────────────────────────────────────────
export { AgentOutputSchemaValidator } from '@holoscript/platform';

// ── Sprint 2: Compiler Extensions ───────────────────────────────────────────
export { COCOExporter } from './compiler/COCOExporter';
export { RemotionBridge } from './compiler/RemotionBridge';
export { CompilerBase, type BaseCompilerOptions } from './compiler/CompilerBase';
export {
  HolobCompiler,
  type HolobCompilerOptions,
  type HolobCompileResult,
} from './compiler/HolobCompiler';

// ── Trait System Base Types ─────────────────────────────────────────────────
export type { TraitHandler } from './traits/TraitTypes';
export type { TraitConstraint } from './types';
export { BUILTIN_CONSTRAINTS } from './traits/traitConstraints';

// ── Sprint 3: Agent Inference Export ────────────────────────────────────────
export { default as AgentInferenceExportTarget } from './compiler/AgentInferenceExportTarget';

// ── Sprint 1: Procedural Geometry Patch ─────────────────────────────────────
export * from './compiler/ProceduralGeometry';

// ── Pillar 2: Semantic Scene Graph ──────────────────────────────────────────
export { SemanticSceneGraph } from './compiler/SemanticSceneGraph';

// ── @draft Trait (Draft→Mesh→Simulation Pipeline) ───────────────────────────
export {
  DRAFT_TRAIT,
  DRAFT_DEFAULTS,
  DraftManager,
  type AssetMaturity,
  type DraftShape,
  type DraftConfig,
} from './traits/DraftTrait';

// ── VR Performance Regression Monitor ───────────────────────────────────────
export {
  PerformanceRegressionMonitor,
  PERF_REGRESSION_DEFAULTS,
  type PerformanceRegressionConfig,
  type PerformanceRegressionState,
} from './traits/PerformanceRegressionMonitor';

// ── Headless Runtime + Watch Runner ─────────────────────────────────────────

// ── Plugin System (Sandboxing, API, Lifecycle Management) ─────────────────
export { PluginSandbox, createPluginSandbox } from './plugins/PluginSandbox';
export type {
  PluginSandboxOptions,
  PluginManifest as SandboxPluginManifest,
} from './plugins/PluginSandbox';
export { PluginAPI } from './plugins/PluginAPI';
export { PluginLoader } from './plugins/PluginLoader';
export { ModRegistry } from './plugins/ModRegistry';
export { HololandExtensionRegistry } from './plugins/HololandExtensionRegistry';

// ── v5.7 Plugin Ecosystem (Sandbox Runner, Signature, Dependencies, Lifecycle) ──
export { PluginSandboxRunner, DEFAULT_CAPABILITY_BUDGET } from './plugins/PluginSandboxRunner';
export type {
  SandboxPermission,
  CapabilityBudget,
  PluginSandboxRunnerConfig,
  SandboxTool,
  SandboxHandler,
  SandboxRunResult,
  SandboxRunnerState,
} from './plugins/PluginSandboxRunner';

export {
  PluginSignatureVerifier,
  getPluginSignatureVerifier,
  resetPluginSignatureVerifier,
  DEFAULT_VERIFIER_CONFIG,
} from './plugins/PluginSignatureVerifier';
export type {
  TrustedKey,
  VerificationResult,
  SignatureVerifierConfig,
} from './plugins/PluginSignatureVerifier';

export { DependencyResolver } from './plugins/DependencyResolver';
export type {
  PluginEntry,
  ResolutionResult,
  VersionConflict,
  MissingDependency,
} from './plugins/DependencyResolver';

export {
  PluginLifecycleManager,
  getPluginLifecycleManager,
  resetPluginLifecycleManager,
  DEFAULT_LIFECYCLE_CONFIG,
} from './plugins/PluginLifecycleManager';
export type {
  ManagedPlugin,
  InstallPluginOptions,
  PluginLifecycleState as ManagedPluginState,
  LifecycleManagerConfig,
} from './plugins/PluginLifecycleManager';

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

// ============================================================================
// Gap 2: Unified Trait Definition & Registry
// ============================================================================

export {
  UnifiedTraitRegistry,
  defaultTraitRegistry,
  createTraitRegistry,
  type TraitDefinition,
  type TraitCategory,
  type PropertyDef,
  type CompileHint,
  type TraitDeprecationInfo,
  type TraitSource,
  type TraitRegistrySummary,
} from './traits/TraitDefinition';

// ============================================================================
// Gap 3: RuleForge - Trait Composition Rule Engine
// ============================================================================

export { RuleForge, defaultRuleForge, createRuleForge } from './rules/RuleForge';

export type {
  Rule,
  RuleType,
  RuleViolation,
  TraitSuggestion,
  ValidationResult as RuleValidationResult,
  RuleSet,
} from './rules/types';

// ============================================================================
// Deploy & Publishing Protocol (Phase 2: HoloScript-as-Protocol)
// ============================================================================

export {
  computeContentHash,
  classifyPublishMode,
  extractImports,
  generateProvenance,
} from './deploy/provenance';
export type {
  LicenseType,
  PublishMode,
  ProvenanceBlock,
  ProvenanceImport,
} from './deploy/provenance';

export { checkLicenseCompatibility } from './deploy/license-checker';
export type { ImportedLicense, LicenseCheckResult } from './deploy/license-checker';

export { PROTOCOL_CONSTANTS } from './deploy/protocol-types';
export type {
  HexAddress,
  RevenueReason,
  RevenueFlow,
  RevenueDistribution,
  ImportChainNode,
  ProtocolRecord,
  PublishOptions,
  PublishResult,
  CollectOptions,
  CollectResult,
  RevenueCalculatorOptions,
} from './deploy/protocol-types';

export {
  calculateRevenueDistribution,
  resolveImportChain,
  formatRevenueDistribution,
  ethToWei,
  weiToEth,
} from './deploy/revenue-splitter';

// ============================================================================
// Pillar 2: Native Neural Streaming & Splat Transport
// ============================================================================

// Mesh components explicitly removed as part of Phase 6 consumer hardening.
// Consumers must now import from @holoscript/mesh natively.

export { GaussianSplatExtractor, type ExtractorOptions } from '@holoscript/engine/gpu';

// ModalitySelector already exported explicitly above (~line 2605)

// ============================================================================
// SNN Sparsity Monitoring (Self-Improvement)
// ============================================================================
export {
  SparsityMonitor,
  createSparsityMonitor,
  type LayerActivityInput,
} from '@holoscript/framework/training';
export type * from '@holoscript/framework/training';

// Events
export {
  EventBus,
  getSharedEventBus,
  setSharedEventBus,
  type EventCallback,
} from './events/EventBus';
// Analysis
export * from './analysis';

// --- PHASE 3: DECOUPLED BARREL COMPLETED ---
