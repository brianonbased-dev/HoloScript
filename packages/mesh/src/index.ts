/**
 * @holoscript/mesh public API
 *
 * NOTE: Several sub-modules define overlapping symbols (MessageHandler,
 * generateMessageId, SyncMessage, JitterBuffer). We use explicit re-exports
 * to resolve ambiguity — network module is the canonical source for shared
 * network primitives.
 */

// Network — canonical source for shared primitives
export * from './network';

// Messaging — exclude duplicates already exported by network
export {
  EncryptionMode,
  ChannelConfig,
  ChannelMember,
  AgentChannel,
  MessagePriority,
  Message,
  MessageAck,
  BroadcastMessage,
  // MessageHandler — already exported from network
  ChannelEvent,
  JSONSchema,
  DEFAULT_CHANNEL_CONFIG,
  // generateMessageId — already exported from network
  generateChannelId,
  validateMessageSchema,
  ChannelManager,
  ChannelManagerEvents,
  AgentMessaging,
  AgentMessagingConfig,
  MessagingTraitBehavior,
  MessagingTraitDefinition,
  MessagingTrait,
  MessagingTraitManager,
  createMessagingTrait,
} from './messaging';

// Collaboration — exclude SyncMessage (already exported from network)
export {
  CRDTDocument,
  type CRDTDocumentConfig,
  type CursorPosition,
  type DocumentChange,
  type DocumentEvent,
  CollaborationSession,
  type FileChangeCallback,
  type SessionConfig,
  type SessionEvent,
  type SessionEventType,
  CollaborationTransport,
  decodeSyncMessage,
  encodeSyncMessage,
  // SyncMessage — already exported from network/SyncProtocol
  type SyncMessageType,
} from './collaboration';

// Consensus
export * from './consensus';

// Social
export * from './social';

// Multiplayer
export * from './multiplayer';

// Sync — exclude JitterBuffer (already exported from network)
export {
  type QuantizedPosition,
  type CompressedQuaternion,
  type HighFrequencyUpdate,
  type InterpolationSample,
  type HighFrequencySyncStats,
  quantizePosition,
  dequantizePosition,
  compressQuaternion,
  decompressQuaternion,
  PriorityScheduler,
  // JitterBuffer — already exported from network
  createPriorityScheduler,
  createJitterBuffer,
} from './sync';
