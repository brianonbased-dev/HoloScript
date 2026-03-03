/**
 * HoloScript Codebase Absorption Engine
 *
 * Ingests any codebase, builds a knowledge graph, and auto-generates
 * navigable .holo compositions for spatial code visualization.
 *
 * @version 1.0.0
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
