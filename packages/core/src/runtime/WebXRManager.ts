/**
 * WebXR Manager
 *
 * Manages the WebXR session lifecycle and WebGPU binding.
 * Handles:
 * - Session request/end
 * - Reference space management
 * - WebGPU Projection Layer creation
 * - Input source tracking
 */

import type { IWebGPUContext } from '../rendering/webgpu/WebGPUTypes';

// Polyfill types for WebXR + WebGPU
// These are often missing from standard @types/webxr
export interface XRWebGPUTypes {
  binding: any; // XRWebG binding
  projectionLayer: any; // XRProjectionLayer
}

// Minimal WebXR Type Definitions to satisfy TSC
export interface XRSession {
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
  requestReferenceSpace(type: string): Promise<XRReferenceSpace>;
  updateRenderState(state: any): Promise<void>;
  end(): Promise<void>;
  inputSources: XRInputSource[];
  renderState: { baseLayer?: { space: XRSpace } };
}

export interface XRReferenceSpace extends XRSpace {}
export interface XRSpace {}

export interface XRFrame {
  session: XRSession;
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | undefined;
}

export interface XRViewerPose {
  views: XRView[];
}

export interface XRView {
  transform: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
    inverse: { matrix: Float32Array };
  };
  projectionMatrix: Float32Array;
}

export interface XRInputSource {
  handedness: 'none' | 'left' | 'right';
  targetRayMode: 'gaze' | 'tracked-pointer' | 'screen';
  hand?: XRHand;
  profiles: string[];
}

export interface XRHand extends Map<string, XRJointSpace> {}
export interface XRJointSpace extends XRSpace {}

export interface XRInputSourceChangeEvent {
  session: XRSession;
  added: XRInputSource[];
  removed: XRInputSource[];
}


export interface WebXRConfig {
  features?: string[]; // e.g. ['local-floor', 'hand-tracking']
}

export class WebXRManager {
  private session: XRSession | null = null;
  private referenceSpace: XRReferenceSpace | null = null;
  private glBinding: any | null = null; // XRWebGPUTypes['binding']
  private projectionLayer: any | null = null; // XRWebGPUTypes['projectionLayer']
  private context: IWebGPUContext;
  
  public onSessionStart: ((session: XRSession) => void) | null = null;
  public onSessionEnd: (() => void) | null = null;
  public onInputSourcesChange: ((added: XRInputSource[], removed: XRInputSource[]) => void) | null = null;

  constructor(context: IWebGPUContext) {
    this.context = context;
  }

  /**
   * Check if WebXR is supported
   */
  static async isSupported(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      return await (navigator as any).xr.isSessionSupported('immersive-vr');
    }
    return false;
  }

  /**
   * Instance method to check if a specific session mode is supported.
   */
  async isSessionSupported(mode: string = 'immersive-vr'): Promise<boolean> {
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      return await (navigator as any).xr.isSessionSupported(mode);
    }
    return false;
  }

  /**
   * Trigger haptic pulse on a controller
   */
  public triggerHaptic(hand: 'left' | 'right', intensity: number, duration: number): void {
      if (!this.session) return;
      
      for (const source of this.session.inputSources) {
          if (source.handedness === hand && source.gamepad) {
              const actuators = (source.gamepad as any).hapticActuators;
              if (actuators && actuators.length > 0) {
                  actuators[0].pulse(intensity, duration);
              }
          }
      }
  }

  /**
   * Request an immersive VR session
   */
  async requestSession(config: WebXRConfig = {}): Promise<XRSession> {
    if (this.session) {
      console.warn('WebXR session already active');
      return this.session;
    }

    const sessionInit = {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'layers', ...(config.features || [])],
    };

    try {
      this.session = await (navigator as any).xr.requestSession('immersive-vr', sessionInit);
      
      // Handle session end
      this.session!.addEventListener('end', this.handleSessionEnd);
      this.session!.addEventListener('inputsourceschange', this.handleInputSourcesChange);

      // Create WebGPU Binding
      // Note: This API is experimental and varies by browser
      // We check for global constructor existence
      if (typeof XRWebGPUBinding !== 'undefined') {
         // @ts-ignore
         this.glBinding = new XRWebGPUBinding(this.session!, this.context.device);
      } else {
         console.warn('XRWebGPUBinding not found. Rendering may fail.');
      }

      // Get Reference Space
      this.referenceSpace = await this.session!.requestReferenceSpace('local-floor');

      // Create Projection Layer
      if (this.glBinding) {
        this.projectionLayer = this.glBinding.createProjectionLayer({
          colorFormat: this.context.format,
          depthStencilFormat: 'depth24plus', 
        });
        this.session!.updateRenderState({ layers: [this.projectionLayer] });
      }

      this.onSessionStart?.(this.session!);
      
      return this.session!;
    } catch (error) {
      console.error('Failed to start WebXR session:', error);
      throw error;
    }
  }

  /**
   * Set a callback to be invoked each XR frame.
   */
  setAnimationLoop(callback: ((time: number, frame: any) => void) | null): void {
    this.animationLoopCallback = callback;
    // In a real implementation, this would hook into the XR session's requestAnimationFrame
    if (this.session && callback) {
      const loop = (time: number, frame: any) => {
        if (this.animationLoopCallback) {
          this.animationLoopCallback(time, frame);
          this.session?.requestAnimationFrame?.(loop);
        }
      };
      this.session.requestAnimationFrame?.(loop);
    }
  }

  private animationLoopCallback: ((time: number, frame: any) => void) | null = null;

  /**
   * End the current session
   */
  async endSession(): Promise<void> {
    if (this.session) {
      this.animationLoopCallback = null;
      await this.session.end();
    }
  }

  /**
   * Get the current XRSession
   */
  getSession(): XRSession | null {
    return this.session;
  }

  /**
   * Get the current Reference Space
   */
  getReferenceSpace(): XRReferenceSpace | null {
    return this.referenceSpace;
  }

  /**
   * Get the WebGPU Binding
   */
  getBinding(): any {
    return this.glBinding;
  }

  /**
   * Get the active Projection Layer
   */
  getProjectionLayer(): any {
    return this.projectionLayer;
  }

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  private handleSessionEnd = () => {
    this.session = null;
    this.referenceSpace = null;
    this.glBinding = null;
    this.projectionLayer = null;
    this.onSessionEnd?.();
  };

  private handleInputSourcesChange = (event: XRInputSourceChangeEvent) => {
    this.onInputSourcesChange?.(event.added, event.removed);
  };
}
