/**
 * @holoscript/crdt-spatial - Type Definitions
 *
 * Core types for the Loro CRDT spatial transform synchronization package.
 * Implements Strategy C: base quaternion LWW via LoroMap + delta yaw/pitch/roll
 * via LoroCounter + 30s periodic checkpoint.
 */

// =============================================================================
// SPATIAL PRIMITIVES
// =============================================================================

/** 3D vector for position and scale */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Quaternion rotation (x, y, z, w) */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Euler angle deltas in radians (for LoroCounter accumulation) */
export interface EulerDelta {
  yaw: number;
  pitch: number;
  roll: number;
}

/** Complete spatial transform */
export interface SpatialTransform {
  position: Vec3;
  rotation: Quaternion;
  scale: Vec3;
}

// =============================================================================
// STRATEGY C: HYBRID ROTATION STATE
// =============================================================================

/**
 * Strategy C hybrid rotation state.
 *
 * - `baseQuaternion`: The checkpoint quaternion (LWW via LoroMap).
 *   Set explicitly when a user "places" an object or during periodic checkpoint.
 * - `deltaYaw/deltaPitch/deltaRoll`: Accumulated rotation deltas since
 *   last checkpoint (via LoroCounter - commutative addition).
 * - `lastCheckpointMs`: Timestamp of last checkpoint collapse.
 *
 * The effective rotation is: baseQuaternion * eulerToQuat(deltaYaw, deltaPitch, deltaRoll)
 */
export interface HybridRotationState {
  baseQuaternion: Quaternion;
  deltaYaw: number;
  deltaPitch: number;
  deltaRoll: number;
  lastCheckpointMs: number;
}

/** Full hybrid spatial state for a scene node */
export interface HybridSpatialState {
  /** Position (LWW via LoroMap) */
  position: Vec3;
  /** Hybrid rotation (Strategy C) */
  rotation: HybridRotationState;
  /** Scale (LWW via LoroMap) */
  scale: Vec3;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Configuration for the SpatialCRDTBridge */
export interface SpatialCRDTBridgeConfig {
  /** Unique peer ID */
  peerId: string;
  /** Checkpoint interval in milliseconds (default: 30000 = 30s) */
  checkpointIntervalMs: number;
  /** Sync interval in milliseconds (default: 50) */
  syncIntervalMs: number;
  /** Maximum delta accumulation before forced checkpoint (radians, default: 2*PI) */
  maxDeltaBeforeCheckpoint: number;
  /** Enable debug logging */
  debug: boolean;
}

export const DEFAULT_BRIDGE_CONFIG: SpatialCRDTBridgeConfig = {
  peerId: 'peer-0',
  checkpointIntervalMs: 30_000,
  syncIntervalMs: 50,
  maxDeltaBeforeCheckpoint: Math.PI * 2,
  debug: false,
};

// =============================================================================
// WEBSOCKET PROVIDER
// =============================================================================

/** WebSocket connection states */
export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Error = 'error',
}

/** Configuration for LoroWebSocketProvider */
export interface WebSocketProviderConfig {
  /** WebSocket server URL (ws:// or wss://) */
  url: string;
  /** Room/document identifier */
  roomId: string;
  /** Reconnection delay in ms (default: 1000) */
  reconnectDelayMs: number;
  /** Maximum reconnection attempts (default: 10) */
  maxReconnectAttempts: number;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatIntervalMs: number;
  /** Enable binary encoding (default: true) */
  binaryEncoding: boolean;
}

export const DEFAULT_WS_CONFIG: Omit<WebSocketProviderConfig, 'url' | 'roomId'> = {
  reconnectDelayMs: 1000,
  maxReconnectAttempts: 10,
  heartbeatIntervalMs: 30_000,
  binaryEncoding: true,
};

// =============================================================================
// SYNC MESSAGES
// =============================================================================

/** Message types for WebSocket sync protocol */
export enum SyncMessageType {
  /** Full state snapshot (initial sync) */
  Snapshot = 'snapshot',
  /** Incremental update (delta) */
  Update = 'update',
  /** Awareness/presence (ephemeral, not CRDT) */
  Awareness = 'awareness',
  /** Heartbeat ping/pong */
  Heartbeat = 'heartbeat',
  /** Error from server */
  Error = 'error',
}

/** Sync message envelope */
export interface SyncMessage {
  type: SyncMessageType;
  roomId: string;
  peerId: string;
  /** Binary payload (Loro state/update bytes) */
  payload: Uint8Array;
  timestamp: number;
}

/** Awareness state for ephemeral presence */
export interface AwarenessState {
  peerId: string;
  /** User display name */
  name: string;
  /** User color for cursors/avatars */
  color: string;
  /** Current camera/cursor position */
  position?: Vec3;
  /** Current selection */
  selectedNodeIds?: string[];
  /** Last activity timestamp */
  lastActive: number;
}

// =============================================================================
// REACT HOOK TYPES
// =============================================================================

/** Options for the useSpatialSync React hook */
export interface UseSpatialSyncOptions {
  /** WebSocket server URL */
  serverUrl: string;
  /** Room identifier */
  roomId: string;
  /** Local peer ID */
  peerId: string;
  /** Sync interval in ms (default: 50) */
  syncIntervalMs?: number;
  /** Checkpoint interval in ms (default: 30000) */
  checkpointIntervalMs?: number;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
}

/** Return value from the useSpatialSync hook */
export interface UseSpatialSyncReturn {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Connected peer count */
  peerCount: number;
  /** Set the position of a node (LWW) */
  setPosition: (nodeId: string, position: Vec3) => void;
  /** Apply a rotation delta (commutative via LoroCounter) */
  applyRotationDelta: (nodeId: string, delta: EulerDelta) => void;
  /** Set the scale of a node (LWW) */
  setScale: (nodeId: string, scale: Vec3) => void;
  /** Get the current transform for a node (applies Strategy C) */
  getTransform: (nodeId: string) => SpatialTransform | null;
  /** Register a new node */
  registerNode: (nodeId: string, initialTransform?: SpatialTransform) => void;
  /** Unregister a node */
  unregisterNode: (nodeId: string) => void;
  /** Force a checkpoint (collapse deltas into base quaternion) */
  forceCheckpoint: (nodeId: string) => void;
  /** Awareness states of all peers */
  awareness: Map<string, AwarenessState>;
  /** Update local awareness */
  setAwareness: (state: Partial<AwarenessState>) => void;
  /** Connect to server */
  connect: () => void;
  /** Disconnect from server */
  disconnect: () => void;
}

// =============================================================================
// IDENTITY QUATERNION
// =============================================================================

export const IDENTITY_QUATERNION: Quaternion = { x: 0, y: 0, z: 0, w: 1 };
export const ZERO_VEC3: Vec3 = { x: 0, y: 0, z: 0 };
export const ONE_VEC3: Vec3 = { x: 1, y: 1, z: 1 };

export const IDENTITY_TRANSFORM: SpatialTransform = {
  position: { ...ZERO_VEC3 },
  rotation: { ...IDENTITY_QUATERNION },
  scale: { ...ONE_VEC3 },
};
