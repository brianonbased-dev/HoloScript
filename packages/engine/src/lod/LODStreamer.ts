/**
 * LODStreamer.ts
 *
 * Distance-based LOD streaming: load/unload queues,
 * budget management, priority ordering, and hysteresis.
 *
 * @module lod
 */

// =============================================================================
// TYPES
// =============================================================================

export interface StreamableAsset {
  id: string;
  lodLevels: number[]; // Distance thresholds (ascending)
  currentLOD: number; // Current LOD index (-1 = unloaded)
  priority: number;
  memoryCost: number[]; // Memory per LOD level
}

export interface StreamRequest {
  assetId: string;
  targetLOD: number;
  type: 'load' | 'unload';
}

// =============================================================================
// LOD STREAMER
// =============================================================================

export class LODStreamer {
  private assets: Map<string, StreamableAsset> = new Map();
  private loadQueue: StreamRequest[] = [];
  private unloadQueue: StreamRequest[] = [];
  private memoryBudget: number;
  private memoryUsed = 0;
  private hysteresis = 0.1; // Fraction of threshold to prevent oscillation

  constructor(memoryBudget: number) {
    this.memoryBudget = memoryBudget;
  }

  // ---------------------------------------------------------------------------
  // Asset Registration
  // ---------------------------------------------------------------------------

  registerAsset(asset: StreamableAsset): void {
    this.assets.set(asset.id, asset);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(_cameraX: number, _cameraY: number, _cameraZ: number): void {
    this.loadQueue = [];
    this.unloadQueue = [];

    for (const asset of this.assets.values()) {
      // Calculate distance (assume asset position is encoded in id for simplicity)
      // In real use, asset would store position
      const targetLOD = this.selectLOD(asset, 0); // Using distance 0 for simplicity

      if (targetLOD !== asset.currentLOD) {
        if (targetLOD >= 0) {
          this.loadQueue.push({ assetId: asset.id, targetLOD, type: 'load' });
        } else {
          this.unloadQueue.push({ assetId: asset.id, targetLOD: -1, type: 'unload' });
        }
      }
    }

    // Sort by priority
    this.loadQueue.sort((a, b) => {
      const pa = this.assets.get(a.assetId)!.priority;
      const pb = this.assets.get(b.assetId)!.priority;
      return pb - pa;
    });
  }

  evaluateDistance(assetId: string, distance: number): number {
    const asset = this.assets.get(assetId);
    if (!asset) return -1;
    return this.selectLOD(asset, distance);
  }

  // ---------------------------------------------------------------------------
  // LOD Selection
  // ---------------------------------------------------------------------------

  private selectLOD(asset: StreamableAsset, distance: number): number {
    for (let i = 0; i < asset.lodLevels.length; i++) {
      const threshold = asset.lodLevels[i];
      const hystOffset = asset.currentLOD === i ? threshold * this.hysteresis : 0;
      if (distance <= threshold + hystOffset) return i;
    }
    return -1; // Beyond all LODs
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  processQueue(maxItems = 5): StreamRequest[] {
    const processed: StreamRequest[] = [];

    // Unload first
    for (const req of this.unloadQueue.splice(0, maxItems)) {
      const asset = this.assets.get(req.assetId);
      if (asset && asset.currentLOD >= 0) {
        this.memoryUsed -= asset.memoryCost[asset.currentLOD] ?? 0;
        asset.currentLOD = -1;
        processed.push(req);
      }
    }

    // Then load
    for (const req of this.loadQueue.splice(0, maxItems - processed.length)) {
      const asset = this.assets.get(req.assetId);
      if (!asset) continue;
      const cost = asset.memoryCost[req.targetLOD] ?? 0;
      if (this.memoryUsed + cost <= this.memoryBudget) {
        if (asset.currentLOD >= 0) this.memoryUsed -= asset.memoryCost[asset.currentLOD] ?? 0;
        asset.currentLOD = req.targetLOD;
        this.memoryUsed += cost;
        processed.push(req);
      }
    }

    return processed;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getMemoryUsed(): number {
    return this.memoryUsed;
  }
  getMemoryBudget(): number {
    return this.memoryBudget;
  }
  getLoadQueueSize(): number {
    return this.loadQueue.length;
  }
  getCurrentLOD(id: string): number {
    return this.assets.get(id)?.currentLOD ?? -1;
  }
}
