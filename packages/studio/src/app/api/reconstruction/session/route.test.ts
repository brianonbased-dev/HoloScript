import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNativeCameraLiveScanForTests } from '@/lib/native-camera-live-scan';
import {
  __resetScanSessionStoreForTests,
  getScanSessionStore,
  type ScanSession,
} from '@/lib/reconstruction-scan-store';
import { PUT } from './route';

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

function putRequest(token: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/reconstruction/session?t=${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('reconstruction session route native camera frames', () => {
  beforeEach(async () => {
    vi.stubEnv('STUDIO_SCAN_SESSION_STORE', 'memory');
    __resetScanSessionStoreForTests();
    await __resetNativeCameraLiveScanForTests();
  });

  afterEach(async () => {
    __resetScanSessionStoreForTests();
    await __resetNativeCameraLiveScanForTests();
    vi.unstubAllEnvs();
  });

  it('accepts native camera frames and finalizes the HoloMap runtime on done', async () => {
    const token = 'native_camera_route_token';
    const session: ScanSession = {
      token,
      createdAt: '2026-05-24T00:00:00.000Z',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: 'phone-connected',
      scanKind: 'room',
      weightStrategy: 'distill',
    };
    await getScanSessionStore().set(token, session);

    const frameRes = await PUT(
      putRequest(token, { status: 'capturing', nativeFrame: framePayload(0, 20) })
    );
    expect(frameRes.status).toBe(200);
    const frameData = (await frameRes.json()) as { session: ScanSession };
    expect(frameData.session.nativeCamera?.frameCount).toBe(1);
    expect(frameData.session.nativeCamera?.holomap?.framesStepped).toBe(1);

    await PUT(putRequest(token, { status: 'capturing', nativeFrame: framePayload(1, 60) }));
    const doneRes = await PUT(putRequest(token, { status: 'done' }));
    expect(doneRes.status).toBe(200);
    const doneData = (await doneRes.json()) as { session: ScanSession };

    expect(doneData.session.manifest?.displayName).toBe('Native camera HoloMap scan');
    expect(doneData.session.manifest?.frameCount).toBe(2);
    expect(doneData.session.renderAsset?.pointCount).toBeGreaterThan(0);
    expect(doneData.session.nativeCamera?.holomap?.runtime).toBe('finalized');
    expect(doneData.session.videoHash).toMatch(/^native-camera:/);
  });
});
