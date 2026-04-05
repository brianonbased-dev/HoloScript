/**
 * ComponentStore.ts
 *
 * Typed component storage: Structure-of-Arrays layout,
 * add/remove/get per entity, iteration, and bulk operations.
 *
 * @module ecs
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ComponentPool<T = Record<string, unknown>> {
  type: string;
  data: Map<number, T>; // entityId → component data
}

// =============================================================================
// COMPONENT STORE
// =============================================================================

export class ComponentStore {
  private pools: Map<string, ComponentPool> = new Map();

  // ---------------------------------------------------------------------------
  // Pool Management
  // ---------------------------------------------------------------------------

  registerPool<T extends Record<string, unknown>>(type: string): ComponentPool<T> {
    const pool: ComponentPool<T> = { type, data: new Map() };
    this.pools.set(type, pool as ComponentPool);
    return pool;
  }

  getPool<T extends Record<string, unknown>>(type: string): ComponentPool<T> | undefined {
    return this.pools.get(type) as ComponentPool<T> | undefined;
  }

  hasPool(type: string): boolean {
    return this.pools.has(type);
  }
  getPoolTypes(): string[] {
    return [...this.pools.keys()];
  }

  // ---------------------------------------------------------------------------
  // Component Operations
  // ---------------------------------------------------------------------------

  add<T extends Record<string, unknown>>(type: string, entityId: number, data: T): boolean {
    let pool = this.pools.get(type);
    if (!pool) {
      pool = { type, data: new Map() };
      this.pools.set(type, pool);
    }
    if (pool.data.has(entityId)) return false; // Already exists
    pool.data.set(entityId, data);
    return true;
  }

  remove(type: string, entityId: number): boolean {
    return this.pools.get(type)?.data.delete(entityId) ?? false;
  }

  get<T extends Record<string, unknown>>(type: string, entityId: number): T | undefined {
    return this.pools.get(type)?.data.get(entityId) as T | undefined;
  }

  has(type: string, entityId: number): boolean {
    return this.pools.get(type)?.data.has(entityId) ?? false;
  }

  set<T extends Record<string, unknown>>(
    type: string,
    entityId: number,
    data: Partial<T>
  ): boolean {
    const pool = this.pools.get(type);
    if (!pool) return false;
    const existing = pool.data.get(entityId);
    if (!existing) return false;
    Object.assign(existing, data);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Iteration
  // ---------------------------------------------------------------------------

  forEach<T extends Record<string, unknown>>(
    type: string,
    callback: (entityId: number, data: T) => void
  ): void {
    const pool = this.pools.get(type);
    if (!pool) return;
    for (const [entityId, data] of pool.data) {
      callback(entityId, data as T);
    }
  }

  getEntitiesWithComponent(type: string): number[] {
    const pool = this.pools.get(type);
    if (!pool) return [];
    return [...pool.data.keys()];
  }

  getEntitiesWithAll(...types: string[]): number[] {
    if (types.length === 0) return [];
    const first = this.pools.get(types[0]);
    if (!first) return [];

    const result: number[] = [];
    for (const entityId of first.data.keys()) {
      if (types.every((t) => this.has(t, entityId))) {
        result.push(entityId);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Bulk Operations
  // ---------------------------------------------------------------------------

  removeAllForEntity(entityId: number): number {
    let removed = 0;
    for (const pool of this.pools.values()) {
      if (pool.data.delete(entityId)) removed++;
    }
    return removed;
  }

  getComponentCount(type: string): number {
    return this.pools.get(type)?.data.size ?? 0;
  }

  getTotalComponentCount(): number {
    let total = 0;
    for (const pool of this.pools.values()) total += pool.data.size;
    return total;
  }

  clear(type?: string): void {
    if (type) {
      this.pools.get(type)?.data.clear();
    } else {
      for (const pool of this.pools.values()) pool.data.clear();
    }
  }
}
