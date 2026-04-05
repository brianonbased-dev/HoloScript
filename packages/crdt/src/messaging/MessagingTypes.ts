/**
 * Messaging Types
 * Sprint 4 Priority 6 - Agent Communication Channels
 *
 * Type definitions for secure, typed agent-to-agent messaging.
 */

// =============================================================================
// CHANNEL CONFIGURATION
// =============================================================================

/**
 * Supported encryption modes
 */
export type EncryptionMode = 'none' | 'aes-256' | 'e2e';

/**
 * Message priority levels (numeric 0-10 or named priorities)
 */
export type MessagePriority =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 'low'
  | 'normal'
  | 'high'
  | 'urgent'
  | 'critical';

/**
 * JSON Schema type (simplified for demonstration)
 */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JSONSchema;
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  /** Channel name/description */
  name?: string;

  /** Encryption mode */
  encryption: EncryptionMode;

  /** Message schema for validation */
  messageSchema?: JSONSchema;

  /** Maximum message size in bytes */
  maxMessageSize?: number;

  /** Message TTL in milliseconds */
  messageTTL?: number;

  /** Require acknowledgments */
  requireAck?: boolean;

  /** Retry failed deliveries */
  retryCount?: number;

  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Default channel configuration
 */
export const DEFAULT_CHANNEL_CONFIG: Required<ChannelConfig> = {
  name: '',
  encryption: 'none',
  messageSchema: {},
  maxMessageSize: 1024 * 1024, // 1MB
  messageTTL: 60000, // 1 minute
  requireAck: false,
  retryCount: 3,
  retryDelay: 1000,
};

// =============================================================================
// CHANNEL TYPES
// =============================================================================

/**
 * Agent channel for communication
 */
export interface AgentChannel {
  /** Unique channel identifier */
  id: string;

  /** Channel name */
  name: string;

  /** Participant agent IDs */
  participants: string[];

  /** Channel creator */
  ownerId: string;

  /** Encryption mode */
  encryption: EncryptionMode;

  /** Message schema */
  messageSchema: JSONSchema;

  /** Channel configuration */
  config: Required<ChannelConfig>;

  /** Creation timestamp */
  createdAt: number;

  /** Whether channel is open for new participants */
  isOpen: boolean;
}

/**
 * Channel member info
 */
export interface ChannelMember {
  agentId: string;
  joinedAt: number;
  role: 'owner' | 'admin' | 'member';
  publicKey?: string; // For e2e encryption
}

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Message delivery status
 */
export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'acknowledged'
  | 'failed'
  | 'expired';

/**
 * Base message structure
 */
export interface Message<T = unknown> {
  /** Unique message ID */
  id: string;

  /** Channel ID */
  channelId: string;

  /** Intended recipient ID (for direct messages) */
  recipientId?: string;

  /** Sender agent ID */
  senderId: string;

  /** Message payload */
  payload: T;

  /** Message type/category */
  type?: string;

  /** Priority level */
  priority: MessagePriority;

  /** Delivery status */
  status: MessageStatus;

  /** Send timestamp */
  timestamp: number;

  /** Expiration timestamp */
  expiresAt?: number;

  /** Encrypted payload (if encryption enabled) */
  encrypted?: boolean;

  /** Initialization vector for encryption */
  iv?: string;

  /** Retry attempt count */
  retryCount?: number;
}

/**
 * Message acknowledgment status
 */
export type MessageAckStatus = 'delivered' | 'read' | 'failed' | 'pending';

/**
 * Message acknowledgment
 */
export interface MessageAck {
  messageId: string;
  receiverId?: string;
  recipientId?: string;
  timestamp: number;
  success?: boolean;
  status?: MessageAckStatus;
  error?: string;
}

/**
 * Broadcast message (to all agents)
 */
export interface BroadcastMessage<T = unknown> {
  id: string;
  channelId: string;
  senderId: string;
  payload: T;
  type?: string;
  priority: MessagePriority;
  timestamp: number;
  encrypted?: boolean;
  recipients?: string[];
  targetFilter?: (agentId: string) => boolean;
}

// =============================================================================
// HANDLER TYPES
// =============================================================================

/**
 * Message handler function
 */
export type MessageHandler<T = unknown> = (
  message: Message<T>,
  channel: AgentChannel
) => void | Promise<void>;

/**
 * Broadcast handler function
 */
export type BroadcastHandler<T = unknown> = (message: BroadcastMessage<T>) => void | Promise<void>;

/**
 * Channel event handler
 */
export type ChannelEventHandler = (event: ChannelEvent) => void | Promise<void>;

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Channel event types
 */
export type ChannelEventType =
  | 'channel:created'
  | 'channel:closed'
  | 'channel:joined'
  | 'channel:left'
  | 'message:sent'
  | 'message:received'
  | 'message:delivered'
  | 'message:acknowledged'
  | 'message:failed'
  | 'message:expired';

/**
 * Base channel event
 */
export interface ChannelEventBase {
  type: ChannelEventType;
  timestamp: number;
}

/**
 * Channel lifecycle event
 */
export interface ChannelLifecycleEvent extends ChannelEventBase {
  type: 'channel:created' | 'channel:closed';
  channelId: string;
  channel: AgentChannel;
}

/**
 * Channel membership event
 */
export interface ChannelMembershipEvent extends ChannelEventBase {
  type: 'channel:joined' | 'channel:left';
  channelId: string;
  agentId: string;
}

/**
 * Message event
 */
export interface MessageEvent extends ChannelEventBase {
  type:
    | 'message:sent'
    | 'message:received'
    | 'message:delivered'
    | 'message:acknowledged'
    | 'message:failed'
    | 'message:expired';
  message: Message;
  channelId: string;
  error?: string;
}

/**
 * Union of all channel events
 */
export type ChannelEvent = ChannelLifecycleEvent | ChannelMembershipEvent | MessageEvent;

// =============================================================================
// SUBSCRIPTION TYPES
// =============================================================================

/**
 * Channel subscription
 */
export interface ChannelSubscription {
  channelId: string;
  handler: MessageHandler;
  filter?: (message: Message) => boolean;
}

/**
 * Broadcast subscription
 */
export interface BroadcastSubscription {
  handler: BroadcastHandler;
  filter?: (message: BroadcastMessage) => boolean;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a unique message ID
 */
export function generateMessageId(senderId: string): string {
  return `msg-${senderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique channel ID
 */
export function generateChannelId(ownerId: string): string {
  return `ch-${ownerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Check if message has expired
 */
export function isMessageExpired(message: Message): boolean {
  if (!message.expiresAt) return false;
  return Date.now() > message.expiresAt;
}

/**
 * Validate message against schema (basic implementation)
 */
export function validateMessageSchema(
  payload: unknown,
  schema: JSONSchema
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!schema || Object.keys(schema).length === 0) {
    return { valid: true, errors: [] };
  }

  // Type validation
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const payloadType = Array.isArray(payload) ? 'array' : typeof payload;

    if (!types.includes(payloadType)) {
      errors.push(`Expected type ${types.join(' | ')}, got ${payloadType}`);
    }
  }

  // Object property validation
  if (schema.properties && typeof payload === 'object' && payload !== null) {
    const obj = payload as Record<string, unknown>;

    // Required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in obj)) {
          errors.push(`Missing required property: ${prop}`);
        }
      }
    }

    // Property schemas
    for (const [prop, propSchema] of Object.entries(schema.properties)) {
      if (prop in obj) {
        const result = validateMessageSchema(obj[prop], propSchema);
        errors.push(...result.errors.map((e) => `${prop}: ${e}`));
      }
    }
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(payload)) {
    errors.push(`Value must be one of: ${schema.enum.join(', ')}`);
  }

  // Number range validation
  if (typeof payload === 'number') {
    if (schema.minimum !== undefined && payload < schema.minimum) {
      errors.push(`Value must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && payload > schema.maximum) {
      errors.push(`Value must be <= ${schema.maximum}`);
    }
  }

  // String length validation
  if (typeof payload === 'string') {
    if (schema.minLength !== undefined && payload.length < schema.minLength) {
      errors.push(`String length must be >= ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && payload.length > schema.maxLength) {
      errors.push(`String length must be <= ${schema.maxLength}`);
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(payload)) {
        errors.push(`String must match pattern: ${schema.pattern}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
