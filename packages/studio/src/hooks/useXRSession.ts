/**
 * useXRSession — WebXR session state hook
 *
 * Detects XR support, tracks active session, and exposes
 * helpers to request immersive-vr or immersive-ar sessions.
 */

import { useState, useEffect, useCallback } from 'react';

export type XRMode = 'immersive-vr' | 'immersive-ar' | 'none';

export interface XRSessionState {
  /** Whether WebXR is supported in this browser */
  supported: XRMode[];
  /** Currently active session mode, or null */
  activeMode: XRMode | null;
  /** True while checking support */
  checking: boolean;
  /** Request VR or AR session */
  requestSession: (mode: XRMode) => Promise<void>;
  /** End current session */
  endSession: () => Promise<void>;
}

export function useXRSession(): XRSessionState {
  const [supported, setSupported] = useState<XRMode[]>([]);
  const [activeMode, setActiveMode] = useState<XRMode | null>(null);
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<XRSession | null>(null);

  // Detect support on mount
  useEffect(() => {
    if (!navigator.xr) {
      setChecking(false);
      return;
    }

    const modes: XRMode[] = ['immersive-vr', 'immersive-ar'];

    Promise.all(
      modes.map(async (mode) => {
        try {
          const ok = await navigator.xr!.isSessionSupported(mode as XRSessionMode);
          return ok ? mode : null;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      setSupported(results.filter(Boolean) as XRMode[]);
      setChecking(false);
    });
  }, []);

  const requestSession = useCallback(async (mode: XRMode) => {
    if (!navigator.xr) throw new Error('WebXR not available');
    if (mode === 'none') return;

    const features: string[] = ['local-floor'];
    const optionalFeatures: string[] = [
      'hand-tracking',
      'bounded-floor',
      'anchors',
      'depth-sensing',
    ];

    const xrSession = await navigator.xr.requestSession(mode as XRSessionMode, {
      requiredFeatures: features,
      optionalFeatures,
    });

    xrSession.addEventListener('end', () => {
      setSession(null);
      setActiveMode(null);
    });

    setSession(xrSession);
    setActiveMode(mode);
  }, []);

  const endSession = useCallback(async () => {
    if (session) {
      await session.end();
    }
  }, [session]);

  return { supported, activeMode, checking, requestSession, endSession };
}
