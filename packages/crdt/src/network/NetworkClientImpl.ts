/**
 * Network Client Implementation
 *
 * Client for networked state synchronization with connection management,
 * messaging, and peer discovery.
 *
 * @module network
 */

import {
  INetworkClient,
  IConnectionConfig,
  IPeerInfo,
  INetworkMessage,
  INetworkStats,
  INetworkEvent,
  ConnectionState,
  MessageTarget,
  MessageHandler,
  NetworkEventType,
  NetworkEventCallback,
  CONNECTION_DEFAULTS,
  generateMessageId,
  generatePeerId,
  createPeerInfo,
  isMessageForPeer,
} from './NetworkTypes';

/**
 * Network channel
 */
interface IChannel {
  name: string;
  ordered: boolean;
  reliable: boolean;
  handlers: Map<string, Set<MessageHandler>>;
}

/**
 * Network client implementation
 */
export class NetworkClientImpl implements INetworkClient {
  private _state: ConnectionState = 'disconnected';
  private _peerId: string = '';
  private _isHost: boolean = false;
  private _config: Required<IConnectionConfig>;

  private peers: Map<string, IPeerInfo> = new Map();
  private channels: Map<string, IChannel> = new Map();
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private eventListeners: Map<NetworkEventType, Set<NetworkEventCallback>> = new Map();

  private messageQueue: INetworkMessage[] = [];
  private reconnectAttempt: number = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private stats: INetworkStats = {
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    packetsLost: 0,
    averageLatency: 0,
    peakLatency: 0,
    jitter: 0,
  };

  constructor(config: Partial<IConnectionConfig> = {}) {
    this._config = { ...CONNECTION_DEFAULTS, ...config };
    this._peerId = this._config.peerId || generatePeerId();
  }

  // ==========================================================================
  // Properties
  // ==========================================================================

  public get state(): ConnectionState {
    return this._state;
  }

  public get peerId(): string {
    return this._peerId;
  }

  public get isHost(): boolean {
    return this._isHost;
  }

  // ==========================================================================
  // Connection
  // ==========================================================================

  public async connect(config: IConnectionConfig = {}): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      return;
    }

    this._config = { ...this._config, ...config };
    this._state = 'connecting';

    try {
      // Simulate connection establishment
      await this.establishConnection();

      // Create local peer
      const localPeer = createPeerInfo(this._peerId, undefined, this._isHost, true);
      this.peers.set(this._peerId, localPeer);

      // Start heartbeat
      this.startHeartbeat();

      this._state = 'connected';
      this.reconnectAttempt = 0;

      this.emitEvent({ type: 'connected', timestamp: Date.now() });
    } catch (_error) {
      this._state = 'error';
      const error = _error instanceof Error ? _error : new Error(String(_error));
      this.emitEvent({ type: 'error', timestamp: Date.now(), error });
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this._state === 'disconnected') {
      return;
    }

    this.stopHeartbeat();
    this.peers.clear();
    this.messageQueue = [];
    this._state = 'disconnected';

    this.emitEvent({ type: 'disconnected', timestamp: Date.now() });
  }

  public async reconnect(): Promise<void> {
    if (this._state === 'connected') {
      return;
    }

    if (this.reconnectAttempt >= this._config.reconnectAttempts) {
      this._state = 'error';
      this.emitEvent({
        type: 'error',
        timestamp: Date.now(),
        error: new Error('Max reconnect attempts reached'),
      });
      return;
    }

    this._state = 'reconnecting';
    this.reconnectAttempt++;

    await new Promise((resolve) => setTimeout(resolve, this._config.reconnectDelay));

    try {
      await this.connect();
    } catch {
      // Retry or give up
      if (this.reconnectAttempt < this._config.reconnectAttempts) {
        await this.reconnect();
      }
    }
  }

  private async establishConnection(): Promise<void> {
    // Simulate async connection
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (this._config.url) {
          // Determine if we're the host (first to connect)
          this._isHost = this.peers.size === 0;
          resolve();
        } else {
          reject(new Error('No connection URL provided'));
        }
      }, 10);
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      // Send heartbeat to all peers
      this.broadcast('__heartbeat__', { timestamp: Date.now() });

      // Check for stale peers
      const now = Date.now();
      const staleThreshold = this._config.heartbeatInterval * 3;

      this.peers.forEach((peer, id) => {
        if (!peer.isLocal && now - peer.lastSeen > staleThreshold) {
          this.peers.delete(id);
          this.emitEvent({ type: 'peerLeft', timestamp: now, peerId: id });
        }
      });
    }, this._config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ==========================================================================
  // Peers
  // ==========================================================================

  public getPeers(): IPeerInfo[] {
    return Array.from(this.peers.values()).filter((p) => !p.isLocal);
  }

  public getPeer(id: string): IPeerInfo | undefined {
    return this.peers.get(id);
  }

  public getLocalPeer(): IPeerInfo {
    return this.peers.get(this._peerId)!;
  }

  public setPeerMetadata(metadata: Record<string, unknown>): void {
    const local = this.peers.get(this._peerId);
    if (local) {
      local.metadata = { ...local.metadata, ...metadata };
    }
  }

  /**
   * Add a peer (for simulation/testing)
   */
  public addPeer(peer: IPeerInfo): void {
    this.peers.set(peer.id, peer);
    this.emitEvent({ type: 'peerJoined', timestamp: Date.now(), peerId: peer.id });
  }

  /**
   * Remove a peer (for simulation/testing)
   */
  public removePeer(peerId: string): void {
    if (this.peers.has(peerId)) {
      this.peers.delete(peerId);
      this.emitEvent({ type: 'peerLeft', timestamp: Date.now(), peerId });
    }
  }

  // ==========================================================================
  // Messaging
  // ==========================================================================

  public send<T>(
    type: string,
    payload: T,
    target: MessageTarget = 'all',
    options: Partial<INetworkMessage<T>> = {}
  ): void {
    if (this._state !== 'connected') {
      return;
    }

    const message: INetworkMessage<T> = {
      id: generateMessageId(),
      type,
      payload,
      senderId: this._peerId,
      targetId: target,
      timestamp: Date.now(),
      delivery: 'reliable',
      ...options,
    };

    this.processOutgoingMessage(message);
  }

  public broadcast<T>(type: string, payload: T, options: Partial<INetworkMessage<T>> = {}): void {
    this.send(type, payload, 'all', options);
  }

  public on<T>(type: string, handler: MessageHandler<T>): void {
    let handlers = this.messageHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.messageHandlers.set(type, handlers);
    }
    handlers.add(handler as MessageHandler);
  }

  public off<T>(type: string, handler: MessageHandler<T>): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler as MessageHandler);
    }
  }

  private processOutgoingMessage<T>(message: INetworkMessage<T>): void {
    // Update stats
    const msgSize = JSON.stringify(message).length;
    this.stats.bytesSent += msgSize;
    this.stats.messagesSent++;

    // Queue for delivery simulation
    this.messageQueue.push(message as INetworkMessage);

    // Simulate delivery to local handlers (for same-client testing)
    setTimeout(() => this.deliverMessage(message as INetworkMessage), 0);
  }

  private deliverMessage(message: INetworkMessage): void {
    // Check if message is for us
    if (!isMessageForPeer(message, this._peerId, this._isHost)) {
      return;
    }

    // Update stats
    const msgSize = JSON.stringify(message).length;
    this.stats.bytesReceived += msgSize;
    this.stats.messagesReceived++;

    // Handle heartbeat
    if (message.type === '__heartbeat__') {
      const peer = this.peers.get(message.senderId);
      if (peer) {
        peer.lastSeen = Date.now();
        const latency = Date.now() - message.timestamp;
        peer.latency = latency;
        this.updateLatencyStats(latency);
      }
      return;
    }

    // Emit message event
    this.emitEvent({
      type: 'message',
      timestamp: Date.now(),
      data: message,
      peerId: message.senderId,
    });

    // Call registered handlers
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }
  }

  private updateLatencyStats(latency: number): void {
    // Update peak
    if (latency > this.stats.peakLatency) {
      this.stats.peakLatency = latency;
    }

    // Update average (exponential moving average)
    const alpha = 0.1;
    this.stats.averageLatency = this.stats.averageLatency * (1 - alpha) + latency * alpha;

    // Update jitter
    const jitterDiff = Math.abs(latency - this.stats.averageLatency);
    this.stats.jitter = this.stats.jitter * (1 - alpha) + jitterDiff * alpha;

    // Emit latency event
    this.emitEvent({
      type: 'latencyUpdated',
      timestamp: Date.now(),
      data: { latency, average: this.stats.averageLatency },
    });
  }

  /**
   * Simulate receiving a message from network
   */
  public simulateIncomingMessage<T>(message: INetworkMessage<T>): void {
    this.deliverMessage(message as INetworkMessage);
  }

  // ==========================================================================
  // Channels
  // ==========================================================================

  public createChannel(name: string, config: { ordered?: boolean; reliable?: boolean } = {}): void {
    if (this.channels.has(name)) {
      return;
    }

    this.channels.set(name, {
      name,
      ordered: config.ordered ?? true,
      reliable: config.reliable ?? true,
      handlers: new Map(),
    });
  }

  public closeChannel(name: string): void {
    this.channels.delete(name);
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  public addEventListener(event: NetworkEventType, callback: NetworkEventCallback): void {
    let listeners = this.eventListeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.eventListeners.set(event, listeners);
    }
    listeners.add(callback);
  }

  public removeEventListener(event: NetworkEventType, callback: NetworkEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emitEvent(event: INetworkEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((callback) => callback(event));
    }
  }

  // ==========================================================================
  // Stats
  // ==========================================================================

  public getStats(): INetworkStats {
    return { ...this.stats };
  }

  public getLatencyTo(peerId: string): number {
    const peer = this.peers.get(peerId);
    return peer ? peer.latency : -1;
  }

  /**
   * Reset stats
   */
  public resetStats(): void {
    this.stats = {
      bytesSent: 0,
      bytesReceived: 0,
      messagesSent: 0,
      messagesReceived: 0,
      packetsLost: 0,
      averageLatency: 0,
      peakLatency: 0,
      jitter: 0,
    };
  }
}

/**
 * Create a network client
 */
export function createNetworkClient(config?: Partial<IConnectionConfig>): INetworkClient {
  return new NetworkClientImpl(config);
}
