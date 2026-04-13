/**
 * Agent Messaging System
 * Sprint 4 Priority 6 - Agent Communication Channels
 *
 * Provides secure, validated messaging between agents across channels.
 */

import { EventEmitter } from 'events';
import { createCipheriv, createDecipheriv, randomBytes, createECDH } from 'crypto';
import {
  Message,
  MessageAck,
  BroadcastMessage,
  MessageHandler,
  ChannelConfig,
  AgentChannel,
  MessagePriority,
  generateMessageId,
  validateMessageSchema,
} from './MessagingTypes';
import { ChannelManager } from './ChannelManager';

// =============================================================================
// ENCRYPTION UTILITIES (AES-256-GCM + ECDH)
// =============================================================================

class EncryptionService {
  /**
   * Encrypt a message payload using AES-256-GCM.
   * Format: base64(iv[12] + authTag[16] + ciphertext)
   */
  static encrypt(payload: unknown, _mode: 'aes-256' | 'e2e', key?: string): string {
    const json = JSON.stringify(payload);
    const iv = randomBytes(12);
    const encKey = key ? Buffer.from(key, 'hex').subarray(0, 32) : randomBytes(32);
    const cipher = createCipheriv('aes-256-gcm', encKey, iv);
    const encrypted = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /**
   * Decrypt a message payload using AES-256-GCM.
   */
  static decrypt<T>(encrypted: string, _mode: 'aes-256' | 'e2e', key?: string): T {
    const packed = Buffer.from(encrypted, 'base64');
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decKey = key ? Buffer.from(key, 'hex').subarray(0, 32) : Buffer.alloc(32);
    const decipher = createDecipheriv('aes-256-gcm', decKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8')) as T;
  }

  /**
   * Generate ECDH key pair (P-256). Public keys are exchanged between agents;
   * the shared secret derives the AES-256 key via ECDH.
   */
  static generateKeyPair(): { publicKey: string; privateKey: string } {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    return {
      publicKey: ecdh.getPublicKey('hex'),
      privateKey: ecdh.getPrivateKey('hex'),
    };
  }

  /**
   * Derive a shared AES-256 key from ECDH key exchange.
   */
  static deriveSharedKey(privateKey: string, peerPublicKey: string): string {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(privateKey, 'hex');
    return ecdh.computeSecret(peerPublicKey, 'hex', 'hex').substring(0, 64);
  }
}

// =============================================================================
// MESSAGE QUEUE
// =============================================================================

interface QueuedMessage<T = unknown> {
  message: Message<T>;
  channelId: string;
  retries: number;
  queuedAt: number;
}

// =============================================================================
// AGENT MESSAGING
// =============================================================================

export interface AgentMessagingConfig {
  /** Maximum retries for failed messages */
  maxRetries: number;
  /** Retry delay in ms */
  retryDelay: number;
  /** Message timeout in ms */
  messageTimeout: number;
  /** Whether to auto-acknowledge messages */
  autoAck: boolean;
  /** Maximum queue size */
  maxQueueSize: number;
}

const DEFAULT_CONFIG: AgentMessagingConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  messageTimeout: 30000,
  autoAck: true,
  maxQueueSize: 1000,
};

/**
 * Agent messaging system for secure channel-based communication
 */
export class AgentMessaging extends EventEmitter {
  private agentId: string;
  private config: AgentMessagingConfig;
  private channelManager: ChannelManager;
  private handlers: Map<string, Set<MessageHandler<unknown>>> = new Map();
  private typeHandlers: Map<string, Set<MessageHandler<unknown>>> = new Map();
  private pendingMessages: Map<string, QueuedMessage> = new Map();
  private messageQueue: QueuedMessage[] = [];
  private keyPair?: { publicKey: string; privateKey: string };

  constructor(
    agentId: string,
    channelManager: ChannelManager,
    config: Partial<AgentMessagingConfig> = {}
  ) {
    super();
    this.agentId = agentId;
    this.channelManager = channelManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize encryption keys
   */
  initializeEncryption(): { publicKey: string; privateKey: string } {
    this.keyPair = EncryptionService.generateKeyPair();
    return this.keyPair;
  }

  /**
   * Get public key for sharing
   */
  getPublicKey(): string | null {
    return this.keyPair?.publicKey || null;
  }

  // ===========================================================================
  // CHANNEL OPERATIONS
  // ===========================================================================

  /**
   * Create a new channel
   */
  createChannel(participants: string[], config: Partial<ChannelConfig> = {}): AgentChannel {
    const channel = this.channelManager.createChannel(this.agentId, participants, config);

    // Register public key if encryption enabled
    if (channel.encryption !== 'none' && this.keyPair) {
      this.channelManager.setPublicKey(channel.id, this.agentId, this.keyPair.publicKey);
    }

    return channel;
  }

  /**
   * Join an existing channel
   */
  joinChannel(channelId: string): boolean {
    return this.channelManager.joinChannel(channelId, this.agentId, this.keyPair?.publicKey);
  }

  /**
   * Leave a channel
   */
  leaveChannel(channelId: string): boolean {
    // Unsubscribe from channel
    this.handlers.delete(channelId);
    return this.channelManager.leaveChannel(channelId, this.agentId);
  }

  /**
   * Close a channel (owner only)
   */
  closeChannel(channelId: string): boolean {
    this.handlers.delete(channelId);
    return this.channelManager.closeChannel(channelId, this.agentId);
  }

  /**
   * Get channels this agent belongs to
   */
  getChannels(): AgentChannel[] {
    return this.channelManager.getAgentChannels(this.agentId);
  }

  // ===========================================================================
  // SENDING MESSAGES
  // ===========================================================================

  /**
   * Send a message to a specific agent in a channel
   */
  send<T>(
    channelId: string,
    recipientId: string,
    type: string,
    payload: T,
    priority: MessagePriority = 'normal'
  ): Message<T> | null {
    const channel = this.channelManager.getChannel(channelId);
    if (!channel) {
      this.emit('error', { error: 'Channel not found', channelId });
      return null;
    }

    // Verify sender is member
    if (!this.channelManager.isMember(channelId, this.agentId)) {
      this.emit('error', { error: 'Not a member of channel', channelId });
      return null;
    }

    // Verify recipient is member
    if (!this.channelManager.isMember(channelId, recipientId)) {
      this.emit('error', { error: 'Recipient not in channel', recipientId });
      return null;
    }

    // Validate against schema if present
    if (channel.messageSchema) {
      const validation = validateMessageSchema(payload, channel.messageSchema);
      if (!validation.valid) {
        this.emit('error', { error: 'Schema validation failed', errors: validation.errors });
        return null;
      }
    }

    // Create message
    let finalPayload = payload;

    // Apply encryption if needed
    if (channel.encryption !== 'none' && this.keyPair) {
      const recipientPublicKey = this.channelManager.getPublicKey(channelId, recipientId);

      // For E2E encryption, derive shared key using recipient's public key
      const encryptionKey = recipientPublicKey
        ? EncryptionService.deriveSharedKey(this.keyPair.privateKey, recipientPublicKey)
        : undefined;

      finalPayload = EncryptionService.encrypt(
        payload,
        channel.encryption,
        encryptionKey
      ) as unknown as T;
    }

    const message: Message<T> = {
      id: generateMessageId(this.agentId),
      channelId,
      senderId: this.agentId,
      recipientId,
      type,
      payload: finalPayload,
      timestamp: Date.now(),
      encrypted: channel.encryption !== 'none',
      priority,
      status: 'sent',
    };

    // Track pending message
    this.pendingMessages.set(message.id, {
      message: message as Message<unknown>,
      channelId,
      retries: 0,
      queuedAt: Date.now(),
    });

    // Emit for delivery
    this.emit('message:sent', message);
    return message;
  }

  /**
   * Broadcast message to all channel members
   */
  broadcast<T>(
    channelId: string,
    type: string,
    payload: T,
    priority: MessagePriority = 'normal'
  ): BroadcastMessage<T> | null {
    const channel = this.channelManager.getChannel(channelId);
    if (!channel) {
      this.emit('error', { error: 'Channel not found', channelId });
      return null;
    }

    // Verify sender is member
    if (!this.channelManager.isMember(channelId, this.agentId)) {
      this.emit('error', { error: 'Not a member of channel', channelId });
      return null;
    }

    // Validate against schema if present
    if (channel.messageSchema) {
      const validation = validateMessageSchema(payload, channel.messageSchema);
      if (!validation.valid) {
        this.emit('error', { error: 'Schema validation failed', errors: validation.errors });
        return null;
      }
    }

    // Get recipients (all members except sender)
    const recipients = channel.participants.filter((p) => p !== this.agentId);

    const broadcast: BroadcastMessage<T> = {
      id: generateMessageId(this.agentId),
      channelId,
      senderId: this.agentId,
      type,
      payload,
      timestamp: Date.now(),
      encrypted: channel.encryption !== 'none',
      priority,
      recipients,
    };

    this.emit('message:broadcast', broadcast);
    return broadcast;
  }

  /**
   * Reply to a message
   */
  reply<T>(originalMessage: Message<unknown>, type: string, payload: T): Message<T> | null {
    return this.send(
      originalMessage.channelId,
      originalMessage.senderId,
      type,
      payload,
      originalMessage.priority
    );
  }

  // ===========================================================================
  // RECEIVING MESSAGES
  // ===========================================================================

  /**
   * Subscribe to all messages on a channel
   */
  subscribe<T = unknown>(channelId: string, handler: MessageHandler<T>): () => void {
    let handlers = this.handlers.get(channelId);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(channelId, handlers);
    }

    handlers.add(handler as MessageHandler<unknown>);

    // Return unsubscribe function
    return () => {
      handlers?.delete(handler as MessageHandler<unknown>);
      if (handlers?.size === 0) {
        this.handlers.delete(channelId);
      }
    };
  }

  /**
   * Subscribe to messages of a specific type
   */
  subscribeToType<T = unknown>(type: string, handler: MessageHandler<T>): () => void {
    let handlers = this.typeHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.typeHandlers.set(type, handlers);
    }

    handlers.add(handler as MessageHandler<unknown>);

    return () => {
      handlers?.delete(handler as MessageHandler<unknown>);
      if (handlers?.size === 0) {
        this.typeHandlers.delete(type);
      }
    };
  }

  /**
   * Process a received message
   */
  handleMessage<T>(message: Message<T>): MessageAck {
    // Verify this is the intended recipient
    if (message.recipientId && message.recipientId !== this.agentId) {
      return {
        messageId: message.id,
        recipientId: this.agentId,
        status: 'failed',
        timestamp: Date.now(),
        error: 'Not intended recipient',
      };
    }

    // Decrypt if needed
    let payload = message.payload;
    if (message.encrypted && this.keyPair) {
      const channel = this.channelManager.getChannel(message.channelId);
      if (channel && channel.encryption !== 'none') {
        try {
          // For E2E encryption, derive shared key using sender's public key
          const senderPublicKey = this.channelManager.getPublicKey(
            message.channelId,
            message.senderId
          );
          const decryptionKey = senderPublicKey
            ? EncryptionService.deriveSharedKey(this.keyPair.privateKey, senderPublicKey)
            : this.keyPair.privateKey;

          payload = EncryptionService.decrypt<T>(
            message.payload as unknown as string,
            channel.encryption,
            decryptionKey
          );
        } catch (_error) {
          return {
            messageId: message.id,
            recipientId: this.agentId,
            status: 'failed',
            timestamp: Date.now(),
            error: 'Decryption failed',
          };
        }
      }
    }

    const decryptedMessage: Message<T> = {
      ...message,
      payload,
    };

    const channel = this.channelManager.getChannel(message.channelId);

    // Invoke channel handlers
    const channelHandlers = this.handlers.get(message.channelId);
    if (channelHandlers && channel) {
      for (const handler of channelHandlers) {
        try {
          handler(decryptedMessage, channel);
        } catch (error) {
          this.emit('handler:error', { message, error });
        }
      }
    }

    // Invoke type handlers
    if (message.type) {
      const typeHandlers = this.typeHandlers.get(message.type);
      if (typeHandlers && channel) {
        for (const handler of typeHandlers) {
          try {
            handler(decryptedMessage, channel);
          } catch (error) {
            this.emit('handler:error', { message, error });
          }
        }
      }
    }

    // Emit general event
    this.emit('message:received', decryptedMessage);

    return {
      messageId: message.id,
      recipientId: this.agentId,
      status: 'delivered',
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // ACKNOWLEDGEMENT
  // ===========================================================================

  /**
   * Handle message acknowledgement
   */
  handleAck(ack: MessageAck): void {
    const pending = this.pendingMessages.get(ack.messageId);
    if (!pending) return;

    if (ack.status === 'delivered' || ack.status === 'read') {
      this.pendingMessages.delete(ack.messageId);
      this.emit('message:acked', ack);
    } else if (ack.status === 'failed') {
      // Retry logic
      if (pending.retries < this.config.maxRetries) {
        pending.retries++;
        this.queueForRetry(pending);
      } else {
        this.pendingMessages.delete(ack.messageId);
        this.emit('message:failed', { message: pending.message, ack });
      }
    }
  }

  /**
   * Mark message as read
   */
  markAsRead(messageId: string): MessageAck {
    return {
      messageId,
      recipientId: this.agentId,
      status: 'read',
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // QUEUE MANAGEMENT
  // ===========================================================================

  private queueForRetry(pending: QueuedMessage): void {
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      this.emit('queue:full', { dropped: pending });
      return;
    }

    setTimeout(() => {
      // Re-send the message
      this.emit('message:retry', pending.message);
    }, this.config.retryDelay * pending.retries);
  }

  /**
   * Get pending message count
   */
  getPendingCount(): number {
    return this.pendingMessages.size;
  }

  /**
   * Get message from pending
   */
  getPendingMessage(messageId: string): Message<unknown> | null {
    return this.pendingMessages.get(messageId)?.message || null;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.handlers.clear();
    this.typeHandlers.clear();
  }

  /**
   * Cleanup expired pending messages
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, pending] of this.pendingMessages) {
      if (now - pending.queuedAt > this.config.messageTimeout) {
        this.pendingMessages.delete(id);
        this.emit('message:expired', pending.message);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Dispose of messaging system
   */
  dispose(): void {
    this.clearSubscriptions();
    this.pendingMessages.clear();
    this.messageQueue = [];
    this.removeAllListeners();
  }
}
