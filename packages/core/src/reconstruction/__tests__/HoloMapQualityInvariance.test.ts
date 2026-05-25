import { describe, expect, it } from 'vitest';

import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  type ReconstructionFrame,
} from '../HoloMapRuntime';

/**
 * Quality-invariance: the founder's working strategy is to build the HoloMap
 * pipeline at the LEAST quality now (low res, few points) and scale fidelity
 * later when real device sensors arrive — "easier work down the line." That only
 * holds if quality is purely a PARAMETER: cranking tileGrid / frame dims must
 * produce proportionally more/denser output with identical structure and no
 * hardcoded cap or breakage. These assertions prove that — if anything were
 * pinned to the low-quality assumption, they would FAIL.
 */
function frame(dim: number, index = 0): ReconstructionFrame {
  const rgb = new Uint8Array(dim * dim * 3);
  for (let i = 0; i < rgb.length; i += 1) rgb[i] = (i * 31 + index * 7) % 256;
  return { index, timestampMs: index, rgb, width: dim, height: dim, stride: 3 };
}

function frameWithDepth(dim: number, depthValue: number, index = 0): ReconstructionFrame {
  return { ...frame(dim, index), depth: new Float32Array(dim * dim).fill(depthValue) };
}

async function runtimeAt(tileGrid: number) {
  const rt = createHoloMapRuntime();
  await rt.init({
    ...HOLOMAP_DEFAULTS,
    seed: 3,
    modelHash: 'quality-invariance',
    targetFPS: 100000,
    tileGrid,
  });
  return rt;
}

describe('HoloMap quality invariance (build low, scale free)', () => {
  it('point density scales as tileGrid^2 with no hardcoded cap', async () => {
    // 16x16 frame so gridN = min(tileGrid, 16, 16) = tileGrid for 2/4/8.
    const counts: Record<number, number> = {};
    for (const g of [2, 4, 8]) {
      const rt = await runtimeAt(g);
      const step = await rt.step(frame(16));
      counts[g] = step!.points.positions.length / 3;
      await rt.dispose();
    }
    expect(counts[2]).toBe(4); // 2^2
    expect(counts[4]).toBe(16); // 4^2
    expect(counts[8]).toBe(64); // 8^2 — not clamped to a low default
  });

  it('measured depth is respected identically at every quality level', async () => {
    // Z = (0.5 - depth) * 0.34 must hold regardless of tileGrid / resolution.
    for (const g of [2, 4, 8]) {
      const rt = await runtimeAt(g);
      const step = await rt.step(frameWithDepth(16, 0.2, 0));
      for (let i = 2; i < step!.points.positions.length; i += 3) {
        expect(step!.points.positions[i]).toBeCloseTo((0.5 - 0.2) * 0.34, 5);
      }
      await rt.dispose();
    }
  });

  it('runs across a range of frame resolutions without breakage', async () => {
    for (const dim of [4, 16, 48, 96]) {
      const rt = await runtimeAt(4);
      const step = await rt.step(frame(dim));
      expect(step!.points.positions.length).toBeGreaterThan(0);
      expect(step!.pose.position.length).toBe(3);
      expect(Number.isFinite(step!.anchor.anchorPose.position[0])).toBe(true);
      await rt.dispose();
    }
  });

  it('higher quality yields a denser cloud while finalize stays consistent', async () => {
    const low = await runtimeAt(2);
    const high = await runtimeAt(8);
    for (let i = 0; i < 3; i += 1) {
      await low.step(frame(16, i));
      await high.step(frame(16, i));
    }
    const lowManifest = await low.finalize();
    const highManifest = await high.finalize();
    // Same frame count, strictly more points at higher quality (4*3 vs 64*3).
    expect(lowManifest.frameCount).toBe(highManifest.frameCount);
    expect(highManifest.pointCount).toBeGreaterThan(lowManifest.pointCount);
    expect(lowManifest.pointCount).toBe(12);
    expect(highManifest.pointCount).toBe(192);
    await low.dispose();
    await high.dispose();
  });
});
