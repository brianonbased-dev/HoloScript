/**
 * GossipProtocol - Epidemic-style message propagation
 * HoloScript v3.2 - Autonomous Agent Swarms
 *
 * Implements gossip-based message spreading for decentralized swarms
 */

/**
 * Gossip message wrapper
 */
export interface IGossipMessage {
  id: string;
  originId: string;
  content: unknown;
  type: 'data' | 'heartbeat' | 'membership' | 'custom';
  version: number;
  createdAt: number;
  ttl: number;
  hops: number;
  path: string[];
  signature?: string;
}

/**
 * Peer information
 */
export interface IGossipPeer {
  id: string;
  address: string;
  lastSeen: number;
  failureCount: number;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Gossip protocol configuration
 */
export interface IGossipConfig {
  /** Number of peers to gossip to per round */
  fanout: number;
  /** Gossip interval in milliseconds */
  gossipInterval: number;
  /** Maximum TTL for messages */
  maxTTL: number;
  /** Maximum hops per message */
  maxHops: number;
  /** Failure threshold before marking peer inactive */
  failureThreshold: number;
  /** Time before peer considered stale */
  peerTimeout: number;
  /** Whether to deduplicate messages */
  deduplicate: boolean;
}

/**
 * Message handler for gossip
 */
export type GossipHandler = (message: IGossipMessage, from: string) => void | Promise<void>;

/**
 * Peer selector strategy
 */
export type PeerSelector = (
  peers: IGossipPeer[],
  count: number,
  exclude?: string[]
) => IGossipPeer[];

/**
 * GossipProtocol - Epidemic-style message propagation
 */
export class GossipProtocol {
  readonly nodeId: string;

  private peers: Map<string, IGossipPeer> = new Map();
  private seenMessages: Map<string, number> = new Map();
  private messageQueue: IGossipMessage[] = [];
  private handlers: Map<string, GossipHandler[]> = new Map();
  private config: IGossipConfig;
  private running = false;
  private gossipTimer: ReturnType<typeof setInterval> | null = null;
  private peerSelector: PeerSelector;
  private nextMsgId = 1;

  // Statistics
  private stats = {
    messagesSent: 0,
    messagesReceived: 0,
    messagesDropped: 0,
    gossipRounds: 0,
    duplicatesIgnored: 0,
  };

  constructor(nodeId: string, config?: Partial<IGossipConfig>) {
    this.nodeId = nodeId;
    this.config = {
      fanout: 3,
      gossipInterval: 1000,
      maxTTL: 30000,
      maxHops: 10,
      failureThreshold: 3,
      peerTimeout: 30000,
      deduplicate: true,
      ...config,
    };

    // Default random peer selection
    this.peerSelector = this.randomPeerSelection.bind(this);
  }

  /**
   * Start the gossip protocol
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.gossipTimer = setInterval(() => {
      this.gossipRound();
    }, this.config.gossipInterval);
  }

  /**
   * Stop the gossip protocol
   */
  stop(): void {
    this.running = false;
    if (this.gossipTimer) {
      clearInterval(this.gossipTimer);
      this.gossipTimer = null;
    }
  }

  /**
   * Check if protocol is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Add a peer
   */
  addPeer(id: string, address: string, metadata?: Record<string, unknown>): void {
    if (id === this.nodeId) return;

    this.peers.set(id, {
      id,
      address,
      lastSeen: Date.now(),
      failureCount: 0,
      isActive: true,
      metadata,
    });
  }

  /**
   * Remove a peer
   */
  removePeer(id: string): boolean {
    return this.peers.delete(id);
  }

  /**
   * Get a peer
   */
  getPeer(id: string): IGossipPeer | undefined {
    return this.peers.get(id);
  }

  /**
   * Get all active peers
   */
  getActivePeers(): IGossipPeer[] {
    return [...this.peers.values()].filter((p) => p.isActive);
  }

  /**
   * Get all peers
   */
  getAllPeers(): IGossipPeer[] {
    return [...this.peers.values()];
  }

  /**
   * Publish a message to the gossip network
   */
  publish(
    content: unknown,
    type: IGossipMessage['type'] = 'data',
    options: { ttl?: number; signature?: string } = {}
  ): string {
    const messageId = `gossip-${this.nodeId}-${this.nextMsgId++}-${Date.now()}`;

    const message: IGossipMessage = {
      id: messageId,
      originId: this.nodeId,
      content,
      type,
      version: 1,
      createdAt: Date.now(),
      ttl: options.ttl ?? this.config.maxTTL,
      hops: 0,
      path: [this.nodeId],
      signature: options.signature,
    };

    // Add to queue for gossip
    this.messageQueue.push(message);
    this.seenMessages.set(messageId, Date.now());

    // Also emit locally
    this.emitToHandlers(message, this.nodeId);

    this.stats.messagesSent++;
    return messageId;
  }

  /**
   * Receive a message from a peer
   */
  async receive(message: IGossipMessage, fromPeerId: string): Promise<boolean> {
    // Update peer last seen
    const peer = this.peers.get(fromPeerId);
    if (peer) {
      peer.lastSeen = Date.now();
      peer.failureCount = 0;
      peer.isActive = true;
    }

    // Check if we've seen this message
    if (this.config.deduplicate && this.seenMessages.has(message.id)) {
      this.stats.duplicatesIgnored++;
      return false;
    }

    // Check TTL
    if (Date.now() - message.createdAt > message.ttl) {
      this.stats.messagesDropped++;
      return false;
    }

    // Check hop limit
    if (message.hops >= this.config.maxHops) {
      this.stats.messagesDropped++;
      return false;
    }

    // Mark as seen
    this.seenMessages.set(message.id, Date.now());
    this.stats.messagesReceived++;

    // Emit to handlers
    await this.emitToHandlers(message, fromPeerId);

    // Prepare for re-gossip
    const forwardMessage: IGossipMessage = {
      ...message,
      hops: message.hops + 1,
      path: [...message.path, this.nodeId],
    };

    // Add to queue for further gossip
    this.messageQueue.push(forwardMessage);

    return true;
  }

  /**
   * Subscribe to message types
   */
  subscribe(type: IGossipMessage['type'] | '*', handler: GossipHandler): () => void {
    const key = type === '*' ? '*' : type;

    if (!this.handlers.has(key)) {
      this.handlers.set(key, []);
    }
    this.handlers.get(key)!.push(handler);

    return () => {
      const handlers = this.handlers.get(key);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }

  /**
   * Set custom peer selector
   */
  setPeerSelector(selector: PeerSelector): void {
    this.peerSelector = selector;
  }

  /**
   * Perform a gossip round
   */
  async gossipRound(): Promise<void> {
    if (!this.running) return;

    this.stats.gossipRounds++;

    // Clean old seen messages
    this.cleanSeenMessages();

    // Clean stale peers
    this.cleanStalePeers();

    // Get messages to gossip
    const messages = this.messageQueue.splice(0);
    if (messages.length === 0) return;

    // Select peers for gossip
    const activePeers = this.getActivePeers();
    if (activePeers.length === 0) return;

    const selectedPeers = this.peerSelector(
      activePeers,
      Math.min(this.config.fanout, activePeers.length)
    );

    // Gossip each message to selected peers
    for (const message of messages) {
      // Exclude peers already in the path
      const validPeers = selectedPeers.filter((p) => !message.path.includes(p.id));

      for (const peer of validPeers) {
        try {
          await this.sendToPeer(peer, message);
        } catch {
          // Record failure
          peer.failureCount++;
          if (peer.failureCount >= this.config.failureThreshold) {
            peer.isActive = false;
          }
        }
      }
    }
  }

  /**
   * Send a message to a peer (override for actual network)
   */
  protected async sendToPeer(_peer: IGossipPeer, _message: IGossipMessage): Promise<void> {
    // Override this method for actual network transport
    // Default implementation does nothing (for testing)
  }

  /**
   * Emit message to handlers
   */
  private async emitToHandlers(message: IGossipMessage, from: string): Promise<void> {
    // Emit to type-specific handlers
    const typeHandlers = this.handlers.get(message.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          await handler(message, from);
        } catch {
          // Continue on handler error
        }
      }
    }

    // Emit to wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          await handler(message, from);
        } catch {
          // Continue on handler error
        }
      }
    }
  }

  /**
   * Random peer selection
   */
  private randomPeerSelection(
    peers: IGossipPeer[],
    count: number,
    exclude: string[] = []
  ): IGossipPeer[] {
    const available = peers.filter((p) => !exclude.includes(p.id));
    const selected: IGossipPeer[] = [];

    while (selected.length < count && available.length > 0) {
      const idx = Math.floor(Math.random() * available.length);
      selected.push(available.splice(idx, 1)[0]);
    }

    return selected;
  }

  /**
   * Clean old seen messages
   */
  private cleanSeenMessages(): void {
    const now = Date.now();
    for (const [id, timestamp] of this.seenMessages) {
      if (now - timestamp > this.config.maxTTL) {
        this.seenMessages.delete(id);
      }
    }
  }

  /**
   * Clean stale peers
   */
  private cleanStalePeers(): void {
    const now = Date.now();
    for (const peer of this.peers.values()) {
      if (now - peer.lastSeen > this.config.peerTimeout) {
        peer.isActive = false;
      }
    }
  }

  /**
   * Send a heartbeat
   */
  publishHeartbeat(metadata?: Record<string, unknown>): string {
    return this.publish({ type: 'heartbeat', nodeId: this.nodeId, ...metadata }, 'heartbeat');
  }

  /**
   * Announce membership change
   */
  publishMembership(action: 'join' | 'leave', metadata?: Record<string, unknown>): string {
    return this.publish({ action, nodeId: this.nodeId, ...metadata }, 'membership');
  }

  /**
   * Get statistics
   */
  getStats(): typeof this.stats & {
    peerCount: number;
    activePeerCount: number;
    queueSize: number;
    seenCount: number;
  } {
    return {
      ...this.stats,
      peerCount: this.peers.size,
      activePeerCount: this.getActivePeers().length,
      queueSize: this.messageQueue.length,
      seenCount: this.seenMessages.size,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      messagesDropped: 0,
      gossipRounds: 0,
      duplicatesIgnored: 0,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): IGossipConfig {
    return { ...this.config };
  }
}

/**
 * Anti-entropy sync for eventual consistency
 */
export class AntiEntropySync {
  private nodeId: string;
  private protocol: GossipProtocol;
  private dataStore: Map<string, { value: unknown; version: number; timestamp: number }> =
    new Map();

  constructor(nodeId: string, protocol: GossipProtocol) {
    this.nodeId = nodeId;
    this.protocol = protocol;

    // Subscribe to data messages
    this.protocol.subscribe('data', (msg) => {
      const data = msg.content as { key: string; value: unknown; version: number };
      if (data.key && data.version !== undefined) {
        this.handleSync(data.key, data.value, data.version, msg.createdAt);
      }
    });
  }

  /**
   * Set a value (stores locally and gossips)
   */
  set(key: string, value: unknown): void {
    const existing = this.dataStore.get(key);
    const version = existing ? existing.version + 1 : 1;
    const timestamp = Date.now();

    this.dataStore.set(key, { value, version, timestamp });

    // Gossip the update
    this.protocol.publish({ key, value, version }, 'data');
  }

  /**
   * Get a value
   */
  get(key: string): unknown {
    return this.dataStore.get(key)?.value;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return [...this.dataStore.keys()];
  }

  /**
   * Handle sync from gossip
   */
  private handleSync(key: string, value: unknown, version: number, timestamp: number): void {
    const existing = this.dataStore.get(key);

    // LWW (Last Writer Wins) with version tiebreaker
    if (
      !existing ||
      version > existing.version ||
      (version === existing.version && timestamp > existing.timestamp)
    ) {
      this.dataStore.set(key, { value, version, timestamp });
    }
  }

  /**
   * Get data snapshot
   */
  getSnapshot(): Map<string, unknown> {
    const snapshot = new Map<string, unknown>();
    for (const [key, data] of this.dataStore) {
      snapshot.set(key, data.value);
    }
    return snapshot;
  }
}
