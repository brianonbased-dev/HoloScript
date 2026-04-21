/**
 * paper-6-mecanim-divergence-matrix.bench.test.ts
 *
 * Paper-6 (Animation SCA) — synthetic ordering-divergence harness (36-cell matrix).
 *
 * Rows = layer count (6 levels), cols = evaluation-policy seed (6 seeds → different
 * random layer tensors + permutation samples). For each cell we draw 48 random
 * evaluation orders (Fisher–Yates with seeded RNG), apply **last-write** blending
 * per parameter, and record **max L1 distance** between any two outcomes — a
 * proxy for Mecanim-style state-machine ordering sensitivity.
 *
 * `[paper-6][gpu-matrix]` lines are suitable for the paper’s evaluation table.
 *
 * Shipped entrypoint: `pnpm run benchmark:paper6:mecanim-matrix`
 * @see memory/paper-6-mecanim-divergence-harness.md
 */

import { describe, it, expect } from 'vitest';

const LAYER_ROWS = [3, 4, 5, 6, 7, 8] as const;
const SEED_COLS = [11, 22, 33, 44, 55, 66] as const;
const PARAMS = 4;
const PERM_SAMPLES = 48;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeLayers(seed: number, count: number): number[][] {
  const rng = mulberry32(seed);
  const layers: number[][] = [];
  for (let i = 0; i < count; i++) {
    layers.push(Array.from({ length: PARAMS }, () => rng() * 2 - 1));
  }
  return layers;
}

function lastWrite(order: number[], layers: number[][]): number[] {
  const acc = new Array(PARAMS).fill(0);
  for (const idx of order) {
    const L = layers[idx];
    for (let p = 0; p < PARAMS; p++) acc[p] = L[p];
  }
  return acc;
}

function l1Dist(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s;
}

describe('[Paper-6] 6×6 divergence matrix (ordering sensitivity)', () => {
  it('prints [paper-6][gpu-matrix] with max pairwise L1 divergence per cell', () => {
    const tWall0 = performance.now();
    const matrix: number[][] = [];
    console.log('\n[paper-6][gpu-matrix] rows=layer count, cols=seed column');

    let ri = 0;
    for (const layersN of LAYER_ROWS) {
      const row: number[] = [];
      let ci = 0;
      for (const colSeed of SEED_COLS) {
        const seed = layersN * 1009 + colSeed;
        const layers = makeLayers(seed, layersN);
        const rng = mulberry32(seed ^ 0xace123);
        const finals: number[][] = [];
        const base = [...Array(layersN).keys()];
        for (let s = 0; s < PERM_SAMPLES; s++) {
          finals.push(lastWrite(shuffle(base, rng), layers));
        }
        let maxDiv = 0;
        for (let i = 0; i < finals.length; i++) {
          for (let j = i + 1; j < finals.length; j++) {
            maxDiv = Math.max(maxDiv, l1Dist(finals[i], finals[j]));
          }
        }
        row.push(maxDiv);
        if (ri === 0 && ci === 0) {
          console.log(`[paper-6][sample] layers=${layersN} col=${colSeed} maxL1=${maxDiv.toFixed(4)}`);
        }
        ci++;
      }
      matrix.push(row);
      ri++;
    }

    expect(matrix.length).toBe(6);
    expect(matrix[0].length).toBe(6);
    console.log('[paper-6][gpu-matrix] layer rows:', [...LAYER_ROWS].join(','));
    console.log(
      '[paper-6][gpu-matrix]\n',
      matrix.map((r) => r.map((v) => v.toFixed(3)).join('\t')).join('\n')
    );
    const wallMs = performance.now() - tWall0;
    console.log(`[paper-6][gpu-matrix] cells=36 wallMs=${wallMs.toFixed(1)}`);
  });
});
