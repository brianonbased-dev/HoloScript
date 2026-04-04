/**
 * CDN configuration and defaults
 */

export interface HoloCDNConfig {
  cdnBase: string;
  defaultTarget: string;
  debug: boolean;
  loadTimeoutMs: number;
}

export const defaultCDNConfig: HoloCDNConfig = {
  cdnBase: 'https://cdn.holoscript.net',
  defaultTarget: 'threejs',
  debug: false,
  loadTimeoutMs: 10000,
};

export function detectOptimalTarget(): string {
  if (typeof navigator === 'undefined') return 'threejs';

  if ('xr' in navigator) {
    const xrSystem = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
    if (xrSystem?.isSessionSupported) {
      return 'webxr';
    }
  }

  if ('gpu' in navigator) {
    return 'webgpu';
  }

  return 'threejs';
}

export async function checkXRSupport(mode: 'immersive-vr' | 'immersive-ar'): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('xr' in navigator)) return false;
  try {
    const xrSystem = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
    return await xrSystem!.isSessionSupported(mode);
  } catch {
    return false;
  }
}
