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
export { TRAITS, formatTrait, formatAllTraits, suggestTraits, getTraitsByCategory, getCategories, type TraitInfo, } from './traits';
export { generateObject, generateScene, listTemplates, getTemplate, type GeneratorOptions, type GeneratedObject, } from './generator';
export { PublishValidator, createPublishValidator, validateForPublish, PackagePackager, createPackager, packPackage, getPackageManifest, publishPackage, type ValidationResult, type ValidationError, type ValidationWarning, type ValidatorOptions, type PackageResult, type PackagerOptions, type PackageManifest, type FileEntry, type PublishOptions, type PublishResult, } from './publish';
export { importUnity, importGodot, importGltf, importGltfToFile, type UnityImportResult, type UnityImportOptions, type GodotImportResult, type GodotImportOptions, } from './importers';
export { hologramCommand, type HologramCommandOptions } from './commands/hologram';
export { runPhysicsSmoke, printSmokeReceipt, type SmokeOptions, type PhysicsSmokeReceipt, type DemoReceipt, } from './smoke';
export { DETERMINISTIC_HOLO_WORLD_PROJECTION, HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA, HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3, HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY, HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V3, HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA, PURE_HOLO_WORLD_PROJECTION, executeHoloWorldProjection, verifyHoloWorldProjectionProvenance, verifyHeadlessExperimentSourceRunReceipt, type AnyHeadlessExperimentSourceRunReceipt, type HeadlessExperimentSourceRunReceipt, type HeadlessExperimentSourceRunReceiptV3, type HeadlessExperimentSourceRunSources, type HoloWorldProjectionExecution, type HoloWorldProjectionProvenance, type HoloWorldProjectionVerificationOptions, } from './headless-experiment';
export { HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA, HS_PLAN_KERNEL_TRACE_SCHEMA, HS_PLAN_KERNEL_PARSER, HS_PLAN_KERNEL_COMPILER, HS_PLAN_KERNEL_VM, HS_PLAN_KERNEL_UAAL_LIMITS, HS_PLAN_KERNEL_TRACE_PROGRAM_COUNTERS, HS_PLAN_KERNEL_TRACE_OPCODES, RUST_WASM_UAAL_HS_PLAN_KERNEL, executeHsPlanKernel, verifyHsPlanKernelExecutionProvenance, type HsPlanKernelCompactTrace, type HsPlanKernelExecutionProvenance, type HsPlanKernelExecutionResult, type HsPlanKernelProvenanceVerificationOptions, type HsPlanKernelProvenanceVerificationResult, type HsPlanKernelVmExecutionProfile, } from './native-hs-plan-runner';
