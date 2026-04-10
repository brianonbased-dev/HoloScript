/**
 * @holoscript/cli
 *
 * Command-line interface for HoloScript.
 * Parse, execute, and debug HoloScript files.
 */

export { HoloScriptCLI } from './HoloScriptCLI';
export { parseArgs, type CLIOptions } from './args';
export { formatAST, formatError } from './formatters';
export { HoloScriptREPL, startREPL } from './repl';

// Traits & Generation
export {
  TRAITS,
  formatTrait,
  formatAllTraits,
  suggestTraits,
  getTraitsByCategory,
  getCategories,
  type TraitInfo,
} from './traits';
export {
  generateObject,
  generateScene,
  listTemplates,
  getTemplate,
  type GeneratorOptions,
  type GeneratedObject,
} from './generator';

// Package Publishing (Sprint 6)
export {
  PublishValidator,
  createPublishValidator,
  validateForPublish,
  PackagePackager,
  createPackager,
  packPackage,
  getPackageManifest,
  publishPackage,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidatorOptions,
  type PackageResult,
  type PackagerOptions,
  type PackageManifest,
  type FileEntry,
  type PublishOptions,
  type PublishResult,
} from './publish';
// Importers (Sprint 8)
export {
  importUnity,
  importGodot,
  importGltf,
  importGltfToFile,
  type UnityImportResult,
  type UnityImportOptions,
  type GodotImportResult,
  type GodotImportOptions,
} from './importers';
