/**
 * LagCompensation.ts
 *
 * Server-side lag compensation: history buffer, state rewind,
 * hit verification against past states, and latency estimation.
 *
 * @module multiplayer
 */

// =============================================================================
// TYPES
// =============================================================================

export interface HistoryState {
  timestamp: number;
  entities: Map<string, { x: number; y: number; z: number; radius: number }>;
}

export interface HitQuery {
  originX: number;
  originY: number;
  originZ: number;
  targetId: string;
  clientTimestamp: number;
  clientLatency: number;
}

export interface HitResult {
  hit: boolean;
  distance: number;
  rewoundTimestamp: number;
  targetPosition: { x: number; y: number; z: number } | null;
}

// =============================================================================
// LAG COMPENSATION
// =============================================================================

export class LagCompensation {
  private history: HistoryState[] = [];
  private maxHistory: number;
  private maxRewindMs: number;
  private latencyEstimates: Map<string, number> = new Map(); // player → ms

  constructor(maxHistory = 60, maxRewindMs = 500) {
    this.maxHistory = maxHistory;
    this.maxRewindMs = maxRewindMs;
  }

  // ---------------------------------------------------------------------------
  // History Management
  // ---------------------------------------------------------------------------

  pushState(state: HistoryState): void {
    this.history.push(state);
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  // ---------------------------------------------------------------------------
  // Rewind
  // ---------------------------------------------------------------------------

  getStateAt(timestamp: number): HistoryState | null {
    // Find closest state
    let closest: HistoryState | null = null;
    let closestDiff = Infinity;

    for (const state of this.history) {
      const diff = Math.abs(state.timestamp - timestamp);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = state;
      }
    }

    return closest;
  }

  // ---------------------------------------------------------------------------
  // Hit Verification
  // ---------------------------------------------------------------------------

  verifyHit(query: HitQuery): HitResult {
    const rewoundTimestamp = query.clientTimestamp - query.clientLatency;
    const past = this.getStateAt(rewoundTimestamp);

    if (!past) return { hit: false, distance: Infinity, rewoundTimestamp, targetPosition: null };

    const target = past.entities.get(query.targetId);
    if (!target) return { hit: false, distance: Infinity, rewoundTimestamp, targetPosition: null };

    const dx = target.x - query.originX;
    const dy = target.y - query.originY;
    const dz = target.z - query.originZ;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return {
      hit: distance <= target.radius,
      distance,
      rewoundTimestamp,
      targetPosition: { x: target.x, y: target.y, z: target.z },
    };
  }

  // ---------------------------------------------------------------------------
  // Latency
  // ---------------------------------------------------------------------------

  updateLatency(playerId: string, rttMs: number): void {
    const existing = this.latencyEstimates.get(playerId) ?? rttMs;
    // Exponential moving average
    this.latencyEstimates.set(playerId, existing * 0.8 + rttMs * 0.2);
  }

  getLatency(playerId: string): number {
    return this.latencyEstimates.get(playerId) ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getHistoryLength(): number {
    return this.history.length;
  }
  getMaxRewindMs(): number {
    return this.maxRewindMs;
  }
}
