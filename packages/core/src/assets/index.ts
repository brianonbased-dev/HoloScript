/**
 * @holoscript/core Asset System
 *
 * Comprehensive asset management for HoloScript and Hololand integration.
 */

// Asset Metadata
export type {
  AssetMetadata,
  AssetFormat,
  AssetType,
  TextureFormat,
  CompressionFormat,
  LODLevel,
  AssetDependency,
  PlatformCompatibility,
} from './AssetMetadata';
export {
  createAssetMetadata,
  getMimeType,
  inferAssetType,
  estimateMemoryUsage,
} from './AssetMetadata';

// Asset Manifest
export type {
  AssetManifestData,
  ManifestConfig,
  ManifestStats,
  AssetGroup,
} from './AssetManifest';
export {
  AssetManifest,
  createManifest,
  loadManifest,
} from './AssetManifest';

// Asset Registry
export type {
  AssetEventType,
  AssetEvent,
  AssetEventListener,
  CacheEntry,
  RegistryConfig,
} from './AssetRegistry';
export {
  AssetRegistry,
  getAssetRegistry,
  registerManifest,
  loadAsset,
  preloadAssets,
} from './AssetRegistry';

// Asset Validator
export type {
  ValidationRule,
  ValidationResult,
  ValidationSeverity,
} from './AssetValidator';
export {
  AssetValidator,
  createAssetValidator,
  validateAsset,
  isAssetValid,
} from './AssetValidator';

// Smart Asset Loader
export type {
  LoaderConfig,
  LoadRequest,
  LoadProgress,
  LoadResult,
  Platform,
  Quality,
  LoadPriority,
} from './SmartAssetLoader';
export {
  SmartAssetLoader,
  getSmartAssetLoader,
  createSmartAssetLoader,
  smartLoad,
} from './SmartAssetLoader';

// Asset Aliases
export { DEFAULT_ASSET_ALIASES, resolveAssetAlias } from './AssetAliases';

// Asset Dependency Graph
export type {
  DependencyNode,
  ResolutionResult,
} from './AssetDependencyGraph';
export {
  AssetDependencyGraph,
  createDependencyGraph,
  buildDependencyGraph,
  getOptimalLoadOrder,
} from './AssetDependencyGraph';

// Humanoid Avatar Loader (VRM & Ready Player Me)
export type {
  HumanoidConfig,
  HumanoidState,
  HumanoidLoadResult,
  HumanoidLoaderEvent,
  HumanoidEventCallback,
  AvatarFormat,
  VRMBoneName,
  VRMExpressionName,
  VRMMetadata,
  RPMMetadata,
  SkeletonPose,
  BoneTransform,
} from './HumanoidLoader';
export {
  HumanoidLoader,
  getHumanoidLoader,
  createHumanoidLoader,
  loadHumanoid,
} from './HumanoidLoader';
