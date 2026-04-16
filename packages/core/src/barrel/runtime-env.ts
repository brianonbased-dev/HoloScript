import { HoloScriptParser } from '../HoloScriptParser';
import { HoloScriptRuntime } from '../HoloScriptRuntime';

/**
 * Create a pre-configured HoloScript environment
 */
export function createHoloScriptEnvironment() {
  return {
    parser: new HoloScriptParser(),
    runtime: new HoloScriptRuntime(),
    version: '6.0.0',
  };
}

/**
 * Check if the current environment supports VR/XR
 */
export function isHoloScriptSupported(): boolean {
  if (typeof globalThis === 'undefined') return false;
  const win = globalThis as {
    window?: {
      navigator?: { xr?: unknown; getVRDisplays?: unknown };
      webkitGetUserMedia?: unknown;
    };
  };
  if (!win.window) return false;

  return !!(
    win.window.navigator?.xr ||
    win.window.navigator?.getVRDisplays ||
    win.window.webkitGetUserMedia
  );
}
