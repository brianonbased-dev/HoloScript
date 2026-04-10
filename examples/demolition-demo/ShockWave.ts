/**
 * ShockWave.ts
 *
 * Represents a spherical shock wave from an explosion.
 * Propagates outward, applying force to objects and fragments.
 *
 * Week 8: Explosive Demolition - Day 2
 */

import type { Vector3 } from './Fragment';

export interface ShockWaveConfig {
  /** Origin point of explosion */
  origin: Vector3;
  /** Initial energy (joules) */
  energy: number;
  /** Propagation speed (m/s) */
  speed?: number;
  /** Attenuation factor (0-1) */
  attenuation?: number;
  /** Maximum radius */
  maxRadius?: number;
  /** Duration (seconds) */
  duration?: number;
}

export interface ShockWaveImpact {
  /** Impact location */
  position: Vector3;
  /** Impact direction (normalized) */
  direction: Vector3;
  /** Impact force magnitude */
  forceMagnitude: number;
  /** Pressure at impact point (Pa) */
  pressure: number;
  /** Distance from origin */
  distance: number;
}

/**
 * Spherical shock wave
 */
export class ShockWave {
  public readonly id: string;
  public readonly origin: Vector3;
  public readonly config: Required<ShockWaveConfig>;

  private currentRadius = 0;
  private age = 0;
  private active = true;

  constructor(config: ShockWaveConfig) {
    this.id = `shockwave_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.origin = { ...config.origin };

    this.config = {
      origin: this.origin,
      energy: config.energy,
      speed: config.speed ?? 343, // Speed of sound in air (m/s)
      attenuation: config.attenuation ?? 0.85,
      maxRadius: config.maxRadius ?? 1000,
      duration: config.duration ?? 5.0,
    };
  }

  /**
   * Update shock wave propagation
   */
  public update(dt: number): void {
    if (!this.active || dt <= 0) return;

    // Propagate wavefront
    this.currentRadius += this.config.speed * dt;

    // Update age
    this.age += dt;

    // Deactivate if exceeded max radius or duration
    if (this.currentRadius >= this.config.maxRadius || this.age >= this.config.duration) {
      this.active = false;
    }
  }

  /**
   * Calculate impact at a point
   */
  public calculateImpact(point: Vector3): ShockWaveImpact | null {
    if (!this.active) return null;

    // Calculate distance from origin
    const dx = point.x - this.origin.x;
    const dy = point.y - this.origin.y;
    const dz = point.z - this.origin.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Check if point is within wavefront range
    const wavefrontThickness = this.config.speed * 0.1; // Wavefront is thin
    const atWavefront = Math.abs(distance - this.currentRadius) < wavefrontThickness;

    if (!atWavefront || distance === 0) return null;

    // Normalize direction
    const direction: Vector3 = {
      x: dx / distance,
      y: dy / distance,
      z: dz / distance,
    };

    // Calculate force based on inverse square law with attenuation
    const baseForce = this.config.energy / (4 * Math.PI * distance * distance);
    const attenuationFactor = Math.pow(this.config.attenuation, this.age);
    const forceMagnitude = baseForce * attenuationFactor;

    // Calculate pressure (simplified)
    const pressure = forceMagnitude / (4 * Math.PI * this.currentRadius * this.currentRadius);

    return {
      position: { ...point },
      direction,
      forceMagnitude,
      pressure,
      distance,
    };
  }

  /**
   * Check if point is affected by shock wave
   */
  public affectsPoint(point: Vector3): boolean {
    if (!this.active) return false;

    const dx = point.x - this.origin.x;
    const dy = point.y - this.origin.y;
    const dz = point.z - this.origin.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const wavefrontThickness = this.config.speed * 0.1;
    return Math.abs(distance - this.currentRadius) < wavefrontThickness;
  }

  /**
   * Get current radius
   */
  public getRadius(): number {
    return this.currentRadius;
  }

  /**
   * Get age
   */
  public getAge(): number {
    return this.age;
  }

  /**
   * Check if active
   */
  public isActive(): boolean {
    return this.active;
  }

  /**
   * Deactivate shock wave
   */
  public deactivate(): void {
    this.active = false;
  }

  /**
   * Get energy at current time
   */
  public getCurrentEnergy(): number {
    const attenuationFactor = Math.pow(this.config.attenuation, this.age);
    return this.config.energy * attenuationFactor;
  }

  /**
   * Get wavefront area
   */
  public getWavefrontArea(): number {
    return 4 * Math.PI * this.currentRadius * this.currentRadius;
  }

  /**
   * Get peak overpressure at distance
   */
  public getPeakOverpressure(distance: number): number {
    if (distance === 0) return Infinity;

    // Simplified overpressure calculation
    // Real formula would use TNT equivalent and scaled distance
    const scaledDistance = distance / Math.cbrt(this.config.energy);
    const overpressure = this.config.energy / (distance * distance * scaledDistance);

    const attenuationFactor = Math.pow(this.config.attenuation, this.age);
    return overpressure * attenuationFactor;
  }

  /**
   * Check if shock wave has reached a point
   */
  public hasReached(point: Vector3): boolean {
    const dx = point.x - this.origin.x;
    const dy = point.y - this.origin.y;
    const dz = point.z - this.origin.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return distance <= this.currentRadius;
  }

  /**
   * Get time to reach a point
   */
  public getTimeToReach(point: Vector3): number {
    const dx = point.x - this.origin.x;
    const dy = point.y - this.origin.y;
    const dz = point.z - this.origin.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (this.hasReached(point)) return 0;

    return (distance - this.currentRadius) / this.config.speed;
  }

  /**
   * Get comprehensive statistics about the shock wave's current state
   *
   * @returns An object containing current shock wave statistics:
   * - `radius`: Current propagation radius in meters
   * - `age`: Time elapsed since shock wave creation in seconds
   * - `active`: Whether the shock wave is still propagating
   * - `energy`: Current energy level after attenuation in joules
   * - `wavefrontArea`: Surface area of the current wavefront in square meters
   * - `coverage`: Percentage of maximum radius reached (0-100)
   *
   * @example
   * ```typescript
   * const shockWave = new ShockWave({ origin: {x: 0, y: 0, z: 0}, energy: 1000000 });
   * shockWave.update(1.0); // Update for 1 second
   * const stats = shockWave.getStatistics();
   * console.log(`Shock wave has traveled ${stats.radius}m and covered ${stats.coverage}%`);
   * ```
   */
  public getStatistics(): {
    radius: number;
    age: number;
    active: boolean;
    energy: number;
    wavefrontArea: number;
    coverage: number; // Percentage of max radius
  } {
    return {
      radius: this.currentRadius,
      age: this.age,
      active: this.active,
      energy: this.getCurrentEnergy(),
      wavefrontArea: this.getWavefrontArea(),
      coverage: (this.currentRadius / this.config.maxRadius) * 100,
    };
  }
}
