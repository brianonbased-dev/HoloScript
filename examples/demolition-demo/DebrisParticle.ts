/**
 * DebrisParticle.ts
 *
 * Individual debris particle with physics and visual properties.
 * Optimized for high particle counts (120K+).
 *
 * Week 8: Explosive Demolition - Day 3
 */

import type { Vector3 } from './Fragment';

export type ParticleShapeType = 'cube' | 'sphere' | 'shard' | 'dust';

export interface ParticleColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface DebrisParticleConfig {
  /** Initial position */
  position: Vector3;
  /** Initial velocity */
  velocity?: Vector3;
  /** Initial angular velocity */
  angularVelocity?: Vector3;
  /** Particle size */
  size?: number;
  /** Particle mass */
  mass?: number;
  /** Particle lifetime (seconds, 0 = infinite) */
  lifetime?: number;
  /** Particle color */
  color?: ParticleColor;
  /** Particle shape */
  shape?: ParticleShapeType;
  /** Restitution coefficient */
  restitution?: number;
  /** Friction coefficient */
  friction?: number;
}

/**
 * Individual debris particle
 */
export class DebrisParticle {
  // Physics
  public position: Vector3;
  public velocity: Vector3;
  public angularVelocity: Vector3;
  public rotation: Vector3;

  // Properties
  public size: number;
  public mass: number;
  public lifetime: number;
  public restitution: number;
  public friction: number;

  // Visual
  public color: ParticleColor;
  public shape: ParticleShapeType;

  // State
  private active = true;
  private age = 0;
  private spatialHashCell: string | null = null;

  constructor(config: DebrisParticleConfig) {
    this.position = { ...config.position };
    this.velocity = config.velocity || { x: 0, y: 0, z: 0 };
    this.angularVelocity = config.angularVelocity || { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };

    this.size = config.size ?? 0.1;
    this.mass = config.mass ?? 0.01;
    this.lifetime = config.lifetime ?? 0;
    this.restitution = config.restitution ?? 0.3;
    this.friction = config.friction ?? 0.5;

    this.color = config.color || { r: 0.5, g: 0.5, b: 0.5, a: 1.0 };
    this.shape = config.shape || 'cube';
  }

  /**
   * Update particle physics
   */
  public update(dt: number, gravity: Vector3): void {
    if (!this.active || dt <= 0) return;

    // Update age
    this.age += dt;

    // Check lifetime
    if (this.lifetime > 0 && this.age >= this.lifetime) {
      this.active = false;
      return;
    }

    // Update position first (explicit Euler: uses current velocity before gravity is applied).
    // This avoids large overshoots for big timesteps (e.g. dt=1.0 in tests) that would
    // cause particles to artificially pass through the ground and bounce upward.
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Apply gravity to velocity after position update
    this.velocity.x += gravity.x * dt;
    this.velocity.y += gravity.y * dt;
    this.velocity.z += gravity.z * dt;

    // Update rotation
    this.rotation.x += this.angularVelocity.x * dt;
    this.rotation.y += this.angularVelocity.y * dt;
    this.rotation.z += this.angularVelocity.z * dt;

    // Normalize rotation to 0-2π
    this.rotation.x = this.rotation.x % (2 * Math.PI);
    this.rotation.y = this.rotation.y % (2 * Math.PI);
    this.rotation.z = this.rotation.z % (2 * Math.PI);
  }

  /**
   * Handle ground collision
   */
  public handleGroundCollision(groundY: number): boolean {
    if (this.position.y - this.size / 2 <= groundY) {
      // Place on ground
      this.position.y = groundY + this.size / 2;

      // Apply restitution to vertical velocity
      if (this.velocity.y < 0) {
        this.velocity.y *= -this.restitution;

        // Apply friction to horizontal velocity
        this.velocity.x *= 1 - this.friction;
        this.velocity.z *= 1 - this.friction;

        // Reduce angular velocity
        this.angularVelocity.x *= 1 - this.friction;
        this.angularVelocity.y *= 1 - this.friction;
        this.angularVelocity.z *= 1 - this.friction;

        return true;
      }
    }

    return false;
  }

  /**
   * Apply impulse to particle
   */
  public applyImpulse(impulse: Vector3): void {
    if (!this.active) return;

    this.velocity.x += impulse.x / this.mass;
    this.velocity.y += impulse.y / this.mass;
    this.velocity.z += impulse.z / this.mass;
  }

  /**
   * Apply force over time
   */
  public applyForce(force: Vector3, dt: number): void {
    if (!this.active) return;

    const impulse: Vector3 = {
      x: force.x * dt,
      y: force.y * dt,
      z: force.z * dt,
    };

    this.applyImpulse(impulse);
  }

  /**
   * Check if particle is at rest
   */
  public isAtRest(threshold: number): boolean {
    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x +
        this.velocity.y * this.velocity.y +
        this.velocity.z * this.velocity.z
    );

    const angularSpeed = Math.sqrt(
      this.angularVelocity.x * this.angularVelocity.x +
        this.angularVelocity.y * this.angularVelocity.y +
        this.angularVelocity.z * this.angularVelocity.z
    );

    return speed < threshold && angularSpeed < threshold;
  }

  /**
   * Get distance from point
   */
  public distanceFrom(point: Vector3): number {
    const dx = this.position.x - point.x;
    const dy = this.position.y - point.y;
    const dz = this.position.z - point.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Get kinetic energy
   */
  public getKineticEnergy(): number {
    const linearKE =
      0.5 *
      this.mass *
      (this.velocity.x * this.velocity.x +
        this.velocity.y * this.velocity.y +
        this.velocity.z * this.velocity.z);

    const angularKE =
      0.5 *
      this.mass *
      this.size *
      this.size *
      (this.angularVelocity.x * this.angularVelocity.x +
        this.angularVelocity.y * this.angularVelocity.y +
        this.angularVelocity.z * this.angularVelocity.z);

    return linearKE + angularKE;
  }

  /**
   * Check if particle is active
   */
  public isActive(): boolean {
    return this.active;
  }

  /**
   * Deactivate particle
   */
  public deactivate(): void {
    this.active = false;
  }

  /**
   * Activate particle
   */
  public activate(): void {
    this.active = true;
    this.age = 0;
  }

  /**
   * Get particle age
   */
  public getAge(): number {
    return this.age;
  }

  /**
   * Get lifetime progress (0-1)
   */
  public getLifetimeProgress(): number {
    if (this.lifetime <= 0) return 0;
    return Math.min(this.age / this.lifetime, 1);
  }

  /**
   * Reset particle with new config
   */
  public reset(config: DebrisParticleConfig): void {
    this.position = { ...config.position };
    this.velocity = config.velocity || { x: 0, y: 0, z: 0 };
    this.angularVelocity = config.angularVelocity || { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };

    this.size = config.size ?? 0.1;
    this.mass = config.mass ?? 0.01;
    this.lifetime = config.lifetime ?? 0;
    this.restitution = config.restitution ?? 0.3;
    this.friction = config.friction ?? 0.5;

    this.color = config.color || { r: 0.5, g: 0.5, b: 0.5, a: 1.0 };
    this.shape = config.shape || 'cube';

    this.active = true;
    this.age = 0;
    this.spatialHashCell = null;
  }

  /**
   * Set spatial hash cell (internal)
   */
  public setSpatialHashCell(cell: string | null): void {
    this.spatialHashCell = cell;
  }

  /**
   * Get spatial hash cell (internal)
   */
  public getSpatialHashCell(): string | null {
    return this.spatialHashCell;
  }
}
