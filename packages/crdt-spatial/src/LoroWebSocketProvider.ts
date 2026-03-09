/**
 * LoroWebSocketProvider - WebSocket sync transport for Loro CRDT documents
 *
 * Provides basic WebSocket-based synchronization between Loro document peers.
 * Handles connection management, reconnection, heartbeat, and binary state exchange.
 *
 * Protocol:
 * 1. On connect: send full snapshot to server
 * 2. Server broadcasts snapshot to other peers
 * 3. Subsequent changes: send incremental updates
 * 4. Heartbeat: ping/pong every 30s to detect disconnects
 *
 * Note: This is a custom transport (~200 LOC) because Loro does not have
 * official transport providers (unlike Yjs with y-websocket).
 * See W.059: Awareness/presence is ephemeral and uses a separate pub/sub channel.
 *
 * @module @holoscript/crdt-spatial
 */

import type { SpatialCRDTBridge } from './SpatialCRDTBridge.js';

import type {
  WebSocketProviderConfig,
  AwarenessState,
  SyncMessage,
} from './types.js';

import {
  ConnectionState,
  SyncMessageType,
  DEFAULT_WS_CONFIG,
} from './types.js';

// =============================================================================
// LORO WEBSOCKET PROVIDER
// =============================================================================

/**
 * WebSocket provider for Loro CRDT document synchronization.
 *
 * @example
 * ```typescript
 * const bridge = new SpatialCRDTBridge({ peerId: 'user-1' });
 * const provider = new LoroWebSocketProvider(bridge, {
 *   url: 'wss://sync.example.com',
 *   roomId: 'my-scene',
 * });
 *
 * provider.onStateChange((state) => console.log('Connection:', state));
 * provider.connect();
 *
 * // Later:
 * provider.disconnect();
 * ```
 */
export class LoroWebSocketProvider {
  private bridge: SpatialCRDTBridge;
  private config: WebSocketProviderConfig;
  private ws: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.Disconnected;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastVersionSent: Uint8Array | null = null;

  // Awareness state (ephemeral, not CRDT)
  private localAwareness: AwarenessState;
  private remoteAwareness: Map<string, AwarenessState> = new Map();

  // Event handlers
  private onStateChangeHandler: ((state: ConnectionState) => void) | null = null;
  private onAwarenessChangeHandler: ((peers: Map<string, AwarenessState>) => void) | null = null;
  private onErrorHandler: ((error: Error) => void) | null = null;
  private onPeerCountChangeHandler: ((count: number) => void) | null = null;

  constructor(
    bridge: SpatialCRDTBridge,
    config: Pick<WebSocketProviderConfig, 'url' | 'roomId'> &
      Partial<Omit<WebSocketProviderConfig, 'url' | 'roomId'>>
  ) {
    this.bridge = bridge;
    this.config = { ...DEFAULT_WS_CONFIG, ...config };

    const stats = bridge.getStats();
    this.localAwareness = {
      peerId: stats.peerId,
      name: `Peer ${stats.peerId}`,
      color: this.generateColor(stats.peerId),
      lastActive: Date.now(),
    };
  }

  // ===========================================================================
  // CONNECTION MANAGEMENT
  // ===========================================================================

  /** Connect to the WebSocket server */
  connect(): void {
    if (this.state === ConnectionState.Connected || this.state === ConnectionState.Connecting) {
      return;
    }

    this.setState(ConnectionState.Connecting);

    try {
      const url = new URL(this.config.url);
      url.searchParams.set('room', this.config.roomId);
      url.searchParams.set('peer', this.bridge.getStats().peerId);

      this.ws = new WebSocket(url.toString());

      if (this.config.binaryEncoding) {
        this.ws.binaryType = 'arraybuffer';
      }

      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onclose = (event) => this.handleClose(event);
      this.ws.onerror = (event) => this.handleError(event);
    } catch (error) {
      this.setState(ConnectionState.Error);
      this.onErrorHandler?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Disconnect from the WebSocket server */
  disconnect(): void {
    this.clearTimers();
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.remoteAwareness.clear();
    this.setState(ConnectionState.Disconnected);
  }

  /** Get current connection state */
  getConnectionState(): ConnectionState {
    return this.state;
  }

  /** Get connected peer count */
  getPeerCount(): number {
    return this.remoteAwareness.size + 1; // Include self
  }

  /** Get awareness states of all peers */
  getAwareness(): Map<string, AwarenessState> {
    const all = new Map<string, AwarenessState>(this.remoteAwareness);
    all.set(this.localAwareness.peerId, this.localAwareness);
    return all;
  }

  /** Update local awareness state */
  setAwareness(update: Partial<AwarenessState>): void {
    this.localAwareness = {
      ...this.localAwareness,
      ...update,
      lastActive: Date.now(),
    };
    this.sendAwareness();
  }

  /** Force send current state as an update */
  sendUpdate(): void {
    if (this.state !== ConnectionState.Connected || !this.ws) return;

    const updateBytes = this.lastVersionSent
      ? this.bridge.exportUpdate(this.lastVersionSent)
      : this.bridge.exportSnapshot();

    this.lastVersionSent = this.bridge.getVersion();

    const message: SyncMessage = {
      type: SyncMessageType.Update,
      roomId: this.config.roomId,
      peerId: this.bridge.getStats().peerId,
      payload: updateBytes,
      timestamp: Date.now(),
    };

    this.sendMessage(message);
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  /** Subscribe to connection state changes */
  onStateChange(handler: (state: ConnectionState) => void): void {
    this.onStateChangeHandler = handler;
  }

  /** Subscribe to awareness updates */
  onAwarenessChange(handler: (peers: Map<string, AwarenessState>) => void): void {
    this.onAwarenessChangeHandler = handler;
  }

  /** Subscribe to error events */
  onError(handler: (error: Error) => void): void {
    this.onErrorHandler = handler;
  }

  /** Subscribe to peer count changes */
  onPeerCountChange(handler: (count: number) => void): void {
    this.onPeerCountChangeHandler = handler;
  }

  // ===========================================================================
  // PRIVATE: WebSocket Event Handlers
  // ===========================================================================

  private handleOpen(): void {
    this.setState(ConnectionState.Connected);
    this.reconnectAttempts = 0;

    // Send initial snapshot
    const snapshot = this.bridge.exportSnapshot();
    const message: SyncMessage = {
      type: SyncMessageType.Snapshot,
      roomId: this.config.roomId,
      peerId: this.bridge.getStats().peerId,
      payload: snapshot,
      timestamp: Date.now(),
    };

    this.sendMessage(message);
    this.lastVersionSent = this.bridge.getVersion();

    // Start heartbeat
    this.startHeartbeat();

    // Send awareness
    this.sendAwareness();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      let message: SyncMessage;

      if (event.data instanceof ArrayBuffer) {
        // Binary message: decode
        const json = new TextDecoder().decode(new Uint8Array(event.data));
        message = JSON.parse(json);
        // Restore payload as Uint8Array
        if (message.payload && typeof message.payload === 'object') {
          message.payload = new Uint8Array(Object.values(message.payload as unknown as Record<string, number>));
        }
      } else {
        message = JSON.parse(event.data);
        if (message.payload && typeof message.payload === 'object') {
          message.payload = new Uint8Array(Object.values(message.payload as unknown as Record<string, number>));
        }
      }

      // Ignore messages from self
      if (message.peerId === this.bridge.getStats().peerId) return;

      switch (message.type) {
        case SyncMessageType.Snapshot:
        case SyncMessageType.Update:
          this.bridge.importUpdate(message.payload);
          break;

        case SyncMessageType.Awareness:
          this.handleRemoteAwareness(message);
          break;

        case SyncMessageType.Heartbeat:
          // Heartbeat received - connection is alive
          break;

        case SyncMessageType.Error:
          this.onErrorHandler?.(new Error(`Server error: ${new TextDecoder().decode(message.payload)}`));
          break;
      }
    } catch (error) {
      this.onErrorHandler?.(
        error instanceof Error ? error : new Error(`Message parse error: ${error}`)
      );
    }
  }

  private handleClose(event: CloseEvent): void {
    this.ws = null;
    this.clearTimers();

    if (event.code === 1000) {
      // Normal closure
      this.setState(ConnectionState.Disconnected);
    } else if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      // Attempt reconnection
      this.setState(ConnectionState.Reconnecting);
      const delay = this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts);
      this.reconnectAttempts++;

      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, Math.min(delay, 30_000)); // Cap at 30s
    } else {
      this.setState(ConnectionState.Error);
      this.onErrorHandler?.(new Error(`Max reconnection attempts (${this.config.maxReconnectAttempts}) exceeded`));
    }
  }

  private handleError(_event: Event): void {
    this.onErrorHandler?.(new Error('WebSocket connection error'));
  }

  // ===========================================================================
  // PRIVATE: Messaging
  // ===========================================================================

  private sendMessage(message: SyncMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (this.config.binaryEncoding) {
      // Encode as JSON then to binary for transport
      const json = JSON.stringify(message);
      const bytes = new TextEncoder().encode(json);
      this.ws.send(bytes);
    } else {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendAwareness(): void {
    if (this.state !== ConnectionState.Connected) return;

    const awarenessBytes = new TextEncoder().encode(JSON.stringify(this.localAwareness));
    const message: SyncMessage = {
      type: SyncMessageType.Awareness,
      roomId: this.config.roomId,
      peerId: this.bridge.getStats().peerId,
      payload: awarenessBytes,
      timestamp: Date.now(),
    };

    this.sendMessage(message);
  }

  private handleRemoteAwareness(message: SyncMessage): void {
    try {
      const state: AwarenessState = JSON.parse(new TextDecoder().decode(message.payload));
      const previousCount = this.remoteAwareness.size;
      this.remoteAwareness.set(message.peerId, state);

      if (this.remoteAwareness.size !== previousCount) {
        this.onPeerCountChangeHandler?.(this.getPeerCount());
      }

      this.onAwarenessChangeHandler?.(this.getAwareness());
    } catch {
      // Invalid awareness payload - ignore
    }
  }

  // ===========================================================================
  // PRIVATE: Heartbeat
  // ===========================================================================

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== ConnectionState.Connected) return;

      const message: SyncMessage = {
        type: SyncMessageType.Heartbeat,
        roomId: this.config.roomId,
        peerId: this.bridge.getStats().peerId,
        payload: new Uint8Array(0),
        timestamp: Date.now(),
      };

      this.sendMessage(message);

      // Also clean up stale awareness entries (>60s without update)
      const now = Date.now();
      for (const [peerId, state] of this.remoteAwareness) {
        if (now - state.lastActive > 60_000) {
          this.remoteAwareness.delete(peerId);
        }
      }
    }, this.config.heartbeatIntervalMs);
  }

  // ===========================================================================
  // PRIVATE: Utilities
  // ===========================================================================

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.onStateChangeHandler?.(state);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private generateColor(peerId: string): string {
    let hash = 0;
    for (let i = 0; i < peerId.length; i++) {
      hash = ((hash << 5) - hash + peerId.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }
}
