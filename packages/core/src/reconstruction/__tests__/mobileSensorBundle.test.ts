import { describe, expect, it } from 'vitest';

import {
  HOLOMAP_MOBILE_SENSOR_BUNDLE_VERSION,
  cameraPoseFromColumnMajorTransform,
  createArCoreDepthMobileSensorBundle,
  arCoreDepthFrameToMobileSensorFrame,
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

describe('HoloMap Android ARCore Depth adapter', () => {
  const arRgb = new Array(W * H * STRIDE).fill(0).map((_, i) => (i * 11) % 256);
  const arTransform = transform(0.5, 1.5, -2);

  it('normalizes ARCore 16-bit millimeter depth into the canonical Android bundle', () => {
    const bundle = createArCoreDepthMobileSensorBundle({
      bundleId: 's23-ultra-arcore-fixture',
      deviceModel: 'Samsung Galaxy S23 Ultra',
      intrinsics: {
        width: W,
        height: H,
        fx: 610,
        fy: 608,
        cx: 2,
        cy: 2,
        source: 'arcore-camera-intrinsics',
      },
      depthRangeMillimeters: { near: 500, far: 5000 },
      frames: [
        {
          index: 0,
          timestampMs: 0,
          width: W,
          height: H,
          stride: STRIDE,
          rgb: arRgb,
          depthImage16Bits: {
            width: 2,
            height: 2,
            millimeters: [500, 2750, 0, 5000],
          },
          rawDepthConfidenceImage: {
            width: 2,
            height: 2,
            values: [255, 128, 255, 64],
          },
          cameraTransformColumnMajor4x4: arTransform,
        },
      ],
    });

    expect(bundle.capture.platform).toBe('android-arcore-depth');
    expect(bundle.capture.coordinateSystem).toBe('arcore-right-handed-y-up');
    expect(validateMobileSensorBundle(bundle)).toEqual([]);
    const frame = bundle.frames[0]!;
    expect(frame.sceneDepth?.values[0]).toBeCloseTo(0, 6);
    expect(frame.sceneDepth?.values[2]).toBeCloseTo(0.5, 6);
    expect(frame.sceneDepth?.values[8]).toBeCloseTo(1, 6);
    expect(frame.sceneDepth?.values[10]).toBeCloseTo(1, 6);
    expect(frame.sceneDepthConfidence?.values[0]).toBeCloseTo(1, 6);
    expect(frame.sceneDepthConfidence?.values[2]).toBeCloseTo(128 / 255, 6);
    expect(frame.sceneDepthConfidence?.values[8]).toBe(0);
    expect(frame.sceneDepthConfidence?.values[10]).toBeCloseTo(64 / 255, 6);
  });

  it('replays an Android ARCore depth bundle through HoloMap with measured pose', async () => {
    const bundle = createArCoreDepthMobileSensorBundle({
      bundleId: 'android-arcore-replay-fixture',
      deviceModel: 'Samsung Galaxy S23 Ultra',
      intrinsics: {
        width: W,
        height: H,
        fx: 610,
        fy: 608,
        cx: 2,
        cy: 2,
        source: 'arcore-camera-intrinsics',
      },
      frames: [
        {
          index: 0,
          timestampMs: 0,
          width: W,
          height: H,
          stride: STRIDE,
          rgb: arRgb,
          depthImage16Bits: {
            width: W,
            height: H,
            millimeters: new Array(W * H).fill(500),
          },
          cameraTransformColumnMajor4x4: transform(2, 0, 0),
        },
        {
          index: 1,
          timestampMs: 200,
          width: W,
          height: H,
          stride: STRIDE,
          rgb: arRgb.map((v) => (v + 7) % 256),
          depthImage16Bits: {
            width: W,
            height: H,
            millimeters: new Array(W * H).fill(5000),
          },
          cameraTransformColumnMajor4x4: transform(2.25, 0, 0),
        },
      ],
    });

    const replay = await replayMobileSensorBundle(bundle, { tileGrid: 2, seed: 21 });

    expect(replay.source.platform).toBe('android-arcore-depth');
    expect(replay.steps).toHaveLength(2);
    expect(replay.steps[0]!.pose.position).toEqual([2, 0, 0]);
    expect(replay.steps[1]!.pose.position).toEqual([2.25, 0, 0]);
    for (const z of zValues(replay.steps[0]!.points.positions)) expect(z).toBeCloseTo(0.17, 5);
    for (const z of zValues(replay.steps[1]!.points.positions)) expect(z).toBeCloseTo(-0.17, 5);
  });

  it('fails closed for malformed ARCore planes and invalidates zero-depth cells', () => {
    const frame = arCoreDepthFrameToMobileSensorFrame({
      index: 0,
      timestampMs: 0,
      width: W,
      height: H,
      stride: STRIDE,
      rgb: arRgb,
      depthImage16Bits: {
        width: W,
        height: H,
        millimeters: [0, ...new Array(W * H - 1).fill(1000)],
      },
    });

    expect(frame.sceneDepthConfidence?.values[0]).toBe(0);
    expect(frame.sceneDepthConfidence?.values[1]).toBe(1);
    expect(() =>
      arCoreDepthFrameToMobileSensorFrame({
        index: 0,
        timestampMs: 0,
        width: W,
        height: H,
        stride: STRIDE,
        rgb: arRgb,
        depthImage16Bits: {
          width: 2,
          height: 2,
          millimeters: [500, 500, 500, 500],
        },
        rawDepthConfidenceImage: {
          width: 4,
          height: 4,
          values: new Array(W * H).fill(255),
        },
      })
    ).toThrow(/dimensions must match depthImage16Bits/);
  });
});
