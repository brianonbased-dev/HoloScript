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
  position: { x: number; y: number; z: number };
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

export class CameraController {
  private config: CameraConfig;
  private state: CameraState;
  private target: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private orbitAngle = 0;
  private orbitPitch = 0.3;

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CAMERA, ...config };
    this.state = {
      position: { x: 0, y: 5, z: -10 },
      rotation: { pitch: 0, yaw: 0, roll: 0 },
      zoom: 1,
      fov: this.config.fov,
    };
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

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

  setTarget(x: number, y: number, z: number): void {
    this.target = { x, y, z };
  }
  getTarget(): { x: number; y: number; z: number } {
    return { ...this.target };
  }

  rotateOrbit(deltaAngle: number, deltaPitch: number): void {
    this.orbitAngle += deltaAngle * this.config.orbitSpeed;
    this.orbitPitch = Math.max(
      -1.4,
      Math.min(1.4, this.orbitPitch + deltaPitch * this.config.orbitSpeed)
    );
  }

  zoom(delta: number): void {
    this.state.zoom = Math.max(
      this.config.minZoom,
      Math.min(this.config.maxZoom, this.state.zoom + delta * this.config.zoomSpeed)
    );
  }

  moveCamera(dx: number, dy: number, dz: number): void {
    this.state.position.x += dx * this.config.freeSpeed;
    this.state.position.y += dy * this.config.freeSpeed;
    this.state.position.z += dz * this.config.freeSpeed;
  }

  setMode(mode: CameraMode): void {
    this.config.mode = mode;
  }
  getMode(): CameraMode {
    return this.config.mode;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  getState(): CameraState {
    return {
      position: { ...this.state.position },
      rotation: { ...this.state.rotation },
      zoom: this.state.zoom,
      fov: this.state.fov,
    };
  }

  setZoom(z: number): void {
    this.state.zoom = Math.max(this.config.minZoom, Math.min(this.config.maxZoom, z));
  }
  setFOV(fov: number): void {
    this.state.fov = fov;
  }
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
