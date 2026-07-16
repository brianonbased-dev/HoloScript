/**
 * @holoscript/core/compiler — Multi-Target Compiler Public API
 *
 * Re-exports CompilerBase and all compile targets for downstream
 * consumption by @holoscript/compiler.
 */

// Base compiler infrastructure
export {
  CompilerBase,
  UnauthorizedCompilerAccessError,
  isCapabilityTokenCredential,
  createTestCompilerToken,
} from './CompilerBase';
export type {
  ICompiler,
  CompilerToken,
  CapabilityTokenCredential,
  BaseCompilerOptions,
  CompilationResult,
} from './CompilerBase';

// Triple-output documentation generator
export { CompilerDocumentationGenerator } from './CompilerDocumentationGenerator';
export type {
  TripleOutputResult,
  TripleOutputGenerationMeta,
  MCPServerCard,
  MCPServerInfo,
  MCPTransportConfig,
  MCPCapabilities,
  MCPEndpoints,
  MCPAuthentication,
  MCPToolManifest,
  DocumentationGeneratorOptions,
} from './CompilerDocumentationGenerator';

// Scene IR types — stable interface for renderer and Studio consumers.
// R3FCompiler and the other apex-poison web compilers have been retired (parity gate green 2026-06-17).
export type { R3FNode, SceneIRNode, AssetMaturity } from './scene-ir-types';
export { SceneIRCompiler } from './SceneIRCompiler';
export type { SceneIRCompilerOptions, QualityTier } from './SceneIRCompiler';
export { emitSceneIRTsx } from './SceneIRTsxEmitter';
export type { SceneIRTsxEmitterOptions } from './SceneIRTsxEmitter';
export type { HolomapPointCloudPayload } from './HolomapExportPayload';
export {
  SCIENTIFIC_COLOR_MAPS,
  analyzePerceptualColor,
  applyPerceptualColorPass,
  buildPerceptualGradient,
  buildPerceptualPalette,
  hexToSrgb,
  normalizeHexColor,
  srgbToHex,
} from './PerceptualColorPass';
export type {
  PerceptualColorMapResult,
  PerceptualColorPassInput,
  PerceptualColorPassOptions,
  PerceptualColorPassResult,
  PerceptualColorPassSource,
  PerceptualGradientResult,
  PerceptualGradientStop,
  PerceptualPaletteResult,
} from './PerceptualColorPass';

// Engine-specific compilers
export { UnityCompiler } from './UnityCompiler';
export type { UnityCompilerOptions } from './UnityCompiler';
export { GodotCompiler } from './GodotCompiler';
export type { GodotCompilerOptions } from './GodotCompiler';
// BabylonCompiler, PlayCanvasCompiler — retired (apex-poison, 2026-06-17)

// VR/AR/XR compilers
// ARCompiler — retired (apex-poison, 2026-06-17)
export { OpenXRCompiler } from './OpenXRCompiler';
export type { OpenXRCompilerOptions } from './OpenXRCompiler';
export { VRChatCompiler } from './VRChatCompiler';
// VRRCompiler — retired (apex-poison, 2026-06-17)

// Platform compilers
export { VisionOSCompiler } from './VisionOSCompiler';
export type { VisionOSCompilerOptions } from './VisionOSCompiler';
export { AndroidCompiler } from './AndroidCompiler';
export { AndroidXRCompiler } from './AndroidXRCompiler';
export { IOSCompiler } from './IOSCompiler';

// Low-level compilers
export { WASMCompiler } from './WASMCompiler';
export { WebGPUCompiler } from './WebGPUCompiler';
export type { WebGPUCompilerOptions } from './WebGPUCompiler';
export { PhysicsColliderCompiler } from './PhysicsColliderCompiler';
export type { PhysicsWorld, PhysicsCollider } from './PhysicsColliderCompiler';
export { SpatialAudioCompiler } from './SpatialAudioCompiler';
export type { AudioSceneModel } from './SpatialAudioCompiler';
export { DesktopGPUCompiler } from './DesktopGPUCompiler';
export { PathTracerCompiler } from './PathTracerCompiler';
export type { PathTracerOptions } from './PathTracerCompiler';
export { CpuPathTracer } from './CpuPathTracer';
export type { CpuRenderOptions, CpuImage } from './CpuPathTracer';
export { MediaPipelineCompiler } from './MediaPipelineCompiler';
export type { MediaOptions, MediaClip } from './MediaPipelineCompiler';
export { ComputePhysicsCompiler } from './ComputePhysicsCompiler';
export type { PhysicsSimOptions } from './ComputePhysicsCompiler';

// Platform-conditional compilation (public facade for Adaptive Platform Layers)
export {
  PlatformConditionalCompilerMixin,
  createPlatformTarget,
} from './PlatformConditionalCompilerMixin';
export type { CompilePlatformTarget } from './PlatformConditionalCompilerMixin';

// Specialized compilers
export { SDFCompiler } from './SDFCompiler';
export type { SDFCompilerOptions } from './SDFCompiler';
export { DTDLCompiler } from './DTDLCompiler';
export { URDFCompiler, createURDFCompiler } from './URDFCompiler';
export { USDPhysicsCompiler } from './USDPhysicsCompiler';
export { FMUCompiler, absorbFMU, compileToFMU } from './FMUCompiler';
export type {
  AbsorbFMUInput,
  AbsorbFMUResult,
  FMUCompileResult,
  FMUCompilerOptions,
  FMUManifest,
  FMUMode,
  FMUPort,
} from './FMUCompiler';
export { StateCompiler } from './StateCompiler';
export { TraitCompositionCompiler } from './TraitCompositionCompiler';
export { IncrementalCompiler, createIncrementalCompiler } from './IncrementalCompiler';
export { MultiLayerCompiler } from './MultiLayerCompiler';

// Sprint 2 extensions
export { COCOExporter } from './COCOExporter';

// Next.js compilers (public barrel exports)
export { NextJSCompiler } from './NextJSCompiler';
export type { NextJSCompilerOptions, NextJSCompileResult } from './NextJSCompiler';
export { compileToNextJSAPI, compileAllToNextJSAPI, NextJSAPICompiler } from './NextJSAPICompiler';
export type { NextJSAPICompilerOptions, NextJSAPICompileResult } from './NextJSAPICompiler';
export { GLTF_PIPELINE_TOOLS, registerGLTFTools } from './GLTFPipelineMCPTool';
export {
  BUSINESS_QUEST_TOOLS,
  registerBusinessQuestTools,
  handleBusinessQuestToolCall,
  buildVRRCompositionFromDraft,
  validateBusinessVRRDraft,
  draftToHoloPreview,
  businessVRRDraftSchema,
} from './BusinessQuestTools';
export type {
  BusinessVRRDraft,
  BusinessQuestValidationIssue,
  BusinessQuestValidationResult,
} from './BusinessQuestTools';
export { NodeToyMapper, mapNodeToyToShader } from './NodeToyMapping';
export { RemotionBridge } from './RemotionBridge';
export { createReproducibilityContext, parseReproducibilityFlags } from './ReproducibilityMode';
export type { ReproducibilityContext, ReproducibilityConfig } from './ReproducibilityMode';
export { SemanticSceneGraph } from './SemanticSceneGraph';
export { MCPConfigCompiler } from './MCPConfigCompiler';
export type { MCPConfigCompilerOptions, MCPConfigTarget } from './MCPConfigCompiler';
export { HoloMCPCompiler } from './HoloMCPCompiler';
export type {
  HoloMCPCompilerOptions,
  HoloMCPTool,
  HoloParamAnnotation,
} from './HoloMCPCompiler';

// Studio native code editor compiler (CodeMirror 6 config bundle)
export { CodeEditorCompiler } from './CodeEditorCompiler';
export type { CodeEditorConfig, CodeEditorCompilerOptions } from './CodeEditorCompiler';

// Sprint 3: Agent inference
export {
  AgentInferenceCompiler,
  createAgentInferenceCompiler,
  createPythonAgentInferenceCompiler,
  default as AgentInferenceExportTarget,
} from './AgentInferenceExportTarget';
export type {
  AgentDefinition,
  AgentInferenceCompilerOptions,
  AgentInferenceResult,
  ModelConfig,
  ModelProvider,
  OutputLanguage,
  ToolDefinition,
} from './AgentInferenceExportTarget';
export {
  OmnigentAgentYamlCompiler,
  createOmnigentAgentYamlCompiler,
} from './OmnigentAgentYamlCompiler';
export type {
  OmnigentAgentYamlCompilerOptions,
  OmnigentAgentYamlResult,
  OmnigentProjectionReceipt,
  OmnigentProjectionTarget,
  OmnigentProjectionWarning,
  OmnigentWarningCode,
} from './OmnigentAgentYamlCompiler';

// DaimonSeed compiler: portable seed recipe, shared JSON-Logic thresholds, no soul serialization.
export {
  DaimonSeedCompiler,
  computeExportFidelity,
  createDaimonSeedCompiler,
  runHysteresisExp2,
} from './DaimonSeedCompiler';
export type {
  DaimonCompositionPriors,
  DaimonFieldPriors,
  DaimonSeedCompilerOptions,
  DaimonSeedIR,
  DaimonSeedSchemaVersion,
  DaimonSeedThresholdPreview,
  DaimonSeedThresholdRuntime,
  ExportFidelityInput,
  ExportFidelityResult,
  HysteresisExp2Input,
  HysteresisExp2Result,
} from './DaimonSeedCompiler';

// HSI-IR Stage-A vertical slice: HS-Core lowering, exact traces, LearningGraph, audit plane.
export {
  HSIIRCompiler,
  createHSIIRCompiler,
  lowerCompositionToHSIIR,
  lowerHoloExpression,
  HSI_OBSERVATION_MEDIATOR_EDGE,
} from './HSIIRCompiler';
export { runExactTrace } from './HSIExactTrace';
export { projectLearningGraph } from './HSILearningGraph';
export {
  runHSIAudit,
  generateAuditCases,
  renameComposition,
  renameTrace,
  reorderComposition,
  applyIntervention,
  behavioralProjection,
} from './HSIAuditVerifier';
export {
  HSIAdmissionError,
  HSI_IR_SCHEMA_VERSION,
  HSI_TRACE_SCHEMA_VERSION,
  HSI_LEARNING_GRAPH_SCHEMA_VERSION,
  HSI_AUDIT_SCHEMA_VERSION,
  hsiStableStringify,
  hsiSha256,
  hsiSourceTextDigest,
} from './HSIIRTypes';
export type {
  HSIIRDocument,
  HSIIRSchemaVersion,
  HSIEntity,
  HSIRelation,
  HSIStateField,
  HSIObservationRule,
  HSIEventHandler,
  HSIEffect,
  HSIAssignEffect,
  HSIEmitEffect,
  HSIBranchEffect,
  HSIStateMachine,
  HSIMachineInput,
  HSITransition,
  HSIPredicate,
  HSIScalar,
  HSISourceSpan,
  HSIOpacity,
  HSIAccess,
  HSIScenarioStep,
  HSITrace,
  HSITraceStep,
  HSITraceEffectRecord,
  HSITraceTransitionRecord,
  HSILearningGraph,
  HSILearningNode,
  HSILearningEdge,
  HSILearningNodeType,
  HSILearningEdgeType,
  HSIIntervention,
  HSIAuditCase,
  HSIAuditCheckResult,
  HSIAuditManifest,
} from './HSIIRTypes';
export type { HSIIRLoweringOptions } from './HSIIRCompiler';
export type { HSIRenameMap, HSICompositionIntervention, HSIAuditInput } from './HSIAuditVerifier';

// Agent context compiler
export { ContextCompiler, ContextCompileError, createContextCompiler } from './ContextCompiler';
export type {
  ContextAST,
  ContextAuthorityOrder,
  ContextCitationRule,
  ContextCompileResult,
  ContextCompilerOptions,
  ContextDefault,
  ContextEmitFormat,
  ContextEscalation,
  ContextFeedback,
  ContextGapRule,
  ContextGraduatedWisdom,
  ContextHardDont,
  ContextHardPhysicalGap,
  ContextIdentity,
  ContextInclude,
  ContextOutputShape,
  ContextProductionRule,
  ContextRefusal,
  ContextRoutine,
  ContextSkill,
  ContextSurface,
  ContextValidationDiagnostic,
  ContextVerifyToken,
  ContextVisionPillar,
} from './ContextCompiler';

// LLM provider capability matrix compiler
export {
  LLMProviderCapabilitiesCompiler,
  LLMCapabilityCompileError,
  createLLMProviderCapabilitiesCompiler,
} from './LLMProviderCapabilitiesCompiler';
export type {
  LLMCapability,
  LLMCapabilityCompileResult,
  LLMCapabilityCompilerOptions,
  LLMCapabilityEmitFormat,
  LLMCapabilityMatrixAST,
  LLMCapabilityMatrixMeta,
  LLMCapabilityValidationDiagnostic,
  LLMHardDont,
  LLMModel,
  LLMModelStatus,
  LLMProvider,
  LLMProviderStatus,
  LLMRoutingRecommendation,
  LLMSuperpower,
} from './LLMProviderCapabilitiesCompiler';

// Procedural geometry (shared between GLTF pipeline and R3F renderer)
export {
  generateSplineGeometry,
  generateHullGeometry,
  generateMembraneGeometry,
} from './ProceduralGeometry';
export type { GeometryData, BlobDef } from './ProceduralGeometry';

// Safety subsystem
export { runSafetyPass, quickSafetyCheck } from './safety/CompilerSafetyPass';
export {
  assertAuthorityEffects,
  checkAuthorityEffects,
  collectAuthorityEffectNodes,
  CompileTimeAuthorityEffectError,
  REQUIRED_SANDBOX_AUTHORITY_EFFECT,
  SANDBOX_AUTHORITY_TRAIT,
} from './safety/CompilerSafetyPass';
export type {
  AuthorityEffectCheckOptions,
  AuthorityEffectCheckResult,
  SafetyPassResult,
  SafetyPassConfig,
} from './safety/CompilerSafetyPass';
export type { SafetyReport, SafetyVerdict } from './safety/SafetyReport';
export type { LinearCheckerConfig } from './safety/LinearTypeChecker';
export type { InferredEffects } from './safety/EffectInference';
export {
  filterCompositionForPlatform,
  matchesPlatformConstraint,
  normalizePlatformName,
} from './PlatformConditionalCompilerMixin';
export {
  selectModality,
  selectModalityForAll,
  bestCategoryForTraits,
} from './platform/ModalitySelector';
export type { ModalitySelection, ModalitySelectorOptions } from './platform/ModalitySelector';

// Authority analysis — cross-file symbol table + server/client bundle split (P2.0)
export {
  AuthoritySymbolGraph,
  createAuthoritySymbolGraph,
  mostRestrictiveTier,
} from './authority/AuthoritySymbolGraph';
export type {
  AuthorityTier,
  AuthoritySymbolKind,
  AuthoritySymbol,
  AuthoritySymbolInput,
  AuthorityViolation,
  AuthorityPartition,
} from './authority/AuthoritySymbolGraph';
export {
  buildColyseusAuthorityGraph,
  buildColyseusCrossFileContext,
  COLYSEUS_SCHEMA_FIELD_TIERS,
  COLYSEUS_CONSTANT_TIERS,
  COLYSEUS_EMIT_FILE,
} from './authority/ColyseusAuthorityManifest';
export type {
  SchemaClassTiers,
  ColyseusCrossFileContext,
} from './authority/ColyseusAuthorityManifest';
export { splitServerAuthority } from './authority/ServerAuthorityBundleSplitter';
export type {
  ServerAuthoritySplit,
  AuthorityProof,
} from './authority/ServerAuthorityBundleSplitter';

// Provenance bounds — @provably_bounded proof obligations (single-file + cross-file)
export { ProvenanceBoundsChecker, createProvenanceBoundsChecker } from './ProvenanceBoundsChecker';
export type {
  ProvabilityReport,
  ProofObligation,
  ExploitClass,
  ObligationStatus,
  ProvenanceBoundsConfig,
  CrossFileContext,
} from './ProvenanceBoundsChecker';

// USDZ pipeline
export { USDZPipeline } from './USDZPipeline';
export type { USDZPipelineOptions } from './USDZPipeline';

// Quantum circuit compiler (OpenQASM 3.0 / IBM Quantum bridge)
export { QuantumCircuitCompiler } from './QuantumCircuitCompiler';
export type { QASMOutput, QuantumAtom } from './QuantumCircuitCompiler';

// Compiler bridge
export { CompilerBridge } from './CompilerBridge';
// Native2DCompiler — retired (apex-poison, 2026-06-17)
export { Vector2DCompiler } from './Vector2DCompiler';
export type { Vector2DCompileOptions, Vector2DCompileResult } from './Vector2DCompiler';
export { SCMCompiler } from './SCMCompiler';
export type { SCMCompilerOptions, AffectiveState, SCMDAG } from './SCMCompiler';
export { mergeSocialCausalModels } from './social-causality';
export type { SocialMergeOptions, SocialMergeReport, SocialMergeResult } from './social-causality';
export { AgentTrustLedger, byzantineResilientMerge } from './social-causality-byzantine';
export type {
  AgentTrustEntry,
  ByzantineMergeOptions,
  ByzantineMergeReport,
  ByzantineMergeResult,
} from './social-causality-byzantine';

// v6 Service compilers (v5.2 experimental)
export { NodeServiceCompiler } from './NodeServiceCompiler';
export type { NodeServiceCompilerOptions } from './NodeServiceCompiler';
export { SDKCompiler } from './SDKCompiler';
export type { SDKCompilerLanguage, SDKCompilerOptions } from './SDKCompiler';

// SVG compiler (sovereign 2D vector output — no third-party engine required)
export { SVGCompiler } from './SVGCompiler';
export type { SVGCompilerOptions, SVGCompilationResult } from './SVGCompiler';

// Edge compiler — generic Ollama-capable edge device deployment bundle (Jetson, RPi, The Unit)
export { EdgeCompiler } from './EdgeCompiler';
export type { EdgeCompilerOptions, EdgeBundle, EdgeBundleFile } from './EdgeCompiler';
export { LlamaServerCompiler } from './LlamaServerCompiler';
export type {
  LlamaServerBundle,
  LlamaServerBundleFile,
  LlamaServerCompilerOptions,
  LlamaServerLoraAdapter,
} from './LlamaServerCompiler';
// HoloScript -> GBNF grammar generator — the `grammar: "holoscript"` constrained-decode path.
export {
  generateHoloScriptGbnf,
  isHoloScriptGrammarPreset,
  HOLOSCRIPT_GRAMMAR_PRESETS,
  DEFAULT_OBJECT_KEYWORDS,
  DEFAULT_PRIMITIVE_SHAPES,
  DEFAULT_MATERIAL_KEYWORDS,
} from './holoscript-gbnf';
export type { HoloScriptGbnfOptions, HoloScriptGrammarPreset } from './holoscript-gbnf';

// MLIR-style dialect registry
export { DialectRegistry, ensureDialectsBooted } from './DialectRegistry';
export type {
  DialectDescriptor,
  DialectInfo,
  DialectDomain,
  DialectRiskTier,
  LoweringPass,
  LoweringContext,
  LoweringResult,
  LoweringDiagnostic,
} from './DialectRegistry';

// Dialect boot (registers all compilers as dialects)
export { registerBuiltinDialects } from './registerBuiltinDialects';

// Unreal PCG graph compiler
export {
  PCGGraphCompiler,
  compilePCGGraphFromBlocks,
  compileToPCGGraph,
  pcgGraphToUnrealXml,
  PCG_GRAPH_SCHEMA,
} from './PCGGraphCompiler';
export type {
  PCGGraphCompileOptions,
  PCGGraphCompileResult,
  PCGGraphEdge,
  PCGGraphIR,
  PCGGraphNode,
  PCGGraphNodeKind,
  PCGGraphPort,
  PCGPortType,
} from './PCGGraphCompiler';

// Pipeline compiler (.hs pipeline -> Node.js index.mjs)
export {
  compilePipelineSource,
  compilePipelineToNode,
  compilePipelineToPython,
  compilePipelineSourceToNode,
  compilePipelineSourceToPython,
} from './PipelineNodeCompiler';
export type {
  PipelineCompileTarget,
  PipelineCompilerOptions,
  PipelineNodeCompilerOptions,
  PipelinePythonCompilerOptions,
} from './PipelineNodeCompiler';

// FlatSemanticCompiler — retired (apex-poison, 2026-06-17).
// Was: V6 @semantic_entity / @2d_canvas → R3F output. Native renderer replaces this path.

// DispatchPolicy — NN-Primary, CPU-Backup HoloScript Inversion
// Source: research/2026-05-09_nn-primary-cpu-backup-holoscript-EVOLVED.md
export {
  DispatchPolicy,
  DispatchTier,
  AlphaTracker,
  createTier3CpuDirectOutput,
  detectWasmRuntime,
  runCompilerWasmSnnEmulator,
} from './dispatch/DispatchPolicy';
export type {
  DispatchEffectVerifierResult,
  DispatchPolicyConfig,
  DispatchProposalProvider,
  DispatchableOperation,
  DispatchDecision,
  DispatchMetrics,
  Tier3CpuDirectOutput,
  Tier3CpuExecutor,
  Tier1WasmEmulatorResult,
  Tier1WasmExecutor,
  Tier1WasmRuntimeProbe,
  Tier1WasmRuntimeProbeResult,
  TraitEquivalenceOracle,
  TraitEquivalenceOracleInput,
  TraitEquivalenceOracleResult,
} from './dispatch/DispatchPolicy';
export {
  DEFAULT_DISPATCH_LATENCY_OPERATION,
  createDefaultDispatchLatencyScenarios,
  formatDispatchLatencyBenchmarkReport,
  recommendDispatchPolicyDefaults,
  runDispatchPolicyLatencyBenchmark,
} from './dispatch/DispatchPolicyBenchmark';
export type {
  DispatchLatencyBenchmarkOptions,
  DispatchLatencyBenchmarkReport,
  DispatchLatencyBenchmarkScenario,
  DispatchLatencySample,
  DispatchLatencySummary,
  DispatchTierDefaultRecommendation,
} from './dispatch/DispatchPolicyBenchmark';

// Spatial Partition Pass — compile-time octree-of-GaussianAnchors (WIRE-1)
// Bridges core/compiler output to engine's OctreeLODSystem and SplatChunkStore (WIRE-3)
export { SpatialPartitionPass, spatialPartition } from './SpatialPartitionPass';
export type {
  SpatialAnchor,
  SpatialBounds,
  SpatialPartitionResult,
  SpatialPartitionPassOptions,
} from './SpatialPartitionPass';

// Gaussian Splatting compiler — KHR_gaussian_splatting glTF extension
export {
  GaussianSplattingCompiler,
  createGaussianSplattingCompiler,
  detectMultiUserSharedSort,
  SHARED_SORT_SHADER_PATH,
} from './GaussianSplattingCompiler';
export type {
  GaussianSplattingCompilerOptions,
  GaussianSplattingExtendedResult,
} from './GaussianSplattingCompiler';

// 3D Tiles compiler - 3D Tiles 1.1 tileset plus Gaussian splat tile payloads
export {
  ThreeDTilesCompiler,
  compileTo3DTiles,
  createThreeDTilesCompiler,
  streamWorldTiles,
} from './ThreeDTilesCompiler';
export type {
  StreamWorldTilesResult,
  ThreeDTilesCompileResult,
  ThreeDTilesCompilerOptions,
  ThreeDTilesLodLevel,
  ThreeDTilesManifest,
  ThreeDTilesTile,
  ThreeDTilesTileManifest,
  ThreeDTilesTileset,
} from './ThreeDTilesCompiler';

// Gaussian training compiler — compile_to_gaussian_train (SOVEREIGN: native GaussianTrainer3D, $0)
export {
  GaussianTrainCompiler,
  createGaussianTrainCompiler,
  GaussianTrainConfigError,
  SOVEREIGN_TRAIN_EXECUTOR,
  REMOTE_TRAIN_EXECUTOR,
} from './GaussianTrainCompiler';
export type { GaussianTrainJob, GaussianTrainCompilerOptions } from './GaussianTrainCompiler';

// APL WIT / trait-evaluation surface — unified bridge for WASM worlds
export {
  queryTrait,
  generateTraitForTarget,
  listTraitsForTarget,
  traitExists,
  getTraitInfo,
} from './TraitRegistryBridge';
export type { TraitQueryOptions, TraitInfo } from './TraitRegistryBridge';

// APL WIT-2 — Stable platform-compiler plugin interface + lazy WASM plugins
export {
  type PlatformCompilerPlugin,
  type PlatformPluginMetadata,
  type CompileResult,
  type Diagnostic,
  type TraitCompileContext,
  type TraitCompileOutput,
  type PluginManifest,
  platformPluginRegistry,
  manifestFromPlugin,
  getAllManifests,
} from './platform/PlatformCompilerPlugin';
export { WebGPUWGSLPlugin } from './platform/plugins/WebGPUWGSLPlugin';
export { AndroidARCorePlugin } from './platform/plugins/AndroidARCorePlugin';

// Native-vs-bridge registry (founder 2026-06-05) — machine-readable SSOT for D.006's
// sovereign/bridge split, so native engines are countable, promotable, deletion-guardable.
export {
  SOVEREIGN_TARGETS,
  BRIDGE_TARGETS,
  NATIVE_COMPILE_MODES,
  SOVEREIGN_ENGINES,
  isSovereignTarget,
  isBridgeTarget,
  targetSovereignty,
} from './sovereign-targets';
export type { SovereignEngine } from './sovereign-targets';
