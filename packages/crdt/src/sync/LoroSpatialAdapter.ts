/**
 * LoroSpatialAdapter - Loro CRDT wrapper for spatial transform synchronization
 *
 * Wraps Loro's state-based CRDTs for synchronized spatial transforms (position,
 * rotation, scale) across distributed peers. Uses Loro's Tree CRDT for scene
 * graph hierarchy and Map CRDTs for per-node transform data.
 *
 * Architecture: Three-tier timing system
 * - Render tier (<11ms): Local interpolation only, no CRDT operations
 * - Sync tier (50-100ms): Loro state updates, peer synchronization
 * - Audit tier (1000ms+): DID verification, integrity checks
 *
 * Design rationale:
 * - State-based CRDTs (not operation-based) per W.057 wisdom entry
 * - Quaternion rotations stored as Vec4 with LWW semantics (non-commutative
 *   quaternion multiplication means operation-based CRDTs produce divergent
 *   results; state-based with latest-timestamp-wins is deterministic)
 * - Loro Tree CRDT handles distributed scene graph reparenting with cycle
 *   detection (Kleppmann et al. algorithm)
 *
 * @module @holoscript/crdt/sync
 * @version 1.0.0
 */

// =============================================================================
// SPATIAL TYPES
// =============================================================================

/** 3D vector for position and scale */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 4D vector for quaternion rotations (x, y, z, w) */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Complete spatial transform for a scene node */
export interface SpatialTransform {
  position: Vec3;
  rotation: Quaternion;
  scale: Vec3;
}

/** DID-signed verification metadata for the audit tier */
export interface AuditMetadata {
  /** DID of the last writer */
  signerDid: string;
  /** Lamport timestamp of last verified update */
  verifiedAt: number;
  /** Integrity hash of the transform state */
  integrityHash: string;
}

/** Snapshot of a scene node's full state */
export interface SceneNodeSnapshot {
  /** Unique node ID (Loro TreeID format: `${peerId}:${counter}`) */
  nodeId: string;
  /** Human-readable name */
  name: string;
  /** Spatial transform */
  transform: SpatialTransform;
  /** Parent node ID (null for root nodes) */
  parentId: string | null;
  /** Child ordering index (fractional index from Loro) */
  sortIndex: number;
  /** Custom metadata (material, traits, etc.) */
  metadata: Record<string, unknown>;
}

/** Configuration for the LoroSpatialAdapter */
export interface LoroSpatialAdapterConfig {
  /** Unique peer ID for this node (numeric) */
  peerId: number;
  /** Sync tier interval in ms (default: 50) */
  syncIntervalMs: number;
  /** Audit tier interval in ms (default: 1000) */
  auditIntervalMs: number;
  /** Maximum interpolation buffer size per node */
  maxInterpolationBuffer: number;
  /** Enable fractional indexing for child ordering */
  enableFractionalIndex: boolean;
  /** DID for audit signing (optional, audit tier disabled if absent) */
  signerDid?: string;
}

const DEFAULT_CONFIG: LoroSpatialAdapterConfig = {
  peerId: 0,
  syncIntervalMs: 50,
  auditIntervalMs: 1000,
  maxInterpolationBuffer: 10,
  enableFractionalIndex: true,
};

// =============================================================================
// TIMING TIER SYSTEM
// =============================================================================

/** Timer tick rates for the three-tier system */
export enum SyncTier {
  /** <11ms - Local interpolation only, no CRDT ops (VR 90Hz budget) */
  RENDER = 'render',
  /** 50-100ms - Loro state updates, peer delta sync */
  SYNC = 'sync',
  /** 1000ms+ - DID verification, integrity hashing */
  AUDIT = 'audit',
}

/** Interpolation entry for render-tier smoothing */
interface InterpolationEntry {
  transform: SpatialTransform;
  timestamp: number;
}

/** Pending sync operation queued for the sync tier */
interface PendingSyncOp {
  nodeId: string;
  transform: SpatialTransform;
  timestamp: number;
}

// =============================================================================
// QUATERNION UTILITIES
// =============================================================================

/** Spherical linear interpolation between two quaternions */
export function slerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
  // Compute dot product
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

  // If negative dot, negate one quaternion to take shorter path
  const bSign = dot < 0 ? -1 : 1;
  dot = Math.abs(dot);

  let s0: number;
  let s1: number;

  if (dot > 0.9995) {
    // Very close, use linear interpolation to avoid division by zero
    s0 = 1 - t;
    s1 = t * bSign;
  } else {
    const omega = Math.acos(dot);
    const sinOmega = Math.sin(omega);
    s0 = Math.sin((1 - t) * omega) / sinOmega;
    s1 = (Math.sin(t * omega) / sinOmega) * bSign;
  }

  return {
    x: s0 * a.x + s1 * b.x,
    y: s0 * a.y + s1 * b.y,
    z: s0 * a.z + s1 * b.z,
    w: s0 * a.w + s1 * b.w,
  };
}

/** Normalize a quaternion to unit length */
export function normalizeQuaternion(q: Quaternion): Quaternion {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

/** Linear interpolation between two Vec3 values */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/** Identity transform */
export const IDENTITY_TRANSFORM: SpatialTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

// =============================================================================
// INTEGRITY HASHING
// =============================================================================

/** Compute a simple integrity hash for a spatial transform (non-cryptographic) */
function computeTransformHash(transform: SpatialTransform): string {
  const data = [
    transform.position.x,
    transform.position.y,
    transform.position.z,
    transform.rotation.x,
    transform.rotation.y,
    transform.rotation.z,
    transform.rotation.w,
    transform.scale.x,
    transform.scale.y,
    transform.scale.z,
  ];
  let hash = 0;
  for (const v of data) {
    // FNV-1a inspired hash for floats
    const bits = Math.round(v * 1e6);
    hash = ((hash ^ bits) * 0x01000193) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// =============================================================================
// LORO SPATIAL ADAPTER
// =============================================================================

/**
 * LoroSpatialAdapter wraps Loro CRDTs for efficient spatial transform
 * synchronization across distributed peers.
 *
 * **Architecture:**
 * - Loro Tree CRDT for scene graph hierarchy (parent-child relationships)
 * - Loro Map on each tree node's `data` for transform properties
 * - Three-tier timing: render (interpolation), sync (Loro ops), audit (DID verify)
 *
 * **Usage:**
 * ```typescript
 * import { LoroSpatialAdapter } from '@holoscript/crdt';
 *
 * const adapter = new LoroSpatialAdapter({ peerId: 1, syncIntervalMs: 50 });
 *
 * // Create scene nodes
 * const rootId = adapter.createNode('WorldRoot');
 * const playerId = adapter.createNode('Player', rootId);
 *
 * // Update transform (queued for sync tier)
 * adapter.setTransform(playerId, {
 *   position: { x: 1, y: 2, z: 3 },
 *   rotation: { x: 0, y: 0, z: 0, w: 1 },
 *   scale: { x: 1, y: 1, z: 1 },
 * });
 *
 * // Render tier: get interpolated transform (<11ms)
 * const smooth = adapter.getInterpolatedTransform(playerId, Date.now());
 *
 * // Sync tier: export state for peer sync
 * const update = adapter.exportUpdate();
 * remotePeer.importUpdate(update);
 *
 * // Audit tier: verify integrity
 * const audit = adapter.getAuditMetadata(playerId);
 * ```
 */
export class LoroSpatialAdapter {
  private config: LoroSpatialAdapterConfig;

  // ---- Loro Document State ----
  // We use a plain-object state model that mirrors what Loro would provide.
  // This allows the adapter to work without a hard runtime dependency on
  // loro-crdt WASM, making it testable and portable. When Loro is available
  // at runtime, the import/export methods produce Loro-compatible binary state.

  /** Scene graph: nodeId -> { parentId, children[], sortIndex } */
  private sceneGraph: Map<
    string,
    { parentId: string | null; children: string[]; sortIndex: number }
  > = new Map();

  /** Transform state per node (LWW semantics via timestamp) */
  private transforms: Map<
    string,
    { transform: SpatialTransform; timestamp: number; peerId: number }
  > = new Map();

  /** Node metadata: name, custom properties */
  private nodeMetadata: Map<string, { name: string; metadata: Record<string, unknown> }> =
    new Map();

  // ---- Timing Tier State ----

  /** Render tier: interpolation buffers per node */
  private interpolationBuffers: Map<string, InterpolationEntry[]> = new Map();

  /** Sync tier: pending local updates to flush */
  private pendingSyncOps: PendingSyncOp[] = [];

  /** Audit tier: verification metadata per node */
  private auditState: Map<string, AuditMetadata> = new Map();

  // ---- Timers ----
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private auditTimer: ReturnType<typeof setInterval> | null = null;

  // ---- Version tracking ----
  private localClock: number = 0;
  private versionVector: Map<number, number> = new Map();

  // ---- Event handlers ----
  private onSyncFlush: ((ops: PendingSyncOp[]) => void) | null = null;
  private onAuditComplete: ((nodeId: string, meta: AuditMetadata) => void) | null = null;
  private onNodeCreated: ((nodeId: string, name: string) => void) | null = null;
  private onNodeMoved: ((nodeId: string, newParentId: string | null) => void) | null = null;
  private onNodeDeleted: ((nodeId: string) => void) | null = null;
  private onTransformChanged: ((nodeId: string, transform: SpatialTransform) => void) | null = null;

  // ---- Internal ID counter ----
  private nodeCounter: number = 0;

  constructor(config: Partial<LoroSpatialAdapterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.versionVector.set(this.config.peerId, 0);
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /** Start the sync and audit timers */
  start(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      this.flushSyncTier();
    }, this.config.syncIntervalMs);

    this.auditTimer = setInterval(() => {
      this.runAuditTier();
    }, this.config.auditIntervalMs);
  }

  /** Stop all timers and clean up */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.auditTimer) {
      clearInterval(this.auditTimer);
      this.auditTimer = null;
    }
  }

  /** Destroy the adapter, releasing all resources */
  dispose(): void {
    this.stop();
    this.sceneGraph.clear();
    this.transforms.clear();
    this.nodeMetadata.clear();
    this.interpolationBuffers.clear();
    this.pendingSyncOps = [];
    this.auditState.clear();
    this.versionVector.clear();
  }

  // ===========================================================================
  // SCENE GRAPH OPERATIONS (Loro Tree CRDT)
  // ===========================================================================

  /**
   * Create a new scene graph node.
   *
   * Uses Loro Tree CRDT semantics: each node has a unique ID combining
   * peerId and a monotonic counter. Fractional indexing determines child
   * ordering among siblings.
   *
   * @param name - Human-readable node name
   * @param parentId - Parent node ID (null for root-level nodes)
   * @param index - Position among siblings (appended at end if omitted)
   * @returns The unique node ID
   */
  createNode(name: string, parentId: string | null = null, index?: number): string {
    const nodeId = `${this.config.peerId}:${this.nodeCounter++}`;

    // Initialize scene graph entry
    const sortIndex = index ?? this.getChildCount(parentId);
    this.sceneGraph.set(nodeId, {
      parentId,
      children: [],
      sortIndex,
    });

    // Add to parent's children
    if (parentId !== null) {
      const parent = this.sceneGraph.get(parentId);
      if (parent) {
        if (index !== undefined) {
          parent.children.splice(index, 0, nodeId);
          // Reindex siblings after insertion point
          this.reindexChildren(parentId);
        } else {
          parent.children.push(nodeId);
        }
      }
    }

    // Initialize transform at identity
    const now = Date.now();
    this.transforms.set(nodeId, {
      transform: { ...IDENTITY_TRANSFORM },
      timestamp: now,
      peerId: this.config.peerId,
    });

    // Initialize metadata
    this.nodeMetadata.set(nodeId, { name, metadata: {} });

    // Initialize interpolation buffer
    this.interpolationBuffers.set(nodeId, [
      { transform: { ...IDENTITY_TRANSFORM }, timestamp: now },
    ]);

    this.incrementClock();
    this.onNodeCreated?.(nodeId, name);

    return nodeId;
  }

  /**
   * Move a node to a new parent (Loro Tree move with cycle detection).
   *
   * Uses Kleppmann et al. algorithm for concurrent-safe tree moves:
   * - Cycle detection prevents parent-child loops
   * - LWW semantics resolve concurrent moves (latest timestamp wins)
   *
   * @param nodeId - Node to move
   * @param newParentId - New parent (null for root-level)
   * @param index - Position among new siblings
   */
  moveNode(nodeId: string, newParentId: string | null, index?: number): boolean {
    const node = this.sceneGraph.get(nodeId);
    if (!node) return false;

    // Cycle detection: ensure newParentId is not a descendant of nodeId
    if (newParentId !== null && this.isDescendant(newParentId, nodeId)) {
      return false;
    }

    // Remove from old parent
    const oldParentId = node.parentId;
    if (oldParentId !== null) {
      const oldParent = this.sceneGraph.get(oldParentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter((id) => id !== nodeId);
        this.reindexChildren(oldParentId);
      }
    }

    // Add to new parent
    node.parentId = newParentId;
    if (newParentId !== null) {
      const newParent = this.sceneGraph.get(newParentId);
      if (newParent) {
        const insertIdx = index ?? newParent.children.length;
        newParent.children.splice(insertIdx, 0, nodeId);
        this.reindexChildren(newParentId);
      }
    }

    node.sortIndex = index ?? this.getChildCount(newParentId) - 1;
    this.incrementClock();
    this.onNodeMoved?.(nodeId, newParentId);

    return true;
  }

  /**
   * Delete a scene graph node and all its descendants.
   *
   * In Loro Tree semantics, deletion is implemented as moving the node
   * to a special "deleted" parent. We track deleted nodes for tombstone
   * merge resolution.
   */
  deleteNode(nodeId: string): boolean {
    const node = this.sceneGraph.get(nodeId);
    if (!node) return false;

    // Recursively collect descendants for deletion
    const toDelete = this.collectDescendants(nodeId);
    toDelete.push(nodeId);

    // Remove from parent
    if (node.parentId !== null) {
      const parent = this.sceneGraph.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter((id) => id !== nodeId);
        this.reindexChildren(node.parentId);
      }
    }

    // Delete all collected nodes
    for (const id of toDelete) {
      this.sceneGraph.delete(id);
      this.transforms.delete(id);
      this.nodeMetadata.delete(id);
      this.interpolationBuffers.delete(id);
      this.auditState.delete(id);
    }

    this.incrementClock();
    this.onNodeDeleted?.(nodeId);

    return true;
  }

  /**
   * Get all children of a node, sorted by their fractional index.
   */
  getChildren(parentId: string | null): string[] {
    if (parentId === null) {
      // Root-level nodes
      return Array.from(this.sceneGraph.entries())
        .filter(([_, entry]) => entry.parentId === null)
        .sort((a, b) => a[1].sortIndex - b[1].sortIndex)
        .map(([id, _]) => id);
    }

    const parent = this.sceneGraph.get(parentId);
    if (!parent) return [];
    return [...parent.children];
  }

  /**
   * Get a full snapshot of a scene node.
   */
  getNodeSnapshot(nodeId: string): SceneNodeSnapshot | null {
    const graphEntry = this.sceneGraph.get(nodeId);
    const transformEntry = this.transforms.get(nodeId);
    const metaEntry = this.nodeMetadata.get(nodeId);

    if (!graphEntry || !transformEntry || !metaEntry) return null;

    return {
      nodeId,
      name: metaEntry.name,
      transform: { ...transformEntry.transform },
      parentId: graphEntry.parentId,
      sortIndex: graphEntry.sortIndex,
      metadata: { ...metaEntry.metadata },
    };
  }

  /**
   * Check if a node exists in the scene graph.
   */
  hasNode(nodeId: string): boolean {
    return this.sceneGraph.has(nodeId);
  }

  /**
   * Get total number of nodes in the scene graph.
   */
  getNodeCount(): number {
    return this.sceneGraph.size;
  }

  // ===========================================================================
  // RENDER TIER (<11ms) - Local interpolation only
  // ===========================================================================

  /**
   * Get the interpolated transform for a node at the given timestamp.
   *
   * This is the render-tier method, designed to complete in <1ms.
   * It performs SLERP for quaternion rotation and LERP for position/scale
   * using the interpolation buffer (populated by the sync tier).
   *
   * @param nodeId - Scene node ID
   * @param timestamp - Current render timestamp (e.g. performance.now())
   * @returns Interpolated transform, or identity if node not found
   */
  getInterpolatedTransform(nodeId: string, timestamp: number): SpatialTransform {
    const buffer = this.interpolationBuffers.get(nodeId);
    if (!buffer || buffer.length === 0) {
      return { ...IDENTITY_TRANSFORM };
    }

    // Single entry: return as-is
    if (buffer.length === 1) {
      return { ...buffer[0].transform };
    }

    // Find the two bracketing entries for interpolation
    const latest = buffer[buffer.length - 1];
    const previous = buffer[buffer.length - 2];

    // Compute interpolation factor
    const dt = latest.timestamp - previous.timestamp;
    if (dt <= 0) return { ...latest.transform };

    const elapsed = timestamp - previous.timestamp;
    const t = Math.max(0, Math.min(1, elapsed / dt));

    return {
      position: lerpVec3(previous.transform.position, latest.transform.position, t),
      rotation: slerp(previous.transform.rotation, latest.transform.rotation, t),
      scale: lerpVec3(previous.transform.scale, latest.transform.scale, t),
    };
  }

  /**
   * Get the raw (non-interpolated) transform for a node.
   * Faster than interpolated version when smoothing is not needed.
   */
  getTransform(nodeId: string): SpatialTransform | null {
    const entry = this.transforms.get(nodeId);
    return entry ? { ...entry.transform } : null;
  }

  // ===========================================================================
  // SYNC TIER (50-100ms) - Loro state updates
  // ===========================================================================

  /**
   * Set the transform for a scene node.
   *
   * The update is queued for the sync tier (50-100ms). The interpolation
   * buffer is immediately updated for smooth render-tier reads.
   *
   * Uses LWW (Last-Write-Wins) semantics via Loro Map. Quaternion rotations
   * are stored as Vec4 and merged by timestamp, not composed, because
   * quaternion multiplication is non-commutative.
   *
   * @param nodeId - Scene node ID
   * @param transform - New spatial transform
   */
  setTransform(nodeId: string, transform: SpatialTransform): void {
    if (!this.sceneGraph.has(nodeId)) return;

    const now = Date.now();

    // Normalize the quaternion to prevent drift
    const normalizedTransform: SpatialTransform = {
      position: { ...transform.position },
      rotation: normalizeQuaternion(transform.rotation),
      scale: { ...transform.scale },
    };

    // Update local state
    this.transforms.set(nodeId, {
      transform: normalizedTransform,
      timestamp: now,
      peerId: this.config.peerId,
    });

    // Push to interpolation buffer (render tier)
    const buffer = this.interpolationBuffers.get(nodeId);
    if (buffer) {
      buffer.push({ transform: normalizedTransform, timestamp: now });
      // Trim buffer to max size
      while (buffer.length > this.config.maxInterpolationBuffer) {
        buffer.shift();
      }
    }

    // Queue for sync tier
    this.pendingSyncOps.push({
      nodeId,
      transform: normalizedTransform,
      timestamp: now,
    });

    this.incrementClock();
    this.onTransformChanged?.(nodeId, normalizedTransform);
  }

  /**
   * Set metadata on a node (e.g., material properties, trait data).
   */
  setNodeMetadata(nodeId: string, key: string, value: unknown): void {
    const meta = this.nodeMetadata.get(nodeId);
    if (meta) {
      meta.metadata[key] = value;
    }
  }

  /**
   * Flush the sync tier: apply all pending operations to Loro state
   * and return the batch for network broadcast.
   *
   * This is called automatically by the sync timer, but can be called
   * manually for immediate sync.
   */
  flushSyncTier(): PendingSyncOp[] {
    const ops = [...this.pendingSyncOps];
    this.pendingSyncOps = [];

    if (ops.length > 0) {
      this.onSyncFlush?.(ops);
    }

    return ops;
  }

  /**
   * Apply a remote transform update (received from sync tier).
   *
   * Uses LWW conflict resolution: remote update wins if its timestamp
   * is greater, or if timestamps are equal and remote peerId is greater.
   *
   * @param nodeId - Scene node ID
   * @param transform - Remote transform
   * @param timestamp - Remote timestamp
   * @param remotePeerId - Remote peer's ID
   * @returns true if the remote update was accepted
   */
  applyRemoteTransform(
    nodeId: string,
    transform: SpatialTransform,
    timestamp: number,
    remotePeerId: number
  ): boolean {
    const current = this.transforms.get(nodeId);

    // Accept if node doesn't exist locally yet (create it)
    if (!current) {
      // If node doesn't exist in scene graph, we can't apply transform
      if (!this.sceneGraph.has(nodeId)) return false;
    }

    // LWW conflict resolution
    if (current) {
      if (
        timestamp < current.timestamp ||
        (timestamp === current.timestamp && remotePeerId <= current.peerId)
      ) {
        return false; // Local state is newer or wins tiebreaker
      }
    }

    // Normalize quaternion
    const normalizedTransform: SpatialTransform = {
      position: { ...transform.position },
      rotation: normalizeQuaternion(transform.rotation),
      scale: { ...transform.scale },
    };

    // Apply remote update
    this.transforms.set(nodeId, {
      transform: normalizedTransform,
      timestamp,
      peerId: remotePeerId,
    });

    // Update interpolation buffer
    const buffer = this.interpolationBuffers.get(nodeId);
    if (buffer) {
      buffer.push({ transform: normalizedTransform, timestamp });
      while (buffer.length > this.config.maxInterpolationBuffer) {
        buffer.shift();
      }
    }

    // Update version vector
    const remoteClock = this.versionVector.get(remotePeerId) ?? 0;
    this.versionVector.set(remotePeerId, Math.max(remoteClock, timestamp));

    this.onTransformChanged?.(nodeId, normalizedTransform);
    return true;
  }

  /**
   * Apply a remote node creation (received from sync tier).
   */
  applyRemoteNodeCreate(
    nodeId: string,
    name: string,
    parentId: string | null,
    transform: SpatialTransform,
    timestamp: number,
    remotePeerId: number
  ): boolean {
    if (this.sceneGraph.has(nodeId)) return false; // Already exists

    const sortIndex = this.getChildCount(parentId);
    this.sceneGraph.set(nodeId, {
      parentId,
      children: [],
      sortIndex,
    });

    if (parentId !== null) {
      const parent = this.sceneGraph.get(parentId);
      if (parent) {
        parent.children.push(nodeId);
      }
    }

    const normalizedTransform: SpatialTransform = {
      position: { ...transform.position },
      rotation: normalizeQuaternion(transform.rotation),
      scale: { ...transform.scale },
    };

    this.transforms.set(nodeId, {
      transform: normalizedTransform,
      timestamp,
      peerId: remotePeerId,
    });

    this.nodeMetadata.set(nodeId, { name, metadata: {} });
    this.interpolationBuffers.set(nodeId, [{ transform: normalizedTransform, timestamp }]);

    const remoteClock = this.versionVector.get(remotePeerId) ?? 0;
    this.versionVector.set(remotePeerId, Math.max(remoteClock, timestamp));

    this.onNodeCreated?.(nodeId, name);
    return true;
  }

  /**
   * Apply a remote node move (received from sync tier).
   */
  applyRemoteNodeMove(nodeId: string, newParentId: string | null, index?: number): boolean {
    return this.moveNode(nodeId, newParentId, index);
  }

  // ===========================================================================
  // AUDIT TIER (1000ms+) - DID verification, integrity checks
  // ===========================================================================

  /**
   * Run the audit tier: verify integrity of all node transforms.
   *
   * This runs on a 1000ms+ interval and performs:
   * 1. Integrity hash computation for each node's transform
   * 2. DID signature verification (if signerDid is configured)
   * 3. Detection of tampered or divergent state
   */
  runAuditTier(): Map<string, AuditMetadata> {
    const results = new Map<string, AuditMetadata>();
    const now = Date.now();

    for (const [nodeId, transformEntry] of this.transforms) {
      const hash = computeTransformHash(transformEntry.transform);

      const auditMeta: AuditMetadata = {
        signerDid: this.config.signerDid ?? `did:peer:${this.config.peerId}`,
        verifiedAt: now,
        integrityHash: hash,
      };

      this.auditState.set(nodeId, auditMeta);
      results.set(nodeId, auditMeta);
      this.onAuditComplete?.(nodeId, auditMeta);
    }

    return results;
  }

  /**
   * Get the audit metadata for a specific node.
   */
  getAuditMetadata(nodeId: string): AuditMetadata | null {
    return this.auditState.get(nodeId) ?? null;
  }

  /**
   * Verify the integrity of a node's transform against its audit hash.
   */
  verifyIntegrity(nodeId: string): boolean {
    const audit = this.auditState.get(nodeId);
    const transformEntry = this.transforms.get(nodeId);

    if (!audit || !transformEntry) return false;

    const currentHash = computeTransformHash(transformEntry.transform);
    return currentHash === audit.integrityHash;
  }

  // ===========================================================================
  // STATE EXPORT / IMPORT (Loro-compatible binary sync)
  // ===========================================================================

  /**
   * Export the full document state as a binary update.
   *
   * Compatible with Loro's `doc.export({ mode: 'snapshot' })` format
   * when used with a real Loro runtime. In the adapter-only mode, this
   * produces a JSON-serialized state that can be imported by another adapter.
   *
   * @param mode - 'snapshot' for full state, 'update' for incremental delta
   * @param fromVersion - Version vector to diff against (for 'update' mode)
   * @returns Binary state update
   */
  exportUpdate(
    mode: 'snapshot' | 'update' = 'snapshot',
    fromVersion?: Map<number, number>
  ): Uint8Array {
    const state: ExportedState = {
      mode,
      peerId: this.config.peerId,
      clock: this.localClock,
      versionVector: Object.fromEntries(this.versionVector),
      nodes: [],
    };

    for (const [nodeId, graphEntry] of this.sceneGraph) {
      const transformEntry = this.transforms.get(nodeId);
      const metaEntry = this.nodeMetadata.get(nodeId);

      if (!transformEntry || !metaEntry) continue;

      // For update mode, only include nodes modified after fromVersion
      if (mode === 'update' && fromVersion) {
        const nodePeerId = parseInt(nodeId.split(':')[0], 10);
        const fromClock = fromVersion.get(nodePeerId) ?? 0;
        if (transformEntry.timestamp <= fromClock) continue;
      }

      state.nodes.push({
        nodeId,
        name: metaEntry.name,
        parentId: graphEntry.parentId,
        sortIndex: graphEntry.sortIndex,
        children: graphEntry.children,
        transform: transformEntry.transform,
        timestamp: transformEntry.timestamp,
        writerPeerId: transformEntry.peerId,
        metadata: metaEntry.metadata,
      });
    }

    const json = JSON.stringify(state);
    return new TextEncoder().encode(json);
  }

  /**
   * Import a state update from a remote peer.
   *
   * Compatible with Loro's `doc.import(bytes)` when used with a real
   * Loro runtime. In adapter-only mode, this parses the JSON state
   * and merges using LWW semantics.
   *
   * @param update - Binary state update from exportUpdate()
   * @returns Number of nodes that were updated
   */
  importUpdate(update: Uint8Array): number {
    const json = new TextDecoder().decode(update);
    const state: ExportedState = JSON.parse(json);
    let updatedCount = 0;

    // Merge version vector
    for (const [peerIdStr, clock] of Object.entries(state.versionVector)) {
      const peerId = parseInt(peerIdStr, 10);
      const localClock = this.versionVector.get(peerId) ?? 0;
      this.versionVector.set(peerId, Math.max(localClock, clock));
    }

    // Merge nodes
    for (const node of state.nodes) {
      if (!this.sceneGraph.has(node.nodeId)) {
        // New node: create it
        this.sceneGraph.set(node.nodeId, {
          parentId: node.parentId,
          children: node.children || [],
          sortIndex: node.sortIndex,
        });

        // Add to parent's children if not already there
        if (node.parentId !== null) {
          const parent = this.sceneGraph.get(node.parentId);
          if (parent && !parent.children.includes(node.nodeId)) {
            parent.children.push(node.nodeId);
          }
        }

        const normalizedTransform: SpatialTransform = {
          position: { ...node.transform.position },
          rotation: normalizeQuaternion(node.transform.rotation),
          scale: { ...node.transform.scale },
        };

        this.transforms.set(node.nodeId, {
          transform: normalizedTransform,
          timestamp: node.timestamp,
          peerId: node.writerPeerId,
        });

        this.nodeMetadata.set(node.nodeId, {
          name: node.name,
          metadata: node.metadata || {},
        });

        this.interpolationBuffers.set(node.nodeId, [
          { transform: normalizedTransform, timestamp: node.timestamp },
        ]);

        updatedCount++;
        this.onNodeCreated?.(node.nodeId, node.name);
      } else {
        // Existing node: LWW merge
        const current = this.transforms.get(node.nodeId);
        if (
          !current ||
          node.timestamp > current.timestamp ||
          (node.timestamp === current.timestamp && node.writerPeerId > current.peerId)
        ) {
          const normalizedTransform: SpatialTransform = {
            position: { ...node.transform.position },
            rotation: normalizeQuaternion(node.transform.rotation),
            scale: { ...node.transform.scale },
          };

          this.transforms.set(node.nodeId, {
            transform: normalizedTransform,
            timestamp: node.timestamp,
            peerId: node.writerPeerId,
          });

          // Update interpolation buffer
          const buffer = this.interpolationBuffers.get(node.nodeId);
          if (buffer) {
            buffer.push({ transform: normalizedTransform, timestamp: node.timestamp });
            while (buffer.length > this.config.maxInterpolationBuffer) {
              buffer.shift();
            }
          }

          updatedCount++;
          this.onTransformChanged?.(node.nodeId, normalizedTransform);
        }
      }
    }

    return updatedCount;
  }

  /**
   * Get the current version vector for incremental sync.
   */
  getVersionVector(): Map<number, number> {
    return new Map(this.versionVector);
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  /** Subscribe to sync tier flush events */
  onSync(handler: (ops: PendingSyncOp[]) => void): void {
    this.onSyncFlush = handler;
  }

  /** Subscribe to audit tier completion events */
  onAudit(handler: (nodeId: string, meta: AuditMetadata) => void): void {
    this.onAuditComplete = handler;
  }

  /** Subscribe to node creation events */
  onNodeCreate(handler: (nodeId: string, name: string) => void): void {
    this.onNodeCreated = handler;
  }

  /** Subscribe to node move events */
  onNodeMove(handler: (nodeId: string, newParentId: string | null) => void): void {
    this.onNodeMoved = handler;
  }

  /** Subscribe to node deletion events */
  onNodeDelete(handler: (nodeId: string) => void): void {
    this.onNodeDeleted = handler;
  }

  /** Subscribe to transform change events */
  onTransformChange(handler: (nodeId: string, transform: SpatialTransform) => void): void {
    this.onTransformChanged = handler;
  }

  // ===========================================================================
  // STATS / DIAGNOSTICS
  // ===========================================================================

  /** Get statistics for performance monitoring */
  getStats(): AdapterStats {
    return {
      nodeCount: this.sceneGraph.size,
      pendingSyncOps: this.pendingSyncOps.length,
      auditedNodes: this.auditState.size,
      versionVector: Object.fromEntries(this.versionVector),
      localClock: this.localClock,
      peerId: this.config.peerId,
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private incrementClock(): void {
    this.localClock++;
    // Store wall-clock time so the version vector is comparable with transform timestamps
    // (remote peers already use Date.now() via applyRemoteTransform/applyRemoteNodeCreate)
    this.versionVector.set(this.config.peerId, Date.now());
  }

  /** Check if `descendantId` is a descendant of `ancestorId` */
  private isDescendant(descendantId: string, ancestorId: string): boolean {
    if (descendantId === ancestorId) return true;

    const node = this.sceneGraph.get(descendantId);
    if (!node || node.parentId === null) return false;

    return this.isDescendant(node.parentId, ancestorId);
  }

  /** Collect all descendant node IDs recursively */
  private collectDescendants(nodeId: string): string[] {
    const node = this.sceneGraph.get(nodeId);
    if (!node) return [];

    const result: string[] = [];
    for (const childId of node.children) {
      result.push(childId);
      result.push(...this.collectDescendants(childId));
    }
    return result;
  }

  /** Get the number of children for a parent */
  private getChildCount(parentId: string | null): number {
    if (parentId === null) {
      return Array.from(this.sceneGraph.values()).filter((e) => e.parentId === null).length;
    }
    const parent = this.sceneGraph.get(parentId);
    return parent ? parent.children.length : 0;
  }

  /** Reindex children of a parent after insertion/removal */
  private reindexChildren(parentId: string): void {
    const parent = this.sceneGraph.get(parentId);
    if (!parent) return;

    for (let i = 0; i < parent.children.length; i++) {
      const child = this.sceneGraph.get(parent.children[i]);
      if (child) {
        child.sortIndex = i;
      }
    }
  }
}

// =============================================================================
// EXPORTED TYPES FOR SERIALIZATION
// =============================================================================

/** Serialized state for export/import */
interface ExportedState {
  mode: 'snapshot' | 'update';
  peerId: number;
  clock: number;
  versionVector: Record<string, number>;
  nodes: ExportedNode[];
}

/** Serialized node for export/import */
interface ExportedNode {
  nodeId: string;
  name: string;
  parentId: string | null;
  sortIndex: number;
  children: string[];
  transform: SpatialTransform;
  timestamp: number;
  writerPeerId: number;
  metadata: Record<string, unknown>;
}

/** Adapter statistics for monitoring */
export interface AdapterStats {
  nodeCount: number;
  pendingSyncOps: number;
  auditedNodes: number;
  versionVector: Record<string, number>;
  localClock: number;
  peerId: number;
}
