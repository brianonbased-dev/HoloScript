/**
 * GaussianWebGPUTrainer — structural tests (no GPU required).
 *
 * The WGSL shaders (splat-train-forward.wgsl + splat-train-backward.wgsl) were GPU-validated
 * on an RTX 3060 (forward max-abs 1.33e-5 vs CPU ref; backward worst rel 2.1e-3). These tests
 * cover the TypeScript dispatch utilities: CPU↔GPU data packing/unpacking.
 *
 * GPU dispatch integration tests (renderFrame + computeGradients) would require a WebGPU device
 * and live under GPUIntegration.e2e.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { packGauss2D, unpackGrad } from '../GaussianWebGPUTrainer';
import type { Gaussian2D } from '../GaussianTrainer2D';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGaussian2D(N: number, fill: (i: number, field: number) => number): Gaussian2D {
  const mk = (fi: number): Float64Array => Float64Array.from({ length: N }, (_, i) => fill(i, fi));
  return {
    N,
    posx: mk(0),
    posy: mk(1),
    a: mk(2),
    b: mk(3),
    c: mk(4),
    r: mk(5),
    gr: mk(6),
    bl: mk(7),
    op: mk(8),
  };
}

// ─── packGauss2D ─────────────────────────────────────────────────────────────

describe('packGauss2D', () => {
  it('packs N=1 gaussian into a 9-element Float32Array', () => {
    const g2 = makeGaussian2D(1, (_, fi) => fi + 1); // field values: [1,2,3,4,5,6,7,8,9]
    const out = packGauss2D(g2);
    expect(out.length).toBe(9);
    // Slot 0: posx, 1: posy, 2: a, 3: b, 4: c, 5: r, 6: gr (shader 'g'), 7: bl, 8: op
    expect(out[0]).toBeCloseTo(1, 4); // posx
    expect(out[1]).toBeCloseTo(2, 4); // posy
    expect(out[2]).toBeCloseTo(3, 4); // a
    expect(out[3]).toBeCloseTo(4, 4); // b
    expect(out[4]).toBeCloseTo(5, 4); // c
    expect(out[5]).toBeCloseTo(6, 4); // r
    expect(out[6]).toBeCloseTo(7, 4); // gr → shader slot 'g' (index 6)
    expect(out[7]).toBeCloseTo(8, 4); // bl
    expect(out[8]).toBeCloseTo(9, 4); // op
  });

  it('packs N=3 gaussians AoS with stride 9', () => {
    // Each gaussian i has field fi = i * 10 + field_slot.
    const g2 = makeGaussian2D(3, (i, fi) => i * 10 + fi);
    const out = packGauss2D(g2);
    expect(out.length).toBe(27); // 3 × 9

    for (let i = 0; i < 3; i++) {
      const base = i * 9;
      for (let fi = 0; fi < 9; fi++) {
        expect(out[base + fi]).toBeCloseTo(i * 10 + fi, 4);
      }
    }
  });

  it('maps gr (TypeScript) to index-6 slot (WGSL struct.g)', () => {
    // Distinctive value in gr only — all other fields zero.
    const N = 2;
    const g2: Gaussian2D = {
      N,
      posx: new Float64Array(N),
      posy: new Float64Array(N),
      a: new Float64Array(N),
      b: new Float64Array(N),
      c: new Float64Array(N),
      r: new Float64Array(N),
      gr: Float64Array.from([0.42, 0.77]),
      bl: new Float64Array(N),
      op: new Float64Array(N),
    };
    const out = packGauss2D(g2);
    // Slot 6 within each stride-9 block is the WGSL 'g' = TS 'gr'.
    expect(out[6]).toBeCloseTo(0.42, 5);
    expect(out[9 + 6]).toBeCloseTo(0.77, 5);
    // All other slots zero.
    for (let k = 0; k < 18; k++) {
      if (k === 6 || k === 15) continue;
      expect(out[k]).toBe(0);
    }
  });

  it('preserves f32 precision (f64 → f32 truncation within float32 range)', () => {
    const g2 = makeGaussian2D(1, (_, fi) => (fi === 0 ? 0.123456789 : 0));
    const out = packGauss2D(g2);
    // Float32Array precision is ~7 significant digits — tolerate 1e-6 relative error.
    expect(Math.abs(out[0] - 0.123456789) / 0.123456789).toBeLessThan(1e-6);
  });
});

// ─── unpackGrad ──────────────────────────────────────────────────────────────

const FIXED_POINT_SCALE = 65536;

describe('unpackGrad', () => {
  it('converts fixed-point i32 to f64 with FIXED_POINT_SCALE=65536', () => {
    // One gaussian, each grad slot = slot_index * FIXED_POINT_SCALE.
    const N = 1;
    const raw = new Int32Array(9);
    for (let k = 0; k < 9; k++) raw[k] = k * FIXED_POINT_SCALE;
    const g = unpackGrad(raw, N);
    // Each field should equal its slot index (k * scale / scale = k).
    expect(g.posx[0]).toBeCloseTo(0, 10); // k=0
    expect(g.posy[0]).toBeCloseTo(1, 10); // k=1
    expect(g.a[0]).toBeCloseTo(2, 10); // k=2
    expect(g.b[0]).toBeCloseTo(3, 10); // k=3
    expect(g.c[0]).toBeCloseTo(4, 10); // k=4
    expect(g.r[0]).toBeCloseTo(5, 10); // k=5
    expect(g.gr[0]).toBeCloseTo(6, 10); // k=6  (WGSL 'g' slot 6 → TS 'gr')
    expect(g.bl[0]).toBeCloseTo(7, 10); // k=7
    expect(g.op[0]).toBeCloseTo(8, 10); // k=8
  });

  it('handles negative gradients (backward can accumulate negative fixed-point)', () => {
    const N = 1;
    const raw = new Int32Array(9);
    raw[0] = -2 * FIXED_POINT_SCALE; // posx = -2.0
    raw[8] = -3 * FIXED_POINT_SCALE; // op   = -3.0
    const g = unpackGrad(raw, N);
    expect(g.posx[0]).toBeCloseTo(-2, 10);
    expect(g.op[0]).toBeCloseTo(-3, 10);
  });

  it('preserves per-gaussian indexing for N=3', () => {
    const N = 3;
    const raw = new Int32Array(N * 9);
    // Gaussian i has all grad slots = i * FIXED_POINT_SCALE.
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 9; k++) raw[i * 9 + k] = i * FIXED_POINT_SCALE;
    }
    const g = unpackGrad(raw, N);
    for (let i = 0; i < N; i++) {
      expect(g.posx[i]).toBeCloseTo(i, 10);
      expect(g.gr[i]).toBeCloseTo(i, 10);
      expect(g.op[i]).toBeCloseTo(i, 10);
    }
  });

  it('returns Float64Array fields', () => {
    const raw = new Int32Array(9);
    const g = unpackGrad(raw, 1);
    expect(g.posx).toBeInstanceOf(Float64Array);
    expect(g.gr).toBeInstanceOf(Float64Array);
  });

  it('pack/unpack round-trip: packGauss2D values survive as grad input', () => {
    // Verify that values typical of Gaussian2D fields (range [0,1]) survive the
    // fixed-point encode/decode round-trip within the precision the shader produces.
    const N = 2;
    const values = [0.1, 0.5, 0.9, -0.3, 0.0, 1.0, -1.0, 0.001, -0.001];
    const raw = new Int32Array(N * 9);
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 9; k++) {
        // Simulate what the backward shader does: accumulate += value * FIXED_POINT_SCALE (as int)
        raw[i * 9 + k] = Math.round(values[(i * 9 + k) % values.length] * FIXED_POINT_SCALE);
      }
    }
    const g = unpackGrad(raw, N);
    for (let i = 0; i < N; i++) {
      const fields = [g.posx, g.posy, g.a, g.b, g.c, g.r, g.gr, g.bl, g.op] as const;
      for (let k = 0; k < 9; k++) {
        const expected = values[(i * 9 + k) % values.length];
        // Quantisation error ≤ 0.5/FIXED_POINT_SCALE ≈ 7.6e-6
        expect(Math.abs(fields[k][i] - expected)).toBeLessThan(1.5 / FIXED_POINT_SCALE);
      }
    }
  });
});
