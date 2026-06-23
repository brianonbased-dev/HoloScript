import { describe, expect, it } from 'vitest';
import {
  createHoloMapScanScenePlacement,
  HOLOMAP_POINT_CLOUD_TRAIT,
} from '../holomap-scene-placement';
import type { HoloMapScanRenderAsset } from '../holomap-scan-render';

function renderAsset(overrides: Partial<HoloMapScanRenderAsset> = {}): HoloMapScanRenderAsset {
  return {
    kind: 'holomap-point-cloud',
    scanKind: 'room',
    positionsB64: 'AAAA',
    colorsB64: 'AQID',
    pointCount: 42,
    bounds: {
      min: [-1, -1, -1],
      max: [1, 1, 1],
    },
    replayFingerprint: 'fp:test/room',
    ...overrides,
  };
}

describe('createHoloMapScanScenePlacement', () => {
  it('turns a captured render asset into an asset-library entry and scene node', () => {
    const placement = createHoloMapScanScenePlacement({
      renderAsset: renderAsset(),
      token: 'scan-token',
      videoHash: 'video-hash',
      manifest: {
        displayName: 'Kitchen scan',
        replayHash: 'replay-hash',
        simulationContract: { replayFingerprint: 'fp:test/room' },
      },
      now: 123,
    });

    expect(placement.asset.id).toBe('asset-holomap-fp-test-room');
    expect(placement.asset.name).toBe('Kitchen scan');
    expect(placement.asset.category).toBe('pointCloud');
    expect(placement.asset.src).toBe('holomap-scan:fp:test/room');
    expect(placement.asset.size).toBe(42 * 15);
    expect(placement.asset.metadata?.replayFingerprint).toBe('fp:test/room');

    expect(placement.node.id).toBe('placed-holomap-fp-test-room');
    expect(placement.node.type).toBe('holomapPointCloud');
    expect(placement.node.assetMaturity).toBe('mesh');
    expect(placement.node.traits).toHaveLength(1);
  });

  it('keeps GPU and consumption evidence beside the point buffers', () => {
    const placement = createHoloMapScanScenePlacement({
      renderAsset: renderAsset({ scanKind: 'face', pointCount: 7 }),
      now: 456,
    });

    expect(placement.trait.name).toBe(HOLOMAP_POINT_CLOUD_TRAIT);
    expect(placement.trait.properties.positionsB64).toBe('AAAA');
    expect(placement.trait.properties.colorsB64).toBe('AQID');
    expect(placement.trait.properties.pointCount).toBe(7);
    expect(placement.trait.properties.gpuPath).toBe('HolomapPointCloudViewer');
    expect(placement.trait.properties.utilizationEvidence).toMatchObject({
      consumedBy: [
        'useAssetStore',
        'useSceneGraphStore',
        'SceneGraphPointCloudLayer',
        'R3FNodeRenderer.holomapPointCloud',
      ],
      pointBuffers: ['positionsB64', 'colorsB64'],
    });
  });
});
