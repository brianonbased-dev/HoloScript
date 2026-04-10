/**
 * Package Publish Module
 *
 * Sprint 6 Priority 1: holoscript publish command
 *
 * Main entry point for package publishing functionality.
 */

export {
  PublishValidator,
  createPublishValidator,
  validateForPublish,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidatorOptions,
} from './validator';

export {
  PackagePackager,
  createPackager,
  packPackage,
  getPackageManifest,
  type PackageResult,
  type PackagerOptions,
  type PackageManifest,
  type FileEntry,
} from './packager';

export { publishPackage, type PublishOptions, type PublishResult } from './publisher';
