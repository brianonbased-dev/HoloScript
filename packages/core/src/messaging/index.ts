/**
 * Messaging Module
 * Sprint 4 Priority 6 - Agent Communication Channels
 *
 * Exports all messaging components for agent-to-agent communication.
 */

// Types
export {
  EncryptionMode,
  ChannelConfig,
  ChannelMember,
  AgentChannel,
  MessagePriority,
  Message,
  MessageAck,
  BroadcastMessage,
  MessageHandler,
  ChannelEvent,
  JSONSchema,
  DEFAULT_CHANNEL_CONFIG,
  generateMessageId,
  generateChannelId,
  validateMessageSchema,
} from './MessagingTypes';

// Channel Manager
export { ChannelManager, ChannelManagerEvents } from './ChannelManager';

// Agent Messaging
export { AgentMessaging, AgentMessagingConfig } from './AgentMessaging';

// Trait
export {
  MessagingTraitBehavior,
  MessagingTraitDefinition,
  MessagingTrait,
  MessagingTraitManager,
  createMessagingTrait,
} from './MessagingTrait';
