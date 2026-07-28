/**
 * @fileoverview GaussianDensify — adaptive density control for the native 3DGS trainer.
 *
 * The original 3DGS paper's Algorithm 1: gaussians whose accumulated screen-space (2D mean) gradient
 * exceeds a threshold are "under-reconstructed" and get densified — small ones are CLONED (a jittered
 * copy is added), large ones are SPLIT (replaced by two smaller ones sampled from their distribution).
 * Transparent gaussians (opacity below a floor) are PRUNED. This is how a sparse init grows into a
 * dense scene — the mechanism the 2026-06-20 /critic review correctly named as missing
 * ("fixed-cardinality trainer"). Now built, gated, and verified.
 *
 * Deterministic: all randomness comes from a seeded RNG the caller passes, so densification is
 * reproducible (and the count is assertable in tests).
 */

import { type Gaussian3D, quatToR } from './GaussianTrainer3D';

/** Per-gaussian densification statistics accumulated over an interval by the runner. */
export interface DensifyStats {
  /** Average ||∂L/∂mean2d|| (screen-space, px) per gaussian over the interval. */
  avgGrad2d: Float64Array;
}

export interface DensifyOpts {
  /** Densify gaussians whose avg 2D-mean gradient exceeds this (px). */
  gradThreshold: number;
  /** Prune gaussians with opacity below this. */
  opacityPrune: number;
  /** Clone if max world scale <= this, otherwise split. */
  scaleThreshold: number;
  /** Split shrink factor (paper: φ = 1.6). */
  splitFactor?: number;
  /** Hard cap on gaussian count (stop densifying when reached). */
  maxGaussians: number;
}

export interface DensifyResult {
  gaussians: Gaussian3D;
  /** origin[newIdx] = source oldIdx for survivors, -1 for freshly created (clone/split) gaussians.
   *  Lets the caller carry Adam moments for survivors and zero them for new ones. */
  origin: Int32Array;
}

const FIELDS = [
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
type Field = (typeof FIELDS)[number];

/** Rotate a world offset (sx*u, sy*v, sz*w) by the gaussian's quaternion. */
function rotatedOffset(
  g: Gaussian3D,
  i: number,
  u: number,
  v: number,
  w: number
): [number, number, number] {
  const R = quatToR(g.qr[i], g.qx[i], g.qy[i], g.qz[i]); // row-major 3x3
  const a = g.sx[i] * u,
    b = g.sy[i] * v,
    c = g.sz[i] * w;
  return [
    R[0] * a + R[1] * b + R[2] * c,
    R[3] * a + R[4] * b + R[5] * c,
    R[6] * a + R[7] * b + R[8] * c,
  ];
}

/**
 * Apply pruning + densification. Returns a new (resized) Gaussian3D and the origin map. Gaussian
 * count grows (clones/splits) and shrinks (prune); a fixed-cardinality run is what you get by simply
 * not calling this.
 */
export function densifyAndPrune(
  g: Gaussian3D,
  stats: DensifyStats,
  opts: DensifyOpts,
  rng: () => number
): DensifyResult {
  const phi = opts.splitFactor ?? 1.6;
  const cols: Record<Field, number[]> = {
    x: [],
    y: [],
    z: [],
    sx: [],
    sy: [],
    sz: [],
    qr: [],
    qx: [],
    qy: [],
    qz: [],
    op: [],
    r: [],
    gr: [],
    bl: [],
  };
  const origin: number[] = [];
  const pushFrom = (i: number, over: Partial<Record<Field, number>>, orig: number): void => {
    for (const f of FIELDS) cols[f].push(over[f] ?? g[f][i]);
    origin.push(orig);
  };

  for (let i = 0; i < g.N; i++) {
    if (g.op[i] < opts.opacityPrune) continue; // PRUNE transparent
    const maxScale = Math.max(g.sx[i], g.sy[i], g.sz[i]);
    const densify = stats.avgGrad2d[i] > opts.gradThreshold && origin.length < opts.maxGaussians;
    if (!densify) {
      pushFrom(i, {}, i); // keep as-is (survivor)
      continue;
    }
    if (maxScale <= opts.scaleThreshold) {
      // CLONE: keep original (survivor) + a jittered copy (new). Jitter by ~half-scale so the
      // optimizer can separate them rather than overlapping identically.
      pushFrom(i, {}, i);
      const [ox, oy, oz] = rotatedOffset(g, i, rng() - 0.5, rng() - 0.5, rng() - 0.5);
      pushFrom(i, { x: g.x[i] + ox, y: g.y[i] + oy, z: g.z[i] + oz }, -1);
    } else {
      // SPLIT: two new gaussians (scale/φ), positions sampled from the original; drop the original.
      for (let s = 0; s < 2; s++) {
        const [ox, oy, oz] = rotatedOffset(g, i, rng() - 0.5, rng() - 0.5, rng() - 0.5);
        pushFrom(
          i,
          {
            x: g.x[i] + ox,
            y: g.y[i] + oy,
            z: g.z[i] + oz,
            sx: g.sx[i] / phi,
            sy: g.sy[i] / phi,
            sz: g.sz[i] / phi,
          },
          -1
        );
      }
    }
  }

  const N = origin.length;
  const out = { N } as Gaussian3D;
  for (const f of FIELDS) out[f] = Float64Array.from(cols[f]);
  return { gaussians: out, origin: Int32Array.from(origin) };
}

/** Small seeded LCG so densification (and its tests) are deterministic. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}
