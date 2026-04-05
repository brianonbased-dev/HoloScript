/**
 * Messaging Trait
 * Sprint 4 Priority 6 - Agent Communication Channels
 *
 * HoloScript trait wrapper for entity-based messaging capabilities.
 */

import { TraitBehavior } from '../types';
import {
  Message,
  MessageAck,
  BroadcastMessage,
  MessageHandler,
  ChannelConfig,
  AgentChannel,
  MessagePriority,
} from './MessagingTypes';
import { ChannelManager } from './ChannelManager';
import { AgentMessaging, AgentMessagingConfig } from './AgentMessaging';

// =============================================================================
// MESSAGING TRAIT BEHAVIOR
// =============================================================================

export interface MessagingTraitBehavior extends TraitBehavior {
  // Channel operations
  createChannel: (participants: string[], config?: Partial<ChannelConfig>) => AgentChannel;
  joinChannel: (channelId: string) => boolean;
  leaveChannel: (channelId: string) => boolean;
  getChannels: () => AgentChannel[];

  // Messaging
  send: <T>(
    channelId: string,
    recipientId: string,
    type: string,
    payload: T,
    priority?: MessagePriority
  ) => Message<T> | null;
  broadcast: <T>(
    channelId: string,
    type: string,
    payload: T,
    priority?: MessagePriority
  ) => BroadcastMessage<T> | null;
  reply: <T>(originalMessage: Message<unknown>, type: string, payload: T) => Message<T> | null;

  // Subscriptions
  subscribe: <T>(channelId: string, handler: MessageHandler<T>) => () => void;
  subscribeToType: <T>(type: string, handler: MessageHandler<T>) => () => void;
  handleMessage: <T>(message: Message<T>) => MessageAck;

  // Encryption
  initializeEncryption: () => { publicKey: string; privateKey: string };
  getPublicKey: () => string | null;

  // Status
  getPendingCount: () => number;
}

// =============================================================================
// TRAIT DEFINITION
// =============================================================================

export interface MessagingTraitDefinition {
  traitId: 'messaging';
  config?: Partial<AgentMessagingConfig>;
}

// =============================================================================
// MESSAGING TRAIT FACTORY
// =============================================================================

/**
 * Creates a messaging trait for an entity
 */
export function createMessagingTrait(
  entityId: string,
  channelManager: ChannelManager,
  config: Partial<AgentMessagingConfig> = {}
): MessagingTraitBehavior {
  const messaging = new AgentMessaging(entityId, channelManager, config);

  return {
    traitId: 'messaging',
    name: 'MessagingTrait',
    enabled: true,
    // =========================================================================
    // CHANNEL OPERATIONS
    // =========================================================================

    createChannel(participants: string[], channelConfig?: Partial<ChannelConfig>): AgentChannel {
      return messaging.createChannel(participants, channelConfig);
    },

    joinChannel(channelId: string): boolean {
      return messaging.joinChannel(channelId);
    },

    leaveChannel(channelId: string): boolean {
      return messaging.leaveChannel(channelId);
    },

    getChannels(): AgentChannel[] {
      return messaging.getChannels();
    },

    // =========================================================================
    // MESSAGING
    // =========================================================================

    send<T>(
      channelId: string,
      recipientId: string,
      type: string,
      payload: T,
      priority: MessagePriority = 'normal'
    ): Message<T> | null {
      return messaging.send(channelId, recipientId, type, payload, priority);
    },

    broadcast<T>(
      channelId: string,
      type: string,
      payload: T,
      priority: MessagePriority = 'normal'
    ): BroadcastMessage<T> | null {
      return messaging.broadcast(channelId, type, payload, priority);
    },

    reply<T>(originalMessage: Message<unknown>, type: string, payload: T): Message<T> | null {
      return messaging.reply(originalMessage, type, payload);
    },

    // =========================================================================
    // SUBSCRIPTIONS
    // =========================================================================

    subscribe<T>(channelId: string, handler: MessageHandler<T>): () => void {
      return messaging.subscribe(channelId, handler);
    },

    subscribeToType<T>(type: string, handler: MessageHandler<T>): () => void {
      return messaging.subscribeToType(type, handler);
    },

    handleMessage<T>(message: Message<T>): MessageAck {
      return messaging.handleMessage(message);
    },

    // =========================================================================
    // ENCRYPTION
    // =========================================================================

    initializeEncryption(): { publicKey: string; privateKey: string } {
      return messaging.initializeEncryption();
    },

    getPublicKey(): string | null {
      return messaging.getPublicKey();
    },

    // =========================================================================
    // STATUS
    // =========================================================================

    getPendingCount(): number {
      return messaging.getPendingCount();
    },
  };
}

// =============================================================================
// HOLOSCRIPT TRAIT INTEGRATION
// =============================================================================

/**
 * Messaging trait for HoloScript entities
 *
 * @example HoloScript usage:
 * ```holoscript
 * trait Messaging {
 *   config: {
 *     maxRetries: 3,
 *     autoAck: true
 *   }
 * }
 *
 * on init {
 *   self.initializeEncryption()
 *   let channel = self.createChannel(["agent-1", "agent-2"], {
 *     name: "coordination",
 *     encryption: "aes-256"
 *   })
 * }
 *
 * on message(channel, type, payload) {
 *   log("Received {type}: {payload}")
 * }
 *
 * action sendUpdate(recipientId, data) {
 *   self.send(currentChannel, recipientId, "update", data)
 * }
 * ```
 */
export const MessagingTrait = {
  /** Trait identifier */
  traitId: 'messaging' as const,

  /**
   * Attach trait to entity
   */
  attach(
    entityId: string,
    channelManager: ChannelManager,
    config: Partial<AgentMessagingConfig> = {}
  ): MessagingTraitBehavior {
    return createMessagingTrait(entityId, channelManager, config);
  },

  /**
   * Detach trait from entity
   */
  detach(_trait: MessagingTraitBehavior): void {
    // Cleanup if needed
  },
};

// =============================================================================
// MESSAGING TRAIT MANAGER
// =============================================================================

/**
 * Manages messaging traits across multiple entities
 */
export class MessagingTraitManager {
  private channelManager: ChannelManager;
  private defaultConfig: Partial<AgentMessagingConfig>;
  private traits: Map<string, MessagingTraitBehavior> = new Map();

  constructor(channelManager?: ChannelManager, config: Partial<AgentMessagingConfig> = {}) {
    this.channelManager = channelManager || new ChannelManager();
    this.defaultConfig = config;
  }

  /**
   * Get or create messaging trait for entity
   */
  getOrCreate(entityId: string, config?: Partial<AgentMessagingConfig>): MessagingTraitBehavior {
    let trait = this.traits.get(entityId);
    if (!trait) {
      trait = createMessagingTrait(entityId, this.channelManager, {
        ...this.defaultConfig,
        ...config,
      });
      this.traits.set(entityId, trait);
    }
    return trait;
  }

  /**
   * Get trait for entity
   */
  get(entityId: string): MessagingTraitBehavior | undefined {
    return this.traits.get(entityId);
  }

  /**
   * Remove trait for entity
   */
  remove(entityId: string): void {
    const trait = this.traits.get(entityId);
    if (trait) {
      // Leave all channels
      for (const channel of trait.getChannels()) {
        trait.leaveChannel(channel.id);
      }
      this.traits.delete(entityId);
    }
  }

  /**
   * Get channel manager
   */
  getChannelManager(): ChannelManager {
    return this.channelManager;
  }

  /**
   * Get all traits
   */
  getAllTraits(): Map<string, MessagingTraitBehavior> {
    return new Map(this.traits);
  }
}
