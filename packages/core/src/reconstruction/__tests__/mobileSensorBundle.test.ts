import { describe, expect, it } from 'vitest';

import {
  HOLOMAP_MOBILE_SENSOR_BUNDLE_VERSION,
  cameraPoseFromColumnMajorTransform,
  mobileSensorBundleToFrames,
  replayMobileSensorBundle,
  validateMobileSensorBundle,
  type MobileSensorBundle,
} from '../mobileSensorBundle';

const W = 4;
const H = 4;
const STRIDE = 4;

function rgb(seed: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < W * H; i += 1) {
    out.push((seed + i * 17) % 256, (seed + i * 29) % 256, (seed + i * 43) % 256, 255);
  }
  return out;
}

function transform(tx: number, ty: number, tz: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
}

function bundle(overrides: Partial<MobileSensorBundle> = {}): MobileSensorBundle {
  return {
    schemaVersion: HOLOMAP_MOBILE_SENSOR_BUNDLE_VERSION,
    bundleId: 'ios-lidar-replay-fixture',
    capture: {
      platform: 'ios-arkit-lidar',
      deviceModel: 'synthetic-iphone-lidar',
      coordinateSystem: 'arkit-right-handed-y-up',
      intrinsics: {
        width: W,
        height: H,
        fx: 500,
        fy: 505,
        cx: 2,
        cy: 2,
        source: 'synthetic-arkit-camera-intrinsics',
      },
    },
    frames: [
      {
        index: 0,
        timestampMs: 0,
        width: W,
        height: H,
        stride: STRIDE,
        rgb: rgb(5),
        sceneDepth: { width: W, height: H, values: new Array(W * H).fill(0.25) },
        sceneDepthConfidence: {
          width: W,
          height: H,
          encoding: 'arkit-0-2',
          values: new Array(W * H).fill(2),
        },
        cameraTransformColumnMajor4x4: transform(1, 2, 3),
        devicePose: { position: [9, 9, 9], rotation: [0, 0, 0, 1], confidence: 0.75 },
        meshAnchors: [
          {
            id: 'mesh-anchor-1',
            transformColumnMajor4x4: transform(0, 0, 0),
            vertexCount: 4,
            faceCount: 2,
            confidence: 0.9,
          },
        ],
      },
      {
        index: 1,
        timestampMs: 1,
        width: W,
        height: H,
        stride: STRIDE,
        rgb: rgb(9),
        sceneDepth: { width: W, height: H, values: new Array(W * H).fill(0.75) },
        sceneDepthConfidence: {
          width: W,
          height: H,
          encoding: 'unit',
          values: new Array(W * H).fill(0.5),
        },
        cameraTransformColumnMajor4x4: transform(1.2, 2, 3),
      },
    ],
    ...overrides,
  };
}

function zValues(positions: Float32Array): number[] {
  const z: number[] = [];
  for (let i = 2; i < positions.length; i += 3) z.push(positions[i]!);
  return z;
}

describe('HoloMap mobile sensor bundle adapter', () => {
  it('normalizes iOS LiDAR-style depth, confidence, and camera.transform into runtime frames', () => {
    const source = bundle();
    expect(validateMobileSensorBundle(source)).toEqual([]);

    const frames = mobileSensorBundleToFrames(source);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.depth).toBeInstanceOf(Float32Array);
    expect(frames[0]!.depthConfidence).toBeInstanceOf(Float32Array);
    expect(frames[0]!.depth![0]).toBeCloseTo(0.25, 6);
    expect(frames[0]!.depthConfidence![0]).toBeCloseTo(1, 6);
    expect(frames[0]!.devicePose!.position).toEqual([1, 2, 3]);
    expect(frames[0]!.devicePose!.confidence).toBeCloseTo(0.75, 6);
    expect(frames[0]!.devicePose!.rotation).toEqual([0, 0, 0, 1]);
  });

  it('replays the bundle through HoloMap using measured depth and device pose', async () => {
    const replay = await replayMobileSensorBundle(bundle(), { tileGrid: 2, seed: 11 });

    expect(replay.source).toMatchObject({
      bundleId: 'ios-lidar-replay-fixture',
      platform: 'ios-arkit-lidar',
      frameCount: 2,
      meshAnchorCount: 1,
    });
    expect(replay.steps).toHaveLength(2);
    expect(replay.steps[0]!.pose.position).toEqual([1, 2, 3]);
    expect(replay.steps[1]!.pose.position).toEqual([1.2, 2, 3]);
    for (const z of zValues(replay.steps[0]!.points.positions)) expect(z).toBeCloseTo(0.085, 5);
    for (const z of zValues(replay.steps[1]!.points.positions)) expect(z).toBeCloseTo(-0.085, 5);
    expect(replay.manifest.frameCount).toBe(2);
    expect(replay.manifest.pointCount).toBe(8);
  });

  it('uses depth confidence to gate emitted point confidence', async () => {
    const high = await replayMobileSensorBundle(bundle(), { tileGrid: 2, seed: 12 });
    const low = bundle({
      frames: [
        {
          ...bundle().frames[0]!,
          sceneDepthConfidence: {
            width: W,
            height: H,
            encoding: 'unit',
            values: new Array(W * H).fill(0),
          },
        },
      ],
    });
    const lowReplay = await replayMobileSensorBundle(low, { tileGrid: 2, seed: 12 });

    expect(Math.max(...high.steps[0]!.points.confidence)).toBeGreaterThan(0.1);
    expect(Math.max(...lowReplay.steps[0]!.points.confidence)).toBe(0);
  });

  it('fails closed on malformed transport dimensions', () => {
    const malformed = bundle({
      frames: [
        {
          ...bundle().frames[0]!,
          sceneDepth: { width: W - 1, height: H, values: new Array(W * H).fill(0.5) },
        },
      ],
    });

    const errors = validateMobileSensorBundle(malformed);
    expect(errors.some((error) => error.includes('sceneDepth dimensions'))).toBe(true);
    expect(() => mobileSensorBundleToFrames(malformed)).toThrow(/sceneDepth dimensions/);
    expect(() => cameraPoseFromColumnMajorTransform([1, 0, 0])).toThrow(/16 finite numbers/);
  });

  it('one-cell depth tamper changes replayed points', async () => {
    const original = bundle({
      frames: [
        {
          ...bundle().frames[0]!,
          sceneDepth: { width: W, height: H, values: new Array(W * H).fill(0.5) },
        },
      ],
    });
    const tamperedDepth = new Array(W * H).fill(0.5);
    tamperedDepth[0] = 0;
    const tampered = bundle({
      frames: [
        { ...bundle().frames[0]!, sceneDepth: { width: W, height: H, values: tamperedDepth } },
      ],
    });

    const a = await replayMobileSensorBundle(original, { tileGrid: 4, seed: 13 });
    const b = await replayMobileSensorBundle(tampered, { tileGrid: 4, seed: 13 });
    const za = zValues(a.steps[0]!.points.positions);
    const zb = zValues(b.steps[0]!.points.positions);

    expect(za.some((z, index) => Math.abs(z - zb[index]!) > 1e-4)).toBe(true);
  });
});
