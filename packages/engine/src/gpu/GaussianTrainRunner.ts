/**
 * @fileoverview GaussianTrainRunner — the SOVEREIGN executor for `compile_to_gaussian_train` jobs.
 *
 * Runs a `GaussianTrainJob` (emitted by @holoscript/core GaussianTrainCompiler) on our own
 * gradient-checked autodiff path — GaussianTrainer3D (3D->2D projection) + GaussianTrainer2D
 * (alpha-blend backward) + Adam — over a set of posed views. This is the native, $0 replacement
 * for the remote api.rendernetwork.com training stage (GaussianSplatBakingPipeline).
 *
 * The pipeline this closes: capture -> reconstruct -> TRAIN (here, natively) -> render -> twin.
 */

import { forward2D, backward2D } from './GaussianTrainer2D';
import { forward3D, backward3D, type Gaussian3D, type SplatCamera } from './GaussianTrainer3D';

/**
 * Structural subset of @holoscript/core `GaussianTrainJob` that the runner consumes. Kept local
 * (not imported) so the engine package takes no new cross-package coupling on the core barrel —
 * the compiler emits a superset of this shape and the two are pinned by tests on both sides.
 */
export interface GaussianTrainJobSpec {
  hyperparams: {
    iterations: number;
    learningRates: {
      position: number;
      scale: number;
      rotation: number;
      opacity: number;
      color: number;
    };
    dilation: number;
    densifyInterval?: number;
  };
}

/** A single posed training view: a camera + the ground-truth image it should reproduce. */
export interface TrainView {
  cam: SplatCamera;
  W: number;
  H: number;
  /** Target image, W*H*3 (row-major RGB), values in [0,1]. */
  target: Float64Array;
}

export interface TrainResult {
  gaussians: Gaussian3D;
  initialLoss: number;
  finalLoss: number;
  iterations: number;
  /** L2 loss sampled each iteration (summed over views). */
  lossHistory: number[];
}

const PARAMS = ['x', 'y', 'z', 'sx', 'sy', 'sz', 'qr', 'qx', 'qy', 'qz', 'op', 'r', 'gr', 'bl'] as const;
type Param = (typeof PARAMS)[number];

/** Map each parameter to its job learning-rate group. */
function lrFor(job: GaussianTrainJobSpec): Record<Param, number> {
  const g = job.hyperparams.learningRates;
  return {
    x: g.position, y: g.position, z: g.position,
    sx: g.scale, sy: g.scale, sz: g.scale,
    qr: g.rotation, qx: g.rotation, qy: g.rotation, qz: g.rotation,
    op: g.opacity, r: g.color, gr: g.color, bl: g.color,
  };
}

function zeros(n: number): Float64Array {
  return new Float64Array(n);
}

/**
 * Execute a sovereign training job. `initial` is the starting gaussian set (from the job's `init`
 * point cloud, or a random scatter); `views` is the resolved posed-view dataset. Optimizes the
 * gaussians in place via Adam over `iterations`, accumulating gradients across all views each step.
 *
 * Note: the 2D low-pass dilation is applied inside forward3D at the renderer-matched 0.3px
 * (Mip-Splatting eps2d). `job.hyperparams.dilation` is the intended value and is expected to be
 * 0.3; a custom dilation would require threading it through forward3D (a follow-up).
 */
export function runGaussianTrainJob(job: GaussianTrainJobSpec, initial: Gaussian3D, views: TrainView[]): TrainResult {
  if (views.length === 0) throw new Error('runGaussianTrainJob: no training views provided');
  const g = initial;
  const N = g.N;
  const iters = Math.max(1, Math.floor(job.hyperparams.iterations));
  const lr = lrFor(job);

  // Adam state per parameter.
  const m: Record<string, Float64Array> = {}, v: Record<string, Float64Array> = {};
  for (const p of PARAMS) { m[p] = zeros(N); v[p] = zeros(N); }
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;

  const lossHistory: number[] = [];
  let initialLoss = 0, loss = 0;

  for (let it = 0; it < iters; it++) {
    // Accumulate gradients across all views.
    const G: Record<string, Float64Array> = {};
    for (const p of PARAMS) G[p] = zeros(N);
    loss = 0;

    for (const view of views) {
      const { g2, I } = forward3D(g, view.cam, view.W, view.H);
      const { img } = forward2D(g2, view.W, view.H);
      const dL = new Float64Array(img.length);
      for (let k = 0; k < img.length; k++) { const d = img[k] - view.target[k]; dL[k] = d; loss += 0.5 * d * d; }
      const dG2 = backward2D(g2, view.W, view.H, dL);
      const grad = backward3D(g, view.cam, view.W, view.H, I, dG2);
      for (const p of PARAMS) { const gp = grad[p]; const acc = G[p]; for (let i = 0; i < N; i++) acc[i] += gp[i]; }
    }
    if (it === 0) initialLoss = loss;
    lossHistory.push(loss);

    // Adam step with per-group learning rates.
    const t = it + 1;
    for (const p of PARAMS) {
      const gp = G[p], mp = m[p], vp = v[p], buf = g[p], step = lr[p];
      for (let i = 0; i < N; i++) {
        const gr = gp[i];
        mp[i] = b1 * mp[i] + (1 - b1) * gr;
        vp[i] = b2 * vp[i] + (1 - b2) * gr * gr;
        buf[i] -= step * (mp[i] / (1 - b1 ** t)) / (Math.sqrt(vp[i] / (1 - b2 ** t)) + eps);
        // Keep parameters in valid ranges (matches the trainer's tests).
        if (p === 'op') buf[i] = Math.max(0.02, Math.min(0.999, buf[i]));
        else if (p === 'sx' || p === 'sy' || p === 'sz') buf[i] = Math.max(0.02, buf[i]);
        else if (p === 'r' || p === 'gr' || p === 'bl') buf[i] = Math.max(0, Math.min(1, buf[i]));
      }
    }
  }

  return { gaussians: g, initialLoss, finalLoss: loss, iterations: iters, lossHistory };
}
