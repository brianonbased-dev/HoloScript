/**
 * WebXRManager Production Tests
 * Sprint CLXVI — session state, callbacks, animation loop registration
 *
 * WebXR APIs do not exist in Node/jsdom, so we mock XRSession and XRFrame
 * and only test the JavaScript-layer logic (state, callbacks, guards).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebXRManager } from '../WebXRManager';

// ---------------------------------------------------------------------------
// Minimal mocks for XRSession / XRFrame
// ---------------------------------------------------------------------------

function makeSessionMock() {
  const listeners: Record<string, (() => void)[]> = {};
  const session = {
    addEventListener: vi.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    requestReferenceSpace: vi.fn().mockResolvedValue({ type: 'local-floor' }),
    requestAnimationFrame: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    _fire: (event: string) => listeners[event]?.forEach(cb => cb()),
  };
  return session;
}

function setupNavigatorXR(session: ReturnType<typeof makeSessionMock>) {
  const xr = {
    isSessionSupported: vi.fn().mockResolvedValue(true),
    requestSession: vi.fn().mockResolvedValue(session),
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { xr },
    configurable: true,
    writable: true,
  });
  return xr;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebXRManager', () => {
  let manager: WebXRManager;

  beforeEach(() => {
    manager = new WebXRManager();
    // Reset navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
  });

  describe('constructor', () => {
    it('initializes with no session', () => {
      expect(manager.getSession()).toBeNull();
    });

    it('initializes with no reference space', () => {
      expect(manager.getReferenceSpace()).toBeNull();
    });

    it('accepts optional context arg', () => {
      const m = new WebXRManager({ type: 'webgpu' } as any);
      expect(m).toBeTruthy();
    });
  });

  describe('isSessionSupported', () => {
    it('returns false when navigator.xr is not available', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });
      const result = await manager.isSessionSupported();
      expect(result).toBe(false);
    });

    it('returns true when navigator.xr.isSessionSupported returns true', async () => {
      const session = makeSessionMock();
      setupNavigatorXR(session);
      const result = await manager.isSessionSupported();
      expect(result).toBe(true);
    });
  });

  describe('requestSession', () => {
    it('calls navigator.xr.requestSession', async () => {
      const session = makeSessionMock();
      const xr = setupNavigatorXR(session);
      await manager.requestSession();
      expect(xr.requestSession).toHaveBeenCalledWith('immersive-vr', expect.any(Object));
    });

    it('getSession returns the XRSession after request', async () => {
      const session = makeSessionMock();
      setupNavigatorXR(session);
      await manager.requestSession();
      expect(manager.getSession()).toBe(session);
    });

    it('returns same session on second call (no duplicate request)', async () => {
      const session = makeSessionMock();
      const xr = setupNavigatorXR(session);
      await manager.requestSession();
      await manager.requestSession();
      expect(xr.requestSession).toHaveBeenCalledTimes(1);
    });

    it('calls onSessionStart callback', async () => {
      const session = makeSessionMock();
      setupNavigatorXR(session);
      const onStart = vi.fn();
      manager.onSessionStart = onStart;
      await manager.requestSession();
      expect(onStart).toHaveBeenCalledWith(session);
    });

    it('getReferenceSpace returns non-null after session start', async () => {
      const session = makeSessionMock();
      setupNavigatorXR(session);
      await manager.requestSession();
      expect(manager.getReferenceSpace()).toBeTruthy();
    });
  });

  describe('session end', () => {
    it('clears session when end event fires', async () => {
      const session = makeSessionMock();
      setupNavigatorXR(session);
      await manager.requestSession();
      // Fire the 'end' event
      (session as any)._fire('end');
      expect(manager.getSession()).toBeNull();
    });

    it('calls onSessionEnd callback when session ends', async () => {
      const session = makeSessionMock();
      setupNavigatorXR(session);
      const onEnd = vi.fn();
      manager.onSessionEnd = onEnd;
      await manager.requestSession();
      (session as any)._fire('end');
      expect(onEnd).toHaveBeenCalled();
    });

    it('getReferenceSpace returns null after session end', async () => {
      const session = makeSessionMock();
      setupNavigatorXR(session);
      await manager.requestSession();
      (session as any)._fire('end');
      expect(manager.getReferenceSpace()).toBeNull();
    });

    it('endSession calls session.end()', async () => {
      const session = makeSessionMock();
      setupNavigatorXR(session);
      await manager.requestSession();
      await manager.endSession();
      expect(session.end).toHaveBeenCalled();
    });

    it('endSession does not throw when no session', async () => {
      await expect(manager.endSession()).resolves.not.toThrow();
    });
  });

  describe('setAnimationLoop', () => {
    it('stores the callback', () => {
      const cb = vi.fn();
      manager.setAnimationLoop(cb);
      // no session, so no requestAnimationFrame called — just stores callback
      expect(cb).not.toHaveBeenCalled();
    });

    it('calls session.requestAnimationFrame when session is active', async () => {
      const session = makeSessionMock();
      setupNavigatorXR(session);
      await manager.requestSession();
      manager.setAnimationLoop(vi.fn());
      expect(session.requestAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('onSessionStart / onSessionEnd callbacks', () => {
    it('onSessionStart is null by default', () => {
      expect(manager.onSessionStart).toBeNull();
    });

    it('onSessionEnd is null by default', () => {
      expect(manager.onSessionEnd).toBeNull();
    });
  });
});
