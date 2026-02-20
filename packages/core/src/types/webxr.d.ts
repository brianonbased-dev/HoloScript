/**
 * Minimal WebXR type declarations for HoloScript
 *
 * Covers the subset of WebXR types used in the codebase.
 * For full WebXR types, install @types/webxr.
 */

interface XRSession extends EventTarget {
  renderState: XRRenderState;
  inputSources: XRInputSourceArray;
  requestAnimationFrame(callback: XRFrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  end(): Promise<void>;
  updateRenderState(stateInit?: XRRenderStateInit): void;
  requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions): void;
}

interface XRRenderState {
  baseLayer?: XRWebGLLayer;
  depthFar?: number;
  depthNear?: number;
  inlineVerticalFieldOfView?: number;
}

interface XRRenderStateInit {
  baseLayer?: XRWebGLLayer;
  depthFar?: number;
  depthNear?: number;
  inlineVerticalFieldOfView?: number;
  layers?: XRLayer[];
}

interface XRFrame {
  session: XRSession;
  getPose(space: XRSpace, baseSpace: XRSpace): XRPose | null;
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | null;
  getHitTestResults(hitTestSource: XRHitTestSource): XRHitTestResult[];
}

interface XRPose {
  transform: XRRigidTransform;
  linearVelocity?: DOMPointReadOnly;
  angularVelocity?: DOMPointReadOnly;
}

interface XRViewerPose extends XRPose {
  views: ReadonlyArray<XRView>;
}

interface XRView {
  eye: XREye;
  projectionMatrix: Float32Array;
  transform: XRRigidTransform;
  recommendedViewportScale?: number;
}

interface XRRigidTransform {
  position: DOMPointReadOnly;
  orientation: DOMPointReadOnly;
  matrix: Float32Array;
  inverse: XRRigidTransform;
}

interface XRSpace extends EventTarget {}

interface XRReferenceSpace extends XRSpace {
  getOffsetReferenceSpace(originOffset: XRRigidTransform): XRReferenceSpace;
}

interface XRBoundedReferenceSpace extends XRReferenceSpace {
  boundsGeometry: ReadonlyArray<DOMPointReadOnly>;
}

interface XRWebGLLayer {
  framebuffer: WebGLFramebuffer | null;
  framebufferWidth: number;
  framebufferHeight: number;
  getViewport(view: XRView): XRViewport | null;
}

interface XRViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface XRLayer {}

interface XRHitTestSource {
  cancel(): void;
}

interface XRHitTestResult {
  getPose(baseSpace: XRSpace): XRPose | null;
}

interface XRInputSource {
  handedness: XRHandedness;
  targetRayMode: XRTargetRayMode;
  targetRaySpace: XRSpace;
  gripSpace?: XRSpace;
  profiles: string[];
  hand?: XRHand;
  gamepad?: Gamepad;
}

interface XRInputSourceArray extends Iterable<XRInputSource> {
  length: number;
  [index: number]: XRInputSource;
  forEach(callbackfn: (value: XRInputSource, index: number, array: XRInputSourceArray) => void): void;
}

interface XRHand extends Iterable<XRJointSpace> {
  readonly size: number;
  get(joint: XRHandJoint): XRJointSpace | undefined;
}

interface XRJointSpace extends XRSpace {}

interface XRFrameRequestCallback {
  (time: DOMHighResTimeStamp, frame: XRFrame): void;
}

declare class XRWebGPUBinding {
  constructor(session: XRSession, device: GPUDevice);
  getViewSubImage(layer: XRProjectionLayer, view: XRView): XRWebGPUSubImage;
  createProjectionLayer(init?: XRProjectionLayerInit): XRProjectionLayer;
}

interface XRProjectionLayer extends XRLayer {
  fixedFoveation: number | null;
}

interface XRProjectionLayerInit {
  colorFormat?: number;
  depthFormat?: number;
  scaleFactor?: number;
}

interface XRWebGPUSubImage {
  colorTexture: GPUTexture;
  depthStencilTexture?: GPUTexture;
  motionVectorTexture?: GPUTexture;
  viewport: XRViewport;
}

type XREye = 'none' | 'left' | 'right';
type XRHandedness = 'none' | 'left' | 'right';
type XRTargetRayMode = 'gaze' | 'tracked-pointer' | 'screen' | 'transient-pointer';
type XRReferenceSpaceType = 'bounded-floor' | 'local' | 'local-floor' | 'unbounded' | 'viewer';
type XRHandJoint = string;
