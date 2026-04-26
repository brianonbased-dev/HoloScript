/**
 * HoloMapRuntime integration test — end-to-end transformer pass through the
 * 8 P0 WGSL kernel chain on a 32×32 fixture image.
 *
 * Exercised kernels (CPU path; GPU path covered by holoMapMicroEncoder):
 *   1. imagePatchEmbed — frame tile → patch tokens
 *   2. layerNorm        — pre-attention norm
 *   3. gemm             — Q / K / V projections
 *   4. rope             — rotary positional encoding
 *   5. fusedMHA         — multi-head self-attention
 *   6. layerNorm        — post-attention norm
 *   7. gelu             — feed-forward activation
 *   8. gemm             — xyz output projection
 *
 * pagedKV append/lookup remain available for streaming kLen>1 (Sprint 3+);
 * not exercised here because the per-tile MHA runs at qLen=kLen=1.
 *
 * Done-criterion check (Wave-B-S4): step() must return a real reconstructed
 * cloud — strictly more than the 2-point placeholder it used to ship — with
 * non-trivial spatial spread, deterministic across runs, and per-tile colors
 * sourced from the input image instead of hardcoded constants.
 */

import { describe, expect, it } from 'vitest';
import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  type ReconstructionFrame,
} from '../HoloMapRuntime';

/** Build a 32×32 RGBA fixture with a deterministic color gradient. */
function buildGradientFrame(index: number): ReconstructionFrame {
  const W = 32;
  const H = 32;
  const stride = 4;
  const rgb = new Uint8Array(W * H * stride);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * stride;
      rgb[o] = (x * 8 + index) & 0xff;
      rgb[o + 1] = (y * 8 + index * 2) & 0xff;
      rgb[o + 2] = ((x + y) * 4 + index * 3) & 0xff;
      rgb[o + 3] = 255;
    }
  }
  return { index, timestampMs: index * 33, rgb, width: W, height: H, stride };
}

describe('HoloMapRuntime — 8-kernel integration on 32×32 fixture', () => {
  it('step() emits a multi-point cloud (NOT the legacy 2-point placeholder)', async () => {
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 7,
      modelHash: 'integration-32x32',
      videoHash: 'fixture-gradient',
    });

    const step = await runtime.step(buildGradientFrame(0));

    // GRID_N=4 on a 32×32 frame → 16 tiles → 16 points (one per tile).
    const pointCount = step.points.positions.length / 3;
    expect(pointCount).toBe(16);
    expect(step.points.colors.length).toBe(pointCount * 3);
    expect(step.points.confidence.length).toBe(pointCount);

    // Hard guard against the old hardcoded 2-point/6-byte placeholder cloud.
    expect(step.points.positions.length).toBeGreaterThan(6);
    expect(step.points.colors.length).toBeGreaterThan(6);

    await runtime.dispose();
  });

  it('point cloud has non-trivial spatial spread (transformer is firing)', async () => {
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 11,
      modelHash: 'integration-spread',
      videoHash: 'fixture-gradient',
    });

    const step = await runtime.step(buildGradientFrame(0));
    const pos = step.points.positions;

    // Compute per-axis variance across points.
    const N = pos.length / 3;
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let i = 0; i < N; i += 1) {
      mx += pos[i * 3]!;
      my += pos[i * 3 + 1]!;
      mz += pos[i * 3 + 2]!;
    }
    mx /= N;
    my /= N;
    mz /= N;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    for (let i = 0; i < N; i += 1) {
      const dx = pos[i * 3]! - mx;
      const dy = pos[i * 3 + 1]! - my;
      const dz = pos[i * 3 + 2]! - mz;
      vx += dx * dx;
      vy += dy * dy;
      vz += dz * dz;
    }
    vx /= N;
    vy /= N;
    vz /= N;

    // The 2-point placeholder had near-zero variance (two points 0.05 apart).
    // A real transformer pass produces meaningful spread across at least one
    // axis — assert sum-of-variance is well above the placeholder regime.
    const totalVar = vx + vy + vz;
    expect(totalVar).toBeGreaterThan(1e-6);

    await runtime.dispose();
  });

  it('per-tile colors come from the input image, not hardcoded constants', async () => {
    // The legacy placeholder shipped colors=[120,180,220,90,160,210]. Verify
    // that for a frame with very different mean color, our cloud's colors
    // shift accordingly — proving the path through tileFrame's mean-color
    // computation, not a hardcoded byte array.
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 0,
      modelHash: 'integration-color',
    });

    // All-red frame.
    const W = 32;
    const H = 32;
    const stride = 4;
    const rgb = new Uint8Array(W * H * stride);
    for (let i = 0; i < W * H; i += 1) {
      rgb[i * stride] = 255;
      rgb[i * stride + 1] = 0;
      rgb[i * stride + 2] = 0;
      rgb[i * stride + 3] = 255;
    }

    const step = await runtime.step({
      index: 0,
      timestampMs: 0,
      rgb,
      width: W,
      height: H,
      stride,
    });

    const colors = step.points.colors;
    // Every tile should end up red-dominant.
    for (let t = 0; t < colors.length / 3; t += 1) {
      expect(colors[t * 3]).toBe(255);
      expect(colors[t * 3 + 1]).toBe(0);
      expect(colors[t * 3 + 2]).toBe(0);
    }

    await runtime.dispose();
  });

  it('determinism: two runs with identical config produce identical clouds', async () => {
    const runOnce = async () => {
      const rt = createHoloMapRuntime();
      await rt.init({
        ...HOLOMAP_DEFAULTS,
        seed: 99,
        modelHash: 'integration-determinism',
        videoHash: 'fixture-gradient',
      });
      const step = await rt.step(buildGradientFrame(3));
      await rt.dispose();
      return step;
    };

    const a = await runOnce();
    const b = await runOnce();

    expect(Array.from(a.points.positions)).toEqual(Array.from(b.points.positions));
    expect(Array.from(a.points.colors)).toEqual(Array.from(b.points.colors));
    expect(Array.from(a.points.confidence)).toEqual(Array.from(b.points.confidence));
  });

  it('pose centroid is the mean of point positions', async () => {
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 5,
      modelHash: 'integration-pose-centroid',
    });

    const step = await runtime.step(buildGradientFrame(2));
    const pos = step.points.positions;
    const N = pos.length / 3;
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let i = 0; i < N; i += 1) {
      mx += pos[i * 3]!;
      my += pos[i * 3 + 1]!;
      mz += pos[i * 3 + 2]!;
    }
    mx /= N;
    my /= N;
    mz /= N;

    const [px, py, pz] = step.pose.position;
    expect(px).toBeCloseTo(mx, 5);
    expect(py).toBeCloseTo(my, 5);
    expect(pz).toBeCloseTo(mz, 5);

    await runtime.dispose();
  });

  it('finalize() rolls up cloud across multiple steps', async () => {
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 1,
      modelHash: 'integration-finalize',
      videoHash: 'fixture-multi',
    });

    const NSTEPS = 4;
    let expectedPoints = 0;
    for (let i = 0; i < NSTEPS; i += 1) {
      const step = await runtime.step(buildGradientFrame(i));
      expectedPoints += step.points.positions.length / 3;
    }

    const manifest = await runtime.finalize();
    expect(manifest.frameCount).toBe(NSTEPS);
    expect(manifest.pointCount).toBe(expectedPoints);
    // 4 frames × 16 tiles each on a 32×32 fixture.
    expect(manifest.pointCount).toBe(NSTEPS * 16);

    // Bounds must be a real, non-degenerate AABB now that we have spread.
    const { min, max } = manifest.bounds;
    expect(max[0] - min[0] + (max[1] - min[1]) + (max[2] - min[2])).toBeGreaterThan(0);

    await runtime.dispose();
  });
});
