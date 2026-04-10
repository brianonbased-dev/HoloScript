/**
 * WebXR Manager
 *
 * Handles VR session management, reference spaces, and the main XR loop.
 */

export class WebXRManager {
  private session: XRSession | null = null;
  private referenceSpace: XRReferenceSpace | null = null;
  private localReferenceSpace: XRReferenceSpace | null = null;
  private glContext: GPUCanvasContext | null = null;

  // Callback for the render loop
  private onFrameCallback: ((time: number, frame: XRFrame) => void) | null = null;

  // Callbacks for session state
  public onSessionStart: ((session: XRSession) => void) | null = null;
  public onSessionEnd: (() => void) | null = null;

  constructor(context?: any) {
    if (context) {
      this.glContext = context;
    }
  }

  /**
   * Check if VR is supported
   */
  async isSessionSupported(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      return (
        navigator as unknown as { xr: { isSessionSupported(mode: string): Promise<boolean> } }
      ).xr.isSessionSupported('immersive-vr');
    }
    return false;
  }

  /**
   * Request an immersive VR session
   */
  async requestSession(): Promise<XRSession> {
    if (!this.session) {
      const sessionInit = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
      this.session = await (
        navigator as unknown as {
          xr: { requestSession(mode: string, init: Record<string, unknown>): Promise<XRSession> };
        }
      ).xr.requestSession('immersive-vr', sessionInit);

      this.session!.addEventListener('end', this.onSessionEnded);

      // Setup reference spaces
      this.referenceSpace = await this.session!.requestReferenceSpace('local-floor');
      this.localReferenceSpace = await this.session!.requestReferenceSpace('local');

      if (this.onSessionStart) {
        this.onSessionStart(this.session!);
      }

      return this.session!;
    }
    return this.session;
  }

  /**
   * End the current session
   */
  async endSession(): Promise<void> {
    if (this.session) {
      await this.session.end();
    }
  }

  private onSessionEnded = () => {
    this.session = null;
    this.referenceSpace = null;
    this.localReferenceSpace = null;

    if (this.onSessionEnd) {
      this.onSessionEnd();
    }
  };

  /**
   * Start the XR render loop
   */
  setAnimationLoop(callback: (time: number, frame: XRFrame) => void): void {
    this.onFrameCallback = callback;
    if (this.session) {
      this.session.requestAnimationFrame(this.onXRFrame);
    }
  }

  private onXRFrame = (time: number, frame: XRFrame) => {
    if (!this.session) return; // Session ended

    // Queue next frame *before* callback to ensure loop continues even if callback errors
    // (Standard pattern, though frame requests usually happen at start)
    const session = frame.session;
    session.requestAnimationFrame(this.onXRFrame);

    if (this.onFrameCallback) {
      this.onFrameCallback(time, frame);
    }
  };

  /**
   * Get the current reference space (prefer local-floor)
   */
  getReferenceSpace(): XRReferenceSpace | null {
    return this.referenceSpace || this.localReferenceSpace;
  }

  getSession(): XRSession | null {
    return this.session;
  }
}
