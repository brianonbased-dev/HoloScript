/**
 * Fracturable.ts
 *
 * Represents an object that can be fractured into debris.
 * Defines break conditions, material properties, and fracture behavior.
 *
 * Week 8: Explosive Demolition - Day 1
 */

import type { Vector3, FragmentGeometry } from './Fragment';
import type { FractureType } from './FracturePattern';

export interface FracturableGeometry {
  /** Bounding box min */
  min: Vector3;
  /** Bounding box max */
  max: Vector3;
  /** Original mesh (optional) */
  mesh?: {
    vertices: Float32Array;
    indices: Uint32Array;
    normals: Float32Array;
  };
}

export interface MaterialProperties {
  /** Material density (kg/m³) */
  density: number;
  /** Fracture threshold (impulse magnitude) */
  fractureThreshold: number;
  /** Restitution coefficient */
  restitution: number;
  /** Friction coefficient */
  friction: number;
  /** Hardness (affects fragment size) */
  hardness: number;
}

export interface FracturableConfig {
  /** Object ID */
  id?: string;
  /** Object name */
  name?: string;
  /** Geometry definition */
  geometry: FracturableGeometry;
  /** Material properties */
  material: Partial<MaterialProperties>;
  /** Fracture pattern type */
  fractureType?: FractureType;
  /** Number of fragments when broken */
  fragmentCount?: number;
  /** Current position */
  position?: Vector3;
  /** Current velocity */
  velocity?: Vector3;
}

export interface FractureEvent {
  /** Object that was fractured */
  objectId: string;
  /** Impact location */
  impactPoint: Vector3;
  /** Impact impulse */
  impulse: Vector3;
  /** Impact magnitude */
  impulseMagnitude: number;
  /** Time of fracture */
  timestamp: number;
  /** Generated fragments */
  fragmentCount: number;
  /** Whether fragments have been generated */
  fragmentsGenerated?: boolean;
}

/**
 * Object that can be fractured
 */
export class Fracturable {
  public readonly id: string;
  public readonly name: string;
  public readonly geometry: FracturableGeometry;
  public readonly material: Required<MaterialProperties>;

  public position: Vector3;
  public velocity: Vector3;
  public mass: number;

  private fractureType: FractureType;
  private fragmentCount: number;
  private fractured = false;
  private fractureEvent?: FractureEvent;
  private health: number;

  constructor(config: FracturableConfig) {
    this.id = config.id || `fracturable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name || 'Unnamed Object';
    this.geometry = config.geometry;

    // Default material properties
    this.material = {
      density: config.material.density ?? 2500, // Concrete default
      fractureThreshold: config.material.fractureThreshold ?? 1000,
      restitution: config.material.restitution ?? 0.3,
      friction: config.material.friction ?? 0.5,
      hardness: config.material.hardness ?? 0.5,
    };

    this.position = config.position || { x: 0, y: 0, z: 0 };
    this.velocity = config.velocity || { x: 0, y: 0, z: 0 };

    this.fractureType = config.fractureType || 'voronoi';
    this.fragmentCount = config.fragmentCount || 10;

    // Calculate mass from volume and density
    this.mass = this.calculateMass();

    // Initialize health (can take multiple hits before breaking)
    this.health = this.material.fractureThreshold;
  }

  /**
   * Apply impact to object
   */
  public applyImpact(impulse: Vector3, contactPoint: Vector3): boolean {
    if (this.fractured) return false;

    const impulseMagnitude = Math.sqrt(
      impulse.x * impulse.x + impulse.y * impulse.y + impulse.z * impulse.z
    );

    // Reduce health
    this.health -= impulseMagnitude;

    // Check if object should fracture
    if (this.health <= 0) {
      this.fractureEvent = {
        objectId: this.id,
        impactPoint: { ...contactPoint },
        impulse: { ...impulse },
        impulseMagnitude,
        timestamp: performance.now(),
        fragmentCount: this.fragmentCount,
      };

      this.fractured = true;
      return true;
    }

    // Apply velocity change (if not fractured)
    this.velocity.x += impulse.x / this.mass;
    this.velocity.y += impulse.y / this.mass;
    this.velocity.z += impulse.z / this.mass;

    return false;
  }

  /**
   * Check if object is fractured
   */
  public isFractured(): boolean {
    return this.fractured;
  }

  /**
   * Get fracture event
   */
  public getFractureEvent(): FractureEvent | undefined {
    return this.fractureEvent;
  }

  /**
   * Get fracture pattern type
   */
  public getFractureType(): FractureType {
    return this.fractureType;
  }

  /**
   * Get fragment count
   */
  public getFragmentCount(): number {
    return this.fragmentCount;
  }

  /**
   * Get current health
   */
  public getHealth(): number {
    return Math.max(0, this.health);
  }

  /**
   * Get health percentage
   */
  public getHealthPercentage(): number {
    return (this.health / this.material.fractureThreshold) * 100;
  }

  /**
   * Reset object (for reuse)
   */
  public reset(): void {
    this.fractured = false;
    this.fractureEvent = undefined;
    this.health = this.material.fractureThreshold;
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  /**
   * Get volume
   */
  public getVolume(): number {
    const { min, max } = this.geometry;
    return (max.x - min.x) * (max.y - min.y) * (max.z - min.z);
  }

  /**
   * Get center point
   */
  public getCenter(): Vector3 {
    const { min, max } = this.geometry;
    return {
      x: (min.x + max.x) / 2 + this.position.x,
      y: (min.y + max.y) / 2 + this.position.y,
      z: (min.z + max.z) / 2 + this.position.z,
    };
  }

  /**
   * Check if point is inside object
   */
  public containsPoint(point: Vector3): boolean {
    const { min, max } = this.geometry;
    const localPoint = {
      x: point.x - this.position.x,
      y: point.y - this.position.y,
      z: point.z - this.position.z,
    };

    return (
      localPoint.x >= min.x &&
      localPoint.x <= max.x &&
      localPoint.y >= min.y &&
      localPoint.y <= max.y &&
      localPoint.z >= min.z &&
      localPoint.z <= max.z
    );
  }

  /**
   * Get distance from point
   */
  public distanceFromPoint(point: Vector3): number {
    const center = this.getCenter();
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const dz = point.z - center.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculate mass from volume and density
   */
  private calculateMass(): number {
    return this.getVolume() * this.material.density;
  }
}

/**
 * Preset materials
 */
export const MATERIALS = {
  CONCRETE: {
    density: 2400,
    fractureThreshold: 5000,
    restitution: 0.2,
    friction: 0.7,
    hardness: 0.6,
  },
  BRICK: {
    density: 1800,
    fractureThreshold: 2000,
    restitution: 0.3,
    friction: 0.6,
    hardness: 0.4,
  },
  GLASS: {
    density: 2500,
    fractureThreshold: 500,
    restitution: 0.5,
    friction: 0.2,
    hardness: 0.8,
  },
  WOOD: {
    density: 700,
    fractureThreshold: 1500,
    restitution: 0.4,
    friction: 0.5,
    hardness: 0.3,
  },
  METAL: {
    density: 7800,
    fractureThreshold: 10000,
    restitution: 0.3,
    friction: 0.4,
    hardness: 0.9,
  },
  STONE: {
    density: 2700,
    fractureThreshold: 4000,
    restitution: 0.2,
    friction: 0.8,
    hardness: 0.7,
  },
} as const;
