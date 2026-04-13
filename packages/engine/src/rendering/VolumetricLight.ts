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
  direction: { x: number; y: number; z: number };
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
      direction: { x: 0, y: -1, z: 0 },
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
    viewPos: { x: number; y: number; z: number },
    viewDir: { x: number; y: number; z: number }
  ): VolumetricSample[] {
    const light = this.lights.get(lightId);
    if (!light || !light.enabled) return [];

    const samples: VolumetricSample[] = [];
    const stepSize = light.maxDistance / light.samples;
    let accumulated = 0;
    const dir = this.normalize(viewDir);

    for (let i = 0; i < light.samples; i++) {
      const t = (i + 0.5) * stepSize;
      const samplePos = {
        x: viewPos.x + dir.x * t,
        y: viewPos.y + dir.y * t,
        z: viewPos.z + dir.z * t,
      };

      // Phase function (Henyey-Greenstein approximation)
      const toLight = {
        x: light.position.x - samplePos.x,
        y: light.position.y - samplePos.y,
        z: light.position.z - samplePos.z,
      };
      const dist = Math.sqrt(toLight.x ** 2 + toLight.y ** 2 + toLight.z ** 2) || 1;
      const ndl = (toLight.x * dir.x + toLight.y * dir.y + toLight.z * dir.z) / dist;

      const g = light.scattering;
      const phase = (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * ndl, 1.5));

      const attenuation = Math.pow(light.decay, i);
      const contribution = phase * light.intensity * attenuation * stepSize;
      accumulated += contribution;

      samples.push({ position: samplePos, accumulated, step: i });
    }

    return samples;
  }

  // ---------------------------------------------------------------------------
  // Scattering Query
  // ---------------------------------------------------------------------------

  getScatteringAt(lightId: string, worldPos: { x: number; y: number; z: number }): number {
    const light = this.lights.get(lightId);
    if (!light || !light.enabled) return 0;

    const dx = worldPos.x - light.position.x;
    const dy = worldPos.y - light.position.y;
    const dz = worldPos.z - light.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > light.maxDistance) return 0;

    const falloff = 1 - dist / light.maxDistance;
    return falloff * light.scattering * light.intensity;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
}
