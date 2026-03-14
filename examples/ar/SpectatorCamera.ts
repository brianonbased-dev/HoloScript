/**
 * SpectatorCamera.ts
 *
 * Non-XR camera system for capturing VR scenes from external viewpoints.
 * Provides orbital controls, fly-through mode, dolly zoom, screenshot capture,
 * video recording integration, and picture-in-picture mode.
 *
 * This camera operates independently of the XR headset camera, allowing
 * external observers (streamers, instructors, spectators) to view the VR
 * scene from any angle without disrupting the immersive experience.
 *
 * @module SpectatorCamera
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type SpectatorMode = 'orbital' | 'flythrough' | 'dolly' | 'follow' | 'fixed';

export interface SpectatorCameraConfig {
  /** Initial position of the camera */
  initialPosition?: Vec3;
  /** Initial look-at target */
  initialTarget?: Vec3;
  /** Field of view in degrees */
  fov?: number;
  /** Near clipping plane */
  near?: number;
  /** Far clipping plane */
  far?: number;
  /** Canvas aspect ratio (width / height) */
  aspectRatio?: number;
  /** Initial camera mode */
  mode?: SpectatorMode;
  /** Enable smooth damping on transitions */
  smoothDamping?: boolean;
  /** Damping factor (0..1, lower = smoother) */
  dampingFactor?: number;
  /** Maximum frame history for replay */
  maxFrameHistory?: number;
}

export interface OrbitalControlsConfig {
  /** Minimum orbital distance */
  minDistance: number;
  /** Maximum orbital distance */
  maxDistance: number;
  /** Minimum polar angle in radians (0 = top) */
  minPolarAngle: number;
  /** Maximum polar angle in radians (PI = bottom) */
  maxPolarAngle: number;
  /** Enable auto-rotation */
  autoRotate: boolean;
  /** Auto-rotation speed (degrees/second) */
  autoRotateSpeed: number;
  /** Enable zooming */
  enableZoom: boolean;
  /** Enable panning */
  enablePan: boolean;
  /** Rotation sensitivity */
  rotateSpeed: number;
  /** Pan sensitivity */
  panSpeed: number;
  /** Zoom sensitivity */
  zoomSpeed: number;
}

export interface FlyThroughConfig {
  /** Movement speed (units/second) */
  moveSpeed: number;
  /** Sprint multiplier */
  sprintMultiplier: number;
  /** Look sensitivity */
  lookSensitivity: number;
  /** Enable collision avoidance */
  collisionAvoidance: boolean;
  /** Collision radius */
  collisionRadius: number;
  /** Enable inertia */
  inertia: boolean;
  /** Inertia decay factor */
  inertiaDecay: number;
}

export interface DollyZoomConfig {
  /** Target object to keep at constant apparent size */
  targetPosition: Vec3;
  /** Target apparent height in viewport (0..1) */
  targetApparentSize: number;
  /** Minimum FOV during dolly zoom */
  minFov: number;
  /** Maximum FOV during dolly zoom */
  maxFov: number;
  /** Animation duration in ms */
  animationDuration: number;
}

export interface FollowConfig {
  /** Object ID or position provider to follow */
  targetId: string;
  /** Offset from target */
  offset: Vec3;
  /** Follow smoothing */
  smoothing: number;
  /** Look-at the target */
  lookAtTarget: boolean;
  /** Maintain relative orientation */
  maintainOrientation: boolean;
}

export interface ScreenshotOptions {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Image format */
  format: 'png' | 'jpeg' | 'webp';
  /** JPEG/WebP quality (0..1) */
  quality: number;
  /** Include HUD overlay */
  includeHud: boolean;
  /** Include timestamp watermark */
  includeTimestamp: boolean;
  /** Custom filename prefix */
  filenamePrefix: string;
}

export interface VideoRecordingConfig {
  /** Video width */
  width: number;
  /** Video height */
  height: number;
  /** Target framerate */
  fps: number;
  /** Video bitrate in bps */
  bitrate: number;
  /** MIME type for recording */
  mimeType: string;
  /** Maximum recording duration in seconds */
  maxDuration: number;
}

export interface PictureInPictureConfig {
  /** PiP window width */
  width: number;
  /** PiP window height */
  height: number;
  /** Position on screen */
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Margin from edges in pixels */
  margin: number;
  /** Opacity (0..1) */
  opacity: number;
  /** Border color */
  borderColor: string;
  /** Border width */
  borderWidth: number;
  /** Show controls overlay */
  showControls: boolean;
}

export interface CameraKeyframe {
  timestamp: number;
  position: Vec3;
  target: Vec3;
  fov: number;
  mode: SpectatorMode;
}

export interface CameraPath {
  name: string;
  keyframes: CameraKeyframe[];
  duration: number;
  loop: boolean;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier';
}

export interface SpectatorCameraState {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fov: number;
  mode: SpectatorMode;
  isRecording: boolean;
  isPiPActive: boolean;
  pathPlayback: { pathName: string; progress: number } | null;
}

// =============================================================================
// Event Types
// =============================================================================

export type SpectatorEventType =
  | 'mode-changed'
  | 'screenshot-captured'
  | 'recording-started'
  | 'recording-stopped'
  | 'recording-data-available'
  | 'pip-opened'
  | 'pip-closed'
  | 'path-started'
  | 'path-completed'
  | 'position-changed'
  | 'fov-changed';

export interface SpectatorEvent {
  type: SpectatorEventType;
  timestamp: number;
  data?: unknown;
}

type EventHandler = (event: SpectatorEvent) => void;

// =============================================================================
// Utility Functions
// =============================================================================

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

// =============================================================================
// SpectatorCamera
// =============================================================================

/**
 * SpectatorCamera provides a non-XR camera for observing VR scenes externally.
 *
 * Supports multiple camera modes (orbital, fly-through, dolly zoom, follow, fixed),
 * screenshot capture, video recording via MediaRecorder, and picture-in-picture
 * display for side-by-side viewing.
 */
export class SpectatorCamera {
  // Camera state
  private position: Vec3;
  private target: Vec3;
  private up: Vec3 = vec3(0, 1, 0);
  private fov: number;
  private near: number;
  private far: number;
  private aspectRatio: number;

  // Mode management
  private mode: SpectatorMode;
  private previousMode: SpectatorMode | null = null;

  // Damping
  private smoothDamping: boolean;
  private dampingFactor: number;
  private dampedPosition: Vec3;
  private dampedTarget: Vec3;
  private dampedFov: number;

  // Orbital state
  private orbitalConfig: OrbitalControlsConfig;
  private orbitalTheta: number = 0;     // azimuthal angle
  private orbitalPhi: number = Math.PI / 4;  // polar angle
  private orbitalRadius: number = 10;
  private orbitalAutoRotateAngle: number = 0;

  // Fly-through state
  private flyConfig: FlyThroughConfig;
  private flyVelocity: Vec3 = vec3(0, 0, 0);
  private flyYaw: number = 0;
  private flyPitch: number = 0;
  private isSprinting: boolean = false;

  // Dolly zoom state
  private dollyConfig: DollyZoomConfig;
  private dollyProgress: number = 0;
  private dollyStartTime: number = 0;
  private dollyStartPosition: Vec3 = vec3(0, 0, 0);
  private dollyStartFov: number = 60;
  private isDollyAnimating: boolean = false;

  // Follow state
  private followConfig: FollowConfig | null = null;
  private followTargetProvider: (() => Vec3) | null = null;

  // Path playback
  private paths: Map<string, CameraPath> = new Map();
  private activePath: CameraPath | null = null;
  private pathStartTime: number = 0;
  private pathProgress: number = 0;

  // Screenshot / Recording
  private screenshotCanvas: HTMLCanvasElement | null = null;
  private screenshotCtx: CanvasRenderingContext2D | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;
  private recordingConfig: VideoRecordingConfig;

  // Picture-in-Picture
  private pipCanvas: HTMLCanvasElement | null = null;
  private pipCtx: CanvasRenderingContext2D | null = null;
  private pipConfig: PictureInPictureConfig;
  private isPiPActive: boolean = false;

  // Frame history for replay
  private frameHistory: CameraKeyframe[] = [];
  private maxFrameHistory: number;

  // Events
  private eventHandlers: Map<SpectatorEventType, Set<EventHandler>> = new Map();

  // Render callback — called each frame to render scene from spectator viewpoint
  private renderCallback:
    | ((position: Vec3, target: Vec3, up: Vec3, fov: number, near: number, far: number) => void)
    | null = null;

  constructor(config: SpectatorCameraConfig = {}) {
    this.position = config.initialPosition ?? vec3(5, 3, 5);
    this.target = config.initialTarget ?? vec3(0, 0, 0);
    this.fov = config.fov ?? 60;
    this.near = config.near ?? 0.1;
    this.far = config.far ?? 1000;
    this.aspectRatio = config.aspectRatio ?? 16 / 9;
    this.mode = config.mode ?? 'orbital';
    this.smoothDamping = config.smoothDamping ?? true;
    this.dampingFactor = config.dampingFactor ?? 0.1;
    this.maxFrameHistory = config.maxFrameHistory ?? 3600; // ~60s at 60fps

    // Initialize damped values to match initial state
    this.dampedPosition = { ...this.position };
    this.dampedTarget = { ...this.target };
    this.dampedFov = this.fov;

    // Calculate initial orbital parameters from position
    const offset = vec3Sub(this.position, this.target);
    this.orbitalRadius = vec3Length(offset);
    this.orbitalTheta = Math.atan2(offset.x, offset.z);
    this.orbitalPhi = Math.acos(clamp(offset.y / this.orbitalRadius, -1, 1));

    // Initialize fly-through yaw/pitch from look direction
    const lookDir = vec3Normalize(vec3Sub(this.target, this.position));
    this.flyYaw = Math.atan2(lookDir.x, lookDir.z);
    this.flyPitch = Math.asin(clamp(lookDir.y, -1, 1));

    // Default sub-configs
    this.orbitalConfig = {
      minDistance: 1,
      maxDistance: 100,
      minPolarAngle: 0.1,
      maxPolarAngle: Math.PI - 0.1,
      autoRotate: false,
      autoRotateSpeed: 30,
      enableZoom: true,
      enablePan: true,
      rotateSpeed: 1.0,
      panSpeed: 1.0,
      zoomSpeed: 1.0,
    };

    this.flyConfig = {
      moveSpeed: 5,
      sprintMultiplier: 2.5,
      lookSensitivity: 0.002,
      collisionAvoidance: false,
      collisionRadius: 0.3,
      inertia: true,
      inertiaDecay: 0.9,
    };

    this.dollyConfig = {
      targetPosition: vec3(0, 0, 0),
      targetApparentSize: 0.3,
      minFov: 5,
      maxFov: 120,
      animationDuration: 2000,
    };

    this.recordingConfig = {
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 5_000_000,
      mimeType: 'video/webm;codecs=vp9',
      maxDuration: 600,
    };

    this.pipConfig = {
      width: 320,
      height: 180,
      anchor: 'bottom-right',
      margin: 16,
      opacity: 0.95,
      borderColor: '#ffffff',
      borderWidth: 2,
      showControls: true,
    };
  }

  // ===========================================================================
  // Mode Management
  // ===========================================================================

  /**
   * Get the current camera mode.
   */
  getMode(): SpectatorMode {
    return this.mode;
  }

  /**
   * Switch to a different camera mode.
   */
  setMode(mode: SpectatorMode): void {
    if (mode === this.mode) return;

    this.previousMode = this.mode;
    this.mode = mode;

    // Sync internal state to current position when switching modes
    if (mode === 'orbital') {
      const offset = vec3Sub(this.position, this.target);
      this.orbitalRadius = vec3Length(offset);
      this.orbitalTheta = Math.atan2(offset.x, offset.z);
      this.orbitalPhi = Math.acos(clamp(offset.y / this.orbitalRadius, -1, 1));
    } else if (mode === 'flythrough') {
      const lookDir = vec3Normalize(vec3Sub(this.target, this.position));
      this.flyYaw = Math.atan2(lookDir.x, lookDir.z);
      this.flyPitch = Math.asin(clamp(lookDir.y, -1, 1));
      this.flyVelocity = vec3(0, 0, 0);
    }

    this.emitEvent('mode-changed', { from: this.previousMode, to: mode });
  }

  /**
   * Return to the previous camera mode.
   */
  revertMode(): void {
    if (this.previousMode) {
      this.setMode(this.previousMode);
    }
  }

  // ===========================================================================
  // Orbital Controls
  // ===========================================================================

  /**
   * Configure orbital controls.
   */
  configureOrbital(config: Partial<OrbitalControlsConfig>): void {
    Object.assign(this.orbitalConfig, config);
  }

  /**
   * Rotate the orbital camera by delta angles (in radians).
   */
  orbitalRotate(deltaTheta: number, deltaPhi: number): void {
    this.orbitalTheta += deltaTheta * this.orbitalConfig.rotateSpeed;
    this.orbitalPhi = clamp(
      this.orbitalPhi + deltaPhi * this.orbitalConfig.rotateSpeed,
      this.orbitalConfig.minPolarAngle,
      this.orbitalConfig.maxPolarAngle,
    );
  }

  /**
   * Zoom the orbital camera by a delta distance.
   */
  orbitalZoom(delta: number): void {
    if (!this.orbitalConfig.enableZoom) return;
    this.orbitalRadius = clamp(
      this.orbitalRadius + delta * this.orbitalConfig.zoomSpeed,
      this.orbitalConfig.minDistance,
      this.orbitalConfig.maxDistance,
    );
  }

  /**
   * Pan the orbital target by a screen-space delta.
   */
  orbitalPan(deltaX: number, deltaY: number): void {
    if (!this.orbitalConfig.enablePan) return;

    const forward = vec3Normalize(vec3Sub(this.target, this.position));
    const right = vec3Normalize(vec3Cross(forward, this.up));
    const upDir = vec3Cross(right, forward);

    const panOffset = vec3Add(
      vec3Scale(right, -deltaX * this.orbitalConfig.panSpeed),
      vec3Scale(upDir, deltaY * this.orbitalConfig.panSpeed),
    );

    this.target = vec3Add(this.target, panOffset);
  }

  /**
   * Set the orbital target to a specific position.
   */
  setOrbitalTarget(target: Vec3): void {
    this.target = { ...target };
  }

  // ===========================================================================
  // Fly-Through Controls
  // ===========================================================================

  /**
   * Configure fly-through mode.
   */
  configureFlyThrough(config: Partial<FlyThroughConfig>): void {
    Object.assign(this.flyConfig, config);
  }

  /**
   * Apply movement input for fly-through mode (forward/right/up in local space).
   */
  flyMove(forward: number, right: number, up: number): void {
    const speed = this.flyConfig.moveSpeed * (this.isSprinting ? this.flyConfig.sprintMultiplier : 1);

    // Compute local axes from yaw/pitch
    const cosYaw = Math.cos(this.flyYaw);
    const sinYaw = Math.sin(this.flyYaw);
    const cosPitch = Math.cos(this.flyPitch);
    const sinPitch = Math.sin(this.flyPitch);

    const fwd = vec3(sinYaw * cosPitch, sinPitch, cosYaw * cosPitch);
    const rgt = vec3(cosYaw, 0, -sinYaw);
    const upDir = vec3(0, 1, 0);

    const acceleration = vec3Add(
      vec3Add(vec3Scale(fwd, forward * speed), vec3Scale(rgt, right * speed)),
      vec3Scale(upDir, up * speed),
    );

    if (this.flyConfig.inertia) {
      this.flyVelocity = vec3Add(
        vec3Scale(this.flyVelocity, this.flyConfig.inertiaDecay),
        vec3Scale(acceleration, 1 - this.flyConfig.inertiaDecay),
      );
    } else {
      this.flyVelocity = acceleration;
    }
  }

  /**
   * Apply look input for fly-through mode (delta mouse movement).
   */
  flyLook(deltaX: number, deltaY: number): void {
    this.flyYaw -= deltaX * this.flyConfig.lookSensitivity;
    this.flyPitch = clamp(
      this.flyPitch - deltaY * this.flyConfig.lookSensitivity,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01,
    );
  }

  /**
   * Set sprint state for fly-through mode.
   */
  setSprint(sprinting: boolean): void {
    this.isSprinting = sprinting;
  }

  // ===========================================================================
  // Dolly Zoom
  // ===========================================================================

  /**
   * Configure and start a dolly zoom animation.
   *
   * Dolly zoom (also known as "Vertigo effect") changes FOV while moving the
   * camera to keep the target at the same apparent size. Creates a surreal
   * compression/expansion of the background.
   */
  configureDollyZoom(config: Partial<DollyZoomConfig>): void {
    Object.assign(this.dollyConfig, config);
  }

  /**
   * Start a dolly zoom toward or away from the target.
   * @param direction 1 = zoom in (narrow FOV, move closer), -1 = zoom out
   */
  startDollyZoom(direction: 1 | -1): void {
    this.setMode('dolly');
    this.isDollyAnimating = true;
    this.dollyStartTime = performance.now();
    this.dollyProgress = 0;
    this.dollyStartPosition = { ...this.position };
    this.dollyStartFov = this.fov;
  }

  /**
   * Stop the dolly zoom animation.
   */
  stopDollyZoom(): void {
    this.isDollyAnimating = false;
  }

  // ===========================================================================
  // Follow Mode
  // ===========================================================================

  /**
   * Configure follow mode.
   */
  configureFollow(config: FollowConfig, targetProvider: () => Vec3): void {
    this.followConfig = config;
    this.followTargetProvider = targetProvider;
  }

  /**
   * Start following a target.
   */
  startFollow(): void {
    if (!this.followConfig || !this.followTargetProvider) {
      console.warn('[SpectatorCamera] Follow not configured. Call configureFollow() first.');
      return;
    }
    this.setMode('follow');
  }

  // ===========================================================================
  // Camera Paths
  // ===========================================================================

  /**
   * Register a named camera path for cinematic playback.
   */
  registerPath(path: CameraPath): void {
    this.paths.set(path.name, path);
  }

  /**
   * Remove a registered camera path.
   */
  removePath(name: string): void {
    this.paths.delete(name);
    if (this.activePath?.name === name) {
      this.activePath = null;
    }
  }

  /**
   * Start playback of a registered camera path.
   */
  playPath(name: string): void {
    const path = this.paths.get(name);
    if (!path) {
      console.warn(`[SpectatorCamera] Path "${name}" not found.`);
      return;
    }
    if (path.keyframes.length < 2) {
      console.warn(`[SpectatorCamera] Path "${name}" needs at least 2 keyframes.`);
      return;
    }

    this.activePath = path;
    this.pathStartTime = performance.now();
    this.pathProgress = 0;
    this.emitEvent('path-started', { pathName: name });
  }

  /**
   * Stop path playback.
   */
  stopPath(): void {
    if (this.activePath) {
      const name = this.activePath.name;
      this.activePath = null;
      this.pathProgress = 0;
      this.emitEvent('path-completed', { pathName: name, completed: false });
    }
  }

  /**
   * Get all registered path names.
   */
  getPathNames(): string[] {
    return Array.from(this.paths.keys());
  }

  // ===========================================================================
  // Screenshot Capture
  // ===========================================================================

  /**
   * Capture a screenshot from the current spectator viewpoint.
   *
   * Requires a source canvas (the WebGL/WebGPU canvas rendering the scene).
   * Returns a data URL of the captured image.
   */
  captureScreenshot(
    sourceCanvas: HTMLCanvasElement,
    options: Partial<ScreenshotOptions> = {},
  ): string {
    const opts: ScreenshotOptions = {
      width: options.width ?? sourceCanvas.width,
      height: options.height ?? sourceCanvas.height,
      format: options.format ?? 'png',
      quality: options.quality ?? 0.92,
      includeHud: options.includeHud ?? false,
      includeTimestamp: options.includeTimestamp ?? true,
      filenamePrefix: options.filenamePrefix ?? 'spectator',
    };

    // Create or reuse offscreen canvas
    if (!this.screenshotCanvas) {
      this.screenshotCanvas = document.createElement('canvas');
    }
    this.screenshotCanvas.width = opts.width;
    this.screenshotCanvas.height = opts.height;
    this.screenshotCtx = this.screenshotCanvas.getContext('2d');

    if (!this.screenshotCtx) {
      console.error('[SpectatorCamera] Failed to get 2D context for screenshot.');
      return '';
    }

    // Draw the source canvas
    this.screenshotCtx.drawImage(sourceCanvas, 0, 0, opts.width, opts.height);

    // Add timestamp watermark if requested
    if (opts.includeTimestamp) {
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
      this.screenshotCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.screenshotCtx.fillRect(opts.width - 220, opts.height - 30, 210, 24);
      this.screenshotCtx.fillStyle = '#ffffff';
      this.screenshotCtx.font = '14px monospace';
      this.screenshotCtx.fillText(timestamp, opts.width - 215, opts.height - 12);
    }

    // Add HUD overlay if requested
    if (opts.includeHud) {
      this.drawHudOverlay(this.screenshotCtx, opts.width, opts.height);
    }

    const mimeType = `image/${opts.format}`;
    const dataUrl = this.screenshotCanvas.toDataURL(mimeType, opts.quality);

    this.emitEvent('screenshot-captured', {
      width: opts.width,
      height: opts.height,
      format: opts.format,
      dataUrlLength: dataUrl.length,
    });

    return dataUrl;
  }

  /**
   * Capture and download a screenshot.
   */
  downloadScreenshot(
    sourceCanvas: HTMLCanvasElement,
    options: Partial<ScreenshotOptions> = {},
  ): void {
    const dataUrl = this.captureScreenshot(sourceCanvas, options);
    if (!dataUrl) return;

    const prefix = options.filenamePrefix ?? 'spectator';
    const ext = options.format ?? 'png';
    const timestamp = Date.now();
    const filename = `${prefix}_${timestamp}.${ext}`;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Draw a HUD overlay onto the screenshot canvas.
   */
  private drawHudOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const state = this.getState();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(10, 10, 260, 100);

    ctx.fillStyle = '#00ff88';
    ctx.font = '12px monospace';
    const lines = [
      `Mode: ${state.mode}`,
      `Pos: (${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}, ${state.position.z.toFixed(1)})`,
      `FOV: ${state.fov.toFixed(1)}`,
      `Recording: ${state.isRecording ? 'YES' : 'NO'}`,
      `PiP: ${state.isPiPActive ? 'ON' : 'OFF'}`,
    ];

    lines.forEach((line, i) => {
      ctx.fillText(line, 18, 30 + i * 18);
    });
  }

  // ===========================================================================
  // Video Recording
  // ===========================================================================

  /**
   * Configure video recording parameters.
   */
  configureRecording(config: Partial<VideoRecordingConfig>): void {
    Object.assign(this.recordingConfig, config);
  }

  /**
   * Start recording the spectator camera output.
   *
   * Captures the source canvas as a video stream using MediaRecorder API.
   */
  startRecording(sourceCanvas: HTMLCanvasElement): void {
    if (this.isRecording) {
      console.warn('[SpectatorCamera] Already recording.');
      return;
    }

    const stream = sourceCanvas.captureStream(this.recordingConfig.fps);

    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: this.recordingConfig.mimeType,
        videoBitsPerSecond: this.recordingConfig.bitrate,
      });
    } catch (err) {
      // Fallback to default mime type
      console.warn('[SpectatorCamera] Preferred MIME type unavailable, using default.');
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
        this.emitEvent('recording-data-available', { size: event.data.size });
      }
    };

    this.mediaRecorder.onstop = () => {
      this.isRecording = false;
      this.emitEvent('recording-stopped', {
        totalChunks: this.recordedChunks.length,
        totalSize: this.recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0),
      });
    };

    this.mediaRecorder.start(1000); // Collect data every second
    this.isRecording = true;

    this.emitEvent('recording-started', {
      fps: this.recordingConfig.fps,
      bitrate: this.recordingConfig.bitrate,
    });

    // Auto-stop at max duration
    if (this.recordingConfig.maxDuration > 0) {
      setTimeout(() => {
        if (this.isRecording) {
          this.stopRecording();
        }
      }, this.recordingConfig.maxDuration * 1000);
    }
  }

  /**
   * Stop recording and return the recorded video blob.
   */
  stopRecording(): Blob | null {
    if (!this.isRecording || !this.mediaRecorder) {
      return null;
    }

    this.mediaRecorder.stop();
    this.isRecording = false;

    if (this.recordedChunks.length === 0) {
      return null;
    }

    const blob = new Blob(this.recordedChunks, { type: this.recordingConfig.mimeType });
    return blob;
  }

  /**
   * Download the recorded video.
   */
  downloadRecording(filename?: string): void {
    if (this.recordedChunks.length === 0) {
      console.warn('[SpectatorCamera] No recording data available.');
      return;
    }

    const blob = new Blob(this.recordedChunks, { type: this.recordingConfig.mimeType });
    const url = URL.createObjectURL(blob);

    const name = filename ?? `spectator_recording_${Date.now()}.webm`;
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ===========================================================================
  // Picture-in-Picture
  // ===========================================================================

  /**
   * Configure picture-in-picture display.
   */
  configurePiP(config: Partial<PictureInPictureConfig>): void {
    Object.assign(this.pipConfig, config);
  }

  /**
   * Create and activate the PiP canvas overlay.
   *
   * The PiP canvas is appended to the document body and positioned as an overlay.
   * Each frame, the spectator view is drawn into this PiP canvas.
   */
  openPiP(parentElement?: HTMLElement): HTMLCanvasElement {
    if (this.isPiPActive && this.pipCanvas) {
      return this.pipCanvas;
    }

    this.pipCanvas = document.createElement('canvas');
    this.pipCanvas.width = this.pipConfig.width;
    this.pipCanvas.height = this.pipConfig.height;

    // Style the PiP overlay
    const style = this.pipCanvas.style;
    style.position = 'fixed';
    style.zIndex = '10000';
    style.opacity = String(this.pipConfig.opacity);
    style.border = `${this.pipConfig.borderWidth}px solid ${this.pipConfig.borderColor}`;
    style.borderRadius = '4px';
    style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    style.cursor = 'move';

    // Position based on anchor
    const m = `${this.pipConfig.margin}px`;
    switch (this.pipConfig.anchor) {
      case 'top-left':
        style.top = m;
        style.left = m;
        break;
      case 'top-right':
        style.top = m;
        style.right = m;
        break;
      case 'bottom-left':
        style.bottom = m;
        style.left = m;
        break;
      case 'bottom-right':
      default:
        style.bottom = m;
        style.right = m;
        break;
    }

    this.pipCtx = this.pipCanvas.getContext('2d');
    const parent = parentElement ?? document.body;
    parent.appendChild(this.pipCanvas);

    this.isPiPActive = true;
    this.emitEvent('pip-opened', {
      width: this.pipConfig.width,
      height: this.pipConfig.height,
      anchor: this.pipConfig.anchor,
    });

    return this.pipCanvas;
  }

  /**
   * Close the PiP overlay.
   */
  closePiP(): void {
    if (this.pipCanvas && this.pipCanvas.parentElement) {
      this.pipCanvas.parentElement.removeChild(this.pipCanvas);
    }
    this.pipCanvas = null;
    this.pipCtx = null;
    this.isPiPActive = false;
    this.emitEvent('pip-closed', {});
  }

  /**
   * Update the PiP canvas with the current spectator view.
   */
  updatePiP(sourceCanvas: HTMLCanvasElement): void {
    if (!this.isPiPActive || !this.pipCtx || !this.pipCanvas) return;

    this.pipCtx.drawImage(
      sourceCanvas,
      0,
      0,
      this.pipConfig.width,
      this.pipConfig.height,
    );

    // Draw mode indicator
    if (this.pipConfig.showControls) {
      this.pipCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.pipCtx.fillRect(0, 0, this.pipConfig.width, 20);
      this.pipCtx.fillStyle = '#00ff88';
      this.pipCtx.font = '11px monospace';
      this.pipCtx.fillText(`Spectator [${this.mode}]`, 6, 14);

      if (this.isRecording) {
        this.pipCtx.fillStyle = '#ff3333';
        this.pipCtx.beginPath();
        this.pipCtx.arc(this.pipConfig.width - 14, 10, 5, 0, Math.PI * 2);
        this.pipCtx.fill();
      }
    }
  }

  // ===========================================================================
  // Frame Update
  // ===========================================================================

  /**
   * Set the render callback invoked each frame with the spectator camera parameters.
   */
  setRenderCallback(
    callback: (position: Vec3, target: Vec3, up: Vec3, fov: number, near: number, far: number) => void,
  ): void {
    this.renderCallback = callback;
  }

  /**
   * Update the spectator camera. Call once per frame.
   *
   * @param deltaTime Time since last frame in seconds
   */
  update(deltaTime: number): void {
    // Update based on current mode
    switch (this.mode) {
      case 'orbital':
        this.updateOrbital(deltaTime);
        break;
      case 'flythrough':
        this.updateFlyThrough(deltaTime);
        break;
      case 'dolly':
        this.updateDollyZoom(deltaTime);
        break;
      case 'follow':
        this.updateFollow(deltaTime);
        break;
      case 'fixed':
        // Fixed mode: no automatic updates
        break;
    }

    // Update path playback (overlays on top of mode)
    if (this.activePath) {
      this.updatePathPlayback(deltaTime);
    }

    // Apply damping
    if (this.smoothDamping) {
      const t = 1 - Math.pow(1 - this.dampingFactor, deltaTime * 60);
      this.dampedPosition = vec3Lerp(this.dampedPosition, this.position, t);
      this.dampedTarget = vec3Lerp(this.dampedTarget, this.target, t);
      this.dampedFov = lerp(this.dampedFov, this.fov, t);
    } else {
      this.dampedPosition = { ...this.position };
      this.dampedTarget = { ...this.target };
      this.dampedFov = this.fov;
    }

    // Store frame in history
    this.recordFrame();

    // Invoke render callback with damped values
    if (this.renderCallback) {
      this.renderCallback(
        this.dampedPosition,
        this.dampedTarget,
        this.up,
        this.dampedFov,
        this.near,
        this.far,
      );
    }
  }

  /**
   * Update orbital mode.
   */
  private updateOrbital(deltaTime: number): void {
    // Auto-rotate
    if (this.orbitalConfig.autoRotate) {
      this.orbitalAutoRotateAngle += degToRad(this.orbitalConfig.autoRotateSpeed) * deltaTime;
      this.orbitalTheta += degToRad(this.orbitalConfig.autoRotateSpeed) * deltaTime;
    }

    // Compute position from spherical coordinates
    const sinPhi = Math.sin(this.orbitalPhi);
    const cosPhi = Math.cos(this.orbitalPhi);
    const sinTheta = Math.sin(this.orbitalTheta);
    const cosTheta = Math.cos(this.orbitalTheta);

    this.position = vec3Add(this.target, {
      x: this.orbitalRadius * sinPhi * sinTheta,
      y: this.orbitalRadius * cosPhi,
      z: this.orbitalRadius * sinPhi * cosTheta,
    });
  }

  /**
   * Update fly-through mode.
   */
  private updateFlyThrough(deltaTime: number): void {
    // Apply velocity to position
    this.position = vec3Add(this.position, vec3Scale(this.flyVelocity, deltaTime));

    // Apply inertia decay when not actively moving
    if (this.flyConfig.inertia) {
      const decay = Math.pow(this.flyConfig.inertiaDecay, deltaTime * 60);
      this.flyVelocity = vec3Scale(this.flyVelocity, decay);
    }

    // Compute target from yaw/pitch
    const cosYaw = Math.cos(this.flyYaw);
    const sinYaw = Math.sin(this.flyYaw);
    const cosPitch = Math.cos(this.flyPitch);
    const sinPitch = Math.sin(this.flyPitch);

    const lookDir = vec3(sinYaw * cosPitch, sinPitch, cosYaw * cosPitch);
    this.target = vec3Add(this.position, lookDir);
  }

  /**
   * Update dolly zoom animation.
   */
  private updateDollyZoom(_deltaTime: number): void {
    if (!this.isDollyAnimating) return;

    const elapsed = performance.now() - this.dollyStartTime;
    this.dollyProgress = clamp(elapsed / this.dollyConfig.animationDuration, 0, 1);

    // Ease in-out
    const t = this.dollyProgress < 0.5
      ? 2 * this.dollyProgress * this.dollyProgress
      : 1 - Math.pow(-2 * this.dollyProgress + 2, 2) / 2;

    // Compute target FOV and distance to maintain apparent size
    const targetFov = lerp(this.dollyStartFov, this.dollyConfig.minFov, t);
    const startDist = vec3Length(vec3Sub(this.dollyStartPosition, this.dollyConfig.targetPosition));
    const fovRatio = Math.tan(degToRad(this.dollyStartFov / 2)) / Math.tan(degToRad(targetFov / 2));
    const newDist = startDist / fovRatio;

    // Move camera along the line from target to start position
    const direction = vec3Normalize(vec3Sub(this.dollyStartPosition, this.dollyConfig.targetPosition));
    this.position = vec3Add(this.dollyConfig.targetPosition, vec3Scale(direction, newDist));
    this.target = { ...this.dollyConfig.targetPosition };
    this.fov = targetFov;

    this.emitEvent('fov-changed', { fov: this.fov });

    if (this.dollyProgress >= 1) {
      this.isDollyAnimating = false;
    }
  }

  /**
   * Update follow mode.
   */
  private updateFollow(deltaTime: number): void {
    if (!this.followConfig || !this.followTargetProvider) return;

    const targetPos = this.followTargetProvider();
    const desiredPos = vec3Add(targetPos, this.followConfig.offset);

    // Smooth follow
    const t = 1 - Math.pow(1 - this.followConfig.smoothing, deltaTime * 60);
    this.position = vec3Lerp(this.position, desiredPos, t);

    if (this.followConfig.lookAtTarget) {
      this.target = vec3Lerp(this.target, targetPos, t);
    }
  }

  /**
   * Update camera path playback.
   */
  private updatePathPlayback(_deltaTime: number): void {
    if (!this.activePath) return;

    const elapsed = performance.now() - this.pathStartTime;
    this.pathProgress = elapsed / this.activePath.duration;

    if (this.pathProgress >= 1) {
      if (this.activePath.loop) {
        this.pathStartTime = performance.now();
        this.pathProgress = 0;
      } else {
        const pathName = this.activePath.name;
        this.activePath = null;
        this.pathProgress = 0;
        this.emitEvent('path-completed', { pathName, completed: true });
        return;
      }
    }

    // Find surrounding keyframes
    const keyframes = this.activePath.keyframes;
    const totalTime = this.activePath.duration;
    const currentTime = this.pathProgress * totalTime;

    let kfIndex = 0;
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (currentTime >= keyframes[i].timestamp && currentTime < keyframes[i + 1].timestamp) {
        kfIndex = i;
        break;
      }
    }

    const kfA = keyframes[kfIndex];
    const kfB = keyframes[Math.min(kfIndex + 1, keyframes.length - 1)];
    const segmentDuration = kfB.timestamp - kfA.timestamp;
    const segmentProgress = segmentDuration > 0 ? (currentTime - kfA.timestamp) / segmentDuration : 0;

    // Apply easing
    const t = this.applyEasing(clamp(segmentProgress, 0, 1), this.activePath.easing);

    // Interpolate
    this.position = vec3Lerp(kfA.position, kfB.position, t);
    this.target = vec3Lerp(kfA.target, kfB.target, t);
    this.fov = lerp(kfA.fov, kfB.fov, t);
  }

  /**
   * Apply easing function.
   */
  private applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return 1 - (1 - t) * (1 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'cubic-bezier':
        // Approximate cubic-bezier(0.25, 0.1, 0.25, 1.0) — CSS default
        return t * t * (3 - 2 * t);
      case 'linear':
      default:
        return t;
    }
  }

  /**
   * Record the current frame to the history buffer.
   */
  private recordFrame(): void {
    this.frameHistory.push({
      timestamp: performance.now(),
      position: { ...this.dampedPosition },
      target: { ...this.dampedTarget },
      fov: this.dampedFov,
      mode: this.mode,
    });

    if (this.frameHistory.length > this.maxFrameHistory) {
      this.frameHistory.shift();
    }
  }

  // ===========================================================================
  // State & Queries
  // ===========================================================================

  /**
   * Get the current camera state.
   */
  getState(): SpectatorCameraState {
    return {
      position: { ...this.dampedPosition },
      target: { ...this.dampedTarget },
      up: { ...this.up },
      fov: this.dampedFov,
      mode: this.mode,
      isRecording: this.isRecording,
      isPiPActive: this.isPiPActive,
      pathPlayback: this.activePath
        ? { pathName: this.activePath.name, progress: this.pathProgress }
        : null,
    };
  }

  /**
   * Set the camera position directly.
   */
  setPosition(position: Vec3): void {
    this.position = { ...position };
    this.emitEvent('position-changed', { position });
  }

  /**
   * Set the camera look-at target directly.
   */
  setTarget(target: Vec3): void {
    this.target = { ...target };
  }

  /**
   * Set the field of view.
   */
  setFov(fov: number): void {
    this.fov = clamp(fov, 1, 170);
    this.emitEvent('fov-changed', { fov: this.fov });
  }

  /**
   * Set the aspect ratio.
   */
  setAspectRatio(ratio: number): void {
    this.aspectRatio = ratio;
  }

  /**
   * Get the view matrix parameters (position, target, up).
   */
  getViewParams(): { position: Vec3; target: Vec3; up: Vec3 } {
    return {
      position: { ...this.dampedPosition },
      target: { ...this.dampedTarget },
      up: { ...this.up },
    };
  }

  /**
   * Get the projection parameters.
   */
  getProjectionParams(): { fov: number; near: number; far: number; aspectRatio: number } {
    return {
      fov: this.dampedFov,
      near: this.near,
      far: this.far,
      aspectRatio: this.aspectRatio,
    };
  }

  /**
   * Get the frame history for replay or analysis.
   */
  getFrameHistory(): CameraKeyframe[] {
    return [...this.frameHistory];
  }

  /**
   * Clear the frame history.
   */
  clearFrameHistory(): void {
    this.frameHistory = [];
  }

  /**
   * Export the frame history as a CameraPath for re-playback.
   */
  exportFrameHistoryAsPath(name: string): CameraPath {
    const keyframes = this.frameHistory.map((f) => ({ ...f }));
    const duration =
      keyframes.length > 1 ? keyframes[keyframes.length - 1].timestamp - keyframes[0].timestamp : 0;

    // Normalize timestamps to start at 0
    const startTime = keyframes[0]?.timestamp ?? 0;
    keyframes.forEach((kf) => {
      kf.timestamp -= startTime;
    });

    return {
      name,
      keyframes,
      duration,
      loop: false,
      easing: 'linear',
    };
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Register an event handler.
   */
  on(event: SpectatorEventType, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => this.off(event, handler);
  }

  /**
   * Remove an event handler.
   */
  off(event: SpectatorEventType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit an event to all registered handlers.
   */
  private emitEvent(type: SpectatorEventType, data?: unknown): void {
    const event: SpectatorEvent = {
      type,
      timestamp: performance.now(),
      data,
    };

    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[SpectatorCamera] Error in event handler for "${type}":`, err);
        }
      }
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.stopPath();
    this.stopDollyZoom();
    this.closePiP();

    if (this.isRecording) {
      this.stopRecording();
    }

    this.renderCallback = null;
    this.followTargetProvider = null;
    this.paths.clear();
    this.eventHandlers.clear();
    this.frameHistory = [];
    this.recordedChunks = [];

    if (this.screenshotCanvas) {
      this.screenshotCanvas = null;
      this.screenshotCtx = null;
    }

    this.mediaRecorder = null;
  }
}
