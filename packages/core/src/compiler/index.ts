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

// R3F (React Three Fiber)
export { R3FCompiler, ENVIRONMENT_PRESETS } from './R3FCompiler';
export type { R3FNode, AssetMaturity } from './R3FCompiler';
export type { HolomapPointCloudPayload } from './HolomapExportPayload';

// Engine-specific compilers
export { UnityCompiler } from './UnityCompiler';
export type { UnityCompilerOptions } from './UnityCompiler';
export { GodotCompiler } from './GodotCompiler';
export type { GodotCompilerOptions } from './GodotCompiler';
export { BabylonCompiler } from './BabylonCompiler';
export type { BabylonCompilerOptions } from './BabylonCompiler';
export { PlayCanvasCompiler } from './PlayCanvasCompiler';

// VR/AR/XR compilers
export { ARCompiler } from './ARCompiler';
export { OpenXRCompiler } from './OpenXRCompiler';
export type { OpenXRCompilerOptions } from './OpenXRCompiler';
export { VRChatCompiler } from './VRChatCompiler';
export { VRRCompiler } from './VRRCompiler';
export type { VRRCompilerOptions } from './VRRCompiler';

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

// Sprint 3: Agent inference
// @ts-expect-error During migration
export { AgentInferenceExportTarget } from './AgentInferenceExportTarget';

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
export type { SafetyPassResult, SafetyPassConfig } from './safety/CompilerSafetyPass';
export type { SafetyReport, SafetyVerdict } from './safety/SafetyReport';
export type { LinearCheckerConfig } from './safety/LinearTypeChecker';
export type { InferredEffects } from './safety/EffectInference';
export {
  createPlatformTarget,
  filterCompositionForPlatform,
  matchesPlatformConstraint,
  normalizePlatformName,
} from './PlatformConditionalCompilerMixin';
export type { CompilePlatformTarget } from './PlatformConditionalCompilerMixin';
export {
  selectModality,
  selectModalityForAll,
  bestCategoryForTraits,
} from './platform/ModalitySelector';
export type { ModalitySelection, ModalitySelectorOptions } from './platform/ModalitySelector';

// USDZ pipeline
export { USDZPipeline } from './USDZPipeline';
export type { USDZPipelineOptions } from './USDZPipeline';

// Compiler bridge
export { CompilerBridge } from './CompilerBridge';
export { Native2DCompiler } from './Native2DCompiler';
export type { Native2DCompilerOptions } from './Native2DCompiler';
export { SCMCompiler } from './SCMCompiler';
export type { SCMCompilerOptions, AffectiveState, SCMDAG } from './SCMCompiler';
export { mergeSocialCausalModels } from './social-causality';
export type {
  SocialMergeOptions,
  SocialMergeReport,
  SocialMergeResult,
} from './social-causality';
export {
  AgentTrustLedger,
  byzantineResilientMerge,
} from './social-causality-byzantine';
export type {
  AgentTrustEntry,
  ByzantineMergeOptions,
  ByzantineMergeReport,
  ByzantineMergeResult,
} from './social-causality-byzantine';

// v6 Service compilers (v5.2 experimental)
export { NodeServiceCompiler } from './NodeServiceCompiler';
export type { NodeServiceCompilerOptions } from './NodeServiceCompiler';

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

// FlatSemanticCompiler — V6 @semantic_entity / @2d_canvas → R3F output.
// Merged from @holoscript/semantic-2d (2026-04-29) — 0 consumers + the
// file header already self-identified as living under
// @holoscript/core/compiler. Companion: traits/v6/Semantic2DTraits.ts.
export { FlatSemanticCompiler } from './FlatSemanticCompiler';
export type { FlatSemanticCompilerOptions } from './FlatSemanticCompiler';

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

// Matterpak importer — bridge ingest from Matterport capture bundles (OBJ + XYZ + E57)
// Source: research/2026-05-10_3d-real-estate-virtual-tour.md (Path A)
export { MatterpakCompiler, createMatterpakCompiler } from './MatterpakCompiler';
export type {
  MatterpakCompilerOptions,
  MatterpakCompileResult,
  MatterpakBundle,
  PointCloud,
} from './MatterpakCompiler';

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

// HoloGram MLS compiler — 2D listing photos → depth-estimated 3D gallery
// Source: research/2026-05-10_3d-real-estate-virtual-tour.md (Path C)
export { HoloGramMLSCompiler, createHoloGramMLSCompiler } from './HoloGramMLSCompiler';
export type {
  HoloGramMLSCompilerOptions,
  HoloGramMLSCompileResult,
  HoloGramMLSBundle,
  MLSPhoto,
} from './HoloGramMLSCompiler';
