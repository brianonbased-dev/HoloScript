// Trait System types
export { TraitContext, TraitEvent, type RaycastHit } from '../traits/TraitTypes';

// Logger utilities
export { logger, setHoloScriptLogger, enableConsoleLogging, resetLogger, NoOpLogger, ConsoleLogger } from '../logger';
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
  type IncrementalParseResult,
} from '../parser/IncrementalParser';
export { globalParseCache, type ParseCache } from '../parser/ParseCache';

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
  type CompositionResult
} from '../compiler/traits/ProvenanceSemiring';

export {
  MinPlusSemiring,
  MaxPlusSemiring,
  SumProductSemiring,
  strategyToSemiring,
  type Semiring,
  type NumericStrategySemiringName
} from '../compiler/traits/Semiring';
