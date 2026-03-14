// TARGET: packages/platform/renderer/src/VRPerformanceBudget.ts
// TODO-046 (HIGH): VR perf budget for fire-dragon.holo
//
// Extends the existing VRScenePerformanceBudget with runtime enforcement.
// The existing module provides static analysis of HoloScript compositions
// (draw calls, animation overhead, volumetric effects). This module adds:
//   1. Runtime frame budget enforcement (drop quality, not frames)
//   2. Per-subsystem time tracking (scene, post-processing, agents, physics)
//   3. Adaptive quality scaling based on actual GPU timings
//   4. Complex scene optimizers (169+ node scenes like fire-dragon.holo)
//   5. Budget violation alerting and automatic degradation

/**
 * VRPerformanceBudget
 *
 * Runtime performance budget enforcement for VR scenes.
 * Builds on VRScenePerformanceBudget (static analysis) with live
 * frame timing and automatic quality degradation to maintain 90Hz.
 *
 * Budget philosophy: Drop quality, never drop frames.
 *
 * @module VRPerformanceBudget
 * @version 1.0.0
 */

import { logger } from './logger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Subsystem identifiers for per-component budget tracking.
 */
export type BudgetSubsystem =
  | 'scene_render'       // Geometry + material draws
  | 'post_processing'    // Bloom, tone mapping, SSAO
  | 'volumetric'         // Fire, smoke, particles
  | 'animation'          // Skeletal, keyframe, procedural
  | 'physics'            // Physics step + collision
  | 'agent_inference'    // AI inference reads (front buffer)
  | 'cultural_trace'     // Stigmergic trace rendering
  | 'audio'              // Spatial audio processing
  | 'network'            // Sync/CRDT updates
  | 'headroom';          // Unallocated time for spikes

/**
 * Per-subsystem budget allocation in milliseconds.
 */
export interface SubsystemBudgets {
  readonly [key: string]: number;
}

/**
 * Default budget allocation for Quest 3 at 90Hz (11.1ms total).
 */
export const QUEST3_90HZ_BUDGETS: Readonly<Record<BudgetSubsystem, number>> = Object.freeze({
  scene_render: 5.0,
  post_processing: 1.2,
  volumetric: 1.5,
  animation: 0.8,
  physics: 0.5,
  agent_inference: 0.1,
  cultural_trace: 0.05,
  audio: 0.2,
  network: 0.15,
  headroom: 1.6,
});

/**
 * Budget allocation for PCVR at 90Hz (11.1ms total, more GPU headroom).
 */
export const PCVR_90HZ_BUDGETS: Readonly<Record<BudgetSubsystem, number>> = Object.freeze({
  scene_render: 6.0,
  post_processing: 1.5,
  volumetric: 2.0,
  animation: 1.0,
  physics: 0.6,
  agent_inference: 0.15,
  cultural_trace: 0.1,
  audio: 0.3,
  network: 0.2,
  headroom: -0.75,
});

/**
 * Real-time frame timing for a single frame.
 */
export interface FrameTiming {
  /** Frame number */
  readonly frameNumber: number;
  /** Total frame time (ms) */
  readonly totalMs: number;
  /** Per-subsystem timings */
  readonly subsystems: Readonly<Partial<Record<BudgetSubsystem, number>>>;
  /** Whether this frame exceeded the budget */
  readonly overBudget: boolean;
  /** How much over/under budget (negative = under) */
  readonly budgetDeltaMs: number;
  /** Current quality level (0-1) */
  readonly qualityLevel: number;
  /** Timestamp */
  readonly timestamp: number;
}

/**
 * Quality degradation level.
 */
export interface QualityDegradation {
  /** Current quality level (0-1, where 1 = max quality) */
  readonly level: number;
  /** Which subsystems have been degraded */
  readonly degradedSubsystems: readonly BudgetSubsystem[];
  /** Specific quality settings changes */
  readonly changes: readonly QualityChange[];
  /** Reason for degradation */
  readonly reason: string;
}

/**
 * A specific quality setting change.
 */
export interface QualityChange {
  readonly subsystem: BudgetSubsystem;
  readonly setting: string;
  readonly previousValue: number | string | boolean;
  readonly newValue: number | string | boolean;
  readonly estimatedSavingsMs: number;
}

/**
 * Budget violation event.
 */
export interface BudgetViolation {
  readonly timestamp: string;
  readonly frameNumber: number;
  readonly subsystem: BudgetSubsystem;
  readonly allocatedMs: number;
  readonly actualMs: number;
  readonly overageMs: number;
  /** How many consecutive frames this subsystem has been over budget */
  readonly consecutiveOverages: number;
}

/**
 * Configuration for the runtime budget enforcer.
 */
export interface PerformanceBudgetConfig {
  /** Target frame rate (default: 90) */
  readonly targetFPS: number;
  /** Per-subsystem budget allocations */
  readonly budgets: Readonly<Record<BudgetSubsystem, number>>;
  /** Consecutive over-budget frames before triggering degradation (default: 5) */
  readonly degradationThreshold: number;
  /** Consecutive under-budget frames before attempting quality restoration (default: 30) */
  readonly restorationThreshold: number;
  /** Minimum quality level (0-1, prevents degradation below this). Default: 0.3 */
  readonly minQualityLevel: number;
  /** Quality step size per degradation. Default: 0.1 */
  readonly degradationStep: number;
  /** Quality step size per restoration. Default: 0.05 (slower ramp-up) */
  readonly restorationStep: number;
  /** Maximum frame timing samples to keep for statistics. Default: 300 (10s at 30Hz) */
  readonly maxTimingSamples: number;
  /** Callback when budget is violated */
  readonly onViolation?: (violation: BudgetViolation) => void;
  /** Callback when quality is degraded */
  readonly onDegradation?: (degradation: QualityDegradation) => void;
}

/**
 * Performance budget statistics.
 */
export interface PerformanceBudgetStats {
  /** Total frames tracked */
  readonly totalFrames: number;
  /** Frames that exceeded total budget */
  readonly overBudgetFrames: number;
  /** Over-budget rate (0-1) */
  readonly overBudgetRate: number;
  /** Average frame time (ms) */
  readonly avgFrameTimeMs: number;
  /** P95 frame time (ms) */
  readonly p95FrameTimeMs: number;
  /** P99 frame time (ms) */
  readonly p99FrameTimeMs: number;
  /** Current quality level */
  readonly currentQualityLevel: number;
  /** Per-subsystem averages */
  readonly subsystemAverages: Readonly<Partial<Record<BudgetSubsystem, number>>>;
  /** Which subsystems are currently degraded */
  readonly degradedSubsystems: readonly BudgetSubsystem[];
  /** Total degradation events */
  readonly totalDegradations: number;
  /** Total restoration events */
  readonly totalRestorations: number;
}

// =============================================================================
// BUDGET ENFORCER
// =============================================================================

/**
 * Runtime frame budget enforcer for VR scenes.
 *
 * Tracks per-subsystem frame timings and automatically degrades quality
 * when budget is consistently exceeded. Restores quality gradually when
 * budget headroom is available.
 *
 * Degradation priority (first to degrade, last to restore):
 *   1. post_processing (bloom off, SSAO off)
 *   2. volumetric (reduce particle count, simpler fire shader)
 *   3. cultural_trace (reduce trace particle count)
 *   4. scene_render (increase LOD bias, reduce shadow map size)
 *   5. animation (reduce keyframe rate, cull distant animations)
 */
export class PerformanceBudgetEnforcer {
  private readonly config: Required<PerformanceBudgetConfig>;
  private readonly totalBudgetMs: number;

  // Frame timing history
  private readonly timings: FrameTiming[] = [];
  private frameCounter: number = 0;

  // Quality state
  private currentQuality: number = 1.0;
  private consecutiveOverBudget: number = 0;
  private consecutiveUnderBudget: number = 0;

  // Per-subsystem tracking
  private subsystemOverages: Map<BudgetSubsystem, number> = new Map();

  // Statistics
  private totalDegradations: number = 0;
  private totalRestorations: number = 0;
  private overBudgetFrames: number = 0;
  private violations: BudgetViolation[] = [];
  private readonly maxViolationHistory = 200;

  // Degradation order (first to degrade)
  private static readonly DEGRADATION_ORDER: BudgetSubsystem[] = [
    'post_processing',
    'volumetric',
    'cultural_trace',
    'scene_render',
    'animation',
  ];

  constructor(config?: Partial<PerformanceBudgetConfig>) {
    this.config = {
      targetFPS: config?.targetFPS ?? 90,
      budgets: config?.budgets ?? QUEST3_90HZ_BUDGETS,
      degradationThreshold: config?.degradationThreshold ?? 5,
      restorationThreshold: config?.restorationThreshold ?? 30,
      minQualityLevel: config?.minQualityLevel ?? 0.3,
      degradationStep: config?.degradationStep ?? 0.1,
      restorationStep: config?.restorationStep ?? 0.05,
      maxTimingSamples: config?.maxTimingSamples ?? 300,
      onViolation: config?.onViolation ?? (() => {}),
      onDegradation: config?.onDegradation ?? (() => {}),
    };

    this.totalBudgetMs = 1000 / this.config.targetFPS;
  }

  // =========================================================================
  // FRAME TRACKING
  // =========================================================================

  /**
   * Record a frame's timing data.
   *
   * Call this at the end of each frame with the per-subsystem timings.
   * The enforcer will check for violations and trigger quality adjustments.
   *
   * @param subsystemTimings Per-subsystem frame times in milliseconds
   */
  recordFrame(
    subsystemTimings: Partial<Record<BudgetSubsystem, number>>,
  ): FrameTiming {
    this.frameCounter++;

    // Compute total
    let totalMs = 0;
    for (const value of Object.values(subsystemTimings)) {
      totalMs += value ?? 0;
    }

    const overBudget = totalMs > this.totalBudgetMs;
    const budgetDeltaMs = totalMs - this.totalBudgetMs;

    const timing: FrameTiming = {
      frameNumber: this.frameCounter,
      totalMs,
      subsystems: { ...subsystemTimings },
      overBudget,
      budgetDeltaMs,
      qualityLevel: this.currentQuality,
      timestamp: Date.now(),
    };

    // Store timing
    this.timings.push(timing);
    if (this.timings.length > this.config.maxTimingSamples) {
      this.timings.shift();
    }

    // Check per-subsystem violations
    for (const [subsystem, actualMs] of Object.entries(subsystemTimings)) {
      const budget = this.config.budgets[subsystem as BudgetSubsystem];
      if (budget !== undefined && (actualMs ?? 0) > budget) {
        const overageCount = (this.subsystemOverages.get(subsystem as BudgetSubsystem) ?? 0) + 1;
        this.subsystemOverages.set(subsystem as BudgetSubsystem, overageCount);

        const violation: BudgetViolation = {
          timestamp: new Date().toISOString(),
          frameNumber: this.frameCounter,
          subsystem: subsystem as BudgetSubsystem,
          allocatedMs: budget,
          actualMs: actualMs ?? 0,
          overageMs: (actualMs ?? 0) - budget,
          consecutiveOverages: overageCount,
        };

        this.violations.push(violation);
        if (this.violations.length > this.maxViolationHistory) {
          this.violations.shift();
        }

        this.config.onViolation(violation);
      } else {
        // Reset consecutive overage counter for this subsystem
        this.subsystemOverages.set(subsystem as BudgetSubsystem, 0);
      }
    }

    // Track overall budget compliance
    if (overBudget) {
      this.overBudgetFrames++;
      this.consecutiveOverBudget++;
      this.consecutiveUnderBudget = 0;

      // Check if we should degrade
      if (this.consecutiveOverBudget >= this.config.degradationThreshold) {
        this.degradeQuality(budgetDeltaMs);
        this.consecutiveOverBudget = 0;
      }
    } else {
      this.consecutiveUnderBudget++;
      this.consecutiveOverBudget = 0;

      // Check if we can restore quality
      if (
        this.consecutiveUnderBudget >= this.config.restorationThreshold &&
        this.currentQuality < 1.0
      ) {
        this.restoreQuality();
        this.consecutiveUnderBudget = 0;
      }
    }

    return timing;
  }

  // =========================================================================
  // QUALITY MANAGEMENT
  // =========================================================================

  /**
   * Degrade quality to bring frame time back within budget.
   */
  private degradeQuality(overageMs: number): void {
    if (this.currentQuality <= this.config.minQualityLevel) {
      logger.warn('[VRPerformanceBudget] At minimum quality level, cannot degrade further', {
        quality: this.currentQuality,
        overageMs: overageMs.toFixed(2),
      });
      return;
    }

    const previousQuality = this.currentQuality;
    this.currentQuality = Math.max(
      this.config.minQualityLevel,
      this.currentQuality - this.config.degradationStep,
    );
    this.totalDegradations++;

    // Determine which subsystems to degrade
    const changes: QualityChange[] = [];
    const degradedSubsystems: BudgetSubsystem[] = [];

    // Find the most over-budget subsystem
    const sortedOverages = [...this.subsystemOverages.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);

    for (const subsystem of PerformanceBudgetEnforcer.DEGRADATION_ORDER) {
      if (this.currentQuality < 0.7) {
        degradedSubsystems.push(subsystem);
      } else if (sortedOverages.some(([s]) => s === subsystem)) {
        degradedSubsystems.push(subsystem);
      }
    }

    // Generate quality changes based on degradation level
    if (this.currentQuality < 0.9 && !degradedSubsystems.includes('post_processing')) {
      degradedSubsystems.push('post_processing');
    }

    for (const subsystem of degradedSubsystems) {
      changes.push(...this.generateDegradationChanges(subsystem));
    }

    const degradation: QualityDegradation = {
      level: this.currentQuality,
      degradedSubsystems,
      changes,
      reason: `Frame time exceeded budget by ${overageMs.toFixed(2)}ms for ${this.config.degradationThreshold} consecutive frames`,
    };

    logger.info('[VRPerformanceBudget] Quality degraded', {
      from: previousQuality.toFixed(2),
      to: this.currentQuality.toFixed(2),
      subsystems: degradedSubsystems.join(', '),
      overageMs: overageMs.toFixed(2),
    });

    this.config.onDegradation(degradation);
  }

  /**
   * Restore quality when budget headroom is available.
   */
  private restoreQuality(): void {
    if (this.currentQuality >= 1.0) return;

    const previousQuality = this.currentQuality;
    this.currentQuality = Math.min(1.0, this.currentQuality + this.config.restorationStep);
    this.totalRestorations++;

    logger.info('[VRPerformanceBudget] Quality restored', {
      from: previousQuality.toFixed(2),
      to: this.currentQuality.toFixed(2),
    });
  }

  /**
   * Generate specific quality changes for a subsystem degradation.
   */
  private generateDegradationChanges(subsystem: BudgetSubsystem): QualityChange[] {
    const changes: QualityChange[] = [];

    switch (subsystem) {
      case 'post_processing':
        if (this.currentQuality < 0.8) {
          changes.push({
            subsystem, setting: 'bloom', previousValue: true, newValue: false,
            estimatedSavingsMs: 0.3,
          });
        }
        if (this.currentQuality < 0.6) {
          changes.push({
            subsystem, setting: 'ssao', previousValue: true, newValue: false,
            estimatedSavingsMs: 0.5,
          });
        }
        break;

      case 'volumetric':
        if (this.currentQuality < 0.8) {
          changes.push({
            subsystem, setting: 'particleCount', previousValue: 1.0, newValue: 0.5,
            estimatedSavingsMs: 0.4,
          });
        }
        if (this.currentQuality < 0.5) {
          changes.push({
            subsystem, setting: 'volumetricFireEnabled', previousValue: true, newValue: false,
            estimatedSavingsMs: 1.0,
          });
        }
        break;

      case 'scene_render':
        if (this.currentQuality < 0.7) {
          changes.push({
            subsystem, setting: 'lodBias', previousValue: 1.0, newValue: 1.5,
            estimatedSavingsMs: 0.8,
          });
        }
        if (this.currentQuality < 0.5) {
          changes.push({
            subsystem, setting: 'shadowMapSize', previousValue: 2048, newValue: 1024,
            estimatedSavingsMs: 0.5,
          });
        }
        break;

      case 'animation':
        if (this.currentQuality < 0.7) {
          changes.push({
            subsystem, setting: 'distantAnimationCulling', previousValue: false, newValue: true,
            estimatedSavingsMs: 0.3,
          });
        }
        break;

      case 'cultural_trace':
        if (this.currentQuality < 0.8) {
          changes.push({
            subsystem, setting: 'traceParticleCount', previousValue: 1.0, newValue: 0.3,
            estimatedSavingsMs: 0.02,
          });
        }
        break;
    }

    return changes;
  }

  // =========================================================================
  // QUERY API
  // =========================================================================

  /**
   * Get the current quality level (0-1).
   */
  getQualityLevel(): number {
    return this.currentQuality;
  }

  /**
   * Get the total frame budget in milliseconds.
   */
  getTotalBudgetMs(): number {
    return this.totalBudgetMs;
  }

  /**
   * Get the budget allocation for a specific subsystem.
   */
  getSubsystemBudget(subsystem: BudgetSubsystem): number {
    return this.config.budgets[subsystem] ?? 0;
  }

  /**
   * Get recent violations.
   */
  getViolations(): readonly BudgetViolation[] {
    return [...this.violations];
  }

  /**
   * Get the most recent frame timing.
   */
  getLastFrameTiming(): FrameTiming | undefined {
    return this.timings[this.timings.length - 1];
  }

  /**
   * Check if a specific subsystem is currently within budget.
   */
  isSubsystemWithinBudget(subsystem: BudgetSubsystem): boolean {
    return (this.subsystemOverages.get(subsystem) ?? 0) < 2;
  }

  // =========================================================================
  // STATISTICS
  // =========================================================================

  /**
   * Get comprehensive performance budget statistics.
   */
  getStats(): PerformanceBudgetStats {
    const n = this.timings.length;

    // Compute averages
    let avgTotal = 0;
    const subsystemTotals: Partial<Record<BudgetSubsystem, number>> = {};
    const subsystemCounts: Partial<Record<BudgetSubsystem, number>> = {};

    for (const timing of this.timings) {
      avgTotal += timing.totalMs;
      for (const [sub, ms] of Object.entries(timing.subsystems)) {
        const key = sub as BudgetSubsystem;
        subsystemTotals[key] = (subsystemTotals[key] ?? 0) + (ms ?? 0);
        subsystemCounts[key] = (subsystemCounts[key] ?? 0) + 1;
      }
    }

    const subsystemAverages: Partial<Record<BudgetSubsystem, number>> = {};
    for (const [sub, total] of Object.entries(subsystemTotals)) {
      const count = subsystemCounts[sub as BudgetSubsystem] ?? 1;
      subsystemAverages[sub as BudgetSubsystem] = total / count;
    }

    // Compute percentiles
    const sortedTotals = this.timings.map(t => t.totalMs).sort((a, b) => a - b);
    const p95Index = Math.floor(n * 0.95);
    const p99Index = Math.floor(n * 0.99);

    // Find degraded subsystems
    const degradedSubsystems = PerformanceBudgetEnforcer.DEGRADATION_ORDER.filter(
      sub => (this.subsystemOverages.get(sub) ?? 0) >= 2,
    );

    return {
      totalFrames: this.frameCounter,
      overBudgetFrames: this.overBudgetFrames,
      overBudgetRate: this.frameCounter > 0 ? this.overBudgetFrames / this.frameCounter : 0,
      avgFrameTimeMs: n > 0 ? avgTotal / n : 0,
      p95FrameTimeMs: n > 0 ? sortedTotals[Math.min(p95Index, n - 1)] : 0,
      p99FrameTimeMs: n > 0 ? sortedTotals[Math.min(p99Index, n - 1)] : 0,
      currentQualityLevel: this.currentQuality,
      subsystemAverages,
      degradedSubsystems,
      totalDegradations: this.totalDegradations,
      totalRestorations: this.totalRestorations,
    };
  }

  /**
   * Reset all statistics and quality state.
   */
  reset(): void {
    this.timings.length = 0;
    this.frameCounter = 0;
    this.currentQuality = 1.0;
    this.consecutiveOverBudget = 0;
    this.consecutiveUnderBudget = 0;
    this.subsystemOverages.clear();
    this.totalDegradations = 0;
    this.totalRestorations = 0;
    this.overBudgetFrames = 0;
    this.violations.length = 0;
  }
}

// =============================================================================
// COMPLEX SCENE OPTIMIZER
// =============================================================================

/**
 * Optimization recommendation for complex scenes (169+ nodes).
 * Specific to fire-dragon.holo style compositions.
 */
export interface ComplexSceneOptimization {
  readonly category: 'instancing' | 'batching' | 'lod' | 'culling' | 'shader' | 'particles';
  readonly description: string;
  readonly estimatedSavingsMs: number;
  readonly nodeCount: number;
  readonly priority: number;
}

/**
 * Analyze a complex scene and produce optimization recommendations.
 *
 * @param nodeCount Total nodes in the scene
 * @param drawCallCount Current draw call count
 * @param hasVolumetricEffects Whether the scene has fire/smoke/particles
 * @param animatedNodeCount Number of animated nodes
 * @param platform Target platform
 */
export function analyzeComplexScene(
  nodeCount: number,
  drawCallCount: number,
  hasVolumetricEffects: boolean,
  animatedNodeCount: number,
  platform: 'quest2' | 'quest3' | 'pcvr' = 'quest3',
): ComplexSceneOptimization[] {
  const optimizations: ComplexSceneOptimization[] = [];

  const drawCallBudget = platform === 'quest2' ? 100 : platform === 'quest3' ? 150 : 300;

  // Instancing for repeated geometry (teeth, spines, claws, scales)
  if (nodeCount > 50) {
    const instanceableEstimate = Math.floor(nodeCount * 0.3);
    optimizations.push({
      category: 'instancing',
      description: `Instance ~${instanceableEstimate} repeated meshes (teeth, spines, claws, scales) into ${Math.ceil(instanceableEstimate / 10)} instanced draw calls`,
      estimatedSavingsMs: instanceableEstimate * 0.035,
      nodeCount: instanceableEstimate,
      priority: 1,
    });
  }

  // Static batching for non-animated meshes
  if (drawCallCount > drawCallBudget) {
    const batchableCount = nodeCount - animatedNodeCount;
    const estimatedBatches = Math.ceil(batchableCount / 20); // ~20 meshes per batch
    optimizations.push({
      category: 'batching',
      description: `Batch ${batchableCount} static meshes into ~${estimatedBatches} draw calls (from ${drawCallCount} unbatched)`,
      estimatedSavingsMs: (drawCallCount - estimatedBatches) * 0.035,
      nodeCount: batchableCount,
      priority: 1,
    });
  }

  // LOD for complex scenes
  if (nodeCount > 100) {
    optimizations.push({
      category: 'lod',
      description: `Apply 3-level LOD to ${nodeCount} nodes. At distance >10m, reduce to 30% geometry. At >20m, reduce to 10%.`,
      estimatedSavingsMs: 1.5,
      nodeCount,
      priority: 2,
    });
  }

  // Volumetric fire replacement
  if (hasVolumetricEffects) {
    optimizations.push({
      category: 'shader',
      description: 'Replace individual fire mesh draws with single VolumetricFireRenderer compute shader pass',
      estimatedSavingsMs: 1.2,
      nodeCount: 9, // Typical fire-dragon fire mesh count
      priority: 1,
    });

    optimizations.push({
      category: 'particles',
      description: 'Convert ember spheres to GPU particle system (InstancedBufferGeometry + custom shader)',
      estimatedSavingsMs: 0.3,
      nodeCount: 8,
      priority: 2,
    });
  }

  // Frustum culling for large scenes
  if (nodeCount > 150) {
    optimizations.push({
      category: 'culling',
      description: `Enable aggressive frustum culling with BVH. ~40% of ${nodeCount} nodes are typically outside view frustum`,
      estimatedSavingsMs: nodeCount * 0.01,
      nodeCount: Math.floor(nodeCount * 0.4),
      priority: 2,
    });
  }

  // Sort by priority
  optimizations.sort((a, b) => a.priority - b.priority);

  return optimizations;
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a PerformanceBudgetEnforcer with platform-specific defaults.
 */
export function createPerformanceBudgetEnforcer(
  platform: 'quest2' | 'quest3' | 'pcvr' = 'quest3',
  config?: Partial<PerformanceBudgetConfig>,
): PerformanceBudgetEnforcer {
  const budgets = platform === 'pcvr' ? PCVR_90HZ_BUDGETS : QUEST3_90HZ_BUDGETS;

  return new PerformanceBudgetEnforcer({
    targetFPS: 90,
    budgets,
    ...config,
  });
}
