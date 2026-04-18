import type { Vector3 } from './types';
// Legacy Compatibility Barrel
export {
  ParsedObject,
  ActionDefinition,
  TemplateDefinition,
  EnvironmentConfig,
  CompositionLogic,
  ParsedComposition,
  CompositionParser,
  parsePosition,
  parseScale,
  CompositionParseError,
  parseComposition,
  parseHoloComposition,
  parseHsPlusComposition,
} from './composition/CompositionParser';

// Constants (New)
export * from './constants';

// Determinism harness — cross-backend empirical probing infrastructure
// for Paper #2 (SNN), P2-0 (retargeting), P2-1 (IK), P3-CENTER (rendering)
export {
  DeterminismHarness,
  captureEnvironment,
  hashBytes,
  describeEnvironment,
} from './testing/DeterminismHarness';
export type {
  EnvironmentInfo,
  GpuInfo,
  NodeInfo,
  BrowserInfo,
  ProbeResult,
  DivergenceGroup,
  DivergenceReport,
  HarnessOptions,
} from './testing/DeterminismHarness';

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
export {
  HoloCompositionParser,
  parseHolo,
  parseHoloStrict,
  parseHoloPartial,
} from './parser/HoloCompositionParser';
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

// HoloScript+ Enhanced Parser with Trait Annotations
// NOTE: HoloScriptTraitAnnotationParser alias removed (deprecated, no consumers).
// MaterialTraitAnnotation, LightingTraitAnnotation, RenderingTraitAnnotation,
// GraphicsConfiguration are available via direct import from './HoloScriptPlusParser'.

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

// Headless Runtime — see './runtime/profiles' re-export block below (line ~1929)

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

export { emotionalVoiceHandler, type EmotionalVoiceConfig } from './traits/EmotionalVoiceTrait';

export { userMonitorHandler, type UserMonitorConfig } from './traits/UserMonitorTrait';

// Core UI Components (Sprint 6)
export { createUIButton, type UIButtonConfig } from './ui/UIButton';
export { createUIPanel, type UIPanelConfig } from './ui/UIPanel';

// HoloScript+ State Management (NEW)
export {
  ReactiveState,
  createState,
  reactive,
  effect,
  computed,
  bind,
  ExpressionEvaluator,
} from './state/ReactiveState';

// HoloScript+ State Sync & Networking (NEW - Phase 5)




// Performance Monitoring (Phase 7)
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
  StateMachineNode,
  StateNode,
  TransitionNode,
  StorageAPI,
  DeviceAPI,
  InputAPI,
} from './types';

// HoloScript R3F Compiler (NEW)
export { R3FCompiler, type R3FNode, ENVIRONMENT_PRESETS } from './compiler/R3FCompiler';

// Provenance / semiring algebra
export * from './compiler/traits/Semiring';
export * from './compiler/traits/ProvenanceSemiring';

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
  TraitCompositionCompiler,
  type TraitCompositionDecl,
  type ComposedTraitDef,
  type ComponentTraitHandler,
} from './compiler/TraitCompositionCompiler';

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

export { AdvancedCompression } from './export/compression/AdvancedCompression';
export type { CompressionOptions } from './export/compression/CompressionTypes';

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
  type TraitDefinition as GraphTraitDefinition,
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
  // SchemaDiff exports
  diffState,
  buildMigrationChain,
  snapshotState,
  applyAutoMigration,
  type SchemaDiffResult,
  type MigrationChain,
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
  type PackageManifest as RegistryPackageManifest,
  type PackageMetadata,
  type SearchResult,
  type ResolvedDependency,
  type InstallResult,
} from '@holoscript/platform';

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
  ParticleSystem as TypesParticleSystem,

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
