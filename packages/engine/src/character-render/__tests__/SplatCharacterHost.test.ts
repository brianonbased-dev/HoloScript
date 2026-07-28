/**
 * SplatCharacterHost — splat-bodied character entity loaded from the splat infrastructure.
 *
 * Falsifiable claims:
 *  - the loader→render adapters convert each existing splat format into render-input splats with
 *    the right conventions (Gaussian3D is straight-through; codec (x,y,z,w)→(w,x,y,z) + opacity);
 *  - `SplatCharacterHost.fromPly` runs the REAL `loadGaussianPly` decode on real PLY bytes and
 *    yields a body;
 *  - the D.102 mind seam is identical to CharacterHost (adopt identity + memory, degrade on fail);
 *  - on Dawn, a body cloud centred at an ARBITRARY world position renders as a bounded, centred,
 *    bright footprint — i.e. auto-framing works for an off-origin capture.
 *
 * Pure tests always run; the render test is gated on GPU_LIVE (G.GOLD.006).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { SplatCharacterHost, framingSplatCamera } from '../SplatCharacterHost';
import { gaussian3DToSplats, gaussianSplatDataToSplats } from '../../native-render/splat-render';
import type { Gaussian3D } from '../../gpu/GaussianTrainer3D';
import type { GaussianSplatData } from '../../gpu/codecs/types';
import { StaticCharacterMind, type CharacterMind } from '../CharacterMind';
import type { PixelGrid } from '../../native-render/gpu-verify';

const itGpu = GPU_LIVE ? it : it.skip;
const SIZE = 128;
const SH_C0 = 0.28209479177387814;

function litPixels(g: PixelGrid): number {
  let n = 0;
  for (let i = 0; i < g.data.length; i += 4) {
    if (g.data[i] + g.data[i + 1] + g.data[i + 2] > 30) n++;
  }
  return n;
}
function pixelAt(g: PixelGrid, x: number, y: number): [number, number, number, number] {
  const i = (y * g.width + x) * 4;
  return [g.data[i], g.data[i + 1], g.data[i + 2], g.data[i + 3]];
}

/** A one-Gaussian `Gaussian3D` SoA for adapter testing. */
function oneGaussian3D(): Gaussian3D {
  const f = (v: number) => Float64Array.from([v]);
  return {
    N: 1,
    x: f(1),
    y: f(2),
    z: f(3),
    sx: f(0.4),
    sy: f(0.5),
    sz: f(0.6),
    qr: f(0.7),
    qx: f(0.1),
    qy: f(0.2),
    qz: f(0.3),
    op: f(0.9),
    r: f(0.8),
    gr: f(0.6),
    bl: f(0.4),
  };
}

/**
 * Synthesize a binary_little_endian 3DGS `.ply` (the inria/gsplat layout the real loader decodes):
 * scale in LOG space, opacity in LOGIT space, color as SH degree-0 DC. Body = a dense grid of SMALL
 * white Gaussians forming a torso (3 wide × 9 tall, including one at the exact centroid) centred at
 * `center` — realistic in that each splat is a small fraction of the body, so the framed footprint
 * is bounded (a real capture is many small splats, not a few fat ones).
 */
function buildBodyPly(center: [number, number, number], linearScale = 0.05): Uint8Array {
  const xs = [-0.12, 0, 0.12];
  const ys = [-0.36, -0.27, -0.18, -0.09, 0, 0.09, 0.18, 0.27, 0.36];
  const pts: Array<[number, number, number]> = [];
  for (const dy of ys) for (const dx of xs) pts.push([center[0] + dx, center[1] + dy, center[2]]);

  const props = [
    'x',
    'y',
    'z',
    'scale_0',
    'scale_1',
    'scale_2',
    'rot_0',
    'rot_1',
    'rot_2',
    'rot_3',
    'opacity',
    'f_dc_0',
    'f_dc_1',
    'f_dc_2',
  ];
  const header =
    'ply\nformat binary_little_endian 1.0\n' +
    `element vertex ${pts.length}\n` +
    props.map((p) => `property float ${p}`).join('\n') +
    '\nend_header\n';
  const headerBytes = new TextEncoder().encode(header);
  const stride = props.length * 4;
  const body = new Uint8Array(pts.length * stride);
  const dv = new DataView(body.buffer);
  const logS = Math.log(linearScale);
  const logitOp = Math.log(0.99 / 0.01); // → sigmoid ≈ 0.99
  const fdcWhite = (1 - 0.5) / SH_C0; // → 0.5 + C0·f_dc ≈ 1 (white)
  pts.forEach((p, i) => {
    const o = i * stride;
    const vals = [
      p[0],
      p[1],
      p[2], // x y z
      logS,
      logS,
      logS, // scale_0..2 (log)
      1,
      0,
      0,
      0, // rot_0..3 (w,x,y,z)
      logitOp, // opacity (logit)
      fdcWhite,
      fdcWhite,
      fdcWhite, // f_dc_0..2 (white)
    ];
    vals.forEach((v, k) => dv.setFloat32(o + k * 4, v, true));
  });
  const out = new Uint8Array(headerBytes.length + body.length);
  out.set(headerBytes, 0);
  out.set(body, headerBytes.length);
  return out;
}

describe('splat data adapters', () => {
  it('gaussian3DToSplats is a straight per-splat gather (linear scale, (w,x,y,z), color+op)', () => {
    const [s] = gaussian3DToSplats(oneGaussian3D());
    expect(s.position).toEqual([1, 2, 3]);
    expect(s.scale).toEqual([0.4, 0.5, 0.6]);
    expect(s.rotation).toEqual([0.7, 0.1, 0.2, 0.3]); // (w,x,y,z)
    expect(s.color).toEqual([0.8, 0.6, 0.4, 0.9]); // rgb + opacity
  });

  it('gaussianSplatDataToSplats reorders (x,y,z,w)→(w,x,y,z) and uses opacities[] as alpha', () => {
    const d: GaussianSplatData = {
      positions: Float32Array.from([1, 2, 3]),
      scales: Float32Array.from([0.4, 0.5, 0.6]),
      rotations: Float32Array.from([0.1, 0.2, 0.3, 0.7]), // codec order (x,y,z,w)
      colors: Float32Array.from([0.8, 0.6, 0.4, 0.5]),
      opacities: Float32Array.from([0.95]),
      shDegree: 0,
      count: 1,
    };
    const [s] = gaussianSplatDataToSplats(d);
    // Float32Array storage → compare against f32-rounded expectations.
    expect(s.rotation).toEqual([0.7, 0.1, 0.2, 0.3].map(Math.fround)); // reordered → (w,x,y,z)
    expect(s.color).toEqual([0.8, 0.6, 0.4, 0.95].map(Math.fround)); // alpha from opacities[], not colors[3]
  });
});

describe('SplatCharacterHost.fromPly (real loadGaussianPly decode)', () => {
  it('decodes synthesized 3DGS PLY bytes into a non-empty entity body', () => {
    const host = SplatCharacterHost.fromPly('brittney', buildBodyPly([2, -1, 10]));
    expect(host.entityId).toBe('brittney');
    expect(host.splatCount).toBe(27); // 3 wide × 9 tall
  });
});

describe('SplatCharacterHost — D.102 portable mind (parity with CharacterHost)', () => {
  it('adopts the mind identity + memory, and degrades on failure without throwing', async () => {
    const host = SplatCharacterHost.fromGaussian3D('agent-1', oneGaussian3D());
    expect(host.hasMind()).toBe(false);
    await host.bindMind(
      new StaticCharacterMind({ wallet: '0xW', agentId: 'agent-1' }, [{ content: 'm' }])
    );
    expect(host.getIdentity()).toEqual({ wallet: '0xW', agentId: 'agent-1' });
    expect(host.getMemory()).toHaveLength(1);

    const broken: CharacterMind = {
      identity: () => ({ wallet: '0xBAD' }),
      loadMemory: async () => {
        throw new Error('store unreachable');
      },
    };
    const h2 = SplatCharacterHost.fromGaussian3D('agent-2', oneGaussian3D());
    await expect(h2.bindMind(broken)).resolves.toBeUndefined();
    expect(h2.hasMind()).toBe(true);
    expect(h2.getMemory()).toEqual([]);
  });
});

describe('framingSplatCamera', () => {
  it('frames an off-origin cloud at positive camera-space depth', () => {
    const splats = gaussian3DToSplats(oneGaussian3D()); // single splat at (1,2,3)
    const cam = framingSplatCamera(splats, SIZE);
    // centroid (1,2,3) maps to camera-space (0,0,dist): camZ = z + view.t.z.
    const camZ = 3 * 1 + cam.viewMatrix[14]; // identity rotation → camZ = z + tz
    expect(camZ).toBeGreaterThan(0);
    expect(cam.focalX).toBeGreaterThan(0);
  });
});

describe('SplatCharacterHost.render (Dawn)', () => {
  itGpu(
    'auto-frames an off-origin body cloud into a bounded, bright, centred footprint',
    async () => {
      const host = SplatCharacterHost.fromPly('brittney', buildBodyPly([2, -1, 10]));
      const g = await host.render(testDevice!, { size: SIZE });
      const lit = litPixels(g);
      expect(lit).toBeGreaterThan(80);
      expect(lit).toBeLessThan(SIZE * SIZE * 0.7);
      // The white body lands at the image centre (auto-framing put the centroid on-axis).
      const [r, gr, b] = pixelAt(g, SIZE / 2, SIZE / 2);
      expect(r + gr + b).toBeGreaterThan(150);
    }
  );
});
