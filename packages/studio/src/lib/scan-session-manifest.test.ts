import { describe, expect, it } from 'vitest';
import {
  buildRoomScanCompletionManifest,
  buildScanCompletionManifest,
} from './scan-session-manifest';

const baseInput = {
  token: 'scan-token',
  weightStrategy: 'distill' as const,
  videoHash: 'video-hash',
  frameCount: 4,
  videoBytes: 1234,
  capturedAtIso: '2026-05-05T00:00:00.000Z',
};

describe('scan session manifests', () => {
  it('keeps room scans compatible with the existing manifest shape', () => {
    const manifest = buildRoomScanCompletionManifest(baseInput);

    expect(manifest.worldId).toBe('scan-session:scan-token');
    expect(manifest.displayName).toBe('Studio room scan');
    expect(manifest.pointCount).toBe(512);
    expect(manifest.assets.points).toBe('scan-sessions/scan-token/points.bin');
  });

  it('creates face scan manifests with avatar-scale bounds and assets', () => {
    const manifest = buildScanCompletionManifest({ ...baseInput, scanKind: 'face' });

    expect(manifest.worldId).toBe('face-scan-session:scan-token');
    expect(manifest.displayName).toBe('Studio face scan');
    expect(manifest.pointCount).toBe(384);
    expect(manifest.bounds.min).toEqual([-0.46, -0.62, -0.32]);
    expect(manifest.assets.points).toBe('face-scan-sessions/scan-token/points.bin');
  });
});
