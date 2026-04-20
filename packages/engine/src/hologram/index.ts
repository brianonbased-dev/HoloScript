/**
 * Hologram Media Pipeline — barrel export.
 *
 * 2D-to-3D hologram generation: depth estimation, displacement,
 * segmentation, GIF decomposition, temporal smoothing, and quilt output.
 */

// Depth Estimation Service (singleton + utilities)
export {
  DepthEstimationService,
  TemporalSmoother,
  GIFDecomposer,
  ModelCache,
  depthToNormalMap,
  detectBestBackend,
  GIFDisposalMethod,
} from './DepthEstimationService';

export type {
  DepthBackend,
  DepthEstimationConfig,
  DepthResult,
  DepthSequenceConfig,
  GIFFrame,
  GIFDecomposerConfig,
} from './DepthEstimationService';

// Quilt Compiler (Looking Glass output)
export { QuiltCompiler } from './QuiltCompiler';

export type { QuiltConfig, QuiltTile, QuiltCompilationResult } from './QuiltCompiler';

// MV-HEVC Compiler (Apple Vision Pro spatial video)
export { MVHEVCCompiler } from './MVHEVCCompiler';

export type { MVHEVCConfig, MVHEVCStereoView, MVHEVCCompilationResult } from './MVHEVCCompiler';

// WebCodecs depth pipeline (WebCodecs decode + optional WebGPU texture upload)
export {
  WebCodecsDepthPipeline,
  webgpuBytesPerRowRgba8,
  videoFrameToImageDataViaWebGPU,
} from './WebCodecsDepthPipeline';

export type { WebCodecsDepthConfig, WebCodecsDepthStats } from './WebCodecsDepthPipeline';

// ── HoloGram product-line entry point (Sprint 0a) ────────────────────────────
//
// Canonical data structure + content-addressed hashing for a HoloGram bundle.
// See D.019 (MEMORY.md) for the product line decision and telegram push metaphor.

export {
  canonicalMetaJson,
  computeBundleHash,
  HologramBundleError,
  validateBundle,
  verifyBundleHash,
} from './HologramBundle';

export type {
  HologramBundle,
  HologramMeta,
  HologramSourceKind,
  HologramTarget,
} from './HologramBundle';

// Orchestrator: the single entry point every push path (CLI, Studio upload,
// MCP tool, feed post) calls. Providers are dependency-injected so the same
// orchestrator runs in browser and Node.
export {
  createHologram,
  createNodeProvidersStub,
  CreateHologramError,
} from './createHologram';

export type {
  CreateHologramOptions,
  DepthInferenceResult,
  DepthProvider,
  HologramProviders,
  MvhevcEncoder,
  ParallaxEncoder,
  QuiltRenderer,
} from './createHologram';

// HologramStore interface + helpers (browser-safe, no fs imports).
// The Node filesystem implementation lives in
// `./FileSystemHologramStore.ts` and is NOT exported from this barrel —
// consumers import it by direct path to keep browser bundles clean.
export {
  ASSET_CONTENT_TYPES,
  ASSET_NAMES,
  assertValidAssetName,
  assertValidHash,
  bundleAssetRelPath,
  bundleRelDir,
  canonicalizeBundleForPut,
  HologramStoreError,
  isAssetName,
} from './HologramStore';

export type {
  AssetName,
  HologramStore,
  HologramStorePutResult,
} from './HologramStore';
