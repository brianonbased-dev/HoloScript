/**
 * ReplicationManager.ts
 *
 * High-level replication for complex objects (vehicles, ragdolls, etc).
 * Manages snapshot frequency, priority, and delta compression.
 *
 * @module multiplayer
 */

import { IVector3 } from '../physics/PhysicsTypes';

// =============================================================================
// TYPES
// =============================================================================

export type ReplicationType = 'transform' | 'vehicle' | 'ragdoll' | 'custom';

export interface ReplicatedEntity {
  entityId: string;
  type: ReplicationType;
  ownerId: string;
  priority: number; // 0-10, higher = more frequent updates
  updateIntervalMs: number; // Min time between updates
  lastUpdateTime: number;
  isDirty: boolean;
  sentFullSnapshot: boolean;
  snapshot: ReplicationSnapshot;
  previousSnapshot: ReplicationSnapshot | null;
}

export interface ReplicationSnapshot {
  timestamp: number;
  position: IVector3;
  rotation: { x: number; y: number; z: number; w: number };
  velocity: IVector3;
  customState: Record<string, number | string | boolean>;
}

export interface DeltaUpdate {
  entityId: string;
  timestamp: number;
  fields: Partial<{
    position: IVector3;
    rotation: { x: number; y: number; z: number; w: number };
    velocity: IVector3;
    customState: Record<string, number | string | boolean>;
  }>;
  isFullSnapshot: boolean;
}

export interface ReplicationStats {
  totalEntities: number;
  dirtyEntities: number;
  updatesThisTick: number;
  bytesEstimate: number;
}

// =============================================================================
// REPLICATION MANAGER
// =============================================================================

export class ReplicationManager {
  private entities: Map<string, ReplicatedEntity> = new Map();
  private positionThreshold = 0.01;
  private rotationThreshold = 0.001;

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  register(
    entityId: string,
    type: ReplicationType,
    ownerId: string,
    options: Partial<{
      priority: number;
      updateIntervalMs: number;
    }> = {}
  ): ReplicatedEntity {
    const entity: ReplicatedEntity = {
      entityId,
      type,
      ownerId,
      priority: options.priority ?? 5,
      updateIntervalMs: options.updateIntervalMs ?? 1000 / 20, // 20 Hz default
      lastUpdateTime: 0,
      isDirty: true,
      sentFullSnapshot: false,
      snapshot: {
        timestamp: 0,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        velocity: { x: 0, y: 0, z: 0 },
        customState: {},
      },
      previousSnapshot: null,
    };
    this.entities.set(entityId, entity);
    return entity;
  }

  unregister(entityId: string): boolean {
    return this.entities.delete(entityId);
  }

  // ---------------------------------------------------------------------------
  // State Updates
  // ---------------------------------------------------------------------------

  updateSnapshot(entityId: string, snapshot: Partial<ReplicationSnapshot>): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.previousSnapshot = { ...entity.snapshot };
    entity.snapshot = {
      ...entity.snapshot,
      ...snapshot,
      timestamp: Date.now(),
    };
    entity.isDirty = true;
  }

  setCustomState(entityId: string, key: string, value: number | string | boolean): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    entity.snapshot.customState[key] = value;
    entity.isDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Delta Computation
  // ---------------------------------------------------------------------------

  /**
   * Generate delta updates for all dirty entities that are due for an update.
   */
  generateUpdates(currentTimeMs: number): DeltaUpdate[] {
    const updates: DeltaUpdate[] = [];

    // Sort by priority (highest first)
    const sorted = [...this.entities.values()]
      .filter((e) => e.isDirty)
      .sort((a, b) => b.priority - a.priority);

    for (const entity of sorted) {
      const elapsed = currentTimeMs - entity.lastUpdateTime;
      if (elapsed < entity.updateIntervalMs) continue;

      const delta = this.computeDelta(entity);
      if (delta) {
        updates.push(delta);
        entity.lastUpdateTime = currentTimeMs;
        entity.isDirty = false;
      }
    }

    return updates;
  }

  private computeDelta(entity: ReplicatedEntity): DeltaUpdate | null {
    const current = entity.snapshot;
    const previous = entity.previousSnapshot;

    // First update → full snapshot
    if (!entity.sentFullSnapshot || !previous) {
      entity.sentFullSnapshot = true;
      return {
        entityId: entity.entityId,
        timestamp: current.timestamp,
        fields: {
          position: { ...current.position },
          rotation: { ...current.rotation },
          velocity: { ...current.velocity },
          customState: { ...current.customState },
        },
        isFullSnapshot: true,
      };
    }

    // Delta: only send changed fields
    const fields: DeltaUpdate['fields'] = {};
    let hasChanges = false;

    if (this.vec3Differs(current.position, previous.position, this.positionThreshold)) {
      fields.position = { ...current.position };
      hasChanges = true;
    }

    if (this.quatDiffers(current.rotation, previous.rotation, this.rotationThreshold)) {
      fields.rotation = { ...current.rotation };
      hasChanges = true;
    }

    if (this.vec3Differs(current.velocity, previous.velocity, 0.05)) {
      fields.velocity = { ...current.velocity };
      hasChanges = true;
    }

    // Check custom state changes
    const customDelta: Record<string, number | string | boolean> = {};
    let customChanged = false;
    for (const [key, val] of Object.entries(current.customState)) {
      if (previous.customState[key] !== val) {
        customDelta[key] = val;
        customChanged = true;
      }
    }
    if (customChanged) {
      fields.customState = customDelta;
      hasChanges = true;
    }

    if (!hasChanges) return null;

    return {
      entityId: entity.entityId,
      timestamp: current.timestamp,
      fields,
      isFullSnapshot: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Apply Remote Updates
  // ---------------------------------------------------------------------------

  applyRemoteUpdate(update: DeltaUpdate): void {
    const entity = this.entities.get(update.entityId);
    if (!entity) return;

    if (update.fields.position) {
      entity.snapshot.position = { ...update.fields.position };
    }
    if (update.fields.rotation) {
      entity.snapshot.rotation = { ...update.fields.rotation };
    }
    if (update.fields.velocity) {
      entity.snapshot.velocity = { ...update.fields.velocity };
    }
    if (update.fields.customState) {
      Object.assign(entity.snapshot.customState, update.fields.customState);
    }
    entity.snapshot.timestamp = update.timestamp;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEntity(entityId: string): ReplicatedEntity | undefined {
    return this.entities.get(entityId);
  }

  getStats(): ReplicationStats {
    let dirtyCount = 0;
    for (const e of this.entities.values()) {
      if (e.isDirty) dirtyCount++;
    }
    return {
      totalEntities: this.entities.size,
      dirtyEntities: dirtyCount,
      updatesThisTick: 0,
      bytesEstimate: dirtyCount * 64, // Rough estimate
    };
  }

  getEntitiesByType(type: ReplicationType): string[] {
    const result: string[] = [];
    for (const [id, e] of this.entities) {
      if (e.type === type) result.push(id);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Math Helpers
  // ---------------------------------------------------------------------------

  private vec3Differs(a: IVector3, b: IVector3, threshold: number): boolean {
    return (
      Math.abs(a.x - b.x) > threshold ||
      Math.abs(a.y - b.y) > threshold ||
      Math.abs(a.z - b.z) > threshold
    );
  }

  private quatDiffers(
    a: { x: number; y: number; z: number; w: number },
    b: { x: number; y: number; z: number; w: number },
    threshold: number
  ): boolean {
    return (
      Math.abs(a.x - b.x) > threshold ||
      Math.abs(a.y - b.y) > threshold ||
      Math.abs(a.z - b.z) > threshold ||
      Math.abs(a.w - b.w) > threshold
    );
  }
}
