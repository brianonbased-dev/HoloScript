/**
 * GaussianPlyLoader — decode a 3DGS .ply into Gaussian3D (the dataset.init consumer).
 *
 * Verifies the decode math in CI on a synthetic binary PLY (no 12MB real file needed): log-space
 * scale → exp, logit opacity → sigmoid, SH degree-0 DC → 0.5+C0·f_dc (clamped), (w,x,y,z) quat →
 * normalized. The synthetic PLY interleaves nx/ny/nz normals so the per-property typed byte offsets
 * are exercised (a naive all-needed-properties stride would mis-read).
 */
import { describe, it, expect } from 'vitest';
import { loadGaussianPly } from '../GaussianPlyLoader';

const SH_C0 = 0.28209479177387814;

const ORDER = [
  'x',
  'y',
  'z',
  'nx',
  'ny',
  'nz',
  'f_dc_0',
  'f_dc_1',
  'f_dc_2',
  'opacity',
  'scale_0',
  'scale_1',
  'scale_2',
  'rot_0',
  'rot_1',
  'rot_2',
  'rot_3',
];

function buildPly(verts: Array<Record<string, number>>, order: string[] = ORDER): Uint8Array {
  const header =
    `ply\nformat binary_little_endian 1.0\nelement vertex ${verts.length}\n` +
    order.map((p) => `property float ${p}`).join('\n') +
    `\nend_header\n`;
  const hb = new TextEncoder().encode(header);
  const stride = order.length * 4;
  const body = new Uint8Array(verts.length * stride);
  const dv = new DataView(body.buffer);
  verts.forEach((vt, i) =>
    order.forEach((p, k) => dv.setFloat32(i * stride + k * 4, vt[p] ?? 0, true))
  );
  const out = new Uint8Array(hb.length + body.length);
  out.set(hb, 0);
  out.set(body, hb.length);
  return out;
}

describe('loadGaussianPly — 3DGS PLY decode', () => {
  it('decodes log-scale / logit-opacity / SH-color / normalized-quat correctly', () => {
    const v0 = {
      x: 1,
      y: 2,
      z: 3,
      f_dc_0: (0.7 - 0.5) / SH_C0,
      f_dc_1: 0,
      f_dc_2: (0.2 - 0.5) / SH_C0, // → r=0.7, g=0.5, b=0.2
      opacity: 0, // sigmoid(0) = 0.5
      scale_0: Math.log(0.1),
      scale_1: Math.log(0.2),
      scale_2: Math.log(0.3),
      rot_0: 0.6,
      rot_1: 0.8,
      rot_2: 0,
      rot_3: 0, // already unit (0.6²+0.8²=1)
    };
    const v1 = {
      x: -4,
      y: 0,
      z: 5,
      f_dc_0: 100,
      f_dc_1: -100,
      f_dc_2: 0, // huge → clamps to 1 and 0
      opacity: 10, // sigmoid(10) ≈ 0.99995
      scale_0: 0,
      scale_1: 0,
      scale_2: 0, // exp(0)=1
      rot_0: 3,
      rot_1: 0,
      rot_2: 4,
      rot_3: 0, // |q|=5 → (0.6,0,0.8,0)
    };
    const g = loadGaussianPly(buildPly([v0, v1]));

    expect(g.N).toBe(2);
    // position raw
    expect(g.x[0]).toBeCloseTo(1, 5);
    expect(g.z[1]).toBeCloseTo(5, 5);
    // scale: exp(log s) = s
    expect(g.sx[0]).toBeCloseTo(0.1, 5);
    expect(g.sy[0]).toBeCloseTo(0.2, 5);
    expect(g.sz[0]).toBeCloseTo(0.3, 5);
    expect(g.sx[1]).toBeCloseTo(1, 5);
    // opacity: sigmoid
    expect(g.op[0]).toBeCloseTo(0.5, 5);
    expect(g.op[1]).toBeCloseTo(1 / (1 + Math.exp(-10)), 5);
    // color: 0.5 + C0·f_dc, clamped to [0,1]
    expect(g.r[0]).toBeCloseTo(0.7, 5);
    expect(g.gr[0]).toBeCloseTo(0.5, 5);
    expect(g.bl[0]).toBeCloseTo(0.2, 5);
    expect(g.r[1]).toBe(1);
    expect(g.gr[1]).toBe(0); // clamped
    // quat: normalized (w,x,y,z) → (qr,qx,qy,qz)
    expect(g.qr[0]).toBeCloseTo(0.6, 5);
    expect(g.qx[0]).toBeCloseTo(0.8, 5);
    expect(g.qr[1]).toBeCloseTo(0.6, 5);
    expect(g.qy[1]).toBeCloseTo(0.8, 5);
    expect(Math.hypot(g.qr[1], g.qx[1], g.qy[1], g.qz[1])).toBeCloseTo(1, 6);
  });

  it('the loaded gaussians are renderable (finite, positive scale/opacity — a valid Gaussian3D)', () => {
    const g = loadGaussianPly(
      buildPly([
        {
          x: 0,
          y: 0,
          z: 0,
          scale_0: -2,
          scale_1: -2,
          scale_2: -2,
          rot_0: 1,
          opacity: 1,
          f_dc_0: 1,
          f_dc_1: 1,
          f_dc_2: 1,
        },
      ])
    );
    expect(Number.isFinite(g.x[0])).toBe(true);
    expect(g.sx[0]).toBeGreaterThan(0);
    expect(g.op[0]).toBeGreaterThan(0);
    expect(g.op[0]).toBeLessThanOrEqual(1);
  });

  it('throws on a non-3DGS PLY (missing scale_*/rot_*/opacity)', () => {
    const plain = buildPly([{ x: 0, y: 0, z: 0 }], ['x', 'y', 'z']);
    expect(() => loadGaussianPly(plain)).toThrow(/not a 3DGS PLY|missing property/);
  });

  it('rejects ASCII PLY (3DGS exports are binary)', () => {
    const ascii = new TextEncoder().encode(
      'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nend_header\n0\n'
    );
    expect(() => loadGaussianPly(ascii)).toThrow(/ASCII/);
  });
});
