/**
 * DecalBatcher.ts
 *
 * Instanced decal rendering: GPU batching, per-texture
 * grouping, LOD selection, frustum culling, and draw stats.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DecalInstance {
  id: string;
  textureId: string;
  position: [number, number, number];
  scale: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  opacity: number;
  lodLevel: number;
}

export interface DrawBatch {
  textureId: string;
  instances: DecalInstance[];
  instanceCount: number;
}

export interface BatchStats {
  totalInstances: number;
  totalBatches: number;
  culledCount: number;
  drawnCount: number;
}

// =============================================================================
// DECAL BATCHER
// =============================================================================

export class DecalBatcher {
  private instances: DecalInstance[] = [];
  private batches: Map<string, DrawBatch> = new Map();
  private stats: BatchStats = { totalInstances: 0, totalBatches: 0, culledCount: 0, drawnCount: 0 };
  private maxLOD = 3;
  private lodDistances = [50, 100, 200];

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setLODDistances(distances: number[]): void {
    this.lodDistances = [...distances];
    this.maxLOD = distances.length;
  }

  getLODDistances(): number[] {
    return [...this.lodDistances];
  }

  // ---------------------------------------------------------------------------
  // Instance Management
  // ---------------------------------------------------------------------------

  addInstance(instance: DecalInstance): void {
    this.instances.push(instance);
  }

  removeInstance(id: string): boolean {
    const idx = this.instances.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    this.instances.splice(idx, 1);
    return true;
  }

  clear(): void {
    this.instances = [];
    this.batches.clear();
  }

  getInstanceCount(): number {
    return this.instances.length;
  }

  // ---------------------------------------------------------------------------
  // LOD
  // ---------------------------------------------------------------------------

  computeLOD(distance: number): number {
    for (let i = 0; i < this.lodDistances.length; i++) {
      if (distance < this.lodDistances[i]) return i;
    }
    return this.maxLOD; // Beyond all LOD levels → cull
  }

  // ---------------------------------------------------------------------------
  // Batching
  // ---------------------------------------------------------------------------

  buildBatches(
    cameraPos: { x: number; y: number; z: number },
    frustumTest?: (pos: DecalInstance['position']) => boolean
  ): DrawBatch[] {
    this.batches.clear();
    let culled = 0;
    let drawn = 0;

    for (const inst of this.instances) {
      if (inst.opacity <= 0) {
        culled++;
        continue;
      }

      // Frustum cull
      if (frustumTest && !frustumTest(inst.position)) {
        culled++;
        continue;
      }

      // LOD
      const dx = inst.position.x - cameraPos.x;
      const dy = inst.position.y - cameraPos.y;
      const dz = inst.position.z - cameraPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lod = this.computeLOD(dist);

      if (lod > this.maxLOD) {
        culled++;
        continue;
      }

      inst.lodLevel = lod;
      drawn++;

      // Group by texture
      const key = `${inst.textureId}_lod${lod}`;
      let batch = this.batches.get(key);
      if (!batch) {
        batch = { textureId: inst.textureId, instances: [], instanceCount: 0 };
        this.batches.set(key, batch);
      }
      batch.instances.push(inst);
      batch.instanceCount++;
    }

    this.stats = {
      totalInstances: this.instances.length,
      totalBatches: this.batches.size,
      culledCount: culled,
      drawnCount: drawn,
    };

    return [...this.batches.values()];
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats(): BatchStats {
    return { ...this.stats };
  }
}
