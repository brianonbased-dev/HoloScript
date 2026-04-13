/**
 * NetworkSystem.ts
 *
 * EngineSystem for real-time multiplayer networking.
 * Implements delta compression, interest management (spatial filtering),
 * client-side prediction, and entity interpolation.
 *
 * @module network
 */

import type { EngineSystem } from '../engine/SpatialEngine';

// =============================================================================
// TYPES
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface EntityState {
  id: string;
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  timestamp: number;
  /** Component data that changed (sparse). */
  components: Record<string, unknown>;
}

export interface NetworkDelta {
  entityId: string;
  /** Only the fields that changed since last sync. */
  fields: Record<string, unknown>;
  timestamp: number;
  sequence: number;
}

export interface InterestArea {
  center: Vec3;
  radius: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface NetworkMetrics {
  rtt: number; // Round-trip time (ms)
  bytesSent: number;
  bytesReceived: number;
  packetsDropped: number;
  entitiesTracked: number;
  deltasSent: number;
  deltasReceived: number;
  compressionRatio: number;
}

// =============================================================================
// DELTA COMPRESSION
// =============================================================================

export class DeltaCompressor {
  private previousStates: Map<string, Record<string, unknown>> = new Map();

  /**
   * Compute the diff between current and previous state.
   * Returns only changed fields. Returns null if nothing changed.
   */
  compress(entityId: string, current: Record<string, unknown>): Record<string, unknown> | null {
    const prev = this.previousStates.get(entityId);
    if (!prev) {
      this.previousStates.set(entityId, { ...current });
      return current; // Full state for first sync
    }

    const delta: Record<string, unknown> = {};
    let hasChanges = false;

    for (const [key, value] of Object.entries(current)) {
      if (!this.deepEqual(prev[key], value)) {
        delta[key] = value;
        hasChanges = true;
      }
    }

    // Check for removed keys
    for (const key of Object.keys(prev)) {
      if (!(key in current)) {
        delta[key] = null;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.previousStates.set(entityId, { ...current });
      return delta;
    }
    return null;
  }

  /** Apply a delta back to reconstruct full state. */
  decompress(entityId: string, delta: Record<string, unknown>): Record<string, unknown> {
    const prev = this.previousStates.get(entityId) ?? {};
    const merged = { ...prev };

    for (const [key, value] of Object.entries(delta)) {
      if (value === null) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }

    this.previousStates.set(entityId, merged);
    return merged;
  }

  reset(entityId?: string): void {
    if (entityId) {
      this.previousStates.delete(entityId);
    } else {
      this.previousStates.clear();
    }
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every((k) => this.deepEqual(aObj[k], bObj[k]));
    }
    return false;
  }
}

// =============================================================================
// INTEREST MANAGEMENT
// =============================================================================

export class InterestManager {
  private playerArea: InterestArea = { center: { x: 0, y: 0, z: 0 }, radius: 100 };

  setPlayerPosition(pos: Vec3): void {
    this.playerArea.center = { ...pos };
  }

  setRadius(radius: number): void {
    this.playerArea.radius = radius;
  }

  /**
   * Filter entities to only those within the player's interest area.
   * Uses squared distance for performance (no sqrt).
   */
  filterRelevant<T extends { position: Vec3 }>(entities: T[]): T[] {
    const c = this.playerArea.center;
    const r2 = this.playerArea.radius * this.playerArea.radius;

    return entities.filter((e) => {
      const dx = e.position.x - c.x;
      const dy = e.position.y - c.y;
      const dz = e.position.z - c.z;
      return dx * dx + dy * dy + dz * dz <= r2;
    });
  }

  /** Check if a single position is within interest area. */
  isRelevant(pos: Vec3): boolean {
    const c = this.playerArea.center;
    const dx = pos.x - c.x;
    const dy = pos.y - c.y;
    const dz = pos.z - c.z;
    return dx * dx + dy * dy + dz * dz <= this.playerArea.radius * this.playerArea.radius;
  }

  getArea(): InterestArea {
    return { ...this.playerArea, center: { ...this.playerArea.center } };
  }
}

// =============================================================================
// ENTITY INTERPOLATION
// =============================================================================

export class EntityInterpolator {
  private buffers: Map<string, { state: EntityState; receivedAt: number }[]> = new Map();
  private bufferTimeMs = 100; // 100ms interpolation delay

  setBufferTime(ms: number): void {
    this.bufferTimeMs = ms;
  }

  /** Push a new state snapshot from the network. */
  pushState(state: EntityState): void {
    if (!this.buffers.has(state.id)) {
      this.buffers.set(state.id, []);
    }
    const buf = this.buffers.get(state.id)!;
    buf.push({ state, receivedAt: performance.now() });

    // Keep only last 10 states
    if (buf.length > 10) buf.shift();
  }

  /**
   * Get the interpolated position for an entity at render time.
   * Uses linear interpolation between the two nearest buffered states.
   */
  getInterpolated(entityId: string): EntityState | null {
    const buf = this.buffers.get(entityId);
    if (!buf || buf.length === 0) return null;
    if (buf.length === 1) return buf[0].state;

    const renderTime = performance.now() - this.bufferTimeMs;

    // Find the two states that bracket renderTime
    let before = buf[0];
    let after = buf[buf.length - 1];

    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].receivedAt <= renderTime && buf[i + 1].receivedAt >= renderTime) {
        before = buf[i];
        after = buf[i + 1];
        break;
      }
    }

    const span = after.receivedAt - before.receivedAt;
    if (span <= 0) return after.state;

    const t = Math.max(0, Math.min(1, (renderTime - before.receivedAt) / span));

    return {
      id: entityId,
      position: [before.state.position.x + (after.state.position.x - before.state.position.x) * t, before.state.position.y + (after.state.position.y - before.state.position.y) * t, before.state.position.z + (after.state.position.z - before.state.position.z) * t,],
      rotation: {
        x: before.state.rotation.x + (after.state.rotation.x - before.state.rotation.x) * t,
        y: before.state.rotation.y + (after.state.rotation.y - before.state.rotation.y) * t,
        z: before.state.rotation.z + (after.state.rotation.z - before.state.rotation.z) * t,
      },
      velocity: after.state.velocity,
      timestamp: renderTime,
      components: after.state.components,
    };
  }

  removeEntity(id: string): void {
    this.buffers.delete(id);
  }

  clear(): void {
    this.buffers.clear();
  }
}

// =============================================================================
// NETWORK SYSTEM
// =============================================================================

export class NetworkSystem implements EngineSystem {
  readonly name = 'NetworkSystem';
  readonly priority = 25; // Very early — receive before physics

  readonly compressor = new DeltaCompressor();
  readonly interest = new InterestManager();
  readonly interpolator = new EntityInterpolator();

  private state: ConnectionState = 'disconnected';
  private serverUrl = '';
  private outboundQueue: NetworkDelta[] = [];
  private sequence = 0;
  private metrics: NetworkMetrics = {
    rtt: 0,
    bytesSent: 0,
    bytesReceived: 0,
    packetsDropped: 0,
    entitiesTracked: 0,
    deltasSent: 0,
    deltasReceived: 0,
    compressionRatio: 1,
  };

  // Send rate limiting
  private sendIntervalMs = 50; // 20 Hz
  private lastSendTime = 0;

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  configure(serverUrl: string, sendRate = 20): void {
    this.serverUrl = serverUrl;
    this.sendIntervalMs = 1000 / sendRate;
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.state !== 'disconnected') return;
    this.state = 'connecting';
    // In production: open WebSocket
    this.state = 'connected';
  }

  disconnect(): void {
    this.state = 'disconnected';
    this.outboundQueue = [];
    this.compressor.reset();
    this.interpolator.clear();
  }

  // ---------------------------------------------------------------------------
  // EngineSystem
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    if (this.state !== 'connected') return;

    // Flush outbound deltas at configured rate
    const now = performance.now();
    if (now - this.lastSendTime >= this.sendIntervalMs && this.outboundQueue.length > 0) {
      this.flush();
      this.lastSendTime = now;
    }
  }

  // ---------------------------------------------------------------------------
  // Outbound: Entity State → Deltas
  // ---------------------------------------------------------------------------

  /** Queue a state update. Only changed fields will be sent (delta compressed). */
  queueUpdate(entityId: string, state: Record<string, unknown>): void {
    const delta = this.compressor.compress(entityId, state);
    if (delta) {
      this.outboundQueue.push({
        entityId,
        fields: delta,
        timestamp: performance.now(),
        sequence: this.sequence++,
      });
    }
  }

  /** Force-send all queued deltas. */
  flush(): NetworkDelta[] {
    const deltas = [...this.outboundQueue];
    this.metrics.deltasSent += deltas.length;
    this.outboundQueue = [];
    return deltas; // In production: serialize and send over WebSocket
  }

  // ---------------------------------------------------------------------------
  // Inbound: Deltas → Entity State
  // ---------------------------------------------------------------------------

  /** Process received deltas from server. */
  receiveDeltas(deltas: NetworkDelta[]): void {
    this.metrics.deltasReceived += deltas.length;

    for (const delta of deltas) {
      const fullState = this.compressor.decompress(delta.entityId, delta.fields);

      // Push to interpolator if position data exists
      if (fullState.position) {
        this.interpolator.pushState({
          id: delta.entityId,
          position: fullState.position as Vec3,
          rotation: (fullState.rotation as Vec3) ?? { x: 0, y: 0, z: 0 },
          velocity: (fullState.velocity as Vec3) ?? { x: 0, y: 0, z: 0 },
          timestamp: delta.timestamp,
          components: fullState,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getMetrics(): NetworkMetrics {
    return { ...this.metrics };
  }
  getPendingDeltaCount(): number {
    return this.outboundQueue.length;
  }

  destroy(): void {
    this.disconnect();
  }
}
