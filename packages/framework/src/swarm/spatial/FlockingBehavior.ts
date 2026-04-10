/**
 * FlockingBehavior - Boid-based swarm movement
 * HoloScript v3.2 - Autonomous Agent Swarms
 *
 * Implements Craig Reynolds' Boids algorithm:
 * - Separation: Steer to avoid crowding neighbors
 * - Alignment: Steer towards average heading of neighbors
 * - Cohesion: Steer towards average position of neighbors
 */

import { Vector3 } from './Vector3';

/**
 * Boid agent state
 */
export interface IBoid {
  id: string;
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  maxSpeed: number;
  maxForce: number;
}

/**
 * Flocking configuration
 */
export interface IFlockingConfig {
  /** Radius for separation behavior */
  separationRadius: number;
  /** Radius for alignment behavior */
  alignmentRadius: number;
  /** Radius for cohesion behavior */
  cohesionRadius: number;
  /** Weight for separation force */
  separationWeight: number;
  /** Weight for alignment force */
  alignmentWeight: number;
  /** Weight for cohesion force */
  cohesionWeight: number;
  /** Maximum speed */
  maxSpeed: number;
  /** Maximum steering force */
  maxForce: number;
  /** Boundary mode */
  boundaryMode: 'wrap' | 'bounce' | 'contain';
  /** World bounds (if boundaryMode is not 'none') */
  worldBounds?: {
    min: Vector3;
    max: Vector3;
  };
}

/**
 * FlockingBehavior - Manages Boid-based swarm movement
 */
export class FlockingBehavior {
  private boids: Map<string, IBoid> = new Map();
  private config: IFlockingConfig;

  constructor(config?: Partial<IFlockingConfig>) {
    this.config = {
      separationRadius: 25,
      alignmentRadius: 50,
      cohesionRadius: 50,
      separationWeight: 1.5,
      alignmentWeight: 1.0,
      cohesionWeight: 1.0,
      maxSpeed: 4,
      maxForce: 0.1,
      boundaryMode: 'wrap',
      ...config,
    };
  }

  /**
   * Add a boid to the flock
   */
  addBoid(id: string, position: Vector3, velocity?: Vector3): IBoid {
    const boid: IBoid = {
      id,
      position: position.clone(),
      velocity:
        velocity?.clone() ??
        new Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ),
      acceleration: Vector3.zero(),
      maxSpeed: this.config.maxSpeed,
      maxForce: this.config.maxForce,
    };

    this.boids.set(id, boid);
    return boid;
  }

  /**
   * Remove a boid from the flock
   */
  removeBoid(id: string): boolean {
    return this.boids.delete(id);
  }

  /**
   * Get a boid by ID
   */
  getBoid(id: string): IBoid | undefined {
    return this.boids.get(id);
  }

  /**
   * Get all boids
   */
  getAllBoids(): IBoid[] {
    return [...this.boids.values()];
  }

  /**
   * Update boid position manually
   */
  setBoidPosition(id: string, position: Vector3): void {
    const boid = this.boids.get(id);
    if (boid) {
      boid.position = position.clone();
    }
  }

  /**
   * Update a single boid
   */
  updateBoid(boid: IBoid, neighbors: IBoid[]): void {
    const separation = this.separate(boid, neighbors);
    const alignment = this.align(boid, neighbors);
    const cohesion = this.cohere(boid, neighbors);

    // Apply weights
    const separationForce = separation.multiply(this.config.separationWeight);
    const alignmentForce = alignment.multiply(this.config.alignmentWeight);
    const cohesionForce = cohesion.multiply(this.config.cohesionWeight);

    // Accumulate forces
    boid.acceleration = boid.acceleration
      .add(separationForce)
      .add(alignmentForce)
      .add(cohesionForce);

    // Update velocity
    boid.velocity = boid.velocity.add(boid.acceleration);
    boid.velocity = boid.velocity.clampMagnitude(boid.maxSpeed);

    // Update position
    boid.position = boid.position.add(boid.velocity);

    // Reset acceleration
    boid.acceleration = Vector3.zero();

    // Handle boundaries
    this.handleBoundaries(boid);
  }

  /**
   * Update all boids in the flock
   */
  update(): void {
    const boidList = this.getAllBoids();

    for (const boid of boidList) {
      const neighbors = this.findNeighbors(
        boid,
        Math.max(
          this.config.separationRadius,
          this.config.alignmentRadius,
          this.config.cohesionRadius
        )
      );
      this.updateBoid(boid, neighbors);
    }
  }

  /**
   * Separation: Steer away from nearby boids
   */
  separate(boid: IBoid, neighbors: IBoid[]): Vector3 {
    let steer = Vector3.zero();
    let count = 0;

    for (const other of neighbors) {
      if (other.id === boid.id) continue;

      const distance = boid.position.distanceTo(other.position);
      if (distance > 0 && distance < this.config.separationRadius) {
        // Calculate vector pointing away from neighbor
        let diff = boid.position.subtract(other.position);
        diff = diff.normalize();
        diff = diff.divide(distance); // Weight by distance (closer = stronger)
        steer = steer.add(diff);
        count++;
      }
    }

    if (count > 0) {
      steer = steer.divide(count);
    }

    if (steer.magnitude() > 0) {
      steer = steer.normalize();
      steer = steer.multiply(boid.maxSpeed);
      steer = steer.subtract(boid.velocity);
      steer = steer.clampMagnitude(boid.maxForce);
    }

    return steer;
  }

  /**
   * Alignment: Steer towards average heading of neighbors
   */
  align(boid: IBoid, neighbors: IBoid[]): Vector3 {
    let sum = Vector3.zero();
    let count = 0;

    for (const other of neighbors) {
      if (other.id === boid.id) continue;

      const distance = boid.position.distanceTo(other.position);
      if (distance > 0 && distance < this.config.alignmentRadius) {
        sum = sum.add(other.velocity);
        count++;
      }
    }

    if (count > 0) {
      sum = sum.divide(count);
      sum = sum.normalize();
      sum = sum.multiply(boid.maxSpeed);
      const steer = sum.subtract(boid.velocity);
      return steer.clampMagnitude(boid.maxForce);
    }

    return Vector3.zero();
  }

  /**
   * Cohesion: Steer towards center of mass of neighbors
   */
  cohere(boid: IBoid, neighbors: IBoid[]): Vector3 {
    let sum = Vector3.zero();
    let count = 0;

    for (const other of neighbors) {
      if (other.id === boid.id) continue;

      const distance = boid.position.distanceTo(other.position);
      if (distance > 0 && distance < this.config.cohesionRadius) {
        sum = sum.add(other.position);
        count++;
      }
    }

    if (count > 0) {
      const center = sum.divide(count);
      return this.seek(boid, center);
    }

    return Vector3.zero();
  }

  /**
   * Seek: Steer towards a target location
   */
  seek(boid: IBoid, target: Vector3): Vector3 {
    let desired = target.subtract(boid.position);
    desired = desired.normalize();
    desired = desired.multiply(boid.maxSpeed);
    const steer = desired.subtract(boid.velocity);
    return steer.clampMagnitude(boid.maxForce);
  }

  /**
   * Flee: Steer away from a target location
   */
  flee(boid: IBoid, target: Vector3): Vector3 {
    return this.seek(boid, target).multiply(-1);
  }

  /**
   * Arrive: Seek with slowing as approaching target
   */
  arrive(boid: IBoid, target: Vector3, slowingRadius: number): Vector3 {
    let desired = target.subtract(boid.position);
    const distance = desired.magnitude();

    if (distance < slowingRadius) {
      // Slow down proportionally
      const speed = (distance / slowingRadius) * boid.maxSpeed;
      desired = desired.normalize().multiply(speed);
    } else {
      desired = desired.normalize().multiply(boid.maxSpeed);
    }

    const steer = desired.subtract(boid.velocity);
    return steer.clampMagnitude(boid.maxForce);
  }

  /**
   * Find neighbors within radius
   */
  findNeighbors(boid: IBoid, radius: number): IBoid[] {
    const radiusSquared = radius * radius;
    const neighbors: IBoid[] = [];

    for (const other of this.boids.values()) {
      if (other.id === boid.id) continue;
      const distSq = boid.position.distanceToSquared(other.position);
      if (distSq < radiusSquared) {
        neighbors.push(other);
      }
    }

    return neighbors;
  }

  /**
   * Handle world boundaries
   */
  private handleBoundaries(boid: IBoid): void {
    if (!this.config.worldBounds) return;

    const { min, max } = this.config.worldBounds;

    switch (this.config.boundaryMode) {
      case 'wrap':
        this.wrapPosition(boid, min, max);
        break;
      case 'bounce':
        this.bouncePosition(boid, min, max);
        break;
      case 'contain':
        this.containPosition(boid, min, max);
        break;
    }
  }

  /**
   * Wrap position to opposite side
   */
  private wrapPosition(boid: IBoid, min: Vector3, max: Vector3): void {
    const size = max.subtract(min);

    if (boid.position.x < min.x) boid.position.x += size.x;
    if (boid.position.x > max.x) boid.position.x -= size.x;
    if (boid.position.y < min.y) boid.position.y += size.y;
    if (boid.position.y > max.y) boid.position.y -= size.y;
    if (boid.position.z < min.z) boid.position.z += size.z;
    if (boid.position.z > max.z) boid.position.z -= size.z;
  }

  /**
   * Bounce off boundaries
   */
  private bouncePosition(boid: IBoid, min: Vector3, max: Vector3): void {
    if (boid.position.x < min.x || boid.position.x > max.x) {
      boid.velocity.x *= -1;
      boid.position.x = Math.max(min.x, Math.min(max.x, boid.position.x));
    }
    if (boid.position.y < min.y || boid.position.y > max.y) {
      boid.velocity.y *= -1;
      boid.position.y = Math.max(min.y, Math.min(max.y, boid.position.y));
    }
    if (boid.position.z < min.z || boid.position.z > max.z) {
      boid.velocity.z *= -1;
      boid.position.z = Math.max(min.z, Math.min(max.z, boid.position.z));
    }
  }

  /**
   * Contain within boundaries (clamp)
   */
  private containPosition(boid: IBoid, min: Vector3, max: Vector3): void {
    boid.position.x = Math.max(min.x, Math.min(max.x, boid.position.x));
    boid.position.y = Math.max(min.y, Math.min(max.y, boid.position.y));
    boid.position.z = Math.max(min.z, Math.min(max.z, boid.position.z));
  }

  /**
   * Apply external force to a boid
   */
  applyForce(id: string, force: Vector3): void {
    const boid = this.boids.get(id);
    if (boid) {
      boid.acceleration = boid.acceleration.add(force);
    }
  }

  /**
   * Apply force to all boids
   */
  applyForceToAll(force: Vector3): void {
    for (const boid of this.boids.values()) {
      boid.acceleration = boid.acceleration.add(force);
    }
  }

  /**
   * Get flock center of mass
   */
  getFlockCenter(): Vector3 {
    if (this.boids.size === 0) return Vector3.zero();

    let sum = Vector3.zero();
    for (const boid of this.boids.values()) {
      sum = sum.add(boid.position);
    }
    return sum.divide(this.boids.size);
  }

  /**
   * Get average velocity (direction) of flock
   */
  getFlockDirection(): Vector3 {
    if (this.boids.size === 0) return Vector3.zero();

    let sum = Vector3.zero();
    for (const boid of this.boids.values()) {
      sum = sum.add(boid.velocity);
    }
    return sum.divide(this.boids.size).normalize();
  }

  /**
   * Get flock spread (radius from center)
   */
  getFlockSpread(): number {
    if (this.boids.size <= 1) return 0;

    const center = this.getFlockCenter();
    let maxDist = 0;

    for (const boid of this.boids.values()) {
      const dist = boid.position.distanceTo(center);
      if (dist > maxDist) maxDist = dist;
    }

    return maxDist;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<IFlockingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): IFlockingConfig {
    return { ...this.config };
  }
}
