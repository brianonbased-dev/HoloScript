/**
 * DebrisParticleSystem.ts
 *
 * High-performance particle system for debris simulation.
 * Supports 120K+ particles with spatial hashing and LOD.
 *
 * Week 8: Explosive Demolition - Day 3
 */

import { DebrisParticle, type DebrisParticleConfig, type ParticleColor } from './DebrisParticle';
import { SpatialHash } from './SpatialHash';
import type { Fragment, Vector3 } from './Fragment';

export type LODLevel = 'near' | 'medium' | 'far';

export interface DebrisParticleSystemConfig {
  /** Maximum particles */
  maxParticles?: number;
  /** Spatial hash cell size */
  spatialCellSize?: number;
  /** Auto-deactivate at rest */
  autoDeactivate?: boolean;
  /** Deactivation threshold */
  deactivationThreshold?: number;
  /** Ground plane Y */
  groundY?: number;
  /** LOD near distance */
  lodNearDistance?: number;
  /** LOD far distance */
  lodFarDistance?: number;
}

export interface ParticleEmitConfig {
  /** Emit position */
  position: Vector3;
  /** Number of particles to emit */
  count: number;
  /** Velocity spread */
  velocitySpread?: number;
  /** Size range */
  sizeRange?: { min: number; max: number };
  /** Lifetime range */
  lifetimeRange?: { min: number; max: number };
  /** Color */
  color?: ParticleColor;
  /** Emit from fragment */
  fromFragment?: Fragment;
}

export interface DebrisParticleStatistics {
  /** Total particles in pool */
  totalParticles: number;
  /** Active particles */
  activeParticles: number;
  /** Inactive particles */
  inactiveParticles: number;
  /** Particles at rest */
  particlesAtRest: number;
  /** Near LOD particles */
  nearLODParticles: number;
  /** Medium LOD particles */
  mediumLODParticles: number;
  /** Far LOD particles */
  farLODParticles: number;
  /** Total kinetic energy */
  totalKineticEnergy: number;
  /** Spatial hash stats */
  spatialHash: {
    totalCells: number;
    occupiedCells: number;
    avgParticlesPerCell: number;
  };
}

/**
 * High-performance debris particle system
 */
export class DebrisParticleSystem {
  private readonly config: Required<DebrisParticleSystemConfig>;
  private readonly particlePool: DebrisParticle[] = [];
  private readonly activeParticles = new Set<DebrisParticle>();
  private readonly spatialHash: SpatialHash;
  private readonly lodCameraPosition: Vector3 = { x: 0, y: 0, z: 0 };

  constructor(config: DebrisParticleSystemConfig = {}) {
    this.config = {
      maxParticles: config.maxParticles ?? 120000,
      spatialCellSize: config.spatialCellSize ?? 5.0,
      autoDeactivate: config.autoDeactivate ?? true,
      deactivationThreshold: config.deactivationThreshold ?? 0.1,
      groundY: config.groundY ?? 0,
      lodNearDistance: config.lodNearDistance ?? 50,
      lodFarDistance: config.lodFarDistance ?? 200,
    };

    this.spatialHash = new SpatialHash({
      cellSize: this.config.spatialCellSize,
    });

    // Pre-allocate particle pool
    this.initializeParticlePool();
  }

  /**
   * Initialize particle pool
   */
  private initializeParticlePool(): void {
    for (let i = 0; i < this.config.maxParticles; i++) {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
      });
      particle.deactivate();
      this.particlePool.push(particle);
    }
  }

  /**
   * Get inactive particle from pool
   */
  private getInactiveParticle(): DebrisParticle | null {
    for (const particle of this.particlePool) {
      if (!particle.isActive()) {
        return particle;
      }
    }
    return null;
  }

  /**
   * Emit particles
   */
  public emit(emitConfig: ParticleEmitConfig): number {
    let emitted = 0;

    for (let i = 0; i < emitConfig.count; i++) {
      const particle = this.getInactiveParticle();
      if (!particle) break;

      // Random velocity
      const velocitySpread = emitConfig.velocitySpread ?? 5.0;
      const velocity: Vector3 = {
        x: (Math.random() - 0.5) * velocitySpread,
        y: Math.random() * velocitySpread,
        z: (Math.random() - 0.5) * velocitySpread,
      };

      // If emitting from fragment, add fragment velocity
      if (emitConfig.fromFragment) {
        velocity.x += emitConfig.fromFragment.physics.velocity.x;
        velocity.y += emitConfig.fromFragment.physics.velocity.y;
        velocity.z += emitConfig.fromFragment.physics.velocity.z;
      }

      // Random size
      const sizeRange = emitConfig.sizeRange || { min: 0.05, max: 0.2 };
      const size = sizeRange.min + Math.random() * (sizeRange.max - sizeRange.min);

      // Random lifetime
      const lifetimeRange = emitConfig.lifetimeRange || { min: 5, max: 15 };
      const lifetime = lifetimeRange.min + Math.random() * (lifetimeRange.max - lifetimeRange.min);

      // Random angular velocity
      const angularVelocity: Vector3 = {
        x: (Math.random() - 0.5) * 10,
        y: (Math.random() - 0.5) * 10,
        z: (Math.random() - 0.5) * 10,
      };

      const particleConfig: DebrisParticleConfig = {
        position: { ...emitConfig.position },
        velocity,
        angularVelocity,
        size,
        lifetime,
        color: emitConfig.color,
        mass: size * size * size * 1000, // Approximate mass
      };

      particle.reset(particleConfig);
      particle.activate();

      this.activeParticles.add(particle);
      this.spatialHash.insert(particle);

      emitted++;
    }

    return emitted;
  }

  /**
   * Emit particles from fragment
   */
  public emitFromFragment(fragment: Fragment, particlesPerUnit: number): number {
    const volume = fragment.geometry.volume;
    const count = Math.floor(volume * particlesPerUnit);

    // Determine color from fragment properties
    const color: ParticleColor = {
      r: 0.6 + Math.random() * 0.2,
      g: 0.5 + Math.random() * 0.2,
      b: 0.4 + Math.random() * 0.2,
      a: 1.0,
    };

    return this.emit({
      position: fragment.physics.position,
      count,
      velocitySpread: 3.0,
      sizeRange: { min: 0.02, max: 0.1 },
      lifetimeRange: { min: 10, max: 20 },
      color,
      fromFragment: fragment,
    });
  }

  /**
   * Update all particles
   */
  public update(dt: number, gravity: Vector3): void {
    if (dt <= 0) return;

    const toDeactivate: DebrisParticle[] = [];

    for (const particle of this.activeParticles) {
      // Update physics
      particle.update(dt, gravity);

      // Handle ground collision
      particle.handleGroundCollision(this.config.groundY);

      // Update spatial hash
      this.spatialHash.update(particle);

      // Auto-deactivate if at rest
      if (
        this.config.autoDeactivate &&
        particle.isAtRest(this.config.deactivationThreshold) &&
        particle.position.y <= this.config.groundY + particle.size
      ) {
        toDeactivate.push(particle);
      }

      // Deactivate if lifetime expired
      if (!particle.isActive()) {
        toDeactivate.push(particle);
      }
    }

    // Deactivate particles
    for (const particle of toDeactivate) {
      this.deactivateParticle(particle);
    }
  }

  /**
   * Deactivate particle
   */
  private deactivateParticle(particle: DebrisParticle): void {
    particle.deactivate();
    this.activeParticles.delete(particle);
    this.spatialHash.remove(particle);
  }

  /**
   * Set LOD camera position
   */
  public setLODCameraPosition(position: Vector3): void {
    this.lodCameraPosition.x = position.x;
    this.lodCameraPosition.y = position.y;
    this.lodCameraPosition.z = position.z;
  }

  /**
   * Get LOD level for particle
   */
  public getLODLevel(particle: DebrisParticle): LODLevel {
    const distance = particle.distanceFrom(this.lodCameraPosition);

    if (distance < this.config.lodNearDistance) {
      return 'near';
    } else if (distance < this.config.lodFarDistance) {
      return 'medium';
    } else {
      return 'far';
    }
  }

  /**
   * Get particles by LOD level
   */
  public getParticlesByLOD(level: LODLevel): DebrisParticle[] {
    const results: DebrisParticle[] = [];

    for (const particle of this.activeParticles) {
      if (this.getLODLevel(particle) === level) {
        results.push(particle);
      }
    }

    return results;
  }

  /**
   * Query particles in radius
   */
  public queryRadius(position: Vector3, radius: number): DebrisParticle[] {
    return this.spatialHash.queryRadius(position, radius).filter((p) => p.isActive());
  }

  /**
   * Query particles in box
   */
  public queryBox(min: Vector3, max: Vector3): DebrisParticle[] {
    return this.spatialHash.queryBox(min, max).filter((p) => p.isActive());
  }

  /**
   * Apply force to particles in radius
   */
  public applyForceInRadius(position: Vector3, radius: number, force: Vector3, dt: number): number {
    const particles = this.queryRadius(position, radius);
    let count = 0;

    for (const particle of particles) {
      // Apply force with falloff
      const distance = particle.distanceFrom(position);
      const falloff = 1 - distance / radius;

      const scaledForce: Vector3 = {
        x: force.x * falloff,
        y: force.y * falloff,
        z: force.z * falloff,
      };

      particle.applyForce(scaledForce, dt);
      count++;
    }

    return count;
  }

  /**
   * Get all active particles
   */
  public getActiveParticles(): DebrisParticle[] {
    return Array.from(this.activeParticles);
  }

  /**
   * Get particle pool
   */
  public getParticlePool(): DebrisParticle[] {
    return this.particlePool;
  }

  /**
   * Clear all particles
   */
  public clear(): void {
    for (const particle of this.activeParticles) {
      particle.deactivate();
    }

    this.activeParticles.clear();
    this.spatialHash.clear();
  }

  /**
   * Reset system
   */
  public reset(): void {
    this.clear();
  }

  /**
   * Get statistics
   */
  public getStatistics(): DebrisParticleStatistics {
    let particlesAtRest = 0;
    let nearLODParticles = 0;
    let mediumLODParticles = 0;
    let farLODParticles = 0;
    let totalKineticEnergy = 0;

    for (const particle of this.activeParticles) {
      if (particle.isAtRest(this.config.deactivationThreshold)) {
        particlesAtRest++;
      }

      const lod = this.getLODLevel(particle);
      if (lod === 'near') nearLODParticles++;
      else if (lod === 'medium') mediumLODParticles++;
      else farLODParticles++;

      totalKineticEnergy += particle.getKineticEnergy();
    }

    const hashStats = this.spatialHash.getStatistics();

    return {
      totalParticles: this.particlePool.length,
      activeParticles: this.activeParticles.size,
      inactiveParticles: this.particlePool.length - this.activeParticles.size,
      particlesAtRest,
      nearLODParticles,
      mediumLODParticles,
      farLODParticles,
      totalKineticEnergy,
      spatialHash: {
        totalCells: hashStats.totalCells,
        occupiedCells: hashStats.occupiedCells,
        avgParticlesPerCell: hashStats.avgParticlesPerCell,
      },
    };
  }
}
