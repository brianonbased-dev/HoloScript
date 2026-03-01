/**
 * StateReplicator.ts
 *
 * State synchronization: snapshot/delta compression,
 * interpolation, authority management, and conflict resolution.
 *
 * @module networking
 */

// =============================================================================
// TYPES
// =============================================================================

export type AuthorityMode = 'server' | 'owner' | 'shared';

export interface ReplicatedProperty {
  key: string;
  value: unknown;
  lastUpdated: number;
  version: number;
  authority: string;         // Owner peer ID
}

export interface StateSnapshot {
  entityId: string;
  tick: number;
  timestamp: number;
  properties: Map<string, ReplicatedProperty>;
}

export interface StateDelta {
  entityId: string;
  fromTick: number;
  toTick: number;
  changes: Array<{ key: string; value: unknown; version: number }>;
}

export interface InterpolationState {
  entityId: string;
  property: string;
  from: number;
  to: number;
  startTime: number;
  duration: number;
}

// =============================================================================
// STATE REPLICATOR
// =============================================================================

export class StateReplicator {
  private entities: Map<string, StateSnapshot> = new Map();
  private snapshotHistory: Map<string, StateSnapshot[]> = new Map();
  private maxHistory = 30;
  private currentTick = 0;
  private authorityMode: AuthorityMode = 'server';
  private localPeerId: string;
  private interpolations: InterpolationState[] = [];
  private interpolationDelay = 100; // ms

  constructor(localPeerId: string, authorityMode: AuthorityMode = 'server') {
    this.localPeerId = localPeerId;
    this.authorityMode = authorityMode;
  }

  // ---------------------------------------------------------------------------
  // Entity Registration
  // ---------------------------------------------------------------------------

  registerEntity(entityId: string, initialProps: Record<string, unknown> = {}): void {
    const properties = new Map<string, ReplicatedProperty>();
    for (const [key, value] of Object.entries(initialProps)) {
      properties.set(key, {
        key, value, lastUpdated: Date.now(), version: 0, authority: this.localPeerId,
      });
    }
    this.entities.set(entityId, {
      entityId, tick: this.currentTick, timestamp: Date.now(), properties,
    });
    this.snapshotHistory.set(entityId, []);
  }

  unregisterEntity(entityId: string): boolean {
    this.snapshotHistory.delete(entityId);
    return this.entities.delete(entityId);
  }

  // ---------------------------------------------------------------------------
  // Property Updates
  // ---------------------------------------------------------------------------

  setProperty(entityId: string, key: string, value: unknown, peerId?: string): boolean {
    const snapshot = this.entities.get(entityId);
    if (!snapshot) return false;

    const prop = snapshot.properties.get(key);
    const authority = peerId ?? this.localPeerId;

    if (prop) {
      // Authority check
      if (this.authorityMode === 'owner' && prop.authority !== authority) return false;
      prop.value = value;
      prop.version++;
      prop.lastUpdated = Date.now();
    } else {
      snapshot.properties.set(key, {
        key, value, lastUpdated: Date.now(), version: 0, authority,
      });
    }

    return true;
  }

  getProperty(entityId: string, key: string): unknown {
    return this.entities.get(entityId)?.properties.get(key)?.value;
  }

  // ---------------------------------------------------------------------------
  // Snapshots & Deltas
  // ---------------------------------------------------------------------------

  takeSnapshot(entityId: string): StateSnapshot | null {
    const current = this.entities.get(entityId);
    if (!current) return null;

    this.currentTick++;
    const snap: StateSnapshot = {
      entityId,
      tick: this.currentTick,
      timestamp: Date.now(),
      properties: new Map([...current.properties].map(([k, v]) => [k, { ...v }])),
    };

    const history = this.snapshotHistory.get(entityId) ?? [];
    history.push(snap);
    if (history.length > this.maxHistory) history.shift();
    this.snapshotHistory.set(entityId, history);

    current.tick = this.currentTick;
    return snap;
  }

  computeDelta(entityId: string, fromTick: number): StateDelta | null {
    const current = this.entities.get(entityId);
    if (!current) return null;

    const history = this.snapshotHistory.get(entityId) ?? [];
    const fromSnapshot = history.find(s => s.tick === fromTick);

    const changes: StateDelta['changes'] = [];

    for (const [key, prop] of current.properties) {
      if (!fromSnapshot) {
        changes.push({ key, value: prop.value, version: prop.version });
      } else {
        const oldProp = fromSnapshot.properties.get(key);
        if (!oldProp || oldProp.version !== prop.version) {
          changes.push({ key, value: prop.value, version: prop.version });
        }
      }
    }

    return { entityId, fromTick, toTick: current.tick, changes };
  }

  applyDelta(delta: StateDelta): boolean {
    const snapshot = this.entities.get(delta.entityId);
    if (!snapshot) return false;

    for (const change of delta.changes) {
      const prop = snapshot.properties.get(change.key);
      if (prop) {
        if (change.version > prop.version) {
          prop.value = change.value;
          prop.version = change.version;
          prop.lastUpdated = Date.now();
        }
      } else {
        snapshot.properties.set(change.key, {
          key: change.key, value: change.value, lastUpdated: Date.now(),
          version: change.version, authority: this.localPeerId,
        });
      }
    }

    snapshot.tick = delta.toTick;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Interpolation
  // ---------------------------------------------------------------------------

  addInterpolation(entityId: string, property: string, from: number, to: number, duration?: number): void {
    this.interpolations.push({
      entityId, property, from, to,
      startTime: Date.now(),
      duration: duration ?? this.interpolationDelay,
    });
  }

  updateInterpolations(): void {
    const now = Date.now();
    this.interpolations = this.interpolations.filter(interp => {
      const elapsed = now - interp.startTime;
      const t = Math.min(elapsed / interp.duration, 1);
      const value = interp.from + (interp.to - interp.from) * t;
      this.setProperty(interp.entityId, interp.property, value);
      return t < 1;
    });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEntityCount(): number { return this.entities.size; }
  getSnapshot(entityId: string): StateSnapshot | undefined { return this.entities.get(entityId); }
  getSnapshotHistory(entityId: string): StateSnapshot[] { return [...(this.snapshotHistory.get(entityId) ?? [])]; }
  getCurrentTick(): number { return this.currentTick; }
  getAuthorityMode(): AuthorityMode { return this.authorityMode; }
  setAuthorityMode(mode: AuthorityMode): void { this.authorityMode = mode; }
  getInterpolationCount(): number { return this.interpolations.length; }
}
