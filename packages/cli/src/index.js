/**
 * @holoscript/cli
 *
 * Command-line interface for HoloScript.
 * Parse, execute, and debug HoloScript files.
 */
export { HoloScriptCLI } from './HoloScriptCLI';
export { parseArgs } from './args';
export { formatAST, formatError } from './formatters';
export { HoloScriptREPL, startREPL } from './repl';
// Traits & Generation
export { TRAITS, formatTrait, formatAllTraits, suggestTraits, getTraitsByCategory, getCategories, } from './traits';
export { generateObject, generateScene, listTemplates, getTemplate, } from './generator';
// Package Publishing (Sprint 6)
export { PublishValidator, createPublishValidator, validateForPublish, PackagePackager, createPackager, packPackage, getPackageManifest, publishPackage, } from './publish';
// Importers (Sprint 8)
export { importUnity, importGodot, importGltf, importGltfToFile, } from './importers';
