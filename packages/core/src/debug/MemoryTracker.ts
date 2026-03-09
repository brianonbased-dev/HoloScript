/**
 * MemoryTracker.ts
 *
 * Memory tracking: allocation tagging, budget enforcement,
 * leak detection, heap snapshots, and reporting.
 *
 * @module debug
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AllocationRecord {
  id: number;
  tag: string;
  sizeBytes: number;
  timestamp: number;
  freed: boolean;
}

export interface MemoryBudget {
  tag: string;
  maxBytes: number;
  currentBytes: number;
  peakBytes: number;
}

export interface HeapSnapshot {
  timestamp: number;
  totalAllocated: number;
  totalFreed: number;
  activeAllocations: number;
  tagBreakdown: Map<string, { count: number; bytes: number }>;
}

// =============================================================================
// MEMORY TRACKER
// =============================================================================

export class MemoryTracker {
  private allocations: Map<number, AllocationRecord> = new Map();
  private budgets: Map<string, MemoryBudget> = new Map();
  private snapshots: HeapSnapshot[] = [];
  private nextId = 1;
  private totalAllocated = 0;
  private totalFreed = 0;
  private warnings: string[] = [];

  // ---------------------------------------------------------------------------
  // Allocation Tracking
  // ---------------------------------------------------------------------------

  allocate(tag: string, sizeBytes: number): number {
    const id = this.nextId++;
    this.allocations.set(id, { id, tag, sizeBytes, timestamp: Date.now(), freed: false });
    this.totalAllocated += sizeBytes;

    // Budget tracking
    const budget = this.budgets.get(tag);
    if (budget) {
      budget.currentBytes += sizeBytes;
      budget.peakBytes = Math.max(budget.peakBytes, budget.currentBytes);
      if (budget.currentBytes > budget.maxBytes) {
        this.warnings.push(
          `Budget exceeded for "${tag}": ${budget.currentBytes}/${budget.maxBytes} bytes`
        );
      }
    }

    return id;
  }

  free(id: number): boolean {
    const record = this.allocations.get(id);
    if (!record || record.freed) return false;

    record.freed = true;
    this.totalFreed += record.sizeBytes;

    const budget = this.budgets.get(record.tag);
    if (budget) budget.currentBytes -= record.sizeBytes;

    return true;
  }

  // ---------------------------------------------------------------------------
  // Budgets
  // ---------------------------------------------------------------------------

  setBudget(tag: string, maxBytes: number): void {
    const existing = this.budgets.get(tag);
    if (existing) {
      existing.maxBytes = maxBytes;
    } else {
      this.budgets.set(tag, { tag, maxBytes, currentBytes: 0, peakBytes: 0 });
    }
  }

  getBudget(tag: string): MemoryBudget | undefined {
    return this.budgets.get(tag);
  }
  getBudgetUsage(tag: string): number {
    const b = this.budgets.get(tag);
    return b ? b.currentBytes / b.maxBytes : 0;
  }

  // ---------------------------------------------------------------------------
  // Leak Detection
  // ---------------------------------------------------------------------------

  detectLeaks(olderThanMs: number): AllocationRecord[] {
    const cutoff = Date.now() - olderThanMs;
    const leaks: AllocationRecord[] = [];
    for (const alloc of this.allocations.values()) {
      if (!alloc.freed && alloc.timestamp < cutoff) leaks.push(alloc);
    }
    return leaks;
  }

  // ---------------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------------

  takeSnapshot(): HeapSnapshot {
    const tagBreakdown = new Map<string, { count: number; bytes: number }>();

    for (const alloc of this.allocations.values()) {
      if (alloc.freed) continue;
      const existing = tagBreakdown.get(alloc.tag) ?? { count: 0, bytes: 0 };
      existing.count++;
      existing.bytes += alloc.sizeBytes;
      tagBreakdown.set(alloc.tag, existing);
    }

    const snapshot: HeapSnapshot = {
      timestamp: Date.now(),
      totalAllocated: this.totalAllocated,
      totalFreed: this.totalFreed,
      activeAllocations: this.getActiveCount(),
      tagBreakdown,
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  getSnapshots(): HeapSnapshot[] {
    return [...this.snapshots];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getActiveCount(): number {
    let count = 0;
    for (const a of this.allocations.values()) if (!a.freed) count++;
    return count;
  }

  getActiveBytes(): number {
    let bytes = 0;
    for (const a of this.allocations.values()) if (!a.freed) bytes += a.sizeBytes;
    return bytes;
  }

  getTotalAllocated(): number {
    return this.totalAllocated;
  }
  getTotalFreed(): number {
    return this.totalFreed;
  }
  getWarnings(): string[] {
    return [...this.warnings];
  }
  clearWarnings(): void {
    this.warnings = [];
  }
}
