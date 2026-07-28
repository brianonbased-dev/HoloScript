/**
 * Gradient-check gate for the sovereign 3DGS trainer's autodiff core. The analytic
 * backward MUST match central finite differences — this is the definitive correctness
 * test for the alpha-blend gradients (the hard part of any gaussian-splat trainer).
 * Runs the SMOOTH rasterizer (clip:false) so the cutoffs don't inject step artifacts.
 */
import { describe, it, expect } from 'vitest';
import { forward2D, backward2D, type Gaussian2D } from '../GaussianTrainer2D';

function seeded(s: number): () => number {
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function makeScene(N: number, W: number, H: number, R: () => number): Gaussian2D {
  const g: Gaussian2D = {
    N,
    posx: Float64Array.from({ length: N }, () => 4 + R() * (W - 8)),
    posy: Float64Array.from({ length: N }, () => 4 + R() * (H - 8)),
    a: Float64Array.from({ length: N }, () => 0.05 + R() * 0.2),
    b: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.05),
    c: Float64Array.from({ length: N }, () => 0.05 + R() * 0.2),
    r: Float64Array.from({ length: N }, () => R()),
    gr: Float64Array.from({ length: N }, () => R()),
    bl: Float64Array.from({ length: N }, () => R()),
    op: Float64Array.from({ length: N }, () => 0.2 + R() * 0.7),
  };
  // keep the conic positive-definite (a*c - b^2 > 0)
  for (let i = 0; i < N; i++) if (g.a[i] * g.c[i] - g.b[i] * g.b[i] <= 0.001) g.b[i] = 0;
  return g;
}

describe('GaussianTrainer2D backward (gradient check)', () => {
  it('analytic gradients match central differences for every parameter', () => {
    const W = 24,
      H = 18,
      N = 6;
    const R = seeded(42);
    const g = makeScene(N, W, H, R);
    const target = Float64Array.from({ length: W * H * 3 }, () => R());
    const NC = { clip: false } as const;

    const loss = (gg: Gaussian2D): number => {
      const { img } = forward2D(gg, W, H, [0, 0, 0], NC);
      let L = 0;
      for (let k = 0; k < img.length; k++) {
        const d = img[k] - target[k];
        L += 0.5 * d * d;
      }
      return L;
    };
    const dLimg = (() => {
      const { img } = forward2D(g, W, H, [0, 0, 0], NC);
      const d = new Float64Array(img.length);
      for (let k = 0; k < img.length; k++) d[k] = img[k] - target[k];
      return d;
    })();

    const G = backward2D(g, W, H, dLimg, [0, 0, 0], NC);
    const eps = 1e-5;
    const params = ['posx', 'posy', 'a', 'b', 'c', 'r', 'gr', 'bl', 'op'] as const;

    let worst = 0;
    for (const p of params) {
      for (let i = 0; i < N; i++) {
        const orig = g[p][i];
        g[p][i] = orig + eps;
        const Lp = loss(g);
        g[p][i] = orig - eps;
        const Lm = loss(g);
        g[p][i] = orig;
        const fd = (Lp - Lm) / (2 * eps);
        const an = G[p][i];
        const rel = Math.abs(fd - an) / (Math.max(Math.abs(fd), Math.abs(an)) + 1e-8);
        worst = Math.max(worst, rel);
      }
    }
    expect(worst).toBeLessThan(1e-3);
  });

  it('Adam training reduces L2 loss by >100x on a fittable target', () => {
    const W = 48,
      H = 36,
      N = 150,
      ITERS = 200;
    const R = seeded(7);
    const target = new Float64Array(W * H * 3);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3,
          dr = Math.hypot(x - W / 2, y - H / 2),
          ring = Math.exp(-((dr - 11) ** 2) / 20);
        target[o] = Math.min(1, x / W + ring);
        target[o + 1] = Math.min(1, y / H + ring * 0.8);
        target[o + 2] = Math.min(1, 1 - x / W + ring);
      }
    const g = makeScene(N, W, H, R);
    for (let i = 0; i < N; i++) {
      g.a[i] = 0.08;
      g.b[i] = 0;
      g.c[i] = 0.08;
      g.op[i] = 0.5;
    }
    const P = ['posx', 'posy', 'a', 'b', 'c', 'r', 'gr', 'bl', 'op'] as const;
    const lr: Record<string, number> = {
      posx: 0.3,
      posy: 0.3,
      a: 0.002,
      b: 0.002,
      c: 0.002,
      r: 0.01,
      gr: 0.01,
      bl: 0.01,
      op: 0.02,
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
      const { img } = forward2D(g, W, H);
      const dL = new Float64Array(img.length);
      L = 0;
      for (let k = 0; k < img.length; k++) {
        const d = img[k] - target[k];
        dL[k] = d;
        L += 0.5 * d * d;
      }
      if (it === 0) L0 = L;
      const G = backward2D(g, W, H, dL);
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
          if (p === 'op') g[p][i] = Math.max(0.01, Math.min(0.999, g[p][i]));
          if (p === 'a' || p === 'c') g[p][i] = Math.max(0.005, g[p][i]);
        }
    }
    expect(L).toBeLessThan(L0 / 100);
  });
});
