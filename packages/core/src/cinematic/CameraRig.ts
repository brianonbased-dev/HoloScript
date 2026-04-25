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
  position: [number, number, number];
  target: [number, number, number];
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
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  shakeOffset: [number, number, number];
}

// =============================================================================
// CAMERA RIG
// =============================================================================

export class CameraRig {
  private config: CameraRigConfig;
  private state: RigState;
  private shakePresets: Map<string, ShakePreset> = new Map();
  private activeShake: { preset: ShakePreset; elapsed: number } | null = null;
  private dollyPath: Array<[number, number, number]> = [];
  private dollyT = 0;
  private craneHeight = 0;
  private craneAngle = 0;

  constructor(config?: Partial<CameraRigConfig>) {
    this.config = {
      mode: 'static',
      position: [0, 5, -10],
      target: [0, 0, 0],
      fov: 60,
      nearClip: 0.1,
      farClip: 1000,
      smoothing: 0.1,
      speed: 1,
      ...config,
    };
    this.state = {
      position: [...this.config.position],
      target: { ...this.config.target },
      fov: this.config.fov,
      shakeOffset: [0, 0, 0],
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

  setDollyPath(path: Array<[number, number, number]>): void {
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
      // static â€” no movement
    }

    // Shake
    if (this.activeShake) {
      this.activeShake.elapsed += dt;
      const { preset, elapsed } = this.activeShake;

      if (elapsed < preset.duration) {
        const decay = Math.exp(-preset.decay * elapsed);
        const t = elapsed * preset.frequency;
        this.state.shakeOffset = [
          Math.sin(t * 6.28) * preset.intensity * decay,
          Math.cos(t * 4.17) * preset.intensity * decay * 0.7,
          Math.sin(t * 3.14) * preset.intensity * decay * 0.3
        ];
      } else {
        this.state.shakeOffset = [0, 0, 0];
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

    this.state.position = [
      a[0] + (b[0] - a[0]) * frac,
      a[1] + (b[1] - a[1]) * frac,
      a[2] + (b[2] - a[2]) * frac,
    ];
  }

  private updateCrane(dt: number): void {
    const rad = (this.craneAngle * Math.PI) / 180;
    this.state.position = [
      this.config.position[0],
      this.config.position[1] + this.craneHeight,
      this.config.position[2]
    ];
    this.state.target = [
      this.config.target[0] + Math.sin(rad) * this.craneHeight,
      0,
      this.config.target[2] + Math.cos(rad) * this.craneHeight
    ];
  }

  private updateSteadicam(dt: number): void {
    const s = this.config.smoothing;
    this.state.position = [
      this.state.position[0] + (this.config.position[0] - this.state.position[0]) * s,
      this.state.position[1] + (this.config.position[1] - this.state.position[1]) * s,
      this.state.position[2] + (this.config.position[2] - this.state.position[2]) * s,
    ];
  }

  private updateHandheld(dt: number): void {
    const t = Date.now() * 0.001;
    this.state.position = [
      this.config.position[0] + Math.sin(t * 2.1) * 0.02,
      this.config.position[1] + Math.sin(t * 3.3) * 0.01,
      this.config.position[2] + Math.cos(t * 1.7) * 0.02,
    ];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getState(): RigState {
    return {
      position: [
        this.state.position[0] + this.state.shakeOffset[0],
        this.state.position[1] + this.state.shakeOffset[1],
        this.state.position[2] + this.state.shakeOffset[2],
      ],
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
