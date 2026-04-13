/**
 * Network Sync Types
 *
 * Type definitions for networked state synchronization in HoloScript.
 * Provides peer-to-peer and client-server networking primitives.
 *
 * DONE(P.NET.01): Tiered consistency architecture implemented.
 *   SyncTier type + SYNC_TIER_DEFAULTS + SYNC_TIER_DELIVERY + SYNC_TIER_RATES.
 *   resolveSyncConfig() auto-configures mode/frequency/delivery from tier.
 *
 * DONE(W.NET.02): Spatial hash grid interest management implemented.
 *   SpatialHashGrid class with IInterestManager interface.
 *   AOI-based entity filtering with configurable cell size.
 *
 * DONE(P.NET.02): CRDT types for AI agent state sync implemented.
 *   ILWWRegister + IGCounter interfaces. mergeLWW(), mergeGCounter(),
 *   createLWWRegister(), createGCounter(), incrementGCounter() functions.
 *
 * DONE(W.NET.05): AI agent defined as distinct entity class.
 *   EntityType includes 'agent'. ENTITY_BANDWIDTH_PROFILES maps each type
 *   to bytesPerUpdate and updatesPerSecond. estimateAOIBandwidth() helper.
 *
 * @module network
 */

// ============================================================================
// Vector Types (local for network calculations)
// ============================================================================

export interface IVector3 {
  x: number;
  y: number;
  z: number;
}

export interface IQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

// ============================================================================
// Connection Types
// ============================================================================

/**
 * Connection state
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Network topology
 */
export type NetworkTopology = 'client-server' | 'peer-to-peer' | 'mesh';

/**
 * Peer information
 */
export interface IPeerInfo {
  id: string;
  name?: string;
  isHost: boolean;
  isLocal: boolean;
  latency: number;
  lastSeen: number;
  metadata: Record<string, unknown>;
}

/**
 * Connection configuration
 */
export interface IConnectionConfig {
  url?: string;
  roomId?: string;
  peerId?: string;
  topology?: NetworkTopology;
  maxPeers?: number;
  timeout?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Message delivery mode
 */
export type DeliveryMode = 'reliable' | 'unreliable' | 'ordered';

/**
 * Message target
 */
export type MessageTarget = 'all' | 'host' | 'others' | string | string[];

/**
 * Network message
 */
export interface INetworkMessage<T = unknown> {
  id: string;
  type: string;
  payload: T;
  senderId: string;
  targetId: MessageTarget;
  timestamp: number;
  channel?: string;
  delivery?: DeliveryMode;
}

/**
 * Message handler
 */
export type MessageHandler<T = unknown> = (message: INetworkMessage<T>) => void;

// ============================================================================
// State Synchronization
// ============================================================================

/**
 * Sync mode for state
 */
export type SyncMode = 'authoritative' | 'last-write-wins' | 'crdt';

/**
 * Sync tier — maps to a specific consistency model, frequency, and delivery.
 * P.NET.01: Tiered Consistency Architecture.
 */
export type SyncTier = 'physics' | 'movement' | 'ai_agent' | 'cosmetic';

/**
 * Sync frequency
 */
export type SyncFrequency = 'immediate' | 'tick' | 'manual';

/**
 * State change origin
 */
export type StateOrigin = 'local' | 'remote' | 'reconciled';

/**
 * Entity type classification for bandwidth profiling.
 * W.NET.05: AI agents are a distinct entity class.
 */
export type EntityType = 'player' | 'agent' | 'physics_object' | 'cosmetic';

/**
 * Synchronized state entry
 */
export interface ISyncStateEntry<T = unknown> {
  key: string;
  value: T;
  version: number;
  ownerId?: string;
  timestamp: number;
  origin: StateOrigin;
}

/**
 * State snapshot
 */
export interface IStateSnapshot {
  tick: number;
  timestamp: number;
  states: Map<string, ISyncStateEntry>;
}

/**
 * Sync state configuration
 */
export interface ISyncConfig {
  mode?: SyncMode;
  frequency?: SyncFrequency;
  interpolate?: boolean;
  interpolationDelay?: number;
  maxHistorySize?: number;
  ownership?: 'host' | 'creator' | 'anyone';
  /** P.NET.01: Sync tier auto-configures mode, frequency, and delivery */
  syncTier?: SyncTier;
  /** W.NET.05: Entity type for bandwidth profiling */
  entityType?: EntityType;
}

// ============================================================================
// Entity Replication
// ============================================================================

/**
 * Replicated component data
 */
export interface IReplicatedComponent {
  type: string;
  data: Record<string, unknown>;
  syncFields?: string[];
  interpolated?: string[];
}

/**
 * Replicated entity
 */
export interface IReplicatedEntity {
  id: string;
  ownerId: string;
  prefabId?: string;
  position?: IVector3;
  rotation?: IQuaternion;
  scale?: IVector3;
  components: IReplicatedComponent[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Entity spawn request
 */
export interface ISpawnRequest {
  prefabId: string;
  position?: IVector3;
  rotation?: IQuaternion;
  scale?: IVector3;
  ownerId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Entity update delta
 */
export interface IEntityDelta {
  entityId: string;
  tick: number;
  position?: IVector3;
  rotation?: IQuaternion;
  velocity?: IVector3;
  angularVelocity?: IVector3;
  components?: Partial<IReplicatedComponent>[];
}

// ============================================================================
// Remote Procedure Calls
// ============================================================================

/**
 * RPC target
 */
export type RPCTarget = 'server' | 'client' | 'all' | 'owner' | string;

/**
 * RPC configuration
 */
export interface IRPCConfig {
  name: string;
  target?: RPCTarget;
  delivery?: DeliveryMode;
  timeout?: number;
  returnResult?: boolean;
}

/**
 * RPC invocation
 */
export interface IRPCInvocation {
  id: string;
  name: string;
  args: unknown[];
  senderId: string;
  targetId: string;
  timestamp: number;
}

/**
 * RPC result
 */
export interface IRPCResult<T = unknown> {
  invocationId: string;
  success: boolean;
  result?: T;
  error?: string;
}

/**
 * RPC handler function
 */
export type RPCHandler = (...args: unknown[]) => unknown | Promise<unknown>;

// ============================================================================
// Clock Synchronization
// ============================================================================

/**
 * Clock sync data
 */
export interface IClockSync {
  serverTime: number;
  clientTime: number;
  roundTripTime: number;
  offset: number;
  latency: number;
}

// ============================================================================
// Input Prediction
// ============================================================================

/**
 * Input command
 */
export interface IInputCommand {
  tick: number;
  timestamp: number;
  inputs: Record<string, unknown>;
  sequenceNumber: number;
}

/**
 * Prediction state
 */
export interface IPredictionState {
  tick: number;
  state: Record<string, unknown>;
  inputs: IInputCommand[];
}

// ============================================================================
// Events
// ============================================================================

/**
 * Network event types
 */
export type NetworkEventType =
  | 'connected'
  | 'disconnected'
  | 'peerJoined'
  | 'peerLeft'
  | 'message'
  | 'stateChanged'
  | 'entitySpawned'
  | 'entityDestroyed'
  | 'rpcReceived'
  | 'rpcResult'
  | 'latencyUpdated'
  | 'error';

/**
 * Network event
 */
export interface INetworkEvent<T = unknown> {
  type: NetworkEventType;
  timestamp: number;
  data?: T;
  peerId?: string;
  error?: Error;
}

/**
 * Network event callback
 */
export type NetworkEventCallback<T = unknown> = (event: INetworkEvent<T>) => void;

// ============================================================================
// System Configuration
// ============================================================================

/**
 * Network system configuration
 */
export interface INetworkConfig {
  tickRate?: number;
  sendRate?: number;
  maxMessageSize?: number;
  compression?: boolean;
  encryption?: boolean;
  logging?: boolean;
  debugLatency?: number;
  debugPacketLoss?: number;
}

/**
 * Network statistics
 */
export interface INetworkStats {
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
  messagesReceived: number;
  packetsLost: number;
  averageLatency: number;
  peakLatency: number;
  jitter: number;
}

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Network client interface
 */
export interface INetworkClient {
  // Connection
  connect(config: IConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  readonly state: ConnectionState;
  readonly peerId: string;
  readonly isHost: boolean;

  // Peers
  getPeers(): IPeerInfo[];
  getPeer(id: string): IPeerInfo | undefined;
  getLocalPeer(): IPeerInfo;
  setPeerMetadata(metadata: Record<string, unknown>): void;

  // Messaging
  send<T>(
    type: string,
    payload: T,
    target?: MessageTarget,
    options?: Partial<INetworkMessage>
  ): void;
  broadcast<T>(type: string, payload: T, options?: Partial<INetworkMessage>): void;
  on<T>(type: string, handler: MessageHandler<T>): void;
  off<T>(type: string, handler: MessageHandler<T>): void;

  // Channels
  createChannel(name: string, config?: { ordered?: boolean; reliable?: boolean }): void;
  closeChannel(name: string): void;

  // Events
  addEventListener(event: NetworkEventType, callback: NetworkEventCallback): void;
  removeEventListener(event: NetworkEventType, callback: NetworkEventCallback): void;

  // Stats
  getStats(): INetworkStats;
  getLatencyTo(peerId: string): number;
}

/**
 * State synchronization interface
 */
export interface IStateSynchronizer {
  // State management
  set<T>(key: string, value: T, config?: ISyncConfig): void;
  get<T>(key: string): T | undefined;
  delete(key: string): boolean;
  getAll(): Map<string, ISyncStateEntry>;
  clear(): void;

  // Ownership
  claim(key: string): boolean;
  release(key: string): void;
  getOwner(key: string): string | undefined;
  isOwner(key: string): boolean;

  // Snapshots
  takeSnapshot(): IStateSnapshot;
  restoreSnapshot(snapshot: IStateSnapshot): void;
  getHistory(count?: number): IStateSnapshot[];

  // Sync control
  sync(): void;
  pause(): void;
  resume(): void;
  readonly isPaused: boolean;

  // Events
  onStateChanged<T>(key: string, callback: (entry: ISyncStateEntry<T>) => void): void;
  offStateChanged(key: string, callback: (entry: ISyncStateEntry) => void): void;
}

/**
 * Entity replication interface
 */
export interface IEntityReplicator {
  // Entity management
  spawn(request: ISpawnRequest): Promise<string>;
  despawn(entityId: string): boolean;
  getEntity(id: string): IReplicatedEntity | undefined;
  getAllEntities(): IReplicatedEntity[];
  getOwnedEntities(): IReplicatedEntity[];

  // Entity updates
  updateEntity(entityId: string, delta: Partial<IEntityDelta>): void;
  updateComponent(entityId: string, componentType: string, data: Record<string, unknown>): void;

  // Ownership
  requestOwnership(entityId: string): Promise<boolean>;
  transferOwnership(entityId: string, newOwnerId: string): boolean;
  releaseOwnership(entityId: string): void;

  // Interpolation
  getInterpolatedState(entityId: string, renderTime: number): IEntityDelta | undefined;

  // Events
  onEntitySpawned(callback: (entity: IReplicatedEntity) => void): void;
  onEntityDespawned(callback: (entityId: string) => void): void;
  onEntityUpdated(callback: (entity: IReplicatedEntity, delta: IEntityDelta) => void): void;
}

/**
 * RPC manager interface
 */
export interface IRPCManager {
  // Registration
  register(name: string, handler: RPCHandler, config?: Partial<IRPCConfig>): void;
  unregister(name: string): void;
  isRegistered(name: string): boolean;

  // Invocation
  call<T>(name: string, ...args: unknown[]): Promise<T>;
  callOn<T>(target: RPCTarget, name: string, ...args: unknown[]): Promise<T>;
  callAsync(name: string, ...args: unknown[]): void;

  // Events
  onRPCReceived(callback: (invocation: IRPCInvocation) => void): void;
  onRPCResult(callback: (result: IRPCResult) => void): void;
}

/**
 * Clock synchronization interface
 */
export interface IClockSynchronizer {
  readonly serverTime: number;
  readonly localTime: number;
  readonly offset: number;
  readonly latency: number;
  readonly tick: number;

  sync(): Promise<IClockSync>;
  toServerTime(localTime: number): number;
  toLocalTime(serverTime: number): number;

  onSync(callback: (sync: IClockSync) => void): void;
  offSync(callback: (sync: IClockSync) => void): void;
}

/**
 * Input prediction interface
 */
export interface IInputPredictor {
  // Input handling
  recordInput(inputs: Record<string, unknown>): void;
  getInputsForTick(tick: number): IInputCommand | undefined;
  getPendingInputs(): IInputCommand[];

  // Prediction
  predict(state: Record<string, unknown>, inputs: IInputCommand): Record<string, unknown>;
  reconcile(serverState: Record<string, unknown>, serverTick: number): void;

  // History
  getStateAtTick(tick: number): IPredictionState | undefined;
  clearHistory(beforeTick: number): void;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const NETWORK_DEFAULTS: Required<INetworkConfig> = {
  tickRate: 60,
  sendRate: 20,
  maxMessageSize: 65536,
  compression: false,
  encryption: false,
  logging: false,
  debugLatency: 0,
  debugPacketLoss: 0,
};

export const CONNECTION_DEFAULTS: Required<IConnectionConfig> = {
  url: 'ws://localhost:8080',
  roomId: 'default',
  peerId: '',
  topology: 'client-server',
  maxPeers: 16, // Increase to 100+ once tiered consistency (P.NET.01) is in place
  timeout: 10000,
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  heartbeatInterval: 5000,
  metadata: {},
};

export const SYNC_DEFAULTS: Required<ISyncConfig> = {
  mode: 'authoritative',
  frequency: 'tick',
  interpolate: true,
  interpolationDelay: 100,
  maxHistorySize: 128,
  ownership: 'creator',
  syncTier: 'movement',
  entityType: 'player',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique peer ID
 */
export function generatePeerId(): string {
  return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique entity ID
 */
export function generateEntityId(): string {
  return `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a network message
 */
export function createMessage<T>(
  type: string,
  payload: T,
  senderId: string,
  target: MessageTarget = 'all',
  options: Partial<INetworkMessage<T>> = {}
): INetworkMessage<T> {
  return {
    id: generateMessageId(),
    type,
    payload,
    senderId,
    targetId: target,
    timestamp: Date.now(),
    delivery: 'reliable',
    ...options,
  };
}

/**
 * Create peer info
 */
export function createPeerInfo(
  id: string,
  name?: string,
  isHost: boolean = false,
  isLocal: boolean = false
): IPeerInfo {
  return {
    id,
    name,
    isHost,
    isLocal,
    latency: 0,
    lastSeen: Date.now(),
    metadata: {},
  };
}

/**
 * Create spawn request
 */
export function createSpawnRequest(
  prefabId: string,
  options: Partial<ISpawnRequest> = {}
): ISpawnRequest {
  return {
    prefabId,
    position: options.position ?? { x: 0, y: 0, z: 0 },
    rotation: options.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
    scale: options.scale ?? { x: 1, y: 1, z: 1 },
    ...options,
  };
}

/**
 * Create replicated entity
 */
export function createReplicatedEntity(
  id: string,
  ownerId: string,
  options: Partial<IReplicatedEntity> = {}
): IReplicatedEntity {
  const now = Date.now();
  return {
    id,
    ownerId,
    position: [0, 0, 0],
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    components: [],
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

/**
 * Create entity delta
 */
export function createEntityDelta(
  entityId: string,
  tick: number,
  updates: Partial<IEntityDelta> = {}
): IEntityDelta {
  return {
    entityId,
    tick,
    ...updates,
  };
}

/**
 * Create RPC invocation
 */
export function createRPCInvocation(
  name: string,
  args: unknown[],
  senderId: string,
  targetId: string = 'server'
): IRPCInvocation {
  return {
    id: generateMessageId(),
    name,
    args,
    senderId,
    targetId,
    timestamp: Date.now(),
  };
}

/**
 * Create input command
 */
export function createInputCommand(
  tick: number,
  inputs: Record<string, unknown>,
  sequenceNumber: number
): IInputCommand {
  return {
    tick,
    timestamp: Date.now(),
    inputs,
    sequenceNumber,
  };
}

/**
 * Interpolate between two vectors
 */
export function lerpVector3(a: IVector3, b: IVector3, t: number): IVector3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/**
 * Spherical interpolation between quaternions
 */
export function slerpQuaternion(a: IQuaternion, b: IQuaternion, t: number): IQuaternion {
  // Calculate dot product
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

  // If dot is negative, negate one quaternion
  const negB = dot < 0;
  if (negB) {
    dot = -dot;
  }

  // If very close, use linear interpolation
  if (dot > 0.9995) {
    const bx = negB ? -b.x : b.x;
    const by = negB ? -b.y : b.y;
    const bz = negB ? -b.z : b.z;
    const bw = negB ? -b.w : b.w;

    const result = {
      x: a.x + (bx - a.x) * t,
      y: a.y + (by - a.y) * t,
      z: a.z + (bz - a.z) * t,
      w: a.w + (bw - a.w) * t,
    };

    // Normalize
    const len = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2 + result.w ** 2);
    result.x /= len;
    result.y /= len;
    result.z /= len;
    result.w /= len;

    return result;
  }

  // Standard slerp
  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);

  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  const bx = negB ? -b.x : b.x;
  const by = negB ? -b.y : b.y;
  const bz = negB ? -b.z : b.z;
  const bw = negB ? -b.w : b.w;

  return {
    x: a.x * s0 + bx * s1,
    y: a.y * s0 + by * s1,
    z: a.z * s0 + bz * s1,
    w: a.w * s0 + bw * s1,
  };
}

/**
 * Calculate distance between vectors
 */
export function distanceVector3(a: IVector3, b: IVector3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Check if message is targeted at peer
 */
export function isMessageForPeer(
  message: INetworkMessage,
  peerId: string,
  isHost: boolean
): boolean {
  const { targetId } = message;

  if (targetId === 'all') return true;
  if (targetId === 'host') return isHost;
  if (targetId === 'others') return message.senderId !== peerId;
  if (typeof targetId === 'string') return targetId === peerId;
  if (Array.isArray(targetId)) return targetId.includes(peerId);

  return false;
}

/**
 * Serialize state for network transmission
 */
export function serializeState(state: Map<string, ISyncStateEntry>): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];

  state.forEach((entry, key) => {
    entries.push({
      key,
      value: entry.value,
      version: entry.version,
      ownerId: entry.ownerId,
      timestamp: entry.timestamp,
    });
  });

  return entries;
}

/**
 * Deserialize state from network transmission
 */
export function deserializeState(entries: Record<string, unknown>[]): Map<string, ISyncStateEntry> {
  const state = new Map<string, ISyncStateEntry>();

  for (const entry of entries) {
    state.set(entry.key as string, {
      key: entry.key as string,
      value: entry.value,
      version: entry.version as number,
      ownerId: entry.ownerId as string | undefined,
      timestamp: entry.timestamp as number,
      origin: 'remote',
    });
  }

  return state;
}

/**
 * Validate connection config
 */
export function validateConnectionConfig(config: IConnectionConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.maxPeers !== undefined && config.maxPeers < 1) {
    errors.push('maxPeers must be at least 1');
  }

  if (config.timeout !== undefined && config.timeout < 0) {
    errors.push('timeout must be non-negative');
  }

  if (config.reconnectAttempts !== undefined && config.reconnectAttempts < 0) {
    errors.push('reconnectAttempts must be non-negative');
  }

  if (config.heartbeatInterval !== undefined && config.heartbeatInterval < 100) {
    errors.push('heartbeatInterval must be at least 100ms');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// SYNC TIER CONFIGURATION (P.NET.01)
// ============================================================================

/**
 * Tier-specific defaults for sync configuration.
 * P.NET.01: Each tier maps to a specific consistency model.
 */
export const SYNC_TIER_DEFAULTS: Record<
  SyncTier,
  Required<
    Pick<
      ISyncConfig,
      'mode' | 'frequency' | 'interpolate' | 'interpolationDelay' | 'maxHistorySize' | 'ownership'
    >
  >
> = {
  physics: {
    mode: 'authoritative',
    frequency: 'tick', // 60Hz server-authoritative
    interpolate: true,
    interpolationDelay: 50,
    maxHistorySize: 256,
    ownership: 'host',
  },
  movement: {
    mode: 'authoritative',
    frequency: 'tick', // 20Hz client-predicted
    interpolate: true,
    interpolationDelay: 100,
    maxHistorySize: 128,
    ownership: 'creator',
  },
  ai_agent: {
    mode: 'crdt',
    frequency: 'manual', // 1-5Hz eventual consistency
    interpolate: false,
    interpolationDelay: 200,
    maxHistorySize: 32,
    ownership: 'host',
  },
  cosmetic: {
    mode: 'last-write-wins',
    frequency: 'manual', // <1Hz fire-and-forget
    interpolate: false,
    interpolationDelay: 0,
    maxHistorySize: 8,
    ownership: 'anyone',
  },
};

/**
 * The delivery mode for each sync tier.
 */
export const SYNC_TIER_DELIVERY: Record<SyncTier, DeliveryMode> = {
  physics: 'ordered',
  movement: 'unreliable',
  ai_agent: 'reliable',
  cosmetic: 'unreliable',
};

/**
 * Target update rates (Hz) for each sync tier.
 */
export const SYNC_TIER_RATES: Record<SyncTier, number> = {
  physics: 60,
  movement: 20,
  ai_agent: 5,
  cosmetic: 1,
};

/**
 * Resolve a SyncConfig by applying tier defaults.
 * If syncTier is set, it fills in missing fields from SYNC_TIER_DEFAULTS.
 */
export function resolveSyncConfig(
  config: ISyncConfig
): Required<
  Pick<
    ISyncConfig,
    'mode' | 'frequency' | 'interpolate' | 'interpolationDelay' | 'maxHistorySize' | 'ownership'
  >
> &
  ISyncConfig {
  const tierDefaults = config.syncTier ? SYNC_TIER_DEFAULTS[config.syncTier] : SYNC_DEFAULTS;
  return {
    ...tierDefaults,
    ...config,
  } as Required<
    Pick<
      ISyncConfig,
      'mode' | 'frequency' | 'interpolate' | 'interpolationDelay' | 'maxHistorySize' | 'ownership'
    >
  > &
    ISyncConfig;
}

// ============================================================================
// CRDT TYPES (P.NET.02)
// ============================================================================

/**
 * Last-Writer-Wins Register — stores a single value with timestamp.
 * Used for agent state fields (e.g., current goal, emotion, action).
 * P.NET.02: CRDT for AI agent consensus.
 */
export interface ILWWRegister<T> {
  value: T;
  timestamp: number;
  peerId: string;
}

/**
 * G-Counter — grow-only counter, one entry per node.
 * Used for shared resource tracking (e.g., items collected, enemies defeated).
 */
export interface IGCounter {
  counts: Record<string, number>; // peerId → count
}

/**
 * OR-Set (Observed-Remove Set) — add/remove with unique tags.
 * Used for agent group membership (e.g., patrol group, quest party).
 */
export interface IORSet<T> {
  elements: Map<string, { value: T; addedBy: string; timestamp: number }>;
  tombstones: Set<string>;
}

/**
 * CRDT operations for network sync.
 */
export type CRDTOperation =
  | { type: 'lww_set'; key: string; value: unknown; timestamp: number; peerId: string }
  | { type: 'gcounter_inc'; key: string; peerId: string; delta: number }
  | { type: 'orset_add'; key: string; tag: string; value: unknown; peerId: string }
  | { type: 'orset_remove'; key: string; tag: string };

/** Merge two LWW-Registers — highest timestamp wins */
export function mergeLWW<T>(a: ILWWRegister<T>, b: ILWWRegister<T>): ILWWRegister<T> {
  return a.timestamp >= b.timestamp ? a : b;
}

/** Merge two G-Counters — take max per peer */
export function mergeGCounter(a: IGCounter, b: IGCounter): IGCounter {
  const merged: Record<string, number> = { ...a.counts };
  for (const [peer, count] of Object.entries(b.counts)) {
    merged[peer] = Math.max(merged[peer] ?? 0, count);
  }
  return { counts: merged };
}

/** Get the total value of a G-Counter */
export function gcounterValue(counter: IGCounter): number {
  return Object.values(counter.counts).reduce((sum, v) => sum + v, 0);
}

/** Create a new LWW-Register */
export function createLWWRegister<T>(value: T, peerId: string): ILWWRegister<T> {
  return { value, timestamp: Date.now(), peerId };
}

/** Create a new G-Counter */
export function createGCounter(): IGCounter {
  return { counts: {} };
}

/** Increment a G-Counter for a peer */
export function incrementGCounter(
  counter: IGCounter,
  peerId: string,
  delta: number = 1
): IGCounter {
  return {
    counts: {
      ...counter.counts,
      [peerId]: (counter.counts[peerId] ?? 0) + delta,
    },
  };
}

// ============================================================================
// SPATIAL HASH GRID & INTEREST MANAGEMENT (W.NET.02)
// ============================================================================

/**
 * Spatial hash grid cell for Area of Interest (AOI) management.
 * Each cell tracks entities within a region of 3D space.
 */
export interface ISpatialCell {
  /** Cell coordinates in grid space */
  x: number;
  y: number;
  z: number;
  /** Entity IDs in this cell */
  entities: Set<string>;
  /** Peer IDs observing this cell */
  observers: Set<string>;
}

/**
 * Spatial hash grid configuration.
 */
export interface ISpatialGridConfig {
  /** Cell size in world units (default 50) */
  cellSize: number;
  /** Max entities per cell before subdivision warning */
  maxEntitiesPerCell: number;
  /** Max cells to track (memory budget) */
  maxCells: number;
}

/**
 * Interest management interface — filters network state by spatial relevance.
 * W.NET.02: 95% bandwidth reduction via AOI filtering.
 */
export interface IInterestManager {
  /** Update the position/AOI of a peer */
  updatePeerPosition(peerId: string, position: IVector3, aoiRadius: number): void;
  /** Update the position of an entity */
  updateEntityPosition(entityId: string, position: IVector3, entityType: EntityType): void;
  /** Remove a peer from interest tracking */
  removePeer(peerId: string): void;
  /** Remove an entity from interest tracking */
  removeEntity(entityId: string): void;
  /** Get all entity IDs within a peer's AOI */
  getEntitiesInAOI(peerId: string): string[];
  /** Get all peer IDs that should receive updates for an entity */
  getPeersInterestedIn(entityId: string): string[];
  /** Get the number of tracked entities */
  getEntityCount(): number;
  /** Get the number of active cells */
  getCellCount(): number;
}

/**
 * Spatial hash grid implementation for AOI interest management.
 * W.NET.02: Expected 95% bandwidth reduction for 200 entities.
 */
export class SpatialHashGrid implements IInterestManager {
  private cellSize: number;
  private cells: Map<string, ISpatialCell> = new Map();
  private entityPositions: Map<string, IVector3> = new Map();
  private entityTypes: Map<string, EntityType> = new Map();
  private entityCells: Map<string, string> = new Map();
  private peerPositions: Map<string, { position: IVector3; aoiRadius: number }> = new Map();

  constructor(config: Partial<ISpatialGridConfig> = {}) {
    this.cellSize = config.cellSize ?? 50;
  }

  private cellKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  private worldToCell(position: IVector3): { x: number; y: number; z: number } {
    return {
      x: Math.floor(position.x / this.cellSize),
      y: Math.floor(position.y / this.cellSize),
      z: Math.floor(position.z / this.cellSize),
    };
  }

  private getOrCreateCell(cx: number, cy: number, cz: number): ISpatialCell {
    const key = this.cellKey(cx, cy, cz);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { x: cx, y: cy, z: cz, entities: new Set(), observers: new Set() };
      this.cells.set(key, cell);
    }
    return cell;
  }

  updatePeerPosition(peerId: string, position: IVector3, aoiRadius: number): void {
    this.peerPositions.set(peerId, { position, aoiRadius });
    // Clear old observer status
    for (const cell of this.cells.values()) {
      cell.observers.delete(peerId);
    }
    // Mark cells within AOI as observed
    const cellRadius = Math.ceil(aoiRadius / this.cellSize);
    const center = this.worldToCell(position);
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dz = -cellRadius; dz <= cellRadius; dz++) {
          const cell = this.getOrCreateCell(center.x + dx, center.y + dy, center.z + dz);
          cell.observers.add(peerId);
        }
      }
    }
  }

  updateEntityPosition(entityId: string, position: IVector3, entityType: EntityType): void {
    this.entityPositions.set(entityId, position);
    this.entityTypes.set(entityId, entityType);
    // Remove from old cell
    const oldCellKey = this.entityCells.get(entityId);
    if (oldCellKey) {
      const oldCell = this.cells.get(oldCellKey);
      oldCell?.entities.delete(entityId);
    }
    // Add to new cell
    const cellCoords = this.worldToCell(position);
    const cell = this.getOrCreateCell(cellCoords.x, cellCoords.y, cellCoords.z);
    cell.entities.add(entityId);
    this.entityCells.set(entityId, this.cellKey(cellCoords.x, cellCoords.y, cellCoords.z));
  }

  removePeer(peerId: string): void {
    this.peerPositions.delete(peerId);
    for (const cell of this.cells.values()) {
      cell.observers.delete(peerId);
    }
  }

  removeEntity(entityId: string): void {
    this.entityPositions.delete(entityId);
    this.entityTypes.delete(entityId);
    const cellKey = this.entityCells.get(entityId);
    if (cellKey) {
      const cell = this.cells.get(cellKey);
      cell?.entities.delete(entityId);
      this.entityCells.delete(entityId);
    }
  }

  getEntitiesInAOI(peerId: string): string[] {
    const entities: string[] = [];
    for (const cell of this.cells.values()) {
      if (cell.observers.has(peerId)) {
        for (const entityId of cell.entities) {
          entities.push(entityId);
        }
      }
    }
    return entities;
  }

  getPeersInterestedIn(entityId: string): string[] {
    const cellKey = this.entityCells.get(entityId);
    if (!cellKey) return [];
    const cell = this.cells.get(cellKey);
    return cell ? Array.from(cell.observers) : [];
  }

  getEntityCount(): number {
    return this.entityPositions.size;
  }

  getCellCount(): number {
    return this.cells.size;
  }

  /** Clean up empty cells to prevent memory leak */
  gc(): void {
    for (const [key, cell] of this.cells) {
      if (cell.entities.size === 0 && cell.observers.size === 0) {
        this.cells.delete(key);
      }
    }
  }
}

// ============================================================================
// ENTITY BANDWIDTH PROFILES (W.NET.05)
// ============================================================================

/**
 * Bandwidth profile per entity type.
 * W.NET.05: AI agents have fundamentally different bandwidth needs than players.
 * G.NET.04: Don't overestimate AI agent bandwidth.
 */
export const ENTITY_BANDWIDTH_PROFILES: Record<
  EntityType,
  {
    bytesPerUpdate: number;
    updatesPerSecond: number;
    delivery: DeliveryMode;
    syncTier: SyncTier;
  }
> = {
  player: {
    bytesPerUpdate: 20,
    updatesPerSecond: 20,
    delivery: 'unreliable',
    syncTier: 'movement',
  },
  agent: {
    bytesPerUpdate: 150, // 50-200 bytes of decision state
    updatesPerSecond: 3, // 1-5 Hz
    delivery: 'reliable',
    syncTier: 'ai_agent',
  },
  physics_object: {
    bytesPerUpdate: 32,
    updatesPerSecond: 60,
    delivery: 'ordered',
    syncTier: 'physics',
  },
  cosmetic: {
    bytesPerUpdate: 8,
    updatesPerSecond: 1,
    delivery: 'unreliable',
    syncTier: 'cosmetic',
  },
};

/**
 * Estimate bandwidth for a set of entities within a player's AOI.
 * Uses proper per-entity-type profiles (G.NET.04: don't treat AI like players).
 */
export function estimateAOIBandwidth(entityTypes: EntityType[]): {
  totalBytesPerSecond: number;
  totalKbps: number;
  breakdown: Record<EntityType, number>;
} {
  const breakdown: Record<EntityType, number> = {
    player: 0,
    agent: 0,
    physics_object: 0,
    cosmetic: 0,
  };
  let totalBytesPerSecond = 0;

  for (const type of entityTypes) {
    const profile = ENTITY_BANDWIDTH_PROFILES[type];
    const bps = profile.bytesPerUpdate * profile.updatesPerSecond;
    breakdown[type] += bps;
    totalBytesPerSecond += bps;
  }

  return {
    totalBytesPerSecond,
    totalKbps: (totalBytesPerSecond * 8) / 1000,
    breakdown,
  };
}

// ============================================================================
// NEURAL STREAMING TYPES (PILLAR 2)
// ============================================================================

/**
 * The atomic unit of cognitive telemetry for Neural Streaming.
 * Represents the internal cognitive/decision state of the UAALVirtualMachine.
 */
export interface INeuralPacket {
  packetId: string;
  personaId: string;
  intent: string;
  spatialData: {
    origin: IVector3;
    focusPoint: IVector3;
  };
  metrics: {
    confidence: number;
    latencyMs: number;
  };
  timestamp: number;
}

/**
 * Encapsulates compressed Gaussian Splats and their sorted indices.
 * Broadcast over WebRTC/WebSocket to thin clients to bypass complete local sorting.
 */
export interface INeuralSplatPacket {
  frameId: number;
  cameraState: {
    viewProjectionMatrix: number[];
    cameraPosition: number[];
  };
  splatCount: number;
  // Intended for raw binary transfers
  compressedSplatsBuffer: ArrayBuffer;
  sortedIndicesBuffer: ArrayBuffer;
}
