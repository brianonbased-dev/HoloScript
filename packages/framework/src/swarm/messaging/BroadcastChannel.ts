/**
 * BroadcastChannel - Named messaging channels for swarm groups
 * HoloScript v3.2 - Autonomous Agent Swarms
 *
 * Provides named channels for targeted group communication
 */

/**
 * Channel message
 */
export interface IChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  content: unknown;
  timestamp: number;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Channel subscriber info
 */
export interface IChannelSubscriber {
  id: string;
  agentId: string;
  joinedAt: number;
  role: 'publisher' | 'subscriber' | 'both';
  lastActivity: number;
}

/**
 * Channel configuration
 */
export interface IChannelConfig {
  /** Maximum subscribers per channel */
  maxSubscribers: number;
  /** Message history size */
  historySize: number;
  /** Allow replays */
  allowReplay: boolean;
  /** Require acknowledgment */
  requireAck: boolean;
  /** Message TTL in milliseconds */
  messageTTL: number;
}

/**
 * Message handler type
 */
export type MessageHandler = (message: IChannelMessage) => void | Promise<void>;

/**
 * BroadcastChannel - Named channel for group messaging
 */
export class BroadcastChannel {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;

  private subscribers: Map<string, IChannelSubscriber> = new Map();
  private handlers: Map<string, MessageHandler> = new Map();
  private history: IChannelMessage[] = [];
  private config: IChannelConfig;
  private nextMsgId = 1;
  private pendingAcks: Map<string, Set<string>> = new Map();

  constructor(id: string, name: string, config?: Partial<IChannelConfig>) {
    this.id = id;
    this.name = name;
    this.createdAt = Date.now();
    this.config = {
      maxSubscribers: 1000,
      historySize: 100,
      allowReplay: true,
      requireAck: false,
      messageTTL: 60000,
      ...config,
    };
  }

  /**
   * Subscribe an agent to the channel
   */
  subscribe(
    agentId: string,
    handler: MessageHandler,
    options: { role?: 'publisher' | 'subscriber' | 'both' } = {}
  ): string {
    if (this.subscribers.size >= this.config.maxSubscribers) {
      throw new Error(`Channel ${this.name} has reached maximum subscribers`);
    }

    const subscriberId = `sub-${agentId}-${Date.now()}`;

    const subscriber: IChannelSubscriber = {
      id: subscriberId,
      agentId,
      joinedAt: Date.now(),
      role: options.role ?? 'both',
      lastActivity: Date.now(),
    };

    this.subscribers.set(subscriberId, subscriber);
    this.handlers.set(subscriberId, handler);

    return subscriberId;
  }

  /**
   * Unsubscribe from the channel
   */
  unsubscribe(subscriberId: string): boolean {
    const removed = this.subscribers.delete(subscriberId);
    this.handlers.delete(subscriberId);
    return removed;
  }

  /**
   * Broadcast a message to all subscribers
   */
  async broadcast(
    senderId: string,
    content: unknown,
    options: {
      replyTo?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    const messageId = `msg-${this.nextMsgId++}-${Date.now()}`;

    const message: IChannelMessage = {
      id: messageId,
      channelId: this.id,
      senderId,
      content,
      timestamp: Date.now(),
      replyTo: options.replyTo,
      metadata: options.metadata,
    };

    // Add to history
    this.addToHistory(message);

    // Track pending acks if required
    if (this.config.requireAck) {
      const pendingAgents = new Set<string>();
      for (const sub of this.subscribers.values()) {
        if (sub.agentId !== senderId) {
          pendingAgents.add(sub.agentId);
        }
      }
      this.pendingAcks.set(messageId, pendingAgents);
    }

    // Deliver to all subscribers
    const deliveryPromises: Promise<void>[] = [];

    for (const [subId, sub] of this.subscribers) {
      if (sub.role === 'publisher') continue; // Publishers don't receive

      const handler = this.handlers.get(subId);
      if (handler) {
        sub.lastActivity = Date.now();
        deliveryPromises.push(
          Promise.resolve(handler(message)).catch(() => {
            // Handler error - log and continue
          })
        );
      }
    }

    await Promise.all(deliveryPromises);

    return messageId;
  }

  /**
   * Send a direct message to specific subscriber
   */
  async sendDirect(
    senderId: string,
    targetAgentId: string,
    content: unknown,
    options: {
      replyTo?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string | null> {
    const messageId = `msg-${this.nextMsgId++}-${Date.now()}`;

    const message: IChannelMessage = {
      id: messageId,
      channelId: this.id,
      senderId,
      content,
      timestamp: Date.now(),
      replyTo: options.replyTo,
      metadata: { ...options.metadata, directTo: targetAgentId },
    };

    // Find target subscriber
    let delivered = false;
    for (const [subId, sub] of this.subscribers) {
      if (sub.agentId === targetAgentId && sub.role !== 'publisher') {
        const handler = this.handlers.get(subId);
        if (handler) {
          sub.lastActivity = Date.now();
          await handler(message);
          delivered = true;
        }
      }
    }

    return delivered ? messageId : null;
  }

  /**
   * Acknowledge a message
   */
  acknowledge(messageId: string, agentId: string): boolean {
    const pending = this.pendingAcks.get(messageId);
    if (!pending) return false;

    pending.delete(agentId);

    if (pending.size === 0) {
      this.pendingAcks.delete(messageId);
    }

    return true;
  }

  /**
   * Check if message is fully acknowledged
   */
  isFullyAcknowledged(messageId: string): boolean {
    return !this.pendingAcks.has(messageId);
  }

  /**
   * Get pending acknowledgments for a message
   */
  getPendingAcks(messageId: string): string[] {
    const pending = this.pendingAcks.get(messageId);
    return pending ? [...pending] : [];
  }

  /**
   * Add message to history
   */
  private addToHistory(message: IChannelMessage): void {
    this.history.push(message);

    // Trim to size
    while (this.history.length > this.config.historySize) {
      this.history.shift();
    }

    // Remove expired messages
    const now = Date.now();
    this.history = this.history.filter((msg) => now - msg.timestamp < this.config.messageTTL);
  }

  /**
   * Get message history
   */
  getHistory(
    options: {
      limit?: number;
      since?: number;
      senderId?: string;
    } = {}
  ): IChannelMessage[] {
    if (!this.config.allowReplay) {
      return [];
    }

    let result = [...this.history];

    if (options.since) {
      result = result.filter((m) => m.timestamp > options.since!);
    }

    if (options.senderId) {
      result = result.filter((m) => m.senderId === options.senderId);
    }

    if (options.limit) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  /**
   * Replay history to a subscriber
   */
  async replayHistory(
    subscriberId: string,
    options: { since?: number; limit?: number } = {}
  ): Promise<number> {
    if (!this.config.allowReplay) {
      return 0;
    }

    const handler = this.handlers.get(subscriberId);
    if (!handler) return 0;

    const messages = this.getHistory(options);
    let replayed = 0;

    for (const message of messages) {
      try {
        await handler(message);
        replayed++;
      } catch {
        // Continue on error
      }
    }

    return replayed;
  }

  /**
   * Get all subscribers
   */
  getSubscribers(): IChannelSubscriber[] {
    return [...this.subscribers.values()];
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Check if agent is subscribed
   */
  isSubscribed(agentId: string): boolean {
    for (const sub of this.subscribers.values()) {
      if (sub.agentId === agentId) return true;
    }
    return false;
  }

  /**
   * Get channel statistics
   */
  getStats(): {
    subscriberCount: number;
    historySize: number;
    pendingAckCount: number;
    oldestMessage: number | null;
    newestMessage: number | null;
  } {
    return {
      subscriberCount: this.subscribers.size,
      historySize: this.history.length,
      pendingAckCount: this.pendingAcks.size,
      oldestMessage: this.history.length > 0 ? this.history[0].timestamp : null,
      newestMessage:
        this.history.length > 0 ? this.history[this.history.length - 1].timestamp : null,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): IChannelConfig {
    return { ...this.config };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
  }
}

/**
 * ChannelManager - Manages multiple broadcast channels
 */
export class ChannelManager {
  private channels: Map<string, BroadcastChannel> = new Map();
  private agentChannels: Map<string, Set<string>> = new Map();
  private nextId = 1;

  /**
   * Create a new channel
   */
  createChannel(name: string, config?: Partial<IChannelConfig>): BroadcastChannel {
    const id = `ch-${this.nextId++}-${Date.now()}`;
    const channel = new BroadcastChannel(id, name, config);
    this.channels.set(id, channel);
    return channel;
  }

  /**
   * Get a channel by ID
   */
  getChannel(channelId: string): BroadcastChannel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Get channel by name
   */
  getChannelByName(name: string): BroadcastChannel | undefined {
    for (const channel of this.channels.values()) {
      if (channel.name === name) return channel;
    }
    return undefined;
  }

  /**
   * Delete a channel
   */
  deleteChannel(channelId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    // Untrack agents
    for (const sub of channel.getSubscribers()) {
      const agentChannelSet = this.agentChannels.get(sub.agentId);
      if (agentChannelSet) {
        agentChannelSet.delete(channelId);
      }
    }

    return this.channels.delete(channelId);
  }

  /**
   * Get all channels
   */
  getAllChannels(): BroadcastChannel[] {
    return [...this.channels.values()];
  }

  /**
   * Subscribe agent to channel
   */
  subscribeAgent(
    agentId: string,
    channelId: string,
    handler: MessageHandler,
    options?: { role?: 'publisher' | 'subscriber' | 'both' }
  ): string {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const subscriberId = channel.subscribe(agentId, handler, options);

    // Track agent channels
    if (!this.agentChannels.has(agentId)) {
      this.agentChannels.set(agentId, new Set());
    }
    this.agentChannels.get(agentId)!.add(channelId);

    return subscriberId;
  }

  /**
   * Get channels an agent is subscribed to
   */
  getAgentChannels(agentId: string): BroadcastChannel[] {
    const channelIds = this.agentChannels.get(agentId);
    if (!channelIds) return [];

    return [...channelIds]
      .map((id) => this.channels.get(id))
      .filter((c): c is BroadcastChannel => c !== undefined);
  }

  /**
   * Broadcast to multiple channels
   */
  async multicast(
    channelIds: string[],
    senderId: string,
    content: unknown,
    options?: { metadata?: Record<string, unknown> }
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const channelId of channelIds) {
      const channel = this.channels.get(channelId);
      if (channel) {
        const msgId = await channel.broadcast(senderId, content, options);
        results.set(channelId, msgId);
      }
    }

    return results;
  }

  /**
   * Get channel count
   */
  getChannelCount(): number {
    return this.channels.size;
  }
}
