/**
 * @holoscript/core - Unified Spatial Communication Client
 *
 * Unified client that orchestrates all three communication layers:
 * - Layer 1: Real-Time (UDP/WebRTC) for 90fps coordination
 * - Layer 2: A2A (HTTP/2) for task coordination
 * - Layer 3: MCP for high-level commands
 *
 * Integrates with Phase 1 agent identity and Phase 2 graceful degradation.
 */

import { EventEmitter } from 'events';
import { Layer1RealTimeClient } from './Layer1RealTime';
import { Layer2A2AClient } from './Layer2A2A';
import { Layer3MCPClient } from './Layer3MCP';
import { DEFAULT_SPATIAL_COMM_CONFIG } from './ProtocolTypes';
import type {
  SpatialCommProtocolConfig,
  WorldSpec,
  WorldStatus,
  TaskSpec,
  PerformanceMetrics,
  ExportFormat,
} from './ProtocolTypes';

// ============================================================================
// FRAME BUDGET TRACKER
// ============================================================================

/**
 * Frame budget tracker for graceful degradation
 */
export class FrameBudgetTracker {
  private targetFps: number;
  private targetFrameTimeMs: number;
  private frameTimeSamples: number[] = [];
  private maxSamples = 60; // Track last 60 frames
  private qualityLevel: 'high' | 'medium' | 'low' | 'minimal' = 'high';

  constructor(targetFps = 90) {
    this.targetFps = targetFps;
    this.targetFrameTimeMs = 1000 / targetFps; // 11.1ms for 90fps
  }

  /**
   * Record frame time
   */
  recordFrameTime(frameTimeMs: number): void {
    this.frameTimeSamples.push(frameTimeMs);

    // Keep only recent samples
    if (this.frameTimeSamples.length > this.maxSamples) {
      this.frameTimeSamples.shift();
    }

    // Auto-adjust quality based on performance
    this.autoAdjustQuality();
  }

  /**
   * Get average frame time
   */
  getAverageFrameTime(): number {
    if (this.frameTimeSamples.length === 0) return this.targetFrameTimeMs;

    const sum = this.frameTimeSamples.reduce((a, b) => a + b, 0);
    return sum / this.frameTimeSamples.length;
  }

  /**
   * Get maximum frame time
   */
  getMaxFrameTime(): number {
    if (this.frameTimeSamples.length === 0) return this.targetFrameTimeMs;
    return Math.max(...this.frameTimeSamples);
  }

  /**
   * Get current FPS
   */
  getCurrentFps(): number {
    const avgFrameTime = this.getAverageFrameTime();
    return 1000 / avgFrameTime;
  }

  /**
   * Get budget remaining for current frame
   */
  getBudgetRemaining(): number {
    const avgFrameTime = this.getAverageFrameTime();
    return Math.max(0, this.targetFrameTimeMs - avgFrameTime);
  }

  /**
   * Check if within budget
   */
  isWithinBudget(): boolean {
    return this.getAverageFrameTime() <= this.targetFrameTimeMs * 1.1; // 10% tolerance
  }

  /**
   * Get current quality level
   */
  getQualityLevel(): 'high' | 'medium' | 'low' | 'minimal' {
    return this.qualityLevel;
  }

  /**
   * Set quality level
   */
  setQualityLevel(level: 'high' | 'medium' | 'low' | 'minimal'): void {
    this.qualityLevel = level;
  }

  /**
   * Auto-adjust quality based on performance
   */
  private autoAdjustQuality(): void {
    const avgFrameTime = this.getAverageFrameTime();
    const targetFrameTime = this.targetFrameTimeMs;

    // Gradual quality reduction if over budget
    if (avgFrameTime > targetFrameTime * 1.3) {
      // >30% over budget
      this.qualityLevel = 'minimal';
    } else if (avgFrameTime > targetFrameTime * 1.2) {
      // >20% over budget
      this.qualityLevel = 'low';
    } else if (avgFrameTime > targetFrameTime * 1.1) {
      // >10% over budget
      this.qualityLevel = 'medium';
    } else {
      // Within budget - can increase quality
      this.qualityLevel = 'high';
    }
  }

  /**
   * Get frame budget stats
   */
  getStats(): {
    targetFps: number;
    currentFps: number;
    avgFrameTimeMs: number;
    maxFrameTimeMs: number;
    budgetRemainingMs: number;
    qualityLevel: 'high' | 'medium' | 'low' | 'minimal';
    withinBudget: boolean;
  } {
    return {
      targetFps: this.targetFps,
      currentFps: this.getCurrentFps(),
      avgFrameTimeMs: this.getAverageFrameTime(),
      maxFrameTimeMs: this.getMaxFrameTime(),
      budgetRemainingMs: this.getBudgetRemaining(),
      qualityLevel: this.qualityLevel,
      withinBudget: this.isWithinBudget(),
    };
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.frameTimeSamples = [];
    this.qualityLevel = 'high';
  }
}

// ============================================================================
// UNIFIED SPATIAL COMM CLIENT
// ============================================================================

/**
 * Unified spatial communication client
 */
export class SpatialCommClient extends EventEmitter {
  private agentId: string;
  private config: SpatialCommProtocolConfig;

  // Layer clients
  private layer1?: Layer1RealTimeClient;
  private layer2?: Layer2A2AClient;
  private layer3?: Layer3MCPClient;

  // Frame budget tracker
  private frameBudget: FrameBudgetTracker;

  // State
  private initialized = false;
  private currentWorldId?: string;

  constructor(agentId: string, config?: Partial<SpatialCommProtocolConfig>) {
    super();
    this.agentId = agentId;
    this.config = {
      layer1: { ...DEFAULT_SPATIAL_COMM_CONFIG.layer1, ...(config?.layer1 || {}) },
      layer2: { ...DEFAULT_SPATIAL_COMM_CONFIG.layer2, ...(config?.layer2 || {}) },
      layer3: { ...DEFAULT_SPATIAL_COMM_CONFIG.layer3, ...(config?.layer3 || {}) },
    };

    this.frameBudget = new FrameBudgetTracker(this.config.layer1.targetLatency);
  }

  /**
   * Initialize all layers
   */
  async init(options?: { useWebRTC?: boolean }): Promise<void> {
    if (this.initialized) {
      throw new Error('Client already initialized');
    }

    // Initialize Layer 1 (Real-Time)
    this.layer1 = new Layer1RealTimeClient(this.agentId, this.config.layer1);
    await this.layer1.init(options?.useWebRTC);

    // Forward Layer 1 events
    this.layer1.on('message', (msg) => this.emit('layer1:message', msg));
    this.layer1.on('latency_warning', (data) => this.emit('layer1:latency_warning', data));

    // Initialize Layer 2 (A2A Coordination)
    this.layer2 = new Layer2A2AClient(this.agentId, this.config.layer2);

    // Forward Layer 2 events
    this.layer2.on('message', (msg) => this.emit('layer2:message', msg));
    this.layer2.on('spatial_conflict', (data) => this.emit('layer2:spatial_conflict', data));
    this.layer2.on('retry', (data) => this.emit('layer2:retry', data));

    // Initialize Layer 3 (MCP Metadata)
    this.layer3 = new Layer3MCPClient(this.agentId, this.config.layer3);

    // Forward Layer 3 events
    this.layer3.on('command_success', (data) => this.emit('layer3:command_success', data));
    this.layer3.on('command_error', (data) => this.emit('layer3:command_error', data));

    this.initialized = true;
    this.emit('initialized', { agentId: this.agentId });
  }

  // ==========================================================================
  // LAYER 1: REAL-TIME OPERATIONS
  // ==========================================================================

  /**
   * Send position sync (Layer 1)
   */
  async syncPosition(
    position: [number, number, number],
    rotation: [number, number, number, number],
    scale: [number, number, number],
    velocity?: [number, number, number]
  ): Promise<void> {
    if (!this.layer1) throw new Error('Layer 1 not initialized');
    await this.layer1.sendPositionSync(position, rotation, scale, velocity);
  }

  /**
   * Send frame budget update (Layer 1)
   */
  async sendFrameBudget(): Promise<void> {
    if (!this.layer1) throw new Error('Layer 1 not initialized');

    const stats = this.frameBudget.getStats();

    await this.layer1.sendFrameBudget(
      stats.avgFrameTimeMs,
      stats.budgetRemainingMs,
      stats.targetFps,
      stats.currentFps,
      stats.qualityLevel
    );
  }

  /**
   * Record frame time (updates budget tracker)
   */
  recordFrameTime(frameTimeMs: number): void {
    this.frameBudget.recordFrameTime(frameTimeMs);

    // Emit budget warning if over budget
    if (!this.frameBudget.isWithinBudget()) {
      this.emit('budget_warning', this.frameBudget.getStats());
    }
  }

  /**
   * Get frame budget stats
   */
  getFrameBudgetStats() {
    return this.frameBudget.getStats();
  }

  // ==========================================================================
  // LAYER 2: COORDINATION OPERATIONS
  // ==========================================================================

  /**
   * Assign task to agent (Layer 2)
   */
  async assignTask(toAgent: string, task: TaskSpec) {
    if (!this.layer2) throw new Error('Layer 2 not initialized');
    return this.layer2.assignTask(toAgent, task);
  }

  /**
   * Complete task (Layer 2)
   */
  async completeTask(
    taskId: string,
    success: boolean,
    result?: any,
    error?: string
  ) {
    if (!this.layer2) throw new Error('Layer 2 not initialized');

    // Include frame budget metrics
    const stats = this.frameBudget.getStats();

    return this.layer2.completeTask(taskId, success, result, error, {
      duration_ms: 0, // Would be tracked separately
      frame_time_avg_ms: stats.avgFrameTimeMs,
      frame_time_max_ms: stats.maxFrameTimeMs,
      quality_level: stats.qualityLevel,
    });
  }

  /**
   * Claim spatial region (Layer 2)
   */
  async claimSpatialRegion(
    claimId: string,
    boundingBox: {
      min: [number, number, number];
      max: [number, number, number];
    },
    priority: 'low' | 'medium' | 'high' | 'critical',
    durationMs?: number,
    exclusive = true
  ) {
    if (!this.layer2) throw new Error('Layer 2 not initialized');
    return this.layer2.claimSpatialRegion(claimId, boundingBox, priority, durationMs, exclusive);
  }

  /**
   * Request resource (Layer 2)
   */
  async requestResource(
    resourceId: string,
    resourceType: 'mesh' | 'texture' | 'material' | 'audio' | 'compute' | 'memory',
    amount?: number,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) {
    if (!this.layer2) throw new Error('Layer 2 not initialized');
    return this.layer2.requestResource(resourceId, resourceType, amount, priority);
  }

  /**
   * Release resource (Layer 2)
   */
  async releaseResource(resourceId: string) {
    if (!this.layer2) throw new Error('Layer 2 not initialized');
    return this.layer2.releaseResource(resourceId);
  }

  /**
   * Get spatial claims (Layer 2)
   */
  getMyClaims() {
    if (!this.layer2) throw new Error('Layer 2 not initialized');
    return this.layer2.getMyClaims();
  }

  // ==========================================================================
  // LAYER 3: METADATA OPERATIONS
  // ==========================================================================

  /**
   * Create world (Layer 3)
   */
  async createWorld(worldSpec: WorldSpec): Promise<{ world_id: string; status: WorldStatus }> {
    if (!this.layer3) throw new Error('Layer 3 not initialized');
    const result = await this.layer3.createWorld(worldSpec);
    this.currentWorldId = result.world_id;
    return result;
  }

  /**
   * Get world status (Layer 3)
   */
  async getWorldStatus(worldId?: string): Promise<WorldStatus> {
    if (!this.layer3) throw new Error('Layer 3 not initialized');
    const id = worldId || this.currentWorldId;
    if (!id) throw new Error('No world ID specified');
    return this.layer3.getWorldStatus(id);
  }

  /**
   * Export world (Layer 3)
   */
  async exportWorld(format: ExportFormat, worldId?: string) {
    if (!this.layer3) throw new Error('Layer 3 not initialized');
    const id = worldId || this.currentWorldId;
    if (!id) throw new Error('No world ID specified');
    return this.layer3.exportWorld(id, format);
  }

  /**
   * Get agent registry (Layer 3)
   */
  async getAgentRegistry(filter?: {
    status?: 'online' | 'offline' | 'degraded';
    role?: string;
    world_id?: string;
  }) {
    if (!this.layer3) throw new Error('Layer 3 not initialized');
    return this.layer3.getAgentRegistry(filter);
  }

  /**
   * Get performance metrics (Layer 3)
   */
  async getPerformanceMetrics(options?: {
    world_id?: string;
    agent_id?: string;
  }): Promise<PerformanceMetrics> {
    if (!this.layer3) throw new Error('Layer 3 not initialized');
    return this.layer3.getPerformanceMetrics(options);
  }

  /**
   * Set global configuration (Layer 3)
   */
  async setGlobalConfig(config: {
    target_fps?: number;
    max_agents?: number;
    quality_level?: 'high' | 'medium' | 'low' | 'minimal';
  }) {
    if (!this.layer3) throw new Error('Layer 3 not initialized');
    return this.layer3.setGlobalConfig(config);
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Shutdown client
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    // Shutdown layers in reverse order
    if (this.layer3) {
      // Layer 3 has no explicit shutdown
    }

    if (this.layer2) {
      await this.layer2.shutdown();
    }

    if (this.layer1) {
      await this.layer1.close();
    }

    this.initialized = false;
    this.emit('shutdown');
  }

  /**
   * Get client status
   */
  getStatus(): {
    agentId: string;
    initialized: boolean;
    currentWorldId?: string;
    frameBudget: ReturnType<FrameBudgetTracker['getStats']>;
    queueStats: ReturnType<Layer2A2AClient['getQueueStats']>;
  } {
    return {
      agentId: this.agentId,
      initialized: this.initialized,
      currentWorldId: this.currentWorldId,
      frameBudget: this.frameBudget.getStats(),
      queueStats: this.layer2?.getQueueStats() || { queueSize: 0, claimCount: 0 },
    };
  }
}
