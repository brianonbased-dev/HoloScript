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

// Constants (New)
export * from './constants';

// Math Utilities (NEW - Centralized vector math to avoid duplication)
export * from './math/vec3';

// Version & Build Metadata
export {
  HOLOSCRIPT_VERSION,
  GIT_COMMIT_SHA,
  BUILD_TIMESTAMP,
  getVersionString,
  getVersionInfo,
} from './version';

// Performance Tracking System
export * from './performance';

// Profiling (Sprint 7 - Performance Dashboard)
export * from './profiling';

// Procedural Geometry Generators (shared between GLTF pipeline and R3F renderer)
export {
  generateSplineGeometry,
  generateHullGeometry,
  generateMembraneGeometry,
  type GeometryData,
  type BlobDef,
} from './compiler/ProceduralGeometry';

// Parser
export { HoloScriptParser } from './HoloScriptParser';
export { HoloScript2DParser } from './HoloScript2DParser';
// Editor & Tools
export { HoloScriptValidator, type ValidationError } from './HoloScriptValidator';
export * from './HoloScriptCodeParser';

// HoloScript+ Parser (NEW)
export {
  HoloScriptPlusParser,
  createParser,
  parse as parseHoloScriptPlus,
} from './parser/HoloScriptPlusParser';

// Rich Error System (NEW - Enhanced error messages with codes, context, suggestions)
export {
  type RichParseError,
  HSPLUS_ERROR_CODES,
  createRichError,
  createTraitError,
  createKeywordError,
  findSimilarTrait,
  findSimilarKeyword,
  getSourceContext,
  formatRichError,
  formatRichErrors,
  getErrorCodeDocumentation,
} from './parser/RichErrors';

// .holo Composition Parser (NEW - Scene-centric declarative format)
export { HoloCompositionParser, parseHolo, parseHoloStrict } from './parser/HoloCompositionParser';
export type {
  HoloComposition,
  HoloEnvironment,
  HoloState,
  HoloTemplate,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloLight,
  HoloLightProperty,
  HoloEffects,
  HoloEffect,
  HoloCamera,
  HoloCameraProperty,
  HoloLogic,
  HoloAction,
  HoloEventHandler,
  HoloStatement,
  HoloExpression,
  HoloBindExpression,
  HoloImport,
  HoloParseResult,
  HoloParseError,
  HoloParserOptions,
  HoloValue,
  HoloBindValue,
  HoloTimeline,
  HoloTimelineEntry,
  HoloTimelineAction,
  HoloAudio,
  HoloAudioProperty,
  HoloZone,
  HoloZoneProperty,
  HoloUI,
  HoloUIElement,
  HoloUIProperty,
  HoloTransition,
  HoloTransitionProperty,
  HoloConditionalBlock,
  HoloForEachBlock,
  PlatformConstraint,
  HoloDomainType,
  HoloDomainBlock,
  CompiledNarrative,
  CompiledChapter,
  CompiledDialogueLine,
  CompiledChoice,
  CompiledCutsceneAction,
  CompiledPaywall,
  CompiledHealthcare,
  CompiledRobotics,
} from './parser/HoloCompositionTypes';

// HoloScript+ Enhanced Parser with Trait Annotations (Phase 3 alias)
// @deprecated Use `HoloScriptPlusParser` from './parser/HoloScriptPlusParser' directly.
export {
  HoloScriptPlusParser as HoloScriptTraitAnnotationParser,
  type MaterialTraitAnnotation,
  type LightingTraitAnnotation,
  type RenderingTraitAnnotation,
  type GraphicsConfiguration,
} from './HoloScriptPlusParser';

// Advanced AST Types (from the new structural parser)
export type {
  ASTProgram,
  HSPlusDirective,
  HSPlusCompileResult,
  HSPlusParserOptions,
  HSPlusNode as HSPlusASTNode,
} from './parser/HoloScriptPlusParser';

// Runtime
export { HoloScriptRuntime } from './HoloScriptRuntime';

// HoloScript+ Runtime (NEW)
export { HoloScriptPlusRuntimeImpl, createRuntime } from './runtime/HoloScriptPlusRuntime';
export type { RuntimeOptions, Renderer, NodeInstance } from './runtime/HoloScriptPlusRuntime';

// Headless Runtime — see './runtime/profiles' re-export block below (line ~1929)

// HoloScript+ Speech Recognition (NEW - Phase 16)
export {
  speechRecognizerRegistry,
  registerSpeechRecognizer,
  getSpeechRecognizer,
  type SpeechRecognizer,
  type SpeechRecognizerConfig,
  type TranscriptionSegment,
} from './runtime/SpeechRecognizer';

// HoloScript+ Physics (NEW - Phase 17)
export {
  physicsEngineRegistry,
  registerPhysicsEngine,
  getPhysicsEngine,
  type PhysicsConfig,
  type BodyProps,
  type BodyState,
  type PhysicsEngine,
} from './runtime/PhysicsEngine';

export { IslandDetector, type BodyConnection } from './physics/IslandDetector';

// HoloScript+ Navigation (NEW - Phase 18)
export {
  navigationEngineRegistry,
  registerNavigationEngine,
  getNavigationEngine,
  type NavigationConfig,
  type NavDestination,
  type NavigationEngine,
} from './runtime/NavigationEngine';

export { flowFieldHandler, type FlowFieldConfig } from './traits/FlowFieldTrait';

// RBAC Trait (Enterprise Multi-Tenant Capability-Based Access Control)
export {
  rbacHandler,
  type RBACRole,
  type PermissionCategory,
  type PermissionAction,
  type Permission,
  type PermissionCondition,
  type RoleDefinition,
  type RoleAssignment,
  type RBACConfig,
  type AccessCheckEntry,
  type CapabilityGrant,
  type DelegationRecord,
  type DelegationConstraints,
  type CapabilityCheckResult,
} from './traits/RBACTrait';

// HoloScript+ Streaming (NEW - Phase 19)
export {
  assetStreamerRegistry,
  registerAssetStreamer,
  getAssetStreamer,
  StreamPriority,
  type AssetStreamRequest,
  type StreamStatus,
  type AssetStreamer,
} from './runtime/AssetStreamer';

export { MovementPredictor, type PredictiveWindow } from './runtime/MovementPredictor';

// HoloScript+ Synthesis (NEW - Phase 20)
export {
  voiceSynthesizerRegistry,
  registerVoiceSynthesizer,
  getVoiceSynthesizer,
  type VoiceConfig,
  type VoiceRequest,
  type VoiceInfo,
  type VoiceSynthesizer,
} from './runtime/VoiceSynthesizer';

export { emotionalVoiceHandler, type EmotionalVoiceConfig } from './traits/EmotionalVoiceTrait';

// HoloScript+ Affective Computing (NEW - Phase 21)
export {
  emotionDetectorRegistry,
  registerEmotionDetector,
  getEmotionDetector,
  type EmotionConfig,
  type EmotionSignals,
  type EmotionInference,
  type EmotionDetector,
} from './runtime/EmotionDetector';

export { userMonitorHandler, type UserMonitorConfig } from './traits/UserMonitorTrait';

// HoloScript+ State Management (NEW)
export {
  ReactiveState,
  createState,
  reactive,
  effect,
  computed,
  bind,
} from './state/ReactiveState';

// HoloScript+ State Sync & Networking (NEW - Phase 5)
export { DeltaCompressor, type StateDelta } from './network/DeltaCompressor';

export { StateSynchronizer, type StateSubscriber } from './network/StateSynchronizer';

// Performance Monitoring (Phase 7 - TODO-020)
export { telemetry } from './monitoring/telemetry';

// Core types
export type {
  HSPlusAST,
  VRTraitName,
  SystemNode,
  ComponentNode,
  ImportNode,
  ExportNode,
  CompositionNode,
  TemplateNode,
  StorageAPI,
  DeviceAPI,
  InputAPI,
} from './types';

// HoloScript R3F Compiler (NEW)
export { R3FCompiler, type R3FNode, ENVIRONMENT_PRESETS } from './compiler/R3FCompiler';

// HoloScript Optimization Pass (NEW - Auto-optimization)
export {
  OptimizationPass,
  type OptimizationCategory,
  type OptimizationSeverity,
  type OptimizationHint,
  type LODTier,
  type LODRecommendation,
  type BatchGroup,
  type OptimizationReport,
  type SceneStats,
  type OptimizationOptions,
} from './compiler/OptimizationPass';

// Cross-Reality Composition Validator (Static analysis for cross-reality correctness)
export {
  CrossRealityValidator,
  type CrossRealityValidationIssue,
  type CrossRealityValidationResult,
  type HandoffPathAnalysis,
} from './compiler/CrossRealityValidator';

// HoloScript Multi-Target Compilers (NEW - Cross-platform)
export { UnityCompiler, type UnityCompilerOptions } from './compiler/UnityCompiler';
export { GodotCompiler, type GodotCompilerOptions } from './compiler/GodotCompiler';
export { VisionOSCompiler, type VisionOSCompilerOptions } from './compiler/VisionOSCompiler';

// HoloScript New Platform Compilers (NEW - Phase 14)
export { WebGPUCompiler, type WebGPUCompilerOptions } from './compiler/WebGPUCompiler';
export { BabylonCompiler, type BabylonCompilerOptions } from './compiler/BabylonCompiler';
export {
  AndroidXRCompiler,
  type AndroidXRCompilerOptions,
  type AndroidXRCompileResult,
  compileToAndroidXR,
} from './compiler/AndroidXRCompiler';
export { OpenXRCompiler, type OpenXRCompilerOptions } from './compiler/OpenXRCompiler';
export {
  OpenXRSpatialEntitiesCompiler,
  type OpenXRSpatialEntitiesCompilerOptions,
  type SpatialEntitiesDocument,
  type SpatialEntity,
  type SpatialEntityComponent,
  type XrPosef,
  type XrVector3f,
  type XrQuaternionf,
  type XrExtent3Df,
  type XrExtent2Df,
  type SpatialBoundsComponent,
  type SemanticLabelComponent,
  type Bounds2DComponent,
  type MeshComponent,
  type PersistenceComponent,
  type AnchorComponent,
  type GeospatialExtension,
} from './compiler/OpenXRSpatialEntitiesCompiler';
export {
  VRRCompiler,
  type VRRCompilerOptions,
  type VRRCompilationResult,
} from './compiler/VRRCompiler';
export {
  ARCompiler,
  type ARCompilerOptions,
  type ARCompilationResult,
} from './compiler/ARCompiler';
export {
  MultiLayerCompiler,
  type MultiLayerCompilerOptions,
  type MultiLayerCompilationResult,
} from './compiler/MultiLayerCompiler';

// HoloScript TSL Compiler (Trait Shader Language — trait-to-shader code generation)
export {
  TSLCompiler,
  type TSLCompilerOptions,
  type TSLCompilationResult,
  type TSLObjectOutput,
  type TSLTraitShaderContribution,
  type TSLUniform,
  type TSLDataType,
} from './compiler/TSLCompiler';

// HoloScript Robotics & IoT Compilers (Sprint 3)
export {
  URDFCompiler,
  compileToURDF,
  compileForROS2,
  compileForGazebo,
  generateROS2LaunchFile,
  generateControllersYaml,
  type URDFCompilerOptions,
  type URDFLink,
  type URDFGeometry,
  type URDFInertial,
  type URDFOrigin,
  type URDFJoint,
  type URDFSensor,
  type URDFTransmission,
  type URDFMaterial,
  type URDFROS2Control,
} from './compiler/URDFCompiler';
export { SDFCompiler, type SDFCompilerOptions } from './compiler/SDFCompiler';

// Circuit Breaker Pattern for Export Targets (NEW - v3.43.0)
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitState,
  type ExportTarget,
  type CircuitBreakerConfig,
  type CircuitMetrics,
  type CircuitResult,
} from './compiler/CircuitBreaker';

export {
  ReferenceExporterRegistry,
  type ExportResult as ReferenceExportResult,
  type ExporterOptions,
} from './compiler/ReferenceExporters';

export {
  ExportManager,
  getExportManager,
  resetExportManager,
  exportComposition,
  batchExportComposition,
  type ExportOptions,
  type ExportResult,
  type BatchExportResult,
  type ExportEvent,
  type ExportEventType,
  type ExportEventListener,
} from './compiler/ExportManager';

export {
  GaussianBudgetAnalyzer,
  analyzeGaussianBudget,
  GAUSSIAN_PLATFORM_BUDGETS,
  type GaussianPlatform,
  type GaussianBudgetAnalysis,
  type GaussianBudgetWarning,
  type GaussianBudgetAnalyzerOptions,
  type GaussianSource,
  type BudgetSeverity,
} from './compiler/GaussianBudgetAnalyzer';

export {
  CircuitBreakerMonitor,
  formatHealthReport,
  type HealthStatus,
  type AlertConfig,
  type Alert,
  type AlertLevel,
  type AlertHandler,
  type PerformanceMetrics,
  type DashboardData,
} from './compiler/CircuitBreakerMonitor';

// Compiler State Monitor (Memory Budget Management)
export {
  CompilerStateMonitor,
  createCompilerStateMonitor,
  type MemoryThresholds,
  type MemoryStats,
  type MemoryAlert,
  type CompilerStateMonitorOptions,
  type PruningResult,
} from './compiler/CompilerStateMonitor';

export {
  DTDLCompiler,
  type DTDLCompilerOptions,
  DTDL_TRAIT_COMPONENTS,
} from './compiler/DTDLCompiler';
export {
  USDPhysicsCompiler,
  compileToUSDPhysics,
  compileForIsaacSim,
  type USDPhysicsCompilerOptions,
} from './compiler/USDPhysicsCompiler';

// Native Platform Compilers (Full Platform Coverage)
export {
  VRChatCompiler,
  compileToVRChat,
  type VRChatCompilerOptions,
  type VRChatCompileResult,
} from './compiler/VRChatCompiler';
export {
  UnrealCompiler,
  compileToUnreal,
  type UnrealCompilerOptions,
  type UnrealCompileResult,
} from './compiler/UnrealCompiler';
export {
  IOSCompiler,
  compileToIOS,
  type IOSCompilerOptions,
  type IOSCompileResult,
} from './compiler/IOSCompiler';
export {
  AndroidCompiler,
  compileToAndroid,
  type AndroidCompilerOptions,
  type AndroidCompileResult,
} from './compiler/AndroidCompiler';

// WASM Compiler (Sprint 3 - High-performance edge execution)
export {
  WASMCompiler,
  createWASMCompiler,
  compileToWASM,
  compileASTToWASM,
  type WASMCompilerOptions,
  type WASMCompileResult,
  type MemoryLayout,
  type WASMExport,
  type WASMImport,
} from './compiler/WASMCompiler';

// Incremental Compiler (Sprint 2 - Hot Reload & Trait Detection)
export {
  IncrementalCompiler,
  createIncrementalCompiler,
  type ChangeType,
  type ASTChange,
  type DiffResult,
  type CacheEntry,
  type StateSnapshot,
  type IncrementalCompileOptions,
  type IncrementalCompileResult,
  type SerializedCache,
} from './compiler/IncrementalCompiler';

export {
  TraitDependencyGraph,
  globalTraitGraph,
  type TraitUsage,
  type ObjectTraitInfo,
  type TraitDefinition,
  type TraitChangeInfo,
  type AffectedSet,
} from './compiler/TraitDependencyGraph';

// Build Cache (Sprint 4 - Persistent disk-based caching)
export {
  BuildCache,
  createBuildCache,
  getDefaultCacheDir,
  ContentAddressableStore,
  createBuildManifest,
  validateBuildManifest,
  type CacheEntryType,
  type CacheEntryMeta,
  type CacheEntry as BuildCacheEntry,
  type CacheLookupResult,
  type BuildCacheOptions,
  type CacheStats,
  type BuildArtifact,
  type BuildManifest,
} from './compiler/BuildCache';

// Source Maps v2 (Sprint 4 - Enhanced source mapping)
export {
  SourceMapGeneratorV2,
  SourceMapConsumerV2,
  createSourceMapV2,
  createIndexMap,
  combineSourceMapsV2,
  type SourceMapV2,
  type IndexMap,
  type Position as SourceMapPosition,
  type Range as SourceMapRange,
  type Scope,
  type ScopeType,
  type ScopeSymbol,
  type EnhancedMappingSegment,
  type ExpressionType,
  type HotReloadMapping,
} from './sourcemap';

// Bundle Analyzer (Sprint 4 - Comprehensive bundle analysis)
export {
  BundleAnalyzer,
  createBundleAnalyzer,
  type ModuleInfo,
  type ModuleType,
  type ChunkInfo,
  type DuplicateInfo,
  type TreeshakingOpportunity,
  type SplittingRecommendation,
  type PerformanceMetrics,
  type BundleAnalysisReport,
  type AnalysisWarning,
  type BundleAnalyzerOptions,
  type BundleInput,
} from './compiler/BundleAnalyzer';

// Dead Code Analysis (Sprint 5 - Reference graph and reachability)
export {
  ReferenceGraph,
  createReferenceGraph,
  ReachabilityAnalyzer,
  createReachabilityAnalyzer,
  analyzeDeadCode,
  type SymbolType,
  type SymbolDefinition,
  type SymbolReference,
  type ReferenceContext,
  type GraphNode,
  type GraphStats,
  type DeadCodeItem,
  type DeadCodeType,
  type ReachabilityResult,
  type ReachabilityStats,
  type ReachabilityOptions,
} from './analysis';

// Deprecation System (Sprint 5 - Deprecation warnings)
export {
  DeprecationRegistry,
  defaultRegistry as defaultDeprecationRegistry,
  createDeprecationRegistry,
  registerDeprecation,
  isTraitDeprecated,
  checkSyntaxDeprecations,
  type DeprecationSeverity,
  type DeprecationEntry,
  type DeprecationMatch,
} from './deprecation';

// Migration Assistant (Sprint 5 - Code migration for deprecated patterns)
export {
  MigrationAssistant,
  createMigrationAssistant,
  analyzeMigrations,
  autoFixMigrations,
  type MigrationRule,
  type MigrationSuggestion,
  type MigrationResult,
  type ApplyResult,
} from './migration';

// Package Registry (Sprint 5 - Package management MVP)
export {
  PackageRegistry,
  createPackageRegistry,
  defaultRegistry as defaultPackageRegistry,
  parseSemVer,
  formatSemVer,
  compareSemVer,
  satisfiesRange,
  findBestMatch,
  validatePackageName,
  validateManifest,
  type SemVer,
  type PackageDependency,
  type PackageManifest,
  type PackageMetadata,
  type SearchResult,
  type ResolvedDependency,
  type InstallResult,
} from './registry';

// HoloScript LSP Service (NEW - IDE integration)
export {
  HoloScriptLSP,
  type LSPDiagnostic,
  type LSPRange,
  type LSPPosition,
  type LSPCompletionItem,
  type CompletionItemKind,
  type LSPHoverResult,
  type LSPDefinitionResult,
  type LSPDocumentSymbol,
  type SymbolKind,
  type LSPSemanticToken,
  type SemanticTokenType,
  type SemanticTokenModifier,
} from './lsp/HoloScriptLSP';

// Domain Block Compiler Mixin (v4.2 — Perception & Simulation)
export {
  compileMaterialBlock,
  compilePhysicsBlock,
  materialToR3F,
  materialToUSD,
  materialToGLTF,
  physicsToURDF,
  compileDomainBlocks,
  compileNarrativeBlock,
  narrativeToUnity,
  narrativeToGodot,
  narrativeToVRChat,
  narrativeToR3F,
  narrativeToUSDA,
  compilePaymentBlock,
  paymentToUnity,
  paymentToGodot,
  paymentToVRChat,
  paymentToR3F,
  paymentToUSDA,
  compileHealthcareBlock,
  healthcareToR3F,
  healthcareToUnity,
  healthcareToGodot,
  healthcareToVRChat,
  healthcareToUSDA,
  compileRoboticsBlock,
  roboticsToR3F,
  roboticsToUnity,
  roboticsToGodot,
  roboticsToVRChat,
  roboticsToUSDA,
  compileIoTBlock,
  iotToR3F,
  iotToUnity,
  iotToGodot,
  iotToVRChat,
  iotToUSDA,
  compileDataVizBlock,
  datavizToR3F,
  datavizToUnity,
  datavizToGodot,
  datavizToVRChat,
  datavizToUSDA,
  compileEducationBlock,
  educationToR3F,
  educationToUnity,
  educationToGodot,
  educationToVRChat,
  educationToUSDA,
  compileMusicBlock,
  musicToR3F,
  musicToUnity,
  musicToGodot,
  musicToVRChat,
  musicToUSDA,
  compileArchitectureBlock,
  architectureToR3F,
  architectureToUnity,
  architectureToGodot,
  architectureToVRChat,
  architectureToUSDA,
  compileWeb3Block,
  web3ToR3F,
  web3ToUnity,
  web3ToGodot,
  web3ToVRChat,
  web3ToUSDA,
  compileProceduralBlock,
  proceduralToR3F,
  proceduralToUnity,
  proceduralToGodot,
  proceduralToVRChat,
  proceduralToUSDA,
  compileRenderingBlock,
  renderingToR3F,
  renderingToUnity,
  renderingToGodot,
  renderingToVRChat,
  renderingToUSDA,
  compileNavigationBlock,
  navigationToR3F,
  navigationToUnity,
  navigationToGodot,
  navigationToVRChat,
  navigationToUSDA,
  compileInputBlock,
  inputToR3F,
  inputToUnity,
  inputToGodot,
  inputToVRChat,
  inputToUSDA,
  type CompiledMaterial,
  type CompiledPhysics,
  type CompiledCollider,
  type CompiledRigidbody,
  type CompiledForceField,
  type CompiledJoint,
  type DomainCompileFn,
} from './compiler/DomainBlockCompilerMixin';

// Import Resolver (v4.2 — Module Resolution)
export {
  ImportResolver,
  type ResolvedModule,
  type ImportResolverOptions,
} from './lsp/ImportResolver';

// LSP Completion Provider (v4.2 — 100+ completions)
export { CompletionProvider, type CompletionItem } from './lsp/CompletionProvider';

// LSP Diagnostic Provider (v4.2 — 5 diagnostic rules)
export {
  DiagnosticProvider,
  type Diagnostic,
  type DiagnosticSeverity,
  type DiagnosticRule,
  type DiagnosticContext,
} from './lsp/DiagnosticProvider';

// HoloScript+ VR Traits (NEW)
export { VRTraitRegistry, vrTraitRegistry } from './traits/VRTraitSystem';

// HoloScript+ Expanded Trait Handlers (Phases 1-13)
export {
  // Phase 1: Environment Understanding
  planeDetectionHandler,
  meshDetectionHandler,
  anchorHandler,
  persistentAnchorHandler,
  sharedAnchorHandler,
  geospatialEnvHandler,
  occlusionHandler,
  lightEstimationHandler,
  // Phase 2: Input Modalities
  handTrackingHandler,
  controllerInputHandler,
  bodyTrackingHandler,
  faceTrackingHandler,
  spatialAccessoryHandler,
  // Phase 3: Accessibility
  accessibleHandler,
  altTextHandler,
  spatialAudioCueHandler,
  sonificationHandler,
  hapticCueHandler,
  magnifiableHandler,
  highContrastHandler,
  motionReducedHandler,
  subtitleHandler,
  screenReaderHandler,
  // Phase 4: Gaussian Splatting & Volumetric
  gaussianSplatHandler,
  nerfHandler,
  volumetricVideoHandler,
  pointCloudHandler,
  photogrammetryHandler,
  // Phase 5: WebGPU Compute
  computeHandler,
  gpuParticleHandler,
  gpuPhysicsHandler,
  gpuBufferHandler,
  // Phase 6: Digital Twin & IoT
  sensorHandler,
  digitalTwinHandler,
  dataBindingHandler,
  alertHandler,
  heatmap3dHandler,
  // Phase 7: Autonomous Agents
  behaviorTreeHandler,
  goalOrientedHandler,
  llmAgentHandler,
  neuralLinkHandler,
  memoryHandler,
  perceptionHandler,
  emotionHandler,
  dialogueHandler,
  factionHandler,
  patrolHandler,
  // Phase 8: Advanced Spatial Audio
  ambisonicsHandler,
  hrtfHandler,
  reverbZoneHandler,
  audioOcclusionHandler,
  audioPortalHandler,
  audioMaterialHandler,
  headTrackedAudioHandler,
  // Phase 9: OpenUSD & Interoperability
  usdHandler,
  gltfHandler,
  fbxHandler,
  materialXHandler,
  sceneGraphHandler,
  // Phase 10: Co-Presence & Shared Experiences
  coLocatedHandler,
  remotePresenceHandler,
  sharedWorldHandler,
  voiceProximityHandler,
  avatarEmbodimentHandler,
  spectatorHandler,
  roleHandler,
  // Phase 11: Geospatial & AR Cloud
  geospatialAnchorHandler,
  terrainAnchorHandler,
  rooftopAnchorHandler,
  vpsHandler,
  poiHandler,
  // Phase 12: Web3 & Ownership
  nftHandler,
  tokenGatedHandler,
  walletHandler,
  marketplaceHandler,
  portableHandler,
  // Phase 13: Physics Expansion
  clothHandler,
  fluidHandler,
  softBodyHandler,
  ropeHandler,
  chainHandler,
  windHandler,
  buoyancyHandler,
  destructionHandler,
  layerAwareHandler,
} from './traits/VRTraitSystem';

// HoloScript+ Voice Input Trait (NEW - Phase 1)
export {
  VoiceInputTrait,
  createVoiceInputTrait,
  type VoiceInputConfig,
  type VoiceInputMode,
  type VoiceRecognitionResult,
  type VoiceInputEvent,
} from './traits/VoiceInputTrait';

// HoloScript+ AI Driver NPC Trait (NEW - Phase 1)
export {
  AIDriverTrait,
  createAIDriverTrait,
  BehaviorTreeRunner,
  GOAPPlanner,
  type AIDriverConfig,
  type DecisionMode,
  type BehaviorNode,
  type NPCContext,
  type NPCGoal,
  type BehaviorState,
} from './traits/AIDriverTrait';

// HoloScript+ Material Trait (NEW - Phase 2: Graphics)
export {
  MaterialTrait,
  createMaterialTrait,
  MATERIAL_PRESETS,
  type MaterialType,
  type TextureChannel,
  type TextureMap,
  type PBRMaterial,
  type MaterialConfig,
} from './traits/MaterialTrait';

// HoloScript+ Lighting Trait (NEW - Phase 2: Graphics)
export {
  LightingTrait,
  createLightingTrait,
  LIGHTING_PRESETS,
  type LightType,
  type ShadowType,
  type ShadowConfig,
  type LightSource,
  type GlobalIlluminationConfig,
} from './traits/LightingTrait';

// HoloScript+ Rendering Trait (NEW - Phase 2: Graphics)
export {
  RenderingTrait,
  createRenderingTrait,
  type CullingMode,
  type LodStrategy,
  type GPUResourceTier,
  type LODLevel,
  type CullingConfig,
  type BatchingConfig,
  type TextureOptimization,
  type ShaderOptimization,
  type RenderingOptimization,
} from './traits/RenderingTrait';

// HoloScript+ Shader Trait (NEW - Phase 3: Advanced Graphics)
export {
  ShaderTrait,
  createShaderTrait,
  SHADER_PRESETS,
  SHADER_CHUNKS,
  type ShaderType,
  type UniformType,
  type UniformValue,
  type UniformDefinition,
  type ShaderChunk,
  type InlineShader,
  type ShaderConfig,
} from './traits/ShaderTrait';

// HoloScript+ Networked Trait (NEW - Phase 3: Multiplayer)
export {
  NetworkedTrait,
  createNetworkedTrait,
  type SyncMode,
  type InterpolationType,
  type NetworkAuthority,
  type InterpolationConfig,
  type SyncedProperty,
  type NetworkedConfig,
} from './traits/NetworkedTrait';

// HoloScript+ Multi-Agent Coordination (NEW - v3.1 Foundation & Safety)
export { multiAgentHandler, type MultiAgentConfig } from './traits/MultiAgentTrait';

// HoloScript+ Joint Trait (NEW - Phase 3: Physics)
export {
  JointTrait,
  createJointTrait,
  type JointType,
  type JointLimit,
  type JointMotor,
  type JointDrive,
  type JointSpring,
  type JointConfig,
} from './traits/JointTrait';

// HoloScript+ IK Trait (NEW - Phase 3: Animation)
export {
  IKTrait,
  createIKTrait,
  type IKSolverType,
  type BoneConstraint,
  type IKChain,
  type IKTarget,
  type IKConfig,
} from './traits/IKTrait';

// HoloScript+ Rigidbody Trait (NEW - Phase 4: Physics)
export {
  RigidbodyTrait,
  createRigidbodyTrait,
  type BodyType,
  type ForceMode,
  type CollisionDetectionMode,
  type ColliderShape,
  type ColliderConfig,
  type PhysicsMaterialConfig,
  type RigidbodyConfig,
} from './traits/RigidbodyTrait';

// HoloScript+ Trigger Trait (NEW - Phase 4: Collision)
export {
  TriggerTrait,
  createTriggerTrait,
  type TriggerShape,
  type TriggerEvent,
  type TriggerEventType,
  type TriggerAction,
  type TriggerConfig,
} from './traits/TriggerTrait';

// HoloScript+ Skeleton Trait (NEW - Phase 4: Animation)
export {
  SkeletonTrait as SkeletonAnimationTrait,
  createSkeletonTrait,
  type SkeletonRigType,
  type BlendTreeType,
  type AnimationEvent,
  type BlendTreeNode,
  type AnimationLayer,
  type HumanoidBoneMap,
  type SkeletonConfig,
} from './traits/SkeletonTrait';

// HoloScript+ Lobby Trait (NEW - Phase 4: Multiplayer)
export {
  LobbyTrait,
  createLobbyTrait,
  type LobbyState,
  type LobbyVisibility,
  type MatchmakingMode,
  type PlayerInfo,
  type TeamConfig,
  type MatchmakingConfig,
  type LobbyConfig,
} from './traits/LobbyTrait';

// HoloScript+ Dialog Trait (NEW - Phase 5: AI/NPC)
export {
  DialogTrait,
  createDialogTrait,
  type DialogNodeType,
  type DialogCondition,
  type DialogAction,
  type DialogChoice,
  type DialogNode,
  type DialogTree,
  type DialogConfig,
  type DialogState,
  type DialogEvent,
} from './traits/DialogTrait';

// HoloScript+ Voice Output Trait (NEW - Phase 5: AI/NPC)
export {
  VoiceOutputTrait,
  createVoiceOutputTrait,
  type VoiceGender,
  type VoiceSynthEngine,
  type VoiceStyle,
  type VoiceDefinition,
  type SpeechSegment,
  type SpeechRequest,
  type VoiceOutputConfig,
} from './traits/VoiceOutputTrait';

// HoloScript+ Character Trait (NEW - Phase 5: Character Controller)
export {
  CharacterTrait,
  createCharacterTrait,
  type MovementMode,
  type GroundState,
  type MovementInput,
  type GroundHit,
  type StepInfo,
  type CharacterState,
  type CharacterConfig,
} from './traits/CharacterTrait';

// HoloScript+ Morph Trait (NEW - Phase 5: Blend Shapes)
export {
  MorphTrait as BlendShapeTrait,
  createMorphTrait as createBlendShapeTrait,
  type MorphTarget as BlendShapeTarget,
  type MorphPreset as BlendShapePreset,
  type MorphKeyframe as BlendShapeKeyframe,
  type MorphClip as BlendShapeClip,
  type MorphConfig as BlendShapeConfig,
  type MorphEvent as BlendShapeEvent,
} from './traits/MorphTrait';

// HoloScript+ Animation Trait (NEW - Phase 5: Animation)
export {
  AnimationTrait,
  createAnimationTrait,
  type AnimationWrapMode,
  type AnimationBlendMode,
  type AnimationClipDef,
  type AnimationEventDef,
  type AnimationStateDef,
  type TransitionCondition,
  type AnimationTransition,
  type AnimationParameter,
  type AnimationLayer as AnimationTraitLayer,
  type AnimationEventType,
  type AnimationEvent as AnimationTraitEvent,
  type AnimationConfig,
} from './traits/AnimationTrait';

// HoloScript+ Lip Sync Trait (NEW - AI Avatar Embodiment)
export {
  LipSyncTrait,
  createLipSyncTrait,
  DEFAULT_FREQUENCY_BANDS,
  OCULUS_VISEME_MAP,
  ARKIT_MOUTH_SHAPES,
  type LipSyncMethod,
  type BlendShapeSet,
  type OculusViseme,
  type ARKitViseme,
  type VisemeTimestamp,
  type PhonemeTimestamp,
  type FrequencyBand,
  type LipSyncSession,
  type LipSyncEventType,
  type LipSyncEvent,
  type LipSyncConfig,
} from './traits/LipSyncTrait';

// HoloScript+ Emotion Directive Trait (NEW - AI Avatar Embodiment)
export {
  EmotionDirectiveTrait,
  createEmotionDirectiveTrait,
  DEFAULT_EXPRESSION_PRESETS,
  DEFAULT_ANIMATION_MAP,
  type ExpressionPresetName,
  type AnimationPresetName,
  type DirectiveType,
  type ConditionalDirective,
  type TriggeringDirective,
  type EmotionTaggedSegment,
  type EmotionTaggedResponse,
  type EmotionState,
  type EmotionDirectiveEventType,
  type EmotionDirectiveEvent,
  type EmotionDirectiveConfig,
} from './traits/EmotionDirectiveTrait';

// HoloScript+ Avatar Embodiment Types (NEW - AI Avatar Embodiment)
export type {
  AvatarTrackingSource,
  AvatarIKMode,
  PipelineStage,
  AvatarPersonality,
  AvatarEmbodimentConfig,
  AvatarEmbodimentState,
  AvatarEmbodimentEventType,
  AvatarEmbodimentEvent,
} from './traits/AvatarEmbodimentTrait';

// Performance Telemetry (NEW - Phase 1)
export {
  PerformanceTelemetry,
  getPerformanceTelemetry,
  type Metric,
  type MetricType,
  type SeverityLevel,
  type PerformanceBudget,
  type FrameTiming,
  type MemorySnapshot,
  type AnalyticsExporter,
} from './runtime/PerformanceTelemetry';

// Hololand Graphics Pipeline Service (NEW - Phase 4)
export {
  HololandGraphicsPipelineService,
  type MaterialAsset,
  type TextureAsset,
  type ShaderProgram,
  type PlatformConfig,
  type GPUMemoryEstimate,
  type PerformanceMetrics as GraphicsPerformanceMetrics,
} from './services/HololandGraphicsPipelineService';

// Platform Performance Optimizer (NEW - Phase 5)
export {
  PlatformPerformanceOptimizer,
  type DeviceInfo,
  type PerformanceProfile,
  type AdaptiveQualitySettings,
  type BenchmarkResult,
  type DeviceCapabilities,
  type CompressionFormat,
  type PerformanceRecommendation,
} from './services/PlatformPerformanceOptimizer';



// Type Checker
export {
  HoloScriptTypeChecker,
  createTypeChecker,
  type TypeCheckResult,
  type TypeInfo,
  type TypeDiagnostic,
} from './HoloScriptTypeChecker';

// Debugger
export {
  HoloScriptDebugger,
  createDebugger,
  type Breakpoint,
  type StackFrame,
  type DebugState,
  type DebugEvent,
  type StepMode,
} from './HoloScriptDebugger';

// Logger
export {
  logger,
  setHoloScriptLogger,
  enableConsoleLogging,
  resetLogger,
  NoOpLogger,
  ConsoleLogger,
  type HoloScriptLogger,
} from './logger';

// Types
export type {
  // Spatial
  SpatialPosition,
  Position2D,
  Size2D,

  // Hologram
  HologramShape,
  HologramProperties,

  // Input
  VoiceCommand,
  GestureType,
  HandType,
  GestureData,

  // AST Nodes
  ASTNode,
  OrbNode,
  MethodNode,
  ParameterNode,
  ConnectionNode,
  GateNode,
  StreamNode,
  TransformationNode,
  GenericASTNode,

  // VR Types
  Vector3,
  SpatialVector3,
  Vector2,
  Color,
  Duration,
  Transform,
  VRHand,
  ThrowVelocity,
  CollisionEvent,

  // VR Traits (Core)
  GrabbableTrait,
  ThrowableTrait,
  PointableTrait,
  HoverableTrait,
  ScalableTrait,
  RotatableTrait,
  StackableTrait,
  SnappableTrait,
  BreakableTrait,
  StretchableTrait,
  MoldableTrait,

  // Humanoid/Avatar Traits
  SkeletonTrait,
  BodyTrait,
  FaceTrait,
  ExpressiveTrait,
  HairTrait,
  ClothingTrait,
  HandsTrait,
  CharacterVoiceTrait,
  LocomotionTrait,
  PoseableTrait,
  MorphTrait,

  // NetworkedTrait is exported separately with createNetworkedTrait
  ProactiveTrait,

  // Media Production Traits
  RecordableTrait,
  StreamableTrait,
  CameraTrait,
  VideoTrait,

  // Analytics & Research Traits
  TrackableTrait,
  SurveyTrait,
  ABTestTrait,
  HeatmapTrait,

  // Social & Viral Traits
  ShareableTrait,
  EmbeddableTrait,
  QRTrait,
  CollaborativeTrait,

  // Effects Traits
  ParticleTrait,
  TransitionTrait,
  FilterTrait,
  TrailTrait,

  // Audio Traits
  SpatialAudioTrait,
  VoiceTrait,
  ReactiveAudioTrait,

  // AI & Generative Traits
  NarratorTrait,
  ResponsiveTrait,
  ProceduralTrait,
  CaptionedTrait,

  // Timeline & Choreography Traits
  TimelineTrait,
  ChoreographyTrait,

  // Environment Understanding Traits
  PlaneDetectionTrait,
  MeshDetectionTrait,
  AnchorTrait,
  PersistentAnchorTrait,
  SharedAnchorTrait,
  GeospatialTrait,
  OcclusionTrait,
  LightEstimationTrait,

  // Input Modality Traits
  EyeTrackingTrait,
  HandTrackingTrait,
  ControllerTrait,
  SpatialAccessoryTrait,
  BodyTrackingTrait,
  FaceTrackingTrait,

  // Accessibility Traits
  AccessibleTrait,
  AltTextTrait,
  SpatialAudioCueTrait,
  SonificationTrait,
  HapticCueTrait,
  MagnifiableTrait,
  HighContrastTrait,
  MotionReducedTrait,
  SubtitleTrait,
  ScreenReaderTrait,

  // Gaussian Splatting & Volumetric Content Traits
  GaussianSplatTrait,
  NerfTrait,
  VolumetricVideoTrait,
  PointCloudTrait,
  PhotogrammetryTrait,

  // WebGPU Compute Traits
  ComputeTrait,
  GPUParticleTrait,
  GPUPhysicsTrait,
  GPUBufferTrait,

  // Digital Twin & IoT Traits
  SensorTrait,
  DigitalTwinTrait,
  DataBindingTrait,
  AlertTrait,
  Heatmap3DTrait,

  // Autonomous Agent Traits
  BehaviorTreeTrait,
  GoalOrientedTrait,
  LLMAgentTrait,
  MemoryTrait,
  PerceptionTrait,
  EmotionTrait,
  DialogueTrait,
  FactionTrait,
  PatrolTrait,

  // Advanced Spatial Audio Traits
  AmbisonicsTrait,
  HRTFTrait,
  ReverbZoneTrait,
  AudioOcclusionTrait,
  AudioPortalTrait,
  AudioMaterialTrait,
  HeadTrackedAudioTrait,

  // OpenUSD & Interoperability Traits
  USDTrait,
  GLTFTrait,
  FBXTrait,
  MaterialXTrait,
  SceneGraphTrait,

  // Co-Presence & Shared Experience Traits
  CoLocatedTrait,
  RemotePresenceTrait,
  SharedWorldTrait,
  VoiceProximityTrait,
  AvatarEmbodimentTrait,
  SpectatorTrait,
  RoleTrait,

  // Geospatial & AR Cloud Traits
  GeospatialAnchorTrait,
  TerrainAnchorTrait,
  RooftopAnchorTrait,
  VPSTrait,
  POITrait,

  // Web3 & Ownership Traits
  NFTTrait,
  TokenGatedTrait,
  WalletTrait,
  MarketplaceTrait,
  PortableTrait,

  // Physics Expansion Traits
  ClothTrait,
  FluidTrait,
  SoftBodyTrait,
  RopeTrait,
  ChainTrait,
  WindTrait,
  BuoyancyTrait,
  DestructionTrait,

  // Lifecycle Hooks
  AllLifecycleHooks,
  MediaLifecycleHook,
  AnalyticsLifecycleHook,
  SocialLifecycleHook,
  EffectsLifecycleHook,
  AudioLifecycleHook,
  AILifecycleHook,
  TimelineLifecycleHook,

  // Expanded Lifecycle Hooks
  EnvironmentLifecycleHook,
  InputModalityLifecycleHook,
  AccessibilityLifecycleHook,
  VolumetricLifecycleHook,
  ComputeLifecycleHook,
  DigitalTwinLifecycleHook,
  AgentLifecycleHook,
  SpatialAudioLifecycleHook,
  InteropLifecycleHook,
  CoPresenceLifecycleHook,
  GeospatialLifecycleHook,
  Web3LifecycleHook,
  PhysicsExpansionLifecycleHook,

  // Builtin Types
  RecordingClip,
  ShareContent,
  ShareResult,
  ParticleConfig,

  // Phase 2: Loop Nodes
  ForLoopNode,
  WhileLoopNode,
  ForEachLoopNode,

  // Phase 2: Module Nodes
  ImportNode,
  ExportNode,
  ImportLoader,

  // Phase 2: Variable Nodes
  VariableDeclarationNode,

  // 2D UI
  UIElementType,
  UI2DNode,
  UIStyle,

  // Runtime
  RuntimeContext,
  ExecutionResult,
  HoloScriptValue,
  ParticleSystem,

  // Config
  SecurityConfig,
  RuntimeSecurityLimits,

  // Scene Graph Types (First-Class)
  SpatialRelationType,
  SpatialRelation,
  SceneEdgeType,
  SceneEdge,
  SceneNodeDescriptor,
  SceneGraphDescriptor,
} from './types';


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
    version: HOLOSCRIPT_VERSION,
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
} from './ai';

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
} from './wot';

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

export {
  MQTTClient,
  createMQTTClient,
  registerMQTTClient,
  getMQTTClient,
  unregisterMQTTClient,
  type QoS,
  type MQTTVersion,
  type MQTTClientConfig,
  type MQTTMessage,
  type MQTTSubscription,
  type MQTTPublishOptions,
  type MQTTClientState,
  type MQTTClientEvents,
} from './runtime/protocols';

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

export {
  // Profile types
  type RuntimeProfile,
  type RuntimeProfileName,
  type RenderingConfig,
  type PhysicsConfig as ProfilePhysicsConfig,
  type AudioConfig as ProfileAudioConfig,
  type NetworkConfig as ProfileNetworkConfig,
  type InputConfig as ProfileInputConfig,
  type ProtocolConfig,
  // Predefined profiles
  HEADLESS_PROFILE,
  MINIMAL_PROFILE,
  STANDARD_PROFILE,
  VR_PROFILE,
  // Profile utilities
  getProfile,
  registerProfile,
  getAvailableProfiles,
  createCustomProfile,
  // Headless runtime
  HeadlessRuntime,
  createHeadlessRuntime,
  type HeadlessRuntimeOptions,
  type HeadlessRuntimeStats,
  type HeadlessNodeInstance,
} from './runtime/profiles';

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
} from './network/SyncProtocol';

// Local Network Adapter (existing)
export {
  LocalNetworkAdapter,
  createLocalNetworkAdapter,
  type NetworkUpdate,
  type UpdateCallback,
} from './network/LocalNetworkAdapter';

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
} from './registry/certification';

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
} from './registry/workspace/WorkspaceManager';

// =============================================================================
// Agents Module (v3.1 Agentic Choreography)
// =============================================================================

export * from './agents';

// =============================================================================
// Choreography Module (v3.1 Agentic Choreography)
// =============================================================================

export * from './choreography';

// =============================================================================
// Negotiation Module (v3.1 Agentic Choreography)
// =============================================================================

export * from './negotiation';

// =============================================================================
// Swarm Module (v3.2 Autonomous Agent Swarms)
// =============================================================================

export * as swarm from './swarm';

export {
  SwarmCoordinator,
  PSOEngine,
  ACOEngine,
  LeaderElection,
  CollectiveIntelligence,
  VotingRound,
  ContributionSynthesizer,
  SwarmManager,
  SwarmMembership,
  QuorumPolicy,
} from './swarm';

export type {
  AgentInfo,
  TaskInfo,
  PSOConfig,
  PSOResult,
  Particle,
  ACOConfig,
  ACOResult,
  LeaderElectionConfig,
  ElectionRole,
  ElectionState,
  ElectionMessage,
  VoteRequestMessage,
  VoteResponseMessage,
  HeartbeatMessage as SwarmHeartbeatMessage,
  CollectiveIntelligenceConfig,
  Vote as SwarmVote,
  VotingResult as SwarmVotingResult,
  VotingRoundConfig,
  SynthesisResult,
  SynthesizerConfig,
  SwarmInfo,
  CreateSwarmRequest,
  DisbandOptions,
  SwarmManagerConfig,
  SwarmEvent,
  MemberInfo,
  JoinRequest,
  LeaveRequest,
  MembershipEvent,
  SwarmMembershipConfig,
  QuorumConfig,
  QuorumStatus,
  QuorumState,
} from './swarm';

export {
  Vector3 as SwarmVector3,
  FlockingBehavior,
  FormationController,
  ZoneClaiming,
} from './swarm/spatial';

export type {
  IBoid,
  IFlockingConfig,
  FormationType,
  IFormationSlot,
  IFormationConfig,
  ZoneState,
  IZone,
  IZoneClaim,
  IZoneEvent,
  IZoneClaimingConfig,
} from './swarm/spatial';

export { SwarmEventBus, BroadcastChannel, GossipProtocol } from './swarm/messaging';

export type {
  EventPriority,
  ISwarmEvent,
  IEventSubscription,
  EventHandler,
  IEventBusConfig,
  IEventBusStats,
  IChannelMessage,
  IChannelSubscriber,
  IChannelConfig,
  MessageHandler as SwarmMessageHandler,
  IGossipMessage,
  IGossipPeer,
  IGossipConfig,
  GossipHandler,
  PeerSelector,
} from './swarm/messaging';

export * from './swarm/analytics';

// =============================================================================
// Recovery Module (v3.2 Self-Healing Infrastructure)
// =============================================================================

export * from './recovery';

// =============================================================================
// Render Module (v3.3 WebGPU Rendering)
// =============================================================================

export * from './rendering';

// =============================================================================
// Shader Module (v3.3 Visual Shader Graph)
// =============================================================================

export * from './shader';

// =============================================================================
// Post-Processing Module (v3.3 Screen-Space Effects)
// =============================================================================

export * from './postfx';

// =============================================================================
// Physics Module (v3.3 Rigid Body Dynamics)
// =============================================================================

// Explicit re-exports to resolve conflicts between physics and audio modules
// (both define IVector3 and zeroVector — physics is canonical source)
export { type IVector3, zeroVector } from './physics/PhysicsTypes';

export * from './physics';

// =============================================================================
// Audio Module (v3.3 Spatial Audio & Sequencing)
// =============================================================================

export * from './audio';

// =============================================================================
// Network Module (v3.3 State Synchronization)
// =============================================================================

export * as network from './network';
export {
  ConnectionState as NetworkConnectionState,
  createMessage as createNetworkMessage,
  MessageHandler as NetworkMessageHandler,
} from './network';

// =============================================================================
// WASM Parser Bridge (v3.3 Performance Optimization)
// =============================================================================

export * as wasm from './wasm';
export { WasmModuleCache, type CachedModule, type WasmModuleCacheConfig } from './wasm';
export { WasmParserBridge, type ParseResult, type WasmParserConfig } from './wasm';

// =============================================================================
// High-Frequency Sync (v3.3 60Hz Spatial Optimization)
// =============================================================================

export * as sync from './sync';
export {
  quantizePosition,
  dequantizePosition,
  compressQuaternion,
  decompressQuaternion,
  PriorityScheduler,
  JitterBuffer,
} from './sync';

// =============================================================================
// LOD Module (v3.3 Level of Detail System)
// =============================================================================

export * from './lod';

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
  SemanticCache,
  createSemanticCache,
  getGlobalSemanticCache,
  hashSourceCode,
  hashASTSubtree,
  serializeASTNode,
  cacheCompiledModule,
  getCachedCompiledModule,
  cacheASTSubtree,
  getCachedASTSubtree,
  type SemanticCacheEntryType,
  type SemanticCacheEntry,
  type CacheLookupResult,
  type SemanticCacheStats,
  type SemanticCacheOptions,
  type RedisClient,
} from './compiler/SemanticCache';

// =============================================================================
// HITL Backend Service (v3.3 Sprint 3: Safety & Testing)
// =============================================================================

export * as hitl from './hitl';
export {
  HITLBackendService,
  getHITLBackend,
  configureHITLBackend,
  HITLNotificationService,
  getNotificationService,
  configureNotifications,
} from './hitl';

// =============================================================================
// Security Utilities (v3.3 Sprint 3: Safety & Testing)
// =============================================================================

export * as security from './security';
export {
  sha256,
  sha512,
  hmacSha256,
  verifyHmacSha256,
  encrypt,
  decrypt,
  generateEncryptionKey,
  randomBytes,
  randomHex,
  randomUUID,
  validateWalletAddress,
  validateApiKey,
  sanitizeInput,
  validateUrl,
  checkRateLimit,
  resetRateLimit,
} from './security';

// =============================================================================
// OpenTelemetry Integration (Sprint 9 - Observability)
// =============================================================================

export {
  HoloScriptTelemetry,
  SpanFactory,
  MetricsCollector,
  generateTraceId,
  generateSpanId,
  createSpanObject,
  type TelemetryConfig,
  type Span as TelemetrySpan,
  type SpanEvent as TelemetrySpanEvent,
  type Metric as TelemetryMetric,
  type MetricEntry as TelemetryMetricEntry,
  type HistogramStats,
} from './telemetry';

// =============================================================================
// Messaging & Agent Protocol Bridges (v3.3 Sprint 4: Integration)
// =============================================================================

export {
  type EncryptionMode,
  type MessagePriority as MessagingMessagePriority,
  type JSONSchema,
  type ChannelConfig,
  DEFAULT_CHANNEL_CONFIG,
  type AgentChannel,
  type ChannelMember,
  type MessageStatus,
  type Message,
  type MessageAckStatus,
  type MessageAck,
  type BroadcastMessage,
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
} from './messaging/MessagingTypes';
export { AgentMessaging } from './messaging/AgentMessaging';
export {
  ProtocolBridgeRegistry,
  type IAgentProtocolBridge,
  type GenericAgentMessage,
} from './messaging/AgentProtocolBridge';

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

export {
  DegradedModeBanner,
  useDegradedMode,
  DegradedModeIndicator,
  type DegradedModeBannerProps,
} from './DegradedModeBanner';

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
} from './gpu/codecs';

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
} from './gpu/codecs';

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
export type {
  CapabilityScope,
  CapabilityRequirement,
  CapabilityCheckResult,
} from './compiler/safety/CapabilityTypes';

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

// ═══════════════════════════════════════════════════════════════════
// Culture Traits (Emergent Agent Culture)
// ═══════════════════════════════════════════════════════════════════

export {
  BUILTIN_NORMS,
  getBuiltinNorm,
  normsByCategory,
  criticalMassForChange,
} from './traits/CultureTraits';
export type { CulturalNorm, NormCategory, NormEnforcement } from './traits/CultureTraits';

export { CulturalMemory } from './agents/CulturalMemory';
export type { EpisodicMemory, StigmergicTrace, SemanticSOP } from './agents/CulturalMemory';

export { NormEngine } from './agents/NormEngine';
export type { NormViolation, NormProposal } from './agents/NormEngine';

// ═══════════════════════════════════════════════════════════════════
// Cross-Reality Handoff + Authenticated CRDTs
// ═══════════════════════════════════════════════════════════════════

export {
  negotiateHandoff,
  createMVCPayload,
  estimatePayloadSize,
  validatePayloadBudget,
} from './agents/CrossRealityHandoff';
export type {
  MVCPayload,
  DecisionEntry,
  TaskState as AgentTaskState,
  UserPreferences,
  SpatialContext,
  EvidenceEntry,
  DeviceCapabilities,
  HandoffNegotiation,
} from './agents/CrossRealityHandoff';

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
} from './agents/AuthenticatedCRDT';
export type { DID, SignedOperation, AuthenticatedAgentState } from './agents/AuthenticatedCRDT';

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
} from './marketplace/MarketplaceSubmission';
export type {
  MarketplacePackage,
  MarketplaceSubmission as MarketplaceSubmissionType,
  PackageMetadata as MarketplacePackageMetadata,
  Publisher,
  ContentCategory,
  SemanticVersion,
  SubmissionStatus,
  SubmissionConfig,
} from './marketplace/MarketplaceSubmission';

export { MarketplaceRegistry } from './marketplace/MarketplaceRegistry';
export type {
  PackageListing,
  SearchFilters as MarketplaceSearchFilters,
  SearchResult as MarketplaceSearchResult,
  InstallManifest,
} from './marketplace/MarketplaceRegistry';

// ═══════════════════════════════════════════════════════════════════
// HoloLand Runtime Integration
// ═══════════════════════════════════════════════════════════════════

export { gateCheck, RuntimeMonitor } from './runtime/SafetyGate';
export type { GateDecision, WorldSafetyPolicy, ResourceSnapshot } from './runtime/SafetyGate';

export { CultureRuntime } from './runtime/CultureRuntime';
export type { CultureEvent, CultureRuntimeConfig } from './runtime/CultureRuntime';

// ── AI: Behavior Tree ──────────────────────────────────────────────
export { BehaviorTree } from './ai/BehaviorTree';
export type { BTContext as BTTreeContext, BTTreeDef } from './ai/BehaviorTree';
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
} from './ai/BTNodes';
export type { BTStatus } from './ai/BTNodes';
export { Blackboard } from './ai/Blackboard';

// ── Dialogue ───────────────────────────────────────────────────────
export { DialogueGraph } from './dialogue/DialogueGraph';
export type {
  DialogueNode as DialogueGraphNode,
  DialogueNodeType as DialogueGraphNodeType,
  DialogueState,
} from './dialogue/DialogueGraph';
export { DialogueRunner } from './dialogue/DialogueRunner';
export type {
  DialogueNode as DialogueRunnerNode,
  DialogueNodeType as DialogueRunnerNodeType,
} from './dialogue/DialogueRunner';

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
export { AnimationEngine, Easing } from './animation/AnimationEngine';
export type {
  Keyframe,
  AnimationClip,
  ActiveAnimation,
  EasingFn,
} from './animation/AnimationEngine';

// ── Audio Engine ───────────────────────────────────────────────────
export { AudioEngine } from './audio/AudioEngine';
export type {
  AudioSourceConfig,
  AudioSource,
  ListenerState,
  DistanceModel,
} from './audio/AudioEngine';

// ── TileMap / Procedural ───────────────────────────────────────────
export { TileMap, TileFlags } from './tilemap/TileMap';
export type { TileData, TileLayer, AutoTileRule } from './tilemap/TileMap';

// ── Combat ─────────────────────────────────────────────────────────
export { CombatManager } from './combat/CombatManager';
export type {
  HitBox,
  HurtBox,
  ComboStep,
  ComboChain,
  Cooldown,
  CombatTarget,
} from './combat/CombatManager';

// ── Navigation / Pathfinding ───────────────────────────────────────
export { AStarPathfinder } from './navigation/AStarPathfinder';
export type { PathNode, PathResult, DynamicObstacle } from './navigation/AStarPathfinder';
export { NavMesh } from './navigation/NavMesh';
export type { NavPoint, NavPolygon } from './navigation/NavMesh';

// ── Shader Graph (re-export rendering) ─────────────────────────────
export { ShaderGraph, SHADER_NODES } from './rendering/ShaderGraph';
export type {
  ShaderNode,
  ShaderConnection,
  ShaderNodeDef,
  ShaderPort,
  ShaderDataType,
  CompiledShader,
  ShaderUniform,
} from './rendering/ShaderGraph';

// ── Particles (value re-export) ────────────────────────────────────
export { ParticleSystem } from './particles/ParticleSystem';
export type { Particle, EmitterConfig, EmitterShape, Color4 } from './particles/ParticleSystem';

// ── Camera ─────────────────────────────────────────────────────────
export { CameraController } from './camera/CameraController';
export type { CameraMode, CameraState, CameraConfig } from './camera/CameraController';

// ── Inventory / Gameplay ───────────────────────────────────────────
export { InventorySystem } from './gameplay/InventorySystem';
export type { ItemDef, ItemCategory, ItemRarity, InventorySlot } from './gameplay/InventorySystem';

// ── Terrain ────────────────────────────────────────────────────────
export { TerrainSystem } from './environment/TerrainSystem';
export type {
  TerrainConfig,
  TerrainLayer,
  TerrainVertex,
  TerrainChunk,
} from './environment/TerrainSystem';

// ── Lighting ───────────────────────────────────────────────────────
export { LightingModel } from './rendering/LightingModel';
export type { Light, LightType, AmbientConfig, GIProbe } from './rendering/LightingModel';

// ── Cinematic ──────────────────────────────────────────────────────
export { CinematicDirector } from './cinematic/CinematicDirector';
export type { ActorMark, CuePoint, CinematicScene } from './cinematic/CinematicDirector';
export { CameraRig } from './cinematic/CameraRig';
export { SequenceTrack } from './cinematic/SequenceTrack';

// ── Collaboration ──────────────────────────────────────────────────
export { CollaborationSession } from './collaboration/CollaborationSession';
export type {
  SessionPeer,
  SessionConfig,
  SessionStats,
  SessionState,
} from './collaboration/CollaborationSession';

// ── Security / Sandbox ─────────────────────────────────────────────
export {
  createSandbox,
  execute as executeSandbox,
  destroy as destroySandbox,
} from './security/SandboxExecutor';
export type { Sandbox, SandboxState, SandboxExecutionResult } from './security/SandboxExecutor';
export type { SecurityPolicy } from './security/SecurityPolicy';
export { createDefaultPolicy, createStrictPolicy } from './security/SecurityPolicy';

// ── Persistence / Save ─────────────────────────────────────────────
export { SaveManager } from './persistence/SaveManager';
export type { SaveSlot, SaveConfig } from './persistence/SaveManager';

// ── Debug / Profiler ───────────────────────────────────────────────
export { Profiler } from './debug/Profiler';
export type { ProfileScope, FrameProfile, MemorySnapshot, ProfileSummary } from './debug/Profiler';

// ── LOD ────────────────────────────────────────────────────────────
export { LODManager } from './lod/LODManager';
export type { LODManagerOptions } from './lod/LODManager';

// ── AI / State Machine ─────────────────────────────────────────────
export { StateMachine } from './ai/StateMachine';
export type { StateConfig, TransitionConfig, StateAction, GuardFn } from './ai/StateMachine';

// ── Input ──────────────────────────────────────────────────────────
export { InputManager } from './input/InputManager';
export type {
  KeyState,
  MouseState,
  GamepadState,
  InputAction,
  InputSnapshot,
  InputDeviceType,
} from './input/InputManager';

// ── Network ────────────────────────────────────────────────────────
export { NetworkManager } from './network/NetworkManager';
export type { NetworkMessage, PeerInfo, MessageType } from './network/NetworkManager';

// ── Animation Timeline ─────────────────────────────────────────────
export { Timeline } from './animation/Timeline';
export type { TimelineMode, TimelineEntry, TimelineConfig } from './animation/Timeline';

// ── Scene Manager ──────────────────────────────────────────────────
export { SceneManager } from './scene/SceneManager';
export type { SavedScene, SceneListEntry } from './scene/SceneManager';

// ── Asset Registry ─────────────────────────────────────────────────
export { AssetRegistry } from './assets/AssetRegistry';
export type {
  AssetEvent,
  AssetEventType,
  CacheEntry,
  RegistryConfig,
} from './assets/AssetRegistry';

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
  TextureChannel,
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

// =============================================================================
// Trait Runtime Integration (migrated from Hololand platform-core)
// =============================================================================

export {
  TraitContextFactory,
  createTraitContextFactory,
} from './runtime/TraitContextFactory';

export type {
  PhysicsProvider,
  AudioProvider,
  HapticsProvider,
  AccessibilityProvider,
  VRProvider,
  NetworkProvider,
  RendererProvider,
  TraitContextFactoryConfig,
} from './runtime/TraitContextFactory';

export {
  TraitRuntimeIntegration,
  createTraitRuntime,
} from './runtime/TraitRuntimeIntegration';

export type {
  TrackedNode,
  TraitRuntimeStats,
} from './runtime/TraitRuntimeIntegration';

// Mathematical utilities
export {
  calculateAverage,
  calculateSuccessRate,
  calculateStandardDeviation,
  calculateMedian,
} from './utils/math';

// ── Headless Runtime (CLI & Server-Side Execution) ──────────────────────────
export {
  createHeadlessRuntime,
  getProfile,
  HEADLESS_PROFILE,
  type HeadlessRuntime,
  type HeadlessRuntimeOptions,
  type RuntimeProfile,
  type RuntimeStats,
} from './runtime/HeadlessRuntime';

// ── Error Recovery (Parser Error-Handling & Suggestions) ────────────────────
export {
  ErrorRecovery,
  HOLOSCHEMA_KEYWORDS,
  HOLOSCHEMA_GEOMETRIES,
  HOLOSCHEMA_PROPERTIES,
} from './parser/ErrorRecovery';

// ── @script_test Trait (Headless Unit Testing for .hs Logic) ────────────────
export {
  ScriptTestRunner,
  SCRIPT_TEST_TRAIT,
  type ScriptTestResult,
  type ScriptTestBlock,
  type ScriptTestRunnerOptions,
} from './traits/ScriptTestTrait';

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
export { AgentOutputSchemaValidator } from './identity/AgentOutputSchemaValidator';

// ── Sprint 1: Testing & Contracts ───────────────────────────────────────────
export { TraitPropertyTesting } from './testing/TraitPropertyTesting';
export { TraitBehavioralContract } from './contracts/TraitBehavioralContract';

// ── Sprint 1: Trait Support Matrix ──────────────────────────────────────────
export { TraitSupportMatrix } from './traits/TraitSupportMatrix';

// ── Sprint 3: Mixture-of-Memory-Experts Trait Database ──────────────────────
export { MoMETraitDatabase } from './traits/MoMETraitDatabase';

// ── Sprint 3: WASM Compilation Target ───────────────────────────────────────
export { WASMCompilationTarget } from './wasm/WASMCompilationTarget';

// ── Sprint 3: Material Preset Audit ─────────────────────────────────────────
export { MaterialPresetAudit } from './materials/MaterialPresetAudit';

// ── Sprint 4: Unified PBR Schema ────────────────────────────────────────────
export { UnifiedPBRSchema } from './materials/UnifiedPBRSchema';

// ── Sprint 4: SNN vs Backprop Experiment ────────────────────────────────────
export { SNNvsBackpropExperiment } from './experiments/SNNvsBackpropExperiment';

// ── Sprint 4: Circuit Breaker Suite ─────────────────────────────────────────
export { CircuitBreakerCICD } from './circuit-breaker/CircuitBreakerCICD';
export { CircuitBreakerBenchmarks } from './circuit-breaker/CircuitBreakerBenchmarks';
export { CircuitBreakerDeployment } from './circuit-breaker/CircuitBreakerDeployment';

// ── Sprint 2: Compiler Extensions ───────────────────────────────────────────
export { COCOExporter } from './compiler/COCOExporter';
export { GLTFPipelineMCPTool } from './compiler/GLTFPipelineMCPTool';
export { NodeToyMapping } from './compiler/NodeToyMapping';
export { RemotionBridge } from './compiler/RemotionBridge';
export { ReproducibilityMode } from './compiler/ReproducibilityMode';
export { SemanticSceneGraph } from './compiler/SemanticSceneGraph';

// ── Sprint 3: Agent Inference Export ────────────────────────────────────────
export { AgentInferenceExportTarget } from './compiler/AgentInferenceExportTarget';

// ── Sprint 1: Procedural Geometry Patch ─────────────────────────────────────
export { ProceduralGeometryPatch } from './compiler/ProceduralGeometry.patch';

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
