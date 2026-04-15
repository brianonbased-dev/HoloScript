/**
 * PooledSpawner.ts
 *
 * Prefab spawning from pools: lifecycle management,
 * spawn limits, transform assignment, and despawn.
 *
 * @module pooling
 */

import { ObjectPool } from './ObjectPool';

// =============================================================================
// TYPES
// =============================================================================

export interface SpawnedEntity {
  id: string;
  prefabId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  active: boolean;
  lifetime: number; // seconds, 0 = infinite
  elapsed: number;
  data: Record<string, unknown>;
}

export interface PrefabDef {
  id: string;
  poolSize: number;
  maxInstances: number;
  autoExpand: boolean;
  defaultLifetime: number;
  onSpawn?: (entity: SpawnedEntity) => void;
  onDespawn?: (entity: SpawnedEntity) => void;
}

// =============================================================================
// POOLED SPAWNER
// =============================================================================

let _spawnId = 0;

export class PooledSpawner {
  private pools: Map<string, ObjectPool<SpawnedEntity>> = new Map();
  private prefabs: Map<string, PrefabDef> = new Map();
  private activeEntities: Map<string, SpawnedEntity> = new Map();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  registerPrefab(def: PrefabDef): void {
    this.prefabs.set(def.id, def);
    const pool = new ObjectPool<SpawnedEntity>({
      factory: () => ({
        id: '',
        prefabId: def.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        active: false,
        lifetime: 0,
        elapsed: 0,
        data: {},
      }),
      reset: (e) => {
        e.active = false;
        e.elapsed = 0;
        e.position.x = e.position.y = e.position.z = 0;
        e.rotation.x = e.rotation.y = e.rotation.z = 0;
        e.scale.x = e.scale.y = e.scale.z = 1;
        e.data = {};
      },
      initialSize: def.poolSize,
      maxSize: def.maxInstances,
      autoExpand: def.autoExpand,
      expandAmount: Math.max(1, Math.floor(def.poolSize / 4)),
    });
    this.pools.set(def.id, pool);
  }

  // ---------------------------------------------------------------------------
  // Spawn / Despawn
  // ---------------------------------------------------------------------------

  spawn(
    prefabId: string,
    position?: { x: number; y: number; z: number },
    rotation?: { x: number; y: number; z: number },
    data?: Record<string, unknown>
  ): SpawnedEntity | null {
    const pool = this.pools.get(prefabId);
    const def = this.prefabs.get(prefabId);
    if (!pool || !def) return null;

    const entity = pool.acquire();
    if (!entity) return null;

    entity.id = `spawn_${_spawnId++}`;
    entity.prefabId = prefabId;
    entity.active = true;
    entity.lifetime = def.defaultLifetime;
    entity.elapsed = 0;
    if (position) Object.assign(entity.position, position);
    if (rotation) Object.assign(entity.rotation, rotation);
    if (data) entity.data = { ...data };

    this.activeEntities.set(entity.id, entity);
    if (def.onSpawn) def.onSpawn(entity);

    return entity;
  }

  despawn(entityId: string): boolean {
    const entity = this.activeEntities.get(entityId);
    if (!entity) return false;

    const def = this.prefabs.get(entity.prefabId);
    if (def?.onDespawn) def.onDespawn(entity);

    const pool = this.pools.get(entity.prefabId);
    if (pool) pool.release(entity);

    this.activeEntities.delete(entityId);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): string[] {
    const expired: string[] = [];

    for (const [id, entity] of this.activeEntities) {
      if (entity.lifetime > 0) {
        entity.elapsed += dt;
        if (entity.elapsed >= entity.lifetime) expired.push(id);
      }
    }

    for (const id of expired) this.despawn(id);
    return expired;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEntity(id: string): SpawnedEntity | undefined {
    return this.activeEntities.get(id);
  }
  getActiveCount(prefabId?: string): number {
    if (!prefabId) return this.activeEntities.size;
    let count = 0;
    for (const e of this.activeEntities.values()) {
      if (e.prefabId === prefabId) count++;
    }
    return count;
  }
  getPoolStats(prefabId: string) {
    return this.pools.get(prefabId)?.getStats();
  }
}
