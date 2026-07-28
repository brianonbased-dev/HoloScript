/**
 * Gradient-check gate for the sovereign 3DGS trainer's PROJECTION chain (Stage 2). The analytic
 * backward (backward3D ∘ backward2D) MUST match central finite differences for every 3D parameter
 * — mean3d, scale, quaternion. This is the definitive correctness test for the EWA projection
 * Jacobians (∂cov2d/∂{scale,quat}, ∂mean2d/∂mean3d, and the J-through-mean coupling).
 * Plus an end-to-end Adam test that fits real 3D gaussians to a posed-view target.
 */
import { describe, it, expect } from 'vitest';
import { forward2D, backward2D, type Gaussian2D } from '../GaussianTrainer2D';
import { forward3D, backward3D, type Gaussian3D, type SplatCamera } from '../GaussianTrainer3D';

function seeded(s: number): () => number {
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function makeScene(seed: number, N: number): Gaussian3D {
  const R = seeded(seed);
  return {
    N,
    x: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.8),
    y: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.8),
    z: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.6),
    sx: Float64Array.from({ length: N }, () => 0.08 + R() * 0.18),
    sy: Float64Array.from({ length: N }, () => 0.08 + R() * 0.18),
    sz: Float64Array.from({ length: N }, () => 0.08 + R() * 0.18),
    qr: Float64Array.from({ length: N }, () => 1.0),
    qx: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.6),
    qy: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.6),
    qz: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.6),
    op: Float64Array.from({ length: N }, () => 0.3 + R() * 0.6),
    r: Float64Array.from({ length: N }, () => R()),
    gr: Float64Array.from({ length: N }, () => R()),
    bl: Float64Array.from({ length: N }, () => R()),
  };
}

// mild camera rotation (0.2 rad about y) so the V*Sigma*Vᵀ congruence is exercised
const CA = Math.cos(0.2),
  SA = Math.sin(0.2);
const CAM3: SplatCamera = { Vrow: [CA, 0, SA, 0, 1, 0, -SA, 0, CA], t: [0, 0, 5], fx: 24, fy: 24 };

describe('GaussianTrainer3D projection backward (gradient check)', () => {
  it('analytic gradients match central differences for mean3d / scale / quat', () => {
    const W = 20,
      H = 16,
      N = 5;
    const g = makeScene(1234, N);
    const R = seeded(77);
    const target = Float64Array.from({ length: W * H * 3 }, () => R());
    const NC = { clip: false } as const;

    const lossOf = (gg: Gaussian3D): number => {
      const { g2 } = forward3D(gg, CAM3, W, H);
      const { img } = forward2D(g2, W, H, [0, 0, 0], NC);
      let L = 0;
      for (let k = 0; k < img.length; k++) {
        const d = img[k] - target[k];
        L += 0.5 * d * d;
      }
      return L;
    };

    const { g2, I } = forward3D(g, CAM3, W, H);
    const { img } = forward2D(g2, W, H, [0, 0, 0], NC);
    const dLimg = new Float64Array(img.length);
    for (let k = 0; k < img.length; k++) dLimg[k] = img[k] - target[k];
    const dG2 = backward2D(g2, W, H, dLimg, [0, 0, 0], NC);
    const G = backward3D(g, CAM3, W, H, I, dG2);

    const eps = 1e-6;
    const params = ['x', 'y', 'z', 'sx', 'sy', 'sz', 'qr', 'qx', 'qy', 'qz'] as const;
    let worst = 0;
    for (const p of params) {
      for (let i = 0; i < N; i++) {
        const orig = g[p][i];
        g[p][i] = orig + eps;
        const Lp = lossOf(g);
        g[p][i] = orig - eps;
        const Lm = lossOf(g);
        g[p][i] = orig;
        const fd = (Lp - Lm) / (2 * eps);
        const an = G[p][i];
        const rel = Math.abs(fd - an) / (Math.max(Math.abs(fd), Math.abs(an)) + 1e-8);
        worst = Math.max(worst, rel);
      }
    }
    expect(worst).toBeLessThan(1e-3);
  });

  it('Adam fits real 3D gaussians to a posed-view target (>100x L2 reduction)', () => {
    const W = 48,
      H = 36,
      N = 100,
      ITERS = 250;
    const cam: SplatCamera = {
      Vrow: [Math.cos(0.15), 0, Math.sin(0.15), 0, 1, 0, -Math.sin(0.15), 0, Math.cos(0.15)],
      t: [0, 0, 6],
      fx: 60,
      fy: 60,
    };
    const truth = makeScene(99, N);
    const target = forward2D(forward3D(truth, cam, W, H).g2, W, H).img;
    const g = makeScene(3, N);

    const P = [
      'x',
      'y',
      'z',
      'sx',
      'sy',
      'sz',
      'qr',
      'qx',
      'qy',
      'qz',
      'op',
      'r',
      'gr',
      'bl',
    ] as const;
    const lr: Record<string, number> = {
      x: 0.02,
      y: 0.02,
      z: 0.02,
      sx: 0.004,
      sy: 0.004,
      sz: 0.004,
      qr: 0.01,
      qx: 0.01,
      qy: 0.01,
      qz: 0.01,
      op: 0.01,
      r: 0.01,
      gr: 0.01,
      bl: 0.01,
    };
    const m: Record<string, Float64Array> = {},
      v: Record<string, Float64Array> = {};
    for (const p of P) {
      m[p] = new Float64Array(N);
      v[p] = new Float64Array(N);
    }

    let L0 = 0,
      L = 0;
    for (let it = 0; it < ITERS; it++) {
      const { g2, I } = forward3D(g, cam, W, H);
      const { img } = forward2D(g2, W, H);
      const dL = new Float64Array(img.length);
      L = 0;
      for (let k = 0; k < img.length; k++) {
        const d = img[k] - target[k];
        dL[k] = d;
        L += 0.5 * d * d;
      }
      if (it === 0) L0 = L;
      const dG2 = backward2D(g2, W, H, dL);
      const G = backward3D(g, cam, W, H, I, dG2);
      const t = it + 1,
        b1 = 0.9,
        b2 = 0.999;
      for (const p of P)
        for (let i = 0; i < N; i++) {
          const gr = G[p][i];
          m[p][i] = b1 * m[p][i] + (1 - b1) * gr;
          v[p][i] = b2 * v[p][i] + (1 - b2) * gr * gr;
          g[p][i] -=
            (lr[p] * (m[p][i] / (1 - b1 ** t))) / (Math.sqrt(v[p][i] / (1 - b2 ** t)) + 1e-8);
          if (p === 'op') g[p][i] = Math.max(0.02, Math.min(0.999, g[p][i]));
          if (p === 'sx' || p === 'sy' || p === 'sz') g[p][i] = Math.max(0.02, g[p][i]);
          if (p === 'r' || p === 'gr' || p === 'bl') g[p][i] = Math.max(0, Math.min(1, g[p][i]));
        }
    }
    expect(L).toBeLessThan(L0 / 100);
  });
});
