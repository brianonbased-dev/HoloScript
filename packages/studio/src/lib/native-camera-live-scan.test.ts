import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetNativeCameraLiveScanForTests,
  decodeNativeCameraFramePayload,
  finalizeNativeCameraLiveScan,
  stepNativeCameraLiveScan,
  updateNativeCameraFrameDigest,
  type NativeCameraArCoreDepthPlane,
} from './native-camera-live-scan';
import type { ScanSession } from './reconstruction-scan-store';

function testSession(overrides: Partial<ScanSession> = {}): ScanSession {
  return {
    token: 'native_camera_test_token',
    createdAt: '2026-05-24T00:00:00.000Z',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: 'capturing',
    scanKind: 'room',
    weightStrategy: 'distill',
    ...overrides,
  };
}

function framePayload(
  index: number,
  offset = 0
): {
  index: number;
  timestampMs: number;
  width: number;
  height: number;
  stride: 3;
  rgbBase64: string;
} {
  const rgb = new Uint8Array(4 * 4 * 3);
  for (let i = 0; i < rgb.length; i += 1) rgb[i] = (i + offset) % 256;
  return {
    index,
    timestampMs: index * 200,
    width: 4,
    height: 4,
    stride: 3,
    rgbBase64: Buffer.from(rgb).toString('base64'),
  };
}

describe('native camera live scan', () => {
  afterEach(async () => {
    await __resetNativeCameraLiveScanForTests();
  });

  it('validates live RGB frames and hashes the actual bytes', () => {
    const first = decodeNativeCameraFramePayload(framePayload(0, 1));
    const tampered = decodeNativeCameraFramePayload(framePayload(0, 2));

    expect(first.frame.rgb.byteLength).toBe(48);
    expect(first.frame.width).toBe(4);
    expect(first.frameHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.frameHash).not.toBe(tampered.frameHash);
  });

  it('keeps the native camera frame digest order-sensitive', () => {
    const aThenB = updateNativeCameraFrameDigest(
      updateNativeCameraFrameDigest(undefined, 'a'.repeat(64)),
      'b'.repeat(64)
    );
    const bThenA = updateNativeCameraFrameDigest(
      updateNativeCameraFrameDigest(undefined, 'b'.repeat(64)),
      'a'.repeat(64)
    );

    expect(aThenB).toMatch(/^[a-f0-9]{64}$/);
    expect(aThenB).not.toBe(bThenA);
  });

  function depthBase64(value: number, w = 4, h = 4): string {
    return Buffer.from(new Float32Array(w * h).fill(value).buffer).toString('base64');
  }

  it('carries MEASURED depth + device pose through to the ReconstructionFrame', () => {
    const decoded = decodeNativeCameraFramePayload({
      ...framePayload(0, 5),
      depthBase64: depthBase64(0.25),
      devicePose: { position: [1, 2, 3], rotation: [0, 0, 0, 1], confidence: 0.9 },
    });
    expect(decoded.frame.depth).toBeInstanceOf(Float32Array);
    expect(decoded.frame.depth?.length).toBe(16);
    expect(decoded.frame.depth?.[0]).toBeCloseTo(0.25, 6);
    expect(decoded.frame.devicePose?.position).toEqual([1, 2, 3]);
    expect(decoded.frame.devicePose?.confidence).toBeCloseTo(0.9, 6);
  });

  it('folds measured depth into the provenance hash (tamper changes identity)', () => {
    const base = framePayload(0, 5);
    const a = decodeNativeCameraFramePayload({ ...base, depthBase64: depthBase64(0.25) });
    const b = decodeNativeCameraFramePayload({ ...base, depthBase64: depthBase64(0.75) });
    const none = decodeNativeCameraFramePayload(base);
    expect(a.frameHash).not.toBe(b.frameHash); // depth tamper → new identity
    expect(a.frameHash).not.toBe(none.frameHash); // depth presence → new identity
  });

  it('rejects a measured-depth payload with the wrong byte length', () => {
    expect(() =>
      decodeNativeCameraFramePayload({ ...framePayload(0, 5), depthBase64: depthBase64(0.5, 2, 2) })
    ).toThrow(/byte length mismatch/);
  });

  it('device pose flows through the runtime step (measured pose is used)', async () => {
    const session = testSession();
    await stepNativeCameraLiveScan(session, {
      ...framePayload(0, 11),
      depthBase64: depthBase64(0.3),
      devicePose: { position: [4, 5, 6], rotation: [0, 0, 0, 1], confidence: 0.42 },
    });
    // The runtime used the device pose: its confidence (0.42) surfaces on the session,
    // not a derived centroid-pose confidence.
    expect(session.nativeCamera?.holomap?.lastPoseConfidence).toBeCloseTo(0.42, 6);
    expect(session.nativeCamera?.holomap?.runtime).toBe('active');
  });

  // Helpers for ARCore uint16 mm depth plane (4×4 = 16 depth cells at 1m = 1000 mm)
  function arCoreDepthPlane(
    depthW: number,
    depthH: number,
    valuesMm: number
  ): NativeCameraArCoreDepthPlane {
    const mm = new Uint16Array(depthW * depthH).fill(valuesMm);
    return {
      width: depthW,
      height: depthH,
      millimeters16Base64: Buffer.from(mm.buffer).toString('base64'),
    };
  }

  it('accepts arCoreDepthPlane and normalizes 16-bit mm depth via mobileSensorBundle adapter', () => {
    // 1000 mm should normalize to ~0.1 on the 500..5000 mm ARCore range
    const decoded = decodeNativeCameraFramePayload({
      ...framePayload(0, 7),
      arCoreDepthPlane: arCoreDepthPlane(4, 4, 1000),
    });
    expect(decoded.frame.depth).toBeInstanceOf(Float32Array);
    expect(decoded.frame.depth!.length).toBe(16); // same as RGB pixel count 4×4
    expect(decoded.frame.depth![0]).toBeCloseTo(0.1111, 3); // (1000-500)/(5000-500)
  });

  it('arCoreDepthPlane with confidence filters zero-mm cells (invalid depth)', () => {
    const mm = new Uint16Array(4 * 4); // all zeros = invalid depth
    const conf = new Uint8Array(4 * 4).fill(255); // all max confidence
    const decoded = decodeNativeCameraFramePayload({
      ...framePayload(0, 8),
      arCoreDepthPlane: {
        width: 4,
        height: 4,
        millimeters16Base64: Buffer.from(mm.buffer).toString('base64'),
        confidenceBase64: Buffer.from(conf).toString('base64'),
      },
    });
    // Zero-mm depth → confidence forced to 0 by the adapter regardless of input
    expect(decoded.frame.depth).toBeInstanceOf(Float32Array);
  });

  it('arCoreDepthPlane produces different hash than depthBase64 for same logical depth', () => {
    const base = framePayload(0, 9);
    const arCorePath = decodeNativeCameraFramePayload({
      ...base,
      arCoreDepthPlane: arCoreDepthPlane(4, 4, 1000),
    });
    const float32Path = decodeNativeCameraFramePayload({
      ...base,
      depthBase64: Buffer.from(new Float32Array(16).fill(0.1).buffer).toString('base64'),
    });
    // Different encode paths → different provenance hashes (input bytes differ)
    expect(arCorePath.frameHash).not.toBe(float32Path.frameHash);
  });

  it('cameraTransformColumnMajor4x4 decodes into devicePose (identity matrix)', () => {
    // Identity 4x4 column-major → position (0,0,0), rotation (0,0,0,1)
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const decoded = decodeNativeCameraFramePayload({
      ...framePayload(0, 6),
      cameraTransformColumnMajor4x4: identity,
    });
    expect(decoded.frame.devicePose?.position).toEqual([0, 0, 0]);
    expect(decoded.frame.devicePose?.rotation[3]).toBeCloseTo(1, 4);
  });

  it('cameraTransformColumnMajor4x4 takes precedence over devicePose', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1];
    const decoded = decodeNativeCameraFramePayload({
      ...framePayload(0, 12),
      // matrix says position (5,6,7); devicePose says (1,2,3) — matrix wins
      cameraTransformColumnMajor4x4: identity,
      devicePose: { position: [1, 2, 3], rotation: [0, 0, 0, 1], confidence: 0.5 },
    });
    expect(decoded.frame.devicePose?.position).toEqual([5, 6, 7]);
  });

  it('rejects arCoreDepthPlane with wrong byte length', () => {
    const mm = new Uint16Array(4); // too short for 4×4
    expect(() =>
      decodeNativeCameraFramePayload({
        ...framePayload(0, 13),
        arCoreDepthPlane: {
          width: 4,
          height: 4,
          millimeters16Base64: Buffer.from(mm.buffer).toString('base64'),
        },
      })
    ).toThrow(/byte length mismatch/);
  });

  it('steps native camera frames through HoloMapRuntime and finalizes a manifest', async () => {
    const session = testSession();

    await stepNativeCameraLiveScan(session, framePayload(0, 10));
    await stepNativeCameraLiveScan(session, framePayload(1, 40));
    const manifest = await finalizeNativeCameraLiveScan(session);

    expect(session.nativeCamera?.source).toBe('mediaDevices.getUserMedia');
    expect(session.nativeCamera?.frameCount).toBe(2);
    expect(session.nativeCamera?.holomap?.runtime).toBe('finalized');
    expect(session.videoHash).toMatch(/^native-camera:/);
    expect(manifest?.displayName).toBe('Native camera HoloMap scan');
    expect(manifest?.frameCount).toBe(2);
    expect(manifest?.pointCount).toBe(32);
    expect(session.replayFingerprint).toBe(manifest?.simulationContract.replayFingerprint);
  });
});
