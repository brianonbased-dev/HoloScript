import { describe, it, expect, beforeEach } from 'vitest';
import {
  SparsityMonitor,
  createSparsityMonitor,
} from '../SparsityMonitor';
import type { LayerActivityInput } from '../SparsityMonitor';
import type {
  SNNLayerMetrics,
  SparsitySnapshot,
  EnergyEfficiencyMetrics,
  SparsityViolation,
  SparsityMonitorConfig,
  SparsityMonitorStats,
  SparsityQualityHistoryEntry,
} from '../SparsityMonitorTypes';

// =============================================================================
// HELPERS
// =============================================================================

function makeInput(overrides: Partial<LayerActivityInput> = {}): LayerActivityInput {
  return {
    neuronCount: 1000,
    spikeCount: 50,
    timestep: 0,
    ...overrides,
  };
}

/**
 * Create a monitor with common test defaults:
 * - 93% sparsity threshold (per W.041)
 * - Per-layer tracking enabled
 * - Energy metrics enabled
 */
function createTestMonitor(
  overrides: Partial<SparsityMonitorConfig> = {},
): SparsityMonitor {
  return new SparsityMonitor({
    sparsityThreshold: 0.93,
    windowSize: 50,
    perLayerTracking: true,
    energyMetricsEnabled: true,
    avgSynapsesPerNeuron: 100,
    opsPerSynapse: 2,
    criticalThreshold: 0.85,
    maxViolationHistory: 1000,
    ...overrides,
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('SparsityMonitor', () => {
  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  describe('initialization', () => {
    it('should create a monitor with default config', () => {
      const monitor = new SparsityMonitor();
      expect(monitor).toBeDefined();
    });

    it('should create a monitor via factory function', () => {
      const monitor = createSparsityMonitor();
      expect(monitor).toBeDefined();
    });

    it('should create a monitor with custom config', () => {
      const monitor = new SparsityMonitor({
        sparsityThreshold: 0.95,
        windowSize: 100,
      });
      expect(monitor).toBeDefined();
      expect(monitor.getConfig().sparsityThreshold).toBe(0.95);
      expect(monitor.getConfig().windowSize).toBe(100);
    });

    it('should merge custom config with defaults', () => {
      const monitor = new SparsityMonitor({ sparsityThreshold: 0.90 });
      const config = monitor.getConfig();
      expect(config.sparsityThreshold).toBe(0.90);
      expect(config.windowSize).toBe(50); // default
      expect(config.perLayerTracking).toBe(true); // default
      expect(config.avgSynapsesPerNeuron).toBe(100); // default
    });
  });

  // ---------------------------------------------------------------------------
  // Recording Layer Activity
  // ---------------------------------------------------------------------------

  describe('recordLayerActivity()', () => {
    let monitor: SparsityMonitor;

    beforeEach(() => {
      monitor = createTestMonitor();
    });

    it('should record activity and return computed metrics', () => {
      const metrics = monitor.recordLayerActivity('layer1', makeInput());
      expect(metrics.layerId).toBe('layer1');
      expect(metrics.neuronCount).toBe(1000);
      expect(metrics.spikeCount).toBe(50);
      expect(metrics.spikeRate).toBeCloseTo(0.05, 4);
      expect(metrics.activationSparsity).toBeCloseTo(0.95, 4);
      expect(metrics.timestep).toBe(0);
    });

    it('should compute spike rate correctly', () => {
      const metrics = monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 200,
        spikeCount: 40,
      }));
      expect(metrics.spikeRate).toBeCloseTo(0.2, 4);
    });

    it('should compute activation sparsity as 1 - spikeRate', () => {
      const metrics = monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 200,
        spikeCount: 40,
      }));
      expect(metrics.activationSparsity).toBeCloseTo(0.8, 4);
    });

    it('should handle zero spikes (100% sparsity)', () => {
      const metrics = monitor.recordLayerActivity('layer1', makeInput({
        spikeCount: 0,
      }));
      expect(metrics.spikeRate).toBe(0);
      expect(metrics.activationSparsity).toBe(1);
    });

    it('should handle all neurons spiking (0% sparsity)', () => {
      const metrics = monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 100,
      }));
      expect(metrics.spikeRate).toBe(1);
      expect(metrics.activationSparsity).toBe(0);
    });

    it('should store average membrane potential when provided', () => {
      const metrics = monitor.recordLayerActivity('layer1', makeInput({
        avgMembranePotential: -0.65,
      }));
      expect(metrics.avgMembranePotential).toBe(-0.65);
    });

    it('should throw on non-positive neuronCount', () => {
      expect(() => monitor.recordLayerActivity('layer1', makeInput({ neuronCount: 0 })))
        .toThrow('neuronCount must be positive');
      expect(() => monitor.recordLayerActivity('layer1', makeInput({ neuronCount: -5 })))
        .toThrow('neuronCount must be positive');
    });

    it('should throw on negative spikeCount', () => {
      expect(() => monitor.recordLayerActivity('layer1', makeInput({ spikeCount: -1 })))
        .toThrow('spikeCount must be non-negative');
    });

    it('should throw when spikeCount exceeds neuronCount', () => {
      expect(() => monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 150,
      }))).toThrow('spikeCount (150) cannot exceed neuronCount (100)');
    });

    it('should update current layer metrics on successive recordings', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50, timestep: 0 }));
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 30, timestep: 1 }));

      const current = monitor.getCurrentLayerMetrics();
      const layer1 = current.get('layer1');
      expect(layer1).toBeDefined();
      expect(layer1!.spikeCount).toBe(30);
      expect(layer1!.timestep).toBe(1);
    });

    it('should track multiple layers independently', () => {
      monitor.recordLayerActivity('hidden_1', makeInput({ spikeCount: 50 }));
      monitor.recordLayerActivity('hidden_2', makeInput({ spikeCount: 100 }));
      monitor.recordLayerActivity('output', makeInput({ neuronCount: 10, spikeCount: 1 }));

      const current = monitor.getCurrentLayerMetrics();
      expect(current.size).toBe(3);
      expect(current.get('hidden_1')!.spikeCount).toBe(50);
      expect(current.get('hidden_2')!.spikeCount).toBe(100);
      expect(current.get('output')!.neuronCount).toBe(10);
    });

    it('should accumulate layer history when perLayerTracking is true', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50, timestep: 0 }));
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 30, timestep: 1 }));
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 70, timestep: 2 }));

      const history = monitor.getLayerHistory('layer1');
      expect(history.length).toBe(3);
      expect(history[0].spikeCount).toBe(50);
      expect(history[1].spikeCount).toBe(30);
      expect(history[2].spikeCount).toBe(70);
    });

    it('should not accumulate history when perLayerTracking is false', () => {
      const mon = createTestMonitor({ perLayerTracking: false });
      mon.recordLayerActivity('layer1', makeInput({ spikeCount: 50, timestep: 0 }));
      mon.recordLayerActivity('layer1', makeInput({ spikeCount: 30, timestep: 1 }));

      const history = mon.getLayerHistory('layer1');
      expect(history.length).toBe(0);
    });

    it('should return empty array for unknown layer history', () => {
      expect(monitor.getLayerHistory('nonexistent')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Batch Recording
  // ---------------------------------------------------------------------------

  describe('recordBatchActivity()', () => {
    let monitor: SparsityMonitor;

    beforeEach(() => {
      monitor = createTestMonitor();
    });

    it('should record multiple layers from a Map', () => {
      const inputs = new Map<string, LayerActivityInput>([
        ['layer1', makeInput({ spikeCount: 50 })],
        ['layer2', makeInput({ spikeCount: 100 })],
      ]);
      const results = monitor.recordBatchActivity(inputs);

      expect(results.length).toBe(2);
      expect(results[0].layerId).toBe('layer1');
      expect(results[1].layerId).toBe('layer2');
    });

    it('should record multiple layers from a plain object', () => {
      const inputs: Record<string, LayerActivityInput> = {
        layer1: makeInput({ spikeCount: 50 }),
        layer2: makeInput({ spikeCount: 100 }),
      };
      const results = monitor.recordBatchActivity(inputs);

      expect(results.length).toBe(2);
      expect(monitor.getCurrentLayerMetrics().size).toBe(2);
    });

    it('should handle empty batch', () => {
      const results = monitor.recordBatchActivity(new Map());
      expect(results.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------------

  describe('takeSnapshot()', () => {
    let monitor: SparsityMonitor;

    beforeEach(() => {
      monitor = createTestMonitor();
    });

    it('should return null when no layer metrics recorded', () => {
      expect(monitor.takeSnapshot()).toBeNull();
    });

    it('should capture aggregate metrics across all layers', () => {
      // Layer 1: 1000 neurons, 50 spikes = 5% spike rate, 95% sparsity
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
        timestep: 0,
      }));
      // Layer 2: 500 neurons, 25 spikes = 5% spike rate, 95% sparsity
      monitor.recordLayerActivity('layer2', makeInput({
        neuronCount: 500,
        spikeCount: 25,
        timestep: 0,
      }));

      const snapshot = monitor.takeSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot!.totalNeurons).toBe(1500);
      expect(snapshot!.totalSpikes).toBe(75);
      expect(snapshot!.aggregateSpikeRate).toBeCloseTo(0.05, 4);
      expect(snapshot!.aggregateSparsity).toBeCloseTo(0.95, 4);
    });

    it('should weight aggregate sparsity by neuron count', () => {
      // Layer 1: 900 neurons, 90 spikes (10% spike rate)
      monitor.recordLayerActivity('big', makeInput({
        neuronCount: 900,
        spikeCount: 90,
        timestep: 0,
      }));
      // Layer 2: 100 neurons, 50 spikes (50% spike rate)
      monitor.recordLayerActivity('small', makeInput({
        neuronCount: 100,
        spikeCount: 50,
        timestep: 0,
      }));

      const snapshot = monitor.takeSnapshot()!;
      // Total: 1000 neurons, 140 spikes -> 14% spike rate
      expect(snapshot.totalNeurons).toBe(1000);
      expect(snapshot.totalSpikes).toBe(140);
      expect(snapshot.aggregateSpikeRate).toBeCloseTo(0.14, 4);
      expect(snapshot.aggregateSparsity).toBeCloseTo(0.86, 4);
    });

    it('should include per-layer details', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));
      monitor.recordLayerActivity('layer2', makeInput({ spikeCount: 100 }));

      const snapshot = monitor.takeSnapshot()!;
      expect(snapshot.layers.length).toBe(2);
      expect(snapshot.layers.find((l) => l.layerId === 'layer1')).toBeDefined();
      expect(snapshot.layers.find((l) => l.layerId === 'layer2')).toBeDefined();
    });

    it('should include energy efficiency metrics', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));
      const snapshot = monitor.takeSnapshot()!;

      expect(snapshot.energyEfficiency).toBeDefined();
      expect(snapshot.energyEfficiency.denseOps).toBeGreaterThan(0);
      expect(snapshot.energyEfficiency.sparseOps).toBeGreaterThan(0);
      expect(snapshot.energyEfficiency.opsSaved).toBeGreaterThan(0);
      expect(snapshot.energyEfficiency.efficiencyRatio).toBeGreaterThan(0);
    });

    it('should return zero energy metrics when energy metrics are disabled', () => {
      const mon = createTestMonitor({ energyMetricsEnabled: false });
      mon.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));
      const snapshot = mon.takeSnapshot()!;

      expect(snapshot.energyEfficiency.denseOps).toBe(0);
      expect(snapshot.energyEfficiency.sparseOps).toBe(0);
      expect(snapshot.energyEfficiency.opsSaved).toBe(0);
    });

    it('should detect violations in snapshot', () => {
      // Layer with < 93% sparsity (50% spike rate)
      monitor.recordLayerActivity('bad_layer', makeInput({
        neuronCount: 100,
        spikeCount: 50,
        timestep: 0,
      }));

      const snapshot = monitor.takeSnapshot()!;
      expect(snapshot.violations.length).toBe(1);
      expect(snapshot.violations[0].layerId).toBe('bad_layer');
    });

    it('should accumulate snapshots over time', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50, timestep: 0 }));
      monitor.takeSnapshot();

      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 30, timestep: 1 }));
      monitor.takeSnapshot();

      const snapshots = monitor.getSnapshots();
      expect(snapshots.length).toBe(2);
    });

    it('should return correct latest snapshot', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50, timestep: 0 }));
      monitor.takeSnapshot();

      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 30, timestep: 1 }));
      monitor.takeSnapshot();

      const latest = monitor.getLatestSnapshot();
      expect(latest).not.toBeNull();
      expect(latest!.layers[0].spikeCount).toBe(30);
    });

    it('should return null for latest snapshot when none taken', () => {
      expect(monitor.getLatestSnapshot()).toBeNull();
    });

    it('should have correct timestamp format', () => {
      monitor.recordLayerActivity('layer1', makeInput());
      const snapshot = monitor.takeSnapshot()!;
      // ISO 8601 format check
      expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ---------------------------------------------------------------------------
  // Energy Efficiency Calculation
  // ---------------------------------------------------------------------------

  describe('calculateEnergyEfficiency()', () => {
    let monitor: SparsityMonitor;

    beforeEach(() => {
      monitor = createTestMonitor({
        avgSynapsesPerNeuron: 100,
        opsPerSynapse: 2,
      });
    });

    it('should calculate dense ops correctly', () => {
      const layers: SNNLayerMetrics[] = [
        {
          layerId: 'layer1',
          neuronCount: 1000,
          spikeCount: 50,
          spikeRate: 0.05,
          activationSparsity: 0.95,
          timestep: 0,
        },
      ];
      const result = monitor.calculateEnergyEfficiency(layers);
      // 1000 neurons * 100 synapses * 2 ops = 200,000
      expect(result.denseOps).toBe(200000);
    });

    it('should calculate sparse ops correctly', () => {
      const layers: SNNLayerMetrics[] = [
        {
          layerId: 'layer1',
          neuronCount: 1000,
          spikeCount: 50,
          spikeRate: 0.05,
          activationSparsity: 0.95,
          timestep: 0,
        },
      ];
      const result = monitor.calculateEnergyEfficiency(layers);
      // 50 spikes * 100 synapses * 2 ops = 10,000
      expect(result.sparseOps).toBe(10000);
    });

    it('should calculate ops saved', () => {
      const layers: SNNLayerMetrics[] = [
        {
          layerId: 'layer1',
          neuronCount: 1000,
          spikeCount: 50,
          spikeRate: 0.05,
          activationSparsity: 0.95,
          timestep: 0,
        },
      ];
      const result = monitor.calculateEnergyEfficiency(layers);
      expect(result.opsSaved).toBe(190000);
    });

    it('should calculate efficiency ratio correctly', () => {
      const layers: SNNLayerMetrics[] = [
        {
          layerId: 'layer1',
          neuronCount: 1000,
          spikeCount: 50,
          spikeRate: 0.05,
          activationSparsity: 0.95,
          timestep: 0,
        },
      ];
      const result = monitor.calculateEnergyEfficiency(layers);
      // 190000 / 200000 = 0.95
      expect(result.efficiencyRatio).toBeCloseTo(0.95, 4);
    });

    it('should calculate energy savings factor', () => {
      const layers: SNNLayerMetrics[] = [
        {
          layerId: 'layer1',
          neuronCount: 1000,
          spikeCount: 50,
          spikeRate: 0.05,
          activationSparsity: 0.95,
          timestep: 0,
        },
      ];
      const result = monitor.calculateEnergyEfficiency(layers);
      // 200000 / 10000 = 20x
      expect(result.energySavingsFactor).toBe(20);
    });

    it('should sum across multiple layers', () => {
      const layers: SNNLayerMetrics[] = [
        {
          layerId: 'layer1',
          neuronCount: 1000,
          spikeCount: 50,
          spikeRate: 0.05,
          activationSparsity: 0.95,
          timestep: 0,
        },
        {
          layerId: 'layer2',
          neuronCount: 500,
          spikeCount: 100,
          spikeRate: 0.2,
          activationSparsity: 0.8,
          timestep: 0,
        },
      ];
      const result = monitor.calculateEnergyEfficiency(layers);
      // Dense: (1000 + 500) * 100 * 2 = 300,000
      expect(result.denseOps).toBe(300000);
      // Sparse: (50 + 100) * 100 * 2 = 30,000
      expect(result.sparseOps).toBe(30000);
      expect(result.opsSaved).toBe(270000);
    });

    it('should handle zero spikes (maximum efficiency)', () => {
      const layers: SNNLayerMetrics[] = [
        {
          layerId: 'layer1',
          neuronCount: 1000,
          spikeCount: 0,
          spikeRate: 0,
          activationSparsity: 1,
          timestep: 0,
        },
      ];
      const result = monitor.calculateEnergyEfficiency(layers);
      expect(result.sparseOps).toBe(0);
      expect(result.efficiencyRatio).toBe(1);
      // energySavingsFactor: denseOps / max(1, 0) = 200000
      expect(result.energySavingsFactor).toBe(200000);
    });

    it('should handle all neurons spiking (no efficiency)', () => {
      const layers: SNNLayerMetrics[] = [
        {
          layerId: 'layer1',
          neuronCount: 100,
          spikeCount: 100,
          spikeRate: 1,
          activationSparsity: 0,
          timestep: 0,
        },
      ];
      const result = monitor.calculateEnergyEfficiency(layers);
      expect(result.opsSaved).toBe(0);
      expect(result.efficiencyRatio).toBe(0);
      expect(result.energySavingsFactor).toBe(1);
    });

    it('should handle empty layers array', () => {
      const result = monitor.calculateEnergyEfficiency([]);
      expect(result.denseOps).toBe(0);
      expect(result.sparseOps).toBe(0);
      expect(result.opsSaved).toBe(0);
      expect(result.efficiencyRatio).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Violation Detection
  // ---------------------------------------------------------------------------

  describe('violation detection', () => {
    let monitor: SparsityMonitor;

    beforeEach(() => {
      monitor = createTestMonitor({
        sparsityThreshold: 0.93,
        criticalThreshold: 0.85,
      });
    });

    it('should not flag layers at or above threshold', () => {
      // 95% sparsity >= 93% threshold
      monitor.recordLayerActivity('good_layer', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(0);
    });

    it('should flag layers below threshold as warning', () => {
      // 90% sparsity < 93% threshold but >= 85% critical
      monitor.recordLayerActivity('warn_layer', makeInput({
        neuronCount: 100,
        spikeCount: 10,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].severity).toBe('warning');
      expect(violations[0].layerId).toBe('warn_layer');
    });

    it('should flag layers below critical threshold as critical', () => {
      // 50% sparsity < 85% critical threshold
      monitor.recordLayerActivity('bad_layer', makeInput({
        neuronCount: 100,
        spikeCount: 50,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].severity).toBe('critical');
    });

    it('should calculate deficit correctly', () => {
      // 90% sparsity, threshold 93%
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 10,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].deficit).toBeCloseTo(0.03, 4);
    });

    it('should track violation history', () => {
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 20,
        timestep: 0,
      }));
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 15,
        timestep: 1,
      }));

      const history = monitor.getViolationHistory();
      expect(history.length).toBe(2);
    });

    it('should trim violation history at max capacity', () => {
      const mon = createTestMonitor({ maxViolationHistory: 3 });

      for (let i = 0; i < 5; i++) {
        mon.recordLayerActivity('layer1', makeInput({
          neuronCount: 100,
          spikeCount: 20,
          timestep: i,
        }));
      }

      const history = mon.getViolationHistory();
      expect(history.length).toBe(3);
    });

    it('should clear active violations when layer comes back into compliance', () => {
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 20,
        timestep: 0,
      }));
      expect(monitor.getActiveViolations().length).toBe(1);

      // Layer now has 1% spike rate (99% sparsity) = in compliance
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 1,
        timestep: 1,
      }));
      expect(monitor.getActiveViolations().length).toBe(0);
    });

    it('should detect violations across multiple layers independently', () => {
      // Layer 1: in compliance (95% sparsity)
      monitor.recordLayerActivity('good', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
      }));
      // Layer 2: warning (90% sparsity)
      monitor.recordLayerActivity('warn', makeInput({
        neuronCount: 100,
        spikeCount: 10,
      }));
      // Layer 3: critical (50% sparsity)
      monitor.recordLayerActivity('bad', makeInput({
        neuronCount: 100,
        spikeCount: 50,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(2);

      const warnV = violations.find((v) => v.layerId === 'warn');
      const badV = violations.find((v) => v.layerId === 'bad');
      expect(warnV).toBeDefined();
      expect(warnV!.severity).toBe('warning');
      expect(badV).toBeDefined();
      expect(badV!.severity).toBe('critical');
    });

    it('should include required threshold in violation', () => {
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 20,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations[0].requiredThreshold).toBe(0.93);
    });

    it('should include timestep in violation', () => {
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 20,
        timestep: 42,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations[0].timestep).toBe(42);
    });

    it('should include timestamp in violation', () => {
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 20,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations[0].detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  describe('getStats()', () => {
    let monitor: SparsityMonitor;

    beforeEach(() => {
      monitor = createTestMonitor();
    });

    it('should return zeroed stats when no data recorded', () => {
      const stats = monitor.getStats();
      expect(stats.totalTimesteps).toBe(0);
      expect(stats.totalSnapshots).toBe(0);
      expect(stats.trackedLayers).toBe(0);
      expect(stats.meanSparsity).toBe(0);
      expect(stats.totalViolations).toBe(0);
      expect(stats.inCompliance).toBe(true);
    });

    it('should track total timesteps', () => {
      monitor.recordLayerActivity('layer1', makeInput({ timestep: 0 }));
      monitor.recordLayerActivity('layer1', makeInput({ timestep: 1 }));
      monitor.recordLayerActivity('layer2', makeInput({ timestep: 0 }));

      const stats = monitor.getStats();
      expect(stats.totalTimesteps).toBe(3);
    });

    it('should track total snapshots', () => {
      monitor.recordLayerActivity('layer1', makeInput());
      monitor.takeSnapshot();
      monitor.takeSnapshot();

      expect(monitor.getStats().totalSnapshots).toBe(2);
    });

    it('should track number of layers', () => {
      monitor.recordLayerActivity('layer1', makeInput());
      monitor.recordLayerActivity('layer2', makeInput());

      expect(monitor.getStats().trackedLayers).toBe(2);
    });

    it('should calculate mean sparsity', () => {
      // All layers with 95% sparsity
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
        timestep: 0,
      }));
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
        timestep: 1,
      }));

      const stats = monitor.getStats();
      expect(stats.meanSparsity).toBeCloseTo(0.95, 4);
    });

    it('should calculate min and max sparsity', () => {
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
        timestep: 0,
      }));
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 100,
        timestep: 1,
      }));

      const stats = monitor.getStats();
      expect(stats.minSparsity).toBeCloseTo(0.9, 4);
      expect(stats.maxSparsity).toBeCloseTo(0.95, 4);
    });

    it('should calculate standard deviation', () => {
      // Record varying sparsities
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 5,
        timestep: 0,
      })); // 95%
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 10,
        timestep: 1,
      })); // 90%
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 1,
        timestep: 2,
      })); // 99%

      const stats = monitor.getStats();
      expect(stats.stdDevSparsity).toBeGreaterThan(0);
    });

    it('should report zero stdDev for single measurement', () => {
      monitor.recordLayerActivity('layer1', makeInput());
      expect(monitor.getStats().stdDevSparsity).toBe(0);
    });

    it('should count violations by severity', () => {
      // Warning violation
      monitor.recordLayerActivity('warn_layer', makeInput({
        neuronCount: 100,
        spikeCount: 10,
        timestep: 0,
      })); // 90% sparsity
      // Critical violation
      monitor.recordLayerActivity('bad_layer', makeInput({
        neuronCount: 100,
        spikeCount: 50,
        timestep: 0,
      })); // 50% sparsity

      const stats = monitor.getStats();
      expect(stats.totalViolations).toBe(2);
      expect(stats.violationsBySeverity.warning).toBe(1);
      expect(stats.violationsBySeverity.critical).toBe(1);
    });

    it('should track per-layer mean sparsity', () => {
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 5,
        timestep: 0,
      })); // 95%
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 3,
        timestep: 1,
      })); // 97%
      monitor.recordLayerActivity('layer2', makeInput({
        neuronCount: 100,
        spikeCount: 10,
        timestep: 0,
      })); // 90%

      const stats = monitor.getStats();
      expect(stats.perLayerMeanSparsity['layer1']).toBeCloseTo(0.96, 2);
      expect(stats.perLayerMeanSparsity['layer2']).toBeCloseTo(0.90, 4);
    });

    it('should calculate mean energy efficiency', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50, timestep: 0 }));
      monitor.takeSnapshot();
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 30, timestep: 1 }));
      monitor.takeSnapshot();

      const stats = monitor.getStats();
      expect(stats.meanEnergyEfficiency).toBeGreaterThan(0);
    });

    it('should report inCompliance correctly', () => {
      // All layers in compliance
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
      }));
      expect(monitor.getStats().inCompliance).toBe(true);

      // Add a violating layer
      monitor.recordLayerActivity('bad', makeInput({
        neuronCount: 100,
        spikeCount: 20,
      }));
      expect(monitor.getStats().inCompliance).toBe(false);
    });

    it('should fall back to current metrics when no history (perLayerTracking disabled)', () => {
      const mon = createTestMonitor({ perLayerTracking: false });
      mon.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));

      const stats = mon.getStats();
      expect(stats.meanSparsity).toBeCloseTo(0.95, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // Quality History Integration
  // ---------------------------------------------------------------------------

  describe('toQualityHistoryEntry()', () => {
    let monitor: SparsityMonitor;

    beforeEach(() => {
      monitor = createTestMonitor();
    });

    it('should generate entry with correct structure', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);

      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.cycle).toBe(1);
      expect(typeof entry.composite).toBe('number');
      expect(['A', 'B', 'C', 'D', 'F']).toContain(entry.grade);
      expect(entry.focus).toBe('snn-sparsity');
      expect(typeof entry.summary).toBe('string');
      expect(entry.sparsityMetrics).toBeDefined();
    });

    it('should calculate composite as sparsity/threshold ratio', () => {
      // 95% sparsity / 93% threshold = ~1.02 -> capped at 1.0
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
      }));
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.composite).toBe(1);
    });

    it('should scale composite below 1 when sparsity is below threshold', () => {
      // 80% sparsity / 93% threshold = ~0.86
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 20,
      }));
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.composite).toBeLessThan(1);
      expect(entry.composite).toBeGreaterThan(0.5);
    });

    it('should assign correct grade A (>= 95% composite)', () => {
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 10,
      })); // 99% sparsity
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.grade).toBe('A');
    });

    it('should assign correct grade B (>= 85% composite)', () => {
      // Need sparsity such that sparsity/0.93 is between 0.85 and 0.95
      // 0.85 * 0.93 = 0.7905, 0.95 * 0.93 = 0.8835
      // Use sparsity = 0.84 -> 0.84/0.93 = 0.9032 -> grade B
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 16,
      })); // 84% sparsity
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.grade).toBe('B');
    });

    it('should assign correct grade F (< 50% composite)', () => {
      // Need sparsity such that sparsity/0.93 < 0.5
      // 0.5 * 0.93 = 0.465
      // Use sparsity = 0.40 -> 0.40/0.93 = 0.43 -> grade F
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 100,
        spikeCount: 60,
      })); // 40% sparsity
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.grade).toBe('F');
    });

    it('should include sparsity metrics', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));
      monitor.recordLayerActivity('layer2', makeInput({ spikeCount: 30 }));
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      const metrics = entry.sparsityMetrics;

      expect(metrics.aggregateSparsity).toBeGreaterThan(0);
      expect(metrics.aggregateSpikeRate).toBeGreaterThan(0);
      expect(typeof metrics.energyEfficiencyRatio).toBe('number');
      expect(metrics.violationCount).toBe(0);
      expect(metrics.layerCount).toBe(2);
      expect(metrics.totalNeurons).toBe(2000);
      expect(metrics.inCompliance).toBe(true);
    });

    it('should include violation count in sparsity metrics', () => {
      monitor.recordLayerActivity('bad', makeInput({
        neuronCount: 100,
        spikeCount: 20,
      }));
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.sparsityMetrics.violationCount).toBeGreaterThan(0);
      expect(entry.sparsityMetrics.inCompliance).toBe(false);
    });

    it('should generate meaningful summary string', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.summary).toContain('SNN Sparsity Monitor');
      expect(entry.summary).toContain('Grade');
      expect(entry.summary).toContain('Sparsity');
    });

    it('should work without any snapshots taken', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.cycle).toBe(1);
      expect(entry.focus).toBe('snn-sparsity');
    });

    it('should increment cycle correctly', () => {
      monitor.recordLayerActivity('layer1', makeInput());
      monitor.takeSnapshot();

      expect(monitor.toQualityHistoryEntry(5).cycle).toBe(5);
      expect(monitor.toQualityHistoryEntry(10).cycle).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Harvester Integration
  // ---------------------------------------------------------------------------

  describe('getHarvesterMetrics()', () => {
    let monitor: SparsityMonitor;

    beforeEach(() => {
      monitor = createTestMonitor();
    });

    it('should return all expected metric keys', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));

      const metrics = monitor.getHarvesterMetrics();
      expect(metrics).toHaveProperty('snn_mean_sparsity');
      expect(metrics).toHaveProperty('snn_min_sparsity');
      expect(metrics).toHaveProperty('snn_max_sparsity');
      expect(metrics).toHaveProperty('snn_violation_count');
      expect(metrics).toHaveProperty('snn_energy_efficiency');
      expect(metrics).toHaveProperty('snn_in_compliance');
      expect(metrics).toHaveProperty('snn_tracked_layers');
      expect(metrics).toHaveProperty('snn_total_timesteps');
    });

    it('should return numeric values for sparsity metrics', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));

      const metrics = monitor.getHarvesterMetrics();
      expect(typeof metrics.snn_mean_sparsity).toBe('number');
      expect(typeof metrics.snn_min_sparsity).toBe('number');
      expect(typeof metrics.snn_max_sparsity).toBe('number');
    });

    it('should return boolean for compliance', () => {
      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));

      const metrics = monitor.getHarvesterMetrics();
      expect(typeof metrics.snn_in_compliance).toBe('boolean');
    });

    it('should reflect current state accurately', () => {
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
      }));

      const metrics = monitor.getHarvesterMetrics();
      expect(metrics.snn_mean_sparsity).toBeCloseTo(0.95, 4);
      expect(metrics.snn_tracked_layers).toBe(1);
      expect(metrics.snn_total_timesteps).toBe(1);
      expect(metrics.snn_in_compliance).toBe(true);
    });

    it('should show violation count when violations exist', () => {
      monitor.recordLayerActivity('bad', makeInput({
        neuronCount: 100,
        spikeCount: 20,
      }));

      const metrics = monitor.getHarvesterMetrics();
      expect(metrics.snn_violation_count).toBeGreaterThan(0);
      expect(metrics.snn_in_compliance).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  describe('reset()', () => {
    it('should clear all recorded data', () => {
      const monitor = createTestMonitor();

      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50, timestep: 0 }));
      monitor.recordLayerActivity('layer2', makeInput({ spikeCount: 20, timestep: 0 }));
      monitor.takeSnapshot();

      monitor.reset();

      expect(monitor.getCurrentLayerMetrics().size).toBe(0);
      expect(monitor.getSnapshots().length).toBe(0);
      expect(monitor.getViolationHistory().length).toBe(0);
      expect(monitor.getLayerHistory('layer1').length).toBe(0);
      expect(monitor.getLatestSnapshot()).toBeNull();
    });

    it('should produce zeroed stats after reset', () => {
      const monitor = createTestMonitor();

      monitor.recordLayerActivity('layer1', makeInput());
      monitor.takeSnapshot();

      monitor.reset();

      const stats = monitor.getStats();
      expect(stats.totalTimesteps).toBe(0);
      expect(stats.totalSnapshots).toBe(0);
      expect(stats.trackedLayers).toBe(0);
      expect(stats.meanSparsity).toBe(0);
    });

    it('should allow recording new data after reset', () => {
      const monitor = createTestMonitor();

      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));
      monitor.reset();

      monitor.recordLayerActivity('new_layer', makeInput({ spikeCount: 10 }));
      expect(monitor.getCurrentLayerMetrics().size).toBe(1);
      expect(monitor.getCurrentLayerMetrics().has('new_layer')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // W.041 Threshold Compliance (93% Sparsity)
  // ---------------------------------------------------------------------------

  describe('W.041 compliance (93% sparsity threshold)', () => {
    it('should use 93% as default threshold', () => {
      const monitor = new SparsityMonitor();
      expect(monitor.getConfig().sparsityThreshold).toBe(0.93);
    });

    it('should pass layers with exactly 93% sparsity', () => {
      const monitor = createTestMonitor();
      // 93% sparsity = 7% spike rate = 70 spikes out of 1000
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 70,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(0);
    });

    it('should fail layers with 92.9% sparsity', () => {
      const monitor = createTestMonitor();
      // 92.9% sparsity = 7.1% spike rate = 71 spikes out of 1000
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 71,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(1);
    });

    it('should report compliance status accurately in stats', () => {
      const monitor = createTestMonitor();

      // Start compliant
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 50,
      }));
      expect(monitor.getStats().inCompliance).toBe(true);

      // Become non-compliant
      monitor.recordLayerActivity('layer2', makeInput({
        neuronCount: 100,
        spikeCount: 20,
      }));
      expect(monitor.getStats().inCompliance).toBe(false);
    });

    it('should allow custom threshold override', () => {
      const monitor = createTestMonitor({ sparsityThreshold: 0.95 });

      // 94% sparsity would be fine at 93% but fails at 95%
      monitor.recordLayerActivity('layer1', makeInput({
        neuronCount: 1000,
        spikeCount: 60,
      }));

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle single neuron layer', () => {
      const monitor = createTestMonitor();
      const metrics = monitor.recordLayerActivity('tiny', makeInput({
        neuronCount: 1,
        spikeCount: 0,
      }));
      expect(metrics.activationSparsity).toBe(1);
    });

    it('should handle very large neuron counts', () => {
      const monitor = createTestMonitor();
      const metrics = monitor.recordLayerActivity('huge', makeInput({
        neuronCount: 1_000_000,
        spikeCount: 50_000,
      }));
      expect(metrics.spikeRate).toBeCloseTo(0.05, 4);
      expect(metrics.activationSparsity).toBeCloseTo(0.95, 4);
    });

    it('should handle rapid successive recordings', () => {
      const monitor = createTestMonitor();
      for (let t = 0; t < 1000; t++) {
        monitor.recordLayerActivity('layer1', makeInput({
          spikeCount: Math.floor(Math.random() * 100),
          timestep: t,
        }));
      }
      const stats = monitor.getStats();
      expect(stats.totalTimesteps).toBe(1000);
    });

    it('should handle many layers simultaneously', () => {
      const monitor = createTestMonitor();
      for (let i = 0; i < 100; i++) {
        monitor.recordLayerActivity(`layer_${i}`, makeInput({
          spikeCount: i,
        }));
      }
      expect(monitor.getCurrentLayerMetrics().size).toBe(100);
    });

    it('should handle snapshot with all layers compliant', () => {
      const monitor = createTestMonitor();
      monitor.recordLayerActivity('a', makeInput({ spikeCount: 10 }));
      monitor.recordLayerActivity('b', makeInput({ spikeCount: 20 }));

      const snapshot = monitor.takeSnapshot()!;
      expect(snapshot.violations.length).toBe(0);
    });

    it('should handle snapshot with all layers violating', () => {
      const monitor = createTestMonitor();
      monitor.recordLayerActivity('a', makeInput({
        neuronCount: 100,
        spikeCount: 50,
      }));
      monitor.recordLayerActivity('b', makeInput({
        neuronCount: 100,
        spikeCount: 40,
      }));

      const snapshot = monitor.takeSnapshot()!;
      expect(snapshot.violations.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: Full Pipeline
  // ---------------------------------------------------------------------------

  describe('full pipeline integration', () => {
    it('should run a complete monitoring cycle: record -> snapshot -> stats -> history', () => {
      const monitor = createTestMonitor();

      // Simulate 10 timesteps across 3 layers
      for (let t = 0; t < 10; t++) {
        monitor.recordLayerActivity('lif_input', makeInput({
          neuronCount: 784,
          spikeCount: Math.floor(784 * 0.03), // ~3% spike rate (97% sparsity)
          timestep: t,
        }));
        monitor.recordLayerActivity('lif_hidden', makeInput({
          neuronCount: 256,
          spikeCount: Math.floor(256 * 0.05), // ~5% spike rate (95% sparsity)
          timestep: t,
        }));
        monitor.recordLayerActivity('lif_output', makeInput({
          neuronCount: 10,
          spikeCount: Math.floor(10 * 0.02), // ~2% spike rate (98% sparsity)
          timestep: t,
        }));

        monitor.takeSnapshot();
      }

      // Verify stats
      const stats = monitor.getStats();
      expect(stats.totalTimesteps).toBe(30); // 3 layers * 10 timesteps
      expect(stats.totalSnapshots).toBe(10);
      expect(stats.trackedLayers).toBe(3);
      expect(stats.meanSparsity).toBeGreaterThan(0.9);
      expect(stats.inCompliance).toBe(true);
      expect(stats.totalViolations).toBe(0);
      expect(stats.meanEnergyEfficiency).toBeGreaterThan(0.9);

      // Verify quality history entry
      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.composite).toBe(1); // Above threshold
      expect(entry.grade).toBe('A');
      expect(entry.focus).toBe('snn-sparsity');
      expect(entry.sparsityMetrics.layerCount).toBe(3);
      expect(entry.sparsityMetrics.inCompliance).toBe(true);

      // Verify harvester metrics
      const harvesterMetrics = monitor.getHarvesterMetrics();
      expect(harvesterMetrics.snn_mean_sparsity).toBeGreaterThan(0.9);
      expect(harvesterMetrics.snn_in_compliance).toBe(true);
    });

    it('should detect violations in a mixed compliance scenario', () => {
      const monitor = createTestMonitor();

      // Good layer (96% sparsity)
      monitor.recordLayerActivity('healthy', makeInput({
        neuronCount: 1000,
        spikeCount: 40,
      }));

      // Warning layer (90% sparsity) - below 93% threshold but above 85% critical
      monitor.recordLayerActivity('struggling', makeInput({
        neuronCount: 100,
        spikeCount: 10,
      }));

      // Critical layer (50% sparsity) - below 85% critical threshold
      monitor.recordLayerActivity('failing', makeInput({
        neuronCount: 100,
        spikeCount: 50,
      }));

      const snapshot = monitor.takeSnapshot()!;
      const stats = monitor.getStats();
      const entry = monitor.toQualityHistoryEntry(1);

      // Should have 2 violations
      expect(snapshot.violations.length).toBe(2);
      expect(stats.violationsBySeverity.warning).toBe(1);
      expect(stats.violationsBySeverity.critical).toBe(1);
      expect(stats.inCompliance).toBe(false);
      expect(entry.sparsityMetrics.inCompliance).toBe(false);
      expect(entry.sparsityMetrics.violationCount).toBe(2);
    });

    it('should produce quality-history.json compatible output', () => {
      const monitor = createTestMonitor();

      monitor.recordLayerActivity('layer1', makeInput({ spikeCount: 50 }));
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);

      // Verify the entry could be serialized to JSON and parsed back
      const json = JSON.stringify(entry);
      const parsed = JSON.parse(json) as SparsityQualityHistoryEntry;

      expect(parsed.timestamp).toBeDefined();
      expect(parsed.cycle).toBe(1);
      expect(parsed.composite).toBeDefined();
      expect(parsed.grade).toBeDefined();
      expect(parsed.focus).toBe('snn-sparsity');
      expect(parsed.summary).toBeDefined();
      expect(parsed.sparsityMetrics).toBeDefined();
      expect(parsed.sparsityMetrics.aggregateSparsity).toBeDefined();
      expect(parsed.sparsityMetrics.aggregateSpikeRate).toBeDefined();
      expect(parsed.sparsityMetrics.energyEfficiencyRatio).toBeDefined();
      expect(parsed.sparsityMetrics.violationCount).toBeDefined();
      expect(parsed.sparsityMetrics.layerCount).toBeDefined();
      expect(parsed.sparsityMetrics.totalNeurons).toBeDefined();
      expect(parsed.sparsityMetrics.inCompliance).toBeDefined();
    });
  });
});
