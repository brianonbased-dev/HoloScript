/**
 * @holoscript/core LOD Manager
 *
 * Runtime LOD selection, management, and state tracking.
 * Handles automatic LOD transitions based on camera distance,
 * screen coverage, and performance metrics.
 */

import {
  LODConfig,
  LODState,
  LODGroup,
  LODMetrics,
  DEFAULT_LOD_CONFIG,
  createLODState,
  createLODMetrics,
  selectLODLevelByDistance,
  selectLODLevelByScreenCoverage,
  calculateScreenCoverage,
  getTrianglesSaved,
} from './LODTypes';

// ============================================================================
// Events
// ============================================================================

export type LODEventType =
  | 'levelChanged'
  | 'transitionStart'
  | 'transitionEnd'
  | 'configUpdated'
  | 'groupCreated'
  | 'groupRemoved';

export interface LODEvent {
  type: LODEventType;
  objectId?: string;
  groupId?: string;
  previousLevel?: number;
  newLevel?: number;
  timestamp: number;
}

export type LODEventHandler = (event: LODEvent) => void;

// ============================================================================
// LOD Manager Options
// ============================================================================

export interface LODManagerOptions {
  /** Target frame rate for performance-based LOD */
  targetFrameRate: number;

  /** Enable automatic LOD updates each frame */
  autoUpdate: boolean;

  /** Update frequency (updates per second) */
  updateFrequency: number;

  /** Global LOD bias (-1 to 1, affects all objects) */
  globalBias: number;

  /** Maximum transition time (seconds) */
  maxTransitionTime: number;

  /** Enable LOD metrics collection */
  collectMetrics: boolean;

  /** Camera field of view (degrees) */
  cameraFOV: number;

  /** Screen height for coverage calculation */
  screenHeight: number;

  /** Enable debug logging */
  debug: boolean;
}

export const DEFAULT_MANAGER_OPTIONS: LODManagerOptions = {
  targetFrameRate: 60,
  autoUpdate: true,
  updateFrequency: 30,
  globalBias: 0,
  maxTransitionTime: 1.0,
  collectMetrics: true,
  cameraFOV: 60,
  screenHeight: 1080,
  debug: false,
};

// ============================================================================
// LOD Manager Implementation
// ============================================================================

/**
 * LOD Manager for runtime LOD selection and management
 */
export class LODManager {
  private options: LODManagerOptions;
  private configs: Map<string, LODConfig> = new Map();
  private states: Map<string, LODState> = new Map();
  private groups: Map<string, LODGroup> = new Map();
  private eventHandlers: Map<LODEventType, Set<LODEventHandler>> = new Map();
  private objectPositions: Map<string, [number, number, number]> = new Map();
  private metrics: LODMetrics;
  private cameraPosition: [number, number, number] = [0, 0, 0];
  private lastUpdateTime: number = 0;
  private frameTime: number = 16.67;
  private running: boolean = false;

  // v3.5 Performance enhancements
  private workerPool: Worker[] = [];
  private workerEnabled: boolean = false;
  private spatialHashGrid: Map<string, Set<string>> = new Map();
  private transitionQueue: Array<{ objectId: string; level: number; priority: number }> = [];
  private maxTransitionsPerFrame: number = 10;
  private gridCellSize: number = 50; // World units per grid cell

  constructor(options?: Partial<LODManagerOptions>) {
    this.options = { ...DEFAULT_MANAGER_OPTIONS, ...options };
    this.metrics = createLODMetrics();
  }

  // ==========================================================================
  // Configuration Management
  // ==========================================================================

  /**
   * Register LOD configuration for an object
   */
  registerConfig(objectId: string, config: LODConfig): void {
    const fullConfig = { ...DEFAULT_LOD_CONFIG, ...config, id: objectId };
    this.configs.set(objectId, fullConfig);
    this.states.set(objectId, createLODState(objectId));
    this.emit({ type: 'configUpdated', objectId, timestamp: Date.now() });
  }

  /** Convenience alias: register an object with config and optional initial position */
  register(objectId: string, config: LODConfig, position?: [number, number, number]): void {
    this.registerConfig(objectId, config);
    if (position) this.objectPositions.set(objectId, position);
  }

  /**
   * Unregister LOD configuration
   */
  unregisterConfig(objectId: string): void {
    this.configs.delete(objectId);
    this.states.delete(objectId);
  }

  /** Convenience alias for unregisterConfig */
  unregister(objectId: string): void {
    this.unregisterConfig(objectId);
    this.objectPositions.delete(objectId);
  }

  /** Convenience alias for setObjectPosition */
  updatePosition(objectId: string, position: [number, number, number]): void {
    this.setObjectPosition(objectId, position);
  }

  /**
   * Get LOD configuration for an object
   */
  getConfig(objectId: string): LODConfig | undefined {
    return this.configs.get(objectId);
  }

  /**
   * Update LOD configuration
   */
  updateConfig(objectId: string, updates: Partial<LODConfig>): void {
    const existing = this.configs.get(objectId);
    if (existing) {
      this.configs.set(objectId, { ...existing, ...updates });
      this.emit({ type: 'configUpdated', objectId, timestamp: Date.now() });
    }
  }

  /**
   * Set forced LOD level (for debugging)
   */
  setForcedLevel(objectId: string, level: number | undefined): void {
    const config = this.configs.get(objectId);
    if (config) {
      config.forcedLevel = level;
    }
  }

  // ==========================================================================
  // Group Management
  // ==========================================================================

  /**
   * Create LOD group for multiple objects
   */
  createGroup(group: LODGroup): void {
    this.groups.set(group.id, group);

    // Register config for all objects in group
    for (const objectId of group.objectIds) {
      if (!this.configs.has(objectId)) {
        this.registerConfig(objectId, group.config);
      }
    }

    this.emit({ type: 'groupCreated', groupId: group.id, timestamp: Date.now() });
  }

  /**
   * Remove LOD group
   */
  removeGroup(groupId: string): void {
    this.groups.delete(groupId);
    this.emit({ type: 'groupRemoved', groupId, timestamp: Date.now() });
  }

  /**
   * Get LOD group
   */
  getGroup(groupId: string): LODGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Add object to existing group
   */
  addToGroup(groupId: string, objectId: string): void {
    const group = this.groups.get(groupId);
    if (group && !group.objectIds.includes(objectId)) {
      group.objectIds.push(objectId);
      this.registerConfig(objectId, group.config);
    }
  }

  /**
   * Remove object from group
   */
  removeFromGroup(groupId: string, objectId: string): void {
    const group = this.groups.get(groupId);
    if (group) {
      group.objectIds = group.objectIds.filter((id) => id !== objectId);
    }
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current LOD state for an object
   */
  getState(objectId: string): LODState | undefined {
    return this.states.get(objectId);
  }

  /**
   * Get current LOD level for an object
   */
  getCurrentLevel(objectId: string): number {
    const state = this.states.get(objectId);
    return state?.currentLevel ?? 0;
  }

  /**
   * Check if object is transitioning
   */
  isTransitioning(objectId: string): boolean {
    const state = this.states.get(objectId);
    return state?.isTransitioning ?? false;
  }

  /**
   * Get transition progress (0-1)
   */
  getTransitionProgress(objectId: string): number {
    const state = this.states.get(objectId);
    return state?.transitionProgress ?? 1;
  }

  // ==========================================================================
  // Camera and Update
  // ==========================================================================

  /**
   * Set camera position for distance calculations
   */
  setCameraPosition(position: [number, number, number]): void {
    this.cameraPosition = position;
  }

  /**
   * Set an object's world position for distance-based LOD calculations
   */
  setObjectPosition(objectId: string, position: [number, number, number]): void {
    this.objectPositions.set(objectId, position);
  }

  /**
   * Update LOD for all registered objects.
   * Accepts either a deltaTime (number) or a camera position ([x,y,z] array).
   */
  update(deltaTimeOrCameraPos: number | [number, number, number]): void {
    const startTime = performance.now();
    let deltaTime: number;
    if (Array.isArray(deltaTimeOrCameraPos)) {
      this.cameraPosition = deltaTimeOrCameraPos as [number, number, number];
      deltaTime = 0.016;
      this.frameTime = 16;
    } else {
      deltaTime = deltaTimeOrCameraPos;
      this.frameTime = deltaTimeOrCameraPos * 1000;
    }

    // Reset per-frame metrics
    this.metrics.transitionsThisFrame = 0;

    // Update each registered object
    for (const [objectId, config] of this.configs) {
      if (config.enabled) {
        this.updateObject(objectId, config, deltaTime);
      }
    }

    // Update group states
    for (const [, group] of this.groups) {
      this.updateGroup(group, deltaTime);
    }

    // Record metrics
    this.metrics.selectionTimeMs = performance.now() - startTime;
    this.lastUpdateTime = Date.now();
  }

  /**
   * Update LOD for single object
   */
  private updateObject(objectId: string, config: LODConfig, deltaTime: number): void {
    const state = this.states.get(objectId);
    if (!state) return;

    // Get object position (would normally come from scene graph)
    const objectPosition = this.getObjectPosition(objectId);

    // Calculate distance from camera
    const dx = objectPosition[0] - this.cameraPosition[0];
    const dy = objectPosition[1] - this.cameraPosition[1];
    const dz = objectPosition[2] - this.cameraPosition[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    state.cameraDistance = distance;

    // Select appropriate LOD level
    const newLevel = this.selectLevel(config, state);

    // Handle level change
    if (newLevel !== state.currentLevel && !state.isTransitioning) {
      this.startTransition(objectId, config, state, newLevel);
    }

    // Update transition
    if (state.isTransitioning) {
      this.updateTransition(objectId, config, state, deltaTime);
    }

    state.lastUpdate = Date.now();
  }

  /**
   * Update LOD for a group of objects
   */
  private updateGroup(group: LODGroup, _deltaTime: number): void {
    // Calculate distance from group center to camera
    const dx = group.boundingCenter[0] - this.cameraPosition[0];
    const dy = group.boundingCenter[1] - this.cameraPosition[1];
    const dz = group.boundingCenter[2] - this.cameraPosition[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Select level for the group
    const newLevel = selectLODLevelByDistance(
      distance,
      group.config.levels,
      group.config.hysteresis,
      group.currentLevel
    );

    if (newLevel !== group.currentLevel) {
      group.currentLevel = newLevel;

      // Update all objects in group
      for (const objectId of group.objectIds) {
        const state = this.states.get(objectId);
        if (state) {
          this.startTransition(objectId, group.config, state, newLevel);
        }
      }
    }
  }

  /**
   * Select LOD level based on strategy
   */
  private selectLevel(config: LODConfig, state: LODState): number {
    // Check for forced level
    if (config.forcedLevel !== undefined) {
      return config.forcedLevel;
    }

    // Check max level limit
    const maxLevel = config.maxLevel ?? config.levels.length - 1;

    let selectedLevel: number;

    switch (config.strategy) {
      case 'distance':
        selectedLevel = selectLODLevelByDistance(
          state.cameraDistance,
          config.levels,
          config.hysteresis,
          state.currentLevel
        );
        break;

      case 'screenSize':
        const objectRadius = 1; // Would come from object bounds
        state.screenCoverage = calculateScreenCoverage(
          state.cameraDistance,
          objectRadius,
          this.options.cameraFOV,
          this.options.screenHeight
        );
        selectedLevel = selectLODLevelByScreenCoverage(state.screenCoverage, config.levels);
        break;

      case 'performance':
        // Base selection on frame time
        selectedLevel = this.selectLevelByPerformance(config, state);
        break;

      case 'hybrid':
        // Combine distance and performance
        const distanceLevel = selectLODLevelByDistance(
          state.cameraDistance,
          config.levels,
          config.hysteresis,
          state.currentLevel
        );
        const perfLevel = this.selectLevelByPerformance(config, state);
        selectedLevel = Math.max(distanceLevel, perfLevel);
        break;

      case 'manual':
      default:
        selectedLevel = state.currentLevel;
        break;
    }

    // Apply global and local bias
    const biasAdjustment = Math.round(
      (config.bias + this.options.globalBias) * (config.levels.length - 1)
    );
    selectedLevel = Math.max(0, Math.min(maxLevel, selectedLevel + biasAdjustment));

    return selectedLevel;
  }

  /**
   * Select LOD level based on performance
   */
  private selectLevelByPerformance(config: LODConfig, state: LODState): number {
    const targetFrameTime = 1000 / this.options.targetFrameRate;

    if (this.frameTime > targetFrameTime * 1.2) {
      // Frame time too high, increase LOD level (lower detail)
      return Math.min(config.levels.length - 1, state.currentLevel + 1);
    } else if (this.frameTime < targetFrameTime * 0.8) {
      // Frame time low, can decrease LOD level (higher detail)
      return Math.max(0, state.currentLevel - 1);
    }

    return state.currentLevel;
  }

  /**
   * Start LOD transition
   */
  private startTransition(
    objectId: string,
    config: LODConfig,
    state: LODState,
    newLevel: number
  ): void {
    state.previousLevel = state.currentLevel;
    state.currentLevel = newLevel;
    state.transitionProgress = 0;
    state.isTransitioning = config.transition !== 'instant';

    this.metrics.transitionsThisFrame++;

    this.emit({
      type: 'transitionStart',
      objectId,
      previousLevel: state.previousLevel,
      newLevel,
      timestamp: Date.now(),
    });

    // For instant transitions, complete immediately
    if (config.transition === 'instant') {
      this.completeTransition(objectId, state);
    }

    if (this.options.debug) {
      console.log(`[LOD] ${objectId}: Level ${state.previousLevel} -> ${newLevel}`);
    }
  }

  /**
   * Update transition progress
   */
  private updateTransition(
    objectId: string,
    config: LODConfig,
    state: LODState,
    deltaTime: number
  ): void {
    const duration = Math.min(config.transitionDuration, this.options.maxTransitionTime);
    state.transitionProgress = Math.min(1, state.transitionProgress + deltaTime / duration);

    if (state.transitionProgress >= 1) {
      this.completeTransition(objectId, state);
    }
  }

  /**
   * Complete LOD transition
   */
  private completeTransition(objectId: string, state: LODState): void {
    state.isTransitioning = false;
    state.transitionProgress = 1;

    this.emit({
      type: 'transitionEnd',
      objectId,
      previousLevel: state.previousLevel,
      newLevel: state.currentLevel,
      timestamp: Date.now(),
    });

    this.emit({
      type: 'levelChanged',
      objectId,
      previousLevel: state.previousLevel,
      newLevel: state.currentLevel,
      timestamp: Date.now(),
    });
  }

  /**
   * Get object position from stored positions or default to origin
   */
  private getObjectPosition(objectId: string): [number, number, number] {
    return this.objectPositions.get(objectId) ?? [0, 0, 0];
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  /**
   * Get current LOD metrics
   */
  getMetrics(): LODMetrics {
    if (!this.options.collectMetrics) {
      return createLODMetrics();
    }

    // Update metrics
    this.metrics.totalObjects = this.configs.size;
    this.metrics.objectsPerLevel = new Map();

    let totalLevel = 0;

    for (const [objectId, state] of this.states) {
      const level = state.currentLevel;
      const count = this.metrics.objectsPerLevel.get(level) ?? 0;
      this.metrics.objectsPerLevel.set(level, count + 1);
      totalLevel += level;

      // Calculate triangles saved
      const config = this.configs.get(objectId);
      if (config) {
        const saved = getTrianglesSaved(config.levels, level, 10000);
        this.metrics.trianglesSaved += saved;
      }
    }

    if (this.metrics.totalObjects > 0) {
      this.metrics.averageLODLevel = totalLevel / this.metrics.totalObjects;
    }

    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = createLODMetrics();
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribe to LOD events
   */
  on(event: LODEventType, handler: LODEventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit LOD event
   */
  private emit(event: LODEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error('[LOD] Event handler error:', error);
        }
      }
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start automatic LOD updates
   */
  start(): void {
    this.running = true;
  }

  /**
   * Stop automatic LOD updates
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Check if manager is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Clear all registered objects and groups
   */
  clear(): void {
    this.configs.clear();
    this.states.clear();
    this.groups.clear();
    this.resetMetrics();
  }

  /**
   * Get manager options
   */
  getOptions(): LODManagerOptions {
    return { ...this.options };
  }

  /**
   * Update manager options
   */
  setOptions(updates: Partial<LODManagerOptions>): void {
    this.options = { ...this.options, ...updates };
  }

  /**
   * Get all registered object IDs
   */
  getRegisteredObjects(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Get all group IDs
   */
  getGroups(): string[] {
    return Array.from(this.groups.keys());
  }

  // ==========================================================================
  // v3.5 Performance Optimizations
  // ==========================================================================

  /**
   * Enable multi-threaded LOD selection using Web Workers
   */
  enableMultiThreading(workerCount: number = 4): void {
    if (typeof Worker === 'undefined') {
      console.warn('[LOD] Web Workers not supported, falling back to single-threaded mode');
      return;
    }

    // Create worker pool
    for (let i = 0; i < workerCount; i++) {
      try {
        const workerCode = this.generateWorkerCode();
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);

        worker.onmessage = (e) => this.handleWorkerMessage(e);
        worker.onerror = (e) => console.error('[LOD] Worker error:', e);

        this.workerPool.push(worker);
      } catch (error) {
        console.warn('[LOD] Failed to create worker:', error);
      }
    }

    this.workerEnabled = this.workerPool.length > 0;
    if (this.options.debug) {
      console.log(`[LOD] Multi-threading enabled with ${this.workerPool.length} workers`);
    }
  }

  /**
   * Disable multi-threading and cleanup workers
   */
  disableMultiThreading(): void {
    for (const worker of this.workerPool) {
      worker.terminate();
    }
    this.workerPool = [];
    this.workerEnabled = false;
  }

  /**
   * Generate Web Worker code for LOD distance calculations
   */
  private generateWorkerCode(): string {
    return `
      self.onmessage = function(e) {
        const { objects, cameraPos } = e.data;
        const results = [];

        for (const obj of objects) {
          const dx = obj.position[0] - cameraPos[0];
          const dy = obj.position[1] - cameraPos[1];
          const dz = obj.position[2] - cameraPos[2];

          // SIMD-style optimized distance calculation
          const distSq = dx * dx + dy * dy + dz * dz;
          const distance = Math.sqrt(distSq);

          results.push({
            objectId: obj.objectId,
            distance: distance,
            distanceSq: distSq
          });
        }

        self.postMessage({ results });
      };
    `;
  }

  /**
   * Handle worker message with distance calculation results
   */
  private handleWorkerMessage(e: MessageEvent): void {
    const { results } = e.data;

    for (const result of results) {
      const state = this.states.get(result.objectId);
      if (state) {
        state.cameraDistance = result.distance;
      }
    }
  }

  /**
   * Batch update multiple objects efficiently
   */
  updateBatch(objectIds: string[], deltaTime: number): void {
    const startTime = performance.now();

    // Reset per-frame metrics
    this.metrics.transitionsThisFrame = 0;
    this.transitionQueue = [];

    if (this.workerEnabled && objectIds.length > 100) {
      // Use multi-threaded approach for large batches
      this.updateBatchMultiThreaded(objectIds, deltaTime);
    } else {
      // Use single-threaded optimized approach
      this.updateBatchSingleThreaded(objectIds, deltaTime);
    }

    // Process transition queue (max 10 per frame to prevent stuttering)
    this.processTransitionQueue(deltaTime);

    this.metrics.selectionTimeMs = performance.now() - startTime;
    this.lastUpdateTime = Date.now();
  }

  /**
   * Single-threaded batch update with SIMD-style optimizations
   */
  private updateBatchSingleThreaded(objectIds: string[], deltaTime: number): void {
    const camX = this.cameraPosition[0];
    const camY = this.cameraPosition[1];
    const camZ = this.cameraPosition[2];

    // Process in chunks for cache efficiency
    for (let i = 0; i < objectIds.length; i++) {
      const objectId = objectIds[i];
      const config = this.configs.get(objectId);
      const state = this.states.get(objectId);

      if (!config?.enabled || !state) continue;

      // Get object position
      const objectPosition = this.getObjectPosition(objectId);
      const dx = objectPosition[0] - camX;
      const dy = objectPosition[1] - camY;
      const dz = objectPosition[2] - camZ;

      // Optimized distance calculation
      const distanceSq = dx * dx + dy * dy + dz * dz;
      const distance = Math.sqrt(distanceSq);

      state.cameraDistance = distance;

      // Select appropriate LOD level
      const newLevel = this.selectLevel(config, state);

      // Queue transition instead of executing immediately
      if (newLevel !== state.currentLevel && !state.isTransitioning) {
        this.queueTransition(objectId, newLevel, distance);
      }

      // Update existing transitions
      if (state.isTransitioning) {
        this.updateTransition(objectId, config, state, deltaTime);
      }

      state.lastUpdate = Date.now();
    }
  }

  /**
   * Multi-threaded batch update using worker pool
   */
  private updateBatchMultiThreaded(objectIds: string[], deltaTime: number): void {
    const chunkSize = Math.ceil(objectIds.length / this.workerPool.length);

    for (let i = 0; i < this.workerPool.length; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, objectIds.length);
      const chunk = objectIds.slice(start, end);

      const objects = chunk.map((id) => ({
        objectId: id,
        position: this.getObjectPosition(id),
      }));

      this.workerPool[i].postMessage({
        objects,
        cameraPos: this.cameraPosition,
      });
    }

    // Continue with level selection (workers update distances asynchronously)
    setTimeout(() => {
      for (const objectId of objectIds) {
        const config = this.configs.get(objectId);
        const state = this.states.get(objectId);

        if (!config?.enabled || !state) continue;

        const newLevel = this.selectLevel(config, state);

        if (newLevel !== state.currentLevel && !state.isTransitioning) {
          this.queueTransition(objectId, newLevel, state.cameraDistance);
        }

        if (state.isTransitioning) {
          this.updateTransition(objectId, config, state, deltaTime);
        }
      }

      this.processTransitionQueue(deltaTime);
    }, 0);
  }

  /**
   * Queue a transition with priority based on distance
   */
  private queueTransition(objectId: string, level: number, distance: number): void {
    // Priority: closer objects get higher priority (lower distance = higher priority)
    const priority = 1 / (distance + 1);

    this.transitionQueue.push({ objectId, level, priority });
  }

  /**
   * Process transition queue (max transitions per frame to prevent stuttering)
   */
  private processTransitionQueue(_deltaTime: number): void {
    // Sort by priority (highest first)
    this.transitionQueue.sort((a, b) => b.priority - a.priority);

    // Process top N transitions
    const transitionsToProcess = this.transitionQueue.slice(0, this.maxTransitionsPerFrame);

    for (const { objectId, level } of transitionsToProcess) {
      const config = this.configs.get(objectId);
      const state = this.states.get(objectId);

      if (config && state) {
        this.startTransition(objectId, config, state, level);
      }
    }

    // Clear queue
    this.transitionQueue = [];
  }

  /**
   * Query nearby objects using spatial hash grid
   */
  queryNearby(position: [number, number, number], radius: number): string[] {
    const nearby: Set<string> = new Set();

    // Get grid cells within radius
    const minCellX = Math.floor((position[0] - radius) / this.gridCellSize);
    const maxCellX = Math.floor((position[0] + radius) / this.gridCellSize);
    const minCellY = Math.floor((position[1] - radius) / this.gridCellSize);
    const maxCellY = Math.floor((position[1] + radius) / this.gridCellSize);
    const minCellZ = Math.floor((position[2] - radius) / this.gridCellSize);
    const maxCellZ = Math.floor((position[2] + radius) / this.gridCellSize);

    for (let x = minCellX; x <= maxCellX; x++) {
      for (let y = minCellY; y <= maxCellY; y++) {
        for (let z = minCellZ; z <= maxCellZ; z++) {
          const cellKey = `${x},${y},${z}`;
          const cellObjects = this.spatialHashGrid.get(cellKey);

          if (cellObjects) {
            for (const objectId of cellObjects) {
              const objPos = this.getObjectPosition(objectId);
              const dx = objPos[0] - position[0];
              const dy = objPos[1] - position[1];
              const dz = objPos[2] - position[2];
              const distSq = dx * dx + dy * dy + dz * dz;

              if (distSq <= radius * radius) {
                nearby.add(objectId);
              }
            }
          }
        }
      }
    }

    return Array.from(nearby);
  }

  /**
   * Update spatial hash grid for an object
   */
  private updateSpatialHash(objectId: string, position: [number, number, number]): void {
    // Remove from old cell
    for (const [_, objects] of this.spatialHashGrid) {
      objects.delete(objectId);
    }

    // Add to new cell
    const cellX = Math.floor(position[0] / this.gridCellSize);
    const cellY = Math.floor(position[1] / this.gridCellSize);
    const cellZ = Math.floor(position[2] / this.gridCellSize);
    const cellKey = `${cellX},${cellY},${cellZ}`;

    if (!this.spatialHashGrid.has(cellKey)) {
      this.spatialHashGrid.set(cellKey, new Set());
    }

    this.spatialHashGrid.get(cellKey)!.add(objectId);
  }

  /**
   * Set object position and update spatial hash
   */
  setObjectPositionOptimized(objectId: string, position: [number, number, number]): void {
    this.objectPositions.set(objectId, position);
    this.updateSpatialHash(objectId, position);
  }

  /**
   * Set maximum transitions per frame (prevent stuttering)
   */
  setMaxTransitionsPerFrame(max: number): void {
    this.maxTransitionsPerFrame = Math.max(1, max);
  }

  /**
   * Get maximum transitions per frame
   */
  getMaxTransitionsPerFrame(): number {
    return this.maxTransitionsPerFrame;
  }

  /**
   * Check if multi-threading is enabled
   */
  isMultiThreadingEnabled(): boolean {
    return this.workerEnabled;
  }

  /**
   * Get worker pool size
   */
  getWorkerPoolSize(): number {
    return this.workerPool.length;
  }

  /**
   * Clear spatial hash grid
   */
  clearSpatialHash(): void {
    this.spatialHashGrid.clear();
  }

  /**
   * Rebuild spatial hash grid for all objects
   */
  rebuildSpatialHash(): void {
    this.spatialHashGrid.clear();

    for (const [objectId, position] of this.objectPositions) {
      this.updateSpatialHash(objectId, position);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create LOD manager with default options
 */
export function createLODManager(options?: Partial<LODManagerOptions>): LODManager {
  return new LODManager(options);
}

/**
 * Create LOD manager optimized for VR
 */
export function createVRLODManager(): LODManager {
  return new LODManager({
    targetFrameRate: 90,
    cameraFOV: 100,
    updateFrequency: 90,
    globalBias: 0.2, // Slightly prefer lower detail for performance
  });
}

/**
 * Create LOD manager optimized for mobile
 */
export function createMobileLODManager(): LODManager {
  return new LODManager({
    targetFrameRate: 30,
    cameraFOV: 60,
    updateFrequency: 15,
    globalBias: 0.5, // More aggressive LOD for mobile
    collectMetrics: false, // Reduce overhead
  });
}
