import { describe, expect, it } from 'vitest';

import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  type CameraPose,
  type HoloMapCameraIntrinsics,
  type ReconstructionFrame,
} from '../HoloMapRuntime';

/**
 * Mobile-sensor ingest: HoloMapRuntime must USE measured device depth + pose
 * (iOS LiDAR / ARKit) when present, and fall back to the monocular estimate
 * (P1) + scan-derived pose (E4) when absent. These assertions are falsifiable —
 * if the runtime ignored the sensor inputs they would FAIL.
 *
 * DEPTH_Z_SCALE = 0.34, so normalized depth d maps to point Z = (0.5 - d)*0.34:
 *   near (d=0) -> +0.17, far (d=1) -> -0.17, independent of RGB content.
 */
const W = 4;
const H = 4;
const STRIDE = 4;

function rgbBytes(seed: number): Uint8Array {
  const buf = new Uint8Array(W * H * STRIDE);
  for (let i = 0; i < W * H; i += 1) {
    buf[i * 4] = (i * 37 + seed) % 256;
    buf[i * 4 + 1] = (i * 91 + seed) % 256;
    buf[i * 4 + 2] = (i * 53 + seed) % 256;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

function frame(extra: Partial<ReconstructionFrame> = {}, index = 0): ReconstructionFrame {
  return {
    index,
    timestampMs: index,
    rgb: rgbBytes(index),
    width: W,
    height: H,
    stride: STRIDE,
    ...extra,
  };
}

async function newRuntime() {
  const rt = createHoloMapRuntime();
  await rt.init({ ...HOLOMAP_DEFAULTS, seed: 7, modelHash: 'sensor-test', targetFPS: 100000 });
  return rt;
}

function zValues(positions: Float32Array): number[] {
  const z: number[] = [];
  for (let i = 2; i < positions.length; i += 3) z.push(positions[i]!);
  return z;
}

function bounds(positions: Float32Array): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const v = positions[i + axis]!;
      if (v < min[axis]!) min[axis] = v;
      if (v > max[axis]!) max[axis] = v;
    }
  }
  return { min, max };
}

const METRIC_INTRINSICS: HoloMapCameraIntrinsics = {
  width: W,
  height: H,
  fx: 1,
  fy: 1,
  cx: W / 2,
  cy: H / 2,
};

describe('HoloMap mobile-sensor depth/pose ingest', () => {
  it('uses MEASURED depth for point Z (near=+0.17, far=-0.17), not the estimate', async () => {
    const near = await newRuntime();
    const nearStep = await near.step(frame({ depth: new Float32Array(W * H).fill(0) }));
    const far = await newRuntime();
    const farStep = await far.step(frame({ depth: new Float32Array(W * H).fill(1) }));

    const nearZ = zValues(nearStep!.points.positions);
    const farZ = zValues(farStep!.points.positions);

    // Measured depth alone determines Z — independent of RGB. Exact, not content-derived.
    for (const z of nearZ) expect(z).toBeCloseTo(0.17, 5);
    for (const z of farZ) expect(z).toBeCloseTo(-0.17, 5);
    expect(Math.min(...nearZ)).toBeGreaterThan(Math.max(...farZ));

    await near.dispose();
    await far.dispose();
  });

  it('measured depth Z differs from the monocular estimate on the SAME RGB', async () => {
    const measured = await newRuntime();
    const measuredStep = await measured.step(frame({ depth: new Float32Array(W * H).fill(0.25) }));

    const estimated = await newRuntime();
    const estimatedStep = await estimated.step(frame()); // no depth → luminance/latent estimate

    const mZ = zValues(measuredStep!.points.positions);
    const eZ = zValues(estimatedStep!.points.positions);
    // measured: every Z = (0.5-0.25)*0.34 = 0.085 exactly; estimate is content+latent driven.
    for (const z of mZ) expect(z).toBeCloseTo(0.085, 5);
    const anyDifferent = eZ.some((z, i) => Math.abs(z - mZ[i]!) > 1e-3);
    expect(anyDifferent).toBe(true); // a stub ignoring depth would make these equal

    await measured.dispose();
    await estimated.dispose();
  });

  it('uses MEASURED device pose over the scan-derived centroid pose', async () => {
    const devicePose: CameraPose = {
      position: [7, 8, 9],
      rotation: [0, 0, 0, 1],
      confidence: 0.95,
    };
    const rt = await newRuntime();
    const step = await rt.step(frame({ devicePose }));
    expect(step!.pose.position).toEqual([7, 8, 9]);
    expect(step!.pose.confidence).toBeCloseTo(0.95, 5);
    await rt.dispose();
  });

  it('falls back to the derived pose when no device pose is supplied', async () => {
    const rt = await newRuntime();
    const step = await rt.step(frame());
    // Derived centroid pose, NOT a leaked device pose.
    expect(step!.pose.position).not.toEqual([7, 8, 9]);
    expect(step!.points.positions.length).toBeGreaterThan(0);
    await rt.dispose();
  });

  it('a one-cell measured-depth change moves the reconstructed points (falsifiable)', async () => {
    const a = await newRuntime();
    const depthA = new Float32Array(W * H).fill(0.5);
    const stepA = await a.step(frame({ depth: depthA }));

    const b = await newRuntime();
    const depthB = new Float32Array(W * H).fill(0.5);
    depthB[0] = 0.0; // tamper a single depth cell
    const stepB = await b.step(frame({ depth: depthB }));

    const za = zValues(stepA!.points.positions);
    const zb = zValues(stepB!.points.positions);
    const changed = za.some((z, i) => Math.abs(z - zb[i]!) > 1e-4);
    expect(changed).toBe(true);

    await a.dispose();
    await b.dispose();
  });

  it('projects metric ARCore depth through camera intrinsics into metre-scale points', async () => {
    const rt = await newRuntime();
    const step = await rt.step(
      frame({
        depthMeters: new Float32Array(W * H).fill(2),
        cameraIntrinsics: METRIC_INTRINSICS,
      })
    );
    const box = bounds(step!.points.positions);

    expect(step!.depthAlignment).toMatchObject({
      kind: 'shift-scale',
      sampleCount: 16,
      shift: 2,
    });
    expect(box.max[0] - box.min[0]).toBeCloseTo(6, 5);
    expect(box.max[1] - box.min[1]).toBeCloseTo(6, 5);
    for (const z of zValues(step!.points.positions)) expect(z).toBeCloseTo(-2, 5);

    await rt.dispose();
  });

  it('loop-closes an inflated ARCore revisit before bounds can inherit pose drift', async () => {
    const rt = createHoloMapRuntime();
    await rt.init({
      ...HOLOMAP_DEFAULTS,
      seed: 7,
      modelHash: 'sensor-test-inflated-arcore-loop',
      targetFPS: 100000,
      tileGrid: 2,
    });
    const depthMeters = new Float32Array(W * H).fill(2);
    const first = frame(
      {
        depthMeters,
        cameraIntrinsics: METRIC_INTRINSICS,
        devicePose: { position: [0, 0, 0], rotation: [0, 0, 0, 1], confidence: 1 },
      },
      0
    );
    const inflatedRevisit = {
      ...frame(
        {
          depthMeters,
          cameraIntrinsics: METRIC_INTRINSICS,
          devicePose: { position: [14, 0, 0], rotation: [0, 0, 0, 1], confidence: 1 },
        },
        4
      ),
      rgb: first.rgb,
    };

    await rt.step(first);
    const second = await rt.step(inflatedRevisit);
    const manifest = await rt.finalize();

    expect(second!.trajectory.lastLoopClosureFrame).toBe(4);
    expect(second!.pose.position[0]).toBeCloseTo(0, 6);
    expect(manifest.bounds.max[0] - manifest.bounds.min[0]).toBeCloseTo(4, 5);
    expect(manifest.bounds.max[0] - manifest.bounds.min[0]).toBeLessThan(5);

    await rt.dispose();
  });
});
