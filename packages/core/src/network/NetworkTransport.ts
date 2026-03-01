/**
 * NetworkTransport.ts
 *
 * Transport layer: client/server connection management,
 * message framing, latency simulation, and bandwidth tracking.
 *
 * @module networking
 */

// =============================================================================
// TYPES
// =============================================================================

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
export type TransportMode = 'client' | 'server' | 'host';

export interface NetworkMessage {
  id: number;
  channel: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  senderId: string;
  size: number;
}

export interface ConnectionInfo {
  peerId: string;
  state: ConnectionState;
  latency: number;
  jitter: number;
  packetLoss: number;
  connectedAt: number;
  lastMessageAt: number;
  bytesSent: number;
  bytesReceived: number;
}

export interface TransportConfig {
  maxConnections: number;
  simulatedLatency: number;     // ms
  simulatedJitter: number;      // ms
  simulatedPacketLoss: number;  // 0-1
  maxMessageSize: number;
  heartbeatInterval: number;    // ms
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_TRANSPORT: TransportConfig = {
  maxConnections: 32,
  simulatedLatency: 0,
  simulatedJitter: 0,
  simulatedPacketLoss: 0,
  maxMessageSize: 65536,
  heartbeatInterval: 1000,
};

// =============================================================================
// NETWORK TRANSPORT
// =============================================================================

let _msgId = 0;

export class NetworkTransport {
  private config: TransportConfig;
  private mode: TransportMode = 'client';
  private localId: string;
  private connections: Map<string, ConnectionInfo> = new Map();
  private messageQueue: NetworkMessage[] = [];
  private delayedMessages: Array<{ message: NetworkMessage; deliverAt: number }> = [];
  private messageHandlers: Map<string, Array<(msg: NetworkMessage) => void>> = new Map();
  private currentTime = 0;
  private totalBytesSent = 0;
  private totalBytesReceived = 0;

  constructor(localId: string, config?: Partial<TransportConfig>) {
    this.localId = localId;
    this.config = { ...DEFAULT_TRANSPORT, ...config };
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  connect(peerId: string): boolean {
    if (this.connections.size >= this.config.maxConnections) return false;
    if (this.connections.has(peerId)) return false;

    this.connections.set(peerId, {
      peerId,
      state: 'connected',
      latency: this.config.simulatedLatency,
      jitter: this.config.simulatedJitter,
      packetLoss: this.config.simulatedPacketLoss,
      connectedAt: this.currentTime,
      lastMessageAt: this.currentTime,
      bytesSent: 0,
      bytesReceived: 0,
    });
    return true;
  }

  disconnect(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    if (!conn) return false;
    conn.state = 'disconnected';
    this.connections.delete(peerId);
    return true;
  }

  getConnection(peerId: string): ConnectionInfo | undefined {
    return this.connections.get(peerId);
  }

  getConnectedPeers(): string[] {
    return [...this.connections.keys()];
  }

  getConnectionCount(): number { return this.connections.size; }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  send(peerId: string, type: string, payload: Record<string, unknown>, channel = 0): boolean {
    const conn = this.connections.get(peerId);
    if (!conn || conn.state !== 'connected') return false;

    const payloadStr = JSON.stringify(payload);
    const size = payloadStr.length;
    if (size > this.config.maxMessageSize) return false;

    // Simulate packet loss
    if (conn.packetLoss > 0 && Math.random() < conn.packetLoss) return true; // Silently dropped

    const message: NetworkMessage = {
      id: _msgId++,
      channel,
      type,
      payload,
      timestamp: this.currentTime,
      senderId: this.localId,
      size,
    };

    conn.bytesSent += size;
    this.totalBytesSent += size;

    // Simulate latency
    const latency = conn.latency + (Math.random() - 0.5) * 2 * conn.jitter;
    if (latency > 0) {
      this.delayedMessages.push({ message, deliverAt: this.currentTime + latency });
    } else {
      this.deliverMessage(message, peerId);
    }

    return true;
  }

  broadcast(type: string, payload: Record<string, unknown>, channel = 0): number {
    let sent = 0;
    for (const peerId of this.connections.keys()) {
      if (this.send(peerId, type, payload, channel)) sent++;
    }
    return sent;
  }

  private deliverMessage(message: NetworkMessage, _peerId: string): void {
    this.messageQueue.push(message);
    this.totalBytesReceived += message.size;

    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      for (const handler of handlers) handler(message);
    }

    // Also trigger wildcard handlers
    const wildcardHandlers = this.messageHandlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) handler(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Handler Registration
  // ---------------------------------------------------------------------------

  onMessage(type: string, handler: (msg: NetworkMessage) => void): void {
    if (!this.messageHandlers.has(type)) this.messageHandlers.set(type, []);
    this.messageHandlers.get(type)!.push(handler);
  }

  offMessage(type: string): void {
    this.messageHandlers.delete(type);
  }

  // ---------------------------------------------------------------------------
  // Update (process delayed messages)
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    this.currentTime += dt * 1000; // Convert to ms

    const toDeliver: Array<{ message: NetworkMessage; peerId: string }> = [];
    this.delayedMessages = this.delayedMessages.filter(dm => {
      if (this.currentTime >= dm.deliverAt) {
        toDeliver.push({ message: dm.message, peerId: dm.message.senderId });
        return false;
      }
      return true;
    });

    for (const { message, peerId } of toDeliver) {
      this.deliverMessage(message, peerId);
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getMessageQueue(): NetworkMessage[] { return [...this.messageQueue]; }
  clearMessageQueue(): void { this.messageQueue = []; }
  getPendingMessageCount(): number { return this.delayedMessages.length; }
  getTotalBytesSent(): number { return this.totalBytesSent; }
  getTotalBytesReceived(): number { return this.totalBytesReceived; }
  getLocalId(): string { return this.localId; }
  getMode(): TransportMode { return this.mode; }
  setMode(mode: TransportMode): void { this.mode = mode; }
}
