/**
 * Network Sync Types
 *
 * Type definitions for networked state synchronization in HoloScript.
 * Provides peer-to-peer and client-server networking primitives.
 *
 * TODO(P.NET.01): Implement tiered consistency architecture.
 *   Add 'syncTier' to ISyncConfig: 'physics' | 'movement' | 'ai_agent' | 'cosmetic'.
 *   Physics = server-authoritative 60Hz reliable. Movement = client-predicted 20Hz.
 *   AI agent = CRDT 1-5Hz eventual. Cosmetic = LWW <1Hz fire-and-forget.
 *   Reduces bandwidth 60-80% for 100+ player scenarios.
 *
 * TODO(W.NET.02): Implement spatial hash grid interest management.
 *   Only send state for entities in a player's Area of Interest (AOI).
 *   95% bandwidth reduction. 200 entities → each player sees 20-40.
 *   Requires ISpatialHashGrid + IInterestManager interfaces here.
 *
 * TODO(P.NET.02): Add CRDT types for AI agent state sync.
 *   LWW-Register for agent state, G-Counter for shared resources,
 *   OR-Set for agent group membership. SyncMode already has 'crdt' —
 *   need concrete implementations. Scope to AOI cells, max 15 replicas (G.NET.05).
 *
 * TODO(W.NET.05): Define AI agent as a distinct entity class.
 *   AI agents: 50-200 bytes at 1-5Hz (not 20 bytes × 60Hz like players).
 *   Add 'agent' to entity types. Separate sync channel with its own
 *   consistency model. Don't treat AI state like player state (G.NET.04).
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
 * Sync frequency
 */
export type SyncFrequency = 'immediate' | 'tick' | 'manual';

/**
 * State change origin
 */
export type StateOrigin = 'local' | 'remote' | 'reconciled';

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
  // TODO(P.NET.01): Add syncTier: 'physics' | 'movement' | 'ai_agent' | 'cosmetic'
  //   Each tier maps to different frequency, delivery mode, and consistency model.
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
  maxPeers: 16, // TODO(W.NET.01): Increase to 100+ once tiered consistency is in place
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
    position: { x: 0, y: 0, z: 0 },
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
