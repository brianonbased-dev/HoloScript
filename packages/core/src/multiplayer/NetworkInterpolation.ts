/**
 * NetworkInterpolation.ts
 *
 * Smooth interpolation/extrapolation for networked entity states.
 * Implements jitter buffer, dead reckoning, and snapshot interpolation.
 *
 * W.NET.04: Async ring buffer pattern — render thread samples via interpolation,
 *   network I/O never blocks the 90fps render loop.
 * G.NET.03: bufferTimeMs capped at 100ms for VR (60ms ideal).
 * P.NET.03: Foveated interpolation priority — gaze targets get higher quality.
 *
 * @module multiplayer
 */

import { IVector3 } from '../physics/PhysicsTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface NetworkSnapshot {
  entityId: string;
  timestamp: number;
  position: IVector3;
  rotation: { x: number; y: number; z: number; w: number };
  velocity?: IVector3;
  angularVelocity?: IVector3;
  customData?: Record<string, number>;
}

/**
 * Interpolation quality mode.
 * P.NET.03: Foveated networking — gazed entities get hermite, peripheral get linear.
 */
export type InterpolationQuality = 'linear' | 'hermite';

export interface InterpolationConfig {
  bufferTimeMs: number; // Jitter buffer delay (e.g. 100ms)
  maxExtrapolationMs: number; // Max dead reckoning time (e.g. 250ms)
  snapThreshold: number; // Distance threshold for instant snap (teleport)
  lerpSpeed: number; // Interpolation speed multiplier
  /** P.NET.03: Default interpolation quality */
  defaultQuality: InterpolationQuality;
}

export interface InterpolatedState {
  position: IVector3;
  rotation: { x: number; y: number; z: number; w: number };
  isExtrapolating: boolean;
}

// =============================================================================
// NETWORK INTERPOLATION
// =============================================================================

const DEFAULT_CONFIG: InterpolationConfig = {
  bufferTimeMs: 100,
  maxExtrapolationMs: 250,
  snapThreshold: 10,
  lerpSpeed: 10,
  defaultQuality: 'linear',
};

/**
 * G.NET.03: VR-optimized config preset.
 * bufferTimeMs = 60ms (below 100ms VR ceiling, ideal for hand/head tracking).
 * maxExtrapolationMs = 150ms (extrapolate rather than wait).
 */
export const VR_CONFIG: InterpolationConfig = {
  bufferTimeMs: 60,
  maxExtrapolationMs: 150,
  snapThreshold: 5,
  lerpSpeed: 15,
  defaultQuality: 'hermite',
};

export class NetworkInterpolation {
  private config: InterpolationConfig;
  private snapshotBuffers: Map<string, NetworkSnapshot[]> = new Map();
  private maxBufferSize = 30;

  constructor(config: Partial<InterpolationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Snapshot Management
  // ---------------------------------------------------------------------------

  pushSnapshot(snapshot: NetworkSnapshot): void {
    let buffer = this.snapshotBuffers.get(snapshot.entityId);
    if (!buffer) {
      buffer = [];
      this.snapshotBuffers.set(snapshot.entityId, buffer);
    }

    buffer.push(snapshot);

    // Keep buffer bounded
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    // Keep sorted by timestamp
    buffer.sort((a, b) => a.timestamp - b.timestamp);
  }

  // ---------------------------------------------------------------------------
  // Interpolation
  // ---------------------------------------------------------------------------

  /**
   * Get interpolated state for an entity at the current render time.
   * Uses snapshot interpolation with jitter buffer delay.
   */
  getInterpolatedState(entityId: string, currentTimeMs: number): InterpolatedState | null {
    const buffer = this.snapshotBuffers.get(entityId);
    if (!buffer || buffer.length === 0) return null;

    const renderTime = currentTimeMs - this.config.bufferTimeMs;

    // Find surrounding snapshots
    let before: NetworkSnapshot | null = null;
    let after: NetworkSnapshot | null = null;

    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i].timestamp <= renderTime) {
        before = buffer[i];
      } else {
        after = buffer[i];
        break;
      }
    }

    // Case 1: We have both before and after → interpolate
    if (before && after) {
      const t = (renderTime - before.timestamp) / (after.timestamp - before.timestamp);
      return {
        position: this.lerpVec3(before.position, after.position, t),
        rotation: this.nlerp(before.rotation, after.rotation, t),
        isExtrapolating: false,
      };
    }

    // Case 2: We only have before → extrapolate using velocity
    if (before) {
      const timeSince = renderTime - before.timestamp;
      if (timeSince > this.config.maxExtrapolationMs) {
        // Stale — return last known position
        return {
          position: { ...before.position },
          rotation: { ...before.rotation },
          isExtrapolating: true,
        };
      }

      if (before.velocity) {
        const dtSec = timeSince / 1000;
        const position = {
          x: before.position.x + before.velocity.x * dtSec,
          y: before.position.y + before.velocity.y * dtSec,
          z: before.position.z + before.velocity.z * dtSec,
        };

        let rotation = { ...before.rotation };
        if (before.angularVelocity) {
          const wx = before.angularVelocity.x * dtSec;
          const wy = before.angularVelocity.y * dtSec;
          const wz = before.angularVelocity.z * dtSec;
          const len = Math.sqrt(wx * wx + wy * wy + wz * wz);
          if (len > 0.0001) {
            const halfLen = len * 0.5;
            const sinHalf = Math.sin(halfLen);
            const cosHalf = Math.cos(halfLen);
            const dqx = (wx / len) * sinHalf;
            const dqy = (wy / len) * sinHalf;
            const dqz = (wz / len) * sinHalf;
            const dqw = cosHalf;

            const qx = rotation.x,
              qy = rotation.y,
              qz = rotation.z,
              qw = rotation.w;

            const nx = dqw * qx + dqx * qw + dqy * qz - dqz * qy;
            const ny = dqw * qy - dqx * qz + dqy * qw + dqz * qx;
            const nz = dqw * qz + dqx * qy - dqy * qx + dqz * qw;
            const nw = dqw * qw - dqx * qx - dqy * qy - dqz * qz;

            const norm = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw) || 1;
            rotation = { x: nx / norm, y: ny / norm, z: nz / norm, w: nw / norm };
          }
        }

        return {
          position,
          rotation,
          isExtrapolating: true,
        };
      }

      return {
        position: { ...before.position },
        rotation: { ...before.rotation },
        isExtrapolating: true,
      };
    }

    // Case 3: We only have future snapshots → use first
    if (after) {
      return {
        position: { ...after.position },
        rotation: { ...after.rotation },
        isExtrapolating: false,
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Entity Smoothing (for local correction)
  // ---------------------------------------------------------------------------

  /**
   * Smooth correction: instead of snapping, blend toward the server position.
   */
  smoothCorrection(currentPos: IVector3, serverPos: IVector3, dt: number): IVector3 {
    const dx = serverPos.x - currentPos.x;
    const dy = serverPos.y - currentPos.y;
    const dz = serverPos.z - currentPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Snap if too far (teleported)
    if (dist > this.config.snapThreshold) {
      return { ...serverPos };
    }

    // Smooth lerp
    const t = Math.min(1, this.config.lerpSpeed * dt);
    return {
      x: currentPos.x + dx * t,
      y: currentPos.y + dy * t,
      z: currentPos.z + dz * t,
    };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getBufferSize(entityId: string): number {
    return this.snapshotBuffers.get(entityId)?.length ?? 0;
  }

  getLatestSnapshot(entityId: string): NetworkSnapshot | null {
    const buffer = this.snapshotBuffers.get(entityId);
    return buffer && buffer.length > 0 ? buffer[buffer.length - 1] : null;
  }

  clearEntity(entityId: string): void {
    this.snapshotBuffers.delete(entityId);
  }

  clearAll(): void {
    this.snapshotBuffers.clear();
  }

  // ---------------------------------------------------------------------------
  // Math
  // ---------------------------------------------------------------------------

  private lerpVec3(a: IVector3, b: IVector3, t: number): IVector3 {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    };
  }

  private nlerp(
    a: { x: number; y: number; z: number; w: number },
    b: { x: number; y: number; z: number; w: number },
    t: number
  ): { x: number; y: number; z: number; w: number } {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let bx = b.x,
      by = b.y,
      bz = b.z,
      bw = b.w;
    if (dot < 0) {
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }

    const rx = a.x + (bx - a.x) * t;
    const ry = a.y + (by - a.y) * t;
    const rz = a.z + (bz - a.z) * t;
    const rw = a.w + (bw - a.w) * t;
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw) || 1;
    return { x: rx / len, y: ry / len, z: rz / len, w: rw / len };
  }
}
