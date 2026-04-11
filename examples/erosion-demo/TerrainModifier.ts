/**
 * TerrainModifier.ts
 *
 * High-level terrain modification tools for interactive erosion simulation.
 * Provides brush-based editing, presets, and procedural generation.
 *
 * Week 7: Water Erosion - Day 4
 */

import type { HeightmapTerrain } from './HeightmapTerrain';

export interface BrushConfig {
  /** Brush radius in grid cells */
  radius: number;
  /** Brush strength (0-1) */
  strength: number;
  /** Brush falloff curve: linear, smooth, sharp */
  falloff: 'linear' | 'smooth' | 'sharp';
}

export interface NoiseConfig {
  /** Number of octaves for multi-frequency noise */
  octaves: number;
  /** Frequency of base noise */
  frequency: number;
  /** Amplitude of noise */
  amplitude: number;
  /** Persistence (amplitude multiplier per octave) */
  persistence: number;
  /** Lacunarity (frequency multiplier per octave) */
  lacunarity: number;
  /** Random seed */
  seed: number;
}

/**
 * Terrain modification tools
 */
export class TerrainModifier {
  private terrain: HeightmapTerrain;

  constructor(terrain: HeightmapTerrain) {
    this.terrain = terrain;
  }

  /**
   * Raise terrain with brush
   */
  public raise(centerX: number, centerZ: number, config: BrushConfig): void {
    this.applyBrush(centerX, centerZ, config, (height, strength) => height + strength);
  }

  /**
   * Lower terrain with brush
   */
  public lower(centerX: number, centerZ: number, config: BrushConfig): void {
    this.applyBrush(centerX, centerZ, config, (height, strength) => height - strength);
  }

  /**
   * Flatten terrain to target height with brush
   */
  public flatten(
    centerX: number,
    centerZ: number,
    targetHeight: number,
    config: BrushConfig
  ): void {
    this.applyBrush(centerX, centerZ, config, (height, strength) => {
      return height + (targetHeight - height) * strength;
    });
  }

  /**
   * Smooth terrain with brush
   */
  public smoothBrush(centerX: number, centerZ: number, config: BrushConfig): void {
    // Skip if radius is zero or negative
    if (config.radius <= 0) {
      return;
    }

    const { resolution } = this.terrain.config;
    const radiusSq = config.radius * config.radius;

    // Gather heights in brush area
    const temp = new Float32Array(this.terrain.heightmap);

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const dx = x - centerX;
        const dz = z - centerZ;
        const distSq = dx * dx + dz * dz;

        if (distSq <= radiusSq) {
          const dist = Math.sqrt(distSq);
          const falloff = this.calculateFalloff(dist, config.radius, config.falloff);
          const strength = config.strength * falloff;

          // Average with neighbors
          let sum = 0;
          let count = 0;

          for (let nz = -1; nz <= 1; nz++) {
            for (let nx = -1; nx <= 1; nx++) {
              const sx = x + nx;
              const sz = z + nz;
              if (sx >= 0 && sx < resolution && sz >= 0 && sz < resolution) {
                sum += temp[sz * resolution + sx];
                count++;
              }
            }
          }

          const avg = sum / count;
          const currentHeight = this.terrain.getHeightAtGrid(x, z);
          const newHeight = currentHeight + (avg - currentHeight) * strength;

          this.terrain.setHeightAtGrid(x, z, newHeight);
        }
      }
    }
  }

  /**
   * Apply noise to terrain
   */
  public applyNoise(config: NoiseConfig): void {
    const { width, depth, resolution } = this.terrain.config;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const worldX = (x / (resolution - 1)) * width - width / 2;
        const worldZ = (z / (resolution - 1)) * depth - depth / 2;

        const noiseValue = this.perlinNoise(worldX, worldZ, config);
        const currentHeight = this.terrain.getHeightAtGrid(x, z);

        this.terrain.setHeightAtGrid(x, z, currentHeight + noiseValue);
      }
    }
  }

  /**
   * Generate terrain from height function
   */
  public generate(heightFunc: (x: number, z: number) => number): void {
    const { width, depth, resolution } = this.terrain.config;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const worldX = (x / (resolution - 1)) * width - width / 2;
        const worldZ = (z / (resolution - 1)) * depth - depth / 2;

        const height = heightFunc(worldX, worldZ);
        this.terrain.setHeightAtGrid(x, z, height);
      }
    }
  }

  /**
   * Create pyramid terrain
   */
  public createPyramid(height: number): void {
    this.generate((x, z) => {
      const distX = Math.abs(x);
      const distZ = Math.abs(z);
      const dist = Math.max(distX, distZ);
      const { width } = this.terrain.config;
      return Math.max(0, height * (1 - dist / (width / 2)));
    });
  }

  /**
   * Create cone terrain
   */
  public createCone(height: number): void {
    this.generate((x, z) => {
      const dist = Math.sqrt(x * x + z * z);
      const { width } = this.terrain.config;
      return Math.max(0, height * (1 - dist / (width / 2)));
    });
  }

  /**
   * Create valley terrain
   */
  public createValley(depth: number, width: number): void {
    this.generate((x, _z) => {
      const distX = Math.abs(x);
      const t = Math.min(1, distX / (width / 2));
      return depth * t * t; // Parabolic valley
    });
  }

  /**
   * Create ridge terrain
   */
  public createRidge(height: number, width: number): void {
    this.generate((x, _z) => {
      const distX = Math.abs(x);
      const t = Math.max(0, 1 - distX / (width / 2));
      return height * t;
    });
  }

  /**
   * Create mountain range with multi-octave noise
   */
  public createMountains(config: Partial<NoiseConfig> = {}): void {
    const noiseConfig: NoiseConfig = {
      octaves: 6,
      frequency: 0.01,
      amplitude: 50,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: Date.now(),
      ...config,
    };

    this.terrain.fill(0);
    this.applyNoise(noiseConfig);
  }

  /**
   * Create canyon by inverting terrain
   */
  public createCanyon(depth: number): void {
    const { resolution } = this.terrain.config;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const height = this.terrain.getHeightAtGrid(x, z);
        this.terrain.setHeightAtGrid(x, z, depth - height);
      }
    }
  }

  /**
   * Terrace terrain (create steps)
   */
  public terrace(levels: number, height: number): void {
    const { resolution } = this.terrain.config;
    const stepHeight = height / levels;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const currentHeight = this.terrain.getHeightAtGrid(x, z);
        const level = Math.floor(currentHeight / stepHeight);
        const terraceHeight = level * stepHeight;

        this.terrain.setHeightAtGrid(x, z, terraceHeight);
      }
    }
  }

  /**
   * Clamp terrain heights to range
   */
  public clamp(minHeight: number, maxHeight: number): void {
    const { resolution } = this.terrain.config;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const height = this.terrain.getHeightAtGrid(x, z);
        const clamped = Math.max(minHeight, Math.min(maxHeight, height));
        this.terrain.setHeightAtGrid(x, z, clamped);
      }
    }
  }

  /**
   * Scale terrain heights
   */
  public scale(factor: number): void {
    const { resolution } = this.terrain.config;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const height = this.terrain.getHeightAtGrid(x, z);
        this.terrain.setHeightAtGrid(x, z, height * factor);
      }
    }
  }

  /**
   * Apply brush operation to terrain
   */
  private applyBrush(
    centerX: number,
    centerZ: number,
    config: BrushConfig,
    operation: (height: number, strength: number) => number
  ): void {
    // Skip if radius is zero or negative
    if (config.radius <= 0) {
      return;
    }

    const { resolution } = this.terrain.config;
    const radiusSq = config.radius * config.radius;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const dx = x - centerX;
        const dz = z - centerZ;
        const distSq = dx * dx + dz * dz;

        if (distSq <= radiusSq) {
          const dist = Math.sqrt(distSq);
          const falloff = this.calculateFalloff(dist, config.radius, config.falloff);
          const strength = config.strength * falloff;

          const currentHeight = this.terrain.getHeightAtGrid(x, z);
          const newHeight = operation(currentHeight, strength);

          this.terrain.setHeightAtGrid(x, z, newHeight);
        }
      }
    }
  }

  /**
   * Calculate brush falloff
   */
  private calculateFalloff(
    distance: number,
    radius: number,
    type: 'linear' | 'smooth' | 'sharp'
  ): number {
    if (distance >= radius) return 0;

    const t = 1 - distance / radius;

    switch (type) {
      case 'linear':
        return t;
      case 'smooth':
        return t * t * (3 - 2 * t); // Smoothstep
      case 'sharp':
        return t * t * t; // Cubic
      default:
        return t;
    }
  }

  /**
   * Multi-octave Perlin noise
   */
  private perlinNoise(x: number, z: number, config: NoiseConfig): number {
    if (config.octaves <= 0) {
      return 0;
    }

    let total = 0;
    let frequency = config.frequency;
    let amplitude = config.amplitude;
    let maxValue = 0;

    for (let i = 0; i < config.octaves; i++) {
      total += this.noise2D(x * frequency + config.seed, z * frequency + config.seed) * amplitude;

      maxValue += amplitude;
      amplitude *= config.persistence;
      frequency *= config.lacunarity;
    }

    return total / maxValue;
  }

  /**
   * Simple 2D noise function (pseudo-Perlin)
   */
  private noise2D(x: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Z = Math.floor(z) & 255;

    const xf = x - Math.floor(x);
    const zf = z - Math.floor(z);

    const u = this.fade(xf);
    const v = this.fade(zf);

    const a = this.hash(X) + Z;
    const b = this.hash(X + 1) + Z;

    return this.lerp(
      v,
      this.lerp(u, this.grad(this.hash(a), xf, zf), this.grad(this.hash(b), xf - 1, zf)),
      this.lerp(
        u,
        this.grad(this.hash(a + 1), xf, zf - 1),
        this.grad(this.hash(b + 1), xf - 1, zf - 1)
      )
    );
  }

  /**
   * Fade function for noise
   */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /**
   * Linear interpolation
   */
  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  /**
   * Hash function for noise
   */
  private hash(i: number): number {
    i = (i << 13) ^ i;
    return ((i * (i * i * 15731 + 789221) + 1376312589) & 0x7fffffff) % 256;
  }

  /**
   * Gradient function for noise
   */
  private grad(hash: number, x: number, z: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : z;
    const v = h < 2 ? z : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
}
