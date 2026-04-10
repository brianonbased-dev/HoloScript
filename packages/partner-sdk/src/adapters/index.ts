/**
 * Engine Export Adapters
 *
 * Export HoloScript scenes to Unity, Unreal, and Godot.
 */

// Unity exports
export {
  UnityExportAdapter,
  createUnityAdapter,
  type UnityExportConfig,
  type UnityExportResult,
  type GeneratedFile as UnityGeneratedFile,
} from './UnityAdapter';

// Unreal exports
export {
  UnrealExportAdapter,
  createUnrealAdapter,
  type UnrealExportConfig,
  type UnrealExportResult,
  type GeneratedFile as UnrealGeneratedFile,
} from './UnrealAdapter';

// Godot exports
export {
  GodotExportAdapter,
  createGodotAdapter,
  type GodotExportConfig,
  type GodotExportResult,
  type GeneratedFile as GodotGeneratedFile,
} from './GodotAdapter';
