/**
 * @fileoverview Differentiable 2D Gaussian rasterizer — the autodiff CORE of the
 * sovereign HoloScript 3DGS trainer (no Python gsplat, no remote cloud).
 *
 * This is the CPU REFERENCE for the forward+backward alpha-blend math. It is the
 * parity spec the eventual WGSL trainer kernels are checked against (same role as
 * `splat-shared-sort.parity.ts` plays for the sort). The hard part of a 3DGS trainer
 * is the gradient of the front-to-back over-blend w.r.t. every gaussian parameter;
 * that math lives here and is verified by `GaussianTrainer2D.test.ts` against
 * finite differences (max rel err ~1e-5).
 *
 * Pipeline owned: capture → reconstruct → TRAIN (this) → render → twin. This closes
 * the one native gap — training was previously Python (`train_refine.py`) or a remote
 * call to `api.rendernetwork.com` in `GaussianSplatBakingPipeline`.
 *
 * Stage 1 (here): 2D gaussians, fixed index order. Stage 2 adds the 3D→2D projection
 * chain (∂cov2d/∂{scale,quat}, ∂mean2d/∂mean3d) so it optimizes real 3D gaussians from
 * posed views. Stage 3 ports the hot path to WGSL on the sovereign GaussianSplatSorter.
 */

/** SoA buffers for N 2D gaussians. `a,b,c` are the 2D conic (inverse covariance). */
export interface Gaussian2D {
  N: number;
  posx: Float64Array; posy: Float64Array;
  a: Float64Array; b: Float64Array; c: Float64Array;
  r: Float64Array; gr: Float64Array; bl: Float64Array;
  op: Float64Array;
}

/** Per-parameter gradient buffers (same shape as Gaussian2D minus N). */
export interface Gaussian2DGrad {
  posx: Float64Array; posy: Float64Array;
  a: Float64Array; b: Float64Array; c: Float64Array;
  r: Float64Array; gr: Float64Array; bl: Float64Array;
  op: Float64Array;
}

export interface RasterOpts {
  /** Apply the production cutoffs (alpha<1/255 skip, 0.999 clamp). false => smooth (for grad checks). */
  clip?: boolean;
}

export interface ForwardResult {
  img: Float64Array; // W*H*3, premultiplied-over composite
  tFinal: Float64Array; // W*H final transmittance
}

/**
 * Forward: per pixel, front-to-back over-blend of the N gaussians (index order).
 *   alpha_i = op_i * exp(-(0.5*(a*dx^2 + c*dy^2) + b*dx*dy))
 *   C += T * alpha_i * color_i ; T *= (1 - alpha_i)
 */
export function forward2D(g: Gaussian2D, W: number, H: number, bg: readonly [number, number, number] = [0, 0, 0], opts: RasterOpts = {}): ForwardResult {
  const clip = opts.clip !== false;
  const img = new Float64Array(W * H * 3);
  const tFinal = new Float64Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let T = 1, cr = 0, cg = 0, cb = 0;
      for (let i = 0; i < g.N; i++) {
        const dx = px + 0.5 - g.posx[i], dy = py + 0.5 - g.posy[i];
        const sigma = 0.5 * (g.a[i] * dx * dx + g.c[i] * dy * dy) + g.b[i] * dx * dy;
        if (clip && sigma < 0) continue;
        let alpha = g.op[i] * Math.exp(-sigma);
        if (clip && alpha < 1 / 255) continue;
        if (clip) alpha = Math.min(alpha, 0.999);
        cr += T * alpha * g.r[i]; cg += T * alpha * g.gr[i]; cb += T * alpha * g.bl[i];
        T *= 1 - alpha;
      }
      const o = (py * W + px) * 3;
      img[o] = cr + T * bg[0]; img[o + 1] = cg + T * bg[1]; img[o + 2] = cb + T * bg[2];
      tFinal[py * W + px] = T;
    }
  }
  return { img, tFinal };
}

function zeroGrad(N: number): Gaussian2DGrad {
  return { posx: new Float64Array(N), posy: new Float64Array(N), a: new Float64Array(N), b: new Float64Array(N),
    c: new Float64Array(N), r: new Float64Array(N), gr: new Float64Array(N), bl: new Float64Array(N), op: new Float64Array(N) };
}

/**
 * Backward: given dL/dimg, accumulate dL/d{params}. Replays the per-pixel blend, then
 * walks gaussians back-to-front accumulating the suffix S_i = Σ_{j>i} c_j α_j T_j + T_f·bg.
 *   dC/dcolor_i = T_i·α_i
 *   dC/dα_i     = T_i·color_i − S_i/(1−α_i)
 *   chain α→σ→{conic, mean2d}: dα/dσ = −α, σ = 0.5(a dx²+c dy²)+b dx dy
 */
export function backward2D(g: Gaussian2D, W: number, H: number, dLimg: Float64Array, bg: readonly [number, number, number] = [0, 0, 0], opts: RasterOpts = {}): Gaussian2DGrad {
  const clip = opts.clip !== false;
  const G = zeroGrad(g.N);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const o = (py * W + px) * 3;
      const dLr = dLimg[o], dLg = dLimg[o + 1], dLb = dLimg[o + 2];
      const hits: { i: number; dx: number; dy: number; sigma: number; alpha: number; clamped: boolean; Tb: number }[] = [];
      let T = 1;
      for (let i = 0; i < g.N; i++) {
        const dx = px + 0.5 - g.posx[i], dy = py + 0.5 - g.posy[i];
        const sigma = 0.5 * (g.a[i] * dx * dx + g.c[i] * dy * dy) + g.b[i] * dx * dy;
        if (clip && sigma < 0) continue;
        let alpha = g.op[i] * Math.exp(-sigma);
        if (clip && alpha < 1 / 255) continue;
        const clamped = clip && alpha > 0.999;
        if (clip) alpha = Math.min(alpha, 0.999);
        hits.push({ i, dx, dy, sigma, alpha, clamped, Tb: T });
        T *= 1 - alpha;
      }
      let sr = T * bg[0], sg = T * bg[1], sb = T * bg[2];
      for (let k = hits.length - 1; k >= 0; k--) {
        const h = hits[k], i = h.i, Tb = h.Tb, al = h.alpha;
        G.r[i] += dLr * Tb * al; G.gr[i] += dLg * Tb * al; G.bl[i] += dLb * Tb * al;
        const inv = 1 / (1 - al);
        const dCdA = dLr * (Tb * g.r[i] - sr * inv) + dLg * (Tb * g.gr[i] - sg * inv) + dLb * (Tb * g.bl[i] - sb * inv);
        sr += al * Tb * g.r[i]; sg += al * Tb * g.gr[i]; sb += al * Tb * g.bl[i];
        if (h.clamped) continue;
        G.op[i] += dCdA * Math.exp(-h.sigma);
        const dCdSigma = dCdA * -al;
        G.a[i] += dCdSigma * 0.5 * h.dx * h.dx;
        G.c[i] += dCdSigma * 0.5 * h.dy * h.dy;
        G.b[i] += dCdSigma * h.dx * h.dy;
        const dSdx = g.a[i] * h.dx + g.b[i] * h.dy, dSdy = g.c[i] * h.dy + g.b[i] * h.dx;
        G.posx[i] += dCdSigma * -dSdx;
        G.posy[i] += dCdSigma * -dSdy;
      }
    }
  }
  return G;
}
