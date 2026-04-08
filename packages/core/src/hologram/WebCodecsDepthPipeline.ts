/**
 * Re-export shim -- WebCodecsDepthPipeline lives in @holoscript/engine.
 * Core tests import from this path; this shim bridges the migration.
 *
 * Uses direct source-level import so vitest resolves without requiring a build.
 */
export { WebCodecsDepthPipeline // @ts-ignore
} from '../../../engine/src/hologram/WebCodecsDepthPipeline';

export type {
  WebCodecsDepthConfig,
  WebCodecsDepthStats,
// @ts-ignore
} from '../../../engine/src/hologram/WebCodecsDepthPipeline';
