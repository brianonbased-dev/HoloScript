/**
 * StructuralElement.ts
 *
 * Individual structural element (beam, column, support, etc.)
 * with load capacity and failure mechanics.
 *
 * Week 8: Explosive Demolition - Day 5
 */

import type { Vector3 } from './Fragment';

export type StructuralElementType = 'column' | 'beam' | 'wall' | 'foundation' | 'slab';

export interface StructuralElementConfig {
  /** Element ID */
  id?: string;
  /** Element type */
  type?: StructuralElementType;
  /** Position */
  position: Vector3;
  /** Dimensions */
  size?: Vector3;
  /** Maximum load capacity (Newtons) */
  maxLoad?: number;
  /** Material strength factor (0-1) */
  strength?: number;
  /** Is this a foundation element (cannot fail) */
  isFoundation?: boolean;
  /** Mass (kg) */
  mass?: number;
}

export interface StructuralConnection {
  /** Connected element ID */
  elementId: string;
  /** Connection strength (0-1) */
  strength: number;
  /** Is this a support connection (element supports this one) */
  isSupport: boolean;
}

/**
 * Individual structural element
 */
export class StructuralElement {
  public readonly id: string;
  public readonly type: StructuralElementType;
  public readonly position: Vector3;
  public readonly size: Vector3;
  public readonly maxLoad: number;
  public readonly mass: number;
  public readonly isFoundation: boolean;

  private strength: number;
  private currentLoad = 0;
  private failed = false;
  private connections: Map<string, StructuralConnection> = new Map();
  private supportedBy = new Set<string>();
  private supporting = new Set<string>();

  constructor(config: StructuralElementConfig) {
    this.id = config.id || `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = config.type || 'beam';
    this.position = { ...config.position };
    this.size = config.size || { x: 1, y: 1, z: 1 };
    this.maxLoad = config.maxLoad ?? 100000; // 100 kN default
    this.strength = config.strength ?? 1.0;
    this.isFoundation = config.isFoundation ?? false;
    this.mass = config.mass ?? 1000; // 1 ton default
  }

  /**
   * Add connection to another element
   */
  public addConnection(elementId: string, strength: number, isSupport: boolean): void {
    this.connections.set(elementId, { elementId, strength, isSupport });

    if (isSupport) {
      this.supportedBy.add(elementId);
    } else {
      this.supporting.add(elementId);
    }
  }

  /**
   * Remove connection
   */
  public removeConnection(elementId: string): void {
    this.connections.delete(elementId);
    this.supportedBy.delete(elementId);
    this.supporting.delete(elementId);
  }

  /**
   * Get all connections
   */
  public getConnections(): StructuralConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get elements supporting this one
   */
  public getSupportedBy(): string[] {
    return Array.from(this.supportedBy);
  }

  /**
   * Get elements this one is supporting
   */
  public getSupporting(): string[] {
    return Array.from(this.supporting);
  }

  /**
   * Apply load to element
   */
  public applyLoad(load: number): void {
    this.currentLoad += load;
  }

  /**
   * Set current load
   */
  public setLoad(load: number): void {
    this.currentLoad = load;
  }

  /**
   * Get current load
   */
  public getCurrentLoad(): number {
    return this.currentLoad;
  }

  /**
   * Get load capacity
   */
  public getLoadCapacity(): number {
    return this.maxLoad * this.strength;
  }

  /**
   * Get load percentage (0-1)
   */
  public getLoadPercentage(): number {
    const capacity = this.getLoadCapacity();
    if (capacity <= 0) return 1;
    return Math.min(this.currentLoad / capacity, 1);
  }

  /**
   * Check if element is overloaded
   */
  public isOverloaded(): boolean {
    if (this.isFoundation) return false;
    return this.currentLoad > this.getLoadCapacity();
  }

  /**
   * Check if element has failed
   */
  public hasFailed(): boolean {
    return this.failed;
  }

  /**
   * Fail the element
   */
  public fail(): void {
    if (this.isFoundation) return;
    this.failed = true;
  }

  /**
   * Check if element is supported
   */
  public isSupported(): boolean {
    if (this.isFoundation) return true;
    return this.supportedBy.size > 0 && !this.failed;
  }

  /**
   * Reduce strength (damage)
   */
  public damage(amount: number): void {
    this.strength = Math.max(0, this.strength - amount);

    if (this.strength <= 0) {
      this.fail();
    }
  }

  /**
   * Get element strength
   */
  public getStrength(): number {
    return this.strength;
  }

  /**
   * Get weight force (mass * gravity)
   */
  public getWeight(): number {
    return this.mass * 9.8;
  }

  /**
   * Reset element
   */
  public reset(): void {
    this.failed = false;
    this.currentLoad = 0;
    this.strength = 1.0;
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
   * Check if point is inside element bounds
   */
  public containsPoint(point: Vector3): boolean {
    const halfSize = {
      x: this.size.x / 2,
      y: this.size.y / 2,
      z: this.size.z / 2,
    };

    return (
      point.x >= this.position.x - halfSize.x &&
      point.x <= this.position.x + halfSize.x &&
      point.y >= this.position.y - halfSize.y &&
      point.y <= this.position.y + halfSize.y &&
      point.z >= this.position.z - halfSize.z &&
      point.z <= this.position.z + halfSize.z
    );
  }
}
