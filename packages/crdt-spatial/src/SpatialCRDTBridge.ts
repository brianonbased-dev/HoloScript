/**
 * SpatialCRDTBridge - Strategy C Hybrid Rotation CRDT
 *
 * Implements the Strategy C hybrid approach from the Loro CRDT evaluation:
 * - Base quaternion: LWW via LoroMap (explicit placement / checkpoint)
 * - Delta yaw/pitch/roll: LoroCounter (commutative additive rotation)
 * - Periodic checkpoint: collapses deltas into base quaternion every 30s
 *
 * This avoids the "Frankenstein quaternion" problem where partial component
 * merges produce invalid rotations. Instead, deltas are additive Euler angles
 * accumulated via commutative LoroCounters, and periodically collapsed into
 * the base quaternion.
 *
 * @module @holoscript/crdt-spatial
 */

import { LoroDoc, LoroMap, LoroCounter, type VersionVector } from 'loro-crdt';

import type {
  Vec3,
  Quaternion,
  EulerDelta,
  SpatialTransform,
  HybridRotationState,
  HybridSpatialState,
  SpatialCRDTBridgeConfig,
} from './types.js';

import { DEFAULT_BRIDGE_CONFIG, IDENTITY_QUATERNION, ZERO_VEC3, ONE_VEC3 } from './types.js';
import { coerceCounterValue, coerceFiniteNumber } from './loroCoercion.js';

// =============================================================================
// QUATERNION MATH
// =============================================================================

/** Multiply two quaternions: a * b */
export function quaternionMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Normalize quaternion to unit length */
export function normalizeQuaternion(q: Quaternion): Quaternion {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 1e-10) return { ...IDENTITY_QUATERNION };
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

/** Convert Euler angles (yaw, pitch, roll in radians) to quaternion */
export function eulerToQuaternion(yaw: number, pitch: number, roll: number): Quaternion {
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);

  return normalizeQuaternion({
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
  });
}

/**
 * Compute the effective quaternion from Strategy C hybrid state:
 * effective = baseQuaternion * eulerToQuat(deltaYaw, deltaPitch, deltaRoll)
 */
export function computeEffectiveRotation(state: HybridRotationState): Quaternion {
  const deltaQuat = eulerToQuaternion(state.deltaYaw, state.deltaPitch, state.deltaRoll);
  return normalizeQuaternion(quaternionMultiply(state.baseQuaternion, deltaQuat));
}

// =============================================================================
// SPATIAL CRDT BRIDGE
// =============================================================================

/**
 * SpatialCRDTBridge manages spatial transform synchronization using Loro CRDTs.
 *
 * Each scene node's state is stored in a LoroMap with the following structure:
 * ```
 * nodes/{nodeId}/pos_x, pos_y, pos_z       -> LoroMap values (LWW)
 * nodes/{nodeId}/base_qx, qy, qz, qw       -> LoroMap values (LWW)
 * nodes/{nodeId}/scale_x, scale_y, scale_z  -> LoroMap values (LWW)
 * nodes/{nodeId}/delta_yaw                  -> LoroCounter (commutative)
 * nodes/{nodeId}/delta_pitch                -> LoroCounter (commutative)
 * nodes/{nodeId}/delta_roll                 -> LoroCounter (commutative)
 * nodes/{nodeId}/checkpoint_ms              -> LoroMap value (LWW)
 * ```
 *
 * @example
 * ```typescript
 * const bridge = new SpatialCRDTBridge({ peerId: 'user-1' });
 *
 * // Register a node
 * bridge.registerNode('cube-1');
 *
 * // Set position (LWW)
 * bridge.setPosition('cube-1', { x: 1, y: 2, z: 3 });
 *
 * // Apply rotation delta (commutative via LoroCounter)
 * bridge.applyRotationDelta('cube-1', { yaw: 0.1, pitch: 0, roll: 0 });
 *
 * // Get effective transform (base * deltas)
 * const transform = bridge.getTransform('cube-1');
 *
 * // Export state for sync
 * const bytes = bridge.exportSnapshot();
 * remoteBridge.importUpdate(bytes);
 * ```
 */
export class SpatialCRDTBridge {
  private config: SpatialCRDTBridgeConfig;
  private doc: LoroDoc;
  private registeredNodes: Set<string> = new Set();
  private checkpointTimer: ReturnType<typeof setInterval> | null = null;

  // Event handlers
  private onTransformChange: ((nodeId: string, transform: SpatialTransform) => void) | null = null;
  private onCheckpoint: ((nodeId: string) => void) | null = null;

  constructor(config: Partial<SpatialCRDTBridgeConfig> = {}) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
    this.doc = new LoroDoc();
    this.doc.setPeerId(BigInt(this.hashPeerId(this.config.peerId)));
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /** Start the periodic checkpoint timer */
  start(): void {
    if (this.checkpointTimer) return;

    this.checkpointTimer = setInterval(() => {
      this.runCheckpointPass();
    }, this.config.checkpointIntervalMs);
  }

  /** Stop the checkpoint timer */
  stop(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }
  }

  /** Destroy the bridge and release all resources */
  dispose(): void {
    this.stop();
    this.registeredNodes.clear();
  }

  // ===========================================================================
  // NODE REGISTRATION
  // ===========================================================================

  /**
   * Register a scene node for spatial sync.
   * Initializes the Loro state with identity transform.
   */
  registerNode(nodeId: string, initialTransform?: SpatialTransform): void {
    if (this.registeredNodes.has(nodeId)) return;

    const pos = initialTransform?.position ?? { ...ZERO_VEC3 };
    const rot = initialTransform?.rotation ?? { ...IDENTITY_QUATERNION };
    const scl = initialTransform?.scale ?? { ...ONE_VEC3 };

    // Initialize LoroMap entries for this node
    const nodesMap = this.doc.getMap('nodes');
    const nodeMap = nodesMap.setContainer(nodeId, new LoroMap());

    // Position (LWW)
    nodeMap.set('pos_x', pos.x);
    nodeMap.set('pos_y', pos.y);
    nodeMap.set('pos_z', pos.z);

    // Base quaternion (LWW)
    nodeMap.set('base_qx', rot.x);
    nodeMap.set('base_qy', rot.y);
    nodeMap.set('base_qz', rot.z);
    nodeMap.set('base_qw', rot.w);

    // Scale (LWW)
    nodeMap.set('scale_x', scl.x);
    nodeMap.set('scale_y', scl.y);
    nodeMap.set('scale_z', scl.z);

    // Checkpoint timestamp
    nodeMap.set('checkpoint_ms', Date.now());

    // Delta rotation counters (commutative via LoroCounter)
    nodeMap.setContainer('delta_yaw', new LoroCounter());
    nodeMap.setContainer('delta_pitch', new LoroCounter());
    nodeMap.setContainer('delta_roll', new LoroCounter());

    this.registeredNodes.add(nodeId);
  }

  /**
   * Unregister a node from spatial sync.
   */
  unregisterNode(nodeId: string): void {
    this.registeredNodes.delete(nodeId);
    // Note: We don't delete from the Loro doc to preserve CRDT tombstone semantics
  }

  /**
   * Check if a node is registered.
   */
  hasNode(nodeId: string): boolean {
    return this.registeredNodes.has(nodeId);
  }

  /**
   * Get all registered node IDs.
   */
  getRegisteredNodes(): string[] {
    return Array.from(this.registeredNodes);
  }

  // ===========================================================================
  // POSITION (LWW via LoroMap)
  // ===========================================================================

  /**
   * Set the position of a node. Uses Last-Write-Wins semantics.
   */
  setPosition(nodeId: string, position: Vec3 | [number, number, number] | number[]): void {
    if (!this.registeredNodes.has(nodeId)) return;

    const nodeMap = this.getNodeMap(nodeId);
    if (!nodeMap) return;

    let x = 0, y = 0, z = 0;
    if (Array.isArray(position)) {
      x = position[0] ?? 0;
      y = position[1] ?? 0;
      z = position[2] ?? 0;
    } else if (position && typeof position === 'object') {
      x = (position as any).x ?? 0;
      y = (position as any).y ?? 0;
      z = (position as any).z ?? 0;
    }

    nodeMap.set('pos_x', x);
    nodeMap.set('pos_y', y);
    nodeMap.set('pos_z', z);

    this.config.caelRecorder?.logInteraction('crdt.sync_event', {
      action: 'setPosition',
      nodeId,
      position: { x, y, z },
    });

    this.emitTransformChange(nodeId);
  }

  /**
   * Get the position of a node.
   */
  getPosition(nodeId: string): Vec3 | null {
    const nodeMap = this.getNodeMap(nodeId);
    if (!nodeMap) return null;

    return {
      x: coerceFiniteNumber(nodeMap.get('pos_x'), 0),
      y: coerceFiniteNumber(nodeMap.get('pos_y'), 0),
      z: coerceFiniteNumber(nodeMap.get('pos_z'), 0),
    };
  }

  // ===========================================================================
  // SCALE (LWW via LoroMap)
  // ===========================================================================

  /**
   * Set the scale of a node. Uses Last-Write-Wins semantics.
   */
  setScale(nodeId: string, scale: Vec3 | [number, number, number] | number[]): void {
    if (!this.registeredNodes.has(nodeId)) return;

    const nodeMap = this.getNodeMap(nodeId);
    if (!nodeMap) return;

    let x = 1, y = 1, z = 1;
    if (Array.isArray(scale)) {
      x = scale[0] ?? 1;
      y = scale[1] ?? 1;
      z = scale[2] ?? 1;
    } else if (scale && typeof scale === 'object') {
      x = (scale as any).x ?? 1;
      y = (scale as any).y ?? 1;
      z = (scale as any).z ?? 1;
    }

    nodeMap.set('scale_x', x);
    nodeMap.set('scale_y', y);
    nodeMap.set('scale_z', z);

    this.config.caelRecorder?.logInteraction('crdt.sync_event', {
      action: 'setScale',
      nodeId,
      scale: { x, y, z },
    });

    this.emitTransformChange(nodeId);
  }

  /**
   * Get the scale of a node.
   */
  getScale(nodeId: string): Vec3 | null {
    const nodeMap = this.getNodeMap(nodeId);
    if (!nodeMap) return null;

    return {
      x: coerceFiniteNumber(nodeMap.get('scale_x'), 1),
      y: coerceFiniteNumber(nodeMap.get('scale_y'), 1),
      z: coerceFiniteNumber(nodeMap.get('scale_z'), 1),
    };
  }

  // ===========================================================================
  // ROTATION - Strategy C Hybrid
  // ===========================================================================

  /**
   * Apply a rotation delta. Uses LoroCounter for commutative accumulation.
   *
   * Multiple peers can concurrently apply rotation deltas and they will
   * all accumulate correctly without conflicts, because LoroCounter
   * uses commutative addition.
   */
  applyRotationDelta(nodeId: string, delta: EulerDelta): void {
    if (!this.registeredNodes.has(nodeId)) return;

    const nodeMap = this.getNodeMap(nodeId);
    if (!nodeMap) return;

    // Increment the LoroCounters (commutative)
    // LoroCounter uses fixed-point internally, so we multiply by a scale factor
    const SCALE = 1_000_000; // 6 decimal places of precision
    const yawCounter = nodeMap.get('delta_yaw') as LoroCounter;
    const pitchCounter = nodeMap.get('delta_pitch') as LoroCounter;
    const rollCounter = nodeMap.get('delta_roll') as LoroCounter;

    if (yawCounter && delta.yaw !== 0) {
      yawCounter.increment(Math.round(delta.yaw * SCALE));
    }
    if (pitchCounter && delta.pitch !== 0) {
      pitchCounter.increment(Math.round(delta.pitch * SCALE));
    }
    if (rollCounter && delta.roll !== 0) {
      rollCounter.increment(Math.round(delta.roll * SCALE));
    }

    // Check if we should force a checkpoint (deltas too large)
    this.maybeForceCheckpoint(nodeId);

    this.config.caelRecorder?.logInteraction('crdt.sync_event', {
      action: 'applyRotationDelta',
      nodeId,
      delta,
    });

    this.emitTransformChange(nodeId);
  }

  /**
   * Set the base quaternion directly (explicit placement).
   * This also resets the delta counters.
   */
  setBaseRotation(nodeId: string, quaternion: Quaternion): void {
    if (!this.registeredNodes.has(nodeId)) return;

    const nodeMap = this.getNodeMap(nodeId);
    if (!nodeMap) return;

    const normalized = normalizeQuaternion(quaternion);
    nodeMap.set('base_qx', normalized.x);
    nodeMap.set('base_qy', normalized.y);
    nodeMap.set('base_qz', normalized.z);
    nodeMap.set('base_qw', normalized.w);
    nodeMap.set('checkpoint_ms', Date.now());

    // Reset delta counters by creating new ones
    // (LoroCounter doesn't have a reset method - we decrement by current value)
    this.resetDeltaCounters(nodeId);

    this.config.caelRecorder?.logInteraction('crdt.sync_event', {
      action: 'setBaseRotation',
      nodeId,
      quaternion: normalized,
    });

    this.emitTransformChange(nodeId);
  }

  /**
   * Get the hybrid rotation state (base quaternion + accumulated deltas).
   */
  getHybridRotationState(nodeId: string): HybridRotationState | null {
    const nodeMap = this.getNodeMap(nodeId);
    if (!nodeMap) return null;

    const SCALE = 1_000_000;

    const yawCounter = nodeMap.get('delta_yaw') as LoroCounter | null;
    const pitchCounter = nodeMap.get('delta_pitch') as LoroCounter | null;
    const rollCounter = nodeMap.get('delta_roll') as LoroCounter | null;

    return {
      baseQuaternion: {
        x: coerceFiniteNumber(nodeMap.get('base_qx'), 0),
        y: coerceFiniteNumber(nodeMap.get('base_qy'), 0),
        z: coerceFiniteNumber(nodeMap.get('base_qz'), 0),
        w: coerceFiniteNumber(nodeMap.get('base_qw'), 1),
      },
      deltaYaw: yawCounter ? coerceCounterValue(yawCounter.value) / SCALE : 0,
      deltaPitch: pitchCounter ? coerceCounterValue(pitchCounter.value) / SCALE : 0,
      deltaRoll: rollCounter ? coerceCounterValue(rollCounter.value) / SCALE : 0,
      lastCheckpointMs: coerceFiniteNumber(nodeMap.get('checkpoint_ms'), 0),
    };
  }

  /**
   * Get the effective rotation quaternion (base * deltas).
   */
  getEffectiveRotation(nodeId: string): Quaternion | null {
    const state = this.getHybridRotationState(nodeId);
    if (!state) return null;
    return computeEffectiveRotation(state);
  }

  // ===========================================================================
  // COMPLETE TRANSFORM
  // ===========================================================================

  /**
   * Get the complete spatial transform for a node.
   * Applies Strategy C to compute effective rotation.
   */
  getTransform(nodeId: string): SpatialTransform | null {
    const position = this.getPosition(nodeId);
    const rotation = this.getEffectiveRotation(nodeId);
    const scale = this.getScale(nodeId);

    if (!position || !rotation || !scale) return null;

    return { position, rotation, scale };
  }

  /**
   * Get the full hybrid spatial state (including raw delta values).
   */
  getHybridState(nodeId: string): HybridSpatialState | null {
    const position = this.getPosition(nodeId);
    const rotation = this.getHybridRotationState(nodeId);
    const scale = this.getScale(nodeId);

    if (!position || !rotation || !scale) return null;

    return { position, rotation, scale };
  }

  // ===========================================================================
  // CHECKPOINT (Collapse deltas into base quaternion)
  // ===========================================================================

  /**
   * Perform a checkpoint: collapse accumulated deltas into the base quaternion.
   *
   * This is the "C" in Strategy C. Every 30 seconds (configurable), the
   * accumulated LoroCounter deltas are applied to the base quaternion,
   * and the counters are reset. This prevents unbounded delta accumulation
   * and numeric drift.
   */
  checkpoint(nodeId: string): void {
    if (!this.registeredNodes.has(nodeId)) return;

    const state = this.getHybridRotationState(nodeId);
    if (!state) return;

    // Compute the effective rotation
    const effectiveQuat = computeEffectiveRotation(state);

    // Set as new base quaternion
    const nodeMap = this.getNodeMap(nodeId);
    if (!nodeMap) return;

    nodeMap.set('base_qx', effectiveQuat.x);
    nodeMap.set('base_qy', effectiveQuat.y);
    nodeMap.set('base_qz', effectiveQuat.z);
    nodeMap.set('base_qw', effectiveQuat.w);
    nodeMap.set('checkpoint_ms', Date.now());

    // Reset delta counters
    this.resetDeltaCounters(nodeId);

    this.onCheckpoint?.(nodeId);

    if (this.config.debug) {
      console.log(`[crdt-spatial] Checkpoint ${nodeId}: deltas collapsed into base quaternion`);
    }
  }

  // ===========================================================================
  // LORO STATE SYNC
  // ===========================================================================

  /**
   * Export a full snapshot of the Loro document state.
   */
  exportSnapshot(): Uint8Array {
    return this.doc.export({ mode: 'snapshot' });
  }

  /**
   * Export an incremental update since a given version.
   */
  exportUpdate(fromVersion?: Uint8Array): Uint8Array {
    if (fromVersion) {
      // Loro API expects VersionVector for `from`; Uint8Array is compatible at runtime
      return this.doc.export({ mode: 'update', from: fromVersion as unknown as VersionVector });
    }
    return this.doc.export({ mode: 'snapshot' });
  }

  /**
   * Import a state update from a remote peer.
   */
  importUpdate(bytes: Uint8Array): void {
    this.doc.import(bytes);
    this.config.caelRecorder?.logInteraction('crdt.sync_event', {
      action: 'importUpdate',
      bytesLength: bytes.length,
    });
  }

  /**
   * Get the current version of the Loro document (for incremental export).
   */
  getVersion(): Uint8Array {
    return this.doc.version() as unknown as Uint8Array;
  }

  /**
   * Get the underlying Loro document (for advanced operations).
   */
  getDoc(): LoroDoc {
    return this.doc;
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  /** Subscribe to transform change events */
  onTransformChanged(handler: (nodeId: string, transform: SpatialTransform) => void): void {
    this.onTransformChange = handler;
  }

  /** Subscribe to checkpoint events */
  onCheckpointCompleted(handler: (nodeId: string) => void): void {
    this.onCheckpoint = handler;
  }

  // ===========================================================================
  // STATS
  // ===========================================================================

  /** Get bridge statistics */
  getStats(): {
    nodeCount: number;
    peerId: string;
    checkpointIntervalMs: number;
    registeredNodes: string[];
  } {
    return {
      nodeCount: this.registeredNodes.size,
      peerId: this.config.peerId,
      checkpointIntervalMs: this.config.checkpointIntervalMs,
      registeredNodes: Array.from(this.registeredNodes),
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private getNodeMap(nodeId: string): LoroMap | null {
    try {
      const nodesMap = this.doc.getMap('nodes');
      return nodesMap.get(nodeId) as LoroMap | null;
    } catch {
      return null;
    }
  }

  private resetDeltaCounters(nodeId: string): void {
    const nodeMap = this.getNodeMap(nodeId);
    if (!nodeMap) return;

    const _SCALE = 1_000_000;

    const yawCounter = nodeMap.get('delta_yaw') as LoroCounter | null;
    const pitchCounter = nodeMap.get('delta_pitch') as LoroCounter | null;
    const rollCounter = nodeMap.get('delta_roll') as LoroCounter | null;

    // Decrement by current value to reset to 0
    if (yawCounter) {
      const v = coerceCounterValue(yawCounter.value);
      if (v !== 0) yawCounter.increment(-Math.round(v));
    }
    if (pitchCounter) {
      const v = coerceCounterValue(pitchCounter.value);
      if (v !== 0) pitchCounter.increment(-Math.round(v));
    }
    if (rollCounter) {
      const v = coerceCounterValue(rollCounter.value);
      if (v !== 0) rollCounter.increment(-Math.round(v));
    }
  }

  private maybeForceCheckpoint(nodeId: string): void {
    const state = this.getHybridRotationState(nodeId);
    if (!state) return;

    const totalDelta =
      Math.abs(state.deltaYaw) + Math.abs(state.deltaPitch) + Math.abs(state.deltaRoll);

    if (totalDelta > this.config.maxDeltaBeforeCheckpoint) {
      if (this.config.debug) {
        console.log(
          `[crdt-spatial] Force checkpoint ${nodeId}: total delta ${totalDelta.toFixed(3)} > max ${this.config.maxDeltaBeforeCheckpoint}`
        );
      }
      this.checkpoint(nodeId);
    }
  }

  private runCheckpointPass(): void {
    for (const nodeId of this.registeredNodes) {
      const state = this.getHybridRotationState(nodeId);
      if (!state) continue;

      const elapsed = Date.now() - state.lastCheckpointMs;
      if (elapsed >= this.config.checkpointIntervalMs) {
        // Only checkpoint if there are accumulated deltas
        if (state.deltaYaw !== 0 || state.deltaPitch !== 0 || state.deltaRoll !== 0) {
          this.checkpoint(nodeId);
        }
      }
    }
  }

  private emitTransformChange(nodeId: string): void {
    if (!this.onTransformChange) return;
    const transform = this.getTransform(nodeId);
    if (transform) {
      this.onTransformChange(nodeId, transform);
    }
  }

  private hashPeerId(peerId: string): number {
    let hash = 0;
    for (let i = 0; i < peerId.length; i++) {
      const char = peerId.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash) % Number.MAX_SAFE_INTEGER;
  }
}
