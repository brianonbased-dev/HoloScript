/**
 * HoloScript Real-time Sync Protocol
 *
 * Efficient state synchronization for multi-device XR experiences.
 * Supports WebSocket, WebRTC, and simulated QUIC transports with
 * delta encoding, interest management, and conflict resolution.
 */

import { logger } from '../logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type TransportType = 'websocket' | 'webrtc' | 'quic' | 'local';
export type SerializationType = 'json' | 'msgpack' | 'cbor';
export type ConflictStrategy = 'last-write-wins' | 'server-authority' | 'merge' | 'custom';

export interface SyncProtocolConfig {
  transport: TransportType;
  serialization: SerializationType;
  compression: boolean;
  deltaEncoding: boolean;
  serverUrl?: string;
  roomId: string;
  clientId?: string;
  conflictStrategy: ConflictStrategy;
  conflictResolver?: (local: SyncState, remote: SyncState) => SyncState;
}

export interface SyncOptimizations {
  interestManagement: boolean;
  distanceCulling: number;
  updateThrottle: number;
  batchWindow: number;
  changeThreshold: number;
}

export interface SyncState {
  entityId: string;
  version: number;
  timestamp: number;
  properties: Record<string, unknown>;
  owner?: string;
}

export interface SyncDelta {
  entityId: string;
  baseVersion: number;
  targetVersion: number;
  changes: DeltaChange[];
  timestamp: number;
}

export interface DeltaChange {
  path: string;
  op: 'set' | 'delete' | 'increment' | 'append';
  value?: unknown;
  previousValue?: unknown;
}

export interface SyncMessage {
  type:
    | 'full-state'
    | 'delta'
    | 'request-state'
    | 'ack'
    | 'presence'
    | 'rpc'
    | 'ownership-request'
    | 'ownership-response';
  senderId: string;
  roomId: string;
  sequence: number;
  payload: unknown;
  timestamp: number;
  compressed?: boolean;
}

export interface PresenceInfo {
  clientId: string;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  metadata?: Record<string, unknown>;
  lastSeen: number;
}

export interface InterestArea {
  center: [number, number, number];
  radius: number;
  priorities?: Map<string, number>;
}

export interface SyncStats {
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  avgLatency: number;
  packetsLost: number;
  deltaEfficiency: number;
  connectedPeers: number;
}

// ============================================================================
// Delta Encoder
// ============================================================================

export class DeltaEncoder {
  private stateCache: Map<string, SyncState> = new Map();
  private changeThreshold: number;

  constructor(changeThreshold: number = 0.001) {
    this.changeThreshold = changeThreshold;
  }

  public encode(entityId: string, newState: Record<string, unknown>): SyncDelta | null {
    const cached = this.stateCache.get(entityId);

    if (!cached) {
      this.stateCache.set(entityId, {
        entityId,
        version: 1,
        timestamp: Date.now(),
        properties: { ...newState },
      });
      return null;
    }

    const changes: DeltaChange[] = [];
    const newVersion = cached.version + 1;

    for (const [key, value] of Object.entries(newState)) {
      const oldValue = cached.properties[key];
      if (!this.valuesEqual(oldValue, value)) {
        changes.push({ path: key, op: 'set', value, previousValue: oldValue });
      }
    }

    for (const key of Object.keys(cached.properties)) {
      if (!(key in newState)) {
        changes.push({ path: key, op: 'delete', previousValue: cached.properties[key] });
      }
    }

    if (changes.length === 0) return null;

    this.stateCache.set(entityId, {
      entityId,
      version: newVersion,
      timestamp: Date.now(),
      properties: { ...newState },
    });

    return {
      entityId,
      baseVersion: cached.version,
      targetVersion: newVersion,
      changes,
      timestamp: Date.now(),
    };
  }

  public decode(delta: SyncDelta): SyncState {
    const cached = this.stateCache.get(delta.entityId);
    const baseProperties = cached?.properties ?? {};
    const newProperties = { ...baseProperties };

    for (const change of delta.changes) {
      if (change.op === 'set') {
        this.setNestedValue(newProperties, change.path, change.value);
      } else if (change.op === 'delete') {
        this.deleteNestedValue(newProperties, change.path);
      } else if (change.op === 'increment') {
        const currentValue = (this.getNestedValue(newProperties, change.path) as number) ?? 0;
        this.setNestedValue(newProperties, change.path, currentValue + (change.value as number));
      } else if (change.op === 'append') {
        const currentArray = (this.getNestedValue(newProperties, change.path) as unknown[]) ?? [];
        const appendValues = Array.isArray(change.value) ? change.value : [change.value];
        this.setNestedValue(newProperties, change.path, [...currentArray, ...appendValues]);
      }
    }

    const newState: SyncState = {
      entityId: delta.entityId,
      version: delta.targetVersion,
      timestamp: delta.timestamp,
      properties: newProperties,
    };

    this.stateCache.set(delta.entityId, newState);
    return newState;
  }

  public getCachedState(entityId: string): SyncState | undefined {
    return this.stateCache.get(entityId);
  }

  public setFullState(entityId: string, state: SyncState): void {
    this.stateCache.set(entityId, state);
  }

  public clear(): void {
    this.stateCache.clear();
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b) < this.changeThreshold;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => this.valuesEqual(v, b[i]));
    }
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) =>
        this.valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      );
    }
    return false;
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }

  private deleteNestedValue(obj: Record<string, unknown>, path: string): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) return;
      current = current[parts[i]] as Record<string, unknown>;
    }
    delete current[parts[parts.length - 1]];
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}

// ============================================================================
// Interest Manager
// ============================================================================

export class InterestManager {
  private interests: Map<string, InterestArea> = new Map();
  private entityPositions: Map<string, [number, number, number]> = new Map();

  public setInterest(clientId: string, area: InterestArea): void {
    this.interests.set(clientId, area);
  }

  public removeInterest(clientId: string): void {
    this.interests.delete(clientId);
  }

  public updateEntityPosition(entityId: string, position: [number, number, number]): void {
    this.entityPositions.set(entityId, position);
  }

  public isInInterest(clientId: string, entityId: string): boolean {
    const interest = this.interests.get(clientId);
    if (!interest) return true;
    const entityPos = this.entityPositions.get(entityId);
    if (!entityPos) return true;
    return this.distance3D(interest.center, entityPos) <= interest.radius;
  }

  public getEntitiesInInterest(clientId: string): string[] {
    const interest = this.interests.get(clientId);
    if (!interest) return Array.from(this.entityPositions.keys());
    return Array.from(this.entityPositions.entries())
      .filter(([, pos]) => this.distance3D(interest.center, pos) <= interest.radius)
      .map(([id]) => id);
  }

  public getPriority(clientId: string, entityId: string): number {
    const interest = this.interests.get(clientId);
    if (!interest) return 1;
    if (interest.priorities?.has(entityId)) {
      return interest.priorities.get(entityId)!;
    }
    const entityPos = this.entityPositions.get(entityId);
    if (!entityPos) return 1;
    const distance = this.distance3D(interest.center, entityPos);
    return 1 - Math.min(1, distance / interest.radius) * 0.5;
  }

  private distance3D(a: [number, number, number], b: [number, number, number]): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  }
}

// ============================================================================
// Transport Abstraction
// ============================================================================

export interface Transport {
  connect(): Promise<void>;
  disconnect(): void;
  send(message: SyncMessage): void;
  onMessage(callback: (message: SyncMessage) => void): void;
  onConnect(callback: () => void): void;
  onDisconnect(callback: (reason: string) => void): void;
  onError(callback: (error: Error) => void): void;
  isConnected(): boolean;
  getLatency(): number;
}

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private url: string;
  private messageCallbacks: Set<(message: SyncMessage) => void> = new Set();
  private connectCallbacks: Set<() => void> = new Set();
  private disconnectCallbacks: Set<(reason: string) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private latency: number = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPingTime: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.startPingInterval();
          this.connectCallbacks.forEach((cb) => cb());
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string) as SyncMessage;
            if (message.type === 'ack' && (message.payload as Record<string, unknown>)?.pong) {
              this.latency = Date.now() - this.lastPingTime;
              return;
            }
            this.messageCallbacks.forEach((cb) => cb(message));
          } catch {
            logger.error('[WebSocketTransport] Failed to parse message');
          }
        };

        this.ws.onclose = (event) => {
          this.stopPingInterval();
          this.disconnectCallbacks.forEach((cb) => cb(event.reason || 'Connection closed'));
          this.attemptReconnect();
        };

        this.ws.onerror = () => {
          const error = new Error('WebSocket error');
          this.errorCallbacks.forEach((cb) => cb(error));
          reject(error);
        };
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  disconnect(): void {
    this.stopPingInterval();
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: SyncMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
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
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getLatency(): number {
    return this.latency;
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now();
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 5000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => {
      logger.info(`[WebSocketTransport] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect().catch(() => {
        logger.error('[WebSocketTransport] Reconnect failed');
      });
    }, delay);
  }
}

export class WebRTCTransport implements Transport {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private messageCallbacks: Set<(message: SyncMessage) => void> = new Set();
  private connectCallbacks: Set<() => void> = new Set();
  private disconnectCallbacks: Set<(reason: string) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private latency: number = 0;
  private signalingUrl: string;

  constructor(signalingUrl: string) {
    this.signalingUrl = signalingUrl;
  }

  async connect(): Promise<void> {
    const config: RTCConfiguration = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    this.peerConnection = new RTCPeerConnection(config);
    this.dataChannel = this.peerConnection.createDataChannel('holoscript-sync', {
      ordered: false,
      maxRetransmits: 0,
    });

    return new Promise((resolve, reject) => {
      if (!this.dataChannel) {
        reject(new Error('Failed to create data channel'));
        return;
      }

      this.dataChannel.onopen = () => {
        this.connectCallbacks.forEach((cb) => cb());
        resolve();
      };

      this.dataChannel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as SyncMessage;
          this.messageCallbacks.forEach((cb) => cb(message));
        } catch {
          logger.error('[WebRTCTransport] Failed to parse message');
        }
      };

      this.dataChannel.onclose = () => {
        this.disconnectCallbacks.forEach((cb) => cb('Data channel closed'));
      };

      this.dataChannel.onerror = () => {
        const error = new Error('WebRTC data channel error');
        this.errorCallbacks.forEach((cb) => cb(error));
        reject(error);
      };

      this.peerConnection!.createOffer()
        .then((offer) => this.peerConnection!.setLocalDescription(offer))
        .catch(reject);
    });
  }

  disconnect(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  send(message: SyncMessage): void {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message));
    }
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
    return this.dataChannel?.readyState === 'open';
  }

  getLatency(): number {
    return this.latency;
  }
}

export class LocalBroadcastTransport implements Transport {
  private channel: BroadcastChannel | null = null;
  private channelName: string;
  private messageCallbacks: Set<(message: SyncMessage) => void> = new Set();
  private connectCallbacks: Set<() => void> = new Set();
  private disconnectCallbacks: Set<(reason: string) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private connected: boolean = false;

  constructor(channelName: string) {
    this.channelName = channelName;
  }

  connect(): Promise<void> {
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.onmessage = (event) => {
      const message = event.data as SyncMessage;
      this.messageCallbacks.forEach((cb) => cb(message));
    };
    this.connected = true;
    this.connectCallbacks.forEach((cb) => cb());
    return Promise.resolve();
  }

  disconnect(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.connected = false;
    this.disconnectCallbacks.forEach((cb) => cb('Disconnected'));
  }

  send(message: SyncMessage): void {
    if (this.channel) {
      this.channel.postMessage(message);
    }
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
    return this.connected;
  }

  getLatency(): number {
    return 1; // Near-instant for local
  }
}

// ============================================================================
// Sync Protocol
// ============================================================================

export type SyncEventType =
  | 'connected'
  | 'disconnected'
  | 'state-updated'
  | 'presence-updated'
  | 'ownership-request'
  | 'ownership-response'
  | 'rpc'
  | 'error';
export type SyncEventCallback = (event: { type: SyncEventType; data?: unknown }) => void;

export class SyncProtocol {
  private config: SyncProtocolConfig;
  private optimizations: SyncOptimizations;
  private transport: Transport | null = null;
  private deltaEncoder: DeltaEncoder;
  private interestManager: InterestManager;
  private sequence: number = 0;
  private clientId: string;
  private eventCallbacks: Map<SyncEventType, Set<SyncEventCallback>> = new Map();
  private pendingUpdates: Map<string, SyncDelta> = new Map();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private throttleTimers: Map<string, number> = new Map();
  private presence: Map<string, PresenceInfo> = new Map();
  private stats: SyncStats;

  constructor(
    config: Partial<SyncProtocolConfig> & { roomId: string },
    optimizations?: Partial<SyncOptimizations>
  ) {
    this.config = {
      transport: config.transport || 'websocket',
      serialization: config.serialization || 'json',
      compression: config.compression ?? false,
      deltaEncoding: config.deltaEncoding ?? true,
      serverUrl: config.serverUrl,
      roomId: config.roomId,
      clientId: config.clientId || this.generateClientId(),
      conflictStrategy: config.conflictStrategy || 'last-write-wins',
      conflictResolver: config.conflictResolver,
    };

    this.optimizations = {
      interestManagement: optimizations?.interestManagement ?? false,
      distanceCulling: optimizations?.distanceCulling ?? 100,
      updateThrottle: optimizations?.updateThrottle ?? 60,
      batchWindow: optimizations?.batchWindow ?? 16,
      changeThreshold: optimizations?.changeThreshold ?? 0.001,
    };

    this.clientId = this.config.clientId!;
    this.deltaEncoder = new DeltaEncoder(this.optimizations.changeThreshold);
    this.interestManager = new InterestManager();
    this.stats = this.createDefaultStats();
  }

  async connect(): Promise<void> {
    switch (this.config.transport) {
      case 'websocket':
      case 'quic':
        if (!this.config.serverUrl) {
          throw new Error('serverUrl required for WebSocket/QUIC transport');
        }
        this.transport = new WebSocketTransport(this.config.serverUrl);
        break;
      case 'webrtc':
        this.transport = new WebRTCTransport(this.config.serverUrl || '');
        break;
      case 'local':
      default:
        this.transport = new LocalBroadcastTransport(`holoscript:${this.config.roomId}`);
    }

    this.transport.onMessage((msg) => this.handleMessage(msg));
    this.transport.onConnect(() => this.emit('connected', { clientId: this.clientId }));
    this.transport.onDisconnect((reason) => this.emit('disconnected', { reason }));
    this.transport.onError((error) => this.emit('error', { error }));

    await this.transport.connect();
    this.sendMessage({ type: 'request-state', payload: { clientId: this.clientId } });
  }

  disconnect(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.transport?.disconnect();
    this.transport = null;
  }

  syncState(entityId: string, state: Record<string, unknown>): void {
    const now = Date.now();
    const lastUpdate = this.throttleTimers.get(entityId) || 0;
    if (now - lastUpdate < 1000 / this.optimizations.updateThrottle) {
      return;
    }
    this.throttleTimers.set(entityId, now);

    if (state.position) {
      this.interestManager.updateEntityPosition(
        entityId,
        state.position as [number, number, number]
      );
    }

    if (this.config.deltaEncoding) {
      const delta = this.deltaEncoder.encode(entityId, state);
      if (delta) {
        this.pendingUpdates.set(entityId, delta);
        this.scheduleBatch();
      }
    } else {
      this.sendMessage({
        type: 'full-state',
        payload: {
          entityId,
          version: now,
          timestamp: now,
          properties: state,
          owner: this.clientId,
        },
      });
    }
  }

  updatePresence(info: Partial<PresenceInfo>): void {
    const presence: PresenceInfo = {
      clientId: this.clientId,
      position: info.position,
      rotation: info.rotation,
      metadata: info.metadata,
      lastSeen: Date.now(),
    };
    this.presence.set(this.clientId, presence);
    this.sendMessage({ type: 'presence', payload: presence });

    if (info.position) {
      this.interestManager.setInterest(this.clientId, {
        center: info.position,
        radius: this.optimizations.distanceCulling,
      });
    }
  }

  sendRPC(method: string, args: unknown[], targetClient?: string): void {
    this.sendMessage({
      type: 'rpc',
      payload: { method, args, target: targetClient, from: this.clientId },
    });
  }

  requestOwnership(entityId: string): void {
    this.sendMessage({
      type: 'ownership-request',
      payload: { entityId, requesterId: this.clientId },
    });
  }

  respondToOwnership(entityId: string, requesterId: string, approved: boolean): void {
    this.sendMessage({
      type: 'ownership-response',
      payload: { entityId, approved, ownerId: approved ? requesterId : this.clientId },
    });
  }

  getState(entityId: string): SyncState | undefined {
    return this.deltaEncoder.getCachedState(entityId);
  }

  getPresence(): Map<string, PresenceInfo> {
    return new Map(this.presence);
  }

  getStats(): SyncStats {
    return { ...this.stats };
  }

  getClientId(): string {
    return this.clientId;
  }

  on(event: SyncEventType, callback: SyncEventCallback): () => void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, new Set());
    }
    this.eventCallbacks.get(event)!.add(callback);
    return () => this.eventCallbacks.get(event)?.delete(callback);
  }

  isConnected(): boolean {
    return this.transport?.isConnected() ?? false;
  }

  getLatency(): number {
    return this.transport?.getLatency() ?? 0;
  }

  private handleMessage(message: SyncMessage): void {
    this.stats.messagesReceived++;
    this.stats.bytesReceived += JSON.stringify(message).length;

    if (message.senderId === this.clientId) return;

    switch (message.type) {
      case 'full-state': {
        const state = message.payload as SyncState;
        const resolved = this.resolveConflict(state);
        this.deltaEncoder.setFullState(state.entityId, resolved);
        this.emit('state-updated', { entityId: state.entityId, state: resolved });
        break;
      }
      case 'delta': {
        const delta = message.payload as SyncDelta;
        const state = this.deltaEncoder.decode(delta);
        this.emit('state-updated', { entityId: delta.entityId, state });
        break;
      }
      case 'presence': {
        const presence = message.payload as PresenceInfo;
        this.presence.set(presence.clientId, presence);
        this.emit('presence-updated', { presence });
        break;
      }
      case 'ownership-request': {
        const payload = message.payload as { entityId: string; requesterId: string };
        this.emit('ownership-request', { ...payload, senderId: message.senderId });
        break;
      }
      case 'ownership-response': {
        const payload = message.payload as { entityId: string; approved: boolean; ownerId: string };
        this.emit('ownership-response', payload);
        break;
      }
      case 'rpc': {
        const payload = message.payload as {
          method: string;
          args: unknown[];
          target?: string;
          from: string;
        };
        if (!payload.target || payload.target === this.clientId) {
          this.emit('rpc', payload);
        }
        break;
      }
    }
  }

  private resolveConflict(remoteState: SyncState): SyncState {
    const localState = this.deltaEncoder.getCachedState(remoteState.entityId);
    if (!localState) return remoteState;

    switch (this.config.conflictStrategy) {
      case 'last-write-wins':
        return remoteState.timestamp > localState.timestamp ? remoteState : localState;
      case 'server-authority':
        return remoteState;
      case 'merge':
        return {
          ...localState,
          ...remoteState,
          properties: { ...localState.properties, ...remoteState.properties },
          version: Math.max(localState.version, remoteState.version) + 1,
          timestamp: Date.now(),
        };
      case 'custom':
        return this.config.conflictResolver
          ? this.config.conflictResolver(localState, remoteState)
          : remoteState;
      default:
        return remoteState;
    }
  }

  private scheduleBatch(): void {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.flushBatch();
      this.batchTimer = null;
    }, this.optimizations.batchWindow);
  }

  private flushBatch(): void {
    if (this.pendingUpdates.size === 0) return;

    for (const [, delta] of this.pendingUpdates) {
      this.sendMessage({ type: 'delta', payload: delta });
    }
    this.pendingUpdates.clear();
  }

  private sendMessage(
    partial: Omit<SyncMessage, 'senderId' | 'roomId' | 'sequence' | 'timestamp'>
  ): void {
    if (!this.transport?.isConnected()) return;

    const message: SyncMessage = {
      ...partial,
      senderId: this.clientId,
      roomId: this.config.roomId,
      sequence: this.sequence++,
      timestamp: Date.now(),
    };

    this.transport.send(message);
    this.stats.messagesSent++;
    this.stats.bytesSent += JSON.stringify(message).length;
  }

  private emit(type: SyncEventType, data?: unknown): void {
    this.eventCallbacks.get(type)?.forEach((cb) => cb({ type, data }));
  }

  private generateClientId(): string {
    return `client-${Math.random().toString(36).substring(2, 11)}`;
  }

  private createDefaultStats(): SyncStats {
    return {
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      avgLatency: 0,
      packetsLost: 0,
      deltaEfficiency: 0,
      connectedPeers: 0,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createSyncProtocol(
  config: Partial<SyncProtocolConfig> & { roomId: string },
  optimizations?: Partial<SyncOptimizations>
): SyncProtocol {
  return new SyncProtocol(config, optimizations);
}

export function createLocalSync(roomId: string): SyncProtocol {
  return new SyncProtocol({ roomId, transport: 'local' }, { interestManagement: false });
}
