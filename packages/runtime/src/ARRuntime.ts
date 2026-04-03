/**
 * @fileoverview ARRuntime
 * @module @holoscript/runtime
 *
 * Implements the underlying runtime hooks for WebXR Augmented Reality
 * features mapped from the HoloScript AST (e.g., @ar_beacon, @overlay).
 */

import { hasXR } from './runtime-types';

export interface ARRuntimeOptions {
  scene_id: string;
  features: {
    hit_test?: boolean;
    light_estimation?: boolean;
    plane_detection?: boolean;
    image_tracking?: boolean;
    face_tracking?: boolean;
  };
  anchors?: {
    persistent: boolean;
  };
}

export type ARTrackingState = 'inactive' | 'tracking' | 'limited' | 'not_tracking';

export class ARRuntime {
  private options: ARRuntimeOptions;
  private session: XRSession | null = null;
  private isSupported: boolean = false;
  private trackingState: ARTrackingState = 'inactive';
  private referenceSpace: XRReferenceSpace | null = null;

  constructor(options: ARRuntimeOptions) {
    this.options = options;
  }

  /**
   * Initializes the AR session checks
   */
  async initialize(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && hasXR(navigator)) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        this.isSupported = supported;
        return supported;
      } catch (err) {
        console.warn('WebXR AR detection failed:', err);
        return false;
      }
    }
    return false;
  }

  /**
   * Requests and begins the AR session with required features
   */
  async startSession(): Promise<void> {
    if (!this.isSupported) {
      throw new Error('AR is not supported on this device/browser.');
    }

    const requiredFeatures = ['local'];
    const optionalFeatures = [];

    if (this.options.features.hit_test) optionalFeatures.push('hit-test');
    if (this.options.features.plane_detection) optionalFeatures.push('plane-detection');
    if (this.options.features.image_tracking) optionalFeatures.push('image-tracking');

    if (!hasXR(navigator)) {
      throw new Error('WebXR not available');
    }

    this.session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures,
      optionalFeatures,
    });

    this.trackingState = 'tracking';

    this.session!.addEventListener('end', this.onSessionEnd.bind(this));

    this.referenceSpace = await this.session!.requestReferenceSpace('local');

    // Begin render loop (usually tied to ThreeJS/BabylonJS renderer.xr)
  }

  /**
   * Ends the AR session
   */
  async stopSession(): Promise<void> {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }

  private onSessionEnd() {
    this.trackingState = 'inactive';
    this.session = null;
    console.log('[ARRuntime] Session ended natively.');
  }

  /**
   * Sets up a callback for when an @ar_beacon is detected (image target or QR)
   */
  onBeaconDetected(beaconId: string, callback: (pose: any) => void): void {
    // In actual implementation, binds to XRImageTrackingResult
    console.log(`[ARRuntime] Listening for beacon: ${beaconId}`);
  }

  /**
   * Transitions from AR to VR or VRR mode based on @layer_shift
   */
  async triggerLayerShift(targetLayer: 'vr' | 'vrr'): Promise<void> {
    console.log(`[ARRuntime] Shifting reality to ${targetLayer} layer.`);
    await this.stopSession();
    // Hand off state to VRRRuntime or VRRuntime
  }
}
