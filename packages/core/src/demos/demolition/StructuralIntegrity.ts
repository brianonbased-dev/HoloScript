/**
 * StructuralIntegrity.ts
 *
 * Structural integrity system for building collapse simulation.
 * Handles load distribution, support analysis, and progressive failure.
 *
 * Week 8: Explosive Demolition - Day 5
 */

import { StructuralElement, type StructuralElementConfig } from './StructuralElement';
import type { Vector3 } from './Fragment';

export interface StructuralIntegrityConfig {
  /** Gravity magnitude */
  gravity?: number;
  /** Enable progressive failure */
  progressiveFailure?: boolean;
  /** Load redistribution iterations */
  redistributionIterations?: number;
  /** Failure threshold multiplier */
  failureThreshold?: number;
}

export interface StructuralFailureEvent {
  /** Element that failed */
  elementId: string;
  /** Failure time */
  timestamp: number;
  /** Reason for failure */
  reason: 'overload' | 'unsupported' | 'damaged' | 'cascade';
  /** Load at failure */
  load: number;
  /** Capacity at failure */
  capacity: number;
}

export interface StructuralIntegrityStatistics {
  /** Total elements */
  totalElements: number;
  /** Failed elements */
  failedElements: number;
  /** Unsupported elements */
  unsupportedElements: number;
  /** Overloaded elements */
  overloadedElements: number;
  /** Total load in system */
  totalLoad: number;
  /** Average load percentage */
  avgLoadPercentage: number;
  /** Failure events */
  failureEvents: number;
  /** Is structure stable */
  isStable: boolean;
}

/**
 * Structural integrity system
 */
export class StructuralIntegrity {
  private readonly config: Required<StructuralIntegrityConfig>;
  private readonly elements = new Map<string, StructuralElement>();
  private readonly failureEvents: StructuralFailureEvent[] = [];
  private failedThisFrame = 0;

  constructor(config: StructuralIntegrityConfig = {}) {
    this.config = {
      gravity: config.gravity ?? 9.8,
      progressiveFailure: config.progressiveFailure ?? true,
      redistributionIterations: config.redistributionIterations ?? 5,
      failureThreshold: config.failureThreshold ?? 1.0,
    };
  }

  /**
   * Add structural element
   */
  public addElement(config: StructuralElementConfig): StructuralElement {
    const element = new StructuralElement(config);
    this.elements.set(element.id, element);
    return element;
  }

  /**
   * Remove element
   */
  public removeElement(elementId: string): void {
    const element = this.elements.get(elementId);
    if (!element) return;

    // Remove connections to this element from other elements
    for (const other of this.elements.values()) {
      other.removeConnection(elementId);
    }

    this.elements.delete(elementId);
  }

  /**
   * Get element by ID
   */
  public getElement(elementId: string): StructuralElement | undefined {
    return this.elements.get(elementId);
  }

  /**
   * Get all elements
   */
  public getElements(): StructuralElement[] {
    return Array.from(this.elements.values());
  }

  /**
   * Connect two elements
   */
  public connect(
    elementId1: string,
    elementId2: string,
    strength: number = 1.0,
    bidirectional: boolean = true
  ): void {
    const element1 = this.elements.get(elementId1);
    const element2 = this.elements.get(elementId2);

    if (!element1 || !element2) return;

    // Determine support relationship based on vertical position
    const isElement1Lower = element1.position.y < element2.position.y;

    element1.addConnection(elementId2, strength, !isElement1Lower);

    if (bidirectional) {
      element2.addConnection(elementId1, strength, isElement1Lower);
    }
  }

  /**
   * Disconnect two elements
   */
  public disconnect(elementId1: string, elementId2: string): void {
    const element1 = this.elements.get(elementId1);
    const element2 = this.elements.get(elementId2);

    if (!element1 || !element2) return;

    element1.removeConnection(elementId2);
    element2.removeConnection(elementId1);
  }

  /**
   * Calculate and distribute loads
   */
  public calculateLoads(): void {
    // Reset loads
    for (const element of this.elements.values()) {
      element.setLoad(0);
    }

    // Apply self-weight
    for (const element of this.elements.values()) {
      element.applyLoad(element.getWeight());
    }

    // Distribute loads through structure (multiple iterations for convergence)
    for (let i = 0; i < this.config.redistributionIterations; i++) {
      this.distributeLoads();
    }
  }

  /**
   * Distribute loads from supported to supporting elements
   */
  private distributeLoads(): void {
    const loadTransfers = new Map<string, number>();

    // Calculate load transfers
    for (const element of this.elements.values()) {
      if (element.hasFailed() || element.isFoundation) continue;

      const supportedBy = element.getSupportedBy();
      if (supportedBy.length === 0) continue;

      // Distribute load equally to supports
      const loadPerSupport = element.getCurrentLoad() / supportedBy.length;

      for (const supportId of supportedBy) {
        const support = this.elements.get(supportId);
        if (support && !support.hasFailed()) {
          const currentTransfer = loadTransfers.get(supportId) || 0;
          loadTransfers.set(supportId, currentTransfer + loadPerSupport);
        }
      }
    }

    // Apply load transfers
    for (const [elementId, additionalLoad] of loadTransfers) {
      const element = this.elements.get(elementId);
      if (element) {
        element.applyLoad(additionalLoad);
      }
    }
  }

  /**
   * Update structural integrity (check for failures)
   */
  public update(): void {
    this.failedThisFrame = 0;

    // Recalculate loads
    this.calculateLoads();

    // Check for failures
    const toFail: StructuralElement[] = [];

    for (const element of this.elements.values()) {
      if (element.hasFailed() || element.isFoundation) continue;

      // Check if overloaded
      if (element.isOverloaded()) {
        toFail.push(element);

        this.failureEvents.push({
          elementId: element.id,
          timestamp: performance.now(),
          reason: 'overload',
          load: element.getCurrentLoad(),
          capacity: element.getLoadCapacity(),
        });
      }
      // Check if unsupported
      else if (!element.isSupported()) {
        toFail.push(element);

        this.failureEvents.push({
          elementId: element.id,
          timestamp: performance.now(),
          reason: 'unsupported',
          load: element.getCurrentLoad(),
          capacity: element.getLoadCapacity(),
        });
      }
    }

    // Fail elements
    for (const element of toFail) {
      element.fail();
      this.failedThisFrame++;
    }

    // Progressive failure cascade
    if (this.config.progressiveFailure) {
      this.propagateFailure();
    }
  }

  /**
   * Propagate failure to connected elements
   */
  private propagateFailure(): void {
    let cascadedThisIteration = 0;
    const maxCascadeIterations = 10;

    for (let i = 0; i < maxCascadeIterations; i++) {
      cascadedThisIteration = 0;

      // Recalculate after each cascade
      this.calculateLoads();

      for (const element of this.elements.values()) {
        if (element.hasFailed() || element.isFoundation) continue;

        // Check if lost all supports
        const supportedBy = element.getSupportedBy();
        const activeSupports = supportedBy.filter((id) => {
          const support = this.elements.get(id);
          return support && !support.hasFailed();
        });

        if (activeSupports.length === 0 && supportedBy.length > 0) {
          element.fail();
          cascadedThisIteration++;
          this.failedThisFrame++;

          this.failureEvents.push({
            elementId: element.id,
            timestamp: performance.now(),
            reason: 'cascade',
            load: element.getCurrentLoad(),
            capacity: element.getLoadCapacity(),
          });
        }
        // Check if now overloaded due to redistribution
        else if (element.isOverloaded()) {
          element.fail();
          cascadedThisIteration++;
          this.failedThisFrame++;

          this.failureEvents.push({
            elementId: element.id,
            timestamp: performance.now(),
            reason: 'cascade',
            load: element.getCurrentLoad(),
            capacity: element.getLoadCapacity(),
          });
        }
      }

      // Stop if no more cascade
      if (cascadedThisIteration === 0) break;
    }
  }

  /**
   * Damage elements in radius
   */
  public damageInRadius(position: Vector3, radius: number, damageAmount: number): number {
    let count = 0;

    for (const element of this.elements.values()) {
      if (element.isFoundation) continue;

      const distance = element.distanceFrom(position);
      if (distance > radius) continue;

      const falloff = 1 - distance / radius;
      const scaledDamage = damageAmount * falloff;

      element.damage(scaledDamage);
      count++;
    }

    return count;
  }

  /**
   * Remove element at position
   */
  public removeElementAt(position: Vector3, radius: number = 1.0): StructuralElement | null {
    for (const element of this.elements.values()) {
      if (element.containsPoint(position) || element.distanceFrom(position) < radius) {
        element.fail();

        this.failureEvents.push({
          elementId: element.id,
          timestamp: performance.now(),
          reason: 'damaged',
          load: element.getCurrentLoad(),
          capacity: element.getLoadCapacity(),
        });

        return element;
      }
    }

    return null;
  }

  /**
   * Check if structure is stable
   */
  public isStable(): boolean {
    for (const element of this.elements.values()) {
      if (element.hasFailed() || element.isFoundation) continue;

      if (!element.isSupported() || element.isOverloaded()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get failed elements
   */
  public getFailedElements(): StructuralElement[] {
    return Array.from(this.elements.values()).filter((e) => e.hasFailed());
  }

  /**
   * Get unsupported elements
   */
  public getUnsupportedElements(): StructuralElement[] {
    return Array.from(this.elements.values()).filter((e) => !e.isSupported() && !e.hasFailed());
  }

  /**
   * Get overloaded elements
   */
  public getOverloadedElements(): StructuralElement[] {
    return Array.from(this.elements.values()).filter((e) => e.isOverloaded() && !e.hasFailed());
  }

  /**
   * Get failure events
   */
  public getFailureEvents(): StructuralFailureEvent[] {
    return [...this.failureEvents];
  }

  /**
   * Clear failure events
   */
  public clearFailureEvents(): void {
    this.failureEvents.length = 0;
  }

  /**
   * Get statistics
   */
  public getStatistics(): StructuralIntegrityStatistics {
    let totalLoad = 0;
    let totalLoadPercentage = 0;
    let activeElements = 0;

    for (const element of this.elements.values()) {
      totalLoad += element.getCurrentLoad();

      if (!element.hasFailed()) {
        totalLoadPercentage += element.getLoadPercentage();
        activeElements++;
      }
    }

    return {
      totalElements: this.elements.size,
      failedElements: this.getFailedElements().length,
      unsupportedElements: this.getUnsupportedElements().length,
      overloadedElements: this.getOverloadedElements().length,
      totalLoad,
      avgLoadPercentage: activeElements > 0 ? totalLoadPercentage / activeElements : 0,
      failureEvents: this.failureEvents.length,
      isStable: this.isStable(),
    };
  }

  /**
   * Reset system
   */
  public reset(): void {
    for (const element of this.elements.values()) {
      element.reset();
    }

    this.failureEvents.length = 0;
    this.failedThisFrame = 0;
  }

  /**
   * Clear all elements
   */
  public clear(): void {
    this.elements.clear();
    this.failureEvents.length = 0;
    this.failedThisFrame = 0;
  }

  /**
   * Get failed this frame
   */
  public getFailedThisFrame(): number {
    return this.failedThisFrame;
  }
}
