import { HoloScriptParser } from '../HoloScriptParser';

/**
 * Create a pre-configured HoloScript environment.
 *
 * Async + lazy-imports HoloScriptRuntime so the main '@holoscript/core' barrel
 * does NOT statically pull in the optional peer @holoscript/engine (cold-consume fix).
 */
export async function createHoloScriptEnvironment() {
  const { HoloScriptRuntime } = await import('../HoloScriptRuntime');
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
