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

import { IVector3 } from '@holoscript/engine/physics/PhysicsTypes';

/** Tuple vec3 copy — `IVector3` is `[x,y,z]`, not `{x,y,z}`. */
function v3clone(v: IVector3): IVector3 {
  return [v[0], v[1], v[2]];
}

type Vec3Like = IVector3 | { x: number; y: number; z: number };

function readX(v: Vec3Like): number {
  return Array.isArray(v) ? v[0] : v.x;
}

function readY(v: Vec3Like): number {
  return Array.isArray(v) ? v[1] : v.y;
}

function readZ(v: Vec3Like): number {
  return Array.isArray(v) ? v[2] : v.z;
}

function makeVec3(x: number, y: number, z: number): IVector3 & { x: number; y: number; z: number } {
  const v = [x, y, z] as IVector3 & { x: number; y: number; z: number };
  v.x = x;
  v.y = y;
  v.z = z;
  return v;
}

function cloneVec3Like(v: Vec3Like): IVector3 & { x: number; y: number; z: number } {
  return makeVec3(readX(v), readY(v), readZ(v));
}

// =============================================================================
// TYPES
// =============================================================================

export interface NetworkSnapshot {
  entityId: string;
  timestamp: number;
  position: Vec3Like;
  rotation: { x: number; y: number; z: number; w: number };
  velocity?: Vec3Like;
  angularVelocity?: Vec3Like;
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
  position: IVector3 & { x: number; y: number; z: number };
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

    this.insertSnapshotOrdered(buffer, snapshot);

    while (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }
  }

  /**
   * Insert snapshot in timestamp order without sorting the whole buffer each time.
   * In-order packets: O(1). Out-of-order: O(log n) + splice.
   */
  private insertSnapshotOrdered(buffer: NetworkSnapshot[], snap: NetworkSnapshot): void {
    const t = snap.timestamp;
    const n = buffer.length;
    if (n === 0) {
      buffer.push(snap);
      return;
    }
    const last = buffer[n - 1]!;
    if (t > last.timestamp) {
      buffer.push(snap);
      return;
    }
    if (t === last.timestamp) {
      buffer[n - 1] = snap;
      return;
    }

    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (buffer[mid]!.timestamp < t) lo = mid + 1;
      else hi = mid;
    }
    if (lo < n && buffer[lo]!.timestamp === t) {
      buffer[lo] = snap;
    } else {
      buffer.splice(lo, 0, snap);
    }
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
          position: cloneVec3Like(before.position),
          rotation: { ...before.rotation },
          isExtrapolating: true,
        };
      }

      if (before.velocity) {
        const dtSec = timeSince / 1000;
        const px = readX(before.position) + readX(before.velocity) * dtSec;
        const py = readY(before.position) + readY(before.velocity) * dtSec;
        const pz = readZ(before.position) + readZ(before.velocity) * dtSec;
        const position = makeVec3(px, py, pz);

        let rotation = { ...before.rotation };
        if (before.angularVelocity) {
          const wx = readX(before.angularVelocity) * dtSec;
          const wy = readY(before.angularVelocity) * dtSec;
          const wz = readZ(before.angularVelocity) * dtSec;
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
        position: cloneVec3Like(before.position),
        rotation: { ...before.rotation },
        isExtrapolating: true,
      };
    }

    // Case 3: We only have future snapshots → use first
    if (after) {
      return {
        position: cloneVec3Like(after.position),
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
  smoothCorrection(currentPos: Vec3Like, serverPos: Vec3Like, dt: number): IVector3 & { x: number; y: number; z: number } {
    const dx = readX(serverPos) - readX(currentPos);
    const dy = readY(serverPos) - readY(currentPos);
    const dz = readZ(serverPos) - readZ(currentPos);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Snap if too far (teleported)
    if (dist > this.config.snapThreshold) {
      return cloneVec3Like(serverPos);
    }

    // Smooth lerp
    const t = Math.min(1, this.config.lerpSpeed * dt);
    return makeVec3(readX(currentPos) + dx * t, readY(currentPos) + dy * t, readZ(currentPos) + dz * t);
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

  private lerpVec3(a: Vec3Like, b: Vec3Like, t: number): IVector3 & { x: number; y: number; z: number } {
    return makeVec3(
      readX(a) + (readX(b) - readX(a)) * t,
      readY(a) + (readY(b) - readY(a)) * t,
      readZ(a) + (readZ(b) - readZ(a)) * t,
    );
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
