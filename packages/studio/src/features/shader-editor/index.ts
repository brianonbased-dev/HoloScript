/**
 * Shader Editor - Public API
 *
 * Export all shader editor services and utilities
 */

// Services
export { ShaderEditorService, getShaderEditorService } from './ShaderEditorService';
export type {
  ShaderGraphMetadata,
  ShaderGraphVersion,
  ShaderGraphDiff,
  SyncStatus,
  SyncHooks,
} from './ShaderEditorService';

export { LivePreviewService, getLivePreviewService } from './LivePreviewService';
export type {
  PreviewMeshConfig,
  CompilationResult,
  PerformanceMetrics,
  MaterialInstance,
  PreviewChangeEvent,
} from './LivePreviewService';

export { MaterialLibrary, getMaterialLibrary } from './MaterialLibrary';
export type { MaterialPreset, MaterialCategory, MaterialVariant } from './MaterialLibrary';

export { ShaderTemplateLibrary, getShaderTemplateLibrary } from './ShaderTemplates';
export type { ShaderTemplate, TemplateCategory } from './ShaderTemplates';

export {
  UndoRedoSystem,
  getUndoRedoSystem,
  setupUndoRedoShortcuts,
  AddNodeCommand,
  DeleteNodeCommand,
  ConnectCommand,
  DisconnectCommand,
  SetPropertyCommand,
  MoveNodeCommand,
  BatchCommand,
} from './UndoRedoSystem';
export type { ICommand, UndoRedoEvent } from './UndoRedoSystem';
