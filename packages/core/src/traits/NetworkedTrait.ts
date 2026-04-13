/**
 * @holoscript/core Networked Trait
 *
 * Enables real-time state synchronization for multiplayer VR/AR experiences.
 * Supports owner-authoritative, shared, and server-authoritative sync modes.
 * Integrates with SyncProtocol for WebSocket/WebRTC/Local transport.
 *
 * @version 3.0.1
 * @Sprint v3.0.x Stabilization Sprint
 *
 * @example
 * ```hsplus
 * object "Player" {
 *   @networked {
 *     mode: "owner",
 *     syncProperties: ["position", "rotation", "health"],
 *     syncRate: 20,
 *     interpolation: true
 *   }
 * }
 * ```
 */

import { SyncProtocol, type TransportType, type SyncState } from '@holoscript/mesh';
import { WebSocketTransport, type NetworkMessage } from '@holoscript/mesh';
import { WebRTCTransport } from '@holoscript/mesh';
import { logger } from '../logger';

export type NetworkSyncMode = 'owner' | 'shared' | 'server';
export type NetworkChannel = 'reliable' | 'unreliable' | 'ordered';

/**
 * Property sync configuration
 */
export interface SyncProperty {
  /** Property name/path */
  name: string;

  /** Sync priority (higher = more frequent) */
  priority?: number;

  /** Delta compression enabled */
  deltaCompression?: boolean;

  /** Quantization bits for floats (reduces bandwidth) */
  quantizationBits?: number;

  /** Custom serializer function name */
  serializer?: string;

  /** Whether to sync on change only */
  onChangeOnly?: boolean;
}

/**
 * Interpolation settings
 */
export interface InterpolationConfig {
  /** Enable interpolation */
  enabled: boolean;

  /** Interpolation delay in ms */
  delay?: number;

  /** Interpolation mode */
  mode?: 'linear' | 'hermite' | 'catmull-rom';

  /** Max extrapolation time in ms */
  maxExtrapolation?: number;

  /** Snap threshold (teleport if delta exceeds) */
  snapThreshold?: number;
}

/**
 * Network authority settings
 */
export interface AuthorityConfig {
  /** Initial owner peer ID */
  owner?: string;

  /** Can ownership be transferred */
  transferable?: boolean;

  /** Request timeout in ms */
  requestTimeout?: number;

  /** Auto-claim on interact */
  autoClaimOnInteract?: boolean;
}

/**
 * Networked trait configuration
 */
export interface NetworkedConfig {
  /** Sync mode */
  mode: NetworkSyncMode;

  /** Properties to sync */
  syncProperties?: (string | SyncProperty)[];

  /** Sync rate in Hz */
  syncRate?: number;

  /** Network channel */
  channel?: NetworkChannel;

  /** Interpolation settings */
  interpolation?: boolean | InterpolationConfig;

  /** Authority settings */
  authority?: AuthorityConfig;

  /** Room/channel for scoping */
  room?: string;

  /** Persistence settings */
  persistence?: {
    enabled: boolean;
    storageKey?: string;
    saveOnDisconnect?: boolean;
  };
}

/**
 * Network event types
 */
export type NetworkEventType =
  | 'connected'
  | 'disconnected'
  | 'peerJoined'
  | 'peerLeft'
  | 'ownershipChanged'
  | 'propertyChanged'
  | 'stateReceived'
  | 'latencyUpdate'
  | 'rpcReceived';

/**
 * Network event payload
 */
export interface NetworkEvent {
  type: NetworkEventType;
  peerId?: string;
  ownerId?: string;
  property?: string;
  value?: unknown;
  latencyMs?: number;
  timestamp: number;
}

/**
 * Interpolation sample for network smoothing
 */
interface InterpolationSample {
  timestamp: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
  properties: Record<string, unknown>;
}

/**
 * Network statistics
 */
export interface NetworkStats {
  /** Round-trip time in ms */
  rtt: number;

  /** Packets sent per second */
  packetsSentPerSecond: number;

  /** Packets received per second */
  packetsReceivedPerSecond: number;

  /** Bytes sent per second */
  bytesSentPerSecond: number;

  /** Bytes received per second */
  bytesReceivedPerSecond: number;

  /** Packet loss percentage */
  packetLoss: number;

  /** Connected peers count */
  connectedPeers: number;
}

// ============================================================================
// Shared SyncProtocol Pool
// ============================================================================

const syncProtocolPool: Map<string, SyncProtocol> = new Map();

function getOrCreateSyncProtocol(
  roomId: string,
  transport: TransportType = 'local',
  serverUrl?: string
): SyncProtocol {
  const key = `${transport}:${roomId}`;

  if (!syncProtocolPool.has(key)) {
    const protocol = new SyncProtocol({
      roomId,
      transport,
      serverUrl,
      deltaEncoding: true,
      conflictStrategy: 'last-write-wins',
    });
    syncProtocolPool.set(key, protocol);
    logger.info(`[NetworkedTrait] Created sync protocol pool for room: ${roomId}`);
  }

  return syncProtocolPool.get(key)!;
}

// ============================================================================
// NetworkedTrait Class
// ============================================================================

/**
 * NetworkedTrait - Enables multiplayer state synchronization
 */
export class NetworkedTrait {
  private config: NetworkedConfig;
  private syncState: Map<string, unknown> = new Map();
  private pendingUpdates: Map<string, unknown> = new Map();
  private lastSyncTime: number = 0;
  private eventListeners: Map<NetworkEventType, ((event: NetworkEvent) => void)[]> = new Map();
  private isOwner: boolean = false;
  private peerId: string = '';
  private connected: boolean = false;
  private syncProtocol: SyncProtocol | null = null;
  private wsTransport: WebSocketTransport | null = null;
  private rtcTransport: WebRTCTransport | null = null;
  private activeTransport: 'local' | 'websocket' | 'webrtc' = 'local';
  private entityId: string = '';
  private interpolationBuffer: InterpolationSample[] = [];
  private ownershipRequestResolve: ((approved: boolean) => void) | null = null;
  private clientId: string = '';

  constructor(config: NetworkedConfig) {
    this.config = {
      mode: config.mode || 'owner',
      syncRate: config.syncRate ?? 20,
      channel: config.channel || 'unreliable',
      interpolation: config.interpolation ?? true,
      syncProperties: config.syncProperties,
      authority: config.authority,
      room: config.room,
      persistence: config.persistence,
    };

    // Normalize syncProperties to SyncProperty[]
    if (this.config.syncProperties) {
      this.config.syncProperties = this.config.syncProperties.map((prop) => {
        if (typeof prop === 'string') {
          return { name: prop };
        }
        return prop;
      });
    }

    // Generate unique entity ID
    this.entityId = `entity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.isOwner = config.mode === 'owner';
  }

  /**
   * Connect to the network (using SyncProtocol)
   * Supports transport types: 'local', 'websocket', 'webrtc', 'auto'
   * 'auto' mode tries WebRTC → WebSocket → local in priority order
   */
  public async connect(
    transport: TransportType | 'auto' = 'local',
    serverUrl?: string
  ): Promise<void> {
    const roomId = this.config.room || 'default-room';

    // Auto-detection mode: try WebRTC → WebSocket → local
    if (transport === 'auto' && serverUrl) {
      // Try WebRTC first (lowest latency for P2P)
      try {
        this.rtcTransport = new WebRTCTransport({
          signalingServerUrl: serverUrl,
          roomId,
          iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
        });
        await this.rtcTransport.initialize();
        this.rtcTransport.onMessage((msg: unknown) => {
          const networkMsg = msg as NetworkMessage & { fromPeer?: string };
          this.handleNetworkMessage(networkMsg as unknown as Record<string, unknown>);
        });
        this.activeTransport = 'webrtc';
        this.connected = true;
        this.peerId = this.entityId;
        logger.info(`[NetworkedTrait] Auto-connected via WebRTC to: ${serverUrl}`);
        return;
      } catch (rtcError) {
        logger.warn(`[NetworkedTrait] Auto: WebRTC failed, trying WebSocket: ${rtcError}`);
        this.rtcTransport = null;
      }

      // Try WebSocket next
      try {
        this.wsTransport = new WebSocketTransport({
          serverUrl,
          roomId,
          maxReconnectAttempts: 10,
          initialBackoffMs: 1000,
          maxBackoffMs: 30000,
          heartbeatIntervalMs: 30000,
        });
        await this.wsTransport.connect();
        this.wsTransport.onMessage('state-sync', (msg: NetworkMessage) => {
          this.handleNetworkMessage(msg as unknown as Record<string, unknown>);
        });
        this.activeTransport = 'websocket';
        this.connected = true;
        this.peerId = this.entityId;
        logger.info(`[NetworkedTrait] Auto-connected via WebSocket to: ${serverUrl}`);
        return;
      } catch (wsError) {
        logger.warn(`[NetworkedTrait] Auto: WebSocket failed, falling back to local: ${wsError}`);
        this.wsTransport = null;
      }

      // Fall through to local
    }

    // Try WebSocket if explicitly requested
    if (serverUrl && transport === 'websocket') {
      try {
        this.wsTransport = new WebSocketTransport({
          serverUrl,
          roomId,
          maxReconnectAttempts: 10,
          initialBackoffMs: 1000,
          maxBackoffMs: 30000,
          heartbeatIntervalMs: 30000,
        });

        await this.wsTransport.connect();

        this.wsTransport.onMessage('state-sync', (msg: NetworkMessage) => {
          this.handleNetworkMessage(msg as unknown as Record<string, unknown>);
        });

        this.activeTransport = 'websocket';
        this.connected = true;
        this.peerId = this.entityId;
        logger.info(`[NetworkedTrait] Connected via WebSocket to: ${serverUrl}`);
        return;
      } catch (error) {
        logger.warn(`[NetworkedTrait] WebSocket connection failed, trying fallback: ${error}`);
        // Fall through to fallback
      }
    }

    // Try WebRTC if explicitly requested
    if (serverUrl && transport === 'webrtc') {
      try {
        this.rtcTransport = new WebRTCTransport({
          signalingServerUrl: serverUrl,
          roomId,
          iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
        });

        await this.rtcTransport.initialize();

        this.rtcTransport.onMessage((msg: unknown) => {
          const networkMsg = msg as NetworkMessage & { fromPeer?: string };
          this.handleNetworkMessage(networkMsg as unknown as Record<string, unknown>);
        });

        this.activeTransport = 'webrtc';
        this.connected = true;
        this.peerId = this.entityId;
        logger.info(`[NetworkedTrait] Connected via WebRTC to: ${serverUrl}`);
        return;
      } catch (error) {
        logger.warn(`[NetworkedTrait] WebRTC connection failed, using local sync: ${error}`);
        // Fall through to local
      }
    }

    // Fallback to local SyncProtocol
    this.syncProtocol = getOrCreateSyncProtocol(roomId, 'local', serverUrl);

    // Subscribe to state updates
    this.syncProtocol.on('state-updated', (event) => {
      const data = event.data as { entityId: string; state: SyncState };
      if (data.entityId === this.entityId && !this.isOwner) {
        this.handleRemoteUpdate(data.state);
      }
    });

    this.syncProtocol.on('connected', () => {
      this.setConnected(true, this.entityId);
    });

    this.syncProtocol.on('disconnected', (event) => {
      const data = event.data as { reason: string } | undefined;
      logger.info(`[NetworkedTrait] Disconnected: ${data?.reason || 'unknown'}`);
      this.setConnected(false);
    });

    this.syncProtocol.on('ownership-request', (event) => {
      const { entityId, requesterId } = event.data as { entityId: string; requesterId: string };
      if (entityId === this.entityId && this.isOwner) {
        const approved = this.config.authority?.transferable ?? true;
        if (approved) {
          this.setOwner(false);
        }
        this.syncProtocol?.respondToOwnership(entityId, requesterId, approved);
      }
    });

    this.syncProtocol.on('ownership-response', (event) => {
      const { entityId, approved, ownerId } = event.data as {
        entityId: string;
        approved: boolean;
        ownerId: string;
      };
      if (entityId === this.entityId) {
        this.setOwner(approved && ownerId === this.clientId, ownerId);
        if (this.ownershipRequestResolve) {
          this.ownershipRequestResolve(approved);
          this.ownershipRequestResolve = null;
        }
      }
    });

    this.syncProtocol.on('rpc', (event) => {
      const { method, args, from } = event.data as {
        method: string;
        args: unknown[];
        from: string;
      };
      this.emit('rpcReceived', {
        type: 'rpcReceived',
        property: method,
        value: args,
        peerId: from,
        timestamp: Date.now(),
      });
    });

    // Connect if not already connected
    if (!this.syncProtocol.isConnected()) {
      await this.syncProtocol.connect();
    }

    this.activeTransport = 'local';
    this.connected = true;
    this.clientId = this.syncProtocol.getClientId();
    this.peerId = this.entityId;
    logger.info(`[NetworkedTrait] Connected to room: ${roomId}`);
  }

  /**
   * Handle remote state update
   */
  private handleRemoteUpdate(syncState: SyncState): void {
    const props = syncState.properties;
    const interpConfig = this.getInterpolationConfig();

    if (interpConfig.enabled) {
      // Add to interpolation buffer
      const sample: InterpolationSample = {
        timestamp: syncState.timestamp,
        position: (props.position as [number, number, number]) || [0, 0, 0],
        rotation: (props.rotation as [number, number, number, number]) || [0, 0, 0, 1],
        scale: (props.scale as [number, number, number]) || [1, 1, 1],
        properties: props,
      };

      this.interpolationBuffer.push(sample);

      // Keep buffer limited
      const maxBufferSize = 10;
      while (this.interpolationBuffer.length > maxBufferSize) {
        this.interpolationBuffer.shift();
      }
    } else {
      // Direct application
      this.applyState(props);
    }
  }

  /**
   * Handle incoming network message from WebSocket/WebRTC
   */
  private handleNetworkMessage(message: Record<string, unknown>): void {
    const { type, entityId, data, timestamp } = message;

    if (entityId !== this.entityId) {
      return; // Message not for this entity
    }

    switch (type) {
      case 'state-sync':
        this.handleRemoteUpdate({
          entityId: (entityId as string) || this.entityId,
          version: 1,
          timestamp: (timestamp as number) || Date.now(),
          properties: (data as Record<string, unknown>) || {},
        });
        this.emit('stateReceived', {
          type: 'stateReceived',
          timestamp: Date.now(),
        });
        break;

      case 'ownership-transfer':
        const { newOwner } = data as { newOwner: string };
        this.setOwner(newOwner === this.peerId, newOwner);
        break;

      default:
        logger.debug(`[NetworkedTrait] Unknown message type: ${type}`);
    }
  }

  /**
   * Sync state to network
   */
  public syncToNetwork(): void {
    if (!this.connected || !this.isOwner) return;

    if (this.shouldSync()) {
      const updates = this.flushUpdates();
      if (Object.keys(updates).length > 0) {
        const message: Omit<NetworkMessage, 'roomId' | 'id' | 'peerId' | 'timestamp'> = {
          type: 'state-sync',
          payload: {
            entityId: this.entityId,
            data: updates,
          },
        };

        if (this.activeTransport === 'websocket' && this.wsTransport) {
          this.wsTransport.sendMessage(message as NetworkMessage);
        } else if (this.activeTransport === 'webrtc' && this.rtcTransport) {
          this.rtcTransport.sendMessage(null, message as NetworkMessage);
        } else if (this.syncProtocol) {
          this.syncProtocol.syncState(this.entityId, updates);
        }
      }
    }
  }

  /**
   * Get interpolated state for rendering
   */
  public getInterpolatedState(bufferTimeMs: number = 100): InterpolationSample | null {
    const buffer = this.interpolationBuffer;
    if (buffer.length < 2) return buffer[0] || null;

    const renderTime = Date.now() - bufferTimeMs;

    // Find surrounding samples
    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
        const older = buffer[i];
        const newer = buffer[i + 1];
        const t = (renderTime - older.timestamp) / (newer.timestamp - older.timestamp);
        const clampedT = Math.max(0, Math.min(1, t));

        return {
          timestamp: renderTime,
          position: this.lerpVector3(older.position, newer.position, clampedT),
          rotation: this.slerpQuat(older.rotation, newer.rotation, clampedT),
          scale: this.lerpVector3(older.scale, newer.scale, clampedT),
          properties: newer.properties,
        };
      }
    }

    const latest = buffer[buffer.length - 1];

    // Extrapolate if past the latest sample
    if (latest.timestamp <= renderTime) {
      const dtMs = renderTime - latest.timestamp;
      // @ts-ignore - access internal config helper
      const interpConfig =
        typeof this['getInterpolationConfig'] === 'function'
          ? this['getInterpolationConfig']()
          : this.config.interpolation;
      const maxExtrapolationMs =
        (interpConfig && typeof interpConfig === 'object' ? interpConfig.maxExtrapolation : 250) ??
        250;

      if (dtMs > 0 && dtMs <= maxExtrapolationMs) {
        const dtSec = dtMs / 1000;
        const props = latest.properties;
        const position = [...latest.position] as [number, number, number];
        let rotation = [...latest.rotation] as [number, number, number, number];

        // Extrapolate Position using linear velocity
        const vel = props.velocity as { x: number; y: number; z: number } | undefined;
        if (vel) {
          position[0] += vel.x * dtSec;
          position[1] += vel.y * dtSec;
          position[2] += vel.z * dtSec;
        }

        // Extrapolate Rotation using angular velocity (quaternion integration)
        const aVel = props.angularVelocity as { x: number; y: number; z: number } | undefined;
        if (aVel) {
          const wx = aVel.x * dtSec;
          const wy = aVel.y * dtSec;
          const wz = aVel.z * dtSec;
          const len = Math.sqrt(wx * wx + wy * wy + wz * wz);
          if (len > 0.0001) {
            const halfLen = len * 0.5;
            const sinHalf = Math.sin(halfLen);
            const cosHalf = Math.cos(halfLen);
            const dqx = (wx / len) * sinHalf;
            const dqy = (wy / len) * sinHalf;
            const dqz = (wz / len) * sinHalf;
            const dqw = cosHalf;

            const qx = rotation[0],
              qy = rotation[1],
              qz = rotation[2],
              qw = rotation[3];

            const nx = dqw * qx + dqx * qw + dqy * qz - dqz * qy;
            const ny = dqw * qy - dqx * qz + dqy * qw + dqz * qx;
            const nz = dqw * qz + dqx * qy - dqy * qx + dqz * qw;
            const nw = dqw * qw - dqx * qx - dqy * qy - dqz * qz;

            const norm = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw) || 1;
            rotation = [nx / norm, ny / norm, nz / norm, nw / norm];
          }
        }

        return {
          timestamp: renderTime,
          position,
          rotation,
          scale: latest.scale,
          properties: latest.properties,
        };
      }
    }

    return latest;
  }

  private lerpVector3(
    a: [number, number, number],
    b: [number, number, number],
    t: number
  ): [number, number, number] {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  private slerpQuat(
    a: [number, number, number, number],
    b: [number, number, number, number],
    t: number
  ): [number, number, number, number] {
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const bNorm: [number, number, number, number] = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : [...b];
    dot = Math.abs(dot);

    if (dot > 0.9995) {
      const result: [number, number, number, number] = [
        a[0] + (bNorm[0] - a[0]) * t,
        a[1] + (bNorm[1] - a[1]) * t,
        a[2] + (bNorm[2] - a[2]) * t,
        a[3] + (bNorm[3] - a[3]) * t,
      ];
      const len = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2 + result[3] ** 2);
      return [result[0] / len, result[1] / len, result[2] / len, result[3] / len];
    }

    const theta0 = Math.acos(dot);
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);
    const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
    const s1 = sinTheta / sinTheta0;

    return [
      a[0] * s0 + bNorm[0] * s1,
      a[1] * s0 + bNorm[1] * s1,
      a[2] * s0 + bNorm[2] * s1,
      a[3] * s0 + bNorm[3] * s1,
    ];
  }

  /**
   * Disconnect from network
   */
  public disconnect(): void {
    if (this.connected) {
      if (this.wsTransport) {
        this.wsTransport.disconnect();
        this.wsTransport = null;
      }
      if (this.rtcTransport) {
        this.rtcTransport.disconnect();
        this.rtcTransport = null;
      }
      if (this.syncProtocol && this.activeTransport === 'local') {
        // Don't disconnect shared pool, just mark ourselves disconnected
      }

      this.connected = false;
      this.setConnected(false);
      logger.info(`[NetworkedTrait] Disconnected entity: ${this.entityId}`);
    }
  }

  /**
   * Get entity ID
   */
  public getEntityId(): string {
    return this.entityId;
  }

  /**
   * Get current latency
   */
  public getLatency(): number {
    return this.syncProtocol?.getLatency() || 0;
  }

  /**
   * Get configuration
   */
  public getConfig(): NetworkedConfig {
    return { ...this.config };
  }

  /**
   * Set property value (will be synced)
   */
  public setProperty(name: string, value: unknown): void {
    this.syncState.set(name, value);
    this.pendingUpdates.set(name, value);

    this.emit('propertyChanged', {
      type: 'propertyChanged',
      property: name,
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Get property value
   */
  public getProperty(name: string): unknown {
    return this.syncState.get(name);
  }

  /**
   * Get all synced properties
   */
  public getState(): Record<string, unknown> {
    const state: Record<string, unknown> = {};
    for (const [key, value] of this.syncState) {
      state[key] = value;
    }
    return state;
  }

  /**
   * Apply received state (from network)
   */
  public applyState(state: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(state)) {
      this.syncState.set(key, value);
    }

    // Also populate interpolation buffer if enabled
    const interpConfig = this.getInterpolationConfig();
    if (interpConfig.enabled) {
      const sample: InterpolationSample = {
        timestamp: Date.now(),
        position: (state.position as [number, number, number]) || [0, 0, 0],
        rotation: (state.rotation as [number, number, number, number]) || [0, 0, 0, 1],
        scale: (state.scale as [number, number, number]) || [1, 1, 1],
        properties: state,
      };
      this.interpolationBuffer.push(sample);

      const maxBufferSize = 10;
      while (this.interpolationBuffer.length > maxBufferSize) {
        this.interpolationBuffer.shift();
      }
    }

    this.emit('stateReceived', {
      type: 'stateReceived',
      timestamp: Date.now(),
    });
  }

  /**
   * Check if should sync (based on rate limiting)
   */
  public shouldSync(): boolean {
    const now = Date.now();
    const interval = 1000 / (this.config.syncRate || 20);
    if (now - this.lastSyncTime >= interval) {
      this.lastSyncTime = now;
      return this.pendingUpdates.size > 0;
    }
    return false;
  }

  /**
   * Get pending updates and clear
   */
  public flushUpdates(): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    for (const [key, value] of this.pendingUpdates) {
      updates[key] = value;
    }
    this.pendingUpdates.clear();
    return updates;
  }

  /**
   * Request ownership of this entity
   */
  public async requestOwnership(): Promise<boolean> {
    if (this.isOwner) return true;
    if (!this.config.authority?.transferable) {
      return false;
    }

    // If not connected to a network, grant ownership locally
    if (!this.syncProtocol) {
      this.setOwner(true);
      return true;
    }

    return new Promise((resolve) => {
      this.ownershipRequestResolve = resolve;
      this.syncProtocol?.requestOwnership(this.entityId);

      // Timeout request after configured time
      setTimeout(() => {
        if (this.ownershipRequestResolve === resolve) {
          this.ownershipRequestResolve(false);
          this.ownershipRequestResolve = null;
        }
      }, this.config.authority?.requestTimeout || 5000);
    });
  }

  /**
   * Release ownership
   */
  public releaseOwnership(): void {
    if (this.isOwner) {
      this.isOwner = false;
      this.emit('ownershipChanged', {
        type: 'ownershipChanged',
        ownerId: undefined,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Check if local peer is owner
   */
  public isLocalOwner(): boolean {
    return this.isOwner;
  }

  /**
   * Set owner status (called by network layer)
   */
  public setOwner(isOwner: boolean, ownerId?: string): void {
    this.isOwner = isOwner;
    this.emit('ownershipChanged', {
      type: 'ownershipChanged',
      ownerId,
      timestamp: Date.now(),
    });
  }

  /**
   * Add event listener
   */
  public on(event: NetworkEventType, callback: (event: NetworkEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  public off(event: NetworkEventType, callback: (event: NetworkEvent) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(type: NetworkEventType, event: NetworkEvent): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      for (const callback of listeners) {
        callback(event);
      }
    }
  }

  /**
   * Serialize state for network transmission
   */
  public serialize(): ArrayBuffer {
    const state = this.getState();
    const json = JSON.stringify(state);
    const encoder = new TextEncoder();
    return encoder.encode(json).buffer;
  }

  /**
   * Deserialize state from network
   */
  public deserialize(buffer: ArrayBuffer): void {
    const decoder = new TextDecoder();
    const json = decoder.decode(buffer);
    const state = JSON.parse(json);
    this.applyState(state);
  }

  /**
   * Get interpolation config
   */
  public getInterpolationConfig(): InterpolationConfig {
    if (typeof this.config.interpolation === 'boolean') {
      return {
        enabled: this.config.interpolation,
        delay: 100,
        mode: 'linear',
        maxExtrapolation: 200,
        snapThreshold: 5,
      };
    }
    return this.config.interpolation || { enabled: false };
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get active transport type
   */
  public getActiveTransport(): 'local' | 'websocket' | 'webrtc' {
    return this.activeTransport;
  }

  /**
   * Connect via WebSocket with convenience method
   */
  public async connectWebSocket(serverUrl: string): Promise<void> {
    await this.connect('websocket', serverUrl);
  }

  /**
   * Connect via WebRTC with convenience method
   */
  public async connectWebRTC(signalingUrl: string): Promise<void> {
    await this.connect('webrtc', signalingUrl);
  }

  /**
   * Connect with auto-detection (WebRTC → WebSocket → local)
   */
  public async connectAuto(serverUrl: string): Promise<void> {
    await this.connect('auto', serverUrl);
  }

  /**
   * Set connection status
   */
  public setConnected(connected: boolean, peerId?: string): void {
    this.connected = connected;
    if (peerId) {
      this.peerId = peerId;
    }

    this.emit(connected ? 'connected' : 'disconnected', {
      type: connected ? 'connected' : 'disconnected',
      peerId: this.peerId,
      timestamp: Date.now(),
    });
  }
}

/**
 * HoloScript+ @networked trait factory
 */
export function createNetworkedTrait(config?: Partial<NetworkedConfig>): NetworkedTrait {
  return new NetworkedTrait({
    mode: config?.mode || 'owner',
    syncRate: config?.syncRate ?? 20,
    interpolation: config?.interpolation ?? true,
    ...config,
  });
}

// Re-export type aliases for index.ts
export type SyncMode = NetworkSyncMode;
export type InterpolationType = InterpolationConfig;
export type SyncedProperty = SyncProperty;
export type NetworkAuthority = AuthorityConfig;

/**
 * Cleanup all shared sync protocols (call on app shutdown)
 */
export function cleanupNetworkPool(): void {
  for (const [key, protocol] of syncProtocolPool) {
    protocol.disconnect();
    syncProtocolPool.delete(key);
  }
  logger.info('[NetworkedTrait] Cleaned up sync protocol pool');
}

export default NetworkedTrait;

// ── Handler (delegates to NetworkedTrait) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const networkedHandler = {
  name: 'networked',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new NetworkedTrait(config);
    node.__networked_instance = instance;
    ctx.emit('networked_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__networked_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('networked_detached', { node });
    delete node.__networked_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__networked_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'networked_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('networked_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__networked_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
