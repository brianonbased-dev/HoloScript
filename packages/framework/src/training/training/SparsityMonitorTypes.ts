/**
 * SparsityMonitorTypes.ts
 *
 * Type definitions for SNN (Spiking Neural Network) sparsity monitoring
 * in the self-improvement pipeline. Tracks spike rates, activation sparsity,
 * energy efficiency metrics, and detects sparsity regime violations.
 *
 * Key threshold (W.041): SNN layers must maintain >= 93% activation sparsity
 * to preserve the energy efficiency advantages of spike-based computation.
 *
 * @module training/SparsityMonitorTypes
 */

// =============================================================================
// LAYER-LEVEL METRICS
// =============================================================================

/**
 * Metrics for a single SNN layer during a simulation timestep or batch.
 */
export interface SNNLayerMetrics {
  /** Unique layer identifier (e.g., "lif_hidden_1", "snn_output") */
  layerId: string;
  /** Total number of neurons in this layer */
  neuronCount: number;
  /** Number of neurons that spiked (fired) in this timestep/batch */
  spikeCount: number;
  /** Spike rate = spikeCount / neuronCount (0-1) */
  spikeRate: number;
  /** Activation sparsity = 1 - spikeRate (0-1); higher = sparser = better */
  activationSparsity: number;
  /** Average membrane potential across neurons (for LIF models) */
  avgMembranePotential?: number;
  /** Simulation timestep index */
  timestep: number;
}

// =============================================================================
// SNAPSHOT (POINT-IN-TIME MEASUREMENT)
// =============================================================================

/**
 * A point-in-time snapshot of sparsity metrics across all SNN layers.
 */
export interface SparsitySnapshot {
  /** ISO 8601 timestamp of measurement */
  timestamp: string;
  /** Per-layer metrics at this point in time */
  layers: SNNLayerMetrics[];
  /** Aggregate sparsity across all layers (weighted by neuron count) */
  aggregateSparsity: number;
  /** Aggregate spike rate across all layers */
  aggregateSpikeRate: number;
  /** Total neurons across all layers */
  totalNeurons: number;
  /** Total spikes across all layers */
  totalSpikes: number;
  /** Energy efficiency metrics at this snapshot */
  energyEfficiency: EnergyEfficiencyMetrics;
  /** Any violations detected at this snapshot */
  violations: SparsityViolation[];
}

// =============================================================================
// ENERGY EFFICIENCY METRICS
// =============================================================================

/**
 * Theoretical energy efficiency metrics comparing SNN spike-based
 * computation vs. equivalent dense (ANN) computation.
 *
 * The key insight: in an SNN, only spiking neurons perform multiply-accumulate
 * (MAC) operations on their synaptic connections. Silent neurons contribute
 * zero computation. This is the source of SNN energy efficiency.
 */
export interface EnergyEfficiencyMetrics {
  /** Total theoretical operations if all neurons were active (dense ANN baseline) */
  denseOps: number;
  /** Actual operations performed (only spiking neurons contribute) */
  sparseOps: number;
  /** Operations saved = denseOps - sparseOps */
  opsSaved: number;
  /** Efficiency ratio = opsSaved / denseOps (0-1); higher = more efficient */
  efficiencyRatio: number;
  /** Estimated energy savings factor (relative to dense baseline = 1.0) */
  energySavingsFactor: number;
}

// =============================================================================
// SPARSITY VIOLATION
// =============================================================================

/**
 * A detected violation of the sparsity threshold.
 *
 * Per W.041 from SNN research: SNN layers must maintain >= 93% activation
 * sparsity. Below this threshold, the energy efficiency advantage of
 * spike-based computation degrades significantly.
 */
export interface SparsityViolation {
  /** The layer that violated the threshold */
  layerId: string;
  /** The measured activation sparsity (0-1) */
  measuredSparsity: number;
  /** The required minimum sparsity threshold (default: 0.93) */
  requiredThreshold: number;
  /** How far below the threshold: threshold - measured */
  deficit: number;
  /** Severity classification */
  severity: 'warning' | 'critical';
  /** ISO 8601 timestamp of violation detection */
  detectedAt: string;
  /** Timestep at which the violation was detected */
  timestep: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for the SparsityMonitor.
 */
export interface SparsityMonitorConfig {
  /** Minimum activation sparsity threshold (default: 0.93 per W.041) */
  sparsityThreshold: number;
  /** Window size for rolling average calculations (default: 50 timesteps) */
  windowSize: number;
  /** Whether to track per-layer detailed metrics (default: true) */
  perLayerTracking: boolean;
  /** Whether energy efficiency calculation is enabled (default: true) */
  energyMetricsEnabled: boolean;
  /** Average synaptic connections per neuron (for ops calculation, default: 100) */
  avgSynapsesPerNeuron: number;
  /** MAC operations per synaptic event (default: 2 - multiply + accumulate) */
  opsPerSynapse: number;
  /** Critical severity threshold: sparsity below this is critical (default: 0.85) */
  criticalThreshold: number;
  /** Maximum violations to retain in history (default: 1000) */
  maxViolationHistory: number;
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Aggregate statistics from the SparsityMonitor.
 */
export interface SparsityMonitorStats {
  /** Total number of timesteps recorded */
  totalTimesteps: number;
  /** Total number of snapshots taken */
  totalSnapshots: number;
  /** Number of layers being tracked */
  trackedLayers: number;
  /** Overall mean sparsity across all timesteps and layers */
  meanSparsity: number;
  /** Minimum sparsity observed */
  minSparsity: number;
  /** Maximum sparsity observed */
  maxSparsity: number;
  /** Standard deviation of sparsity measurements */
  stdDevSparsity: number;
  /** Total violations detected */
  totalViolations: number;
  /** Violations by severity */
  violationsBySeverity: { warning: number; critical: number };
  /** Per-layer mean sparsity */
  perLayerMeanSparsity: Record<string, number>;
  /** Mean energy efficiency ratio */
  meanEnergyEfficiency: number;
  /** Whether the system is currently in compliance (no active violations) */
  inCompliance: boolean;
}

// =============================================================================
// QUALITY HISTORY ENTRY (compatible with quality-history.json)
// =============================================================================

/**
 * An entry compatible with the quality-history.json format used by the
 * self-improvement pipeline. Allows sparsity metrics to be tracked
 * alongside existing quality metrics.
 */
export interface SparsityQualityHistoryEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Monitoring cycle number */
  cycle: number;
  /** Aggregate sparsity as composite score (0-1) */
  composite: number;
  /** Grade based on sparsity compliance */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Focus area identifier */
  focus: 'snn-sparsity';
  /** Human-readable summary */
  summary: string;
  /** Detailed sparsity metrics */
  sparsityMetrics: {
    aggregateSparsity: number;
    aggregateSpikeRate: number;
    energyEfficiencyRatio: number;
    violationCount: number;
    layerCount: number;
    totalNeurons: number;
    inCompliance: boolean;
  };
}
