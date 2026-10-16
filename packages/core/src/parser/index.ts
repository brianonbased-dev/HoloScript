export {
  HoloScriptPlusParser,
  createParser,
  parse,
  preprocessAgentBrainSource,
  type AgentBrainSourceHeader,
  type ASTProgram,
  type HSPlusCompileResult,
  type HSPlusNode,
  type HSPlusParseResult,
  type HSPlusParserOptions,
  type HSPlusStructField,
  type PreparedAgentBrainSource,
  type HoloBrainDecl,
  type HoloBrainIdentity,
  type HoloBrainState,
} from './HoloScriptPlusParser';
export {
  TypeScriptHsplusGrammar,
  normalizeHsplusGrammarErrors,
  type HsplusGrammar,
  type HsplusGrammarError,
  type HsplusGrammarParseResult,
  type HsplusGrammarSource,
  type HsplusGrammarValidationResult,
} from './HsplusGrammar';

export {
  HoloCompositionParser,
  parseHolo,
  parseHoloStrict,
  parseHoloPartial,
  tokenizeHoloSource,
  type HoloSourceToken,
} from './HoloCompositionParser';

export {
  ChunkBasedIncrementalParser,
  parseIncrementalChunks,
  type IncrementalParseResult,
} from './IncrementalParser';

export { ParseCache, globalParseCache } from './ParseCache';
export type { CachedNode, ParseCacheStats } from './ParseCache';

// Compiler-native package imports. The alias avoids colliding with the LSP's
// filesystem-oriented ImportResolver on the root compatibility barrel.
export { ImportResolver as PackageImportResolver } from './ImportResolver';
export type {
  ImportResolveOptions as PackageImportResolveOptions,
  ImportResolutionResult as PackageImportResolution,
  RegistryPackageCacheEntry,
  RegistryPackageLockPin,
} from './ImportResolver';

export type { HoloParseResult, HoloParseError, HoloParserOptions } from './HoloCompositionTypes';
export type { HoloContract, HoloContractClause } from './HoloCompositionTypes';
export type { HoloTopic, HoloChannel, HoloConnection } from './HoloCompositionTypes';

// Grammar module registry — MLIR-style-registry proof-slice mirroring
// compiler/DialectRegistry.ts on the parser side (task_1783037937631_acwr).
export { GrammarModuleRegistry } from './GrammarModuleRegistry';
export type { GrammarModuleDescriptor, GrammarModuleInfo } from './GrammarModuleRegistry';

export {
  checkLikeness,
  likenessTraitName,
  LIKENESS_SOURCES,
  SOURCE_GATED_TRACKING,
  LIKENESS_CODE,
  type ConsentRules,
  type LikenessFinding,
  type LikenessSource,
} from '../validation/LikenessCheck';
export {
  isKnownTrait,
  findUnknownTraits,
  collectTraitUses,
  declaredTraitNames,
  normalizeTraitName,
  coreKnownTraitNames,
  UNKNOWN_TRAIT_CODE,
  type KnownTraitOptions,
  type TraitUse,
} from '../validation/KnownTraits';
export { traitNameKey, resolveTraitName } from '../validation/TraitName';
