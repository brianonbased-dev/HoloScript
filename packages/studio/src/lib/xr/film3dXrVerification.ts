/**
 * Film3D on-device XR verification samples — depth / session features / view poses
 * for evaluation sections (occlusion + gaze policy vs host-side scenarios).
 */

import type { WebGLRenderer } from 'three';

export interface Film3DXrVerificationSample {
  t: number;
  /** Cumulative XR hit-test callbacks in the current session (Film3D occlusion path) */
  hitTestCount?: number;
  /** True once hit-test evidence exists for occlusion-style proofs */
  occlusionProofAcquired?: boolean;
  /** Session advertises depth-sensing feature (real-time environment depth) */
  depthSensingActive: boolean;
  /** When depth is active, typical WebXR usage hint */
  depthUsage?: 'cpu-optimized' | 'gpu-optimized';
  /** Viewer pose view count (stereo = 2) */
  viewPoseCount: number;
  /** XRInputSource count (hands, controllers, gaze proxies) */
  inputSourceCount: number;
  /** Whether any input source uses gaze-style targeting */
  gazeLikeInputPresent: boolean;
}

/**
 * Pull a single sample from the active WebXR session (if any).
 * Safe to call from r3f `useFrame`; no allocations when session is null.
 */
export function collectFilm3dXrSample(gl: WebGLRenderer): Film3DXrVerificationSample {
  const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const xr = gl.xr;
  const session = xr.getSession();
  if (!session) {
    return {
      t,
      depthSensingActive: false,
      viewPoseCount: 0,
      inputSourceCount: 0,
      gazeLikeInputPresent: false,
    };
  }

  const enabled = (session as XRSession & { enabledFeatures?: string[] }).enabledFeatures;
  const depthSensingActive = Array.isArray(enabled) && enabled.includes('depth-sensing');

  const refSpace = xr.getReferenceSpace();
  let viewPoseCount = 0;
  const getFrame = (xr as unknown as { getFrame?: () => XRFrame }).getFrame;
  const frame = typeof getFrame === 'function' ? getFrame.call(xr) : undefined;
  if (frame && refSpace) {
    const pose = frame.getViewerPose(refSpace);
    viewPoseCount = pose?.views?.length ?? 0;
  }

  let gazeLikeInputPresent = false;
  const sources = session.inputSources ?? [];
  for (const src of sources) {
    if (src.targetRayMode === 'gaze' || src.targetRayMode === 'transient-pointer') {
      gazeLikeInputPresent = true;
      break;
    }
  }

  return {
    t,
    depthSensingActive,
    depthUsage: depthSensingActive ? 'gpu-optimized' : undefined,
    viewPoseCount,
    inputSourceCount: sources.length,
    gazeLikeInputPresent,
  };
}
