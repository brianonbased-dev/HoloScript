/**
 * CameraController.ts
 *
 * Camera modes: follow, orbit, free-look, top-down.
 * Includes smoothing, dead zones, zoom, and bounds clamping.
 *
 * @module camera
 */

// =============================================================================
// TYPES
// =============================================================================

export type CameraMode = 'follow' | 'orbit' | 'free' | 'topDown' | 'fixed';

export interface CameraState {
  position: [number, number, number];
  rotation: { pitch: number; yaw: number; roll: number };
  zoom: number;
  fov: number;
}

export interface CameraConfig {
  mode: CameraMode;
  smoothing: number; // 0-1, lerp factor
  followOffset: { x: number; y: number; z: number };
  orbitDistance: number;
  orbitMinDistance: number;
  orbitMaxDistance: number;
  orbitSpeed: number;
  zoomSpeed: number;
  minZoom: number;
  maxZoom: number;
  deadZone: { x: number; y: number };
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  } | null;
  fov: number;
  freeSpeed: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_CAMERA: CameraConfig = {
  mode: 'follow',
  smoothing: 0.1,
  followOffset: { x: 0, y: 5, z: -10 },
  orbitDistance: 10,
  orbitMinDistance: 2,
  orbitMaxDistance: 50,
  orbitSpeed: 2,
  zoomSpeed: 1,
  minZoom: 0.5,
  maxZoom: 5,
  deadZone: { x: 0, y: 0 },
  bounds: null,
  fov: 60,
  freeSpeed: 10,
};

// =============================================================================
// CAMERA CONTROLLER
// =============================================================================

/**
 * Camera controller for managing various camera behaviors in 3D space.
 *
 * Supports multiple camera modes:
 * - **follow**: Camera smoothly follows a target with configurable offset and dead zone
 * - **orbit**: Camera orbits around a target point at configurable distance and speed
 * - **free**: Camera movement controlled externally via moveCamera() calls
 * - **topDown**: Camera maintains a top-down view of the target with smooth tracking
 * - **fixed**: Camera remains stationary at its current position
 *
 * The controller handles smooth interpolation, zoom controls, boundary clamping,
 * and provides a unified interface for camera state management across different modes.
 *
 * @example
 * ```typescript
 * const camera = new CameraController({
 *   mode: 'orbit',
 *   orbitDistance: 15,
 *   smoothing: 0.1
 * });
 *
 * camera.setTarget(5, 0, 5);
 * camera.rotateOrbit(0.1, 0);
 * camera.update(deltaTime);
 *
 * const state = camera.getState();
 * console.log(state.position); // Current camera position
 * ```
 */
export class CameraController {
  private config: CameraConfig;
  private state: CameraState;
  private target: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private orbitAngle = 0;
  private orbitPitch = 0.3;

  /**
   * Creates a new camera controller with optional configuration.
   *
   * @param config - Optional camera configuration overrides. Merged with defaults.
   * @example
   * ```typescript
   * const camera = new CameraController({
   *   mode: 'follow',
   *   smoothing: 0.2,
   *   followOffset: { x: 0, y: 3, z: -8 }
   * });
   * ```
   */
  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CAMERA, ...config };
    this.state = {
      position: [0, 5, -10],
      rotation: { pitch: 0, yaw: 0, roll: 0 },
      zoom: 1,
      fov: this.config.fov,
    };
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Updates camera position and rotation based on current mode and delta time.
   *
   * Call this every frame to animate camera movement. Different modes handle
   * updates differently:
   * - **follow**: Smoothly interpolates toward target + offset
   * - **orbit**: Updates position based on orbit angle and pitch
   * - **topDown**: Maintains overhead view with smooth target tracking
   * - **free/fixed**: No automatic movement (controlled externally)
   *
   * @param dt - Delta time in seconds since last update
   * @example
   * ```typescript
   * // In game loop
   * const deltaTime = (now - lastTime) / 1000;
   * camera.update(deltaTime);
   * ```
   */
  update(dt: number): void {
    switch (this.config.mode) {
      case 'follow':
        this.updateFollow(dt);
        break;
      case 'orbit':
        this.updateOrbit(dt);
        break;
      case 'free':
        break; // Controlled externally via moveCamera
      case 'topDown':
        this.updateTopDown(dt);
        break;
      case 'fixed':
        break;
    }

    if (this.config.bounds) this.clampToBounds();
  }

  private updateFollow(dt: number): void {
    const off = this.config.followOffset;
    const desiredX = this.target.x + off.x;
    const desiredY = this.target.y + off.y;
    const desiredZ = this.target.z + off.z;

    // Dead zone check
    const dx = Math.abs(this.target.x - this.state.position.x + off.x);
    const dy = Math.abs(this.target.y - this.state.position.y + off.y);
    const dz = this.config.deadZone;
    if (dx < dz.x && dy < dz.y) return;

    const s = 1 - Math.pow(1 - this.config.smoothing, dt * 60);
    this.state.position.x = this.lerp(this.state.position.x, desiredX, s);
    this.state.position.y = this.lerp(this.state.position.y, desiredY, s);
    this.state.position.z = this.lerp(this.state.position.z, desiredZ, s);
  }

  private updateOrbit(_dt: number): void {
    const d = this.config.orbitDistance * this.state.zoom;
    this.state.position.x =
      this.target.x + Math.sin(this.orbitAngle) * Math.cos(this.orbitPitch) * d;
    this.state.position.y = this.target.y + Math.sin(this.orbitPitch) * d;
    this.state.position.z =
      this.target.z + Math.cos(this.orbitAngle) * Math.cos(this.orbitPitch) * d;
    this.state.rotation.yaw = this.orbitAngle;
    this.state.rotation.pitch = -this.orbitPitch;
  }

  private updateTopDown(_dt: number): void {
    const height = 20 * this.state.zoom;
    const s = 1 - Math.pow(1 - this.config.smoothing, 1);
    this.state.position.x = this.lerp(this.state.position.x, this.target.x, s);
    this.state.position.y = height;
    this.state.position.z = this.lerp(this.state.position.z, this.target.z, s);
    this.state.rotation.pitch = -Math.PI / 2;
    this.state.rotation.yaw = 0;
  }

  private clampToBounds(): void {
    const b = this.config.bounds!;
    this.state.position.x = Math.max(b.min.x, Math.min(b.max.x, this.state.position.x));
    this.state.position.y = Math.max(b.min.y, Math.min(b.max.y, this.state.position.y));
    this.state.position.z = Math.max(b.min.z, Math.min(b.max.z, this.state.position.z));
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  /**
   * Sets the target point that the camera should focus on or track.
   *
   * Used by 'follow', 'orbit', and 'topDown' modes. In 'follow' mode, camera
   * maintains offset from this target. In 'orbit' mode, camera rotates around
   * this point. In 'topDown' mode, camera looks down at this location.
   *
   * @param x - Target X coordinate in world space
   * @param y - Target Y coordinate in world space
   * @param z - Target Z coordinate in world space
   * @example
   * ```typescript
   * // Track a moving player
   * camera.setTarget(player.x, player.y, player.z);
   * ```
   */
  setTarget(x: number, y: number, z: number): void {
    this.target = { x, y, z };
  }

  /**
   * Gets the current target position.
   *
   * @returns Copy of the current target coordinates
   */
  getTarget(): { x: number; y: number; z: number } {
    return { ...this.target };
  }

  /**
   * Rotates the camera in orbit mode by the specified angles.
   *
   * Only affects camera behavior when mode is set to 'orbit'. Angles are
   * clamped to prevent the camera from flipping or going too extreme.
   *
   * @param deltaAngle - Horizontal rotation change (yaw) in radians
   * @param deltaPitch - Vertical rotation change (pitch) in radians, clamped to [-1.4, 1.4]
   * @example
   * ```typescript
   * // Rotate based on mouse movement
   * camera.rotateOrbit(mouseX * 0.01, mouseY * 0.01);
   * ```
   */
  rotateOrbit(deltaAngle: number, deltaPitch: number): void {
    this.orbitAngle += deltaAngle * this.config.orbitSpeed;
    this.orbitPitch = Math.max(
      -1.4,
      Math.min(1.4, this.orbitPitch + deltaPitch * this.config.orbitSpeed)
    );
  }

  /**
   * Adjusts camera zoom by the specified delta amount.
   *
   * Zoom affects distance in 'orbit' mode, height in 'topDown' mode, and FOV scaling.
   * Value is clamped between configured minZoom and maxZoom limits.
   *
   * @param delta - Amount to change zoom by (positive = zoom in, negative = zoom out)
   * @example
   * ```typescript
   * // Zoom in on mouse wheel
   * camera.zoom(-wheelDelta * 0.1);
   * ```
   */
  zoom(delta: number): void {
    this.state.zoom = Math.max(
      this.config.minZoom,
      Math.min(this.config.maxZoom, this.state.zoom + delta * this.config.zoomSpeed)
    );
  }

  /**
   * Directly moves camera position by specified amounts.
   *
   * Primarily used in 'free' camera mode for manual camera control.
   * Movement is scaled by the configured freeSpeed multiplier.
   *
   * @param dx - Change in X position (world units)
   * @param dy - Change in Y position (world units)
   * @param dz - Change in Z position (world units)
   * @example
   * ```typescript
   * // WASD movement in free camera mode
   * if (wPressed) camera.moveCamera(0, 0, 1);
   * if (sPressed) camera.moveCamera(0, 0, -1);
   * ```
   */
  moveCamera(dx: number, dy: number, dz: number): void {
    this.state.position.x += dx * this.config.freeSpeed;
    this.state.position.y += dy * this.config.freeSpeed;
    this.state.position.z += dz * this.config.freeSpeed;
  }

  /**
   * Changes the camera's behavior mode.
   *
   * @param mode - New camera mode ('follow' | 'orbit' | 'free' | 'topDown' | 'fixed')
   * @example
   * ```typescript
   * camera.setMode('orbit'); // Switch to orbital camera
   * ```
   */
  setMode(mode: CameraMode): void {
    this.config.mode = mode;
  }

  /**
   * Gets the current camera mode.
   *
   * @returns Current camera mode
   */
  getMode(): CameraMode {
    return this.config.mode;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /**
   * Gets a copy of the current camera state.
   *
   * Returns position, rotation, zoom, and FOV values. All objects are cloned
   * to prevent external modification of internal state.
   *
   * @returns Current camera state with position, rotation, zoom, and FOV
   * @example
   * ```typescript
   * const state = camera.getState();
   * renderer.setCamera(state.position, state.rotation);
   * renderer.setFOV(state.fov);
   * ```
   */
  getState(): CameraState {
    return {
      position: { ...this.state.position },
      rotation: { ...this.state.rotation },
      zoom: this.state.zoom,
      fov: this.state.fov,
    };
  }

  /**
   * Directly sets the camera zoom level.
   *
   * Unlike zoom(), this sets an absolute value rather than a delta.
   * Value is clamped to configured min/max zoom limits.
   *
   * @param z - New zoom level (clamped to minZoom/maxZoom)
   * @example
   * ```typescript
   * camera.setZoom(1.0); // Reset to default zoom
   * ```
   */
  setZoom(z: number): void {
    this.state.zoom = Math.max(this.config.minZoom, Math.min(this.config.maxZoom, z));
  }

  /**
   * Sets the camera's field of view.
   *
   * @param fov - New field of view in degrees
   * @example
   * ```typescript
   * camera.setFOV(90); // Wide angle
   * camera.setFOV(30); // Telephoto
   * ```
   */
  setFOV(fov: number): void {
    this.state.fov = fov;
  }

  /**
   * Adjusts camera smoothing factor for interpolated movement modes.
   *
   * Affects 'follow' and 'topDown' modes. Higher values = more responsive,
   * lower values = smoother but more delayed movement.
   *
   * @param s - Smoothing factor between 0.0 (no movement) and 1.0 (instant)
   * @example
   * ```typescript
   * camera.setSmoothing(0.1); // Very smooth
   * camera.setSmoothing(0.8); // Very responsive
   * ```
   */
  setSmoothing(s: number): void {
    this.config.smoothing = Math.max(0, Math.min(1, s));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}
