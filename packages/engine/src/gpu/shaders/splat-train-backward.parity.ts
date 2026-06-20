/**
 * splat-train-backward.parity.ts
 *
 * JavaScript port of the WGSL kernel in `splat-train-backward.wgsl`. Exists so the GPU trainer
 * backward can be exercised in Node (no WebGPU adapter there) and compared against the
 * gradient-checked CPU reference GaussianTrainer2D.backward2D.
 *
 * It mirrors the kernel EXACTLY, including the fixed-point round-trip: gradients are quantized via
 * `toFixed(v) = round(v * SCALE)` (matching `i32(round(...))` in WGSL), accumulated as integers
 * (the atomic<i32> scatter), then dequantized by `/ SCALE`. The only twin↔WGSL difference is
 * round-half tie-breaking (JS half-up vs WGSL half-to-even), which is measure-zero on real data.
 *
 * Parity chain (mirrors splat-shared-sort): WGSL ↔ this twin is STRUCTURAL (the test regexes the
 * .wgsl for the load-bearing ops); this twin ↔ backward2D is BEHAVIORAL (numeric, within the
 * fixed-point tolerance). backward2D ↔ true gradients is already proven by finite differences.
 *
 * If splat-train-backward.wgsl is edited, this twin MUST be updated in lockstep.
 *
 * @see splat-train-backward.wgsl
 * @see ../GaussianTrainer2D.ts (backward2D — the CPU reference)
 */

import type { Gaussian2D, Gaussian2DGrad } from '../GaussianTrainer2D';

/** Fixed-point scale — MUST equal FIXED_POINT_SCALE in splat-train-backward.wgsl. */
export const FIXED_POINT_SCALE = 65536;
/** Per-pixel hit cap — MUST equal MAX_HITS in the .wgsl. */
export const MAX_HITS = 256;
const ALPHA_MIN = 1 / 255;
const ALPHA_MAX = 0.999;

/** round(v*scale) clamped to i32 — mirrors WGSL `i32(round(v * FIXED_POINT_SCALE))`. */
function toFixed(v: number, scale: number): number {
  return Math.round(v * scale) | 0;
}

/**
 * Parity twin of the WGSL alpha-blend backward. Returns dequantized per-gaussian gradients
 * (same shape as backward2D). Uses the production cutoffs (clip=true): sigma<0 skip,
 * alpha<1/255 skip, 0.999 clamp — matching the kernel.
 */
export function trainBackwardParity(
  g: Gaussian2D,
  W: number,
  H: number,
  dLimg: Float64Array | Float32Array,
  bg: readonly [number, number, number] = [0, 0, 0],
  scale: number = FIXED_POINT_SCALE,
): Gaussian2DGrad {
  const N = g.N;
  // Flat fixed-point accumulator: acc[i*9 + k], k = {posx,posy,a,b,c,r,g,bl,op} — the atomic<i32> buffer.
  const acc = new Float64Array(N * 9);

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const o = (py * W + px) * 3;
      const dLr = dLimg[o], dLg = dLimg[o + 1], dLb = dLimg[o + 2];
      const fx = px + 0.5, fy = py + 0.5;

      // forward replay → hits (front-to-back), capped at MAX_HITS
      const hitI: number[] = [], hitAl: number[] = [], hitTb: number[] = [], hitClamp: number[] = [];
      let T = 1;
      for (let i = 0; i < N; i++) {
        const dx = fx - g.posx[i], dy = fy - g.posy[i];
        const sigma = 0.5 * (g.a[i] * dx * dx + g.c[i] * dy * dy) + g.b[i] * dx * dy;
        if (sigma < 0) continue;
        let alpha = g.op[i] * Math.exp(-sigma);
        if (alpha < ALPHA_MIN) continue;
        const clamped = alpha > ALPHA_MAX;
        alpha = Math.min(alpha, ALPHA_MAX);
        if (hitI.length < MAX_HITS) {
          hitI.push(i); hitAl.push(alpha); hitTb.push(T); hitClamp.push(clamped ? 1 : 0);
        }
        T *= 1 - alpha;
      }

      // back-to-front suffix walk
      let sr = T * bg[0], sg = T * bg[1], sb = T * bg[2];
      for (let k = hitI.length - 1; k >= 0; k--) {
        const i = hitI[k], al = hitAl[k], Tb = hitTb[k];
        const dx = fx - g.posx[i], dy = fy - g.posy[i];

        acc[i * 9 + 5] += toFixed(dLr * Tb * al, scale);
        acc[i * 9 + 6] += toFixed(dLg * Tb * al, scale);
        acc[i * 9 + 7] += toFixed(dLb * Tb * al, scale);

        const inv = 1 / (1 - al);
        const dCdA = dLr * (Tb * g.r[i] - sr * inv) + dLg * (Tb * g.gr[i] - sg * inv) + dLb * (Tb * g.bl[i] - sb * inv);
        sr += al * Tb * g.r[i]; sg += al * Tb * g.gr[i]; sb += al * Tb * g.bl[i];

        if (hitClamp[k] === 0) {
          const sigma = 0.5 * (g.a[i] * dx * dx + g.c[i] * dy * dy) + g.b[i] * dx * dy;
          acc[i * 9 + 8] += toFixed(dCdA * Math.exp(-sigma), scale);
          const dCdSigma = dCdA * -al;
          acc[i * 9 + 2] += toFixed(dCdSigma * 0.5 * dx * dx, scale);
          acc[i * 9 + 4] += toFixed(dCdSigma * 0.5 * dy * dy, scale);
          acc[i * 9 + 3] += toFixed(dCdSigma * dx * dy, scale);
          const dSdx = g.a[i] * dx + g.b[i] * dy, dSdy = g.c[i] * dy + g.b[i] * dx;
          acc[i * 9 + 0] += toFixed(dCdSigma * -dSdx, scale);
          acc[i * 9 + 1] += toFixed(dCdSigma * -dSdy, scale);
        }
      }
    }
  }

  // dequantize the fixed-point accumulators
  const deq = (k: number): Float64Array => {
    const out = new Float64Array(N);
    for (let i = 0; i < N; i++) out[i] = acc[i * 9 + k] / scale;
    return out;
  };
  return {
    posx: deq(0), posy: deq(1), a: deq(2), b: deq(3), c: deq(4),
    r: deq(5), gr: deq(6), bl: deq(7), op: deq(8),
  };
}
