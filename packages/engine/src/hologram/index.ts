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

// WebCodecs Depth Pipeline (zero-copy GPU video depth)
export { WebCodecsDepthPipeline } from './WebCodecsDepthPipeline';

export type { WebCodecsDepthConfig, WebCodecsDepthStats } from './WebCodecsDepthPipeline';
