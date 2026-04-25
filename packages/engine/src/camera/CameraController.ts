/**
 * CameraController.ts
 *
 * Camera modes: follow, orbit, free-look, top-down.
 * Includes smoothing, dead zones, zoom, and bounds clamping.
 *
 * @module camera
 */

import type { Vector3 } from '@holoscript/core';

// =============================================================================
// TYPES
// =============================================================================

export type CameraMode = 'follow' | 'orbit' | 'free' | 'topDown' | 'fixed';

export interface CameraState {
  position: [number, number, number];
  rotation: Vector3;
  zoom: number;
  fov: number;
}

export interface CameraConfig {
  mode: CameraMode;
  smoothing: number; // 0-1, lerp factor
  followOffset: Vector3;
  orbitDistance: number;
  orbitMinDistance: number;
  orbitMaxDistance: number;
  orbitSpeed: number;
  zoomSpeed: number;
  minZoom: number;
  maxZoom: number;
  deadZone: { x: number; y: number };
  bounds: {
    min: Vector3;
    max: Vector3;
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
  followOffset: [0, 5, -10 ],
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
  private target: Vector3 = [0, 0, 0 ];
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
   *   followOffset: [0, 3, -8 ]
   * });
   * ```
   */
  constructor(config?: Partial<CameraConfig>) {
    const merged = { ...DEFAULT_CAMERA, ...config };
    // Normalize followOffset: support both [x,y,z] arrays and {x,y,z} objects
    if (merged.followOffset && !Array.isArray(merged.followOffset)) {
      const o = merged.followOffset as unknown as { x: number; y: number; z: number };
      merged.followOffset = [o.x ?? 0, o.y ?? 0, o.z ?? 0];
    }
    // Normalize bounds: support both array and {x,y,z} object vectors
    if (merged.bounds) {
      const mn = merged.bounds.min;
      const mx = merged.bounds.max;
      if (!Array.isArray(mn)) {
        const m = mn as unknown as { x: number; y: number; z: number };
        merged.bounds = { ...merged.bounds, min: [m.x ?? 0, m.y ?? 0, m.z ?? 0] };
      }
      if (!Array.isArray(mx)) {
        const m = mx as unknown as { x: number; y: number; z: number };
        merged.bounds = { ...merged.bounds, max: [m.x ?? 0, m.y ?? 0, m.z ?? 0] };
      }
    }
    this.config = merged;
    this.state = {
      position: [0, 5, -10],
      rotation: [0, 0, 0],
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
    const desiredX = this.target[0] + off[0];
    const desiredY = this.target[1] + off[1];
    const desiredZ = this.target[2] + off[2];

    // Dead zone check
    const dx = Math.abs(this.target[0] - this.state.position[0] + off[0]);
    const dy = Math.abs(this.target[1] - this.state.position[1] + off[1]);
    const dz = this.config.deadZone;
    if (dx < dz.x && dy < dz.y) return;

    const s = 1 - Math.pow(1 - this.config.smoothing, dt * 60);
    this.state.position[0] = this.lerp(this.state.position[0], desiredX, s);
    this.state.position[1] = this.lerp(this.state.position[1], desiredY, s);
    this.state.position[2] = this.lerp(this.state.position[2], desiredZ, s);
  }

  private updateOrbit(_dt: number): void {
    const d = this.config.orbitDistance * this.state.zoom;
    this.state.position[0] =
      this.target[0] + Math.sin(this.orbitAngle) * Math.cos(this.orbitPitch) * d;
    this.state.position[1] = this.target[1] + Math.sin(this.orbitPitch) * d;
    this.state.position[2] =
      this.target[2] + Math.cos(this.orbitAngle) * Math.cos(this.orbitPitch) * d;
    this.state.rotation[1] = this.orbitAngle; // yaw
    this.state.rotation[0] = -this.orbitPitch; // pitch
  }

  private updateTopDown(_dt: number): void {
    const height = 20 * this.state.zoom;
    const s = 1 - Math.pow(1 - this.config.smoothing, 1);
    this.state.position[0] = this.lerp(this.state.position[0], this.target[0], s);
    this.state.position[1] = height;
    this.state.position[2] = this.lerp(this.state.position[2], this.target[2], s);
    this.state.rotation[0] = -Math.PI / 2; // pitch
    this.state.rotation[1] = 0; // yaw
  }

  private clampToBounds(): void {
    const b = this.config.bounds!;
    this.state.position[0] = Math.max(b.min[0], Math.min(b.max[0], this.state.position[0]));
    this.state.position[1] = Math.max(b.min[1], Math.min(b.max[1], this.state.position[1]));
    this.state.position[2] = Math.max(b.min[2], Math.min(b.max[2], this.state.position[2]));
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
   * camera.setTarget(player[0], player[1], player[2]);
   * ```
   */
  setTarget(x: number, y: number, z: number): void {
    this.target = [x, y, z];
  }

  /**
   * Gets the current target position.
   *
   * @returns Copy of the current target coordinates
   */
  getTarget(): Vector3 {
    return [this.target[0], this.target[1], this.target[2]];
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
    this.state.position[0] += dx * this.config.freeSpeed;
    this.state.position[1] += dy * this.config.freeSpeed;
    this.state.position[2] += dz * this.config.freeSpeed;
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
      position: [...this.state.position] as Vector3,
      rotation: [...this.state.rotation ] as Vector3,
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
