/**
 * SnapshotInterpolation.ts
 *
 * Buffered snapshot interpolation: lerp between server states,
 * jitter buffer, extrapolation fallback, and render delay.
 *
 * @module multiplayer
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Snapshot {
  timestamp: number;
  entities: Map<string, { x: number; y: number; z: number }>;
}

export interface InterpolatedEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  interpolated: boolean;
}

// =============================================================================
// SNAPSHOT INTERPOLATION
// =============================================================================

export class SnapshotInterpolation {
  private buffer: Snapshot[] = [];
  private bufferSize: number;
  private renderDelay: number; // ms behind real time

  constructor(bufferSize = 10, renderDelay = 100) {
    this.bufferSize = bufferSize;
    this.renderDelay = renderDelay;
  }

  // ---------------------------------------------------------------------------
  // Buffer Management
  // ---------------------------------------------------------------------------

  pushSnapshot(snapshot: Snapshot): void {
    this.buffer.push(snapshot);
    // Keep sorted by timestamp
    this.buffer.sort((a, b) => a.timestamp - b.timestamp);
    if (this.buffer.length > this.bufferSize) this.buffer.shift();
  }

  // ---------------------------------------------------------------------------
  // Interpolation
  // ---------------------------------------------------------------------------

  interpolate(currentTime: number): InterpolatedEntity[] {
    const renderTime = currentTime - this.renderDelay;
    const results: InterpolatedEntity[] = [];

    // Find bracketing snapshots
    let from: Snapshot | null = null;
    let to: Snapshot | null = null;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].timestamp <= renderTime && this.buffer[i + 1].timestamp >= renderTime) {
        from = this.buffer[i];
        to = this.buffer[i + 1];
        break;
      }
    }

    if (!from || !to) {
      // Extrapolate from latest snapshot
      const latest = this.buffer[this.buffer.length - 1];
      if (latest) {
        for (const [id, pos] of latest.entities) {
          results.push({ id, ...pos, interpolated: false });
        }
      }
      return results;
    }

    // Lerp factor
    const range = to.timestamp - from.timestamp;
    const t = range > 0 ? (renderTime - from.timestamp) / range : 0;

    // Interpolate all entities present in both snapshots
    for (const [id, fromPos] of from.entities) {
      const toPos = to.entities.get(id);
      if (toPos) {
        results.push({
          id,
          interpolated: true,
          x: fromPos.x + (toPos.x - fromPos.x) * t,
          y: fromPos.y + (toPos.y - fromPos.y) * t,
          z: fromPos.z + (toPos.z - fromPos.z) * t,
        });
      } else {
        results.push({ id, ...fromPos, interpolated: false });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getBufferCount(): number {
    return this.buffer.length;
  }
  getRenderDelay(): number {
    return this.renderDelay;
  }
  setRenderDelay(ms: number): void {
    this.renderDelay = ms;
  }
}
