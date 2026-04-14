import type { Vector3 } from '@holoscript/core';
/**
 * VolumetricLight.ts
 *
 * Volumetric/god ray lighting: scattering computation,
 * shadow-aware shafts, intensity falloff, and ray marching.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export interface VolumetricLightConfig {
  id: string;
  position: [number, number, number];
  direction: Vector3;
  color: [number, number, number];
  intensity: number;
  scattering: number; // 0-1
  decay: number; // Intensity falloff per step
  samples: number; // Ray march samples
  maxDistance: number;
  shadowDensity: number; // 0-1
  enabled: boolean;
}

export interface VolumetricSample {
  position: [number, number, number];
  accumulated: number;
  step: number;
}

// =============================================================================
// VOLUMETRIC LIGHT
// =============================================================================

export class VolumetricLight {
  private lights: Map<string, VolumetricLightConfig> = new Map();

  // ---------------------------------------------------------------------------
  // Light Management
  // ---------------------------------------------------------------------------

  addLight(config: Partial<VolumetricLightConfig> & { id: string }): VolumetricLightConfig {
    const light: VolumetricLightConfig = {
      position: [0, 50, 0],
      direction: [0, -1, 0 ],
      color: [1, 0.95, 0.8],
      intensity: 1,
      scattering: 0.3,
      decay: 0.96,
      samples: 32,
      maxDistance: 100,
      shadowDensity: 0.5,
      enabled: true,
      ...config,
    };
    this.lights.set(light.id, light);
    return light;
  }

  removeLight(id: string): void {
    this.lights.delete(id);
  }
  getLight(id: string): VolumetricLightConfig | undefined {
    return this.lights.get(id);
  }
  getLightCount(): number {
    return this.lights.size;
  }

  // ---------------------------------------------------------------------------
  // Ray March Simulation
  // ---------------------------------------------------------------------------

  march(
    lightId: string,
    viewPos: Vector3,
    viewDir: Vector3
  ): VolumetricSample[] {
    const light = this.lights.get(lightId);
    if (!light || !light.enabled) return [];

    const samples: VolumetricSample[] = [];
    const stepSize = light.maxDistance / light.samples;
    let accumulated = 0;
    const dir = this.normalize(viewDir);

    for (let i = 0; i < light.samples; i++) {
      const t = (i + 0.5) * stepSize;
      const samplePos = [viewPos[0] + dir[0] * t, viewPos[1] + dir[1] * t, viewPos[2] + dir[2] * t, ];

      // Phase function (Henyey-Greenstein approximation)
      const toLight = [light.position[0] - samplePos[0], light.position[1] - samplePos[1], light.position[2] - samplePos[2], ];
      const dist = Math.sqrt(toLight[0] ** 2 + toLight[1] ** 2 + toLight[2] ** 2) || 1;
      const ndl = (toLight[0] * dir[0] + toLight[1] * dir[1] + toLight[2] * dir[2]) / dist;

      const g = light.scattering;
      const phase = (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * ndl, 1.5));

      const attenuation = Math.pow(light.decay, i);
      const contribution = phase * light.intensity * attenuation * stepSize;
      accumulated += contribution;

      samples.push({ position: [samplePos[0], samplePos[1], samplePos[2]], accumulated, step: i });
    }

    return samples;
  }

  // ---------------------------------------------------------------------------
  // Scattering Query
  // ---------------------------------------------------------------------------

  getScatteringAt(lightId: string, worldPos: Vector3): number {
    const light = this.lights.get(lightId);
    if (!light || !light.enabled) return 0;

    const dx = worldPos[0] - light.position[0];
    const dy = worldPos[1] - light.position[1];
    const dz = worldPos[2] - light.position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > light.maxDistance) return 0;

    const falloff = 1 - dist / light.maxDistance;
    return falloff * light.scattering * light.intensity;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private normalize(v: Vector3): Vector3 {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len ];
  }
}
