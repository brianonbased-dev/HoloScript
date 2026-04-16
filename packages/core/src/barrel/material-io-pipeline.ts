// =============================================================================
// Material Parser (migrated from Hololand renderer)
// =============================================================================

export { HoloScriptMaterialParser } from '../parser/HoloScriptMaterialParser';
export type {
  ASTNode as MaterialASTNode,
  CompositionMaterialNode,
} from '../parser/HoloScriptMaterialParser';

export type {
  MaterialDefinition,
  HoloMaterialType,
  TextureMapDef,
  ShaderPassDef,
} from '../parser/MaterialTypes';

// =============================================================================
// Compiler Bridge (migrated from Hololand ai-bridge)
// =============================================================================

export {
  CompilerBridge,
  getCompilerBridge,
  type CompilationResult,
} from '../compiler/CompilerBridge';

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
} from '../io/HoloScriptIO';

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
} from '../io/HoloScriptIO';

// =============================================================================
// HSPlus Validator (migrated from Hololand creator-tools)
// =============================================================================

export { validateHSPlus } from '../validation/HSPlusValidator';
export type {
  ParserValidationError,
  DeviceOptimizationContext,
  CodeGenerationOptions,
  ParserRegistrationResult,
  HSPlusValidationResult,
} from '../validation/HSPlusValidator';

// =============================================================================
// HS Knowledge Parser (migrated from Hololand brittney-service)
// =============================================================================

export {
  parseMeta,
  parseKnowledge,
  parsePrompts,
  parseServerRoutes,
} from '../parser/HSKnowledgeParser';

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
} from '../parser/HSKnowledgeParser';

// ── Pipeline Parser (.hs data pipelines) ────────────────────────────────────
export { parsePipeline, isPipelineSource } from '../parser/PipelineParser';

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
} from '../parser/PipelineParser';

export {
  compilePipelineSource,
  compilePipelineToNode,
  compilePipelineToPython,
  compilePipelineSourceToNode,
  compilePipelineSourceToPython,
} from '../compiler/PipelineNodeCompiler';
export type {
  PipelineCompileTarget,
  PipelineCompilerOptions,
  PipelineNodeCompilerOptions,
  PipelinePythonCompilerOptions,
} from '../compiler/PipelineNodeCompiler';
