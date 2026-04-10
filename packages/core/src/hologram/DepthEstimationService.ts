/**
 * Re-export shim -- DepthEstimationService lives in @holoscript/engine.
 * Core tests import from this path; this shim bridges the migration.
 *
 * Uses direct source-level import so vitest resolves without requiring a build.
 */
export {
  DepthEstimationService,
  TemporalSmoother,
  GIFDecomposer,
  ModelCache,
  depthToNormalMap,
  detectBestBackend,
  GIFDisposalMethod,
// @ts-ignore
} from '../../../engine/src/hologram/DepthEstimationService';

export type {
  DepthBackend,
  DepthEstimationConfig,
  DepthResult,
  DepthSequenceConfig,
  GIFFrame,
  GIFDecomposerConfig,
// @ts-ignore
} from '../../../engine/src/hologram/DepthEstimationService';
