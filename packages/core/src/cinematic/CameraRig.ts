/**
 * CameraRig.ts
 *
 * Camera rigs: dolly, crane, steadicam, and shake presets
 * for cinematic camera control.
 *
 * @module cinematic
 */

// =============================================================================
// TYPES
// =============================================================================

export type RigMode = 'dolly' | 'crane' | 'steadicam' | 'static' | 'handheld';

export interface CameraRigConfig {
  mode: RigMode;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
  nearClip: number;
  farClip: number;
  smoothing: number; // 0-1
  speed: number;
}

export interface ShakePreset {
  name: string;
  intensity: number;
  frequency: number;
  duration: number;
  decay: number; // Exponential decay rate
}

export interface RigState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
  shakeOffset: { x: number; y: number; z: number };
}

// =============================================================================
// CAMERA RIG
// =============================================================================

export class CameraRig {
  private config: CameraRigConfig;
  private state: RigState;
  private shakePresets: Map<string, ShakePreset> = new Map();
  private activeShake: { preset: ShakePreset; elapsed: number } | null = null;
  private dollyPath: Array<{ x: number; y: number; z: number }> = [];
  private dollyT = 0;
  private craneHeight = 0;
  private craneAngle = 0;

  constructor(config?: Partial<CameraRigConfig>) {
    this.config = {
      mode: 'static',
      position: { x: 0, y: 5, z: -10 },
      target: { x: 0, y: 0, z: 0 },
      fov: 60,
      nearClip: 0.1,
      farClip: 1000,
      smoothing: 0.1,
      speed: 1,
      ...config,
    };
    this.state = {
      position: { ...this.config.position },
      target: { ...this.config.target },
      fov: this.config.fov,
      shakeOffset: { x: 0, y: 0, z: 0 },
    };

    // Built-in shake presets
    this.shakePresets.set('light', {
      name: 'light',
      intensity: 0.05,
      frequency: 15,
      duration: 0.3,
      decay: 5,
    });
    this.shakePresets.set('medium', {
      name: 'medium',
      intensity: 0.15,
      frequency: 20,
      duration: 0.5,
      decay: 3,
    });
    this.shakePresets.set('heavy', {
      name: 'heavy',
      intensity: 0.4,
      frequency: 25,
      duration: 0.8,
      decay: 2,
    });
    this.shakePresets.set('explosion', {
      name: 'explosion',
      intensity: 1.0,
      frequency: 30,
      duration: 1.2,
      decay: 1.5,
    });
  }

  // ---------------------------------------------------------------------------
  // Mode Configuration
  // ---------------------------------------------------------------------------

  setMode(mode: RigMode): void {
    this.config.mode = mode;
  }
  getMode(): RigMode {
    return this.config.mode;
  }

  setDollyPath(path: Array<{ x: number; y: number; z: number }>): void {
    this.dollyPath = [...path];
    this.dollyT = 0;
  }

  setCraneParams(height: number, angle: number): void {
    this.craneHeight = height;
    this.craneAngle = angle;
  }

  // ---------------------------------------------------------------------------
  // Shake
  // ---------------------------------------------------------------------------

  shake(presetName: string): void {
    const preset = this.shakePresets.get(presetName);
    if (preset) this.activeShake = { preset, elapsed: 0 };
  }

  addShakePreset(preset: ShakePreset): void {
    this.shakePresets.set(preset.name, preset);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): RigState {
    switch (this.config.mode) {
      case 'dolly':
        this.updateDolly(dt);
        break;
      case 'crane':
        this.updateCrane(dt);
        break;
      case 'steadicam':
        this.updateSteadicam(dt);
        break;
      case 'handheld':
        this.updateHandheld(dt);
        break;
      // static — no movement
    }

    // Shake
    if (this.activeShake) {
      this.activeShake.elapsed += dt;
      const { preset, elapsed } = this.activeShake;

      if (elapsed < preset.duration) {
        const decay = Math.exp(-preset.decay * elapsed);
        const t = elapsed * preset.frequency;
        this.state.shakeOffset = {
          x: Math.sin(t * 6.28) * preset.intensity * decay,
          y: Math.cos(t * 4.17) * preset.intensity * decay * 0.7,
          z: Math.sin(t * 3.14) * preset.intensity * decay * 0.3,
        };
      } else {
        this.state.shakeOffset = { x: 0, y: 0, z: 0 };
        this.activeShake = null;
      }
    }

    return this.getState();
  }

  private updateDolly(dt: number): void {
    if (this.dollyPath.length < 2) return;
    this.dollyT += (dt * this.config.speed) / 10;
    if (this.dollyT > 1) this.dollyT = 1;

    const idx = this.dollyT * (this.dollyPath.length - 1);
    const i = Math.floor(idx);
    const frac = idx - i;
    const a = this.dollyPath[Math.min(i, this.dollyPath.length - 1)];
    const b = this.dollyPath[Math.min(i + 1, this.dollyPath.length - 1)];

    this.state.position = {
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
      z: a.z + (b.z - a.z) * frac,
    };
  }

  private updateCrane(dt: number): void {
    const rad = (this.craneAngle * Math.PI) / 180;
    this.state.position = {
      ...this.config.position,
      y: this.config.position.y + this.craneHeight,
    };
    this.state.target = {
      x: this.config.target.x + Math.sin(rad) * this.craneHeight,
      y: 0,
      z: this.config.target.z + Math.cos(rad) * this.craneHeight,
    };
  }

  private updateSteadicam(dt: number): void {
    const s = this.config.smoothing;
    this.state.position = {
      x: this.state.position.x + (this.config.position.x - this.state.position.x) * s,
      y: this.state.position.y + (this.config.position.y - this.state.position.y) * s,
      z: this.state.position.z + (this.config.position.z - this.state.position.z) * s,
    };
  }

  private updateHandheld(dt: number): void {
    const t = Date.now() * 0.001;
    this.state.position = {
      x: this.config.position.x + Math.sin(t * 2.1) * 0.02,
      y: this.config.position.y + Math.sin(t * 3.3) * 0.01,
      z: this.config.position.z + Math.cos(t * 1.7) * 0.02,
    };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getState(): RigState {
    return {
      position: {
        x: this.state.position.x + this.state.shakeOffset.x,
        y: this.state.position.y + this.state.shakeOffset.y,
        z: this.state.position.z + this.state.shakeOffset.z,
      },
      target: { ...this.state.target },
      fov: this.state.fov,
      shakeOffset: { ...this.state.shakeOffset },
    };
  }

  getConfig(): CameraRigConfig {
    return { ...this.config };
  }
  getShakePresets(): string[] {
    return [...this.shakePresets.keys()];
  }
}
