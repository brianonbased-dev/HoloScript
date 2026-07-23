export {
  HoloScriptPlusParser,
  createParser,
  parse,
  preprocessAgentBrainSource,
  type AgentBrainSourceHeader,
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
} from './HoloCompositionParser';

export {
  ChunkBasedIncrementalParser,
  parseIncrementalChunks,
  type IncrementalParseResult,
} from './IncrementalParser';

export { ParseCache, globalParseCache } from './ParseCache';
export type { CachedNode, ParseCacheStats } from './ParseCache';

export type { HoloParseResult, HoloParseError, HoloParserOptions } from './HoloCompositionTypes';
export type { HoloContract, HoloContractClause } from './HoloCompositionTypes';
export type { HoloTopic, HoloChannel, HoloConnection } from './HoloCompositionTypes';

// Grammar module registry — MLIR-style-registry proof-slice mirroring
// compiler/DialectRegistry.ts on the parser side (task_1783037937631_acwr).
export { GrammarModuleRegistry } from './GrammarModuleRegistry';
export type { GrammarModuleDescriptor, GrammarModuleInfo } from './GrammarModuleRegistry';
