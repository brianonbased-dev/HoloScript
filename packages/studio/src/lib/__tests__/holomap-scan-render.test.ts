import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  HOLOMAP_SIMULATION_CONTRACT_KIND,
  type ReconstructionManifest,
} from '@holoscript/core/reconstruction';
import { buildHoloMapScanRenderAsset } from '../holomap-scan-render';

function manifest(overrides: Partial<ReconstructionManifest> = {}): ReconstructionManifest {
  return {
    version: '1.0.0',
    worldId: 'scan-session:test',
    displayName: 'Studio room scan',
    pointCount: 256,
    frameCount: 2,
    bounds: {
      min: [-1, -1, -1],
      max: [1, 1, 1],
    },
    replayHash: 'fp-test',
    simulationContract: {
      kind: HOLOMAP_SIMULATION_CONTRACT_KIND,
      replayFingerprint: 'fp-test',
      holoScriptBuild: 'studio@test',
    },
    provenance: {
      capturedAtIso: '2026-05-03T00:00:00.000Z',
    },
    assets: {
      points: 'points.bin',
      trajectory: 'trajectory.json',
      anchors: 'anchors.json',
    },
    weightStrategy: 'distill',
    ...overrides,
  };
}

describe('buildHoloMapScanRenderAsset', () => {
  it('packs a completed scan manifest into base64 point buffers', () => {
    const asset = buildHoloMapScanRenderAsset({
      manifest: manifest(),
      token: 'token-a',
      videoHash: 'video-a',
    });

    expect(asset.kind).toBe('holomap-point-cloud');
    expect(asset.pointCount).toBe(256);
    expect(Buffer.from(asset.positionsB64, 'base64').byteLength).toBe(256 * 3 * 4);
    expect(Buffer.from(asset.colorsB64, 'base64').byteLength).toBe(256 * 3);
    expect(asset.replayFingerprint).toBe('fp-test');
  });

  it('is deterministic for the same scan identity', () => {
    const input = {
      manifest: manifest(),
      token: 'token-a',
      videoHash: 'video-a',
    };

    const first = buildHoloMapScanRenderAsset(input);
    const second = buildHoloMapScanRenderAsset(input);

    expect(second.positionsB64).toBe(first.positionsB64);
    expect(second.colorsB64).toBe(first.colorsB64);
  });

  it('caps large preview clouds before serializing into the session API', () => {
    const asset = buildHoloMapScanRenderAsset({
      manifest: manifest({ pointCount: 50_000 }),
      token: 'token-large',
      videoHash: 'video-large',
    });

    expect(asset.pointCount).toBe(20_000);
  });
});
