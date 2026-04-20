/**
 * @holoscript/core Hololand Integration
 *
 * Bridge between HoloScript language and the Hololand runtime platform.
 */

// World Definition Schema
export {
  WorldDefinition,
  WorldMetadata,
  WorldConfig,
  WorldEnvironment,
  WorldZone,
  SpawnPoint,
  ZoneTrigger,
  WorldEvent,
  WorldEventAction,
  WorldScript,
  WorldLODConfig,
  SceneNode,
  WorldPlatform,
  WorldCategory,
  WorldBounds,
  PhysicsConfig,
  RenderingConfig,
  AudioConfig,
  NetworkingConfig,
  PerformanceBudgets,
  AccessibilityConfig,
  SkyboxConfig,
  AmbientLightConfig,
  DirectionalLightConfig,
  TimeOfDayConfig,
  WeatherConfig,
  PostProcessingConfig,
  PostProcessingEffect,
  createWorldDefinition,
  createWorldMetadata,
  createWorldConfig,
  createWorldEnvironment,
} from './WorldDefinitionSchema';

// Hololand Integration
export {
  HololandClient,
  HololandClientConfig,
  ConnectionInfo,
  RuntimeServices,
  AssetStreamingService,
  NetworkingService,
  AudioService,
  AudioPlayOptions,
  AudioHandle,
  AudioSource,
  PhysicsService,
  RigidBodyConfig,
  ColliderShape,
  PhysicsBody,
  RaycastResult,
  InputService,
  InputBinding,
  XRControllerState,
  AnalyticsService,
  PerformanceMetrics,
  VoiceService,
  TTSOptions,
  StorageService,
  getHololandClient,
  connectToHololand,
  disconnectFromHololand,
} from './HololandIntegration';

// Confabulation-safe Physics Bounds (consults AgentRiskRegistry per agent)
export {
  // Types
  type PhysicsEnvelope,
  type BoundsViolation,
  type PhysicsBoundsRegistryConfig,
  type WrapOptions,

  // Constants
  DEFAULT_ENVELOPES,

  // Class
  PhysicsBoundsRegistry,

  // Wrapper
  wrapPhysicsService,

  // Singleton
  getPhysicsBoundsRegistry,
  resetPhysicsBoundsRegistry,
} from './PhysicsBoundsRegistry';

// Multi-agent cross-validation (closes the confabulation loop — peer
// divergence on world-state events feeds back into AgentRiskRegistry).
export {
  // Types
  type WorldStateClaim,
  type Observation,
  type ToleranceConfig,
  type ConsensusResult,
  type RoundSnapshot,
  type CrossValidationRegistryConfig,
  type SubmissionResult,

  // Class
  CrossValidationRegistry,

  // Pure helpers
  computeConsensus,
  suggestedQuorum,

  // Singleton
  getCrossValidationRegistry,
  resetCrossValidationRegistry,
} from './CrossValidationRegistry';

// Streaming Protocol
export {
  StreamProtocol,
  StreamMessage,
  MessageType,
  HandshakeMessage,
  HandshakeAckMessage,
  HeartbeatMessage,
  HeartbeatAckMessage,
  WorldJoinMessage,
  WorldStateMessage,
  WorldUpdateMessage,
  EntityState,
  EntityDelta,
  EntitySpawnMessage,
  EntityDespawnMessage,
  EntityUpdateMessage,
  EntityBatchUpdateMessage,
  EntityRPCMessage,
  AssetRequestMessage,
  AssetResponseMessage,
  AssetChunkMessage,
  AssetCompleteMessage,
  AssetErrorMessage,
  PlayerState,
  PlayerJoinMessage,
  PlayerLeaveMessage,
  PlayerUpdateMessage,
  PlayerInputMessage,
  VoiceDataMessage,
  ChatMessage,
  WorldEvent as StreamWorldEvent,
  StreamHandler,
  getStreamProtocol,
  createMessage as createStreamMessage,
  PROTOCOL_VERSION,
  MAX_MESSAGE_SIZE,
  MAX_CHUNK_SIZE,
  HEARTBEAT_INTERVAL,
  TIMEOUT_INTERVAL,
} from './StreamingProtocol';
