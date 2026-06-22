/**
 * character-render-xr tests — the HEADLESS-VERIFIABLE parts only.
 *
 * The in-headset session loop (XRCharacterRenderer.start/onFrame) is ON-DEVICE-PENDING — it
 * needs a real Quest + XRWebGPUBinding and cannot run in CI/Dawn, so it is NOT tested here (we
 * do not fake an in-headset pass). What IS verified: the feature-detect graceful-fallback table
 * (never throws), the per-eye view·projection math, and the 40-float frame uniform packing.
 */
import { describe, it, expect } from 'vitest';
import { detectSupport, composeEyeViewProj, packFrameUniform } from '../character-render-xr';
import { multiply, fromTranslation, IDENTITY4 } from '../skin-math';

describe('character-render-xr — feature detect (never throws)', () => {
  it('returns a valid discriminated mode without throwing', async () => {
    const s = await detectSupport();
    expect(['xr-webgpu', 'webgl-fallback', 'flat']).toContain(s.mode);
    expect(typeof s.reason).toBe('string');
    expect(typeof s.webgpu).toBe('boolean');
    // In the Node/Dawn test env there is no immersive-vr → must fall back, never xr-webgpu.
    expect(s.mode).not.toBe('xr-webgpu');
  });
});

describe('character-render-xr — per-eye math', () => {
  it('composeEyeViewProj = projection · inverseView (column-major)', () => {
    const proj = new Float32Array([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
    const invView = fromTranslation(-1, -2, -3); // inverse of a camera at (1,2,3)
    const got = composeEyeViewProj(proj, invView);
    const want = multiply(proj as unknown as Float32Array, invView);
    expect(Array.from(got)).toEqual(Array.from(want));
  });

  it('packFrameUniform lays out mvp/model/cameraPos/lightDir in 40 floats', () => {
    const mvp = IDENTITY4();
    const model = fromTranslation(5, 6, 7);
    const f = packFrameUniform(mvp, model, [1, 2, 3], [0.4, 0.7, 0.6]);
    expect(f.length).toBe(40);
    expect(Array.from(f.subarray(0, 16))).toEqual(Array.from(mvp)); // mvp
    expect(Array.from(f.subarray(16, 32))).toEqual(Array.from(model)); // model
    expect([f[32], f[33], f[34]]).toEqual([1, 2, 3]); // cameraPos
    // lightDir — f32 precision, compare with tolerance.
    expect(f[36]).toBeCloseTo(0.4, 5);
    expect(f[37]).toBeCloseTo(0.7, 5);
    expect(f[38]).toBeCloseTo(0.6, 5);
  });
});
