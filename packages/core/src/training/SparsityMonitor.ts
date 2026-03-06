/**
 * SparsityMonitor.ts
 *
 * Monitors SNN (Spiking Neural Network) sparsity during simulation,
 * tracking spike rates and activation sparsity across layers, calculating
 * energy efficiency metrics, and detecting sparsity regime violations.
 *
 * Integrates with the self-improvement pipeline via:
 * - SelfImproveHarvester: provides metrics for continuous quality monitoring
 * - quality-history.json: outputs compatible entries for historical tracking
 *
 * Key threshold (W.041): SNN layers must maintain >= 93% activation sparsity.
 *
 * Usage:
 * ```ts
 * const monitor = new SparsityMonitor({ sparsityThreshold: 0.93 });
 *
 * // Record layer activity during simulation
 * monitor.recordLayerActivity('lif_hidden_1', {
 *   neuronCount: 1000,
 *   spikeCount: 50,
 *   timestep: 0,
 * });
 *
 * // Take a snapshot
 * const snapshot = monitor.takeSnapshot();
 *
 * // Check for violations
 * const violations = monitor.getActiveViolations();
 *
 * // Get quality-history.json compatible entry
 * const entry = monitor.toQualityHistoryEntry(1);
 * ```
 *
 * @module training/SparsityMonitor
 */

import type {
  SNNLayerMetrics,
  SparsitySnapshot,
  EnergyEfficiencyMetrics,
  SparsityViolation,
  SparsityMonitorConfig,
  SparsityMonitorStats,
  SparsityQualityHistoryEntry,
} from './SparsityMonitorTypes';

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: SparsityMonitorConfig = {
  sparsityThreshold: 0.93,
  windowSize: 50,
  perLayerTracking: true,
  energyMetricsEnabled: true,
  avgSynapsesPerNeuron: 100,
  opsPerSynapse: 2,
  criticalThreshold: 0.85,
  maxViolationHistory: 1000,
};

// =============================================================================
// INPUT TYPE FOR RECORDING ACTIVITY
// =============================================================================

/**
 * Input data for recording layer activity. The monitor computes
 * derived fields (spikeRate, activationSparsity) from these inputs.
 */
export interface LayerActivityInput {
  /** Total number of neurons in the layer */
  neuronCount: number;
  /** Number of neurons that spiked */
  spikeCount: number;
  /** Simulation timestep index */
  timestep: number;
  /** Optional: average membrane potential */
  avgMembranePotential?: number;
}

// =============================================================================
// SPARSITY MONITOR
// =============================================================================

/**
 * Monitors SNN activation sparsity across layers during simulation.
 *
 * Provides:
 * 1. Per-layer spike rate and activation sparsity tracking
 * 2. Energy efficiency calculation (theoretical ops saved via sparsity)
 * 3. Sparsity regime violation detection (W.041: >= 93% threshold)
 * 4. Integration with SelfImproveHarvester for continuous quality monitoring
 * 5. Output compatible with quality-history.json format
 */
export class SparsityMonitor {
  private config: SparsityMonitorConfig;

  /** Current layer metrics indexed by layerId, latest values per layer */
  private currentLayerMetrics: Map<string, SNNLayerMetrics> = new Map();

  /** Historical layer metrics: layerId -> array of metrics over time */
  private layerHistory: Map<string, SNNLayerMetrics[]> = new Map();

  /** Snapshots taken over time */
  private snapshots: SparsitySnapshot[] = [];

  /** Detected violations */
  private violations: SparsityViolation[] = [];

  /** Rolling window of aggregate sparsity values for stats */
  private sparsityWindow: number[] = [];

  /** Total timesteps recorded across all layers */
  private totalTimestepsRecorded = 0;

  constructor(config: Partial<SparsityMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  /**
   * Record activity for a single SNN layer at a given timestep.
   *
   * Computes spike rate and activation sparsity from the raw input,
   * checks for threshold violations, and stores the metrics.
   *
   * @param layerId - Unique identifier for the layer
   * @param input - Raw activity data (neuronCount, spikeCount, timestep)
   * @returns The computed SNNLayerMetrics for this recording
   */
  recordLayerActivity(layerId: string, input: LayerActivityInput): SNNLayerMetrics {
    if (input.neuronCount <= 0) {
      throw new Error(`neuronCount must be positive, got ${input.neuronCount}`);
    }
    if (input.spikeCount < 0) {
      throw new Error(`spikeCount must be non-negative, got ${input.spikeCount}`);
    }
    if (input.spikeCount > input.neuronCount) {
      throw new Error(
        `spikeCount (${input.spikeCount}) cannot exceed neuronCount (${input.neuronCount})`,
      );
    }

    const spikeRate = input.spikeCount / input.neuronCount;
    const activationSparsity = 1 - spikeRate;

    const metrics: SNNLayerMetrics = {
      layerId,
      neuronCount: input.neuronCount,
      spikeCount: input.spikeCount,
      spikeRate: roundTo4(spikeRate),
      activationSparsity: roundTo4(activationSparsity),
      avgMembranePotential: input.avgMembranePotential,
      timestep: input.timestep,
    };

    // Store current metrics
    this.currentLayerMetrics.set(layerId, metrics);

    // Track history if per-layer tracking is enabled
    if (this.config.perLayerTracking) {
      if (!this.layerHistory.has(layerId)) {
        this.layerHistory.set(layerId, []);
      }
      this.layerHistory.get(layerId)!.push(metrics);
    }

    this.totalTimestepsRecorded++;

    // Check for violations
    this.checkViolation(metrics);

    return metrics;
  }

  /**
   * Record activity for multiple layers at the same timestep (batch recording).
   *
   * @param layerInputs - Map of layerId -> activity input
   * @returns Array of computed metrics for each layer
   */
  recordBatchActivity(
    layerInputs: Map<string, LayerActivityInput> | Record<string, LayerActivityInput>,
  ): SNNLayerMetrics[] {
    const entries = layerInputs instanceof Map
      ? Array.from(layerInputs.entries())
      : Object.entries(layerInputs);

    return entries.map(([layerId, input]) =>
      this.recordLayerActivity(layerId, input),
    );
  }

  // ---------------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------------

  /**
   * Take a point-in-time snapshot of all current layer metrics.
   *
   * The snapshot captures aggregate statistics across all tracked layers,
   * computes energy efficiency, and checks for violations.
   *
   * @returns The snapshot, or null if no layer metrics have been recorded
   */
  takeSnapshot(): SparsitySnapshot | null {
    if (this.currentLayerMetrics.size === 0) {
      return null;
    }

    const layers = Array.from(this.currentLayerMetrics.values());
    const totalNeurons = layers.reduce((sum, l) => sum + l.neuronCount, 0);
    const totalSpikes = layers.reduce((sum, l) => sum + l.spikeCount, 0);

    // Weighted aggregate sparsity (weighted by neuron count per layer)
    const aggregateSparsity = totalNeurons > 0
      ? roundTo4(1 - totalSpikes / totalNeurons)
      : 1;

    const aggregateSpikeRate = totalNeurons > 0
      ? roundTo4(totalSpikes / totalNeurons)
      : 0;

    // Energy efficiency
    const energyEfficiency = this.config.energyMetricsEnabled
      ? this.calculateEnergyEfficiency(layers)
      : createZeroEnergyMetrics();

    // Detect violations in this snapshot
    const violations = this.detectViolationsForLayers(layers);

    const snapshot: SparsitySnapshot = {
      timestamp: new Date().toISOString(),
      layers: layers.map((l) => ({ ...l })),
      aggregateSparsity,
      aggregateSpikeRate,
      totalNeurons,
      totalSpikes,
      energyEfficiency,
      violations,
    };

    this.snapshots.push(snapshot);

    // Update rolling sparsity window
    this.sparsityWindow.push(aggregateSparsity);
    if (this.sparsityWindow.length > this.config.windowSize) {
      this.sparsityWindow.shift();
    }

    return snapshot;
  }

  // ---------------------------------------------------------------------------
  // Energy Efficiency
  // ---------------------------------------------------------------------------

  /**
   * Calculate theoretical energy efficiency metrics for the given layers.
   *
   * Dense ops = sum of (neuronCount * avgSynapsesPerNeuron * opsPerSynapse) per layer
   * Sparse ops = sum of (spikeCount * avgSynapsesPerNeuron * opsPerSynapse) per layer
   *
   * The ratio of ops saved reflects the theoretical computational advantage
   * of SNN sparsity over equivalent dense ANN computation.
   */
  calculateEnergyEfficiency(layers: SNNLayerMetrics[]): EnergyEfficiencyMetrics {
    const { avgSynapsesPerNeuron, opsPerSynapse } = this.config;

    let denseOps = 0;
    let sparseOps = 0;

    for (const layer of layers) {
      const layerDenseOps = layer.neuronCount * avgSynapsesPerNeuron * opsPerSynapse;
      const layerSparseOps = layer.spikeCount * avgSynapsesPerNeuron * opsPerSynapse;
      denseOps += layerDenseOps;
      sparseOps += layerSparseOps;
    }

    const opsSaved = denseOps - sparseOps;
    const efficiencyRatio = denseOps > 0 ? roundTo4(opsSaved / denseOps) : 0;
    const energySavingsFactor = denseOps > 0
      ? roundTo4(denseOps / Math.max(1, sparseOps))
      : 1;

    return {
      denseOps,
      sparseOps,
      opsSaved,
      efficiencyRatio,
      energySavingsFactor,
    };
  }

  // ---------------------------------------------------------------------------
  // Violation Detection
  // ---------------------------------------------------------------------------

  /**
   * Check a single layer's metrics against the sparsity threshold.
   * If a violation is detected, it is recorded in the violations history.
   */
  private checkViolation(metrics: SNNLayerMetrics): SparsityViolation | null {
    if (metrics.activationSparsity >= this.config.sparsityThreshold) {
      return null;
    }

    const deficit = roundTo4(this.config.sparsityThreshold - metrics.activationSparsity);
    const severity: SparsityViolation['severity'] =
      metrics.activationSparsity < this.config.criticalThreshold ? 'critical' : 'warning';

    const violation: SparsityViolation = {
      layerId: metrics.layerId,
      measuredSparsity: metrics.activationSparsity,
      requiredThreshold: this.config.sparsityThreshold,
      deficit,
      severity,
      detectedAt: new Date().toISOString(),
      timestep: metrics.timestep,
    };

    this.violations.push(violation);

    // Trim violation history if it exceeds the maximum
    if (this.violations.length > this.config.maxViolationHistory) {
      this.violations = this.violations.slice(-this.config.maxViolationHistory);
    }

    return violation;
  }

  /**
   * Detect violations for an array of layer metrics (used in snapshots).
   */
  private detectViolationsForLayers(layers: SNNLayerMetrics[]): SparsityViolation[] {
    const snapshotViolations: SparsityViolation[] = [];
    for (const layer of layers) {
      if (layer.activationSparsity < this.config.sparsityThreshold) {
        const deficit = roundTo4(this.config.sparsityThreshold - layer.activationSparsity);
        const severity: SparsityViolation['severity'] =
          layer.activationSparsity < this.config.criticalThreshold ? 'critical' : 'warning';

        snapshotViolations.push({
          layerId: layer.layerId,
          measuredSparsity: layer.activationSparsity,
          requiredThreshold: this.config.sparsityThreshold,
          deficit,
          severity,
          detectedAt: new Date().toISOString(),
          timestep: layer.timestep,
        });
      }
    }
    return snapshotViolations;
  }

  /**
   * Get all violations currently affecting active layers
   * (the most recent metric per layer that is below threshold).
   */
  getActiveViolations(): SparsityViolation[] {
    const active: SparsityViolation[] = [];
    for (const [, metrics] of this.currentLayerMetrics) {
      if (metrics.activationSparsity < this.config.sparsityThreshold) {
        const deficit = roundTo4(this.config.sparsityThreshold - metrics.activationSparsity);
        const severity: SparsityViolation['severity'] =
          metrics.activationSparsity < this.config.criticalThreshold ? 'critical' : 'warning';
        active.push({
          layerId: metrics.layerId,
          measuredSparsity: metrics.activationSparsity,
          requiredThreshold: this.config.sparsityThreshold,
          deficit,
          severity,
          detectedAt: new Date().toISOString(),
          timestep: metrics.timestep,
        });
      }
    }
    return active;
  }

  /**
   * Get all historical violations.
   */
  getViolationHistory(): SparsityViolation[] {
    return [...this.violations];
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Compute aggregate statistics across all recorded data.
   */
  getStats(): SparsityMonitorStats {
    const allSparsities: number[] = [];
    const perLayerSums: Record<string, { sum: number; count: number }> = {};

    for (const [layerId, history] of this.layerHistory) {
      for (const m of history) {
        allSparsities.push(m.activationSparsity);
        if (!perLayerSums[layerId]) {
          perLayerSums[layerId] = { sum: 0, count: 0 };
        }
        perLayerSums[layerId].sum += m.activationSparsity;
        perLayerSums[layerId].count++;
      }
    }

    // If no per-layer history, fall back to current metrics
    if (allSparsities.length === 0) {
      for (const [layerId, m] of this.currentLayerMetrics) {
        allSparsities.push(m.activationSparsity);
        perLayerSums[layerId] = { sum: m.activationSparsity, count: 1 };
      }
    }

    const meanSparsity = allSparsities.length > 0
      ? roundTo4(allSparsities.reduce((a, b) => a + b, 0) / allSparsities.length)
      : 0;

    const minSparsity = allSparsities.length > 0
      ? Math.min(...allSparsities)
      : 0;

    const maxSparsity = allSparsities.length > 0
      ? Math.max(...allSparsities)
      : 0;

    const stdDevSparsity = allSparsities.length > 1
      ? roundTo4(standardDeviation(allSparsities))
      : 0;

    const perLayerMeanSparsity: Record<string, number> = {};
    for (const [layerId, data] of Object.entries(perLayerSums)) {
      perLayerMeanSparsity[layerId] = roundTo4(data.sum / data.count);
    }

    const warningCount = this.violations.filter((v) => v.severity === 'warning').length;
    const criticalCount = this.violations.filter((v) => v.severity === 'critical').length;

    // Mean energy efficiency from snapshots
    const efficiencies = this.snapshots
      .map((s) => s.energyEfficiency.efficiencyRatio)
      .filter((e) => e > 0);
    const meanEnergyEfficiency = efficiencies.length > 0
      ? roundTo4(efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length)
      : 0;

    const activeViolations = this.getActiveViolations();

    return {
      totalTimesteps: this.totalTimestepsRecorded,
      totalSnapshots: this.snapshots.length,
      trackedLayers: this.currentLayerMetrics.size,
      meanSparsity,
      minSparsity,
      maxSparsity,
      stdDevSparsity,
      totalViolations: this.violations.length,
      violationsBySeverity: {
        warning: warningCount,
        critical: criticalCount,
      },
      perLayerMeanSparsity,
      meanEnergyEfficiency,
      inCompliance: activeViolations.length === 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Quality History Integration
  // ---------------------------------------------------------------------------

  /**
   * Generate an entry compatible with the quality-history.json format.
   *
   * The composite score is based on the aggregate sparsity relative to
   * the threshold: score = min(1, aggregateSparsity / threshold).
   *
   * @param cycle - The monitoring cycle number
   * @returns A quality history entry with sparsity-specific metrics
   */
  toQualityHistoryEntry(cycle: number): SparsityQualityHistoryEntry {
    const stats = this.getStats();
    const latestSnapshot = this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null;

    const aggregateSparsity = latestSnapshot?.aggregateSparsity ?? stats.meanSparsity;
    const aggregateSpikeRate = latestSnapshot?.aggregateSpikeRate ?? (1 - stats.meanSparsity);

    // Composite score: how well the system meets the sparsity threshold
    // 1.0 = at or above threshold, scales linearly below
    const composite = roundTo4(
      Math.min(1, aggregateSparsity / this.config.sparsityThreshold),
    );

    const grade = gradeFromComposite(composite);

    const summary = this.generateSummary(stats, latestSnapshot, composite, grade);

    return {
      timestamp: new Date().toISOString(),
      cycle,
      composite,
      grade,
      focus: 'snn-sparsity',
      summary,
      sparsityMetrics: {
        aggregateSparsity,
        aggregateSpikeRate: roundTo4(aggregateSpikeRate),
        energyEfficiencyRatio: stats.meanEnergyEfficiency,
        violationCount: stats.totalViolations,
        layerCount: stats.trackedLayers,
        totalNeurons: latestSnapshot?.totalNeurons ?? 0,
        inCompliance: stats.inCompliance,
      },
    };
  }

  /**
   * Generate a human-readable summary string for the quality history entry.
   */
  private generateSummary(
    stats: SparsityMonitorStats,
    latestSnapshot: SparsitySnapshot | null,
    composite: number,
    grade: SparsityQualityHistoryEntry['grade'],
  ): string {
    const lines: string[] = [];

    lines.push(`SNN Sparsity Monitor - Grade: ${grade} (${(composite * 100).toFixed(1)}%)`);
    lines.push(`Layers: ${stats.trackedLayers}, Timesteps: ${stats.totalTimesteps}`);
    lines.push(`Mean Sparsity: ${(stats.meanSparsity * 100).toFixed(1)}% (threshold: ${(this.config.sparsityThreshold * 100).toFixed(0)}%)`);
    lines.push(`Range: [${(stats.minSparsity * 100).toFixed(1)}%, ${(stats.maxSparsity * 100).toFixed(1)}%]`);

    if (latestSnapshot) {
      const eff = latestSnapshot.energyEfficiency;
      lines.push(`Energy Efficiency: ${(eff.efficiencyRatio * 100).toFixed(1)}% ops saved (${eff.energySavingsFactor.toFixed(1)}x factor)`);
    }

    if (stats.totalViolations > 0) {
      lines.push(`Violations: ${stats.totalViolations} (${stats.violationsBySeverity.critical} critical, ${stats.violationsBySeverity.warning} warning)`);
    } else {
      lines.push('Compliance: All layers within threshold');
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Harvester Integration
  // ---------------------------------------------------------------------------

  /**
   * Get metrics formatted for integration with SelfImproveHarvester.
   *
   * Returns a record of key metrics that can be attached to harvest records
   * as additional metadata for training data quality assessment.
   */
  getHarvesterMetrics(): Record<string, number | boolean> {
    const stats = this.getStats();
    return {
      snn_mean_sparsity: stats.meanSparsity,
      snn_min_sparsity: stats.minSparsity,
      snn_max_sparsity: stats.maxSparsity,
      snn_violation_count: stats.totalViolations,
      snn_energy_efficiency: stats.meanEnergyEfficiency,
      snn_in_compliance: stats.inCompliance,
      snn_tracked_layers: stats.trackedLayers,
      snn_total_timesteps: stats.totalTimesteps,
    };
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /**
   * Get all recorded snapshots.
   */
  getSnapshots(): SparsitySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get the most recent snapshot, or null if none have been taken.
   */
  getLatestSnapshot(): SparsitySnapshot | null {
    return this.snapshots.length > 0
      ? { ...this.snapshots[this.snapshots.length - 1] }
      : null;
  }

  /**
   * Get current layer metrics.
   */
  getCurrentLayerMetrics(): Map<string, SNNLayerMetrics> {
    return new Map(this.currentLayerMetrics);
  }

  /**
   * Get history for a specific layer.
   */
  getLayerHistory(layerId: string): SNNLayerMetrics[] {
    return [...(this.layerHistory.get(layerId) ?? [])];
  }

  /**
   * Get the current configuration.
   */
  getConfig(): SparsityMonitorConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  /**
   * Reset all recorded data and start fresh.
   */
  reset(): void {
    this.currentLayerMetrics.clear();
    this.layerHistory.clear();
    this.snapshots = [];
    this.violations = [];
    this.sparsityWindow = [];
    this.totalTimestepsRecorded = 0;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Round a number to 4 decimal places.
 */
function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Calculate standard deviation of an array of numbers.
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Convert a composite score to a letter grade.
 */
function gradeFromComposite(composite: number): SparsityQualityHistoryEntry['grade'] {
  if (composite >= 0.95) return 'A';
  if (composite >= 0.85) return 'B';
  if (composite >= 0.70) return 'C';
  if (composite >= 0.50) return 'D';
  return 'F';
}

/**
 * Create zero-valued energy metrics (for when energy metrics are disabled).
 */
function createZeroEnergyMetrics(): EnergyEfficiencyMetrics {
  return {
    denseOps: 0,
    sparseOps: 0,
    opsSaved: 0,
    efficiencyRatio: 0,
    energySavingsFactor: 1,
  };
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new SparsityMonitor with optional configuration overrides.
 */
export function createSparsityMonitor(
  config?: Partial<SparsityMonitorConfig>,
): SparsityMonitor {
  return new SparsityMonitor(config);
}
