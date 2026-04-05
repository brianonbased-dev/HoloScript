/**
 * FogSystem.ts
 *
 * Fog: linear, exponential, exponential-squared, and height fog.
 * Supports color blending, density maps, and animation.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type FogMode = 'linear' | 'exponential' | 'exponential2';

export interface FogConfig {
  mode: FogMode;
  color: [number, number, number];
  nearDistance: number; // Linear only
  farDistance: number; // Linear only
  density: number; // Exponential modes
  heightFog: boolean;
  heightStart: number;
  heightEnd: number;
  heightDensity: number;
  enabled: boolean;
}

// =============================================================================
// FOG SYSTEM
// =============================================================================

export class FogSystem {
  private config: FogConfig;
  private animation: { speed: number; phase: number } = { speed: 0, phase: 0 };

  constructor(config?: Partial<FogConfig>) {
    this.config = {
      mode: 'exponential',
      color: [0.7, 0.75, 0.8],
      nearDistance: 10,
      farDistance: 100,
      density: 0.02,
      heightFog: false,
      heightStart: 0,
      heightEnd: 50,
      heightDensity: 0.01,
      enabled: true,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setConfig(config: Partial<FogConfig>): void {
    Object.assign(this.config, config);
  }
  getConfig(): FogConfig {
    return { ...this.config };
  }
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ---------------------------------------------------------------------------
  // Fog Factor Calculation
  // ---------------------------------------------------------------------------

  computeFogFactor(distance: number, height?: number): number {
    if (!this.config.enabled) return 0;

    let factor: number;

    switch (this.config.mode) {
      case 'linear':
        factor = Math.max(
          0,
          Math.min(
            1,
            (this.config.farDistance - distance) /
              (this.config.farDistance - this.config.nearDistance)
          )
        );
        factor = 1 - factor; // 0 = no fog, 1 = full fog
        break;
      case 'exponential':
        factor = 1 - Math.exp(-(this.config.density * distance));
        break;
      case 'exponential2': {
        const dd = this.config.density * distance;
        factor = 1 - Math.exp(-dd * dd);
        break;
      }
    }

    // Height fog blend
    if (this.config.heightFog && height !== undefined) {
      const heightFactor = this.computeHeightFactor(height);
      factor *= heightFactor;
    }

    return Math.max(0, Math.min(1, factor));
  }

  private computeHeightFactor(height: number): number {
    if (height >= this.config.heightEnd) return 0;
    if (height <= this.config.heightStart) return 1;
    const t =
      (height - this.config.heightStart) / (this.config.heightEnd - this.config.heightStart);
    return Math.max(0, 1 - t) * (1 + this.config.heightDensity);
  }

  // ---------------------------------------------------------------------------
  // Color Blending
  // ---------------------------------------------------------------------------

  blendWithFog(
    sceneColor: [number, number, number],
    distance: number,
    height?: number
  ): [number, number, number] {
    const factor = this.computeFogFactor(distance, height);
    return [
      sceneColor[0] * (1 - factor) + this.config.color[0] * factor,
      sceneColor[1] * (1 - factor) + this.config.color[1] * factor,
      sceneColor[2] * (1 - factor) + this.config.color[2] * factor,
    ];
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  setAnimation(speed: number): void {
    this.animation.speed = speed;
  }
  update(dt: number): void {
    this.animation.phase += this.animation.speed * dt;
    if (this.animation.speed > 0) {
      this.config.density = this.config.density * (1 + 0.1 * Math.sin(this.animation.phase));
    }
  }
}

