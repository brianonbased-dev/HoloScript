/**
 * Minimal structural WebXR declarations for the probe — same idiom as
 * packages/engine's webxr.d.ts (loose global interfaces, no @types/webxr).
 * Only what the probe touches.
 */
export {};

declare global {
  interface XRVec3 {
    x: number;
    y: number;
    z: number;
  }
  interface XRPoseLike {
    transform: { position: XRVec3 };
  }
  interface XRSpaceLike {
    [key: string]: unknown;
  }
  interface XRHandLike {
    get(jointName: string): XRSpaceLike | undefined;
  }
  interface XRInputSourceLike {
    handedness: 'left' | 'right' | 'none';
    hand?: XRHandLike;
    gripSpace?: XRSpaceLike;
  }
  interface XRFrameLike {
    getPose(space: XRSpaceLike, ref: XRSpaceLike): XRPoseLike | null;
    getJointPose?(joint: XRSpaceLike, ref: XRSpaceLike): XRPoseLike | null;
  }
  interface XRSessionLike {
    inputSources: XRInputSourceLike[];
    updateRenderState(state: { baseLayer: unknown }): void;
    requestReferenceSpace(type: string): Promise<XRSpaceLike>;
    requestAnimationFrame(cb: (time: number, frame: XRFrameLike) => void): number;
    addEventListener(type: 'end', cb: () => void): void;
    end(): Promise<void>;
  }

  interface Navigator {
    xr?: {
      requestSession(
        mode: string,
        init?: { optionalFeatures?: string[] }
      ): Promise<XRSessionLike>;
    };
  }

  interface Window {
    XRWebGLLayer: new (session: XRSessionLike, gl: WebGLRenderingContext) => unknown;
  }

  interface WebGLRenderingContext {
    makeXRCompatible?(): Promise<void>;
  }
}
