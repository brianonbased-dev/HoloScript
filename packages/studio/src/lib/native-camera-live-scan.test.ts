import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetNativeCameraLiveScanForTests,
  decodeNativeCameraFramePayload,
  finalizeNativeCameraLiveScan,
  stepNativeCameraLiveScan,
  updateNativeCameraFrameDigest,
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

function framePayload(index: number, offset = 0): {
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
