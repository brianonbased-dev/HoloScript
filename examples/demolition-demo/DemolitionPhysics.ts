/**
 * DemolitionPhysics.ts
 *
 * Unified demolition physics system integrating:
 * - Fracture system (objects breaking into fragments)
 * - Shock wave solver (explosions and force propagation)
 * - Debris particle system (120K+ visual particles)
 *
 * Week 8: Explosive Demolition - Day 4
 */

import { FractureSystem, type FractureStatistics } from './FractureSystem';
import { ShockWaveSolver, type ExplosionConfig, type ShockWaveSolverStatistics } from './ShockWaveSolver';
import { DebrisParticleSystem, type DebrisParticleStatistics } from './DebrisParticleSystem';
import type { Fracturable } from './Fracturable';
import type { Fragment, Vector3 } from './Fragment';

export interface DemolitionPhysicsConfig {
  /** Gravity vector */
  gravity?: Vector3;
  /** Ground plane Y */
  groundY?: number;
  /** Maximum fracture fragments */
  maxFragments?: number;
  /** Maximum shock waves */
  maxShockWaves?: number;
  /** Maximum debris particles */
  maxDebrisParticles?: number;
  /** Emit debris particles from fragments */
  emitDebrisParticles?: boolean;
  /** Particles per unit volume */
  particlesPerUnitVolume?: number;
  /** Auto-deactivate fragments at rest */
  autoDeactivateFragments?: boolean;
  /** Auto-deactivate particles at rest */
  autoDeactivateParticles?: boolean;
}

export interface DemolitionPhysicsStatistics {
  /** Fracture system stats */
  fracture: FractureStatistics;
  /** Shock wave stats */
  shockWaves: ShockWaveSolverStatistics;
  /** Debris particle stats */
  particles: DebrisParticleStatistics;
  /** Total system energy */
  totalEnergy: number;
  /** Active object count */
  activeObjects: number;
  /** Fractured this frame */
  fracturedThisFrame: number;
}

/**
 * Unified demolition physics system
 */
export class DemolitionPhysics {
  private readonly config: Required<DemolitionPhysicsConfig>;
  private readonly fractureSystem: FractureSystem;
  private readonly shockWaveSolver: ShockWaveSolver;
  private readonly debrisParticleSystem: DebrisParticleSystem;
  private fracturedThisFrame = 0;

  constructor(config: DemolitionPhysicsConfig = {}) {
    this.config = {
      gravity: config.gravity || { x: 0, y: -9.8, z: 0 },
      groundY: config.groundY ?? 0,
      maxFragments: config.maxFragments ?? 10000,
      maxShockWaves: config.maxShockWaves ?? 100,
      maxDebrisParticles: config.maxDebrisParticles ?? 120000,
      emitDebrisParticles: config.emitDebrisParticles ?? true,
      particlesPerUnitVolume: config.particlesPerUnitVolume ?? 100,
      autoDeactivateFragments: config.autoDeactivateFragments ?? true,
      autoDeactivateParticles: config.autoDeactivateParticles ?? true,
    };

    // Initialize subsystems
    this.fractureSystem = new FractureSystem({
      maxFragments: this.config.maxFragments,
      autoDeactivate: this.config.autoDeactivateFragments,
    });

    this.shockWaveSolver = new ShockWaveSolver({
      maxShockWaves: this.config.maxShockWaves,
      groundY: this.config.groundY,
    });

    this.debrisParticleSystem = new DebrisParticleSystem({
      maxParticles: this.config.maxDebrisParticles,
      autoDeactivate: this.config.autoDeactivateParticles,
      groundY: this.config.groundY,
    });
  }

  /**
   * Add fracturable object
   */
  public addObject(object: Fracturable): void {
    this.fractureSystem.addObject(object);
  }

  /**
   * Remove object
   */
  public removeObject(objectId: string): void {
    this.fractureSystem.removeObject(objectId);
  }

  /**
   * Create explosion
   */
  public createExplosion(config: ExplosionConfig): void {
    this.shockWaveSolver.createExplosion(config);
  }

  /**
   * Update all systems
   */
  public update(dt: number): void {
    if (dt <= 0) return;

    this.fracturedThisFrame = 0;

    // 1. Update shock waves
    this.shockWaveSolver.update(dt);

    // 2. Apply shock waves to fracturable objects
    const objects = this.fractureSystem.getObjects();
    for (const object of objects) {
      const impact = this.shockWaveSolver.applyToFracturable(object);

      if (impact && object.isFractured()) {
        // Object fractured - generate fragments
        const fragments = this.fractureSystem.fractureObject(object);
        this.fracturedThisFrame++;

        // Emit debris particles from each fragment
        if (this.config.emitDebrisParticles) {
          for (const fragment of fragments) {
            this.debrisParticleSystem.emitFromFragment(
              fragment,
              this.config.particlesPerUnitVolume
            );
          }
        }
      }
    }

    // 3. Apply shock waves to fragments
    const fragments = this.fractureSystem.getFragments();
    this.shockWaveSolver.applyToFragments(fragments);

    // 4. Update fragments
    this.fractureSystem.update(dt, this.config.gravity);

    // 5. Apply shock waves to debris particles
    const activeParticles = this.debrisParticleSystem.getActiveParticles();
    for (const particle of activeParticles) {
      const activeWaves = this.shockWaveSolver.getActiveShockWaves();

      for (const wave of activeWaves) {
        const impact = wave.calculateImpact(particle.position);
        if (impact) {
          const impulse: Vector3 = {
            x: impact.direction.x * impact.forceMagnitude * 0.1, // Scale down for particles
            y: impact.direction.y * impact.forceMagnitude * 0.1,
            z: impact.direction.z * impact.forceMagnitude * 0.1,
          };
          particle.applyImpulse(impulse);
        }
      }
    }

    // 6. Update debris particles
    this.debrisParticleSystem.update(dt, this.config.gravity);
  }

  /**
   * Apply impulse to object
   */
  public applyImpulseToObject(objectId: string, impulse: Vector3, contactPoint: Vector3): boolean {
    // Get fragment count before impact
    const fragmentsBefore = this.fractureSystem.getFragments().length;

    const fractured = this.fractureSystem.applyImpactToObject(objectId, impulse, contactPoint);

    if (fractured) {
      this.fracturedThisFrame++;

      // Get newly created fragments
      const allFragments = this.fractureSystem.getFragments();
      const newFragments = allFragments.slice(fragmentsBefore);

      // Emit debris particles from new fragments
      if (this.config.emitDebrisParticles) {
        for (const fragment of newFragments) {
          this.debrisParticleSystem.emitFromFragment(
            fragment,
            this.config.particlesPerUnitVolume
          );
        }
      }
    }

    return fractured;
  }

  /**
   * Apply force in radius
   */
  public applyForceInRadius(position: Vector3, radius: number, force: Vector3, dt: number): number {
    let count = 0;

    // Apply to fragments
    const fragments = this.fractureSystem.getFragments();
    for (const fragment of fragments) {
      if (!fragment.isActive()) continue;

      const dx = fragment.physics.position.x - position.x;
      const dy = fragment.physics.position.y - position.y;
      const dz = fragment.physics.position.z - position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance > radius) continue;

      const falloff = 1 - distance / radius;
      const scaledForce: Vector3 = {
        x: force.x * falloff,
        y: force.y * falloff,
        z: force.z * falloff,
      };

      fragment.applyForce(scaledForce, dt);
      count++;
    }

    // Apply to debris particles
    count += this.debrisParticleSystem.applyForceInRadius(position, radius, force, dt);

    return count;
  }

  /**
   * Set LOD camera position
   */
  public setLODCameraPosition(position: Vector3): void {
    this.debrisParticleSystem.setLODCameraPosition(position);
  }

  /**
   * Get all fracturable objects
   */
  public getObjects(): Fracturable[] {
    return this.fractureSystem.getObjects();
  }

  /**
   * Get all fragments
   */
  public getFragments(): Fragment[] {
    return this.fractureSystem.getFragments();
  }

  /**
   * Get debris particles by LOD level
   */
  public getDebrisParticlesByLOD(level: 'near' | 'medium' | 'far') {
    return this.debrisParticleSystem.getParticlesByLOD(level);
  }

  /**
   * Get active debris particles
   */
  public getActiveDebrisParticles() {
    return this.debrisParticleSystem.getActiveParticles();
  }

  /**
   * Get statistics
   */
  public getStatistics(): DemolitionPhysicsStatistics {
    const fractureStats = this.fractureSystem.getStatistics();
    const shockWaveStats = this.shockWaveSolver.getStatistics();
    const particleStats = this.debrisParticleSystem.getStatistics();

    const totalEnergy =
      shockWaveStats.totalEnergy +
      particleStats.totalKineticEnergy +
      this.calculateFragmentEnergy();

    return {
      fracture: fractureStats,
      shockWaves: shockWaveStats,
      particles: particleStats,
      totalEnergy,
      activeObjects: fractureStats.totalObjects,
      fracturedThisFrame: this.fracturedThisFrame,
    };
  }

  /**
   * Calculate total fragment kinetic energy
   */
  private calculateFragmentEnergy(): number {
    let energy = 0;
    const fragments = this.fractureSystem.getFragments();

    for (const fragment of fragments) {
      if (fragment.isActive()) {
        energy += fragment.getKineticEnergy();
      }
    }

    return energy;
  }

  /**
   * Reset system
   */
  public reset(): void {
    this.fractureSystem.reset();
    this.shockWaveSolver.reset();
    this.debrisParticleSystem.reset();
    this.fracturedThisFrame = 0;
  }

  /**
   * Clear all particles and fragments
   */
  public clear(): void {
    this.fractureSystem.clearFragments();
    this.shockWaveSolver.clear();
    this.debrisParticleSystem.clear();
    this.fracturedThisFrame = 0;
  }

  /**
   * Get fracture system (for advanced usage)
   */
  public getFractureSystem(): FractureSystem {
    return this.fractureSystem;
  }

  /**
   * Get shock wave solver (for advanced usage)
   */
  public getShockWaveSolver(): ShockWaveSolver {
    return this.shockWaveSolver;
  }

  /**
   * Get debris particle system (for advanced usage)
   */
  public getDebrisParticleSystem(): DebrisParticleSystem {
    return this.debrisParticleSystem;
  }
}
