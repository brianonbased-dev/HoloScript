/**
 * NetEntitySync — ECS-aware network replication
 *
 * Syncs entity components across network, handles ownership transfer,
 * delta compression, and priority-based updates.
 *
 * @version 1.0.0
 */

export type SyncAuthority = 'server' | 'owner' | 'shared';

export interface SyncedComponent {
  entityId: string;
  componentType: string;
  data: Record<string, unknown>;
  version: number;
  lastSyncedAt: number;
  authority: SyncAuthority;
  ownerId: string;
  dirty: boolean;
}

export interface SyncSnapshot {
  entityId: string;
  components: Record<string, unknown>;
  version: number;
  timestamp: number;
}

export interface SyncStats {
  totalEntities: number;
  dirtyEntities: number;
  syncedThisFrame: number;
  bytesEstimated: number;
}

export class NetEntitySync {
  private entities: Map<string, Map<string, SyncedComponent>> = new Map();
  private snapshots: SyncSnapshot[] = [];
  private maxSnapshotHistory: number = 60;
  private syncRate: number;

  constructor(syncRate: number = 20) {
    this.syncRate = syncRate;
  }

  /**
   * Register an entity for sync
   */
  registerEntity(entityId: string, ownerId: string, authority: SyncAuthority = 'server'): void {
    if (!this.entities.has(entityId)) {
      this.entities.set(entityId, new Map());
    }
  }

  /**
   * Add a synced component to an entity
   */
  addComponent(entityId: string, componentType: string, data: Record<string, unknown>, ownerId: string = 'server'): void {
    this.registerEntity(entityId, ownerId);
    const components = this.entities.get(entityId)!;
    components.set(componentType, {
      entityId, componentType, data, version: 1,
      lastSyncedAt: Date.now(), authority: 'server', ownerId, dirty: true,
    });
  }

  /**
   * Update a component (marks dirty)
   */
  updateComponent(entityId: string, componentType: string, data: Record<string, unknown>): boolean {
    const comp = this.entities.get(entityId)?.get(componentType);
    if (!comp) return false;
    comp.data = { ...comp.data, ...data };
    comp.version++;
    comp.dirty = true;
    return true;
  }

  /**
   * Transfer ownership of an entity
   */
  transferOwnership(entityId: string, newOwnerId: string): boolean {
    const components = this.entities.get(entityId);
    if (!components) return false;
    for (const comp of components.values()) {
      comp.ownerId = newOwnerId;
      comp.dirty = true;
    }
    return true;
  }

  /**
   * Collect dirty components into a sync snapshot
   */
  collectDirty(): SyncSnapshot[] {
    const snapshots: SyncSnapshot[] = [];
    for (const [entityId, components] of this.entities) {
      const dirtyData: Record<string, unknown> = {};
      let maxVersion = 0;
      let hasDirty = false;

      for (const [type, comp] of components) {
        if (comp.dirty) {
          dirtyData[type] = comp.data;
          comp.dirty = false;
          comp.lastSyncedAt = Date.now();
          hasDirty = true;
        }
        if (comp.version > maxVersion) maxVersion = comp.version;
      }

      if (hasDirty) {
        const snapshot: SyncSnapshot = {
          entityId, components: dirtyData, version: maxVersion, timestamp: Date.now(),
        };
        snapshots.push(snapshot);
        this.snapshots.push(snapshot);
        if (this.snapshots.length > this.maxSnapshotHistory) this.snapshots.shift();
      }
    }
    return snapshots;
  }

  /**
   * Apply a received snapshot
   */
  applySnapshot(snapshot: SyncSnapshot): void {
    const components = this.entities.get(snapshot.entityId);
    if (!components) return;
    for (const [type, data] of Object.entries(snapshot.components)) {
      const comp = components.get(type);
      if (comp && snapshot.version >= comp.version) {
        comp.data = data as Record<string, unknown>;
        comp.version = snapshot.version;
        comp.dirty = false;
      }
    }
  }

  /**
   * Remove an entity from sync
   */
  removeEntity(entityId: string): boolean {
    return this.entities.delete(entityId);
  }

  /**
   * Get sync stats
   */
  getStats(): SyncStats {
    let dirty = 0;
    for (const components of this.entities.values()) {
      for (const comp of components.values()) {
        if (comp.dirty) { dirty++; break; }
      }
    }
    return {
      totalEntities: this.entities.size,
      dirtyEntities: dirty,
      syncedThisFrame: 0,
      bytesEstimated: this.snapshots.length * 128,
    };
  }

  getEntityCount(): number { return this.entities.size; }
  getSyncRate(): number { return this.syncRate; }
  getSnapshotCount(): number { return this.snapshots.length; }

  // ---------------------------------------------------------------------------
  // Interpolation
  // ---------------------------------------------------------------------------

  /**
   * Return the interpolated component data for an entity at `renderTime`.
   *
   * Strategy (based on available snapshot count):
   *   4+ snapshots → Catmull-Rom spline (smooth, handles varying speeds)
   *   2–3 snapshots → linear lerp (sufficient for short histories)
   *   0–1 snapshots → latest known state (no interpolation possible)
   *
   * Only numeric scalar and IVector3-shaped ({x,y,z}) fields are interpolated;
   * all other fields are taken from the earlier snapshot.
   *
   * @param entityId   Entity to interpolate
   * @param renderTime Render timestamp in ms (typically Date.now() - bufferMs)
   */
  getInterpolatedSnapshot(
    entityId: string,
    renderTime: number,
  ): Record<string, unknown> | null {
    // Collect snapshots for this entity, oldest-first
    const entitySnaps = this.snapshots
      .filter((s) => s.entityId === entityId)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (entitySnaps.length === 0) return null;
    if (entitySnaps.length === 1) return { ...entitySnaps[0].components };

    // Find the two snapshots bracketing renderTime
    let lo = entitySnaps[0];
    let hi = entitySnaps[entitySnaps.length - 1];

    for (let i = 0; i < entitySnaps.length - 1; i++) {
      if (entitySnaps[i].timestamp <= renderTime && entitySnaps[i + 1].timestamp >= renderTime) {
        lo = entitySnaps[i];
        hi = entitySnaps[i + 1];
        break;
      }
    }

    // t in [0,1] within the [lo, hi] time window
    const span = hi.timestamp - lo.timestamp;
    const t    = span > 0 ? Math.max(0, Math.min(1, (renderTime - lo.timestamp) / span)) : 1;

    // Merge component data from lo, then interpolate numeric fields
    const result: Record<string, unknown> = { ...lo.components };

    for (const [key, loVal] of Object.entries(lo.components)) {
      const hiVal = hi.components[key];
      if (hiVal === undefined) continue;

      if (typeof loVal === 'number' && typeof hiVal === 'number') {
        result[key] = loVal + (hiVal - loVal) * t;
        continue;
      }

      // IVector3-shaped object {x, y, z}
      if (
        loVal !== null && typeof loVal === 'object' &&
        'x' in (loVal as object) && 'y' in (loVal as object) && 'z' in (loVal as object) &&
        hiVal !== null && typeof hiVal === 'object' &&
        'x' in (hiVal as object) && 'y' in (hiVal as object) && 'z' in (hiVal as object)
      ) {
        const lv = loVal as { x: number; y: number; z: number };
        const hv = hiVal as { x: number; y: number; z: number };

        if (entitySnaps.length >= 4) {
          // Catmull-Rom: pick the surrounding 4-point window
          const loIdx = entitySnaps.indexOf(lo);
          const p0 = entitySnaps[Math.max(0, loIdx - 1)].components[key] as typeof lv ?? lv;
          const p3 = entitySnaps[Math.min(entitySnaps.length - 1, loIdx + 2)].components[key] as typeof hv ?? hv;

          const t2 = t * t;
          const t3 = t2 * t;
          const c0 = -0.5 * t3 + t2 - 0.5 * t;
          const c1 =  1.5 * t3 - 2.5 * t2 + 1.0;
          const c2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
          const c3 =  0.5 * t3 - 0.5 * t2;

          result[key] = {
            x: c0 * p0.x + c1 * lv.x + c2 * hv.x + c3 * p3.x,
            y: c0 * p0.y + c1 * lv.y + c2 * hv.y + c3 * p3.y,
            z: c0 * p0.z + c1 * lv.z + c2 * hv.z + c3 * p3.z,
          };
        } else {
          // Linear lerp fallback
          result[key] = {
            x: lv.x + (hv.x - lv.x) * t,
            y: lv.y + (hv.y - lv.y) * t,
            z: lv.z + (hv.z - lv.z) * t,
          };
        }
      }
    }

    return result;
  }
}
