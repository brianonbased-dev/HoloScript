/**
 * ShockWaveSolver.ts
 *
 * Manages multiple shock waves and applies forces to objects and fragments.
 * Handles wave propagation, interaction, and reflection.
 *
 * Week 8: Explosive Demolition - Day 2
 */

import { ShockWave, type ShockWaveConfig, type ShockWaveImpact } from './ShockWave';
import type { Fragment, Vector3 } from './Fragment';
import type { Fracturable } from './Fracturable';

export interface ShockWaveSolverConfig {
  /** Maximum concurrent shock waves */
  maxShockWaves?: number;
  /** Auto-remove inactive waves */
  autoCleanup?: boolean;
  /** Ground reflection enabled */
  groundReflection?: boolean;
  /** Ground plane Y coordinate */
  groundY?: number;
  /** Reflection coefficient (0-1) */
  reflectionCoefficient?: number;
}

export interface ExplosionConfig {
  /** Explosion origin */
  position: Vector3;
  /** Explosion energy (joules) */
  energy: number;
  /** Custom shock wave config */
  shockWaveConfig?: Partial<ShockWaveConfig>;
}

export interface ShockWaveSolverStatistics {
  /** Total shock waves created */
  totalShockWaves: number;
  /** Active shock waves */
  activeShockWaves: number;
  /** Total impacts this frame */
  impactsThisFrame: number;
  /** Total energy in system */
  totalEnergy: number;
  /** Average shock wave age */
  avgAge: number;
}

/**
 * Shock wave simulation system
 */
export class ShockWaveSolver {
  private readonly config: Required<ShockWaveSolverConfig>;
  private readonly shockWaves = new Map<string, ShockWave>();
  private impactsThisFrame = 0;
  private totalShockWavesCreated = 0;

  constructor(config: ShockWaveSolverConfig = {}) {
    this.config = {
      maxShockWaves: config.maxShockWaves ?? 100,
      autoCleanup: config.autoCleanup ?? true,
      groundReflection: config.groundReflection ?? true,
      groundY: config.groundY ?? 0,
      reflectionCoefficient: config.reflectionCoefficient ?? 0.3,
    };
  }

  /**
   * Create explosion and shock wave
   */
  public createExplosion(explosionConfig: ExplosionConfig): ShockWave {
    // Check max limit - remove oldest wave to make room
    while (this.shockWaves.size >= this.config.maxShockWaves) {
      this.removeOldest();
    }

    // Create shock wave
    const shockWaveConfig: ShockWaveConfig = {
      origin: explosionConfig.position,
      energy: explosionConfig.energy,
      ...explosionConfig.shockWaveConfig,
    };

    const shockWave = new ShockWave(shockWaveConfig);
    this.shockWaves.set(shockWave.id, shockWave);
    this.totalShockWavesCreated++;

    // Create reflection wave if ground reflection enabled
    if (this.config.groundReflection && explosionConfig.position.y > this.config.groundY) {
      this.createReflectionWave(shockWave);
    }

    return shockWave;
  }

  /**
   * Update all shock waves
   */
  public update(dt: number): void {
    if (dt <= 0) return;

    this.impactsThisFrame = 0;

    // Update each shock wave
    for (const wave of this.shockWaves.values()) {
      wave.update(dt);
    }

    // Auto-cleanup inactive waves
    if (this.config.autoCleanup) {
      this.cleanupInactive();
    }
  }

  /**
   * Apply shock waves to fragment
   */
  public applyToFragment(fragment: Fragment): boolean {
    if (!fragment.isActive()) return false;

    let appliedAny = false;

    for (const wave of this.shockWaves.values()) {
      if (!wave.isActive()) continue;

      const impact = wave.calculateImpact(fragment.physics.position);
      if (impact) {
        // Apply impulse to fragment
        const impulse: Vector3 = {
          x: impact.direction.x * impact.forceMagnitude,
          y: impact.direction.y * impact.forceMagnitude,
          z: impact.direction.z * impact.forceMagnitude,
        };

        fragment.applyImpulse(impulse, fragment.physics.position);
        this.impactsThisFrame++;
        appliedAny = true;
      }
    }

    return appliedAny;
  }

  /**
   * Apply shock waves to fracturable object
   */
  public applyToFracturable(object: Fracturable): ShockWaveImpact | null {
    if (object.isFractured()) return null;

    let strongestImpact: ShockWaveImpact | null = null;
    let maxForce = 0;

    const objectCenter = object.getCenter();

    for (const wave of this.shockWaves.values()) {
      if (!wave.isActive()) continue;

      const impact = wave.calculateImpact(objectCenter);
      if (impact && impact.forceMagnitude > maxForce) {
        strongestImpact = impact;
        maxForce = impact.forceMagnitude;
      }
    }

    if (strongestImpact) {
      // Apply impact to object
      const impulse: Vector3 = {
        x: strongestImpact.direction.x * strongestImpact.forceMagnitude,
        y: strongestImpact.direction.y * strongestImpact.forceMagnitude,
        z: strongestImpact.direction.z * strongestImpact.forceMagnitude,
      };

      object.applyImpact(impulse, strongestImpact.position);
      this.impactsThisFrame++;

      return strongestImpact;
    }

    return null;
  }

  /**
   * Apply shock waves to all fragments
   */
  public applyToFragments(fragments: Fragment[]): number {
    let count = 0;

    for (const fragment of fragments) {
      if (this.applyToFragment(fragment)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Apply shock waves to all fracturable objects
   */
  public applyToFracturables(objects: Fracturable[]): number {
    let count = 0;

    for (const object of objects) {
      if (this.applyToFracturable(object)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get overpressure at point
   */
  public getOverpressureAt(point: Vector3): number {
    let totalPressure = 0;

    for (const wave of this.shockWaves.values()) {
      if (!wave.isActive()) continue;

      const dx = point.x - wave.origin.x;
      const dy = point.y - wave.origin.y;
      const dz = point.z - wave.origin.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      totalPressure += wave.getPeakOverpressure(distance);
    }

    return totalPressure;
  }

  /**
   * Check if point is in any shock wave
   */
  public isPointInShockWave(point: Vector3): boolean {
    for (const wave of this.shockWaves.values()) {
      if (wave.isActive() && wave.affectsPoint(point)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all active shock waves
   */
  public getActiveShockWaves(): ShockWave[] {
    return Array.from(this.shockWaves.values()).filter((w) => w.isActive());
  }

  /**
   * Get all shock waves
   */
  public getAllShockWaves(): ShockWave[] {
    return Array.from(this.shockWaves.values());
  }

  /**
   * Get shock wave by ID
   */
  public getShockWave(id: string): ShockWave | undefined {
    return this.shockWaves.get(id);
  }

  /**
   * Remove shock wave
   */
  public removeShockWave(id: string): boolean {
    return this.shockWaves.delete(id);
  }

  /**
   * Clear all shock waves
   */
  public clear(): void {
    this.shockWaves.clear();
  }

  /**
   * Get statistics
   */
  public getStatistics(): ShockWaveSolverStatistics {
    const activeWaves = this.getActiveShockWaves();
    const totalEnergy = activeWaves.reduce((sum, w) => sum + w.getCurrentEnergy(), 0);
    const avgAge = activeWaves.length > 0
      ? activeWaves.reduce((sum, w) => sum + w.getAge(), 0) / activeWaves.length
      : 0;

    return {
      totalShockWaves: this.totalShockWavesCreated,
      activeShockWaves: activeWaves.length,
      impactsThisFrame: this.impactsThisFrame,
      totalEnergy,
      avgAge,
    };
  }

  /**
   * Reset system
   */
  public reset(): void {
    this.shockWaves.clear();
    this.impactsThisFrame = 0;
    this.totalShockWavesCreated = 0;
  }

  /**
   * Create reflection wave from ground
   */
  private createReflectionWave(originalWave: ShockWave): void {
    const reflectionY = 2 * this.config.groundY - originalWave.origin.y;

    const reflectionConfig: ShockWaveConfig = {
      origin: {
        x: originalWave.origin.x,
        y: reflectionY,
        z: originalWave.origin.z,
      },
      energy: originalWave.config.energy * this.config.reflectionCoefficient,
      speed: originalWave.config.speed,
      attenuation: originalWave.config.attenuation,
      maxRadius: originalWave.config.maxRadius,
      duration: originalWave.config.duration,
    };

    const reflectionWave = new ShockWave(reflectionConfig);
    this.shockWaves.set(reflectionWave.id, reflectionWave);
  }

  /**
   * Remove inactive shock waves
   */
  private cleanupInactive(): void {
    const toRemove: string[] = [];

    for (const [id, wave] of this.shockWaves) {
      if (!wave.isActive()) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.shockWaves.delete(id);
    }
  }

  /**
   * Remove oldest wave (prioritize inactive, but remove active if needed)
   */
  private removeOldest(): void {
    let oldestId: string | null = null;
    let oldestAge = -1;
    let oldestInactiveId: string | null = null;
    let oldestInactiveAge = -1;

    // First pass: find oldest inactive wave
    for (const [id, wave] of this.shockWaves) {
      const age = wave.getAge();
      if (!wave.isActive() && age > oldestInactiveAge) {
        oldestInactiveId = id;
        oldestInactiveAge = age;
      }
      if (age > oldestAge) {
        oldestId = id;
        oldestAge = age;
      }
    }

    // Prefer removing inactive, fall back to oldest overall
    const toRemove = oldestInactiveId || oldestId;
    if (toRemove) {
      this.shockWaves.delete(toRemove);
    }
  }
}
