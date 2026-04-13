/**
 * @holoscript/core Streaming Protocol
 *
 * Real-time streaming protocol for asset delivery, entity state synchronization,
 * and world updates between HoloScript clients and Hololand servers.
 */

// ============================================================================
// Protocol Constants
// ============================================================================

export const PROTOCOL_VERSION = '1.0.0';
export const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB
export const MAX_CHUNK_SIZE = 16 * 1024; // 16KB
export const HEARTBEAT_INTERVAL = 5000; // 5 seconds
export const TIMEOUT_INTERVAL = 15000; // 15 seconds

// ============================================================================
// Message Types
// ============================================================================

export type MessageType =
  // Connection
  | 'handshake'
  | 'handshake_ack'
  | 'heartbeat'
  | 'heartbeat_ack'
  | 'disconnect'

  // World
  | 'world_join'
  | 'world_leave'
  | 'world_state'
  | 'world_update'

  // Entity
  | 'entity_spawn'
  | 'entity_despawn'
  | 'entity_update'
  | 'entity_batch_update'
  | 'entity_rpc'

  // Asset
  | 'asset_request'
  | 'asset_response'
  | 'asset_chunk'
  | 'asset_complete'
  | 'asset_error'

  // Player
  | 'player_join'
  | 'player_leave'
  | 'player_update'
  | 'player_input'

  // Voice/Chat
  | 'voice_data'
  | 'chat_message'

  // Internal Events
  | 'error'
  | 'close'

  // Custom
  | 'custom';

// ============================================================================
// Base Message
// ============================================================================

export interface StreamMessage {
  /** Message type */
  type: MessageType;

  /** Sequence number */
  seq: number;

  /** Timestamp (ms since epoch) */
  timestamp: number;

  /** Channel/topic */
  channel?: string;

  /** Acknowledgment required? */
  reliable: boolean;

  /** Priority (0-255, higher = more urgent) */
  priority: number;

  /** Message payload */
  payload: unknown;
}

// ============================================================================
// Connection Messages
// ============================================================================

export interface HandshakeMessage extends StreamMessage {
  type: 'handshake';
  payload: {
    protocolVersion: string;
    clientId: string;
    clientVersion: string;
    capabilities: string[];
    compression: 'none' | 'gzip' | 'lz4';
    encryption: 'none' | 'aes256';
  };
}

export interface HandshakeAckMessage extends StreamMessage {
  type: 'handshake_ack';
  payload: {
    sessionId: string;
    serverId: string;
    serverTime: number;
    maxMessageSize: number;
    compressionAccepted: string;
    encryptionAccepted: string;
  };
}

export interface HeartbeatMessage extends StreamMessage {
  type: 'heartbeat';
  payload: {
    clientTime: number;
    lastAckSeq: number;
  };
}

export interface HeartbeatAckMessage extends StreamMessage {
  type: 'heartbeat_ack';
  payload: {
    serverTime: number;
    latency: number;
  };
}

// ============================================================================
// World Messages
// ============================================================================

export interface WorldJoinMessage extends StreamMessage {
  type: 'world_join';
  payload: {
    worldId: string;
    spawnPoint?: string;
    playerData?: Record<string, unknown>;
  };
}

export interface WorldStateMessage extends StreamMessage {
  type: 'world_state';
  payload: {
    worldId: string;
    entities: EntityState[];
    players: PlayerState[];
    environment: Record<string, unknown>;
    serverTime: number;
  };
}

export interface WorldUpdateMessage extends StreamMessage {
  type: 'world_update';
  payload: {
    deltaTime: number;
    entities: EntityDelta[];
    events: WorldEvent[];
  };
}

// ============================================================================
// Entity Messages
// ============================================================================

export interface EntityState {
  /** Entity ID */
  id: string;

  /** Entity type/prefab */
  type: string;

  /** Owner ID (null = server-owned) */
  ownerId: string | null;

  /** Transform */
  transform: {
    position: [number, number, number];
    rotation: { x: number; y: number; z: number; w: number };
    scale: { x: number; y: number; z: number };
  };

  /** Component states */
  components: Record<string, unknown>;

  /** Custom properties */
  properties: Record<string, unknown>;

  /** Is entity active? */
  active: boolean;

  /** Last update timestamp */
  lastUpdate: number;
}

export interface EntityDelta {
  /** Entity ID */
  id: string;

  /** Changed fields (dot notation paths) */
  changes: Record<string, unknown>;

  /** Timestamp */
  timestamp: number;
}

export interface EntitySpawnMessage extends StreamMessage {
  type: 'entity_spawn';
  payload: {
    entity: EntityState;
    spawnReason: 'initial' | 'created' | 'streamed';
  };
}

export interface EntityDespawnMessage extends StreamMessage {
  type: 'entity_despawn';
  payload: {
    entityId: string;
    despawnReason: 'destroyed' | 'streamed_out' | 'owner_left';
  };
}

export interface EntityUpdateMessage extends StreamMessage {
  type: 'entity_update';
  payload: EntityDelta;
}

export interface EntityBatchUpdateMessage extends StreamMessage {
  type: 'entity_batch_update';
  payload: {
    updates: EntityDelta[];
    serverTime: number;
  };
}

export interface EntityRPCMessage extends StreamMessage {
  type: 'entity_rpc';
  payload: {
    entityId: string;
    method: string;
    args: unknown[];
    callId: string;
  };
}

// ============================================================================
// Asset Messages
// ============================================================================

export interface AssetRequestMessage extends StreamMessage {
  type: 'asset_request';
  payload: {
    assetId: string;
    priority: number;
    acceptedFormats: string[];
    maxQuality: 'low' | 'medium' | 'high' | 'ultra';
    resumeOffset?: number;
  };
}

export interface AssetResponseMessage extends StreamMessage {
  type: 'asset_response';
  payload: {
    assetId: string;
    totalSize: number;
    chunkCount: number;
    format: string;
    checksum: string;
    metadata: Record<string, unknown>;
  };
}

export interface AssetChunkMessage extends StreamMessage {
  type: 'asset_chunk';
  payload: {
    assetId: string;
    chunkIndex: number;
    data: ArrayBuffer;
    checksum: string;
  };
}

export interface AssetCompleteMessage extends StreamMessage {
  type: 'asset_complete';
  payload: {
    assetId: string;
    finalChecksum: string;
  };
}

export interface AssetErrorMessage extends StreamMessage {
  type: 'asset_error';
  payload: {
    assetId: string;
    error: string;
    retryable: boolean;
  };
}

// ============================================================================
// Player Messages
// ============================================================================

export interface PlayerState {
  /** Player ID */
  id: string;

  /** Display name */
  displayName: string;

  /** Avatar ID */
  avatarId: string;

  /** Position */
  position: [number, number, number];

  /** Rotation (head orientation) */
  rotation: { x: number; y: number; z: number; w: number };

  /** Velocity */
  velocity: { x: number; y: number; z: number };

  /** Player data */
  data: Record<string, unknown>;

  /** Is player talking? */
  isTalking: boolean;

  /** Join timestamp */
  joinedAt: number;
}

export interface PlayerJoinMessage extends StreamMessage {
  type: 'player_join';
  payload: {
    player: PlayerState;
  };
}

export interface PlayerLeaveMessage extends StreamMessage {
  type: 'player_leave';
  payload: {
    playerId: string;
    reason: 'disconnect' | 'kick' | 'timeout';
  };
}

export interface PlayerUpdateMessage extends StreamMessage {
  type: 'player_update';
  payload: {
    playerId: string;
    changes: Partial<PlayerState>;
    timestamp: number;
  };
}

export interface PlayerInputMessage extends StreamMessage {
  type: 'player_input';
  payload: {
    playerId: string;
    inputs: Record<string, number>;
    timestamp: number;
  };
}

// ============================================================================
// Voice/Chat Messages
// ============================================================================

export interface VoiceDataMessage extends StreamMessage {
  type: 'voice_data';
  payload: {
    playerId: string;
    data: ArrayBuffer;
    codec: 'opus' | 'pcm';
    sampleRate: number;
  };
}

export interface ChatMessage extends StreamMessage {
  type: 'chat_message';
  payload: {
    senderId: string;
    senderName: string;
    content: string;
    channel: 'world' | 'team' | 'whisper';
    targetId?: string;
  };
}

// ============================================================================
// World Events
// ============================================================================

export interface WorldEvent {
  /** Event ID */
  id: string;

  /** Event type */
  type: string;

  /** Event source */
  source: 'server' | 'player' | 'entity' | 'system';

  /** Source ID */
  sourceId?: string;

  /** Event data */
  data: Record<string, unknown>;

  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// Stream Protocol Handler
// ============================================================================

export interface StreamHandler {
  /** Handle incoming message */
  onMessage(message: StreamMessage): void;

  /** Handle connection error */
  onError(error: Error): void;

  /** Handle connection close */
  onClose(code: number, reason: string): void;
}

export class StreamProtocol {
  private static instance: StreamProtocol | null = null;
  private connection: WebSocket | null = null;
  private handlers: Map<MessageType, Set<(message: StreamMessage) => void>> = new Map();
  private pendingAcks: Map<
    number,
    { resolve: () => void; reject: (err: Error) => void; timeout: ReturnType<typeof setTimeout> }
  > = new Map();
  private sequenceNumber = 0;
  private lastAckSeq = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  private constructor() {}

  static getInstance(): StreamProtocol {
    if (!StreamProtocol.instance) {
      StreamProtocol.instance = new StreamProtocol();
    }
    return StreamProtocol.instance;
  }

  static resetInstance(): void {
    StreamProtocol.instance?.close();
    StreamProtocol.instance = null;
  }

  // â”€â”€â”€ Connection Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Connect to streaming server
   */
  async connect(
    url: string,
    options: {
      clientId: string;
      clientVersion: string;
      capabilities?: string[];
    }
  ): Promise<void> {
    if (this.connectionState !== 'disconnected') {
      throw new Error('Already connected or connecting');
    }

    this.connectionState = 'connecting';

    return new Promise((resolve, reject) => {
      try {
        this.connection = new WebSocket(url);
        this.connection.binaryType = 'arraybuffer';

        this.connection.onopen = () => {
          this.sendHandshake(options);
        };

        this.connection.onmessage = (event) => {
          const message = this.deserialize(event.data);
          this.handleMessage(message);

          if (message.type === 'handshake_ack') {
            this.connectionState = 'connected';
            this.startHeartbeat();
            resolve();
          }
        };

        this.connection.onerror = (_event) => {
          const error = new Error('WebSocket error');
          if (this.connectionState === 'connecting') {
            reject(error);
          }
          this.emit('error', {
            type: 'error' as const,
            seq: 0,
            timestamp: Date.now(),
            reliable: false,
            priority: 0,
            payload: { error },
          } as StreamMessage);
        };

        this.connection.onclose = (event) => {
          this.connectionState = 'disconnected';
          this.stopHeartbeat();
          this.emit('close', {
            type: 'close' as const,
            seq: 0,
            timestamp: Date.now(),
            reliable: false,
            priority: 0,
            payload: { code: event.code, reason: event.reason },
          } as StreamMessage);
        };
      } catch (error) {
        this.connectionState = 'disconnected';
        reject(error);
      }
    });
  }

  /**
   * Close connection
   */
  close(): void {
    this.stopHeartbeat();
    if (this.connection) {
      this.connection.close(1000, 'Client disconnect');
      this.connection = null;
    }
    this.connectionState = 'disconnected';
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  // â”€â”€â”€ Message Handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Subscribe to message type
   */
  on<T extends StreamMessage>(type: MessageType, handler: (message: T) => void): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const h = handler as (message: StreamMessage) => void;
    this.handlers.get(type)!.add(h);
    return () => this.handlers.get(type)?.delete(h);
  }

  /**
   * Emit message to handlers
   */
  private emit(type: MessageType, message: StreamMessage): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message);
        } catch (error) {
          console.error(`Handler error for ${type}:`, error);
        }
      }
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: StreamMessage): void {
    // Update last received sequence
    this.lastAckSeq = Math.max(this.lastAckSeq, message.seq);

    // Handle acks
    const msgExt = message as StreamMessage & { ack?: boolean; ackSeq?: number };
    if (message.type === 'heartbeat_ack' || msgExt.ack) {
      const ackKey = msgExt.ackSeq || message.seq;
      const pending = this.pendingAcks.get(ackKey);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve();
        this.pendingAcks.delete(ackKey);
      }
    }

    // Emit to handlers
    this.emit(message.type, message);
  }

  // â”€â”€â”€ Message Sending â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Send message
   */
  send(message: Omit<StreamMessage, 'seq' | 'timestamp'>): void {
    if (!this.connection || this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    const fullMessage: StreamMessage = {
      ...message,
      seq: this.sequenceNumber++,
      timestamp: Date.now(),
    };

    const data = this.serialize(fullMessage);
    this.connection.send(data);
  }

  /**
   * Send message and wait for acknowledgment
   */
  async sendReliable(
    message: Omit<StreamMessage, 'seq' | 'timestamp' | 'reliable'>,
    timeout = 5000
  ): Promise<void> {
    const fullMessage: StreamMessage = {
      ...message,
      seq: this.sequenceNumber++,
      timestamp: Date.now(),
      reliable: true,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingAcks.delete(fullMessage.seq);
        reject(new Error('Message timeout'));
      }, timeout);

      this.pendingAcks.set(fullMessage.seq, { resolve, reject, timeout: timeoutId });

      const data = this.serialize(fullMessage);
      this.connection!.send(data);
    });
  }

  // â”€â”€â”€ Specific Message Senders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Send handshake
   */
  private sendHandshake(options: {
    clientId: string;
    clientVersion: string;
    capabilities?: string[];
  }): void {
    const message: Omit<HandshakeMessage, 'seq' | 'timestamp'> = {
      type: 'handshake',
      reliable: true,
      priority: 255,
      payload: {
        protocolVersion: PROTOCOL_VERSION,
        clientId: options.clientId,
        clientVersion: options.clientVersion,
        capabilities: options.capabilities ?? ['entity_sync', 'asset_streaming'],
        compression: 'lz4',
        encryption: 'none',
      },
    };

    const fullMessage: HandshakeMessage = {
      ...message,
      seq: this.sequenceNumber++,
      timestamp: Date.now(),
    };

    const data = this.serialize(fullMessage);
    this.connection!.send(data);
  }

  /**
   * Send heartbeat
   */
  private sendHeartbeat(): void {
    if (!this.isConnected()) return;

    this.send({
      type: 'heartbeat',
      reliable: false,
      priority: 128,
      payload: {
        clientTime: Date.now(),
        lastAckSeq: this.lastAckSeq,
      },
    });
  }

  /**
   * Join world
   */
  async joinWorld(worldId: string, spawnPoint?: string): Promise<void> {
    await this.sendReliable({
      type: 'world_join',
      priority: 200,
      payload: {
        worldId,
        spawnPoint,
      },
    });
  }

  /**
   * Leave world
   */
  async leaveWorld(): Promise<void> {
    await this.sendReliable({
      type: 'world_leave',
      priority: 200,
      payload: {},
    });
  }

  /**
   * Send entity update
   */
  sendEntityUpdate(entityId: string, changes: Record<string, unknown>): void {
    this.send({
      type: 'entity_update',
      reliable: false,
      priority: 128,
      payload: {
        id: entityId,
        changes,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Send entity RPC
   */
  async sendEntityRPC(entityId: string, method: string, args: unknown[]): Promise<void> {
    const callId = `rpc_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    await this.sendReliable({
      type: 'entity_rpc',
      priority: 192,
      payload: {
        entityId,
        method,
        args,
        callId,
      },
    });
  }

  /**
   * Request asset
   */
  async requestAsset(
    assetId: string,
    options: {
      priority?: number;
      acceptedFormats?: string[];
      maxQuality?: 'low' | 'medium' | 'high' | 'ultra';
    } = {}
  ): Promise<void> {
    await this.sendReliable({
      type: 'asset_request',
      priority: options.priority ?? 128,
      payload: {
        assetId,
        priority: options.priority ?? 128,
        acceptedFormats: options.acceptedFormats ?? ['gltf', 'glb'],
        maxQuality: options.maxQuality ?? 'high',
      },
    });
  }

  /**
   * Send player input
   */
  sendPlayerInput(inputs: Record<string, number>): void {
    this.send({
      type: 'player_input',
      reliable: false,
      priority: 192,
      payload: {
        playerId: '', // Set by server
        inputs,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Send chat message
   */
  async sendChat(
    content: string,
    channel: 'world' | 'team' | 'whisper' = 'world',
    targetId?: string
  ): Promise<void> {
    await this.sendReliable({
      type: 'chat_message',
      priority: 160,
      payload: {
        senderId: '', // Set by server
        senderName: '', // Set by server
        content,
        channel,
        targetId,
      },
    });
  }

  /**
   * Send voice data
   */
  sendVoiceData(data: ArrayBuffer, codec: 'opus' | 'pcm' = 'opus'): void {
    this.send({
      type: 'voice_data',
      reliable: false,
      priority: 224,
      payload: {
        playerId: '', // Set by server
        data,
        codec,
        sampleRate: 48000,
      },
    });
  }

  // â”€â”€â”€ Serialization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Serialize message to binary
   */
  private serialize(message: StreamMessage): ArrayBuffer {
    // Simple JSON serialization for now
    // Production would use MessagePack or Protocol Buffers
    const json = JSON.stringify(message, (key, value) => {
      if (value instanceof ArrayBuffer) {
        return { __type: 'ArrayBuffer', data: Array.from(new Uint8Array(value)) };
      }
      return value;
    });
    const encoder = new TextEncoder();
    return encoder.encode(json).buffer;
  }

  /**
   * Deserialize binary to message
   */
  private deserialize(data: ArrayBuffer | string): StreamMessage {
    let json: string;
    if (data instanceof ArrayBuffer) {
      const decoder = new TextDecoder();
      json = decoder.decode(data);
    } else {
      json = data;
    }

    return JSON.parse(json, (key, value) => {
      if (value && value.__type === 'ArrayBuffer') {
        return new Uint8Array(value.data).buffer;
      }
      return value;
    });
  }

  // â”€â”€â”€ Heartbeat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // â”€â”€â”€ Statistics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Get protocol statistics
   */
  getStats(): {
    messagesSent: number;
    messagesReceived: number;
    pendingAcks: number;
    connectionState: string;
  } {
    return {
      messagesSent: this.sequenceNumber,
      messagesReceived: this.lastAckSeq,
      pendingAcks: this.pendingAcks.size,
      connectionState: this.connectionState,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Get stream protocol instance
 */
export function getStreamProtocol(): StreamProtocol {
  return StreamProtocol.getInstance();
}

/**
 * Create a stream message
 */
export function createMessage<T extends MessageType>(
  type: T,
  payload: unknown,
  options: { reliable?: boolean; priority?: number; channel?: string } = {}
): Omit<StreamMessage, 'seq' | 'timestamp'> {
  return {
    type,
    payload,
    reliable: options.reliable ?? (type.includes('_rpc') || type.includes('request')),
    priority: options.priority ?? 128,
    channel: options.channel,
  };
}
