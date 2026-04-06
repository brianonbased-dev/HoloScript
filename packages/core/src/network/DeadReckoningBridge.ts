/**
 * DeadReckoningBridge — Cross-domain interop between physics and networking.
 *
 * Bridges @rigidbody (physics domain) with @networked (network domain) to enable
 * smooth multiplayer physics synchronization. Implements dead-reckoning prediction
 * using physics-aware extrapolation (mass, forces, damping, gravity) instead of
 * naive linear velocity projection.
 *
 * Track 3A: Physics + Networking convergence.
 *
 * Key capabilities:
 * - Extracts physics state (position, velocity, angular velocity, forces) into
 *   compact network-serializable snapshots
 * - Physics-aware prediction using semi-implicit Euler integration with damping
 * - Threshold-based correction blending (invisible, smooth, snap)
 * - Authority resolution for physics ownership transfers
 * - 20Hz sync rate tolerance (masks 50ms inter-packet gaps)
 *
 * @module network
 */

import type { IVector3, IQuaternion } from './NetworkTypes';
import { lerpVector3, distanceVector3 } from './NetworkTypes';

// =============================================================================
// Configuration
// =============================================================================

/** Dead-reckoning configuration for physics-networked entities */
export interface DeadReckoningConfig {
  /** Sync rate in Hz (default: 20) */
  syncRate: number;
  /** Maximum extrapolation time before snapping (ms) */
  maxExtrapolation: number;
  /** Whether to include angular velocity in prediction */
  predictRotation: boolean;
  /** Whether to apply gravity in prediction */
  applyGravity: boolean;
  /** Gravity vector (default: { x: 0, y: -9.81, z: 0 }) */
  gravity: IVector3;
  /** Correction strategy */
  correction: CorrectionStrategy;
  /** Error thresholds (meters) */
  thresholds: DeadReckoningThresholds;
  /** Authority mode for physics ownership */
  authority: AuthorityMode;
  /** Maximum snapshots to retain for rollback */
  snapshotBufferSize: number;
}

export interface DeadReckoningThresholds {
  /** Below this: no correction needed (meters) */
  invisible: number;
  /** Below this: smooth exponential blend (meters) */
  smooth: number;
  /** Above smooth: snap to correct position */
}

export type CorrectionStrategy = 'exponential' | 'bezier' | 'snap';
export type AuthorityMode = 'owner' | 'server' | 'nearest';

export const DEFAULT_DEAD_RECKONING_CONFIG: DeadReckoningConfig = {
  syncRate: 20,
  maxExtrapolation: 250,
  predictRotation: true,
  applyGravity: true,
  gravity: { x: 0, y: -9.81, z: 0 },
  correction: 'exponential',
  thresholds: { invisible: 0.01, smooth: 0.5 },
  authority: 'owner',
  snapshotBufferSize: 30,
};

// =============================================================================
// Physics State Snapshot
// =============================================================================

/** Compact physics state for network transmission */
export interface PhysicsSnapshot {
  /** Entity identifier */
  entityId: string;
  /** Server/sender timestamp (ms) */
  timestamp: number;
  /** Monotonic sequence number */
  sequence: number;
  /** World-space position */
  position: IVector3;
  /** World-space rotation */
  rotation: IQuaternion;
  /** Linear velocity (m/s) */
  velocity: IVector3;
  /** Angular velocity (rad/s) */
  angularVelocity: IVector3;
  /** Net force currently applied (N) — for prediction accuracy */
  appliedForce: IVector3;
  /** Mass (kg) — needed for F=ma prediction */
  mass: number;
  /** Linear damping coefficient */
  linearDamping: number;
  /** Whether gravity is applied */
  useGravity: boolean;
  /** Whether the body is kinematic (no physics prediction needed) */
  isKinematic: boolean;
}

/** Byte size estimate for bandwidth calculations */
export const SNAPSHOT_BYTE_SIZE =
  4 + // entityId hash
  8 + // timestamp
  4 + // sequence
  12 + // position (3 × f32)
  16 + // rotation (4 × f32)
  12 + // velocity
  12 + // angularVelocity
  12 + // appliedForce
  4 + // mass
  4 + // linearDamping
  1 + // useGravity
  1; // isKinematic
// Total: 90 bytes per snapshot

// =============================================================================
// Dead-Reckoning Predictor
// =============================================================================

/**
 * Physics-aware dead-reckoning predictor.
 *
 * Uses semi-implicit Euler integration with damping and gravity to predict
 * where a rigidbody will be at a future time, given its last known state.
 * This is significantly more accurate than linear extrapolation for objects
 * affected by gravity, drag, or external forces.
 */
export class DeadReckoningPredictor {
  private config: DeadReckoningConfig;
  private snapshots: PhysicsSnapshot[] = [];
  private correctionOffset: IVector3 = { x: 0, y: 0, z: 0 };
  private correctionStartTime = 0;
  private correctionDuration = 0;

  constructor(config: Partial<DeadReckoningConfig> = {}) {
    this.config = { ...DEFAULT_DEAD_RECKONING_CONFIG, ...config };
  }

  /**
   * Feed a new authoritative physics snapshot from the network.
   */
  pushSnapshot(snapshot: PhysicsSnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.config.snapshotBufferSize) {
      this.snapshots.shift();
    }
  }

  /**
   * Get the latest received snapshot.
   */
  getLatestSnapshot(): PhysicsSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /**
   * Predict the physics state at a given time using dead-reckoning.
   *
   * Uses semi-implicit Euler integration:
   *   v(t+dt) = v(t) * (1 - damping * dt) + (F/m + g) * dt
   *   p(t+dt) = p(t) + v(t+dt) * dt
   *
   * This accounts for gravity, damping, and applied forces — much more
   * accurate than naive linear extrapolation for physics objects.
   */
  predict(currentTime: number): PhysicsSnapshot | null {
    const latest = this.getLatestSnapshot();
    if (!latest) return null;

    const dt = (currentTime - latest.timestamp) / 1000; // seconds

    // Clamp extrapolation to prevent runaway predictions
    if (dt < 0) return latest;
    const maxDt = this.config.maxExtrapolation / 1000;
    const clampedDt = Math.min(dt, maxDt);

    let nextRotation = { ...latest.rotation };
    if (this.config.predictRotation) {
      const wx = latest.angularVelocity.x * clampedDt;
      const wy = latest.angularVelocity.y * clampedDt;
      const wz = latest.angularVelocity.z * clampedDt;
      const len = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (len > 0.0001) {
        const halfLen = len * 0.5;
        const sinHalf = Math.sin(halfLen);
        const dqw = Math.cos(halfLen);
        const dqx = (wx / len) * sinHalf;
        const dqy = (wy / len) * sinHalf;
        const dqz = (wz / len) * sinHalf;

        const qx = nextRotation.x,
          qy = nextRotation.y,
          qz = nextRotation.z,
          qw = nextRotation.w;
        // Quaternion multiply nextRotation = dq * rotation
        const nx = dqw * qx + dqx * qw + dqy * qz - dqz * qy;
        const ny = dqw * qy - dqx * qz + dqy * qw + dqz * qx;
        const nz = dqw * qz + dqx * qy - dqy * qx + dqz * qw;
        const nw = dqw * qw - dqx * qx - dqy * qy - dqz * qz;

        const norm = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw) || 1;
        nextRotation = { x: nx / norm, y: ny / norm, z: nz / norm, w: nw / norm };
      }
    }

    if (latest.isKinematic) {
      // Kinematic bodies: simple linear extrapolation (no physics forces)
      return {
        ...latest,
        timestamp: currentTime,
        rotation: nextRotation,
        position: {
          x: latest.position.x + latest.velocity.x * clampedDt,
          y: latest.position.y + latest.velocity.y * clampedDt,
          z: latest.position.z + latest.velocity.z * clampedDt,
        },
      };
    }

    // Semi-implicit Euler with damping
    const dampFactor = Math.max(0, 1 - latest.linearDamping * clampedDt);
    const invMass = latest.mass > 0 ? 1 / latest.mass : 0;

    // Compute acceleration: a = F/m + g
    const ax =
      latest.appliedForce.x * invMass +
      (latest.useGravity && this.config.applyGravity ? this.config.gravity.x : 0);
    const ay =
      latest.appliedForce.y * invMass +
      (latest.useGravity && this.config.applyGravity ? this.config.gravity.y : 0);
    const az =
      latest.appliedForce.z * invMass +
      (latest.useGravity && this.config.applyGravity ? this.config.gravity.z : 0);

    // Velocity update: v' = v * dampFactor + a * dt
    const vx = latest.velocity.x * dampFactor + ax * clampedDt;
    const vy = latest.velocity.y * dampFactor + ay * clampedDt;
    const vz = latest.velocity.z * dampFactor + az * clampedDt;

    // Position update: p' = p + v' * dt
    const px = latest.position.x + vx * clampedDt;
    const py = latest.position.y + vy * clampedDt;
    const pz = latest.position.z + vz * clampedDt;

    return {
      ...latest,
      timestamp: currentTime,
      position: { x: px, y: py, z: pz },
      velocity: { x: vx, y: vy, z: vz },
      rotation: nextRotation,
    };
  }

  /**
   * Compute the correction needed when a new authoritative state arrives.
   * Returns the error magnitude and recommended correction strategy.
   */
  computeCorrection(predicted: PhysicsSnapshot, authoritative: PhysicsSnapshot): CorrectionResult {
    const error = distanceVector3(predicted.position, authoritative.position);
    const { thresholds } = this.config;

    if (error < thresholds.invisible) {
      return { error, strategy: 'none', offset: { x: 0, y: 0, z: 0 } };
    }

    const offset: IVector3 = {
      x: authoritative.position.x - predicted.position.x,
      y: authoritative.position.y - predicted.position.y,
      z: authoritative.position.z - predicted.position.z,
    };

    if (error < thresholds.smooth) {
      return { error, strategy: 'exponential', offset };
    }

    // Clamp huge rubber-banding offsets (>5m) to prevent catastrophic flinging
    const HARD_SNAP_THRESHOLD = 5.0;
    if (error > HARD_SNAP_THRESHOLD) {
      // We will perform a true snap, completely clearing offset error history
      return { error, strategy: 'snap', offset: { x: 0, y: 0, z: 0 } };
    }

    return { error, strategy: 'snap', offset };
  }

  /**
   * Begin a correction blend from current error offset.
   */
  startCorrection(offset: IVector3, currentTime: number, duration: number): void {
    this.correctionOffset = { ...offset };
    this.correctionStartTime = currentTime;
    this.correctionDuration = duration;
  }

  /**
   * Get the current correction offset (decays over time during blend).
   */
  getCorrectionOffset(currentTime: number): IVector3 {
    if (this.correctionDuration <= 0) return { x: 0, y: 0, z: 0 };

    const elapsed = currentTime - this.correctionStartTime;
    if (elapsed >= this.correctionDuration) {
      this.correctionDuration = 0;
      return { x: 0, y: 0, z: 0 };
    }

    // Exponential decay
    const t = elapsed / this.correctionDuration;
    const blend = 1 - t * t; // Quadratic ease-out

    return {
      x: this.correctionOffset.x * blend,
      y: this.correctionOffset.y * blend,
      z: this.correctionOffset.z * blend,
    };
  }

  /**
   * Full prediction + correction pipeline: predict forward, apply correction blend.
   */
  getInterpolatedPosition(currentTime: number): IVector3 | null {
    const predicted = this.predict(currentTime);
    if (!predicted) return null;

    const correction = this.getCorrectionOffset(currentTime);

    return {
      x: predicted.position.x + correction.x,
      y: predicted.position.y + correction.y,
      z: predicted.position.z + correction.z,
    };
  }

  /** Clear all stored snapshots and corrections. */
  reset(): void {
    this.snapshots = [];
    this.correctionOffset = { x: 0, y: 0, z: 0 };
    this.correctionDuration = 0;
  }

  /** Get snapshot count. */
  get snapshotCount(): number {
    return this.snapshots.length;
  }
}

export interface CorrectionResult {
  error: number;
  strategy: 'none' | 'exponential' | 'snap';
  offset: IVector3;
}

// =============================================================================
// Physics State Extractor
// =============================================================================

/**
 * Extracts a compact PhysicsSnapshot from a full physics + transform state.
 * This is the "outbound" side — called by the physics owner before sending.
 */
export function extractPhysicsSnapshot(
  entityId: string,
  sequence: number,
  timestamp: number,
  transform: { position: IVector3; rotation: IQuaternion },
  physics: {
    velocity: IVector3;
    angularVelocity: IVector3;
    appliedForce?: IVector3;
    mass: number;
    linearDamping?: number;
    useGravity?: boolean;
    isKinematic?: boolean;
  }
): PhysicsSnapshot {
  return {
    entityId,
    sequence,
    timestamp,
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    velocity: { ...physics.velocity },
    angularVelocity: { ...physics.angularVelocity },
    appliedForce: physics.appliedForce ?? { x: 0, y: 0, z: 0 },
    mass: physics.mass,
    linearDamping: physics.linearDamping ?? 0,
    useGravity: physics.useGravity ?? true,
    isKinematic: physics.isKinematic ?? false,
  };
}

// =============================================================================
// Authority Resolver
// =============================================================================

/**
 * Resolves which peer has authority over a physics entity.
 * Used for ownership handoff during interactions (grab, throw, collision).
 */
export class PhysicsAuthorityResolver {
  private ownership = new Map<string, string>(); // entityId -> peerId
  private requestQueue: AuthorityRequest[] = [];

  /** Set initial ownership. */
  setOwner(entityId: string, peerId: string): void {
    this.ownership.set(entityId, peerId);
  }

  /** Get current owner of an entity. */
  getOwner(entityId: string): string | undefined {
    return this.ownership.get(entityId);
  }

  /** Check if a peer owns an entity. */
  isOwner(entityId: string, peerId: string): boolean {
    return this.ownership.get(entityId) === peerId;
  }

  /**
   * Request authority transfer. Returns true if granted immediately
   * (owner-mode grants to requester, server-mode queues for server decision).
   */
  requestAuthority(entityId: string, requesterId: string, mode: AuthorityMode): boolean {
    if (mode === 'owner') {
      // Owner mode: unknown peer can claim unowned or transfer from current owner
      this.ownership.set(entityId, requesterId);
      return true;
    }

    if (mode === 'nearest') {
      // Nearest mode: grant to requester (caller already determined proximity)
      this.ownership.set(entityId, requesterId);
      return true;
    }

    // Server mode: queue the request
    this.requestQueue.push({
      entityId,
      requesterId,
      timestamp: Date.now(),
    });
    return false;
  }

  /** Process queued authority requests (server-side). */
  processQueue(decider: (request: AuthorityRequest) => boolean): AuthorityRequest[] {
    const granted: AuthorityRequest[] = [];
    const remaining: AuthorityRequest[] = [];

    for (const request of this.requestQueue) {
      if (decider(request)) {
        this.ownership.set(request.entityId, request.requesterId);
        granted.push(request);
      } else {
        remaining.push(request);
      }
    }

    this.requestQueue = remaining;
    return granted;
  }

  /** Release ownership. */
  releaseAuthority(entityId: string, peerId: string): boolean {
    if (this.ownership.get(entityId) === peerId) {
      this.ownership.delete(entityId);
      return true;
    }
    return false;
  }

  /** Get the number of entities owned by a peer. */
  getOwnedCount(peerId: string): number {
    let count = 0;
    for (const owner of this.ownership.values()) {
      if (owner === peerId) count++;
    }
    return count;
  }

  /** Clear all ownership data. */
  reset(): void {
    this.ownership.clear();
    this.requestQueue = [];
  }
}

export interface AuthorityRequest {
  entityId: string;
  requesterId: string;
  timestamp: number;
}

// =============================================================================
// Bandwidth Estimator
// =============================================================================

/**
 * Estimates bandwidth usage for physics sync.
 * At 20Hz with 90 bytes/snapshot: ~1.8 KB/s per entity.
 */
export function estimatePhysicsBandwidth(
  entityCount: number,
  syncRate: number = 20
): BandwidthEstimate {
  const bytesPerSecond = entityCount * SNAPSHOT_BYTE_SIZE * syncRate;
  return {
    entityCount,
    syncRate,
    bytesPerSnapshot: SNAPSHOT_BYTE_SIZE,
    bytesPerSecond,
    kbPerSecond: bytesPerSecond / 1024,
    mbPerMinute: (bytesPerSecond * 60) / (1024 * 1024),
  };
}

export interface BandwidthEstimate {
  entityCount: number;
  syncRate: number;
  bytesPerSnapshot: number;
  bytesPerSecond: number;
  kbPerSecond: number;
  mbPerMinute: number;
}
