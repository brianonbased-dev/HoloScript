/**
 * WebSocket Transport for HoloScript Network Synchronization
 *
 * Provides reliable, bidirectional communication for networked traits.
 * Handles reconnection, message queuing, and backpressure.
 *
 * @version 1.0.0
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Message queuing during disconnection
 * - Heartbeat/keepalive mechanism
 * - Room-based isolation
 */

import { logger } from '../logger';

export interface WebSocketTransportConfig {
  /** Server URL (e.g., 'ws://localhost:8080') */
  serverUrl: string;

  /** Room ID for message isolation */
  roomId: string;

  /** Peer ID (auto-generated if not provided) */
  peerId?: string;

  /** Max reconnection attempts */
  maxReconnectAttempts?: number;

  /** Initial backoff in ms */
  initialBackoffMs?: number;

  /** Max backoff in ms */
  maxBackoffMs?: number;

  /** Heartbeat interval in ms */
  heartbeatIntervalMs?: number;
}

export interface NetworkMessage {
  id: string;
  type: 'state-sync' | 'action' | 'heartbeat' | 'auth' | 'rpc';
  peerId: string;
  roomId: string;
  payload: unknown;
  timestamp: number;
  targetPeerId?: string; // If set, message is unicast
}

export class WebSocketTransport {
  private ws: WebSocket | null = null;
  private config: WebSocketTransportConfig;
  private messageQueue: NetworkMessage[] = [];
  private reconnectAttempts = 0;
  private messageHandlers = new Map<string, (msg: NetworkMessage) => void>();
  private isConnected = false;
  private peerId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageId = 0;

  constructor(config: WebSocketTransportConfig) {
    const defaults = {
      maxReconnectAttempts: 10,
      initialBackoffMs: 1000,
      maxBackoffMs: 30000,
      heartbeatIntervalMs: 30000,
    };
    this.config = { ...defaults, ...config };
    this.peerId = config.peerId || this.generatePeerId();
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl);

        this.ws.onopen = () => {
          logger.info(`WebSocket connected to ${this.config.serverUrl}`);
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // Send auth message
          this.sendMessage({
            type: 'auth',
            payload: { peerId: this.peerId, roomId: this.config.roomId },
          });

          // Start heartbeat
          this.startHeartbeat();

          // Flush message queue
          this.flushMessageQueue();

          resolve();
        };

        this.ws.onmessage = (evt) => {
          try {
            const msg: NetworkMessage = JSON.parse(evt.data);
            const handler = this.messageHandlers.get(msg.type);
            if (handler) handler(msg);
          } catch (err) {
            logger.error('Failed to parse WebSocket message', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        };

        this.ws.onerror = () => {
          logger.error('WebSocket error');
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = () => {
          logger.warn('WebSocket disconnected');
          this.isConnected = false;
          this.stopHeartbeat();
          this.attemptReconnect();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Send a network message
   */
  sendMessage(msg: Omit<NetworkMessage, 'id' | 'peerId' | 'roomId' | 'timestamp'>): void {
    const fullMessage: NetworkMessage = {
      ...msg,
      id: `${this.peerId}-${this.messageId++}`,
      peerId: this.peerId,
      roomId: this.config.roomId,
      timestamp: Date.now(),
    };

    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(fullMessage));
    } else {
      // Queue for later transmission
      this.messageQueue.push(fullMessage);
      if (this.messageQueue.length > 1000) {
        this.messageQueue.shift(); // Drop oldest if queue too large
      }
    }
  }

  /**
   * Register message handler
   */
  onMessage(type: NetworkMessage['type'], handler: (msg: NetworkMessage) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  // Private helpers

  private attemptReconnect(): void {
    const maxAttempts = this.config.maxReconnectAttempts ?? 10;
    if (this.reconnectAttempts >= maxAttempts) {
      logger.error('Max reconnection attempts exceeded');
      return;
    }

    const initialBackoff = this.config.initialBackoffMs ?? 1000;
    const maxBackoff = this.config.maxBackoffMs ?? 30000;
    const backoff = Math.min(initialBackoff * Math.pow(2, this.reconnectAttempts), maxBackoff);

    this.reconnectAttempts++;
    logger.info(`Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`);

    setTimeout(() => {
      this.connect().catch((err) => {
        logger.error('Reconnection failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        this.attemptReconnect();
      });
    }, backoff);
  }

  private flushMessageQueue(): void {
    while (
      this.messageQueue.length > 0 &&
      this.isConnected &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      const msg = this.messageQueue.shift();
      if (msg) this.ws.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat(): void {
    const interval = this.config.heartbeatIntervalMs ?? 30000;
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({ type: 'heartbeat', payload: {} });
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private generatePeerId(): string {
    return `peer-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a WebSocket transport instance
 */
export function createWebSocketTransport(config: WebSocketTransportConfig): WebSocketTransport {
  return new WebSocketTransport(config);
}
