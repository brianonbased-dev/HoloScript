/**
 * GaussianSH — spherical-harmonics view-dependent color model.
 *
 * Three proofs:
 *  1. GRADIENT CHECK — evalSHGrad (dCoeffs + dDir) matches central finite differences (the same
 *     unforgeable gate as the rest of the trainer). Degree 2, all 9 coeffs + 3 direction components.
 *  2. VIEW-DEPENDENCE — a gaussian with non-zero degree-1 coeffs shows DIFFERENT color from different
 *     view directions (flat RGB / degree 0 cannot).
 *  3. SH BEATS FLAT — fitting view-dependent target colors with degree-1 SH reaches a far lower
 *     residual than degree-0 (flat), which can only reproduce the angular average. This is the exact
 *     capability the /critic #4 finding said was missing.
 */
import { describe, it, expect } from 'vitest';
import { evalSH, evalSHGrad, shBasis, shColor, shCoeffCount } from '../GaussianSH';

function seeded(s: number): () => number {
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
function normalize(x: number, y: number, z: number): [number, number, number] {
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
}

describe('GaussianSH — gradient check (analytic vs finite differences)', () => {
  it('evalSHGrad dCoeffs + dDir match central differences (degree 2)', () => {
    const R = seeded(31);
    const deg = 2, n = shCoeffCount(deg); // 9
    const coeffs = Array.from({ length: n }, () => (R() - 0.5) * 2);
    let [x, y, z] = normalize(R() - 0.5, R() - 0.5, R() - 0.5);
    const dR = 1; // so dCoeffs = ∂evalSH/∂coeff, dDir = ∂evalSH/∂dir
    const G = evalSHGrad(coeffs, x, y, z, deg, dR);
    const eps = 1e-6;
    let worst = 0;

    // ∂evalSH/∂coeff_k
    for (let k = 0; k < n; k++) {
      const orig = coeffs[k];
      coeffs[k] = orig + eps; const Lp = evalSH(coeffs, x, y, z, deg);
      coeffs[k] = orig - eps; const Lm = evalSH(coeffs, x, y, z, deg);
      coeffs[k] = orig;
      const fd = (Lp - Lm) / (2 * eps);
      worst = Math.max(worst, Math.abs(fd - G.dCoeffs[k]) / (Math.max(Math.abs(fd), Math.abs(G.dCoeffs[k])) + 1e-8));
    }
    // ∂evalSH/∂dir (x,y,z treated as free)
    const dirAnalytic = G.dDir;
    const comps: Array<[number, () => number, (v: number) => void]> = [
      [x, () => x, (v) => { x = v; }],
      [y, () => y, (v) => { y = v; }],
      [z, () => z, (v) => { z = v; }],
    ];
    for (let c = 0; c < 3; c++) {
      const orig = comps[c][0];
      comps[c][2](orig + eps); const Lp = evalSH(coeffs, x, y, z, deg);
      comps[c][2](orig - eps); const Lm = evalSH(coeffs, x, y, z, deg);
      comps[c][2](orig);
      const fd = (Lp - Lm) / (2 * eps);
      worst = Math.max(worst, Math.abs(fd - dirAnalytic[c]) / (Math.max(Math.abs(fd), Math.abs(dirAnalytic[c])) + 1e-8));
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('shBasis degree 0 is the constant term only (= flat RGB)', () => {
    const b = shBasis(0.3, -0.5, 0.8, 0);
    expect(b).toHaveLength(1);
  });
});

describe('GaussianSH — view-dependent color', () => {
  it('a gaussian with degree-1 coeffs looks different from different directions', () => {
    const coeffs = [0, 0.9, 0, 0]; // strong directional term on the y-basis
    const front = shColor(coeffs, ...normalize(0, 1, 0), 1);
    const side = shColor(coeffs, ...normalize(0, -1, 0), 1);
    expect(Math.abs(front - side)).toBeGreaterThan(0.3); // genuinely view-dependent
  });

  it('SH degree 1 fits view-dependent targets far better than degree 0 (flat)', () => {
    const R = seeded(7);
    // true color field: degree-1 SH (directional). Sample M view directions.
    const trueC = [0.2, 0.6, -0.5, 0.3];
    const M = 16;
    const dirs = Array.from({ length: M }, () => normalize(R() - 0.5, R() - 0.5, R() - 0.5));
    const target = dirs.map((d) => evalSH(trueC, d[0], d[1], d[2], 1));

    // fit SH of a given degree by Adam over its coeffs
    const fit = (deg: number): number => {
      const n = shCoeffCount(deg);
      const c = new Float64Array(n);
      const m = new Float64Array(n), v = new Float64Array(n);
      const lr = 0.1, b1 = 0.9, b2 = 0.999;
      let L = 0;
      for (let it = 0; it < 600; it++) {
        const g = new Float64Array(n); L = 0;
        for (let i = 0; i < M; i++) {
          const pred = evalSH(c, dirs[i][0], dirs[i][1], dirs[i][2], deg);
          const e = pred - target[i]; L += 0.5 * e * e;
          const b = shBasis(dirs[i][0], dirs[i][1], dirs[i][2], deg);
          for (let k = 0; k < n; k++) g[k] += e * b[k];
        }
        const t = it + 1;
        for (let k = 0; k < n; k++) {
          m[k] = b1 * m[k] + (1 - b1) * g[k]; v[k] = b2 * v[k] + (1 - b2) * g[k] * g[k];
          c[k] -= lr * (m[k] / (1 - b1 ** t)) / (Math.sqrt(v[k] / (1 - b2 ** t)) + 1e-8);
        }
      }
      return L;
    };

    const flat = fit(0); // degree 0 — can only fit the average
    const dir1 = fit(1); // degree 1 — captures the direction
    expect(dir1).toBeLessThan(flat / 100); // SH reproduces what flat structurally cannot
  });
});
