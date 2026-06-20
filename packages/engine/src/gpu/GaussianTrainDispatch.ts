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
import { type Gaussian3D } from './GaussianTrainer3D';

/** Structural subset of @holoscript/core `GaussianTrainJob` that the dispatcher routes. */
export interface DispatchableTrainJob {
  backend: 'sovereign' | 'remote';
  hyperparams: {
    iterations: number;
    learningRates: { position: number; scale: number; rotation: number; opacity: number; color: number };
    dilation: number;
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
  const spec: GaussianTrainJobSpec = {
    hyperparams: {
      iterations: job.hyperparams.iterations,
      learningRates: job.hyperparams.learningRates,
      dilation: job.hyperparams.dilation,
    },
  };
  return runGaussianTrainJob(spec, initial, views);
}
