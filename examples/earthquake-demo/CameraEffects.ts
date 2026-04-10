/**
 * Camera Effects for Earthquake Demo
 *
 * Provides camera shake, smooth transitions, and cinematic camera modes
 * for spectacular earthquake visualizations.
 *
 * @module demos/earthquake/CameraEffects
 */

import type { CameraParams } from '../../gpu/InstancedRenderer.js';

export interface CameraShakeConfig {
  /** Shake intensity (0-10) */
  intensity: number;

  /** Shake frequency in Hz */
  frequency: number;

  /** Duration in seconds */
  duration: number;

  /** Falloff curve */
  falloff: 'linear' | 'exponential' | 'none';

  /** Horizontal shake amount (0-1) */
  horizontalAmount: number;

  /** Vertical shake amount (0-1) */
  verticalAmount: number;
}

export type CameraMode = 'overview' | 'street' | 'topdown' | 'cinematic' | 'free';

export interface CameraPreset {
  /** Camera position */
  position: [number, number, number];

  /** Look-at target */
  target: [number, number, number];

  /** Field of view (radians) */
  fov: number;

  /** Name of preset */
  name: string;
}

/**
 * Camera Controller with Effects
 *
 * Manages camera positioning, shake effects, and smooth transitions
 * for earthquake demonstrations.
 */
export class CameraController {
  private currentPosition: [number, number, number];
  private currentTarget: [number, number, number];
  private currentFOV: number;

  private shakeActive: boolean = false;
  private shakeConfig: CameraShakeConfig | null = null;
  private shakeStartTime: number = 0;
  private shakeTime: number = 0;

  private transitionActive: boolean = false;
  private transitionStartPos: [number, number, number] = [0, 0, 0];
  private transitionStartTarget: [number, number, number] = [0, 0, 0];
  private transitionStartFOV: number = 0;
  private transitionTargetPos: [number, number, number] = [0, 0, 0];
  private transitionTargetTarget: [number, number, number] = [0, 0, 0];
  private transitionTargetFOV: number = 0;
  private transitionDuration: number = 0;
  private transitionTime: number = 0;

  private currentMode: CameraMode = 'overview';
  private canvas: HTMLCanvasElement;

  // Camera presets
  private presets: Map<CameraMode, CameraPreset>;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Default camera
    this.currentPosition = [30, 20, 30];
    this.currentTarget = [0, 15, 0];
    this.currentFOV = Math.PI / 4;

    // Initialize presets
    this.presets = new Map([
      [
        'overview',
        {
          position: [30, 20, 30],
          target: [0, 15, 0],
          fov: Math.PI / 4,
          name: 'Overview',
        },
      ],
      [
        'street',
        {
          position: [50, 2, 0],
          target: [0, 10, 0],
          fov: (Math.PI / 4) * 1.2,
          name: 'Street Level',
        },
      ],
      [
        'topdown',
        {
          position: [0, 80, 0.1],
          target: [0, 0, 0],
          fov: Math.PI / 6,
          name: 'Top-Down',
        },
      ],
      [
        'cinematic',
        {
          position: [40, 15, 40],
          target: [0, 20, 0],
          fov: Math.PI / 3.5,
          name: 'Cinematic',
        },
      ],
      [
        'free',
        {
          position: [30, 20, 30],
          target: [0, 15, 0],
          fov: Math.PI / 4,
          name: 'Free Camera',
        },
      ],
    ]);
  }

  /**
   * Apply earthquake shake to camera
   */
  applyEarthquakeShake(config: CameraShakeConfig): void {
    this.shakeActive = true;
    this.shakeConfig = config;
    this.shakeStartTime = performance.now();
    this.shakeTime = 0;

    console.log(`📹 Camera shake activated: intensity ${config.intensity}`);
  }

  /**
   * Stop camera shake
   */
  stopShake(): void {
    this.shakeActive = false;
    this.shakeConfig = null;
  }

  /**
   * Update camera (call every frame)
   */
  update(dt: number): void {
    // Update shake
    if (this.shakeActive && this.shakeConfig) {
      this.updateShake(dt);
    }

    // Update transitions
    if (this.transitionActive) {
      this.updateTransition(dt);
    }
  }

  /**
   * Update shake effect
   */
  private updateShake(dt: number): void {
    if (!this.shakeConfig) return;

    this.shakeTime += dt;

    // Check if shake expired
    if (this.shakeTime > this.shakeConfig.duration) {
      this.stopShake();
      return;
    }

    // Calculate falloff
    let falloffFactor = 1.0;
    const progress = this.shakeTime / this.shakeConfig.duration;

    switch (this.shakeConfig.falloff) {
      case 'linear':
        falloffFactor = 1.0 - progress;
        break;
      case 'exponential':
        falloffFactor = Math.pow(1.0 - progress, 2);
        break;
      case 'none':
        falloffFactor = 1.0;
        break;
    }

    // Generate shake offset using Perlin-like noise
    const omega = 2 * Math.PI * this.shakeConfig.frequency;
    const intensity = this.shakeConfig.intensity * falloffFactor;

    // Multi-frequency shake for realism
    const shake1 = Math.sin(omega * this.shakeTime);
    const shake2 = Math.sin(omega * this.shakeTime * 2.3) * 0.5;
    const shake3 = Math.sin(omega * this.shakeTime * 4.7) * 0.25;

    const combinedShake = (shake1 + shake2 + shake3) / 1.75;

    // Apply to camera (this will be applied in getCamera())
    // Store shake offset for use in getCamera()
    this.shakeOffset = {
      x: combinedShake * intensity * this.shakeConfig.horizontalAmount * 0.5,
      y: combinedShake * intensity * this.shakeConfig.verticalAmount * 0.3,
      z: combinedShake * intensity * this.shakeConfig.horizontalAmount * 0.5,
    };
  }

  private shakeOffset = { x: 0, y: 0, z: 0 };

  /**
   * Update camera transition
   */
  private updateTransition(dt: number): void {
    this.transitionTime += dt;

    if (this.transitionTime >= this.transitionDuration) {
      // Transition complete
      this.currentPosition = [...this.transitionTargetPos];
      this.currentTarget = [...this.transitionTargetTarget];
      this.currentFOV = this.transitionTargetFOV;
      this.transitionActive = false;
      return;
    }

    // Smooth interpolation (ease-in-out)
    const t = this.transitionTime / this.transitionDuration;
    const smoothT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // Quadratic ease-in-out

    // Interpolate position
    this.currentPosition = [
      this.lerp(this.transitionStartPos[0], this.transitionTargetPos[0], smoothT),
      this.lerp(this.transitionStartPos[1], this.transitionTargetPos[1], smoothT),
      this.lerp(this.transitionStartPos[2], this.transitionTargetPos[2], smoothT),
    ];

    // Interpolate target
    this.currentTarget = [
      this.lerp(this.transitionStartTarget[0], this.transitionTargetTarget[0], smoothT),
      this.lerp(this.transitionStartTarget[1], this.transitionTargetTarget[1], smoothT),
      this.lerp(this.transitionStartTarget[2], this.transitionTargetTarget[2], smoothT),
    ];

    // Interpolate FOV
    this.currentFOV = this.lerp(this.transitionStartFOV, this.transitionTargetFOV, smoothT);
  }

  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Transition to camera preset
   */
  transitionToPreset(mode: CameraMode, duration: number = 2.0): void {
    const preset = this.presets.get(mode);
    if (!preset) {
      console.warn(`Camera preset "${mode}" not found`);
      return;
    }

    this.transitionTo(preset.position, preset.target, preset.fov, duration);
    this.currentMode = mode;

    console.log(`📹 Transitioning to ${preset.name} camera (${duration}s)`);
  }

  /**
   * Transition to specific camera parameters
   */
  transitionTo(
    position: [number, number, number],
    target: [number, number, number],
    fov: number,
    duration: number
  ): void {
    this.transitionActive = true;
    this.transitionStartPos = [...this.currentPosition];
    this.transitionStartTarget = [...this.currentTarget];
    this.transitionStartFOV = this.currentFOV;
    this.transitionTargetPos = [...position];
    this.transitionTargetTarget = [...target];
    this.transitionTargetFOV = fov;
    this.transitionDuration = duration;
    this.transitionTime = 0;
  }

  /**
   * Set camera immediately (no transition)
   */
  setCamera(
    position: [number, number, number],
    target: [number, number, number],
    fov: number
  ): void {
    this.currentPosition = [...position];
    this.currentTarget = [...target];
    this.currentFOV = fov;
    this.transitionActive = false;
  }

  /**
   * Get current camera parameters (with shake applied)
   */
  getCamera(): CameraParams {
    // Apply shake offset
    const position: [number, number, number] = [
      this.currentPosition[0] + this.shakeOffset.x,
      this.currentPosition[1] + this.shakeOffset.y,
      this.currentPosition[2] + this.shakeOffset.z,
    ];

    return {
      position,
      target: [...this.currentTarget],
      fov: this.currentFOV,
      aspect: this.canvas.width / this.canvas.height,
      near: 0.1,
      far: 200,
    };
  }

  /**
   * Get current camera mode
   */
  getCurrentMode(): CameraMode {
    return this.currentMode;
  }

  /**
   * Get camera preset
   */
  getPreset(mode: CameraMode): CameraPreset | undefined {
    return this.presets.get(mode);
  }

  /**
   * Get all camera presets
   */
  getAllPresets(): Map<CameraMode, CameraPreset> {
    return this.presets;
  }

  /**
   * Manual camera control (for free camera mode)
   */
  moveCamera(deltaPos: [number, number, number]): void {
    this.currentPosition[0] += deltaPos[0];
    this.currentPosition[1] += deltaPos[1];
    this.currentPosition[2] += deltaPos[2];
  }

  /**
   * Rotate camera around target
   */
  orbitCamera(deltaAngle: number, deltaPitch: number): void {
    // Calculate current orbit parameters
    const dx = this.currentPosition[0] - this.currentTarget[0];
    const dy = this.currentPosition[1] - this.currentTarget[1];
    const dz = this.currentPosition[2] - this.currentTarget[2];

    const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let angle = Math.atan2(dz, dx);
    let pitch = Math.asin(dy / radius);

    // Apply deltas
    angle += deltaAngle;
    pitch += deltaPitch;

    // Clamp pitch
    pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));

    // Calculate new position
    this.currentPosition[0] = this.currentTarget[0] + radius * Math.cos(pitch) * Math.cos(angle);
    this.currentPosition[1] = this.currentTarget[1] + radius * Math.sin(pitch);
    this.currentPosition[2] = this.currentTarget[2] + radius * Math.cos(pitch) * Math.sin(angle);
  }

  /**
   * Zoom camera (adjust FOV or distance)
   */
  zoom(delta: number, adjustFOV: boolean = false): void {
    if (adjustFOV) {
      // Adjust field of view
      this.currentFOV = Math.max(Math.PI / 8, Math.min(Math.PI / 2, this.currentFOV + delta));
    } else {
      // Adjust distance from target
      const dx = this.currentPosition[0] - this.currentTarget[0];
      const dy = this.currentPosition[1] - this.currentTarget[1];
      const dz = this.currentPosition[2] - this.currentTarget[2];

      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const newDistance = Math.max(5, Math.min(100, distance + delta));

      const scale = newDistance / distance;
      this.currentPosition[0] = this.currentTarget[0] + dx * scale;
      this.currentPosition[1] = this.currentTarget[1] + dy * scale;
      this.currentPosition[2] = this.currentTarget[2] + dz * scale;
    }
  }

  /**
   * Pan camera (move target)
   */
  panCamera(deltaX: number, deltaY: number): void {
    // Calculate camera right and up vectors
    const forward = [
      this.currentTarget[0] - this.currentPosition[0],
      this.currentTarget[1] - this.currentPosition[1],
      this.currentTarget[2] - this.currentPosition[2],
    ];

    const forwardLen = Math.sqrt(forward[0] ** 2 + forward[1] ** 2 + forward[2] ** 2);
    forward[0] /= forwardLen;
    forward[1] /= forwardLen;
    forward[2] /= forwardLen;

    // Right vector (cross product with world up)
    const right = [
      forward[2], // simplified cross product
      0,
      -forward[0],
    ];

    // Up vector (cross product of forward and right)
    const up = [
      -forward[1] * right[2],
      forward[0] * right[2] - forward[2] * right[0],
      forward[1] * right[0],
    ];

    // Apply pan
    this.currentPosition[0] += right[0] * deltaX + up[0] * deltaY;
    this.currentPosition[1] += right[1] * deltaX + up[1] * deltaY;
    this.currentPosition[2] += right[2] * deltaX + up[2] * deltaY;

    this.currentTarget[0] += right[0] * deltaX + up[0] * deltaY;
    this.currentTarget[1] += right[1] * deltaX + up[1] * deltaY;
    this.currentTarget[2] += right[2] * deltaX + up[2] * deltaY;
  }
}
