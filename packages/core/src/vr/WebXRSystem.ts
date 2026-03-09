/**
 * WebXRSystem.ts
 *
 * EngineSystem adapter that wires WebXRManager into the SpatialEngine game loop.
 * Handles stereo rendering, hand tracking → physics integration, and
 * controller input mapping.
 *
 * @module vr
 */

import type { EngineSystem } from '../engine/SpatialEngine';

// =============================================================================
// TYPES
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface XRInputState {
  position: Vec3;
  rotation: Vec3;
  trigger: number; // 0-1
  grip: number; // 0-1
  thumbstick: { x: number; y: number };
  buttons: boolean[];
}

export interface XRViewState {
  eye: 'left' | 'right';
  projectionMatrix: Float32Array;
  viewMatrix: Float32Array;
  viewport: { x: number; y: number; width: number; height: number };
}

export type XRMode = 'inactive' | 'immersive-vr' | 'immersive-ar' | 'inline';

export interface XRFrameData {
  time: number;
  headPosition: Vec3;
  headRotation: Vec3;
  views: XRViewState[];
  controllers: Map<string, XRInputState>;
  hands: Map<string, Map<string, Vec3>>; // side → joint → position
}

export type XREventType =
  | 'sessionstart'
  | 'sessionend'
  | 'selectstart'
  | 'selectend'
  | 'squeezestart'
  | 'squeezeend';
export type XREventCallback = (data: {
  type: XREventType;
  inputSource?: string;
  time: number;
}) => void;

// =============================================================================
// WEBXR SYSTEM
// =============================================================================

export class WebXRSystem implements EngineSystem {
  readonly name = 'WebXR';
  readonly priority = 50; // Early — before physics needs controller input

  private mode: XRMode = 'inactive';
  private frameData: XRFrameData | null = null;
  private eventListeners: Map<XREventType, XREventCallback[]> = new Map();
  private supported = false;

  // Stereo camera matrices
  private leftEye: XRViewState | null = null;
  private rightEye: XRViewState | null = null;

  // Controller tracking
  private controllers: Map<string, XRInputState> = new Map();
  private handJoints: Map<string, Map<string, Vec3>> = new Map();

  // Physics integration callbacks
  private grabCallbacks: ((controllerId: string, position: Vec3) => void)[] = [];
  private releaseCallbacks: ((controllerId: string) => void)[] = [];

  // Locomotion
  private locomotionSpeed = 3.0; // m/s
  private teleportTarget: Vec3 | null = null;
  private playerPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private playerRotation = 0; // Y-axis radians

  // ---------------------------------------------------------------------------
  // Lifecycle (EngineSystem)
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    // Check WebXR support
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      try {
        this.supported = await (navigator as any).xr.isSessionSupported('immersive-vr');
      } catch {
        this.supported = false;
      }
    }
  }

  update(dt: number): void {
    if (this.mode === 'inactive' || !this.frameData) return;

    // Process controller inputs
    for (const [id, input] of this.controllers) {
      // Grab detection: grip button pressed
      if (input.grip > 0.8) {
        for (const cb of this.grabCallbacks) cb(id, input.position);
      }

      // Smooth locomotion via left thumbstick
      if (
        id.includes('left') &&
        (Math.abs(input.thumbstick.x) > 0.1 || Math.abs(input.thumbstick.y) > 0.1)
      ) {
        const sinR = Math.sin(this.playerRotation);
        const cosR = Math.cos(this.playerRotation);
        this.playerPosition.x +=
          (input.thumbstick.x * cosR - input.thumbstick.y * sinR) * this.locomotionSpeed * dt;
        this.playerPosition.z +=
          (input.thumbstick.x * sinR + input.thumbstick.y * cosR) * this.locomotionSpeed * dt;
      }

      // Snap turn via right thumbstick
      if (id.includes('right') && Math.abs(input.thumbstick.x) > 0.6) {
        this.playerRotation += Math.sign(input.thumbstick.x) * (Math.PI / 6); // 30° snap
      }
    }

    // Teleport execution
    if (this.teleportTarget) {
      this.playerPosition = { ...this.teleportTarget };
      this.teleportTarget = null;
    }
  }

  destroy(): void {
    this.mode = 'inactive';
    this.frameData = null;
    this.controllers.clear();
    this.handJoints.clear();
    this.eventListeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  isSupported(): boolean {
    return this.supported;
  }
  getMode(): XRMode {
    return this.mode;
  }

  /** Simulate entering VR mode (for testing without real WebXR). */
  enterVR(): void {
    this.mode = 'immersive-vr';
    this.emit('sessionstart');
  }

  /** Simulate entering AR mode. */
  enterAR(): void {
    this.mode = 'immersive-ar';
    this.emit('sessionstart');
  }

  /** Exit immersive mode. */
  exit(): void {
    const wasActive = this.mode !== 'inactive';
    this.mode = 'inactive';
    this.frameData = null;
    if (wasActive) this.emit('sessionend');
  }

  // ---------------------------------------------------------------------------
  // Frame Data Injection (from actual WebXR or mock)
  // ---------------------------------------------------------------------------

  /**
   * Submit frame data from the XR runtime.
   * In production, this is called from the XR animation frame callback.
   * In tests, this can be called manually with mock data.
   */
  submitFrame(data: XRFrameData): void {
    this.frameData = data;
    this.controllers = data.controllers;
    this.handJoints = data.hands;

    // Extract stereo views
    this.leftEye = data.views.find((v) => v.eye === 'left') ?? null;
    this.rightEye = data.views.find((v) => v.eye === 'right') ?? null;
  }

  // ---------------------------------------------------------------------------
  // Controller / Hand Queries
  // ---------------------------------------------------------------------------

  getController(id: string): XRInputState | undefined {
    return this.controllers.get(id);
  }

  getAllControllers(): Map<string, XRInputState> {
    return new Map(this.controllers);
  }

  getHandJoints(side: string): Map<string, Vec3> | undefined {
    return this.handJoints.get(side);
  }

  getHeadPosition(): Vec3 {
    return this.frameData?.headPosition ?? { x: 0, y: 0, z: 0 };
  }

  getHeadRotation(): Vec3 {
    return this.frameData?.headRotation ?? { x: 0, y: 0, z: 0 };
  }

  // ---------------------------------------------------------------------------
  // Stereo Rendering
  // ---------------------------------------------------------------------------

  getLeftEye(): XRViewState | null {
    return this.leftEye;
  }
  getRightEye(): XRViewState | null {
    return this.rightEye;
  }
  getStereoViews(): XRViewState[] {
    const views: XRViewState[] = [];
    if (this.leftEye) views.push(this.leftEye);
    if (this.rightEye) views.push(this.rightEye);
    return views;
  }

  // ---------------------------------------------------------------------------
  // Locomotion
  // ---------------------------------------------------------------------------

  getPlayerPosition(): Vec3 {
    return { ...this.playerPosition };
  }
  getPlayerRotation(): number {
    return this.playerRotation;
  }

  setLocomotionSpeed(speed: number): void {
    this.locomotionSpeed = speed;
  }

  /** Queue a teleport to a world position. Executes next frame. */
  teleportTo(target: Vec3): void {
    this.teleportTarget = { ...target };
  }

  // ---------------------------------------------------------------------------
  // Physics Integration Callbacks
  // ---------------------------------------------------------------------------

  onGrab(cb: (controllerId: string, position: Vec3) => void): void {
    this.grabCallbacks.push(cb);
  }

  onRelease(cb: (controllerId: string) => void): void {
    this.releaseCallbacks.push(cb);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  on(type: XREventType, callback: XREventCallback): void {
    if (!this.eventListeners.has(type)) this.eventListeners.set(type, []);
    this.eventListeners.get(type)!.push(callback);
  }

  off(type: XREventType, callback: XREventCallback): void {
    const list = this.eventListeners.get(type);
    if (list) {
      const idx = list.indexOf(callback);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private emit(type: XREventType, inputSource?: string): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      const event = { type, inputSource, time: performance.now() };
      for (const cb of listeners) cb(event);
    }
  }
}
