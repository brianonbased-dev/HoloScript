/**
 * HoloScript Visual - Node-based visual programming for HoloScript
 *
 * @package @holoscript/visual
 */

// Main components
export { default as VisualEditor } from './components/VisualEditor';
export { default as Canvas } from './components/Canvas';
export { default as Sidebar } from './components/Sidebar';
export { default as CodePreview } from './components/CodePreview';
export { default as HoloNode } from './components/HoloNode';

// Types
export * from './types';

// Node registry
export {
  ALL_NODES,
  EVENT_NODES,
  ACTION_NODES,
  LOGIC_NODES,
  DATA_NODES,
  NODE_REGISTRY,
  getNodeDefinition,
  getNodesByCategory,
} from './nodes/nodeRegistry';

// Code generation
export { GraphToCode, graphToCode, type CodeGenOptions } from './codegen/GraphToCode';

// Store
export { useGraphStore } from './store/graphStore';

// Re-export props types
export type { VisualEditorProps } from './components/VisualEditor';
export type { CanvasProps } from './components/Canvas';
export type { SidebarProps } from './components/Sidebar';
export type { CodePreviewProps } from './components/CodePreview';
