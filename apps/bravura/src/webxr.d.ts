/**
 * Structural WebXR declarations for the Bravura room — same idiom as the
 * probe's and the engine's (loose global interfaces). Only what's used.
 */
export {};

declare global {
  interface XRVec3 {
    x: number;
    y: number;
    z: number;
  }
  interface XRRigidTransformLike {
    position: XRVec3;
    matrix: Float32Array;
    inverse: { matrix: Float32Array };
  }
  interface XRPoseLike {
    transform: XRRigidTransformLike;
  }
  interface XRJointPoseLike extends XRPoseLike {
    radius?: number;
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
  interface XRViewLike {
    projectionMatrix: Float32Array;
    transform: XRRigidTransformLike;
  }
  interface XRViewerPoseLike {
    views: XRViewLike[];
  }
  interface XRWebGLLayerLike {
    framebuffer: WebGLFramebuffer | null;
    getViewport(view: XRViewLike): { x: number; y: number; width: number; height: number };
  }
  interface XRFrameLike {
    getViewerPose(ref: XRSpaceLike): XRViewerPoseLike | null;
    getPose(space: XRSpaceLike, ref: XRSpaceLike): XRPoseLike | null;
    getJointPose?(joint: XRSpaceLike, ref: XRSpaceLike): XRJointPoseLike | null;
  }
  interface XRSessionLike {
    inputSources: XRInputSourceLike[];
    renderState: { baseLayer?: XRWebGLLayerLike };
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
