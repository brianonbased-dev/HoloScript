/**
 * Transport Fallback Manager
 *
 * Orchestrates automatic fallback between transport layers:
 * WebRTC → WebSocket → LocalBroadcast
 *
 * Features:
 * - Automatic transport detection and selection
 * - Seamless failover on connection loss
 * - Priority-based transport upgrade attempts
 * - Unified API for all transports
 *
 * @version 3.3.0
 * @sprint Sprint 2: Performance Optimization
 */

import { logger } from '../logger';
import {
  type Transport,
  type SyncMessage,
  WebSocketTransport,
  LocalBroadcastTransport,
} from './SyncProtocol';
import { ProductionWebRTCTransport, type WebRTCTransportConfig } from './ProductionWebRTCTransport';

/** Transport type priority */
export type TransportPriority = 'webrtc' | 'websocket' | 'local';

/** Fallback manager configuration */
export interface TransportFallbackConfig {
  /** Room ID */
  roomId: string;
  /** Preferred transport order (highest priority first) */
  transportPriority?: TransportPriority[];
  /** WebRTC configuration */
  webrtc?: {
    signalingUrl: string;
    iceServers?: RTCIceServer[];
  };
  /** WebSocket configuration */
  websocket?: {
    serverUrl: string;
  };
  /** Enable local broadcast fallback */
  enableLocal?: boolean;
  /** Connection timeout per transport (ms) */
  connectionTimeoutMs?: number;
  /** Enable automatic upgrade attempts */
  autoUpgrade?: boolean;
  /** Upgrade check interval (ms) */
  upgradeIntervalMs?: number;
  /** Maximum reconnection attempts per transport */
  maxReconnectAttempts?: number;
}

/** Transport state */
interface TransportState {
  type: TransportPriority;
  transport: Transport;
  connected: boolean;
  lastConnectedAt: number | null;
  failureCount: number;
}

/**
 * TransportFallbackManager - Automatic transport failover
 */
export class TransportFallbackManager implements Transport {
  private config: Required<TransportFallbackConfig>;
  private transports: Map<TransportPriority, TransportState> = new Map();
  private activeTransport: TransportState | null = null;
  private messageCallbacks: Set<(message: SyncMessage) => void> = new Set();
  private connectCallbacks: Set<() => void> = new Set();
  private disconnectCallbacks: Set<(reason: string) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private upgradeTimer: ReturnType<typeof setInterval> | null = null;
  private connecting = false;

  constructor(config: TransportFallbackConfig) {
    this.config = {
      roomId: config.roomId,
      transportPriority: config.transportPriority ?? ['webrtc', 'websocket', 'local'],
      webrtc: config.webrtc ?? { signalingUrl: '' },
      websocket: config.websocket ?? { serverUrl: '' },
      enableLocal: config.enableLocal ?? true,
      connectionTimeoutMs: config.connectionTimeoutMs ?? 10000,
      autoUpgrade: config.autoUpgrade ?? true,
      upgradeIntervalMs: config.upgradeIntervalMs ?? 30000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 3,
    };
  }

  /**
   * Connect using the best available transport
   */
  async connect(): Promise<void> {
    if (this.connecting) {
      throw new Error('Connection already in progress');
    }

    this.connecting = true;

    try {
      // Try transports in priority order
      for (const type of this.config.transportPriority) {
        if (!this.isTransportConfigured(type)) continue;

        try {
          const transport = this.createTransport(type);
          const connected = await this.connectWithTimeout(
            transport,
            this.config.connectionTimeoutMs
          );

          if (connected) {
            this.activeTransport = {
              type,
              transport,
              connected: true,
              lastConnectedAt: Date.now(),
              failureCount: 0,
            };
            this.transports.set(type, this.activeTransport);
            this.setupTransportHandlers(transport);

            logger.info(`[TransportFallback] Connected via ${type}`);
            this.connectCallbacks.forEach((cb) => cb());

            // Start upgrade timer if not using best transport
            if (this.config.autoUpgrade && type !== this.config.transportPriority[0]) {
              this.startUpgradeTimer();
            }

            return;
          }
        } catch (err) {
          logger.warn(`[TransportFallback] ${type} connection failed:`, { error: String(err) });
        }
      }

      throw new Error('All transports failed to connect');
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Disconnect from all transports
   */
  disconnect(): void {
    this.stopUpgradeTimer();

    for (const [, state] of this.transports) {
      try {
        state.transport.disconnect();
        state.connected = false;
      } catch {
        // Ignore disconnect errors
      }
    }

    this.transports.clear();
    this.activeTransport = null;
    this.disconnectCallbacks.forEach((cb) => cb('Disconnected'));
  }

  /**
   * Send a message via the active transport
   */
  send(message: SyncMessage): void {
    if (!this.activeTransport?.connected) {
      logger.warn('[TransportFallback] No active transport for send');
      return;
    }

    this.activeTransport.transport.send(message);
  }

  onMessage(callback: (message: SyncMessage) => void): void {
    this.messageCallbacks.add(callback);
  }

  onConnect(callback: () => void): void {
    this.connectCallbacks.add(callback);
  }

  onDisconnect(callback: (reason: string) => void): void {
    this.disconnectCallbacks.add(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.add(callback);
  }

  isConnected(): boolean {
    return this.activeTransport?.connected ?? false;
  }

  getLatency(): number {
    return this.activeTransport?.transport.getLatency() ?? 0;
  }

  /**
   * Get the currently active transport type
   */
  getActiveTransportType(): TransportPriority | null {
    return this.activeTransport?.type ?? null;
  }

  /**
   * Force upgrade to a specific transport
   */
  async upgradeToTransport(type: TransportPriority): Promise<boolean> {
    if (!this.isTransportConfigured(type)) {
      return false;
    }

    try {
      const transport = this.createTransport(type);
      const connected = await this.connectWithTimeout(transport, this.config.connectionTimeoutMs);

      if (connected) {
        // Disconnect old transport
        this.activeTransport?.transport.disconnect();

        this.activeTransport = {
          type,
          transport,
          connected: true,
          lastConnectedAt: Date.now(),
          failureCount: 0,
        };
        this.transports.set(type, this.activeTransport);
        this.setupTransportHandlers(transport);

        logger.info(`[TransportFallback] Upgraded to ${type}`);
        return true;
      }
    } catch (err) {
      logger.warn(`[TransportFallback] Upgrade to ${type} failed:`, { error: String(err) });
    }

    return false;
  }

  /**
   * Get transport statistics
   */
  getStats(): {
    activeTransport: TransportPriority | null;
    latency: number;
    transportsAvailable: TransportPriority[];
  } {
    return {
      activeTransport: this.activeTransport?.type ?? null,
      latency: this.getLatency(),
      transportsAvailable: this.config.transportPriority.filter((t) =>
        this.isTransportConfigured(t)
      ),
    };
  }

  // === Private Methods ===

  private isTransportConfigured(type: TransportPriority): boolean {
    switch (type) {
      case 'webrtc':
        return !!this.config.webrtc?.signalingUrl;
      case 'websocket':
        return !!this.config.websocket?.serverUrl;
      case 'local':
        return this.config.enableLocal;
      default:
        return false;
    }
  }

  private createTransport(type: TransportPriority): Transport {
    switch (type) {
      case 'webrtc':
        return new ProductionWebRTCTransport({
          signalingUrl: this.config.webrtc!.signalingUrl,
          roomId: this.config.roomId,
          iceServers: this.config.webrtc?.iceServers,
        } as WebRTCTransportConfig);

      case 'websocket':
        return new WebSocketTransport(this.config.websocket!.serverUrl);

      case 'local':
        return new LocalBroadcastTransport(`holoscript:${this.config.roomId}`);

      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  }

  private async connectWithTimeout(transport: Transport, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      transport
        .connect()
        .then(() => {
          clearTimeout(timeout);
          resolve(true);
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
    });
  }

  private setupTransportHandlers(transport: Transport): void {
    transport.onMessage((message) => {
      this.messageCallbacks.forEach((cb) => cb(message));
    });

    transport.onDisconnect((reason) => {
      logger.warn(`[TransportFallback] Transport disconnected: ${reason}`);

      if (this.activeTransport) {
        this.activeTransport.connected = false;
        this.activeTransport.failureCount++;
      }

      // Attempt fallback
      this.attemptFallback();
    });

    transport.onError((error) => {
      logger.error(`[TransportFallback] Transport error:`, { error: error.message });
      this.errorCallbacks.forEach((cb) => cb(error));
    });
  }

  private async attemptFallback(): Promise<void> {
    if (this.connecting) return;

    const currentType = this.activeTransport?.type;
    const currentIndex = this.config.transportPriority.indexOf(currentType ?? 'local');

    // Try remaining transports in priority order
    for (let i = currentIndex + 1; i < this.config.transportPriority.length; i++) {
      const type = this.config.transportPriority[i];
      if (!this.isTransportConfigured(type)) continue;

      try {
        const transport = this.createTransport(type);
        const connected = await this.connectWithTimeout(transport, this.config.connectionTimeoutMs);

        if (connected) {
          this.activeTransport = {
            type,
            transport,
            connected: true,
            lastConnectedAt: Date.now(),
            failureCount: 0,
          };
          this.transports.set(type, this.activeTransport);
          this.setupTransportHandlers(transport);

          logger.info(`[TransportFallback] Fell back to ${type}`);
          this.connectCallbacks.forEach((cb) => cb());

          // Restart upgrade timer
          if (this.config.autoUpgrade) {
            this.startUpgradeTimer();
          }

          return;
        }
      } catch (err) {
        logger.warn(`[TransportFallback] Fallback to ${type} failed:`, { error: String(err) });
      }
    }

    // All fallbacks failed
    this.disconnectCallbacks.forEach((cb) => cb('All transports failed'));
  }

  private startUpgradeTimer(): void {
    this.stopUpgradeTimer();

    this.upgradeTimer = setInterval(() => {
      this.attemptUpgrade();
    }, this.config.upgradeIntervalMs);
  }

  private stopUpgradeTimer(): void {
    if (this.upgradeTimer) {
      clearInterval(this.upgradeTimer);
      this.upgradeTimer = null;
    }
  }

  private async attemptUpgrade(): Promise<void> {
    if (!this.activeTransport) return;

    const currentIndex = this.config.transportPriority.indexOf(this.activeTransport.type);
    if (currentIndex <= 0) return; // Already on best transport

    // Try to upgrade to a better transport
    for (let i = 0; i < currentIndex; i++) {
      const type = this.config.transportPriority[i];
      if (!this.isTransportConfigured(type)) continue;

      const upgraded = await this.upgradeToTransport(type);
      if (upgraded) {
        this.stopUpgradeTimer(); // Stop attempting if on best transport
        return;
      }
    }
  }
}

/**
 * Factory function for creating transport fallback manager
 */
export function createTransportFallback(config: TransportFallbackConfig): TransportFallbackManager {
  return new TransportFallbackManager(config);
}
