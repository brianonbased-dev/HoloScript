/**
 * KVFlow Early Warning — carousel-pattern detection and per-brain metrics.
 *
 * Extends the KVFlow cache manager's telemetry with:
 * 1. Per-brain (per-agent-step) hit-rate breakdowns
 * 2. Prefetch stall avoidance tracking (how many stalls were prevented by prefetch)
 * 3. Carousel-pattern detection (repeated eviction-then-reload cycles on the same
 *    brain, indicating the eviction policy is out of sync with the workflow graph)
 * 4. Workflow-graph drift detection (when the agent step graph topology changes
 *    but the eviction config hasn't been updated)
 *
 * Wired to /reflect and cost-dashboard via `checkCarouselEarlyWarning()`.
 *
 * @module @holoscript/llm-provider/kvflow
 * @version 0.1.0
 */

import type { KVFlowTelemetry, KVFlowScope, StepNodeId } from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Per-brain (per-agent-step) cache metrics. Each brain corresponds to one
 * agent's role overlay or the shared team-board prefix.
 */
export interface BrainMetrics {
  /** Agent step ID this metrics bucket tracks. */
  stepId: StepNodeId;

  /** Cache scope for this brain. */
  scope: KVFlowScope;

  /** Number of cache hits for this brain. */
  hits: number;

  /** Number of cache misses for this brain. */
  misses: number;

  /** Hit rate (hits / (hits + misses)). 0 if no events. */
  hitRate: number;

  /** Number of times this brain's KV was evicted and then reloaded. */
  evictionReloadCycles: number;

  /** Number of prefetch operations that successfully loaded this brain's
   *  KV before it was needed, avoiding a cache-miss stall. */
  prefetchStallsAvoided: number;

  /** Number of cache-miss stalls that were NOT avoided (hit after miss
   *  without a successful prefetch). */
  stallsObserved: number;

  /** Current steps-to-execution value (lower = more imminent). */
  stepsToExecution: number;

  /** Current residency of this brain's KV entry. */
  residency: 'device' | 'host' | 'evicted' | 'unknown';
}

/**
 * Severity level for carousel-pattern warnings.
 */
export type CarouselSeverity = 'none' | 'early_warning' | 'warning' | 'critical';

/**
 * A carousel-pattern warning. Emitted when a brain's KV cache shows signs
 * of eviction-then-reload cycling (the core KVFlow problem).
 */
export interface CarouselWarning {
  /** The brain (agent step) that triggered this warning. */
  stepId: StepNodeId;

  /** Cache scope of the affected brain. */
  scope: KVFlowScope;

  /** Severity of the carousel pattern. */
  severity: CarouselSeverity;

  /** Human-readable explanation. */
  message: string;

  /** Number of eviction-reload cycles detected for this brain. */
  cycles: number;

  /** Hit rate for this brain (low hit rate = carousel indicator). */
  hitRate: number;

  /** Recommended action. */
  recommendation: string;
}

/**
 * Drift signal: when the workflow graph topology changes but the eviction
 * config hasn't been updated, this struct captures the divergence.
 */
export interface WorkflowDrift {
  /** Timestamp of the last graph topology change observed. */
  lastGraphChange: string;

  /** Timestamp of the last eviction config update. */
  lastConfigUpdate: string;

  /** Number of agent steps added since the last config update. */
  stepsAdded: number;

  /** Number of agent steps removed since the last config update. */
  stepsRemoved: number;

  /** Whether the drift is significant enough to warrant a config update. */
  isStale: boolean;

  /** Human-readable summary. */
  summary: string;
}

/**
 * Full early-warning report from the KVFlow carousel detector.
 */
export interface CarouselEarlyWarningReport {
  /** Timestamp of this report. */
  generatedAt: string;

  /** Overall cache hit rate across all brains. */
  overallHitRate: number;

  /** Overall prefetch stall avoidance rate (stalls avoided / total stalls). */
  overallPrefetchEffectiveness: number;

  /** Per-brain metrics, keyed by step ID. */
  brainMetrics: Map<StepNodeId, BrainMetrics>;

  /** Carousel-pattern warnings for brains with eviction-reload cycling. */
  warnings: CarouselWarning[];

  /** Workflow graph drift signal (null if no drift detected). */
  drift: WorkflowDrift | null;

  /** Summary for /reflect and cost-dashboard surfaces. */
  summary: CarouselSummary;
}

/**
 * Compact summary for /reflect and cost-dashboard surfaces.
 */
export interface CarouselSummary {
  /** Total brains tracked. */
  totalBrains: number;

  /** Brains with hit rate >= 0.8 (healthy). */
  healthyBrains: number;

  /** Brains with hit rate < 0.5 (concerning). */
  atRiskBrains: number;

  /** Brains with carousel-pattern cycling detected. */
  carouselBrains: number;

  /** Total prefetch stalls avoided across all brains. */
  totalStallsAvoided: number;

  /** Total stalls observed (cache-miss without prefetch). */
  totalStallsObserved: number;

  /** Whether workflow graph drift is detected. */
  hasDrift: boolean;

  /** One-line status for dashboards. */
  statusLine: string;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for the carousel early-warning detector.
 */
export interface CarouselEarlyWarningConfig {
  /**
   * Minimum number of telemetry events before carousel detection activates.
   * Prevents false positives from sparse data.
   * Default: 5
   */
  minSampleSize: number;

  /**
   * Hit rate below which a brain is considered "at risk."
   * Default: 0.5
   */
  atRiskHitRateThreshold: number;

  /**
   * Hit rate above which a brain is considered "healthy."
   * Default: 0.8
   */
  healthyHitRateThreshold: number;

  /**
   * Number of eviction-reload cycles that triggers early_warning severity.
   * Default: 2
   */
  earlyWarningCycleThreshold: number;

  /**
   * Number of eviction-reload cycles that triggers warning severity.
   * Default: 4
   */
  warningCycleThreshold: number;

  /**
   * Number of eviction-reload cycles that triggers critical severity.
   * Default: 8
   */
  criticalCycleThreshold: number;

  /**
   * Whether workflow graph drift detection is enabled.
   * Default: true
   */
  driftDetectionEnabled: boolean;

  /**
   * Maximum staleness in milliseconds before the eviction config is considered
   * stale relative to the last graph change.
   * Default: 300_000 (5 minutes)
   */
  configStalenessThresholdMs: number;
}

const DEFAULT_CAROUSEL_CONFIG: Required<CarouselEarlyWarningConfig> = {
  minSampleSize: 5,
  atRiskHitRateThreshold: 0.5,
  healthyHitRateThreshold: 0.8,
  earlyWarningCycleThreshold: 2,
  warningCycleThreshold: 4,
  criticalCycleThreshold: 8,
  driftDetectionEnabled: true,
  configStalenessThresholdMs: 300_000, // 5 minutes
};

// =============================================================================
// Early Warning Detector
// =============================================================================

/**
 * KVFlow Carousel Early Warning Detector.
 *
 * Analyzes telemetry from the KVFlowCacheManager to detect:
 * - Carousel patterns (eviction-then-reload cycles per brain)
 * - Low hit-rate brains (at-risk agents)
 * - Prefetch effectiveness (stalls avoided vs observed)
 * - Workflow graph drift (graph topology changed but config is stale)
 *
 * Usage:
 * ```ts
 * const detector = new KVFlowCarouselDetector();
 * const report = detector.checkCarouselEarlyWarning(manager.getTelemetry(), {
 *   brainEntries: manager.getAllEntries(),
 *   graphChangeAt: lastGraphChange,
 *   configUpdatedAt: lastConfigUpdate,
 * });
 * ```
 */
export class KVFlowCarouselDetector {
  private readonly config: Required<CarouselEarlyWarningConfig>;

  constructor(config?: Partial<CarouselEarlyWarningConfig>) {
    this.config = { ...DEFAULT_CAROUSEL_CONFIG, ...config };
  }

  /**
   * Analyze KVFlow telemetry and produce a carousel early-warning report.
   *
   * @param telemetry - Recent telemetry events from the KVFlowCacheManager
   * @param context - Additional context: brain entries, graph change timestamps, etc.
   * @returns Full early-warning report with per-brain metrics and carousel warnings
   */
  checkCarouselEarlyWarning(
    telemetry: KVFlowTelemetry[],
    context: {
      /** Current brain entries from the cache manager. */
      brainEntries: Array<{
        stepId: StepNodeId;
        scope: KVFlowScope;
        residency: string;
        stepsToExecution: number;
      }>;
      /** Timestamp of the last workflow graph topology change. */
      graphChangeAt?: string;
      /** Timestamp of the last eviction config update. */
      configUpdatedAt?: string;
      /** Steps added since last config update (from graph diff). */
      stepsAddedSinceConfig?: number;
      /** Steps removed since last config update (from graph diff). */
      stepsRemovedSinceConfig?: number;
    }
  ): CarouselEarlyWarningReport {
    const now = new Date().toISOString();

    // 1. Compute per-brain metrics from telemetry
    const brainMetrics = this.computeBrainMetrics(telemetry, context.brainEntries);

    // 2. Detect carousel patterns
    const warnings = this.detectCarouselPatterns(brainMetrics);

    // 3. Compute overall hit rate
    const overallHitRate = this.computeOverallHitRate(telemetry);

    // 4. Compute prefetch effectiveness
    const prefetchEffectiveness = this.computePrefetchEffectiveness(telemetry);

    // 5. Detect workflow graph drift
    const drift = this.detectWorkflowDrift(context);

    // 6. Build summary
    const metricsArray = Array.from(brainMetrics.values());
    const summary: CarouselSummary = {
      totalBrains: metricsArray.length,
      healthyBrains: metricsArray.filter((m) => m.hitRate >= this.config.healthyHitRateThreshold).length,
      atRiskBrains: metricsArray.filter((m) => m.hitRate < this.config.atRiskHitRateThreshold).length,
      carouselBrains: warnings.length,
      totalStallsAvoided: metricsArray.reduce((sum, m) => sum + m.prefetchStallsAvoided, 0),
      totalStallsObserved: metricsArray.reduce((sum, m) => sum + m.stallsObserved, 0),
      hasDrift: drift?.isStale ?? false,
      statusLine: this.buildStatusLine(overallHitRate, prefetchEffectiveness, warnings, drift),
    };

    return {
      generatedAt: now,
      overallHitRate,
      overallPrefetchEffectiveness: prefetchEffectiveness,
      brainMetrics,
      warnings,
      drift,
      summary,
    };
  }

  // ===========================================================================
  // Per-Brain Metrics
  // ===========================================================================

  private computeBrainMetrics(
    telemetry: KVFlowTelemetry[],
    brainEntries: Array<{
      stepId: StepNodeId;
      scope: KVFlowScope;
      residency: string;
      stepsToExecution: number;
    }>
  ): Map<StepNodeId, BrainMetrics> {
    const metrics = new Map<StepNodeId, BrainMetrics>();

    // Initialize from brain entries (known brains from the cache manager)
    for (const entry of brainEntries) {
      metrics.set(entry.stepId, {
        stepId: entry.stepId,
        scope: entry.scope,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictionReloadCycles: 0,
        prefetchStallsAvoided: 0,
        stallsObserved: 0,
        stepsToExecution: entry.stepsToExecution,
        residency: entry.residency as BrainMetrics['residency'],
      });
    }

    // Track eviction-reload cycles and prefetch/miss events
    // We need to detect the pattern: eviction → subsequent hit/miss (reload)
    const evictionTimestamps = new Map<StepNodeId, string[]>();
    const prefetchTimestamps = new Map<StepNodeId, string[]>();

    for (const event of telemetry) {
      const stepId = event.stepId;

      // Ensure the brain exists in the metrics map
      if (!metrics.has(stepId)) {
        metrics.set(stepId, {
          stepId,
          scope: event.scope,
          hits: 0,
          misses: 0,
          hitRate: 0,
          evictionReloadCycles: 0,
          prefetchStallsAvoided: 0,
          stallsObserved: 0,
          stepsToExecution: event.stepsToExecution,
          residency: 'unknown',
        });
      }

      const brain = metrics.get(stepId)!;

      switch (event.type) {
        case 'hit':
          brain.hits++;
          break;
        case 'miss':
          brain.misses++;
          // Check if this miss was preceded by an eviction (carousel indicator)
          const priorEvictions = evictionTimestamps.get(stepId) ?? [];
          if (priorEvictions.length > 0) {
            // Miss after eviction = the cache was cleared and had to recompute
            brain.evictionReloadCycles++;
          }
          // Check if this miss was NOT preceded by a prefetch (stall observed)
          const priorPrefetches = prefetchTimestamps.get(stepId) ?? [];
          const hadPrefetch = priorPrefetches.some(
            (ts) => new Date(ts) < new Date(event.timestamp)
          );
          if (!hadPrefetch) {
            brain.stallsObserved++;
          }
          break;
        case 'eviction':
          if (!evictionTimestamps.has(stepId)) {
            evictionTimestamps.set(stepId, []);
          }
          evictionTimestamps.get(stepId)!.push(event.timestamp);
          break;
        case 'prefetch':
          if (!prefetchTimestamps.has(stepId)) {
            prefetchTimestamps.set(stepId, []);
          }
          prefetchTimestamps.get(stepId)!.push(event.timestamp);
          // A prefetch that completes before the brain is needed = stall avoided
          brain.prefetchStallsAvoided++;
          break;
        case 'pressure':
          // Pressure events don't directly contribute to per-brain metrics
          break;
      }

      // Update STE and residency from the latest event
      brain.stepsToExecution = event.stepsToExecution;
    }

    // Compute hit rates
    for (const brain of Array.from(metrics.values())) {
      const total = brain.hits + brain.misses;
      brain.hitRate = total > 0 ? brain.hits / total : 0;
    }

    return metrics;
  }

  // ===========================================================================
  // Carousel Pattern Detection
  // ===========================================================================

  private detectCarouselPatterns(brainMetrics: Map<StepNodeId, BrainMetrics>): CarouselWarning[] {
    const warnings: CarouselWarning[] = [];

    for (const brain of Array.from(brainMetrics.values())) {
      const totalEvents = brain.hits + brain.misses;
      if (totalEvents < this.config.minSampleSize) {
        // Not enough data to detect carousel patterns
        continue;
      }

      // Carousel pattern: repeated eviction-then-reload cycles
      // Each cycle means the brain's KV was evicted and then needed again
      // (cache miss or hit after eviction), indicating the eviction policy
      // is cycling this brain in and out of cache unnecessarily.
      if (brain.evictionReloadCycles >= this.config.earlyWarningCycleThreshold) {
        let severity: CarouselSeverity;
        let recommendation: string;

        if (brain.evictionReloadCycles >= this.config.criticalCycleThreshold) {
          severity = 'critical';
          recommendation =
            `Brain ${brain.stepId} has ${brain.evictionReloadCycles} eviction-reload cycles. ` +
            `Consider increasing sharedPrefixReserveFraction or reducing minRetentionSte ` +
            `to protect this brain's KV from carousel eviction.`;
        } else if (brain.evictionReloadCycles >= this.config.warningCycleThreshold) {
          severity = 'warning';
          recommendation =
            `Brain ${brain.stepId} shows ${brain.evictionReloadCycles} eviction-reload cycles. ` +
            `Review the workflow graph — this brain may need a lower STE or a higher priority.`;
        } else {
          severity = 'early_warning';
          recommendation =
            `Brain ${brain.stepId} has ${brain.evictionReloadCycles} eviction-reload cycles. ` +
            `Monitor — if this increases, adjust the eviction config or prefetch lookahead.`;
        }

        warnings.push({
          stepId: brain.stepId,
          scope: brain.scope,
          severity,
          message:
            `Carousel pattern detected for ${brain.scope} brain ${brain.stepId}: ` +
            `${brain.evictionReloadCycles} eviction-reload cycles, hit rate ${brain.hitRate.toFixed(2)}`,
          cycles: brain.evictionReloadCycles,
          hitRate: brain.hitRate,
          recommendation,
        });
      }

      // Low hit rate warning (even without carousel cycles)
      if (
        brain.hitRate < this.config.atRiskHitRateThreshold &&
        brain.evictionReloadCycles < this.config.earlyWarningCycleThreshold
      ) {
        warnings.push({
          stepId: brain.stepId,
          scope: brain.scope,
          severity: 'early_warning',
          message:
            `Low cache hit rate for ${brain.scope} brain ${brain.stepId}: ` +
            `${brain.hitRate.toFixed(2)} (${brain.hits}/${brain.hits + brain.misses})`,
          cycles: brain.evictionReloadCycles,
          hitRate: brain.hitRate,
          recommendation:
            `Brain ${brain.stepId} has a low hit rate. Check if its STE is too high ` +
            `(evicted too eagerly) or if the workflow graph doesn't schedule it often enough.`,
        });
      }
    }

    // Sort by severity (critical first)
    const severityOrder: Record<CarouselSeverity, number> = {
      critical: 3,
      warning: 2,
      early_warning: 1,
      none: 0,
    };
    warnings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

    return warnings;
  }

  // ===========================================================================
  // Overall Metrics
  // ===========================================================================

  private computeOverallHitRate(telemetry: KVFlowTelemetry[]): number {
    const hitMiss = telemetry.filter((t) => t.type === 'hit' || t.type === 'miss');
    if (hitMiss.length === 0) return 0;
    const hits = hitMiss.filter((t) => t.cacheHit === true).length;
    return hits / hitMiss.length;
  }

  private computePrefetchEffectiveness(telemetry: KVFlowTelemetry[]): number {
    // Prefetch effectiveness = (prefetch events that prevented a miss) / total prefetch events
    // Simplified: ratio of prefetch events to (prefetch + miss) events
    const prefetches = telemetry.filter((t) => t.type === 'prefetch');
    const misses = telemetry.filter((t) => t.type === 'miss');
    const total = prefetches.length + misses.length;
    if (total === 0) return 1; // No misses at all = perfect effectiveness
    return prefetches.length / total;
  }

  // ===========================================================================
  // Workflow Graph Drift Detection
  // ===========================================================================

  private detectWorkflowDrift(context: {
    graphChangeAt?: string;
    configUpdatedAt?: string;
    stepsAddedSinceConfig?: number;
    stepsRemovedSinceConfig?: number;
  }): WorkflowDrift | null {
    if (!this.config.driftDetectionEnabled) return null;
    if (!context.graphChangeAt) return null;

    const graphChangeTime = new Date(context.graphChangeAt).getTime();
    const configUpdateTime = context.configUpdatedAt
      ? new Date(context.configUpdatedAt).getTime()
      : 0;

    const stepsAdded = context.stepsAddedSinceConfig ?? 0;
    const stepsRemoved = context.stepsRemovedSinceConfig ?? 0;
    const configIsStale =
      configUpdateTime < graphChangeTime ||
      (Date.now() - configUpdateTime > this.config.configStalenessThresholdMs &&
        (stepsAdded + stepsRemoved) > 0);

    if (!configIsStale && stepsAdded === 0 && stepsRemoved === 0) return null;

    const isStale =
      configIsStale ||
      (stepsAdded + stepsRemoved) > 0;

    const summary = isStale
      ? `Workflow graph has ${stepsAdded} additions and ${stepsRemoved} removals since last config update. ` +
        `Eviction policy may be stale.`
      : 'Eviction config is up to date with the workflow graph.';

    return {
      lastGraphChange: context.graphChangeAt,
      lastConfigUpdate: context.configUpdatedAt ?? 'never',
      stepsAdded,
      stepsRemoved,
      isStale,
      summary,
    };
  }

  // ===========================================================================
  // Status Line Builder
  // ===========================================================================

  private buildStatusLine(
    hitRate: number,
    prefetchEffectiveness: number,
    warnings: CarouselWarning[],
    drift: WorkflowDrift | null
  ): string {
    const parts: string[] = [];

    // Hit rate
    if (hitRate >= this.config.healthyHitRateThreshold) {
      parts.push(`hit-rate: ${(hitRate * 100).toFixed(1)}% (healthy)`);
    } else if (hitRate >= this.config.atRiskHitRateThreshold) {
      parts.push(`hit-rate: ${(hitRate * 100).toFixed(1)}% (moderate)`);
    } else {
      parts.push(`hit-rate: ${(hitRate * 100).toFixed(1)}% (at-risk)`);
    }

    // Prefetch effectiveness
    parts.push(`prefetch-effectiveness: ${(prefetchEffectiveness * 100).toFixed(1)}%`);

    // Warnings
    const critical = warnings.filter((w) => w.severity === 'critical').length;
    const warning = warnings.filter((w) => w.severity === 'warning').length;
    const early = warnings.filter((w) => w.severity === 'early_warning').length;
    if (critical > 0) parts.push(`carousel: ${critical} CRITICAL`);
    if (warning > 0) parts.push(`carousel: ${warning} warning`);
    if (early > 0) parts.push(`carousel: ${early} early-warning`);

    // Drift
    if (drift?.isStale) {
      parts.push('graph-drift: STALE');
    }

    return parts.join(' | ');
  }
}

// =============================================================================
// Convenience Factory
// =============================================================================

/**
 * Default instance with standard configuration.
 */
export const defaultCarouselDetector = new KVFlowCarouselDetector();

/**
 * Run the carousel early-warning check against KVFlow telemetry.
 *
 * Convenience function that creates a detector with default config and
 * runs the analysis. For custom thresholds, create a KVFlowCarouselDetector
 * instance directly.
 */
export function checkCarouselEarlyWarning(
  telemetry: KVFlowTelemetry[],
  context: Parameters<KVFlowCarouselDetector['checkCarouselEarlyWarning']>[1]
): CarouselEarlyWarningReport {
  return defaultCarouselDetector.checkCarouselEarlyWarning(telemetry, context);
}