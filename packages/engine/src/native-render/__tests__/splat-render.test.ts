/**
 * splat-render — native WebGPU Gaussian-splat render → verified pixels (render "Part 2").
 *
 * Falsifiable claim: a small cloud of depth-sorted Gaussian splats renders through the existing
 * Paper-grade `GaussianSplatSorter` (driven from a bare device via the additive `fromDevice` +
 * `renderFormat` seams) and produces a bounded, correctly-coloured, centred footprint — and an
 * EMPTY scene produces an all-clear frame (so we are reading real splat output, not noise).
 *
 * The packing test is pure and always runs; the render tests are gated on GPU_LIVE so they skip —
 * never false-green — where Dawn is absent (G.GOLD.006: the headless readback is also the
 * WASM/CPU-fallback verification floor).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { renderSplats, packRawSplats, defaultSplatCamera, type RawSplatInput } from '../splat-render';
import type { PixelGrid } from '../gpu-verify';

const itGpu = GPU_LIVE ? it : it.skip;
const SIZE = 128;

/** Count pixels that visibly differ from an opaque-black clear. */
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

/** A bright opaque splat centred in front of the default camera (positive camera-space Z). */
function centeredSplat(color: [number, number, number, number]): RawSplatInput {
  return { position: [0, 0, 4], scale: [0.25, 0.25, 0.25], rotation: [1, 0, 0, 0], color };
}

describe('packRawSplats', () => {
  it('packs each splat into the 16-float SplatRaw layout (pos@0, scale@4, rot@8, color@12)', () => {
    const packed = packRawSplats([
      { position: [1, 2, 3], scale: [4, 5, 6], rotation: [0.7, 0.1, 0.2, 0.3], color: [0.9, 0.8, 0.7, 0.6] },
    ]);
    expect(packed.length).toBe(16);
    expect(Array.from(packed.subarray(0, 3))).toEqual([1, 2, 3]); // position
    expect(Array.from(packed.subarray(4, 7))).toEqual([4, 5, 6]); // scale
    expect(Array.from(packed.subarray(8, 12))).toEqual([0.7, 0.1, 0.2, 0.3].map((v) => Math.fround(v)));
    expect(Array.from(packed.subarray(12, 16))).toEqual([0.9, 0.8, 0.7, 0.6].map((v) => Math.fround(v)));
    // padding slots stay zero
    expect(packed[3]).toBe(0);
    expect(packed[7]).toBe(0);
  });

  it('produces a contiguous buffer for N splats', () => {
    const packed = packRawSplats([centeredSplat([1, 1, 1, 1]), centeredSplat([1, 0, 0, 1])]);
    expect(packed.length).toBe(32);
    expect(packed.buffer.byteLength).toBe(32 * 4);
  });
});

describe('defaultSplatCamera', () => {
  it('puts a front splat at the screen centre with positive depth', () => {
    const cam = defaultSplatCamera(SIZE);
    // view is identity → camera-space z = world z = 4 (in front, not culled).
    expect(cam.cameraPosition).toEqual([0, 0, 0]);
    // +Z-forward projection: clip.w = z_eye → on-axis splat projects to ndc (0,0) = centre.
    const z = 4;
    const clipW = cam.projMatrix[11] * z; // col2 row3
    expect(clipW).toBeGreaterThan(0);
    expect(cam.focalX).toBeGreaterThan(0);
  });
});

describe('renderSplats (Dawn)', () => {
  itGpu('renders a centred white splat as a bounded, bright footprint', async () => {
    const g = await renderSplats(testDevice!, [centeredSplat([1, 1, 1, 1])], { size: SIZE });
    const lit = litPixels(g);
    // A real footprint: present, but not the whole frame (it is a splat, not a fill).
    expect(lit).toBeGreaterThan(100);
    expect(lit).toBeLessThan(SIZE * SIZE * 0.6);
    // Centre pixel is bright white.
    const [r, gr, b] = pixelAt(g, SIZE / 2, SIZE / 2);
    expect(r).toBeGreaterThan(120);
    expect(gr).toBeGreaterThan(120);
    expect(b).toBeGreaterThan(120);
  });

  itGpu('an empty scene renders an all-clear frame (proves real readback, not noise)', async () => {
    const g = await renderSplats(testDevice!, [], { size: SIZE });
    expect(litPixels(g)).toBe(0);
  });

  itGpu('carries splat colour through compress → sort → raster (red splat → red centre)', async () => {
    const g = await renderSplats(testDevice!, [centeredSplat([1, 0, 0, 1])], { size: SIZE });
    const [r, gr, b] = pixelAt(g, SIZE / 2, SIZE / 2);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeGreaterThan(gr + 60);
    expect(r).toBeGreaterThan(b + 60);
  });
});
