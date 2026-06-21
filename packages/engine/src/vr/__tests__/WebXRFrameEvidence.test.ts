import { describe, expect, it, vi } from 'vitest';
import { collectWebXRFrameEvidence } from '../WebXRFrameEvidence';

describe('collectWebXRFrameEvidence', () => {
  it('converts WebXR hit-test results and tracked anchors into XRFrameData evidence', () => {
    const referenceSpace = {};
    const hitTestSource = {};
    const anchorSpace = {};
    const hitResult = {
      id: 'hit-1',
      anchor: { id: 'anchor-from-hit' },
      confidence: 0.75,
      getPose: vi.fn(() => ({
        transform: {
          position: { x: 1, y: 2, z: 3 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      })),
    };
    const anchor = {
      id: 'geo-anchor-1',
      anchorSpace,
      confidence: 0.8,
      geospatialPose: {
        latitude: 33.4484,
        longitude: -112.074,
        altitude: 331,
      },
    };
    const frame = {
      getHitTestResults: vi.fn(() => [hitResult]),
      getPose: vi.fn(() => ({
        transform: {
          position: [4, 5, 6],
          orientation: [0, 0, 0, 1],
        },
      })),
      trackedAnchors: new Set([anchor]),
    };

    const evidence = collectWebXRFrameEvidence({
      time: 1234,
      frame,
      referenceSpace,
      hitTestSource,
    });

    expect(frame.getHitTestResults).toHaveBeenCalledWith(hitTestSource);
    expect(hitResult.getPose).toHaveBeenCalledWith(referenceSpace);
    expect(evidence.hitTests).toEqual([
      {
        id: 'hit-1',
        anchorId: 'anchor-from-hit',
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        confidence: 0.75,
        source: 'webxr-hit-test',
      },
    ]);
    expect(evidence.geospatialAnchors).toEqual([
      {
        anchorId: 'geo-anchor-1',
        position: [4, 5, 6],
        rotation: [0, 0, 0],
        confidence: 0.8,
        resolvedAt: 1234,
        lat: 33.4484,
        lng: -112.074,
        alt: 331,
      },
    ]);
  });

  it('returns empty evidence when no reference space is available', () => {
    const frame = {
      getHitTestResults: vi.fn(() => {
        throw new Error('should not be called');
      }),
    };

    expect(
      collectWebXRFrameEvidence({
        time: 1,
        frame,
        referenceSpace: null,
        hitTestSource: {},
      })
    ).toEqual({ hitTests: [], geospatialAnchors: [] });
  });
});
