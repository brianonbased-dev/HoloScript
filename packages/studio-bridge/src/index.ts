/**
 * @holoscript/studio-bridge
 *
 * Bidirectional Visual-to-AST translation bridge for HoloScript Studio.
 *
 * This package provides the translation layer between:
 * - The visual node-based editor (@holoscript/visual) with React Flow nodes
 * - The HoloScript AST and compiler pipeline (@holoscript/core)
 *
 * Three main modules:
 * - VisualToAST: Forward translation (visual graph -> AST + code)
 * - ASTToVisual: Reverse translation (AST/code -> visual graph)
 * - SyncEngine: Bidirectional live synchronization
 *
 * @example
 * ```typescript
 * import { VisualToAST, ASTToVisual, SyncEngine } from '@holoscript/studio-bridge';
 *
 * // Forward: Visual -> AST + code
 * const translator = new VisualToAST({ format: 'hsplus' });
 * const result = translator.translate(visualGraph);
 * console.log(result.code); // Generated HoloScript code
 *
 * // Reverse: AST -> Visual
 * const reverser = new ASTToVisual({ layout: 'tree' });
 * const graph = reverser.translate(astNodes);
 *
 * // Bidirectional sync
 * const sync = new SyncEngine({ direction: 'bidirectional' });
 * sync.on('sync-complete', (e) => console.log('Synced:', e));
 * sync.start();
 * sync.onVisualChanged(graph);
 * ```
 *
 * @packageDocumentation
 */

// Core translators
export { VisualToAST, visualToAST } from './VisualToAST';
export { ASTToVisual, astToVisual, codeToVisual } from './ASTToVisual';
export { SyncEngine, createSyncEngine } from './SyncEngine';

// Types
export type {
  // Bridge mapping types
  BridgeMapping,
  MappingRelationship,
  SourceLocation,

  // Translation result types
  VisualToASTResult,
  ASTToVisualResult,

  // Diagnostics
  BridgeDiagnostic,
  BridgeSourceMap,
  SourceMapEntry,

  // Sync types
  BridgeChangeEvent,
  SyncState,
  SyncOptions,

  // Translation options
  VisualToASTOptions,
  ASTToVisualOptions,

  // Rule types
  NodeTranslationRule,
  ASTNodeVisualRule,
} from './types';

// Re-exported sync event types
export type { SyncEventType, SyncEventListener, SyncEvent } from './SyncEngine';
