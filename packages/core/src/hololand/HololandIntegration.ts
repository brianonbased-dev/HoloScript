/**
 * @holoscript/core Hololand Integration
 *
 * Bridge between HoloScript language and the Hololand runtime platform.
 * Handles world registration, entity synchronization, networking, and
 * cross-platform runtime services.
 */

import type {
  WorldDefinition,
  WorldConfig,
  WorldEnvironment,
  SceneNode,
  WorldLODConfig,
} from './WorldDefinitionSchema';

// ============================================================================
// Hololand Connection State
// ============================================================================

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ConnectionInfo {
  /** Current connection state */
  state: ConnectionState;

  /** Server URL */
  serverUrl: string;

  /** Connection latency (ms) */
  latency: number;

  /** Bytes sent */
  bytesSent: number;

  /** Bytes received */
  bytesReceived: number;

  /** Connection timestamp */
  connectedAt?: string;

  /** Last error */
  lastError?: string;

  /** Session ID */
  sessionId?: string;

  /** User ID */
  userId?: string;
}

// ============================================================================
// Runtime Services
// ============================================================================

export interface RuntimeServices {
  /** Asset streaming service */
  assets: AssetStreamingService;

  /** Networking service */
  networking: NetworkingService;

  /** Audio service */
  audio: AudioService;

  /** Physics service */
  physics: PhysicsService;

  /** Input service */
  input: InputService;

  /** Analytics service */
  analytics: AnalyticsService;

  /** Voice service */
  voice: VoiceService;

  /** Storage service */
  storage: StorageService;
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface AssetStreamingService {
  /** Request asset load */
  requestAsset(assetId: string, priority: number): Promise<unknown>;

  /** Prefetch assets */
  prefetch(assetIds: string[]): Promise<void>;

  /** Cancel asset load */
  cancelLoad(assetId: string): void;

  /** Get loading progress */
  getProgress(assetId: string): number;

  /** Clear cache */
  clearCache(): void;

  /** Get cache stats */
  getCacheStats(): { size: number; maxSize: number; hitRate: number };
}

export interface NetworkingService {
  /** Send message to server */
  send(channel: string, data: unknown): void;

  /** Subscribe to channel */
  subscribe(channel: string, handler: (data: unknown) => void): () => void;

  /** RPC call */
  rpc<T>(method: string, params: unknown): Promise<T>;

  /** Get connection info */
  getConnectionInfo(): ConnectionInfo;

  /** Set player data */
  setPlayerData(key: string, value: unknown): void;

  /** Get player data */
  getPlayerData(key: string): unknown;
}

export interface AudioService {
  /** Play sound */
  play(soundId: string, options?: AudioPlayOptions): AudioHandle;

  /** Stop sound */
  stop(handle: AudioHandle): void;

  /** Set listener position */
  setListenerPosition(position: [number, number, number]): void;

  /** Set listener orientation */
  setListenerOrientation(
    forward: { x: number; y: number; z: number },
    up: { x: number; y: number; z: number }
  ): void;

  /** Set master volume */
  setMasterVolume(volume: number): void;

  /** Create audio source */
  createSource(soundId: string, position: [number, number, number]): AudioSource;
}

export interface AudioPlayOptions {
  volume?: number;
  pitch?: number;
  loop?: boolean;
  spatial?: boolean;
  position?: { x: number; y: number; z: number };
  rolloff?: number;
  maxDistance?: number;
}

export interface AudioHandle {
  id: string;
  stop(): void;
  setVolume(volume: number): void;
  setPitch(pitch: number): void;
  isPlaying(): boolean;
}

export interface AudioSource {
  id: string;
  play(): void;
  stop(): void;
  setPosition(position: [number, number, number]): void;
  setVolume(volume: number): void;
  destroy(): void;
}

export interface PhysicsService {
  /** Create rigid body */
  createBody(config: RigidBodyConfig): PhysicsBody;

  /** Raycast */
  raycast(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number
  ): RaycastResult | null;

  /** Overlap query */
  overlap(shape: ColliderShape, position: [number, number, number]): PhysicsBody[];

  /** Set gravity */
  setGravity(gravity: { x: number; y: number; z: number }): void;

  /** Step simulation */
  step(deltaTime: number): void;
}

export interface RigidBodyConfig {
  type: 'static' | 'dynamic' | 'kinematic';
  position: [number, number, number];
  rotation: { x: number; y: number; z: number; w: number };
  mass?: number;
  friction?: number;
  restitution?: number;
  collider: ColliderShape;
}

export interface ColliderShape {
  type: 'box' | 'sphere' | 'capsule' | 'mesh' | 'convex';
  size?: { x: number; y: number; z: number };
  radius?: number;
  height?: number;
  meshData?: ArrayBuffer;
}

export interface PhysicsBody {
  id: string;
  setPosition(position: [number, number, number]): void;
  setRotation(rotation: { x: number; y: number; z: number; w: number }): void;
  setVelocity(velocity: { x: number; y: number; z: number }): void;
  applyForce(force: { x: number; y: number; z: number }): void;
  applyImpulse(impulse: { x: number; y: number; z: number }): void;
  getPosition(): { x: number; y: number; z: number };
  getVelocity(): { x: number; y: number; z: number };
  destroy(): void;
}

export interface RaycastResult {
  body: PhysicsBody;
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  distance: number;
}

export interface InputService {
  /** Get input value */
  getValue(action: string): number;

  /** Is action pressed */
  isPressed(action: string): boolean;

  /** Is action just pressed (this frame) */
  isJustPressed(action: string): boolean;

  /** Is action just released */
  isJustReleased(action: string): boolean;

  /** Get pointer position */
  getPointerPosition(): { x: number; y: number };

  /** Get XR controller */
  getXRController(hand: 'left' | 'right'): XRControllerState | null;

  /** Bind action */
  bindAction(action: string, binding: InputBinding): void;

  /** Set vibration */
  setVibration(hand: 'left' | 'right', intensity: number, duration: number): void;
}

export interface XRControllerState {
  position: [number, number, number];
  rotation: { x: number; y: number; z: number; w: number };
  grip: number;
  trigger: number;
  thumbstick: { x: number; y: number };
  buttons: Record<string, boolean>;
}

export interface InputBinding {
  type: 'keyboard' | 'gamepad' | 'xr' | 'mouse';
  key?: string;
  button?: number;
  axis?: string;
}

export interface AnalyticsService {
  /** Track event */
  track(event: string, properties?: Record<string, unknown>): void;

  /** Set user property */
  setUserProperty(key: string, value: unknown): void;

  /** Start timing */
  startTiming(label: string): void;

  /** End timing */
  endTiming(label: string): number;

  /** Get performance metrics */
  getMetrics(): PerformanceMetrics;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  textureMemory: number;
  geometryMemory: number;
  physicsTime: number;
  networkLatency: number;
}

export interface VoiceService {
  /** Start voice chat */
  startVoiceChat(): Promise<void>;

  /** Stop voice chat */
  stopVoiceChat(): void;

  /** Mute/unmute */
  setMuted(muted: boolean): void;

  /** Set voice volume */
  setVolume(userId: string, volume: number): void;

  /** Get speaking users */
  getSpeakingUsers(): string[];

  /** Text-to-speech */
  speak(text: string, options?: TTSOptions): Promise<void>;

  /** Speech-to-text */
  startListening(): Promise<void>;

  /** Stop speech-to-text */
  stopListening(): Promise<string>;
}

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface StorageService {
  /** Get value */
  get<T>(key: string): Promise<T | null>;

  /** Set value */
  set(key: string, value: unknown): Promise<void>;

  /** Delete value */
  delete(key: string): Promise<void>;

  /** List keys */
  keys(): Promise<string[]>;

  /** Clear all */
  clear(): Promise<void>;

  /** Get storage quota */
  getQuota(): Promise<{ used: number; total: number }>;
}

// ============================================================================
// Hololand Client
// ============================================================================

export interface HololandClientConfig {
  /** Server URL */
  serverUrl: string;

  /** API key */
  apiKey?: string;

  /** Enable debug mode */
  debug: boolean;

  /** Auto-reconnect */
  autoReconnect: boolean;

  /** Reconnect delay (ms) */
  reconnectDelay: number;

  /** Max reconnect attempts */
  maxReconnectAttempts: number;

  /** Connection timeout (ms) */
  connectionTimeout: number;
}

export class HololandClient {
  private static instance: HololandClient | null = null;
  private config: HololandClientConfig;
  private connectionInfo: ConnectionInfo;
  private services: RuntimeServices | null = null;
  private world: WorldDefinition | null = null;
  private eventHandlers: Map<string, Set<(data: unknown) => void>> = new Map();

  private constructor(config: Partial<HololandClientConfig>) {
    this.config = {
      serverUrl: config.serverUrl ?? 'wss://api.hololand.io',
      apiKey: config.apiKey,
      debug: config.debug ?? false,
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      connectionTimeout: config.connectionTimeout ?? 30000,
    };

    this.connectionInfo = {
      state: 'disconnected',
      serverUrl: this.config.serverUrl,
      latency: 0,
      bytesSent: 0,
      bytesReceived: 0,
    };
  }

  static getInstance(config?: Partial<HololandClientConfig>): HololandClient {
    if (!HololandClient.instance) {
      HololandClient.instance = new HololandClient(config ?? {});
    }
    return HololandClient.instance;
  }

  static resetInstance(): void {
    HololandClient.instance?.disconnect();
    HololandClient.instance = null;
  }

  // â”€â”€â”€ Connection Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Connect to Hololand server
   */
  async connect(worldId?: string): Promise<void> {
    if (this.connectionInfo.state === 'connected') {
      return;
    }

    this.setConnectionState('connecting');

    try {
      // Simulate connection (actual implementation would use WebSocket/WebRTC)
      await this.simulateConnection();

      if (worldId) {
        await this.joinWorld(worldId);
      }

      this.setConnectionState('connected');
      this.emit('connected', { sessionId: this.connectionInfo.sessionId });
    } catch (error) {
      this.connectionInfo.lastError = (error as Error).message;
      this.setConnectionState('error');
      throw error;
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.connectionInfo.state === 'disconnected') {
      return;
    }

    this.setConnectionState('disconnected');
    this.services = null;
    this.world = null;
    this.emit('disconnected', {});
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): ConnectionInfo {
    return { ...this.connectionInfo };
  }

  // â”€â”€â”€ World Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Join a world
   */
  async joinWorld(worldId: string): Promise<WorldDefinition> {
    if (this.connectionInfo.state !== 'connected') {
      throw new Error('Not connected to server');
    }

    // Fetch world definition from server
    const world = await this.fetchWorldDefinition(worldId);
    this.world = world;

    this.emit('worldJoined', { worldId, world });
    return world;
  }

  /**
   * Leave current world
   */
  async leaveWorld(): Promise<void> {
    if (!this.world) return;

    const worldId = this.world.metadata.id;
    this.world = null;
    this.emit('worldLeft', { worldId });
  }

  /**
   * Get current world
   */
  getCurrentWorld(): WorldDefinition | null {
    return this.world;
  }

  /**
   * Register a world definition
   */
  async registerWorld(world: WorldDefinition): Promise<string> {
    if (this.connectionInfo.state !== 'connected') {
      throw new Error('Not connected to server');
    }

    // Would upload world definition to server
    const worldId = world.metadata.id;
    this.emit('worldRegistered', { worldId });
    return worldId;
  }

  /**
   * Update world definition
   */
  async updateWorld(worldId: string, updates: Partial<WorldDefinition>): Promise<void> {
    if (this.connectionInfo.state !== 'connected') {
      throw new Error('Not connected to server');
    }

    this.emit('worldUpdated', { worldId, updates });
  }

  // â”€â”€â”€ Runtime Services â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Get runtime services
   */
  getServices(): RuntimeServices {
    if (!this.services) {
      this.services = this.createServices();
    }
    return this.services;
  }

  /**
   * Create runtime services (stub implementations)
   */
  private createServices(): RuntimeServices {
    return {
      assets: this.createAssetService(),
      networking: this.createNetworkingService(),
      audio: this.createAudioService(),
      physics: this.createPhysicsService(),
      input: this.createInputService(),
      analytics: this.createAnalyticsService(),
      voice: this.createVoiceService(),
      storage: this.createStorageService(),
    };
  }

  // â”€â”€â”€ Service Factory Methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private createAssetService(): AssetStreamingService {
    return {
      requestAsset: async (assetId, _priority) => {
        this.log(`Requesting asset: ${assetId}`);
        return null;
      },
      prefetch: async (assetIds) => {
        this.log(`Prefetching ${assetIds.length} assets`);
      },
      cancelLoad: (assetId) => {
        this.log(`Cancelling load: ${assetId}`);
      },
      getProgress: (_assetId) => 0,
      clearCache: () => {
        this.log('Clearing asset cache');
      },
      getCacheStats: () => ({ size: 0, maxSize: 256 * 1024 * 1024, hitRate: 0 }),
    };
  }

  private createNetworkingService(): NetworkingService {
    const subscriptions = new Map<string, Set<(data: unknown) => void>>();

    return {
      send: (channel, data) => {
        this.log(`Send to ${channel}:`, data);
      },
      subscribe: (channel, handler) => {
        if (!subscriptions.has(channel)) {
          subscriptions.set(channel, new Set());
        }
        subscriptions.get(channel)!.add(handler);
        return () => subscriptions.get(channel)?.delete(handler);
      },
      rpc: async <T>(_method: string, _params: unknown) => {
        return null as T;
      },
      getConnectionInfo: () => this.connectionInfo,
      setPlayerData: (_key, _value) => {},
      getPlayerData: (_key) => null,
    };
  }

  private createAudioService(): AudioService {
    let handleId = 0;

    return {
      play: (soundId, _options) => {
        const id = `audio_${handleId++}`;
        this.log(`Playing sound: ${soundId}`);
        return {
          id,
          stop: () => {},
          setVolume: () => {},
          setPitch: () => {},
          isPlaying: () => false,
        };
      },
      stop: (_handle) => {},
      setListenerPosition: (_position) => {},
      setListenerOrientation: (_forward, _up) => {},
      setMasterVolume: (_volume) => {},
      createSource: (soundId, _position) => {
        const id = `source_${handleId++}`;
        this.log(`Creating audio source: ${soundId}`);
        return {
          id,
          play: () => {},
          stop: () => {},
          setPosition: () => {},
          setVolume: () => {},
          destroy: () => {},
        };
      },
    };
  }

  private createPhysicsService(): PhysicsService {
    let bodyId = 0;

    return {
      createBody: (config) => {
        const id = `body_${bodyId++}`;
        this.log(`Creating physics body: ${config.type}`);
        return {
          id,
          setPosition: () => {},
          setRotation: () => {},
          setVelocity: () => {},
          applyForce: () => {},
          applyImpulse: () => {},
          getPosition: () => config.position,
          getVelocity: () => ([0, 0, 0]),
          destroy: () => {},
        };
      },
      raycast: (_origin, _direction, _maxDistance) => null,
      overlap: (_shape, _position) => [],
      setGravity: (_gravity) => {},
      step: (_deltaTime) => {},
    };
  }

  private createInputService(): InputService {
    const bindings = new Map<string, InputBinding>();

    return {
      getValue: (_action) => 0,
      isPressed: (_action) => false,
      isJustPressed: (_action) => false,
      isJustReleased: (_action) => false,
      getPointerPosition: () => ({ x: 0, y: 0 }),
      getXRController: (_hand) => null,
      bindAction: (action, binding) => {
        bindings.set(action, binding);
      },
      setVibration: (_hand, _intensity, _duration) => {},
    };
  }

  private createAnalyticsService(): AnalyticsService {
    const timings = new Map<string, number>();

    return {
      track: (event, properties) => {
        this.log(`Analytics: ${event}`, properties);
      },
      setUserProperty: (_key, _value) => {},
      startTiming: (label) => {
        timings.set(label, performance.now());
      },
      endTiming: (label) => {
        const start = timings.get(label);
        if (!start) return 0;
        const duration = performance.now() - start;
        timings.delete(label);
        return duration;
      },
      getMetrics: () => ({
        fps: 60,
        frameTime: 16.67,
        drawCalls: 0,
        triangles: 0,
        textureMemory: 0,
        geometryMemory: 0,
        physicsTime: 0,
        networkLatency: this.connectionInfo.latency,
      }),
    };
  }

  private createVoiceService(): VoiceService {
    return {
      startVoiceChat: async () => {},
      stopVoiceChat: () => {},
      setMuted: (_muted) => {},
      setVolume: (_userId, _volume) => {},
      getSpeakingUsers: () => [],
      speak: async (_text, _options) => {},
      startListening: async () => {},
      stopListening: async () => '',
    };
  }

  private createStorageService(): StorageService {
    const storage = new Map<string, unknown>();

    return {
      get: async <T>(key: string) => (storage.get(key) as T) ?? null,
      set: async (key, value) => {
        storage.set(key, value);
      },
      delete: async (key) => {
        storage.delete(key);
      },
      keys: async () => Array.from(storage.keys()),
      clear: async () => {
        storage.clear();
      },
      getQuota: async () => ({ used: 0, total: 50 * 1024 * 1024 }),
    };
  }

  // â”€â”€â”€ Event System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Subscribe to events
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Event handler error for ${event}:`, error);
        }
      }
    }
  }

  // â”€â”€â”€ Internal Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private setConnectionState(state: ConnectionState): void {
    this.connectionInfo.state = state;
    this.emit('connectionStateChanged', { state });
  }

  private async simulateConnection(): Promise<void> {
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.connectionInfo.sessionId = `session_${Date.now()}`;
    this.connectionInfo.connectedAt = new Date().toISOString();
    this.connectionInfo.latency = 50;
  }

  private async fetchWorldDefinition(_worldId: string): Promise<WorldDefinition> {
    // Would fetch from server - return stub for now
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      schemaVersion: '1.0.0',
      metadata: {
        id: _worldId,
        name: 'Stub World',
        displayName: 'Stub World',
        version: '1.0.0',
        tags: [],
        previewImages: [],
        platforms: ['web'],
        category: 'experience',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        status: 'published',
        metadata: {},
      },
      config: {} as WorldConfig,
      environment: {} as WorldEnvironment,
      zones: [],
      spawnPoints: [],
      assetManifest: '',
      prefabs: [],
      sceneGraph: {} as SceneNode,
      scripts: [],
      events: [],
      lod: {} as WorldLODConfig,
    };
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[Hololand]', ...args);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Get Hololand client instance
 */
export function getHololandClient(config?: Partial<HololandClientConfig>): HololandClient {
  return HololandClient.getInstance(config);
}

/**
 * Connect to Hololand
 */
export async function connectToHololand(
  config?: Partial<HololandClientConfig>,
  worldId?: string
): Promise<HololandClient> {
  const client = getHololandClient(config);
  await client.connect(worldId);
  return client;
}

/**
 * Disconnect from Hololand
 */
export function disconnectFromHololand(): void {
  HololandClient.resetInstance();
}
