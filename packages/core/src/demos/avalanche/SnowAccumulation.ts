/**
 * SnowAccumulation.ts
 *
 * Snow deposition, stability analysis, and trigger zone identification for avalanche simulation.
 * Manages snow particles placement on terrain and calculates slope stability.
 *
 * Week 6: Avalanche Simulation - Snow Accumulation
 */

import type { TerrainData } from './TerrainGenerator';

export interface SnowConfig {
  /** Number of snow particles */
  particleCount: number;
  /** Mass per snow particle in kg */
  particleMass: number;
  /** Critical slope angle in degrees (angle of repose) */
  angleOfRepose: number;
  /** Snow cohesion factor (0-1, higher = stickier) */
  cohesion: number;
  /** Snow density in kg/m³ */
  density: number;
  /** Minimum snow depth for avalanche trigger in meters */
  minDepthForTrigger: number;
}

export interface SnowParticle {
  /** Unique particle ID */
  id: number;
  /** World position [x, y, z] */
  position: [number, number, number];
  /** Velocity [vx, vy, vz] */
  velocity: [number, number, number];
  /** Particle mass in kg */
  mass: number;
  /** Particle state */
  state: 'resting' | 'sliding' | 'airborne';
  /** Terrain cell [gridX, gridZ] */
  terrainCell: [number, number];
  /** Age in seconds since deposition */
  age: number;
}

export interface SnowLayer {
  /** Snow depth per terrain cell in meters */
  depthMap: Float32Array;
  /** Snow mass per terrain cell in kg */
  massMap: Float32Array;
  /** Particle count per terrain cell */
  particleCountMap: Uint32Array;
  /** Stability factor per cell (-1 to 1, negative = unstable) */
  stabilityMap: Float32Array;
}

export interface TriggerZone {
  /** Center position [x, z] on terrain */
  center: [number, number];
  /** Radius of trigger zone in meters */
  radius: number;
  /** Estimated particle count in zone */
  particleCount: number;
  /** Average slope angle in zone */
  avgSlope: number;
  /** Instability score (0-1, higher = more unstable) */
  instability: number;
}

/**
 * Snow accumulation and stability manager for avalanche simulation
 */
export class SnowAccumulation {
  private config: SnowConfig;
  private terrain: TerrainData;
  private particles: SnowParticle[] = [];
  private snowLayer: SnowLayer;
  private triggerZones: TriggerZone[] = [];
  private nextParticleId = 0;

  constructor(terrain: TerrainData, config: SnowConfig) {
    this.terrain = terrain;
    this.config = config;

    // Initialize snow layer maps
    const res = terrain.config.resolution;
    this.snowLayer = {
      depthMap: new Float32Array(res * res),
      massMap: new Float32Array(res * res),
      particleCountMap: new Uint32Array(res * res),
      stabilityMap: new Float32Array(res * res),
    };

    // Initialize particles
    this.depositSnow();

    // Calculate initial stability
    this.updateStability();

    // Identify trigger zones
    this.identifyTriggerZones();
  }

  /**
   * Deposit snow particles on terrain surface
   */
  private depositSnow(): void {
    const { particleCount, particleMass } = this.config;
    const { width, depth, resolution } = this.terrain.config;

    this.particles = [];

    for (let i = 0; i < particleCount; i++) {
      // Random position on terrain
      const x = (Math.random() - 0.5) * width;
      const z = (Math.random() - 0.5) * depth;

      // Get terrain height at position
      const terrainHeight = this.getTerrainHeight(x, z);

      // Get terrain cell
      const [gridX, gridZ] = this.worldToGrid(x, z);

      // Create particle
      const particle: SnowParticle = {
        id: this.nextParticleId++,
        position: [x, terrainHeight, z],
        velocity: [0, 0, 0],
        mass: particleMass,
        state: 'resting',
        terrainCell: [gridX, gridZ],
        age: 0,
      };

      this.particles.push(particle);

      // Update snow layer
      const cellIndex = gridZ * resolution + gridX;
      this.snowLayer.depthMap[cellIndex] += 0.01; // Assume 1cm per particle
      this.snowLayer.massMap[cellIndex] += particleMass;
      this.snowLayer.particleCountMap[cellIndex]++;
    }
  }

  /**
   * Update stability analysis for all terrain cells
   */
  public updateStability(): void {
    const { angleOfRepose, cohesion } = this.config;
    const { resolution } = this.terrain.config;
    const angleOfReposeRad = (angleOfRepose * Math.PI) / 180;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const index = z * resolution + x;

        // Get terrain slope
        const slope = this.terrain.slopes[index];

        // Get snow depth and mass
        const depth = this.snowLayer.depthMap[index];
        const mass = this.snowLayer.massMap[index];

        // Stability factor calculation (simplified Mohr-Coulomb)
        // Stable if: cohesion > tan(slope) * weight
        // We normalize to [-1, 1] range

        let stabilityFactor = 0;

        if (depth > 0.001) {
          // Has snow
          const weight = mass * 9.8; // Force due to gravity
          const criticalAngle = angleOfReposeRad;

          // Stability decreases with slope angle
          const slopeFactor = slope / criticalAngle;

          // Cohesion provides resistance
          const cohesionFactor = cohesion;

          // Weight increases instability
          const weightFactor = Math.min(weight / 100, 1.0); // Normalize weight

          // Combined stability: positive = stable, negative = unstable
          stabilityFactor = cohesionFactor - slopeFactor - weightFactor * 0.1;

          // Clamp to [-1, 1]
          stabilityFactor = Math.max(-1, Math.min(1, stabilityFactor));
        }

        this.snowLayer.stabilityMap[index] = stabilityFactor;
      }
    }
  }

  /**
   * Identify trigger zones (areas prone to avalanche)
   */
  private identifyTriggerZones(): void {
    const { angleOfRepose, minDepthForTrigger } = this.config;
    const { resolution } = this.terrain.config;
    const angleOfReposeRad = (angleOfRepose * Math.PI) / 180;

    this.triggerZones = [];

    // Scan terrain for unstable regions
    const visited = new Set<number>();

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const index = z * resolution + x;

        if (visited.has(index)) continue;

        // Check if cell is unstable
        const slope = this.terrain.slopes[index];
        const depth = this.snowLayer.depthMap[index];
        const stability = this.snowLayer.stabilityMap[index];

        if (slope > angleOfReposeRad * 0.8 && depth > minDepthForTrigger && stability < -0.2) {
          // Found unstable cell, grow trigger zone
          const zone = this.growTriggerZone(x, z, visited);
          if (zone.particleCount > 10) {
            // Only consider zones with enough particles
            this.triggerZones.push(zone);
          }
        }

        visited.add(index);
      }
    }
  }

  /**
   * Grow trigger zone from seed cell using flood fill
   */
  private growTriggerZone(
    seedX: number,
    seedZ: number,
    visited: Set<number>
  ): TriggerZone {
    const { resolution } = this.terrain.config;
    const { angleOfRepose } = this.config;
    const angleOfReposeRad = (angleOfRepose * Math.PI) / 180;

    const queue: [number, number][] = [[seedX, seedZ]];
    const zoneCells: [number, number][] = [];

    let totalSlope = 0;
    let totalParticles = 0;

    while (queue.length > 0) {
      const [x, z] = queue.shift()!;
      const index = z * resolution + x;

      if (visited.has(index)) continue;
      visited.add(index);

      // Check if cell should be part of zone
      const slope = this.terrain.slopes[index];
      const stability = this.snowLayer.stabilityMap[index];

      if (slope > angleOfReposeRad * 0.7 && stability < 0) {
        zoneCells.push([x, z]);
        totalSlope += slope;
        totalParticles += this.snowLayer.particleCountMap[index];

        // Add neighbors to queue
        const neighbors = [
          [x - 1, z],
          [x + 1, z],
          [x, z - 1],
          [x, z + 1],
        ];

        for (const [nx, nz] of neighbors) {
          if (nx >= 0 && nx < resolution && nz >= 0 && nz < resolution) {
            queue.push([nx, nz]);
          }
        }
      }
    }

    // Calculate zone center and radius
    let centerX = 0;
    let centerZ = 0;

    for (const [x, z] of zoneCells) {
      centerX += x;
      centerZ += z;
    }

    centerX /= Math.max(1, zoneCells.length);
    centerZ /= Math.max(1, zoneCells.length);

    // Convert grid to world coordinates
    const { width, depth } = this.terrain.config;
    const worldCenterX = (centerX / (resolution - 1)) * width - width / 2;
    const worldCenterZ = (centerZ / (resolution - 1)) * depth - depth / 2;

    // Calculate radius (max distance from center)
    let maxDist = 0;
    for (const [x, z] of zoneCells) {
      const dx = x - centerX;
      const dz = z - centerZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      maxDist = Math.max(maxDist, dist);
    }

    const cellWidth = width / (resolution - 1);
    const radius = maxDist * cellWidth;

    // Calculate instability score
    const avgSlope = totalSlope / Math.max(1, zoneCells.length);
    const slopeFactor = Math.min(avgSlope / (Math.PI / 4), 1); // Normalize to [0, 1]
    const particleFactor = Math.min(totalParticles / 1000, 1); // More particles = more unstable
    const instability = (slopeFactor + particleFactor) / 2;

    return {
      center: [worldCenterX, worldCenterZ],
      radius,
      particleCount: totalParticles,
      avgSlope,
      instability,
    };
  }

  /**
   * Get terrain height at world position using bilinear interpolation
   */
  private getTerrainHeight(x: number, z: number): number {
    const { width, depth, resolution } = this.terrain.config;

    // Convert world to grid coordinates
    const gx = ((x + width / 2) / width) * (resolution - 1);
    const gz = ((z + depth / 2) / depth) * (resolution - 1);

    // Clamp to terrain bounds
    const cx = Math.max(0, Math.min(resolution - 1, gx));
    const cz = Math.max(0, Math.min(resolution - 1, gz));

    // Get integer grid coordinates
    const x0 = Math.floor(cx);
    const z0 = Math.floor(cz);
    const x1 = Math.min(x0 + 1, resolution - 1);
    const z1 = Math.min(z0 + 1, resolution - 1);

    // Fractional parts
    const fx = cx - x0;
    const fz = cz - z0;

    // Get heights at 4 corners
    const h00 = this.terrain.heightmap[z0 * resolution + x0];
    const h10 = this.terrain.heightmap[z0 * resolution + x1];
    const h01 = this.terrain.heightmap[z1 * resolution + x0];
    const h11 = this.terrain.heightmap[z1 * resolution + x1];

    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
  }

  /**
   * Convert world coordinates to grid coordinates
   */
  private worldToGrid(x: number, z: number): [number, number] {
    const { width, depth, resolution } = this.terrain.config;

    const gx = ((x + width / 2) / width) * (resolution - 1);
    const gz = ((z + depth / 2) / depth) * (resolution - 1);

    const gridX = Math.max(0, Math.min(resolution - 1, Math.round(gx)));
    const gridZ = Math.max(0, Math.min(resolution - 1, Math.round(gz)));

    return [gridX, gridZ];
  }

  /**
   * Get all snow particles
   */
  public getParticles(): SnowParticle[] {
    return this.particles;
  }

  /**
   * Get particles in a specific state
   */
  public getParticlesByState(state: 'resting' | 'sliding' | 'airborne'): SnowParticle[] {
    return this.particles.filter((p) => p.state === state);
  }

  /**
   * Get snow layer data
   */
  public getSnowLayer(): SnowLayer {
    return this.snowLayer;
  }

  /**
   * Get identified trigger zones
   */
  public getTriggerZones(): TriggerZone[] {
    return this.triggerZones;
  }

  /**
   * Get snow depth at world position
   */
  public getDepth(x: number, z: number): number {
    const { resolution } = this.terrain.config;
    const [gridX, gridZ] = this.worldToGrid(x, z);
    const index = gridZ * resolution + gridX;
    return this.snowLayer.depthMap[index];
  }

  /**
   * Get stability factor at world position
   */
  public getStability(x: number, z: number): number {
    const { resolution } = this.terrain.config;
    const [gridX, gridZ] = this.worldToGrid(x, z);
    const index = gridZ * resolution + gridX;
    return this.snowLayer.stabilityMap[index];
  }

  /**
   * Update particle age
   */
  public updateAge(dt: number): void {
    for (const particle of this.particles) {
      particle.age += dt;
    }
  }

  /**
   * Get snow accumulation statistics
   */
  public getStatistics(): {
    totalParticles: number;
    restingParticles: number;
    slidingParticles: number;
    airborneParticles: number;
    totalMass: number;
    avgDepth: number;
    maxDepth: number;
    stableCells: number;
    unstableCells: number;
    triggerZoneCount: number;
  } {
    const { resolution } = this.terrain.config;
    const cellCount = resolution * resolution;

    let restingCount = 0;
    let slidingCount = 0;
    let airborneCount = 0;

    for (const particle of this.particles) {
      if (particle.state === 'resting') restingCount++;
      else if (particle.state === 'sliding') slidingCount++;
      else if (particle.state === 'airborne') airborneCount++;
    }

    let totalMass = 0;
    let totalDepth = 0;
    let maxDepth = 0;
    let stableCells = 0;
    let unstableCells = 0;

    for (let i = 0; i < cellCount; i++) {
      totalMass += this.snowLayer.massMap[i];
      totalDepth += this.snowLayer.depthMap[i];
      maxDepth = Math.max(maxDepth, this.snowLayer.depthMap[i]);

      if (this.snowLayer.stabilityMap[i] > 0) stableCells++;
      else if (this.snowLayer.stabilityMap[i] < 0) unstableCells++;
    }

    return {
      totalParticles: this.particles.length,
      restingParticles: restingCount,
      slidingParticles: slidingCount,
      airborneParticles: airborneCount,
      totalMass,
      avgDepth: totalDepth / cellCount,
      maxDepth,
      stableCells,
      unstableCells,
      triggerZoneCount: this.triggerZones.length,
    };
  }

  /**
   * Reset snow accumulation
   */
  public reset(): void {
    this.particles = [];
    this.triggerZones = [];
    this.nextParticleId = 0;

    const res = this.terrain.config.resolution;
    this.snowLayer.depthMap.fill(0);
    this.snowLayer.massMap.fill(0);
    this.snowLayer.particleCountMap.fill(0);
    this.snowLayer.stabilityMap.fill(0);

    this.depositSnow();
    this.updateStability();
    this.identifyTriggerZones();
  }
}
