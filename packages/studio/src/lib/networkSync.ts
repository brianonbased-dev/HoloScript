/**
 * networkSync.ts — Multiplayer Network Synchronization
 *
 * Delta-based state synchronization for real-time multiplayer scenes.
 * Authoritative server tick model with client-side prediction and
 * entity interpolation for smooth remote rendering.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type Vec3 = [number, number, number] | { x: number; y: number; z: number };

export interface EntityState {
  id: string;
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  health?: number;
  owner: string; // Player ID who owns this entity
  timestamp: number;
}

export interface Snapshot {
  tick: number;
  timestamp: number;
  entities: EntityState[];
}

export interface DeltaPatch {
  tick: number;
  changes: EntityDelta[];
  removedIds: string[];
  addedEntities: EntityState[];
  sizeBytes: number;
}

export interface EntityDelta {
  id: string;
  position?: Vec3;
  rotation?: Vec3;
  velocity?: Vec3;
  health?: number;
}

export interface ConflictResult {
  resolved: EntityState;
  strategy: 'server-wins' | 'client-wins' | 'merge' | 'latest-timestamp';
}

export interface BandwidthMetrics {
  bytesPerSecond: number;
  packetsPerSecond: number;
  averagePacketSize: number;
  compressionRatio: number;
}

export interface InterpolationFrame {
  entity: EntityState;
  progress: number; // 0..1 between from and to
}

// ═══════════════════════════════════════════════════════════════════
// Delta Compression
// ═══════════════════════════════════════════════════════════════════

const EPSILON = 0.001;

function toTuple(v: Vec3): [number, number, number] {
  if (Array.isArray(v)) return v;
  return [v.x, v.y, v.z];
}

function toObject(v: Vec3): { x: number; y: number; z: number } {
  if (Array.isArray(v)) {
    return { x: v[0], y: v[1], z: v[2] };
  }
  return v;
}

function vec3Equal(a: Vec3, b: Vec3): boolean {
  const [ax, ay, az] = toTuple(a);
  const [bx, by, bz] = toTuple(b);
  return (
    Math.abs(ax - bx) < EPSILON &&
    Math.abs(ay - by) < EPSILON &&
    Math.abs(az - bz) < EPSILON
  );
}

/**
 * Compute delta between two snapshots. Only changed fields are included.
 */
export function deltaCompress(prev: Snapshot, curr: Snapshot): DeltaPatch {
  const prevMap = new Map(prev.entities.map((e) => [e.id, e]));
  const currMap = new Map(curr.entities.map((e) => [e.id, e]));

  const changes: EntityDelta[] = [];
  const addedEntities: EntityState[] = [];
  const removedIds: string[] = [];

  // Find changed and added entities
  for (const entity of curr.entities) {
    const prevEntity = prevMap.get(entity.id);
    if (!prevEntity) {
      addedEntities.push(entity);
      continue;
    }

    const delta: EntityDelta = { id: entity.id };
    let hasChange = false;

    if (!vec3Equal(prevEntity.position, entity.position)) {
      delta.position = entity.position;
      hasChange = true;
    }
    if (!vec3Equal(prevEntity.rotation, entity.rotation)) {
      delta.rotation = entity.rotation;
      hasChange = true;
    }
    if (!vec3Equal(prevEntity.velocity, entity.velocity)) {
      delta.velocity = entity.velocity;
      hasChange = true;
    }
    if (prevEntity.health !== entity.health) {
      delta.health = entity.health;
      hasChange = true;
    }

    if (hasChange) changes.push(delta);
  }

  // Find removed entities
  for (const entity of prev.entities) {
    if (!currMap.has(entity.id)) removedIds.push(entity.id);
  }

  // Estimate size (rough: 4 bytes per float, 16 bytes per ID)
  const sizeBytes = changes.length * 48 + addedEntities.length * 96 + removedIds.length * 16;

  return { tick: curr.tick, changes, removedIds, addedEntities, sizeBytes };
}

/**
 * Apply a delta patch to a snapshot to produce a new snapshot.
 */
export function deltaApply(base: Snapshot, patch: DeltaPatch): Snapshot {
  const entities = base.entities
    .filter((e) => !patch.removedIds.includes(e.id))
    .map((e) => {
      const delta = patch.changes.find((d) => d.id === e.id);
      if (!delta) return e;
      return {
        ...e,
        position: toObject(delta.position ?? e.position),
        rotation: toObject(delta.rotation ?? e.rotation),
        velocity: toObject(delta.velocity ?? e.velocity),
        health: delta.health ?? e.health,
        timestamp: Date.now(),
      };
    });

  return {
    tick: patch.tick,
    timestamp: Date.now(),
    entities: [...entities, ...patch.addedEntities],
  };
}

// ═══════════════════════════════════════════════════════════════════
// Entity Interpolation
// ═══════════════════════════════════════════════════════════════════

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  const [ax, ay, az] = toTuple(a);
  const [bx, by, bz] = toTuple(b);
  return {
    x: ax + (bx - ax) * t,
    y: ay + (by - ay) * t,
    z: az + (bz - az) * t,
  };
}

/**
 * Interpolate entity state between two snapshots.
 */
export function entityInterpolate(
  from: EntityState,
  to: EntityState,
  t: number
): InterpolationFrame {
  const clampedT = Math.max(0, Math.min(1, t));
  return {
    entity: {
      ...to,
      position: lerpVec3(from.position, to.position, clampedT),
      rotation: lerpVec3(from.rotation, to.rotation, clampedT),
      velocity: lerpVec3(from.velocity, to.velocity, clampedT),
    },
    progress: clampedT,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Conflict Resolution
// ═══════════════════════════════════════════════════════════════════

/**
 * Resolve conflicting entity states between server and client.
 */
export function conflictResolve(
  serverState: EntityState,
  clientState: EntityState,
  strategy: ConflictResult['strategy'] = 'server-wins'
): ConflictResult {
  switch (strategy) {
    case 'server-wins':
      return { resolved: serverState, strategy };
    case 'client-wins':
      return { resolved: clientState, strategy };
    case 'latest-timestamp':
      return {
        resolved: serverState.timestamp >= clientState.timestamp ? serverState : clientState,
        strategy,
      };
    case 'merge':
      // Merge: take position/rotation from client (local prediction),
      // health/state from server (authoritative)
      return {
        resolved: {
          ...serverState,
          position: toObject(clientState.position),
          rotation: toObject(clientState.rotation),
          velocity: lerpVec3(serverState.velocity, clientState.velocity, 0.5),
        },
        strategy,
      };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Snapshot Diff
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute full diff between two snapshots for debugging/inspection.
 */
export function snapshotDiff(
  a: Snapshot,
  b: Snapshot
): {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
} {
  const delta = deltaCompress(a, b);
  const _aIds = new Set(a.entities.map((e) => e.id));
  const bIds = new Set(b.entities.map((e) => e.id));
  const unchanged = a.entities
    .filter((e) => bIds.has(e.id) && !delta.changes.some((d) => d.id === e.id))
    .map((e) => e.id);

  return {
    added: delta.addedEntities.map((e) => e.id),
    removed: delta.removedIds,
    changed: delta.changes.map((d) => d.id),
    unchanged,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Bandwidth Estimation
// ═══════════════════════════════════════════════════════════════════

/**
 * Estimate bandwidth usage given tick rate and entity count.
 */
export function bandwidthEstimate(
  entityCount: number,
  tickRate: number,
  avgChangeRatio: number = 0.3, // ~30% of entities change per tick
  bytesPerEntity: number = 48
): BandwidthMetrics {
  const changesPerTick = Math.ceil(entityCount * avgChangeRatio);
  const packetSize = changesPerTick * bytesPerEntity + 16; // 16 bytes header
  const fullSnapshotSize = entityCount * 96;
  const compressedSize = packetSize;

  return {
    bytesPerSecond: packetSize * tickRate,
    packetsPerSecond: tickRate,
    averagePacketSize: packetSize,
    compressionRatio: fullSnapshotSize > 0 ? compressedSize / fullSnapshotSize : 1,
  };
}

/**
 * Classify network quality from round-trip time.
 */
export function networkQuality(
  rttMs: number
): 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected' {
  if (rttMs < 30) return 'excellent';
  if (rttMs < 80) return 'good';
  if (rttMs < 150) return 'fair';
  if (rttMs < 500) return 'poor';
  return 'disconnected';
}

