import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebXRManager } from '../WebXRManager';

// =============================================================================
// MOCK XR API
// =============================================================================

function createMockSession() {
  const listeners: Record<string, Function[]> = {};
  return {
    requestReferenceSpace: vi.fn(async (type: string) => ({
      type,
      getOffsetReferenceSpace: vi.fn(),
    })),
    requestAnimationFrame: vi.fn((cb: Function) => 1),
    addEventListener: vi.fn((evt: string, cb: Function) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(cb);
    }),
    end: vi.fn(async () => {
      // Trigger 'end' listeners
      (listeners['end'] || []).forEach(cb => cb());
    }),
    _listeners: listeners,
  };
}

function setupNavigatorXR(session: any, supported = true) {
  vi.stubGlobal('navigator', {
    xr: {
      isSessionSupported: vi.fn(async () => supported),
      requestSession: vi.fn(async () => session),
    },
  });
}

function cleanupNavigatorXR() {
  vi.unstubAllGlobals();
}

// =============================================================================
// TESTS
// =============================================================================

describe('WebXRManager', () => {
  let manager: WebXRManager;
  let mockSession: ReturnType<typeof createMockSession>;

  beforeEach(() => {
    mockSession = createMockSession();
    setupNavigatorXR(mockSession);
    manager = new WebXRManager();
  });

  // Cleanup
  afterEach(() => {
    cleanupNavigatorXR();
  });

  it('starts with no session', () => {
    expect(manager.getSession()).toBeNull();
    expect(manager.getReferenceSpace()).toBeNull();
  });

  it('detects VR support', async () => {
    const supported = await manager.isSessionSupported();
    expect(supported).toBe(true);
    expect((navigator as any).xr.isSessionSupported).toHaveBeenCalledWith('immersive-vr');
  });

  it('returns false when navigator.xr is missing', async () => {
    cleanupNavigatorXR();
    const supported = await manager.isSessionSupported();
    expect(supported).toBe(false);
  });

  it('requests an immersive VR session', async () => {
    const session = await manager.requestSession();
    expect(session).toBeDefined();
    expect(manager.getSession()).toBe(session);
    expect((navigator as any).xr.requestSession).toHaveBeenCalledWith(
      'immersive-vr',
      expect.objectContaining({
        optionalFeatures: expect.arrayContaining(['local-floor', 'hand-tracking']),
      })
    );
  });

  it('acquires reference spaces on session start', async () => {
    await manager.requestSession();
    // Should have requested both local-floor and local
    expect(mockSession.requestReferenceSpace).toHaveBeenCalledWith('local-floor');
    expect(mockSession.requestReferenceSpace).toHaveBeenCalledWith('local');
    expect(manager.getReferenceSpace()).not.toBeNull();
  });

  it('fires onSessionStart callback', async () => {
    const onStart = vi.fn();
    manager.onSessionStart = onStart;
    await manager.requestSession();
    expect(onStart).toHaveBeenCalledWith(expect.anything());
  });

  it('returns existing session if already active', async () => {
    const s1 = await manager.requestSession();
    const s2 = await manager.requestSession();
    expect(s1).toBe(s2);
    // requestSession should only have been called once on navigator.xr
    expect((navigator as any).xr.requestSession).toHaveBeenCalledTimes(1);
  });

  it('ends session and clears state', async () => {
    const onEnd = vi.fn();
    manager.onSessionEnd = onEnd;
    await manager.requestSession();

    await manager.endSession();
    expect(mockSession.end).toHaveBeenCalled();
    expect(manager.getSession()).toBeNull();
    expect(manager.getReferenceSpace()).toBeNull();
    expect(onEnd).toHaveBeenCalled();
  });

  it('sets animation loop callback', async () => {
    await manager.requestSession();
    const cb = vi.fn();
    manager.setAnimationLoop(cb);
    expect(mockSession.requestAnimationFrame).toHaveBeenCalled();
  });

  it('handles endSession when no session exists (no-op)', async () => {
    await expect(manager.endSession()).resolves.toBeUndefined();
  });
});
