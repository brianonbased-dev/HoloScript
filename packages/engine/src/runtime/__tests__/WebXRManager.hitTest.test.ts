import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebXRManager, type XRFrame } from '../WebXRManager';

describe('runtime WebXRManager hit-test evidence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests a hit-test source and passes passive frame evidence into the XR loop', async () => {
    const viewerSpace = { type: 'viewer' };
    const localFloorSpace = { type: 'local-floor' };
    const hitTestSource = { cancel: vi.fn() };
    let animationFrameCallback: ((time: number, frame: XRFrame) => void) | null = null;

    const session = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestReferenceSpace: vi.fn(async (type: string) =>
        type === 'viewer' ? viewerSpace : localFloorSpace
      ),
      requestHitTestSource: vi.fn(async ({ space }: { space: unknown }) => {
        expect(space).toBe(viewerSpace);
        return hitTestSource;
      }),
      requestAnimationFrame: vi.fn((callback: (time: number, frame: XRFrame) => void) => {
        animationFrameCallback = callback;
        return 1;
      }),
      updateRenderState: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      inputSources: [],
      renderState: {},
    };
    const requestSession = vi.fn(async () => session);
    vi.stubGlobal('navigator', {
      xr: {
        isSessionSupported: vi.fn(async () => true),
        requestSession,
      },
    });

    const manager = new WebXRManager({
      device: {},
      format: 'rgba8unorm',
    } as never);

    await manager.requestSession();

    expect(requestSession).toHaveBeenCalledWith(
      'immersive-vr',
      expect.objectContaining({
        optionalFeatures: expect.arrayContaining(['hit-test', 'anchors']),
      })
    );
    expect(session.requestReferenceSpace).toHaveBeenCalledWith('viewer');
    expect(session.requestHitTestSource).toHaveBeenCalledWith({ space: viewerSpace });

    const onFrame = vi.fn();
    manager.setAnimationLoop(onFrame);
    expect(animationFrameCallback).toBeTypeOf('function');

    const anchorSpace = { type: 'anchor' };
    const frame = {
      session,
      getViewerPose: vi.fn(),
      getHitTestResults: vi.fn(() => [
        {
          id: 'hit-1',
          getPose: () => ({
            transform: {
              position: { x: 1, y: 2, z: 3 },
              orientation: { x: 0, y: 0, z: 0, w: 1 },
            },
          }),
        },
      ]),
      getPose: vi.fn(() => ({
        transform: {
          position: { x: 4, y: 5, z: 6 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      })),
      trackedAnchors: new Set([
        {
          id: 'geo-anchor-1',
          anchorSpace,
          geospatialPose: { latitude: 10, longitude: 20, altitude: 30 },
        },
      ]),
    } as unknown as XRFrame;

    animationFrameCallback?.(200, frame);

    expect(frame.getHitTestResults).toHaveBeenCalledWith(hitTestSource);
    expect(onFrame).toHaveBeenCalledWith(
      200,
      frame,
      expect.objectContaining({
        hitTests: [
          expect.objectContaining({
            id: 'hit-1',
            position: [1, 2, 3],
            source: 'webxr-hit-test',
          }),
        ],
        geospatialAnchors: [
          expect.objectContaining({
            anchorId: 'geo-anchor-1',
            position: [4, 5, 6],
            lat: 10,
            lng: 20,
            alt: 30,
          }),
        ],
      })
    );
  });
});
