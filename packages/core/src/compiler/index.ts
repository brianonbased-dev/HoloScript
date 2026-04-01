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
export type { R3FNode } from './R3FCompiler';

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

// Specialized compilers
export { SDFCompiler } from './SDFCompiler';
export type { SDFCompilerOptions } from './SDFCompiler';
export { DTDLCompiler } from './DTDLCompiler';
export { URDFCompiler } from './URDFCompiler';
export { USDPhysicsCompiler } from './USDPhysicsCompiler';
export { StateCompiler } from './StateCompiler';
export { TraitCompositionCompiler } from './TraitCompositionCompiler';
export { IncrementalCompiler } from './IncrementalCompiler';
export { MultiLayerCompiler } from './MultiLayerCompiler';

// Sprint 2 extensions
export { COCOExporter } from './COCOExporter';
export { GLTFPipelineMCPTool } from './GLTFPipelineMCPTool';
export { NodeToyMapping } from './NodeToyMapping';
export { RemotionBridge } from './RemotionBridge';
export { ReproducibilityMode } from './ReproducibilityMode';
export { SemanticSceneGraph } from './SemanticSceneGraph';

// Sprint 3: Agent inference
export { AgentInferenceExportTarget } from './AgentInferenceExportTarget';

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
export type { CompilePlatformTarget } from './PlatformConditionalCompilerMixin';
export { selectModality, selectModalityForAll, bestCategoryForTraits } from './platform/ModalitySelector';
export type { ModalitySelection, ModalitySelectorOptions } from './platform/ModalitySelector';

// USDZ pipeline
export { USDZPipeline } from './USDZPipeline';
export type { USDZPipelineOptions } from './USDZPipeline';

// Compiler bridge
export { CompilerBridge } from './CompilerBridge';
export { Native2DCompiler } from './Native2DCompiler';
export type { Native2DCompilerOptions } from './Native2DCompiler';

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
