/**
 * @holoscript/core — Tools Module
 *
 * Developer tools, editors, and integrations for the HoloScript platform.
 *
 * - DeveloperExperience: REPL, error formatting, hot reload, source maps
 * - MaterialEditor: Unity/Substance-style material editing with live preview
 * - SceneInspector: Runtime scene inspection and debugging
 * - VisualEditor: Drag-and-drop scene builder with real-time preview
 * - MixamoIntegration: Server-side auto-rigging, animation mapping, character templates
 *
 * @packageDocumentation
 */

// Developer Experience (REPL, Error Formatting, Hot Reload)
export {
  ErrorFormatter,
  HoloScriptREPL,
  startREPL,
  HotReloadWatcher,
  SourceMapGenerator,
} from './DeveloperExperience';

// Material Editor (Live Preview, Presets)
export {
  MaterialEditor,
  type MaterialEditorPreset,
  type MaterialEditorConfig,
  type MaterialPreset,
} from './MaterialEditor';

// Scene Inspector
export { SceneInspector } from './SceneInspector';

// Visual Editor
export { VisualEditor } from './VisualEditor';

// Mixamo Integration (Server-Side Auto-Rigging)
export {
  // API Client
  MixamoAPI,
  // Preset Mapper
  MixamoPresetMapper,
  // Character Template Registry
  CharacterTemplateRegistry,
  // Error Classes
  MixamoError,
  MixamoRateLimitError,
  MixamoTopologyError,
  MixamoFormatError,
  // Types
  type MeshFormat,
  type MixamoCredentials,
  type MixamoAPIConfig,
  type UploadResult,
  type RigResult,
  type MixamoAnimation,
  type AnimationListOptions,
  type AnimationListResult,
  type DownloadOptions,
  type DownloadResult,
  type TopologyIssue,
  type PresetMixamoMapping,
  type CharacterArchetype,
  type CharacterTemplate,
} from './MixamoIntegration';
