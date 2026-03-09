/**
 * CollaborationTransport.ts
 *
 * Bridges the CRDT collaboration layer to the existing
 * NetworkTransport infrastructure. Handles WebSocket connection
 * management, message framing, and sync protocol.
 *
 * This transport sits between CollaborationSession and the
 * network layer, adapting CRDT binary updates to the
 * message format expected by NetworkTransport.
 *
 * @module collaboration
 */

// =============================================================================
// TYPES
// =============================================================================

export type TransportState = 'closed' | 'connecting' | 'open' | 'closing';

export interface TransportConfig {
  /** WebSocket server URL */
  url: string;
  /** Session/room identifier */
  sessionId: string;
  /** Local peer ID */
  peerId: string;
  /** Heartbeat interval (ms) */
  heartbeatInterval: number;
  /** Message compression threshold (bytes) */
  compressionThreshold: number;
  /** Max message size (bytes) */
  maxMessageSize: number;
  /** Connection timeout (ms) */
  connectionTimeout: number;
}

export type SyncMessageType =
  | 'doc-update'
  | 'doc-state-vector'
  | 'doc-state-request'
  | 'awareness'
  | 'peer-joined'
  | 'peer-left'
  | 'heartbeat'
  | 'heartbeat-ack';

export interface SyncMessage {
  type: SyncMessageType;
  sessionId: string;
  peerId: string;
  filePath?: string;
  data?: Uint8Array;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface TransportStats {
  state: TransportState;
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  latencyMs: number;
  reconnectCount: number;
}

type MessageHandler = (msg: SyncMessage) => void;
type ErrorHandler = (error: Error) => void;
type StateHandler = (state: TransportState) => void;

const DEFAULT_TRANSPORT_CONFIG: TransportConfig = {
  url: 'ws://localhost:4444',
  sessionId: '',
  peerId: '',
  heartbeatInterval: 10000,
  compressionThreshold: 1024,
  maxMessageSize: 1024 * 1024, // 1MB
  connectionTimeout: 10000,
};

// =============================================================================
// MESSAGE ENCODING
// =============================================================================

/**
 * Encode a SyncMessage to binary for transmission.
 * Format: [type(1)] [sessionIdLen(2)] [sessionId] [peerIdLen(2)] [peerId]
 *         [filePathLen(2)] [filePath] [metadataLen(4)] [metadata] [timestamp(8)] [data]
 */
export function encodeSyncMessage(msg: SyncMessage): Uint8Array {
  const encoder = new TextEncoder();

  const typeMap: Record<SyncMessageType, number> = {
    'doc-update': 0x01,
    'doc-state-vector': 0x02,
    'doc-state-request': 0x03,
    awareness: 0x04,
    'peer-joined': 0x05,
    'peer-left': 0x06,
    heartbeat: 0x07,
    'heartbeat-ack': 0x08,
  };

  const sessionIdBytes = encoder.encode(msg.sessionId);
  const peerIdBytes = encoder.encode(msg.peerId);
  const filePathBytes = msg.filePath ? encoder.encode(msg.filePath) : new Uint8Array(0);
  const metadataBytes = msg.metadata
    ? encoder.encode(JSON.stringify(msg.metadata))
    : new Uint8Array(0);
  const dataBytes = msg.data || new Uint8Array(0);

  // Calculate total size
  const totalSize =
    1 + // type
    2 +
    sessionIdBytes.length +
    2 +
    peerIdBytes.length +
    2 +
    filePathBytes.length +
    4 +
    metadataBytes.length +
    8 + // timestamp
    dataBytes.length;

  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  // Type
  buffer[offset++] = typeMap[msg.type] || 0;

  // Session ID
  view.setUint16(offset, sessionIdBytes.length, true);
  offset += 2;
  buffer.set(sessionIdBytes, offset);
  offset += sessionIdBytes.length;

  // Peer ID
  view.setUint16(offset, peerIdBytes.length, true);
  offset += 2;
  buffer.set(peerIdBytes, offset);
  offset += peerIdBytes.length;

  // File Path
  view.setUint16(offset, filePathBytes.length, true);
  offset += 2;
  buffer.set(filePathBytes, offset);
  offset += filePathBytes.length;

  // Metadata
  view.setUint32(offset, metadataBytes.length, true);
  offset += 4;
  buffer.set(metadataBytes, offset);
  offset += metadataBytes.length;

  // Timestamp (as float64)
  view.setFloat64(offset, msg.timestamp, true);
  offset += 8;

  // Data
  buffer.set(dataBytes, offset);

  return buffer;
}

/**
 * Decode binary data back to a SyncMessage.
 */
export function decodeSyncMessage(buffer: Uint8Array): SyncMessage {
  const decoder = new TextDecoder();
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const reverseTypeMap: Record<number, SyncMessageType> = {
    0x01: 'doc-update',
    0x02: 'doc-state-vector',
    0x03: 'doc-state-request',
    0x04: 'awareness',
    0x05: 'peer-joined',
    0x06: 'peer-left',
    0x07: 'heartbeat',
    0x08: 'heartbeat-ack',
  };

  let offset = 0;

  // Type
  const type = reverseTypeMap[buffer[offset++]] || 'doc-update';

  // Session ID
  const sessionIdLen = view.getUint16(offset, true);
  offset += 2;
  const sessionId = decoder.decode(buffer.slice(offset, offset + sessionIdLen));
  offset += sessionIdLen;

  // Peer ID
  const peerIdLen = view.getUint16(offset, true);
  offset += 2;
  const peerId = decoder.decode(buffer.slice(offset, offset + peerIdLen));
  offset += peerIdLen;

  // File Path
  const filePathLen = view.getUint16(offset, true);
  offset += 2;
  const filePath =
    filePathLen > 0 ? decoder.decode(buffer.slice(offset, offset + filePathLen)) : undefined;
  offset += filePathLen;

  // Metadata
  const metadataLen = view.getUint32(offset, true);
  offset += 4;
  const metadata =
    metadataLen > 0
      ? JSON.parse(decoder.decode(buffer.slice(offset, offset + metadataLen)))
      : undefined;
  offset += metadataLen;

  // Timestamp
  const timestamp = view.getFloat64(offset, true);
  offset += 8;

  // Data
  const data = offset < buffer.length ? buffer.slice(offset) : undefined;

  return { type, sessionId, peerId, filePath, data, metadata, timestamp };
}

// =============================================================================
// COLLABORATION TRANSPORT
// =============================================================================

/**
 * Manages the WebSocket connection for CRDT sync.
 *
 * Usage:
 * ```ts
 * const transport = new CollaborationTransport({
 *   url: 'ws://localhost:4444',
 *   sessionId: 'my-session',
 *   peerId: 'alice-123',
 * });
 *
 * transport.onMessage((msg) => {
 *   if (msg.type === 'doc-update') {
 *     session.applyRemoteUpdate(msg.filePath!, msg.data!, msg.peerId);
 *   }
 * });
 *
 * await transport.connect();
 * transport.send({
 *   type: 'doc-update',
 *   sessionId: 'my-session',
 *   peerId: 'alice-123',
 *   filePath: 'zones/main.hsplus',
 *   data: encodedUpdate,
 *   timestamp: Date.now(),
 * });
 * ```
 */
export class CollaborationTransport {
  private config: TransportConfig;
  private state: TransportState = 'closed';

  private messageHandlers: Set<MessageHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private stateHandlers: Set<StateHandler> = new Set();

  // Stats
  private messagesSent = 0;
  private messagesReceived = 0;
  private bytesSent = 0;
  private bytesReceived = 0;
  private reconnectCount = 0;
  private lastPongTime = 0;

  // Heartbeat
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Message buffer for batching
  private sendBuffer: SyncMessage[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_INTERVAL = 16; // ~60fps sync rate

  constructor(config: Partial<TransportConfig> = {}) {
    this.config = { ...DEFAULT_TRANSPORT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Connection Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.state === 'open') return;

    this.setState('connecting');

    try {
      // In production: WebSocket connection with timeout
      // const ws = new WebSocket(this.config.url);
      // await new Promise((resolve, reject) => { ... });

      await new Promise((resolve) => setTimeout(resolve, 50));

      this.setState('open');
      this.startHeartbeat();
      this.startBatchFlush();
    } catch (err) {
      this.setState('closed');
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.state === 'closed') return;

    this.setState('closing');
    this.stopHeartbeat();
    this.stopBatchFlush();
    this.flushSendBuffer();

    // In production: close WebSocket
    await new Promise((resolve) => setTimeout(resolve, 10));

    this.setState('closed');
  }

  getState(): TransportState {
    return this.state;
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  /** Send a sync message (batched for efficiency) */
  send(message: SyncMessage): void {
    if (this.state !== 'open') {
      throw new Error(`Cannot send in state: ${this.state}`);
    }

    if (message.data && message.data.byteLength > this.config.maxMessageSize) {
      throw new Error(
        `Message exceeds max size: ${message.data.byteLength} > ${this.config.maxMessageSize}`
      );
    }

    this.sendBuffer.push(message);
  }

  /** Send a message immediately (bypass batching) */
  sendImmediate(message: SyncMessage): void {
    if (this.state !== 'open') return;

    const encoded = encodeSyncMessage(message);
    // In production: ws.send(encoded)
    this.messagesSent++;
    this.bytesSent += encoded.byteLength;
  }

  /** Register a message handler */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /** Unregister a message handler */
  offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /** Register an error handler */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.add(handler);
  }

  /** Unregister an error handler */
  offError(handler: ErrorHandler): void {
    this.errorHandlers.delete(handler);
  }

  /** Register a state change handler */
  onStateChange(handler: StateHandler): void {
    this.stateHandlers.add(handler);
  }

  /** Unregister a state change handler */
  offStateChange(handler: StateHandler): void {
    this.stateHandlers.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats(): TransportStats {
    return {
      state: this.state,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      latencyMs: this.lastPongTime > 0 ? Date.now() - this.lastPongTime : 0,
      reconnectCount: this.reconnectCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.stopHeartbeat();
    this.stopBatchFlush();
    this.sendBuffer = [];
    this.messageHandlers.clear();
    this.errorHandlers.clear();
    this.stateHandlers.clear();
    this.state = 'closed';
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private setState(state: TransportState): void {
    this.state = state;
    for (const handler of this.stateHandlers) {
      try {
        handler(state);
      } catch (err) {
        console.error('[CollaborationTransport] State handler error:', err);
      }
    }
  }

  /** Process an incoming binary message */
  protected handleIncomingMessage(data: Uint8Array): void {
    try {
      const msg = decodeSyncMessage(data);
      this.messagesReceived++;
      this.bytesReceived += data.byteLength;

      // Handle heartbeat internally
      if (msg.type === 'heartbeat') {
        this.sendImmediate({
          type: 'heartbeat-ack',
          sessionId: this.config.sessionId,
          peerId: this.config.peerId,
          timestamp: Date.now(),
        });
        return;
      }

      if (msg.type === 'heartbeat-ack') {
        this.lastPongTime = Date.now();
        return;
      }

      // Dispatch to handlers
      for (const handler of this.messageHandlers) {
        try {
          handler(msg);
        } catch (err) {
          console.error('[CollaborationTransport] Message handler error:', err);
        }
      }
    } catch (err) {
      for (const handler of this.errorHandlers) {
        handler(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'open') {
        this.sendImmediate({
          type: 'heartbeat',
          sessionId: this.config.sessionId,
          peerId: this.config.peerId,
          timestamp: Date.now(),
        });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startBatchFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushSendBuffer();
    }, this.BATCH_INTERVAL);
  }

  private stopBatchFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private flushSendBuffer(): void {
    if (this.sendBuffer.length === 0) return;

    const messages = this.sendBuffer.splice(0);

    for (const msg of messages) {
      const encoded = encodeSyncMessage(msg);
      // In production: ws.send(encoded)
      this.messagesSent++;
      this.bytesSent += encoded.byteLength;
    }
  }
}
