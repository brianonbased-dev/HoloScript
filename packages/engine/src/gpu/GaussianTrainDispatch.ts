/**
 * @fileoverview GaussianTrainDispatch — the seam between the compiler and the runner.
 *
 * A `GaussianTrainCompiler` emits a `GaussianTrainJob` whose `executor` field NAMES this module
 * (`@holoscript/engine/gpu/GaussianTrainRunner`) by string. Until this dispatcher existed, nothing
 * dereferenced that string — the compiler and the runner were two proven halves with no connective
 * tissue between them (flagged by the 2026-06-20 /critic review). `dispatchGaussianTrainJob` IS that
 * dereferencer: it takes a compiled job + a resolved dataset and routes a sovereign job onto the
 * native runner (remote jobs are rejected here — they belong to GaussianSplatBakingPipeline).
 *
 * It accepts a LOCAL structural subset of core's `GaussianTrainJob` (no cross-package import — engine
 * stays decoupled from the core barrel). The shapes are pinned by tests on both sides: the compiler
 * test asserts the emitted job has these fields; the dispatch test asserts they drive a real fit.
 * A full end-to-end test that feeds the compiler's LITERAL output through here (importing
 * GaussianTrainCompiler from @holoscript/core/compiler) is the remaining tightening — it needs core's
 * dist rebuilt to carry the export, so it lives in CI (core builds before engine), not this unit run.
 */

import { runGaussianTrainJob, type GaussianTrainJobSpec, type TrainResult, type TrainView } from './GaussianTrainRunner';
import { GaussianWebGPUTrainer, runGaussianTrainJobGPU } from './GaussianWebGPUTrainer';
import { type Gaussian3D } from './GaussianTrainer3D';

/** Structural subset of @holoscript/core `GaussianTrainJob` that the dispatcher routes. */
export interface DispatchableTrainJob {
  backend: 'sovereign' | 'remote';
  hyperparams: {
    iterations: number;
    learningRates: { position: number; scale: number; rotation: number; opacity: number; color: number };
    dilation: number;
    /** Densify every N iters (0/absent = off). Maps to the runner's densification.interval. */
    densifyInterval?: number;
    /** Gaussian-count cap. Maps to the runner's densification.maxGaussians. */
    targetGaussians?: number;
  };
}

/**
 * Dereference a compiled training job to its executor and run it.
 *  - `sovereign` → the native GaussianTrainRunner (this path; $0).
 *  - `remote`    → rejected (route to GaussianSplatBakingPipeline → api.rendernetwork.com instead).
 *
 * @throws if the job is not sovereign, or has no views.
 */
export function dispatchGaussianTrainJob(
  job: DispatchableTrainJob,
  initial: Gaussian3D,
  views: TrainView[],
): TrainResult {
  if (job.backend !== 'sovereign') {
    throw new Error(
      `dispatchGaussianTrainJob: backend '${job.backend}' is not sovereign — ` +
        `route remote jobs to GaussianSplatBakingPipeline (api.rendernetwork.com), not the native runner.`,
    );
  }
  const hp = job.hyperparams;
  const spec: GaussianTrainJobSpec = {
    hyperparams: { iterations: hp.iterations, learningRates: hp.learningRates, dilation: hp.dilation },
  };
  // densifyInterval > 0 turns on adaptive density control (3DGS Algorithm 1). The authoring surface
  // exposes only interval + cap; the dispatcher supplies the remaining tuning as HEURISTIC defaults —
  // gradThreshold / scaleThreshold are screen-space/scene-scale dependent, so a real capture may need
  // them tuned (a future explicit densification config in the trait). This is what makes the
  // `densifyInterval`/`targetGaussians` knobs LIVE (they were dead before densification existed).
  if (hp.densifyInterval && hp.densifyInterval > 0) {
    const it = hp.iterations;
    spec.densification = {
      interval: hp.densifyInterval,
      fromIter: Math.max(1, Math.floor(it * 0.07)),
      untilIter: Math.floor(it * 0.8),
      gradThreshold: 0.04,
      opacityPrune: 0.05,
      scaleThreshold: 0.2,
      maxGaussians: hp.targetGaussians && hp.targetGaussians > 0 ? hp.targetGaussians : 1_000_000,
      seed: 1,
    };
  }
  return runGaussianTrainJob(spec, initial, views);
}

/**
 * GPU-accelerated variant. Same routing rules as `dispatchGaussianTrainJob` — sovereign only,
 * remote rejected — but dispatches the O(N×pixels) forward+backward rasterization to WGSL kernels.
 *
 * @param device A WebGPU device obtained from `navigator.gpu.requestAdapter()`.
 * @param bg     Background colour for rendering (default [0,0,0]).
 * @param onProgress Called each iteration with (iterIndex, loss).
 */
export async function dispatchGaussianTrainJobGPU(
  job: DispatchableTrainJob,
  initial: Gaussian3D,
  views: TrainView[],
  device: GPUDevice,
  bg: readonly [number, number, number] = [0, 0, 0],
  onProgress?: (iter: number, loss: number) => void,
): Promise<TrainResult> {
  if (job.backend !== 'sovereign') {
    throw new Error(
      `dispatchGaussianTrainJobGPU: backend '${job.backend}' is not sovereign — ` +
        `route remote jobs to GaussianSplatBakingPipeline (api.rendernetwork.com), not the native runner.`,
    );
  }
  const hp = job.hyperparams;
  const spec: GaussianTrainJobSpec = {
    hyperparams: { iterations: hp.iterations, learningRates: hp.learningRates, dilation: hp.dilation },
  };
  if (hp.densifyInterval && hp.densifyInterval > 0) {
    const it = hp.iterations;
    spec.densification = {
      interval: hp.densifyInterval,
      fromIter: Math.max(1, Math.floor(it * 0.07)),
      untilIter: Math.floor(it * 0.8),
      gradThreshold: 0.04,
      opacityPrune: 0.05,
      scaleThreshold: 0.2,
      maxGaussians: hp.targetGaussians && hp.targetGaussians > 0 ? hp.targetGaussians : 1_000_000,
      seed: 1,
    };
  }
  const trainer = new GaussianWebGPUTrainer(device);
  await trainer.init();
  try {
    return await runGaussianTrainJobGPU(trainer, spec, initial, views, bg, onProgress);
  } finally {
    trainer.destroy();
  }
}
