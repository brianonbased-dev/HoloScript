/**
 * gpu-verify (D.083, task 2h3s): the FIRST verified native pixel + the green-on-black gate.
 *
 * Reuses engine's existing headless-GPU test setup (physics/__tests__/gpu-setup): it acquires a
 * LIVE Dawn GPUDevice when available (GPU_LIVE=true) or a render-incapable mock otherwise. The
 * real-pixel assertion is GATED on GPU_LIVE — on a mock/no-GPU host it SKIPS, so the GPU render
 * path can never silently false-pass (the W.667/W.684 trap the pre-mortem flagged).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { renderSolidColor, pixelAt } from '../gpu-verify';

describe('gpu-verify — native WebGPU render→readback', () => {
  // Only assert real pixels on a live device. Mock/no-GPU → skip (never false-green).
  (GPU_LIVE ? it : it.skip)('renders a red full-viewport triangle and reads back red pixels (no Three.js)', async () => {
    const grid = await renderSolidColor(testDevice!, [1, 0, 0, 1], 64);
    expect(pixelAt(grid, 32, 32)).toEqual([255, 0, 0, 255]); // center is the rendered red
    expect(pixelAt(grid, 0, 0)).toEqual([255, 0, 0, 255]);   // full-viewport triangle covers corners too
  });

  (GPU_LIVE ? it : it.skip)('renders distinct colors faithfully (green, then blue)', async () => {
    const green = await renderSolidColor(testDevice!, [0, 1, 0, 1], 64);
    expect(pixelAt(green, 32, 32)).toEqual([0, 255, 0, 255]);
    const blue = await renderSolidColor(testDevice!, [0, 0, 1, 1], 64);
    expect(pixelAt(blue, 32, 32)).toEqual([0, 0, 255, 255]);
  });

  it('GPU_LIVE gate is a boolean (records whether the real-pixel tests ran or skipped)', () => {
    // Always runs. If GPU_LIVE is false the pixel tests above SKIP — they never falsely pass.
    expect(typeof GPU_LIVE).toBe('boolean');
  });
});
