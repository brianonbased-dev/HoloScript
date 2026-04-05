/**
 * @deprecated A.011.03c — This module is superseded by @holoscript/registry.
 *
 * Package Registry Module
 *
 * Sprint 5 Priority 5: Package Registry MVP
 *
 * Exports for package management functionality.
 */

export {
  PackageRegistry,
  createPackageRegistry,
  defaultRegistry,
  parseSemVer,
  formatSemVer,
  compareSemVer,
  satisfiesRange,
  findBestMatch,
  validatePackageName,
  validateManifest,
  type SemVer,
  type PackageDependency,
  type PackageManifest,
  type PackageMetadata,
  type SearchResult,
  type ResolvedDependency,
  type InstallResult,
} from './PackageRegistry';
