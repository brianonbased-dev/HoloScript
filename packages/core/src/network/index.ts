/**
 * @deprecated Import from @holoscript/crdt instead.
 *
 * Network Module
 *
 * HoloScript network synchronization system with peer connections,
 * state sync, entity replication, and RPC support.
 *
 * @module network
 */

// Types and Interfaces
export {
  // Vector types (IVector3 exported from audio module to avoid duplicate)
  IQuaternion,

  // Connection
  ConnectionState,
  NetworkTopology,
  IPeerInfo,
  IConnectionConfig,

  // Messages
  DeliveryMode,
  MessageTarget,
  INetworkMessage,
  MessageHandler,

  // State Sync
  SyncMode,
  SyncFrequency,
  StateOrigin,
  ISyncStateEntry,
  IStateSnapshot,
  ISyncConfig,

  // Entity Replication
  IReplicatedComponent,
  IReplicatedEntity,
  ISpawnRequest,
  IEntityDelta,

  // RPC
  RPCTarget,
  IRPCConfig,
  IRPCInvocation,
  IRPCResult,
  RPCHandler,

  // Clock
  IClockSync,

  // Input Prediction
  IInputCommand,
  IPredictionState,

  // Events
  NetworkEventType,
  INetworkEvent,
  NetworkEventCallback,

  // Configuration
  INetworkConfig,
  INetworkStats,

  // Interfaces
  INetworkClient,
  IStateSynchronizer,
  IEntityReplicator,
  IRPCManager,
  IClockSynchronizer,
  IInputPredictor,

  // Defaults
  NETWORK_DEFAULTS,
  CONNECTION_DEFAULTS,
  SYNC_DEFAULTS,

  // Helper Functions
  generateMessageId,
  generatePeerId,
  generateEntityId,
  createMessage,
  createPeerInfo,
  createSpawnRequest,
  createReplicatedEntity,
  createEntityDelta,
  createRPCInvocation,
  createInputCommand,
  lerpVector3,
  slerpQuaternion,
  distanceVector3,
  isMessageForPeer,
  serializeState,
  deserializeState,
  validateConnectionConfig,
} from './NetworkTypes';

// Implementations
export { NetworkClientImpl, createNetworkClient } from './NetworkClientImpl';
export { StateSynchronizerImpl, createStateSynchronizer } from './StateSynchronizerImpl';

// SyncProtocol and Transports
export {
  SyncProtocol,
  createSyncProtocol,
  createLocalSync,
  DeltaEncoder,
  InterestManager,
  WebSocketTransport,
  WebRTCTransport,
  LocalBroadcastTransport,
  type Transport,
  type SyncProtocolConfig,
  type SyncOptimizations,
  type SyncState,
  type SyncMessage,
  type TransportType,
} from './SyncProtocol';

// Production WebRTC Transport (Sprint 2)
export {
  ProductionWebRTCTransport,
  createWebRTCTransport,
  type WebRTCTransportConfig,
} from './ProductionWebRTCTransport';

// Transport Fallback Manager (Sprint 2)
export {
  TransportFallbackManager,
  createTransportFallback,
  type TransportFallbackConfig,
  type TransportPriority,
} from './TransportFallback';

// Signaling (Sprint 2)
export * from './signaling';

// Higher-order math utilities (Catmull-Rom, Hermite, Bezier, vec3 ops)
export {
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Length,
  vec3Lerp,
  catmullRom,
  hermiteInterpolate,
  cubicBezier,
} from './MathUtils';

// Jitter buffer for out-of-sequence packet reordering
export { JitterBuffer, type JitterBufferConfig } from './JitterBuffer';

// Latency Compensation System
export {
  LatencyCompensator,
  InputPatternAnalyzer,
  IntentPredictor,
  AdaptiveHorizon,
  CorrectionBlender,
  StateHistoryBuffer,
  createLocalPlayerCompensator,
  createRemotePlayerCompensator,
  DEFAULT_LATENCY_CONFIG,
  type PredictionTier,
  type ICorrectionThresholds,
  type ILatencyCompConfig,
  type IPredictedEntityState,
  type IActiveCorrection,
  type IRTTSample,
  type IInteractable,
} from './LatencyCompensation';

// Dead-Reckoning Bridge (Track 3A: Physics + Networking interop)
export {
  DeadReckoningPredictor,
  PhysicsAuthorityResolver,
  extractPhysicsSnapshot,
  estimatePhysicsBandwidth,
  DEFAULT_DEAD_RECKONING_CONFIG,
  SNAPSHOT_BYTE_SIZE,
  type DeadReckoningConfig,
  type DeadReckoningThresholds,
  type CorrectionStrategy,
  type AuthorityMode,
  type PhysicsSnapshot,
  type CorrectionResult,
  type AuthorityRequest,
  type BandwidthEstimate,
} from './DeadReckoningBridge';

// Merged from networking/
export { LWWRegister, PNCounter, ORSet, isCRDT } from './CRDT';
export { DeltaCompressor } from './DeltaCompressor';
export { NetworkTransport } from './NetworkTransport';
export { PriorityScorer } from './PriorityScorer';
export { RPCManager } from './RPCManager';
export { SpatialSharder } from './SpatialSharder';
export { StateReplicator } from './StateReplicator';
export { TransactionLog } from './TransactionLog';
export { StateSynchronizer } from './StateSynchronizer';
export { SpatialWebSocketTransport } from './SpatialWebSocketTransport';
export { WebSocketSignaler } from './WebSocketSignaler';
export { NeuralStreamingTransport, type ISignalingBridge, type NeuralSignalPayload, type StreamingTransportConfig } from './NeuralStreamingTransport';
