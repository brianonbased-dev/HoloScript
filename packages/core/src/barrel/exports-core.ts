// Safe JSON parsing utilities
// Asset Registry
export { AssetRegistry } from '../assets/AssetRegistry';

// Asset Metadata types (SemanticTags used by engine skeleton conformance tests + rig_match_skeleton MCP)
export type { SemanticTags } from '../assets/AssetMetadata';

// Safe JSON parsing utilities
export {
  safeJsonParse,
  safeJsonParseSchema,
  jsonClone,
  readJson,
  tryParseJson,
} from '../errors/safeJsonParse';
export type { JsonParseError, SafeJsonResult, JsonParseResult } from '../errors/safeJsonParse';

// Trait System types
export { TraitContext, TraitEvent, type RaycastHit } from '../traits/TraitTypes';

// Logger utilities
export {
  logger,
  setHoloScriptLogger,
  enableConsoleLogging,
  resetLogger,
  NoOpLogger,
  ConsoleLogger,
} from '../logger';
export type { HoloScriptLogger } from '../logger';

// Source Maps
export {
  SourceMapGenerator,
  SourceMapConsumer,
  combineSourceMaps,
  type SourceMap,
  type MappingSegment,
  type LineMapping,
} from '../SourceMapGenerator';

// Incremental Parsing
export { IncrementalParser, createIncrementalParser } from '../IncrementalParser';

// HoloScript+ Incremental Parsing
export {
  ChunkBasedIncrementalParser,
  parseIncrementalChunks,
  type IncrementalParseResult,
} from '../parser/IncrementalParser';
export { globalParseCache, ParseCache } from '../parser/ParseCache';
export type { CachedNode, ParseCacheStats } from '../parser/ParseCache';

// Tree Shaking
export {
  TreeShaker,
  treeShake,
  eliminateDeadCode,
  type TreeShakeOptions,
  type TreeShakeResult,
} from '../TreeShaker';

// Visual logic graph (editor + logic) — shared with Studio execution bridge
export {
  NodeGraph,
  type LogicNode,
  type LogicConnection,
  type EvaluationContext,
} from '../logic/NodeGraph';
export {
  NodeGraphPanel,
  type NodeGraphPanelConfig,
  type NodeGraphExecutionResult,
  type UIEntity,
} from '../editor/NodeGraphPanel';
export { emitPreviewHoloScriptFromNodeGraphExecution } from '../editor/nodeGraphPlayPreview';

// Gist / GitHub publication — provenance + optional x402 (Doors 1 + 3)
export {
  GIST_PUBLICATION_MANIFEST_VERSION,
  provenanceDocumentIdForRoom,
  computeProvenanceSemiringDigestV0,
  buildGistPublicationManifest,
  serializeGistPublicationManifest,
  computeXrMetricsCommitmentHash,
  resolveXrMetricsConflict,
  xrMetricsMapKey,
  extractXrMetricsForBinding,
  type GistPublicationManifestV0,
  type ProvenanceReceiptBinding,
  type ProvenanceSemiringDigestV0,
  type X402ReceiptBinding,
  type BuildGistPublicationManifestParams,
  type Film3dXrMetricsForBinding,
} from '../export/GistPublicationManifest';

// Provenance / semiring algebra
export {
  ProvenanceSemiring,
  AuthorityTier,
  TRAIT_ZERO,
  isDeadElement,
  createDeadElement,
  authorityWeight,
  type DeadElement,
  type ProvenanceContext,
  type ProvenanceValue,
  type ProvenanceConfig,
  type TraitApplication,
  type ConflictResolutionRule,
  type CompositionResult,
} from '../compiler/traits/ProvenanceSemiring';

// Cross-scale state projection spine (D.057)
export {
  SCALE_BRIDGE_PROJECTION_SCHEMA,
  ScaleBridge,
  canonicalizeScaleBridgeJson,
  type ScaleBridgeJson,
  type ScaleBridgeProjectionSchema,
  type ScaleDescriptor,
  type ScaleBridgeProvenanceEdge,
  type ScaleBridgeProjection,
} from '../state/ScaleBridge';

export {
  MinPlusSemiring,
  MaxPlusSemiring,
  SumProductSemiring,
  strategyToSemiring,
  type Semiring,
  type NumericStrategySemiringName,
} from '../compiler/traits/Semiring';

// Performance — LOD definitions shared with R3F LODMeshNode
export type { LODConfig, LODLevel, LODResult } from '../performance/LODSystem';
export { LODSystem } from '../performance/LODSystem';

// Conversation Daemon & Customization Profile (D.052)
export type {
  DaemonOwnerPolicy,
  DaemonAppearanceProfile,
  DaemonVoiceProfile,
  DaemonToneProfile,
  DaemonPermissionProfile,
  DaemonMemoryPolicy,
  DaemonContextSourceKind,
  DaemonDispatchPolicy,
  DaemonReceiptSink,
  DaemonBrittneyRehydrationChannel,
} from '../daemon/ConversationDaemon';
export {
  makeDefaultConversationDaemon,
  assertDaemonFieldSeparation,
  type ConversationDaemon,
  type ConversationDaemonTurn,
  type ContextDelta,
} from '../daemon/ConversationDaemon';
export {
  type DaemonRitual,
  type DaemonFavoriteWorkflow,
  type DaemonStyleProfile,
  type DaemonPermissionConfig,
  type DaemonCustomizationProfile,
  type DaemonCareProfile,
  type DaemonVisualTheme,
  DAEMON_VISUAL_THEMES,
  DAEMON_CARE_PROFILES,
  DaemonCustomizationSeparationError,
  assertCustomizationSeparation,
  validateCustomizationProfile,
  makeDefaultStyleProfile,
  makeDefaultPermissionConfig,
  makeDefaultCustomizationProfile,
  customizationProfileToDaemon,
  daemonToCustomizationProfile,
  mergeStyleUpdates,
  mergePermissionUpdates,
  makePresetProfile,
} from '../daemon/DaemonCustomizationProfile';
