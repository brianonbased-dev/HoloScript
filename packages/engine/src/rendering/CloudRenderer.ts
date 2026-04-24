import type { Vector3 } from '@holoscript/core';
/**
 * CloudRenderer.ts
 *
 * Noise-based cloud rendering: layered cloud generation,
 * wind drift, density thresholds, lighting, and coverage control.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CloudConfig {
  coverage: number; // 0-1
  density: number; // Multiplier
  altitude: number; // Base cloud height
  thickness: number; // Cloud layer thickness
  windSpeed: { x: number; z: number };
  lightColor: [number, number, number];
  ambientColor: [number, number, number];
  lightDirection: Vector3;
  noiseScale: number;
  detailScale: number;
  layers: number; // Noise octaves
}

export interface CloudSample {
  position: [number, number, number] & { x: number; y: number; z: number };
  density: number;
  lighting: number;
}

// =============================================================================
// CLOUD RENDERER
// =============================================================================

export class CloudRenderer {
  private config: CloudConfig;
  private time = 0;

  constructor(config?: Partial<CloudConfig>) {
    this.config = {
      coverage: 0.5,
      density: 1,
      altitude: 200,
      thickness: 50,
      windSpeed: { x: 5, z: 2 },
      lightColor: [1, 0.95, 0.85],
      ambientColor: [0.4, 0.45, 0.55],
      lightDirection: [0.3, -0.8, 0.5 ],
      noiseScale: 0.002,
      detailScale: 0.01,
      layers: 4,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setConfig(config: Partial<CloudConfig>): void {
    Object.assign(this.config, config);
  }
  getConfig(): CloudConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // Update (wind drift)
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
  }

  // ---------------------------------------------------------------------------
  // Density Sampling
  // ---------------------------------------------------------------------------

  sampleDensity(x: number, y: number, z: number): number {
    // Height falloff
    const relY = y - this.config.altitude;
    if (relY < 0 || relY > this.config.thickness) return 0;

    const heightFactor =
      1 - Math.abs(relY - this.config.thickness / 2) / (this.config.thickness / 2);

    // Wind offset
    const wx = x + this.config.windSpeed.x * this.time;
    const wz = z + this.config.windSpeed.z * this.time;

    // Layered noise (approximated with sin-based pseudo noise)
    let noise = 0;
    let amplitude = 1;
    let frequency = this.config.noiseScale;
    for (let i = 0; i < this.config.layers; i++) {
      noise += amplitude * this.pseudoNoise(wx * frequency, wz * frequency);
      amplitude *= 0.5;
      frequency *= 2;
    }

    // Apply coverage and density
    const density =
      Math.max(0, noise - (1 - this.config.coverage)) * this.config.density * heightFactor;
    return density;
  }

  // ---------------------------------------------------------------------------
  // Lighting
  // ---------------------------------------------------------------------------

  sampleLighting(x: number, y: number, z: number, steps = 4): CloudSample {
    const density = this.sampleDensity(x, y, z);

    // Simple light march toward light direction
    let transmittance = 1;
    const ld = this.config.lightDirection;
    const stepSize = this.config.thickness / steps;

    for (let i = 1; i <= steps; i++) {
      const sx = x + ld[0] * stepSize * i;
      const sy = y + ld[1] * stepSize * i;
      const sz = z + ld[2] * stepSize * i;
      const d = this.sampleDensity(sx, sy, sz);
      transmittance *= Math.exp(-d * stepSize * 0.1);
    }

    const position = [x, y, z] as [number, number, number] & { x: number; y: number; z: number };
    Object.defineProperty(position, 'x', { value: x, enumerable: false });
    Object.defineProperty(position, 'y', { value: y, enumerable: false });
    Object.defineProperty(position, 'z', { value: z, enumerable: false });

    return {
      position,
      density,
      lighting: transmittance,
    };
  }

  // ---------------------------------------------------------------------------
  // Pseudo-noise (deterministic, sin-based)
  // ---------------------------------------------------------------------------

  private pseudoNoise(x: number, z: number): number {
    const dot = x * 12.9898 + z * 78.233;
    return (Math.sin(dot) * 43758.5453) % 1;
  }

  // ---------------------------------------------------------------------------
  // Coverage map
  // ---------------------------------------------------------------------------

  getCoverageMap(
    gridSize: number,
    cellSize: number,
    worldOffsetX = 0,
    worldOffsetZ = 0
  ): Float32Array {
    const map = new Float32Array(gridSize * gridSize);
    const y = this.config.altitude + this.config.thickness / 2;

    for (let gz = 0; gz < gridSize; gz++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const wx = worldOffsetX + gx * cellSize;
        const wz = worldOffsetZ + gz * cellSize;
        map[gz * gridSize + gx] = this.sampleDensity(wx, y, wz);
      }
    }

    return map;
  }
}
