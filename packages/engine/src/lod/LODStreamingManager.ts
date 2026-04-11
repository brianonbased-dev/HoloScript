/**
 * @holoscript/core LOD Streaming Manager
 *
 * v3.5 LOD Streaming System for high-performance asset streaming.
 * Implements async mesh loading, priority queues, prefetching, and resource budgets.
 */

import type { _LODLevel, LODConfig } from './LODTypes';
import type { LODManager } from './LODManager';
import type { MeshData } from './LODGenerator';

// ============================================================================
// Types
// ============================================================================

export interface StreamingOptions {
  /** Memory budget in bytes (default: 512MB) */
  memoryBudgetBytes: number;

  /** Bandwidth budget in bytes/second (default: 10MB/s) */
  bandwidthBudgetBytesPerSec: number;

  /** Prefetch distance multiplier (default: 2x LOD threshold) */
  prefetchDistanceMultiplier: number;

  /** Maximum concurrent loads (default: 4) */
  maxConcurrentLoads: number;

  /** Enable velocity-based prefetching (default: true) */
  enableVelocityPrefetch: boolean;

  /** Debug logging (default: false) */
  debug: boolean;
}

export const DEFAULT_STREAMING_OPTIONS: StreamingOptions = {
  memoryBudgetBytes: 512 * 1024 * 1024, // 512MB
  bandwidthBudgetBytesPerSec: 10 * 1024 * 1024, // 10MB/s
  prefetchDistanceMultiplier: 2.0,
  maxConcurrentLoads: 4,
  enableVelocityPrefetch: true,
  debug: false,
};

export interface StreamRequest {
  /** Unique request ID */
  id: string;

  /** Object ID */
  objectId: string;

  /** LOD level to load */
  level: number;

  /** Asset path or URL */
  assetPath: string;

  /** Priority (higher = more important) */
  priority: number;

  /** Request timestamp */
  timestamp: number;

  /** Estimated size in bytes */
  estimatedSize: number;

  /** Distance to camera */
  distance: number;

  /** Screen coverage (0-1) */
  screenCoverage: number;
}

export interface StreamingMetrics {
  /** Total memory used by loaded LODs */
  memoryUsedBytes: number;

  /** Number of LODs currently loaded */
  lodsLoaded: number;

  /** Number of pending requests */
  pendingRequests: number;

  /** Number of active downloads */
  activeLoads: number;

  /** Total bytes downloaded this session */
  totalBytesDownloaded: number;

  /** Current bandwidth usage (bytes/sec) */
  currentBandwidthUsage: number;

  /** Cache hit rate (0-1) */
  cacheHitRate: number;

  /** Average load time (ms) */
  averageLoadTimeMs: number;
}

export type StreamEventType =
  | 'loadStart'
  | 'loadComplete'
  | 'loadError'
  | 'budgetExceeded'
  | 'prefetchStart';

export interface StreamEvent {
  type: StreamEventType;
  objectId: string;
  level: number;
  timestamp: number;
  size?: number;
  error?: Error;
}

export type StreamEventHandler = (event: StreamEvent) => void;

// ============================================================================
// Priority Queue Implementation
// ============================================================================

class PriorityQueue<T extends { priority: number }> {
  private items: T[] = [];

  enqueue(item: T): void {
    // Insert in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.items.length; i++) {
      if (item.priority > this.items[i].priority) {
        this.items.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.items.push(item);
    }
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  peek(): T | undefined {
    return this.items[0];
  }

  remove(predicate: (item: T) => boolean): T | undefined {
    const index = this.items.findIndex(predicate);
    if (index !== -1) {
      return this.items.splice(index, 1)[0];
    }
    return undefined;
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }

  toArray(): T[] {
    return [...this.items];
  }
}

// ============================================================================
// LOD Streaming Manager
// ============================================================================

export class LODStreamingManager {
  private options: StreamingOptions;
  private requestQueue: PriorityQueue<StreamRequest>;
  private activeLoads: Map<string, Promise<MeshData>>;
  private loadedMeshes: Map<string, MeshData>;
  private eventHandlers: Map<StreamEventType, Set<StreamEventHandler>>;
  private metrics: StreamingMetrics;
  private lodManager: LODManager | null = null;
  private cameraPosition: [number, number, number] = [0, 0, 0];
  private previousCameraPosition: [number, number, number] = [0, 0, 0];
  private cameraVelocity: [number, number, number] = [0, 0, 0];
  private lastUpdateTime: number = 0;
  private bandwidthWindow: Array<{ timestamp: number; bytes: number }> = [];

  constructor(options?: Partial<StreamingOptions>) {
    this.options = { ...DEFAULT_STREAMING_OPTIONS, ...options };
    this.requestQueue = new PriorityQueue<StreamRequest>();
    this.activeLoads = new Map();
    this.loadedMeshes = new Map();
    this.eventHandlers = new Map();
    this.metrics = this.createMetrics();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Attach to LOD manager for integration
   */
  attachLODManager(manager: LODManager): void {
    this.lodManager = manager;
  }

  /**
   * Set camera position and update velocity
   */
  setCameraPosition(position: [number, number, number], deltaTime: number = 0.016): void {
    this.previousCameraPosition = this.cameraPosition;
    this.cameraPosition = position;

    // Calculate velocity
    if (deltaTime > 0) {
      this.cameraVelocity = [
        (position[0] - this.previousCameraPosition[0]) / deltaTime,
        (position[1] - this.previousCameraPosition[1]) / deltaTime,
        (position[2] - this.previousCameraPosition[2]) / deltaTime,
      ];
    }
  }

  // ==========================================================================
  // Request Management
  // ==========================================================================

  /**
   * Request LOD mesh for streaming
   */
  requestLOD(
    objectId: string,
    level: number,
    assetPath: string,
    distance: number,
    screenCoverage: number,
    estimatedSize: number
  ): void {
    const requestId = `${objectId}_L${level}`;

    // Check if already loaded
    if (this.loadedMeshes.has(requestId)) {
      return;
    }

    // Check if already in queue or loading
    if (this.activeLoads.has(requestId)) {
      return;
    }

    // Check if already in pending queue
    const existingInQueue = this.requestQueue.toArray().find((req) => req.id === requestId);
    if (existingInQueue) {
      return;
    }

    // Calculate priority: closer + larger screen coverage = higher priority
    const distancePriority = 1000 / Math.max(1, distance);
    const coveragePriority = screenCoverage * 500;
    const priority = distancePriority + coveragePriority;

    const request: StreamRequest = {
      id: requestId,
      objectId,
      level,
      assetPath,
      priority,
      timestamp: Date.now(),
      estimatedSize,
      distance,
      screenCoverage,
    };

    this.requestQueue.enqueue(request);
    this.metrics.pendingRequests = this.requestQueue.size;

    if (this.options.debug) {
      console.log(`[Streaming] Queued: ${requestId} (priority: ${priority.toFixed(2)})`);
    }
  }

  /**
   * Cancel a streaming request
   */
  cancelRequest(objectId: string, level: number): void {
    const requestId = `${objectId}_L${level}`;
    this.requestQueue.remove((req) => req.id === requestId);
    this.metrics.pendingRequests = this.requestQueue.size;
  }

  /**
   * Get loaded mesh data
   */
  getMesh(objectId: string, level: number): MeshData | undefined {
    const requestId = `${objectId}_L${level}`;
    return this.loadedMeshes.get(requestId);
  }

  /**
   * Check if mesh is loaded
   */
  isLoaded(objectId: string, level: number): boolean {
    const requestId = `${objectId}_L${level}`;
    return this.loadedMeshes.has(requestId);
  }

  /**
   * Check if mesh is loading
   */
  isLoading(objectId: string, level: number): boolean {
    const requestId = `${objectId}_L${level}`;
    return this.activeLoads.has(requestId);
  }

  // ==========================================================================
  // Update Loop
  // ==========================================================================

  /**
   * Update streaming system (call each frame)
   */
  async update(_deltaTime: number = 0.016): Promise<void> {
    const now = Date.now();
    this.lastUpdateTime = now;

    // Process prefetching
    if (this.options.enableVelocityPrefetch && this.lodManager) {
      this.processPrefetching();
    }

    // Process pending requests
    await this.processQueue();

    // Update metrics
    this.updateMetrics();

    // Clean up old bandwidth samples
    this.bandwidthWindow = this.bandwidthWindow.filter((sample) => now - sample.timestamp < 1000);
  }

  /**
   * Process request queue
   */
  private async processQueue(): Promise<void> {
    // Check concurrent load limit
    while (this.activeLoads.size < this.options.maxConcurrentLoads && this.requestQueue.size > 0) {
      const request = this.requestQueue.peek();
      if (!request) break;

      // Check memory budget
      if (this.metrics.memoryUsedBytes + request.estimatedSize > this.options.memoryBudgetBytes) {
        this.emit({
          type: 'budgetExceeded',
          objectId: request.objectId,
          level: request.level,
          timestamp: Date.now(),
          size: request.estimatedSize,
        });

        // Try to free memory by evicting lowest priority LODs
        // This would integrate with LODCache in production
        break;
      }

      // Check bandwidth budget
      if (this.metrics.currentBandwidthUsage >= this.options.bandwidthBudgetBytesPerSec) {
        break;
      }

      // Dequeue and start loading
      this.requestQueue.dequeue();
      this.metrics.pendingRequests = this.requestQueue.size;
      await this.startLoad(request);
    }
  }

  /**
   * Start loading a mesh
   */
  private async startLoad(request: StreamRequest): Promise<void> {
    this.emit({
      type: 'loadStart',
      objectId: request.objectId,
      level: request.level,
      timestamp: Date.now(),
    });

    const startTime = performance.now();
    const loadPromise = this.loadMeshData(request.assetPath, request.estimatedSize);

    this.activeLoads.set(request.id, loadPromise);
    this.metrics.activeLoads = this.activeLoads.size;

    try {
      const meshData = await loadPromise;

      // Store loaded mesh
      this.loadedMeshes.set(request.id, meshData);

      // Calculate actual size
      const actualSize =
        meshData.positions.byteLength +
        (meshData.normals?.byteLength || 0) +
        (meshData.uvs?.byteLength || 0) +
        (meshData.indices?.byteLength || 0);

      this.metrics.memoryUsedBytes += actualSize;
      this.metrics.lodsLoaded = this.loadedMeshes.size;
      this.metrics.totalBytesDownloaded += actualSize;

      // Track bandwidth
      this.bandwidthWindow.push({ timestamp: Date.now(), bytes: actualSize });

      // Update average load time
      const loadTime = performance.now() - startTime;
      this.metrics.averageLoadTimeMs =
        (this.metrics.averageLoadTimeMs * (this.metrics.lodsLoaded - 1) + loadTime) /
        this.metrics.lodsLoaded;

      this.emit({
        type: 'loadComplete',
        objectId: request.objectId,
        level: request.level,
        timestamp: Date.now(),
        size: actualSize,
      });

      if (this.options.debug) {
        console.log(`[Streaming] Loaded: ${request.id} (${loadTime.toFixed(2)}ms)`);
      }
    } catch (error) {
      this.emit({
        type: 'loadError',
        objectId: request.objectId,
        level: request.level,
        timestamp: Date.now(),
        error: error as Error,
      });

      if (this.options.debug) {
        console.error(`[Streaming] Load failed: ${request.id}`, error);
      }
    } finally {
      this.activeLoads.delete(request.id);
      this.metrics.activeLoads = this.activeLoads.size;
    }
  }

  /**
   * Load mesh data from path/URL (async)
   */
  private async loadMeshData(assetPath: string, estimatedSize: number): Promise<MeshData> {
    // Simulate network delay based on size
    const delayMs = Math.min(500, (estimatedSize / (1024 * 1024)) * 100); // ~100ms per MB
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // In production, this would:
    // 1. Fetch from network or disk
    // 2. Decompress if needed (Draco, meshopt)
    // 3. Parse binary data into MeshData
    // 4. Validate and optimize

    // For now, return mock data
    const vertexCount = Math.floor(estimatedSize / 32); // Estimate vertices
    return {
      positions: new Float32Array(vertexCount * 3),
      normals: new Float32Array(vertexCount * 3),
      uvs: new Float32Array(vertexCount * 2),
      indices: new Uint32Array(vertexCount * 1.5),
    };
  }

  // ==========================================================================
  // Prefetching
  // ==========================================================================

  /**
   * Process velocity-based prefetching
   */
  private processPrefetching(): void {
    if (!this.lodManager) return;

    const registeredObjects = this.lodManager.getRegisteredObjects();

    for (const objectId of registeredObjects) {
      const config = this.lodManager.getConfig(objectId);
      const state = this.lodManager.getState(objectId);

      if (!config || !state) continue;

      // Calculate predicted position based on velocity
      const predictedDistance = this.predictDistance(objectId);

      // Find which LOD level we'll likely need
      const predictedLevel = this.selectLODByDistance(predictedDistance, config);

      // Prefetch if different from current and not already loading/loaded
      if (predictedLevel !== state.currentLevel) {
        const level = config.levels[predictedLevel];
        if (level?.assetPath) {
          const prefetchDistance = state.cameraDistance * this.options.prefetchDistanceMultiplier;

          if (predictedDistance <= prefetchDistance) {
            this.emit({
              type: 'prefetchStart',
              objectId,
              level: predictedLevel,
              timestamp: Date.now(),
            });

            this.requestLOD(
              objectId,
              predictedLevel,
              level.assetPath,
              predictedDistance,
              state.screenCoverage,
              level.memoryFootprint || 1024 * 1024 // Default 1MB
            );
          }
        }
      }
    }
  }

  /**
   * Predict distance based on camera velocity
   */
  private predictDistance(objectId: string): number {
    if (!this.lodManager) return 0;

    const state = this.lodManager.getState(objectId);
    if (!state) return 0;

    // Predict position 1 second ahead
    const predictionTime = 1.0;
    const _predictedCameraPos: [number, number, number] = [
      this.cameraPosition[0] + this.cameraVelocity[0] * predictionTime,
      this.cameraPosition[1] + this.cameraVelocity[1] * predictionTime,
      this.cameraPosition[2] + this.cameraVelocity[2] * predictionTime,
    ];

    // Get object position (would come from scene graph in production)
    // For now, use current camera distance and assume static object
    const currentDistance = state.cameraDistance;

    // Calculate velocity component toward/away from object
    const velocityMagnitude = Math.sqrt(
      this.cameraVelocity[0] ** 2 + this.cameraVelocity[1] ** 2 + this.cameraVelocity[2] ** 2
    );

    // Simple approximation: if moving, distance changes
    const predictedDistance = Math.max(0, currentDistance - velocityMagnitude * predictionTime);

    return predictedDistance;
  }

  /**
   * Select LOD level by distance (matches LODManager logic)
   */
  private selectLODByDistance(distance: number, config: LODConfig): number {
    for (let i = config.levels.length - 1; i >= 0; i--) {
      if (distance >= config.levels[i].distance) {
        return i;
      }
    }
    return 0;
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  private createMetrics(): StreamingMetrics {
    return {
      memoryUsedBytes: 0,
      lodsLoaded: 0,
      pendingRequests: 0,
      activeLoads: 0,
      totalBytesDownloaded: 0,
      currentBandwidthUsage: 0,
      cacheHitRate: 0,
      averageLoadTimeMs: 0,
    };
  }

  private updateMetrics(): void {
    // Calculate current bandwidth usage (bytes in last second)
    const now = Date.now();
    const recentBytes = this.bandwidthWindow
      .filter((sample) => now - sample.timestamp < 1000)
      .reduce((sum, sample) => sum + sample.bytes, 0);

    this.metrics.currentBandwidthUsage = recentBytes;
  }

  getMetrics(): StreamingMetrics {
    return { ...this.metrics };
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  on(eventType: StreamEventType, handler: StreamEventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  private emit(event: StreamEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error('[Streaming] Event handler error:', error);
        }
      }
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Unload a specific LOD level
   */
  unload(objectId: string, level: number): void {
    const requestId = `${objectId}_L${level}`;
    const meshData = this.loadedMeshes.get(requestId);

    if (meshData) {
      const size =
        meshData.positions.byteLength +
        (meshData.normals?.byteLength || 0) +
        (meshData.uvs?.byteLength || 0) +
        (meshData.indices?.byteLength || 0);

      this.metrics.memoryUsedBytes -= size;
      this.loadedMeshes.delete(requestId);
      this.metrics.lodsLoaded = this.loadedMeshes.size;

      if (this.options.debug) {
        console.log(`[Streaming] Unloaded: ${requestId}`);
      }
    }
  }

  /**
   * Clear all loaded meshes and pending requests
   */
  clear(): void {
    this.loadedMeshes.clear();
    this.activeLoads.clear();
    this.requestQueue.clear();
    this.metrics = this.createMetrics();
  }

  /**
   * Get current options
   */
  getOptions(): StreamingOptions {
    return { ...this.options };
  }

  /**
   * Update options
   */
  setOptions(options: Partial<StreamingOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create streaming manager with default options
 */
export function createStreamingManager(options?: Partial<StreamingOptions>): LODStreamingManager {
  return new LODStreamingManager(options);
}

/**
 * Create streaming manager optimized for mobile
 */
export function createMobileStreamingManager(): LODStreamingManager {
  return new LODStreamingManager({
    memoryBudgetBytes: 256 * 1024 * 1024, // 256MB
    bandwidthBudgetBytesPerSec: 5 * 1024 * 1024, // 5MB/s
    maxConcurrentLoads: 2,
  });
}

/**
 * Create streaming manager optimized for desktop/high-end
 */
export function createDesktopStreamingManager(): LODStreamingManager {
  return new LODStreamingManager({
    memoryBudgetBytes: 1024 * 1024 * 1024, // 1GB
    bandwidthBudgetBytesPerSec: 50 * 1024 * 1024, // 50MB/s
    maxConcurrentLoads: 8,
  });
}
