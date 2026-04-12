/**
 * SimulationRecorder — Record simulation field snapshots for playback.
 *
 * Captures field data from any SimSolver at configurable intervals,
 * stores in a memory-capped circular buffer, and supports bracket
 * search for interpolated playback.
 *
 * @see SimulationPlayback — consumes recorded snapshots for scrubbing
 * @see SimSolver — generic solver interface whose fields we capture
 */

import type { SimSolver } from './SimSolver';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FieldSnapshot {
  /** Simulation time in seconds */
  time: number;
  /** Field name → copied Float32Array data */
  fields: Map<string, Float32Array>;
}

export interface RecorderConfig {
  /** Maximum memory budget in bytes (default: 512MB) */
  maxMemoryBytes?: number;
  /** Minimum interval between captures in seconds (default: 0 = every step) */
  captureInterval?: number;
  /** Which fields to capture (default: all from solver.fieldNames) */
  fieldFilter?: string[];
}

// ── Recorder ─────────────────────────────────────────────────────────────────

export class SimulationRecorder {
  private snapshots: FieldSnapshot[] = [];
  private totalBytes = 0;
  private lastCaptureTime = -Infinity;
  private maxBytes: number;
  private interval: number;
  private filter: string[] | null;

  constructor(config: RecorderConfig = {}) {
    this.maxBytes = config.maxMemoryBytes ?? 512 * 1024 * 1024; // 512MB
    this.interval = config.captureInterval ?? 0;
    this.filter = config.fieldFilter ?? null;
  }

  /**
   * Capture a snapshot from the solver at the given simulation time.
   * Returns true if a snapshot was captured, false if skipped (interval not met).
   */
  capture(solver: SimSolver, simTime: number): boolean {
    // Check interval
    if (simTime - this.lastCaptureTime < this.interval && this.snapshots.length > 0) {
      return false;
    }

    // Determine which fields to capture
    const fieldNames = this.filter ?? (solver.fieldNames as string[]);

    // Copy all requested fields
    const fields = new Map<string, Float32Array>();
    for (const name of fieldNames) {
      const data = solver.getField(name);
      if (data === null) continue;

      // Normalize to Float32Array for uniform storage
      if (data instanceof Float32Array) {
        fields.set(name, new Float32Array(data)); // copy
      } else if (data instanceof Float64Array) {
        fields.set(name, new Float32Array(data)); // downcast copy
      } else {
        // RegularGrid3D — store the .data array
        fields.set(name, new Float32Array((data as { data: Float32Array }).data));
      }
    }

    if (fields.size === 0) return false;

    const snapshot: FieldSnapshot = { time: simTime, fields };
    const bytes = this.snapshotBytes(snapshot);

    // Evict if over budget
    while (this.totalBytes + bytes > this.maxBytes && this.snapshots.length > 2) {
      this.evict();
    }

    this.snapshots.push(snapshot);
    this.totalBytes += bytes;
    this.lastCaptureTime = simTime;
    return true;
  }

  /**
   * Find the two snapshots bracketing a given time, plus interpolation alpha.
   * Returns { before, after, alpha } where alpha ∈ [0,1].
   */
  findBracket(time: number): { before: number; after: number; alpha: number } {
    const n = this.snapshots.length;
    if (n === 0) return { before: 0, after: 0, alpha: 0 };
    if (n === 1 || time <= this.snapshots[0].time) return { before: 0, after: 0, alpha: 0 };
    if (time >= this.snapshots[n - 1].time) return { before: n - 1, after: n - 1, alpha: 0 };

    // Binary search for the bracket
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.snapshots[mid].time <= time) lo = mid;
      else hi = mid;
    }

    const t0 = this.snapshots[lo].time;
    const t1 = this.snapshots[hi].time;
    const alpha = t1 > t0 ? (time - t0) / (t1 - t0) : 0;

    return { before: lo, after: hi, alpha };
  }

  /** Get a snapshot by index. */
  getSnapshot(index: number): FieldSnapshot | null {
    return this.snapshots[index] ?? null;
  }

  /** Number of recorded snapshots. */
  get frameCount(): number {
    return this.snapshots.length;
  }

  /** Time range [start, end] in seconds. */
  get timeRange(): [number, number] {
    if (this.snapshots.length === 0) return [0, 0];
    return [this.snapshots[0].time, this.snapshots[this.snapshots.length - 1].time];
  }

  /** Estimated memory usage in bytes. */
  get memoryUsage(): number {
    return this.totalBytes;
  }

  /** Clear all recorded data. */
  clear(): void {
    this.snapshots = [];
    this.totalBytes = 0;
    this.lastCaptureTime = -Infinity;
  }

  /**
   * Evict oldest snapshots to free memory.
   * Strategy: drop every other frame from the first half of history
   * (temporal downsampling of old data, preserves recent detail).
   */
  private evict(): void {
    const halfIdx = Math.floor(this.snapshots.length / 2);
    const toRemove: number[] = [];

    // Mark every other snapshot in the first half for removal
    for (let i = 1; i < halfIdx; i += 2) {
      toRemove.push(i);
    }

    // Remove from end to preserve indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      this.totalBytes -= this.snapshotBytes(this.snapshots[idx]);
      this.snapshots.splice(idx, 1);
    }
  }

  /** Estimate bytes for a snapshot. */
  private snapshotBytes(snap: FieldSnapshot): number {
    let bytes = 16; // time (8) + map overhead (~8)
    for (const [, data] of snap.fields) {
      bytes += data.byteLength;
    }
    return bytes;
  }
}
