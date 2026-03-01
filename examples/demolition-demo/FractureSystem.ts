/**
 * FractureSystem.ts
 *
 * Main system for fracturing objects into debris fragments.
 * Manages fracturable objects, generates fragments, and tracks statistics.
 *
 * Week 8: Explosive Demolition - Day 1
 */

import { Fragment, type FragmentConfig, type FragmentGeometry, type Vector3 } from './Fragment';
import { FracturePattern, type BoundingVolume } from './FracturePattern';
import { Fracturable, type FractureEvent } from './Fracturable';

export interface FractureSystemConfig {
  /** Maximum number of fragments to track */
  maxFragments?: number;
  /** Auto-deactivate fragments at rest */
  autoDeactivate?: boolean;
  /** Deactivation threshold */
  deactivationThreshold?: number;
  /** Fragment resolution for Voronoi generation */
  voronoiResolution?: number;
}

export interface FractureStatistics {
  /** Total fracturable objects */
  totalObjects: number;
  /** Fractured objects */
  fracturedObjects: number;
  /** Total fragments */
  totalFragments: number;
  /** Active fragments */
  activeFragments: number;
  /** Total fracture events */
  fractureEvents: number;
  /** Average fragments per fracture */
  avgFragmentsPerFracture: number;
}

/**
 * Main fracture system
 */
export class FractureSystem {
  private readonly config: Required<FractureSystemConfig>;
  private readonly objects = new Map<string, Fracturable>();
  private readonly fragments = new Map<string, Fragment>();
  private readonly fractureEvents: FractureEvent[] = [];

  constructor(config: FractureSystemConfig = {}) {
    this.config = {
      maxFragments: config.maxFragments ?? 100000,
      autoDeactivate: config.autoDeactivate ?? true,
      deactivationThreshold: config.deactivationThreshold ?? 0.1,
      voronoiResolution: config.voronoiResolution ?? 10,
    };
  }

  /**
   * Add fracturable object
   */
  public addObject(object: Fracturable): void {
    this.objects.set(object.id, object);
  }

  /**
   * Remove object
   */
  public removeObject(objectId: string): void {
    this.objects.delete(objectId);
  }

  /**
   * Get object
   */
  public getObject(objectId: string): Fracturable | undefined {
    return this.objects.get(objectId);
  }

  /**
   * Apply impact to object
   */
  public applyImpactToObject(objectId: string, impulse: Vector3, contactPoint: Vector3): boolean {
    const object = this.objects.get(objectId);
    if (!object) return false;

    const fractured = object.applyImpact(impulse, contactPoint);

    if (fractured) {
      this.fractureObject(object);
    }

    return fractured;
  }

  /**
   * Fracture an object into fragments
   */
  public fractureObject(object: Fracturable): Fragment[] {
    if (!object.isFractured()) return [];

    const fractureEvent = object.getFractureEvent();
    if (!fractureEvent) return [];

    // Check if fragments have already been generated for this event
    if (fractureEvent.fragmentsGenerated) return [];

    // Generate fracture pattern
    const pattern = new FracturePattern({
      type: object.getFractureType(),
      fragmentCount: object.getFragmentCount(),
      seed: Date.now(),
    });

    // Define bounds
    const bounds: BoundingVolume = {
      min: {
        x: object.geometry.min.x + object.position.x,
        y: object.geometry.min.y + object.position.y,
        z: object.geometry.min.z + object.position.z,
      },
      max: {
        x: object.geometry.max.x + object.position.x,
        y: object.geometry.max.y + object.position.y,
        z: object.geometry.max.z + object.position.z,
      },
    };

    // Generate fracture points
    const points = pattern.generatePoints(bounds);

    // Generate Voronoi cells
    const cells = pattern.generateVoronoiCells(points, bounds, this.config.voronoiResolution);

    // Convert cells to geometry
    const geometries = pattern.cellsToGeometry(cells);

    // Create fragments
    const newFragments: Fragment[] = [];

    for (const geometry of geometries) {
      if (this.fragments.size >= this.config.maxFragments) {
        console.warn('Max fragments reached, skipping remaining');
        break;
      }

      // Calculate initial velocity (inherit from object + explosion)
      const velocity = this.calculateFragmentVelocity(
        object,
        geometry.centroid,
        fractureEvent.impactPoint,
        fractureEvent.impulse
      );

      const config: FragmentConfig = {
        geometry,
        density: object.material.density,
        restitution: object.material.restitution,
        friction: object.material.friction,
        position: {
          x: geometry.centroid.x,
          y: geometry.centroid.y,
          z: geometry.centroid.z,
        },
        velocity,
      };

      const fragment = new Fragment(config);
      this.fragments.set(fragment.id, fragment);
      newFragments.push(fragment);
    }

    // Mark fragments as generated
    fractureEvent.fragmentsGenerated = true;

    // Record event
    this.fractureEvents.push({
      ...fractureEvent,
      fragmentCount: newFragments.length,
      fragmentsGenerated: true,
    });

    // Remove object
    this.objects.delete(object.id);

    return newFragments;
  }

  /**
   * Update all fragments
   */
  public update(dt: number, gravity?: Vector3): void {
    if (dt <= 0) return;

    for (const fragment of this.fragments.values()) {
      if (!fragment.isActive()) continue;

      fragment.update(dt, gravity);

      // Handle ground collision
      fragment.handleGroundCollision(0);

      // Auto-deactivate if at rest
      if (this.config.autoDeactivate && fragment.isAtRest(this.config.deactivationThreshold)) {
        fragment.deactivate();
      }
    }
  }

  /**
   * Get all fragments
   */
  public getFragments(): Fragment[] {
    return Array.from(this.fragments.values());
  }

  /**
   * Get active fragments
   */
  public getActiveFragments(): Fragment[] {
    return this.getFragments().filter((f) => f.isActive());
  }

  /**
   * Get fragment by ID
   */
  public getFragment(id: string): Fragment | undefined {
    return this.fragments.get(id);
  }

  /**
   * Clear all fragments
   */
  public clearFragments(): void {
    this.fragments.clear();
  }

  /**
   * Get all fracturable objects
   */
  public getObjects(): Fracturable[] {
    return Array.from(this.objects.values());
  }

  /**
   * Get fracture events
   */
  public getFractureEvents(): FractureEvent[] {
    return [...this.fractureEvents];
  }

  /**
   * Clear fracture events
   */
  public clearFractureEvents(): void {
    this.fractureEvents.length = 0;
  }

  /**
   * Get statistics
   */
  public getStatistics(): FractureStatistics {
    const totalFragments = this.fragments.size;
    const activeFragments = this.getActiveFragments().length;

    return {
      totalObjects: this.objects.size,
      fracturedObjects: this.fractureEvents.length,
      totalFragments,
      activeFragments,
      fractureEvents: this.fractureEvents.length,
      avgFragmentsPerFracture:
        this.fractureEvents.length > 0
          ? totalFragments / this.fractureEvents.length
          : 0,
    };
  }

  /**
   * Reset system
   */
  public reset(): void {
    this.fragments.clear();
    this.fractureEvents.length = 0;

    // Reset all objects
    for (const object of this.objects.values()) {
      object.reset();
    }
  }

  /**
   * Calculate fragment velocity from object velocity and explosion
   */
  private calculateFragmentVelocity(
    object: Fracturable,
    fragmentPos: Vector3,
    impactPoint: Vector3,
    impulse: Vector3
  ): Vector3 {
    // Base velocity from object
    const velocity = { ...object.velocity };

    // Calculate direction from impact point to fragment
    const dx = fragmentPos.x - impactPoint.x;
    const dy = fragmentPos.y - impactPoint.y;
    const dz = fragmentPos.z - impactPoint.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 0) {
      // Normalize direction
      const dirX = dx / dist;
      const dirY = dy / dist;
      const dirZ = dz / dist;

      // Add explosion velocity (inversely proportional to distance)
      const impulseMag = Math.sqrt(
        impulse.x * impulse.x + impulse.y * impulse.y + impulse.z * impulse.z
      );
      const explosionSpeed = (impulseMag / object.mass) * (1 / (1 + dist));

      velocity.x += dirX * explosionSpeed;
      velocity.y += dirY * explosionSpeed;
      velocity.z += dirZ * explosionSpeed;
    }

    return velocity;
  }
}
