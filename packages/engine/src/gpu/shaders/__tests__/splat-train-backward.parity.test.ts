/**
 * Parity tests for splat-train-backward.wgsl (Stage 3 — GPU trainer backward).
 *
 * Two layers (mirrors splat-shared-sort.parity.test):
 *   1. STRUCTURAL — read the .wgsl as text and assert it contains the load-bearing operations
 *      (fixed-point atomic scatter, the alpha cutoffs, the additive suffix recurrence, the round
 *      quantizer, the shared FIXED_POINT_SCALE). Catches .wgsl drifting from the JS twin.
 *   2. BEHAVIORAL — run the JS twin (trainBackwardParity) and compare against backward2D, the
 *      finite-difference-verified CPU reference. Catches the twin drifting from the truth.
 *
 * Transitivity: WGSL ↔ twin (structural) + twin ↔ backward2D (behavioral) + backward2D ↔ true
 * gradients (GaussianTrainer2D.test finite-diff) ⇒ the WGSL kernel computes the true gradients,
 * modulo the fixed-point quantization (bounded below).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { backward2D, forward2D, type Gaussian2D } from '../../GaussianTrainer2D';
import { trainBackwardParity, FIXED_POINT_SCALE } from '../splat-train-backward.parity';

const WGSL_PATH = fileURLToPath(new URL('../splat-train-backward.wgsl', import.meta.url));
const wgsl = readFileSync(WGSL_PATH, 'utf8');

function seeded(s: number): () => number {
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
function makeScene(N: number, W: number, H: number, R: () => number): Gaussian2D {
  const g: Gaussian2D = {
    N,
    posx: Float64Array.from({ length: N }, () => 2 + R() * (W - 4)),
    posy: Float64Array.from({ length: N }, () => 2 + R() * (H - 4)),
    a: Float64Array.from({ length: N }, () => 0.08 + R() * 0.25),
    b: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.05),
    c: Float64Array.from({ length: N }, () => 0.08 + R() * 0.25),
    r: Float64Array.from({ length: N }, () => R()),
    gr: Float64Array.from({ length: N }, () => R()),
    bl: Float64Array.from({ length: N }, () => R()),
    op: Float64Array.from({ length: N }, () => 0.3 + R() * 0.6),
  };
  for (let i = 0; i < N; i++) if (g.a[i] * g.c[i] - g.b[i] * g.b[i] <= 0.001) g.b[i] = 0;
  return g;
}

describe('splat-train-backward.wgsl — structural', () => {
  it('contains the load-bearing operations', () => {
    expect(wgsl).toMatch(/atomicAdd\(&grad\[/); // fixed-point gradient scatter
    expect(wgsl).toMatch(/fn toFixed/);
    expect(wgsl).toMatch(/i32\(round\(v \* FIXED_POINT_SCALE\)\)/); // unbiased quantizer (not truncation)
    expect(wgsl).toMatch(/1\.0 \/ 255\.0/); // ALPHA_MIN cutoff
    expect(wgsl).toMatch(/0\.999/); // ALPHA_MAX clamp
    expect(wgsl).toMatch(/sr = sr \+ al \* Tb \* s\.r/); // additive suffix recurrence
    expect(wgsl).toMatch(/atomic<i32>/); // no atomic<f32> in WebGPU — i32 fixed-point
  });

  it('FIXED_POINT_SCALE matches the parity twin', () => {
    const m = wgsl.match(/FIXED_POINT_SCALE:\s*f32\s*=\s*([\d.]+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(FIXED_POINT_SCALE);
  });
});

describe('splat-train-backward — behavioral parity vs backward2D', () => {
  it('twin gradients match the CPU reference within fixed-point tolerance (all params)', () => {
    const W = 40, H = 30, N = 24;
    const R = seeded(2026);
    const g = makeScene(N, W, H, R);
    const bg: [number, number, number] = [0, 0, 0];

    // dL/dimg = img - target (a representative training gradient), production clip path.
    const { img } = forward2D(g, W, H, bg);
    const dLimg = new Float64Array(img.length);
    for (let k = 0; k < img.length; k++) dLimg[k] = img[k] - R();

    const truth = backward2D(g, W, H, dLimg, bg); // clip=true (default) — same path as the kernel
    const twin = trainBackwardParity(g, W, H, dLimg, bg);

    // Quantized-numerics tolerance (atol + rtol, like numpy allclose): the fixed-point round-trip
    // perturbs each gradient by ~accumulated round-off (absolute), not a relative amount — so
    // meaningful gradients must match RELATIVELY (1%), near-zero ones ABSOLUTELY (the quant floor).
    const ABS_FLOOR = 5e-3;  // |grad| below this: a relative metric is unstable → check absolute
    const ABS_TOL = 2e-3;    // quantization noise bound (~sqrt(footprint)*0.5/SCALE)
    const REL_TOL = 1e-2;    // meaningful gradients: 1% (a real formula bug breaks this badly)
    const params = ['posx', 'posy', 'a', 'b', 'c', 'r', 'gr', 'bl', 'op'] as const;
    let worstRel = 0, worstRelP = '', worstAbs = 0, worstAbsP = '';
    let nMeaningful = 0, maxFixedPoint = 0;
    for (const p of params) {
      for (let i = 0; i < N; i++) {
        const t = truth[p][i], w = twin[p][i];
        maxFixedPoint = Math.max(maxFixedPoint, Math.abs(w) * FIXED_POINT_SCALE);
        const absErr = Math.abs(t - w);
        if (Math.abs(t) > ABS_FLOOR) {
          nMeaningful++;
          const rel = absErr / Math.abs(t);
          if (rel > worstRel) { worstRel = rel; worstRelP = `${p}[${i}]=${t.toFixed(4)}`; }
        } else if (absErr > worstAbs) { worstAbs = absErr; worstAbsP = `${p}[${i}]=${t.toExponential(2)}`; }
      }
    }
    expect(nMeaningful, 'scene must produce meaningful gradients (test not vacuous)').toBeGreaterThan(10);
    expect(maxFixedPoint, 'fixed-point values must stay in i32 range (no overflow on real GPU)').toBeLessThan(2 ** 31);
    expect(worstRel, `worst relative at ${worstRelP}`).toBeLessThan(REL_TOL);
    expect(worstAbs, `worst absolute at ${worstAbsP}`).toBeLessThan(ABS_TOL);
  });

  it('is exact (zero) where the reference is zero (non-contributing gaussians)', () => {
    const W = 16, H = 12, N = 6;
    const R = seeded(7);
    const g = makeScene(N, W, H, R);
    // Push one gaussian far off-screen so it never contributes — its grad must be 0 in both.
    g.posx[0] = 1e6; g.posy[0] = 1e6;
    const dLimg = Float64Array.from({ length: W * H * 3 }, () => R() - 0.5);
    const truth = backward2D(g, W, H, dLimg);
    const twin = trainBackwardParity(g, W, H, dLimg);
    for (const p of ['posx', 'posy', 'a', 'b', 'c', 'r', 'gr', 'bl', 'op'] as const) {
      expect(twin[p][0]).toBe(0);
      expect(truth[p][0]).toBe(0);
    }
  });
});
