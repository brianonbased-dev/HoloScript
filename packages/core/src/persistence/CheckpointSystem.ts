/**
 * CheckpointSystem.ts
 *
 * Auto-checkpoint: periodic state snapshots, rollback to
 * any checkpoint, and diff-based storage efficiency.
 *
 * @module persistence
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Checkpoint {
  id: string;
  label: string;
  timestamp: number;
  data: Record<string, unknown>;
  diff: Record<string, unknown> | null; // Diff from previous, null = full snapshot
  parentId: string | null;
  size: number;
}

// =============================================================================
// CHECKPOINT SYSTEM
// =============================================================================

let _checkId = 0;

export class CheckpointSystem {
  private checkpoints: Checkpoint[] = [];
  private maxCheckpoints = 50;
  private autoInterval = 0; // seconds, 0 = disabled
  private autoTimer = 0;
  private currentState: Record<string, unknown> = {};

  // ---------------------------------------------------------------------------
  // Checkpoint Creation
  // ---------------------------------------------------------------------------

  createCheckpoint(label: string, data: Record<string, unknown>): Checkpoint {
    const serialized = JSON.stringify(data);
    const parentId =
      this.checkpoints.length > 0 ? this.checkpoints[this.checkpoints.length - 1].id : null;

    let diff: Record<string, unknown> | null = null;
    if (parentId) {
      const parent = this.checkpoints[this.checkpoints.length - 1];
      diff = this.computeDiff(parent.data, data);
    }

    const checkpoint: Checkpoint = {
      id: `ckpt_${_checkId++}`,
      label,
      timestamp: Date.now(),
      data: JSON.parse(serialized),
      diff,
      parentId,
      size: serialized.length,
    };

    this.checkpoints.push(checkpoint);
    this.currentState = data;

    if (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints.shift();
    }

    return checkpoint;
  }

  // ---------------------------------------------------------------------------
  // Rollback
  // ---------------------------------------------------------------------------

  rollback(checkpointId: string): Record<string, unknown> | null {
    const idx = this.checkpoints.findIndex((c) => c.id === checkpointId);
    if (idx < 0) return null;

    const checkpoint = this.checkpoints[idx];
    this.currentState = JSON.parse(JSON.stringify(checkpoint.data));

    // Remove all checkpoints after this one
    this.checkpoints = this.checkpoints.slice(0, idx + 1);

    return this.currentState;
  }

  rollbackToLatest(): Record<string, unknown> | null {
    if (this.checkpoints.length === 0) return null;
    return this.rollback(this.checkpoints[this.checkpoints.length - 1].id);
  }

  // ---------------------------------------------------------------------------
  // Auto-checkpoint
  // ---------------------------------------------------------------------------

  setAutoInterval(seconds: number): void {
    this.autoInterval = seconds;
  }

  update(dt: number): Checkpoint | null {
    if (this.autoInterval <= 0) return null;

    this.autoTimer += dt;
    if (this.autoTimer >= this.autoInterval) {
      this.autoTimer = 0;
      return this.createCheckpoint('Auto', this.currentState);
    }
    return null;
  }

  setCurrentState(state: Record<string, unknown>): void {
    this.currentState = state;
  }

  // ---------------------------------------------------------------------------
  // Diff Computation
  // ---------------------------------------------------------------------------

  private computeDiff(
    old: Record<string, unknown>,
    current: Record<string, unknown>
  ): Record<string, unknown> {
    const diff: Record<string, unknown> = {};
    for (const key of Object.keys(current)) {
      if (JSON.stringify(old[key]) !== JSON.stringify(current[key])) {
        diff[key] = current[key];
      }
    }
    for (const key of Object.keys(old)) {
      if (!(key in current)) {
        diff[key] = '__DELETED__';
      }
    }
    return diff;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.find((c) => c.id === id);
  }

  getAllCheckpoints(): Checkpoint[] {
    return [...this.checkpoints];
  }
  getCheckpointCount(): number {
    return this.checkpoints.length;
  }
  getLatest(): Checkpoint | null {
    return this.checkpoints.length > 0 ? this.checkpoints[this.checkpoints.length - 1] : null;
  }

  getTotalSize(): number {
    return this.checkpoints.reduce((sum, c) => sum + c.size, 0);
  }

  clear(): void {
    this.checkpoints = [];
  }
  setMaxCheckpoints(max: number): void {
    this.maxCheckpoints = max;
  }
}
