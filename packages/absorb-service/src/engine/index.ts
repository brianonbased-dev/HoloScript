/**
 * HoloScript Codebase Absorption Engine
 *
 * Ingests any codebase, builds a knowledge graph, and auto-generates
 * navigable .holo compositions for spatial code visualization.
 * Supports Graph RAG queries and interactive 3D exploration.
 *
 * @version 2.0.0
 */

// Core types
export type {
  SupportedLanguage,
  ExternalSymbolType,
  ExtendedSymbolType,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
  LanguageAdapter,
  SyntaxNode,
  ParseTree,
  ScanOptions,
  ScannedFile,
  ScanStats,
  ScanError,
  ScanResult,
} from './types';

// Adapter management
export { AdapterManager } from './AdapterManager';

// Adapter registry
export {
  registerAdapter,
  getAdapterForFile,
  getAdapterForLanguage,
  getSupportedLanguages,
  getSupportedExtensions,
  detectLanguage,
} from './adapters';

// Individual adapters
export { TypeScriptAdapter } from './adapters/TypeScriptAdapter';
export { PythonAdapter } from './adapters/PythonAdapter';
export { RustAdapter } from './adapters/RustAdapter';
export { GoAdapter } from './adapters/GoAdapter';

// Scanner + Graph
export { CodebaseScanner } from './CodebaseScanner';
export { CodebaseGraph } from './CodebaseGraph';
export type { CodebaseGraphStats, SymbolQuery, CallChain } from './CodebaseGraph';
export { CommunityDetector } from './CommunityDetector';

// Worker Pool (Phase 9: Parallel scanning support)
export { WorkerPool } from './workers/WorkerPool';

// Emitter
export { HoloEmitter } from './HoloEmitter';
export type { EmitOptions, LayoutMode } from './HoloEmitter';

// Layouts
export { forceDirectedLayout } from './layouts/ForceDirectedLayout';
export type { LayoutNode, LayoutEdge, ForceLayoutOptions } from './layouts/ForceDirectedLayout';
export { layeredLayout } from './layouts/LayeredLayout';
export type { LayeredLayoutOptions } from './layouts/LayeredLayout';

// Visualization
export { CodebaseSceneCompiler } from './visualization/CodebaseSceneCompiler';
export type {
  SceneComposition,
  SceneObject,
  SceneSpatialGroup,
  SceneEdge,
  SceneCompilerOptions,
} from './visualization/CodebaseSceneCompiler';
export { CodebaseTheme } from './visualization/CodebaseTheme';
export type { ThemeOptions, VisualStyle } from './visualization/CodebaseTheme';
export { EdgeRenderer } from './visualization/EdgeRenderer';
export type { RenderedEdge, EdgeRenderOptions } from './visualization/EdgeRenderer';

// Git Change Detection (incremental absorb)
export { GitChangeDetector } from './GitChangeDetector';
export type { GitChangeResult, FileContentHash } from './GitChangeDetector';

// Graph RAG
export { EmbeddingIndex } from './EmbeddingIndex';
export type { EmbeddingIndexOptions, IndexedSymbol, SearchResult } from './EmbeddingIndex';
export { GraphRAGEngine } from './GraphRAGEngine';
export type { GraphRAGOptions, GraphRAGResult, EnrichedResult, LLMAnswer, LLMProvider } from './GraphRAGEngine';

// Embedding Providers
export type { EmbeddingProvider, EmbeddingProviderName, EmbeddingProviderOptions } from './providers/EmbeddingProvider';
export { createEmbeddingProvider } from './providers/EmbeddingProviderFactory';
export { BM25EmbeddingProvider } from './providers/BM25EmbeddingProvider';
export { XenovaEmbeddingProvider } from './providers/XenovaEmbeddingProvider';
export { OllamaEmbeddingProvider } from './providers/OllamaEmbeddingProvider';
export { OpenAIEmbeddingProvider } from './providers/OpenAIEmbeddingProvider';

// Interactive Visualization
export { InteractiveSceneEnricher } from './visualization/InteractiveSceneEnricher';
export type {
  InteractionEvent,
  InteractionAction,
  InteractiveSceneComposition,
  EnricherOptions,
} from './visualization/InteractiveSceneEnricher';
export { GraphSelectionManager } from './visualization/GraphSelectionManager';
export type { SelectionSubgraph, SelectionContext } from './visualization/GraphSelectionManager';
export { GraphRAGVisualizer } from './visualization/GraphRAGVisualizer';
export type { RAGSearchResult, ImpactNode } from './visualization/GraphRAGVisualizer';
export { GraphTooltipGenerator } from './visualization/GraphTooltipGenerator';
export type {
  TooltipData,
  TooltipLine,
  RAGAnnotation,
} from './visualization/GraphTooltipGenerator';

// Deprecated Symbol Inventory (Gap 5: SCARF-inspired cleanup)
export {
  DeprecatedInventoryBuilder,
  createDeprecatedInventoryBuilder,
  extractExportsFromSource,
} from './DeprecatedInventory';
export type {
  SymbolClassification,
  DeprecatedSymbol,
  DeprecatedInventory,
  MigrationAction,
  MigrationPlan,
} from './DeprecatedInventory';
