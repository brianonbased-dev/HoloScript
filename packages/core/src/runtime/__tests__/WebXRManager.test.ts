import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebXRManager } from '../WebXRManager';

function mockContext(): any {
  return {
    device: {},
    format: 'bgra8unorm',
    canvas: { width: 800, height: 600 },
  };
}

describe('WebXRManager', () => {
  let manager: WebXRManager;

  beforeEach(() => {
    manager = new WebXRManager(mockContext());
  });

  // ---- Constructor ----

  it('constructs with context', () => {
    expect(manager).toBeDefined();
  });

  // ---- Session State ----

  it('starts with no session', () => {
    expect(manager.getSession()).toBeNull();
  });

  it('starts with no reference space', () => {
    expect(manager.getReferenceSpace()).toBeNull();
  });

  it('starts with no binding', () => {
    expect(manager.getBinding()).toBeNull();
  });

  it('starts with no projection layer', () => {
    expect(manager.getProjectionLayer()).toBeNull();
  });

  // ---- Callbacks ----

  it('callback properties start as null', () => {
    expect(manager.onSessionStart).toBeNull();
    expect(manager.onSessionEnd).toBeNull();
    expect(manager.onInputSourcesChange).toBeNull();
  });

  it('callback properties can be set', () => {
    const fn = vi.fn();
    manager.onSessionStart = fn;
    expect(manager.onSessionStart).toBe(fn);
  });

  // ---- isSupported (static) ----

  it('isSupported returns false without navigator.xr', async () => {
    // In Node.js/Vitest, navigator.xr doesn't exist
    const supported = await WebXRManager.isSupported();
    expect(supported).toBe(false);
  });

  // ---- isSessionSupported (instance) ----

  it('isSessionSupported returns false without navigator.xr', async () => {
    const supported = await manager.isSessionSupported('immersive-vr');
    expect(supported).toBe(false);
  });

  // ---- endSession ----

  it('endSession does nothing without active session', async () => {
    await expect(manager.endSession()).resolves.toBeUndefined();
  });
});
