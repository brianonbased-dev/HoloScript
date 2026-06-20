/**
 * @fileoverview GaussianTrainRunner — the SOVEREIGN executor for `compile_to_gaussian_train` jobs.
 *
 * Runs a `GaussianTrainJob` (emitted by @holoscript/core GaussianTrainCompiler) on our own
 * gradient-checked autodiff path — GaussianTrainer3D (3D->2D projection) + GaussianTrainer2D
 * (alpha-blend backward) + Adam — over a set of posed views.
 *
 * HONEST SCOPE (what this is and is NOT — per the 2026-06-20 /critic review):
 *  - It IS a correct, finite-difference-verified differentiable 3DGS optimizer (the math is real).
 *  - FIXED-CARDINALITY: there is NO densification/pruning. The Gaussian count is exactly `initial.N`
 *    for the whole run. The job's `targetGaussians`/`densifyInterval` are NOT consumed here (they are
 *    the remote-backend / future-densification vocabulary) — so they are deliberately absent from the
 *    consumed `GaussianTrainJobSpec` below rather than declared-but-ignored.
 *  - DIFFUSE COLOR ONLY: flat per-gaussian RGB, no spherical harmonics — cannot fit view-dependent
 *    specular appearance. (A multi-view fit against targets rendered by this same forward pass cannot
 *    reveal this gap; real photometric captures will.)
 *  - CPU COST: O(views * iters * pixels * N) with NO tile binning or frustum culling (every gaussian
 *    is tested at every pixel). Tractable to ~hundreds of gaussians at thumbnail resolution; real
 *    scale (1e5-1e6 gaussians, HD, 30k iters) needs the WGSL kernel (splat-train-backward.wgsl —
 *    drafted, NOT yet dispatched on a GPU) plus tiling. This runner does NOT call that kernel.
 *  - This optimizes a SCENE FROM POSED VIEWS; it is not a full gsplat replacement until capture
 *    ingestion (PLY/point-cloud init + image decode) and the above are built. No real capture has
 *    been trained yet (blocked on source data — see GaussianTrainDataset.ts).
 */

import { forward2D, backward2D } from './GaussianTrainer2D';
import { forward3D, backward3D, type Gaussian3D, type SplatCamera } from './GaussianTrainer3D';
import { densifyAndPrune, seededRng } from './GaussianDensify';

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
    /** Renderer-matched 2D low-pass (Mip-Splatting eps2d). NOTE: forward3D applies a fixed 0.3px
     *  internally; a value other than 0.3 here is NOT yet honoured (threading it through forward3D
     *  is a follow-up). Present so the consumed spec records the assumed value. */
    dilation: number;
  };
  /** Adaptive density control (3DGS Algorithm 1). When ABSENT, the runner is fixed-cardinality
   *  (the original behaviour). When present, gaussians clone/split/prune across the warmup window. */
  densification?: {
    /** Densify every `interval` iterations. */
    interval: number;
    /** Start densifying at this iteration (warmup). */
    fromIter: number;
    /** Stop densifying after this iteration. */
    untilIter: number;
    /** Avg 2D-mean gradient (px) above which a gaussian is densified. */
    gradThreshold: number;
    /** Prune gaussians with opacity below this. */
    opacityPrune: number;
    /** Clone if max world scale <= this, else split. */
    scaleThreshold: number;
    /** Split shrink factor (paper φ = 1.6). */
    splitFactor?: number;
    /** Hard cap on gaussian count. */
    maxGaussians: number;
    /** Deterministic RNG seed (default 1). */
    seed?: number;
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
  /** Final gaussian count (differs from initial.N iff densification ran). */
  finalCount: number;
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
  let g = initial;
  const iters = Math.max(1, Math.floor(job.hyperparams.iterations));
  const lr = lrFor(job);
  const dc = job.densification;
  const rng = seededRng(dc?.seed ?? 1);

  // Adam state per parameter (rebuilt when densification changes the count).
  let m: Record<string, Float64Array> = {}, vAdam: Record<string, Float64Array> = {};
  for (const p of PARAMS) { m[p] = zeros(g.N); vAdam[p] = zeros(g.N); }
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;

  // Per-gaussian screen-space (2D mean) gradient accumulator over the current densify interval.
  let gradAccum2d = zeros(g.N);
  let accumCount = 0;

  const lossHistory: number[] = [];
  let initialLoss = 0, loss = 0;

  for (let it = 0; it < iters; it++) {
    const N = g.N; // re-read each iter — densification changes it
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
      if (dc) for (let i = 0; i < N; i++) gradAccum2d[i] += Math.hypot(dG2.posx[i], dG2.posy[i]); // screen-space grad
    }
    if (dc) accumCount += views.length;
    if (it === 0) initialLoss = loss;
    lossHistory.push(loss);

    // Adam step with per-group learning rates.
    const t = it + 1;
    for (const p of PARAMS) {
      const gp = G[p], mp = m[p], vp = vAdam[p], buf = g[p], step = lr[p];
      for (let i = 0; i < N; i++) {
        const gr = gp[i];
        mp[i] = b1 * mp[i] + (1 - b1) * gr;
        vp[i] = b2 * vp[i] + (1 - b2) * gr * gr;
        buf[i] -= step * (mp[i] / (1 - b1 ** t)) / (Math.sqrt(vp[i] / (1 - b2 ** t)) + eps);
        if (p === 'op') buf[i] = Math.max(0.02, Math.min(0.999, buf[i]));
        else if (p === 'sx' || p === 'sy' || p === 'sz') buf[i] = Math.max(0.02, buf[i]);
        else if (p === 'r' || p === 'gr' || p === 'bl') buf[i] = Math.max(0, Math.min(1, buf[i]));
      }
    }

    // Adaptive density control on the interval (within the warmup window).
    if (dc && it >= dc.fromIter && it <= dc.untilIter && (it + 1) % dc.interval === 0 && accumCount > 0) {
      const avgGrad2d = new Float64Array(g.N);
      for (let i = 0; i < g.N; i++) avgGrad2d[i] = gradAccum2d[i] / accumCount;
      const { gaussians, origin } = densifyAndPrune(
        g,
        { avgGrad2d },
        {
          gradThreshold: dc.gradThreshold, opacityPrune: dc.opacityPrune,
          scaleThreshold: dc.scaleThreshold, splitFactor: dc.splitFactor, maxGaussians: dc.maxGaussians,
        },
        rng,
      );
      // Rebuild Adam state: survivors carry their moments (origin >= 0), new gaussians start at zero.
      const nm: Record<string, Float64Array> = {}, nv: Record<string, Float64Array> = {};
      for (const p of PARAMS) {
        const a = zeros(gaussians.N), b = zeros(gaussians.N);
        for (let j = 0; j < gaussians.N; j++) { const o = origin[j]; if (o >= 0) { a[j] = m[p][o]; b[j] = vAdam[p][o]; } }
        nm[p] = a; nv[p] = b;
      }
      g = gaussians; m = nm; vAdam = nv;
      gradAccum2d = zeros(g.N); accumCount = 0;
    }
  }

  return { gaussians: g, initialLoss, finalLoss: loss, iterations: iters, lossHistory, finalCount: g.N };
}
