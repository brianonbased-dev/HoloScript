/**
 * GarbageCollector.ts
 *
 * Simulated garbage collector: mark-sweep, generational buckets,
 * finalization callbacks, and defragmentation.
 *
 * @module debug
 */

// =============================================================================
// TYPES
// =============================================================================

export type Generation = 'young' | 'old' | 'permanent';

export interface GCObject {
  id: number;
  generation: Generation;
  size: number;
  marked: boolean;
  roots: number[]; // IDs of objects this references
  onFinalize?: () => void;
  age: number; // Survive count
}

export interface GCStats {
  collected: number;
  survived: number;
  promoted: number;
  totalFreed: number;
  cycleTime: number;
}

// =============================================================================
// GARBAGE COLLECTOR
// =============================================================================

export class GarbageCollector {
  private objects: Map<number, GCObject> = new Map();
  private rootSet: Set<number> = new Set(); // Root references (not collected)
  private nextId = 1;
  private stats: GCStats[] = [];
  private promotionThreshold = 3; // Ages before promotion to 'old'

  // ---------------------------------------------------------------------------
  // Object Management
  // ---------------------------------------------------------------------------

  allocate(size: number, generation: Generation = 'young', onFinalize?: () => void): number {
    const id = this.nextId++;
    this.objects.set(id, { id, generation, size, marked: false, roots: [], onFinalize, age: 0 });
    return id;
  }

  addReference(fromId: number, toId: number): void {
    const obj = this.objects.get(fromId);
    if (obj && !obj.roots.includes(toId)) obj.roots.push(toId);
  }

  removeReference(fromId: number, toId: number): void {
    const obj = this.objects.get(fromId);
    if (obj) obj.roots = obj.roots.filter((r) => r !== toId);
  }

  addRoot(id: number): void {
    this.rootSet.add(id);
  }
  removeRoot(id: number): void {
    this.rootSet.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Mark Phase
  // ---------------------------------------------------------------------------

  private mark(): void {
    // Clear all marks
    for (const obj of this.objects.values()) obj.marked = false;

    // Mark from roots
    const stack = [...this.rootSet];
    while (stack.length > 0) {
      const id = stack.pop()!;
      const obj = this.objects.get(id);
      if (!obj || obj.marked) continue;
      obj.marked = true;
      stack.push(...obj.roots);
    }
  }

  // ---------------------------------------------------------------------------
  // Sweep Phase
  // ---------------------------------------------------------------------------

  private sweep(generation?: Generation): GCStats {
    const start = performance.now();
    let collected = 0,
      survived = 0,
      promoted = 0,
      totalFreed = 0;

    for (const [id, obj] of this.objects) {
      if (generation && obj.generation !== generation) continue;
      if (obj.generation === 'permanent') continue; // Never collected

      if (!obj.marked) {
        // Finalize
        if (obj.onFinalize) obj.onFinalize();
        totalFreed += obj.size;
        collected++;
        this.objects.delete(id);
      } else {
        survived++;
        obj.age++;

        // Promote young → old
        if (obj.generation === 'young' && obj.age >= this.promotionThreshold) {
          obj.generation = 'old';
          obj.age = 0;
          promoted++;
        }
      }
    }

    const stat: GCStats = {
      collected,
      survived,
      promoted,
      totalFreed,
      cycleTime: performance.now() - start,
    };
    this.stats.push(stat);
    return stat;
  }

  // ---------------------------------------------------------------------------
  // Collection
  // ---------------------------------------------------------------------------

  collectYoung(): GCStats {
    this.mark();
    return this.sweep('young');
  }

  collectFull(): GCStats {
    this.mark();
    return this.sweep();
  }

  // ---------------------------------------------------------------------------
  // Defragmentation (simulate compaction)
  // ---------------------------------------------------------------------------

  defragment(): { movedCount: number; bytesMoved: number } {
    let movedCount = 0,
      bytesMoved = 0;

    // Compact by sorting objects by ID (simulate contiguous memory)
    const sorted = [...this.objects.values()].sort((a, b) => a.id - b.id);
    this.objects.clear();
    for (const obj of sorted) {
      this.objects.set(obj.id, obj);
      movedCount++;
      bytesMoved += obj.size;
    }

    return { movedCount, bytesMoved };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getObjectCount(): number {
    return this.objects.size;
  }
  getObject(id: number): GCObject | undefined {
    return this.objects.get(id);
  }
  getTotalSize(): number {
    let total = 0;
    for (const obj of this.objects.values()) total += obj.size;
    return total;
  }
  getGenerationCount(gen: Generation): number {
    let count = 0;
    for (const obj of this.objects.values()) if (obj.generation === gen) count++;
    return count;
  }
  getStats(): GCStats[] {
    return [...this.stats];
  }
  getRootCount(): number {
    return this.rootSet.size;
  }
}
