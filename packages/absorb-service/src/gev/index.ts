/**
 * Absorb GEV package surface.
 *
 * GEV means the Graph + Embedding + Vector/RAG spine that Absorb owns. This
 * subpath is the canonical consumer entry for HoloGraph, HoloEmbed provider
 * wiring, vector indexes, and GraphRAG engine primitives without asking callers
 * to assemble separate graph-rag or embed packages.
 *
 * @packageDocumentation
 */

export const ABSORB_GEV_PACKAGE_NAME = '@holoscript/absorb-service/gev' as const;
export const ABSORB_GEV_PACKAGE_RECEIPT_SCHEMA = 'holoscript.absorb.gev-package.v1' as const;

export type AbsorbGevLane = 'graph' | 'embed' | 'vector' | 'rag';

export interface AbsorbGevPackageReceipt {
  schemaVersion: typeof ABSORB_GEV_PACKAGE_RECEIPT_SCHEMA;
  packageName: typeof ABSORB_GEV_PACKAGE_NAME;
  canonicalPackage: '@holoscript/absorb-service';
  lanes: readonly AbsorbGevLane[];
  graphProvider: 'holograph';
  embeddingProvider: 'holoembed';
  vectorIndex: 'EmbeddingIndex' | 'TwoTowerSearchIndex';
  ragEngine: 'GraphRAGEngine';
  standaloneGraphRagPackage: false;
  standaloneEmbedConsumerPackage: false;
  policy: string;
}

export function buildAbsorbGevPackageReceipt(): AbsorbGevPackageReceipt {
  return {
    schemaVersion: ABSORB_GEV_PACKAGE_RECEIPT_SCHEMA,
    packageName: ABSORB_GEV_PACKAGE_NAME,
    canonicalPackage: '@holoscript/absorb-service',
    lanes: ['graph', 'embed', 'vector', 'rag'],
    graphProvider: 'holograph',
    embeddingProvider: 'holoembed',
    vectorIndex: 'EmbeddingIndex',
    ragEngine: 'GraphRAGEngine',
    standaloneGraphRagPackage: false,
    standaloneEmbedConsumerPackage: false,
    policy:
      'Absorb is the package boundary for the GEV spine. HoloGraph and HoloEmbed are named substrate lanes inside Absorb; consumers import @holoscript/absorb-service/gev instead of composing separate GraphRAG or embed packages.',
  };
}

export {
  CodebaseGraph,
  EmbeddingIndex,
  GraphRAGEngine,
  HoloEmbedProvider,
  TwoTowerSearchIndex,
  createEmbeddingProvider,
  createHoloGraphHoloEmbedQueryProvider,
  createHoloGraphHoloEmbedSearchIndexFromManifest,
  createLexicalDocument,
  createLexicalQuery,
  fuseHybridScore,
  HybridLexicalIndex,
  loadHoloGraphHoloEmbedManifest,
  readFloat32NpyMatrix,
  scoreLexicalDocument,
  scoreLexicalMatch,
  HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA,
} from '../engine/index';

export type {
  CodebaseGraphStats,
  EmbeddingIndexOptions,
  EmbeddingProvider,
  EmbeddingProviderName,
  EmbeddingProviderOptions,
  EnrichedResult,
  GraphRAGOptions,
  GraphRAGResult,
  HoloGraphHoloEmbedManifest,
  HybridLexicalEntry,
  HybridMatchKind,
  IndexedSymbol,
  LexicalDocument,
  LexicalMatchScore,
  LexicalQuery,
  LLMAnswer,
  LLMProvider,
  SearchResult,
  SymbolSearchFilters,
  SymbolSearchIndex,
  TwoTowerScoreMode,
  TwoTowerSearchEntry,
  TwoTowerSearchIndexOptions,
} from '../engine/index';

export {
  buildGraphRAGEmbeddingPolicyReceipt,
  GRAPH_RAG_EMBEDDING_POLICY_VERSION,
  LEGACY_GRAPH_RAG_PROVIDER_ALIASES,
  NATIVE_GRAPH_RAG_PROVIDER,
  requireNativeGraphRAGProvider,
} from '../mcp/graph-rag-embedding-policy';

export type {
  GraphRAGEmbeddingPolicyReceipt,
  NativeGraphRAGProvider,
} from '../mcp/graph-rag-embedding-policy';
