/**
 * Integration Test: SparsityMonitor with Simulated SNN Layer Data
 *
 * Tests the cross-package data flow:
 *   snn-webgpu types (LayerConfig, SimulationStats, LIFParams)
 *     -> simulated SNN activity
 *     -> SparsityMonitor.recordLayerActivity()
 *     -> SparsityMonitor.takeSnapshot()
 *     -> SparsityMonitor.toQualityHistoryEntry()
 *     -> quality-history.json compatible output
 *
 * Validates that SparsityMonitor correctly:
 * 1. Accepts SNN layer data shaped like snn-webgpu SimulationStats
 * 2. Computes activation sparsity and energy efficiency metrics
 * 3. Detects sparsity regime violations (W.041: >= 93% threshold)
 * 4. Produces valid quality-history entries for the self-improvement pipeline
 *
 * Packages exercised:
 *   core/training (SparsityMonitor, SparsityMonitorTypes)
 *   snn-webgpu (types: LayerConfig, LIFParams, SimulationStats format)
 */

import { describe, it, expect } from 'vitest';
import { SparsityMonitor, createSparsityMonitor } from '../../training/SparsityMonitor';
import type { LayerActivityInput } from '../../training/SparsityMonitor';
import type {
  SparsityQualityHistoryEntry,
  SparsitySnapshot,
  SparsityMonitorStats,
} from '../../training/SparsityMonitorTypes';

// =============================================================================
// SIMULATED SNN-WEBGPU TYPES (matching @holoscript/snn-webgpu shapes)
// =============================================================================

/**
 * Mirror of @holoscript/snn-webgpu LayerConfig for test setup.
 * We define locally to avoid cross-package import in the core test suite.
 */
interface SimLayerConfig {
  name: string;
  neuronCount: number;
  lifParams?: {
    tau: number;
    vThreshold: number;
    vReset: number;
    vRest: number;
    dt: number;
  };
}

/**
 * Mirror of @holoscript/snn-webgpu SimulationStats for test data generation.
 */
interface SimStats {
  totalSpikes: number;
  layerSpikes: Map<string, number>;
  layerAvgVoltage: Map<string, number>;
  stepTimeMs: number;
  simTimeMs: number;
}

/**
 * Create a simulated SNN network configuration matching snn-webgpu types.
 */
function createMNISTNetworkConfig(): SimLayerConfig[] {
  return [
    {
      name: 'input_encoder',
      neuronCount: 784,
      lifParams: { tau: 20.0, vThreshold: -55.0, vReset: -75.0, vRest: -65.0, dt: 1.0 },
    },
    {
      name: 'hidden_1',
      neuronCount: 256,
      lifParams: { tau: 15.0, vThreshold: -55.0, vReset: -75.0, vRest: -65.0, dt: 1.0 },
    },
    {
      name: 'hidden_2',
      neuronCount: 128,
      lifParams: { tau: 15.0, vThreshold: -55.0, vReset: -75.0, vRest: -65.0, dt: 1.0 },
    },
    {
      name: 'output',
      neuronCount: 10,
      lifParams: { tau: 20.0, vThreshold: -55.0, vReset: -75.0, vRest: -65.0, dt: 1.0 },
    },
  ];
}

/**
 * Simulate SNN layer activity for a single timestep.
 * Models the statistical behavior of LIF neurons: most neurons are silent
 * (sparse), with a configurable spike rate.
 */
function simulateLayerActivity(
  layer: SimLayerConfig,
  timestep: number,
  spikeRateFraction: number = 0.05
): LayerActivityInput {
  const spikeCount = Math.round(layer.neuronCount * spikeRateFraction);
  // Simulate average membrane potential near resting potential
  const vRest = layer.lifParams?.vRest ?? -65.0;
  const avgMembranePotential = vRest + Math.random() * 5;

  return {
    neuronCount: layer.neuronCount,
    spikeCount,
    timestep,
    avgMembranePotential,
  };
}

/**
 * Simulate a full SimulationStats object matching snn-webgpu output.
 */
function simulateStats(
  layers: SimLayerConfig[],
  timestep: number,
  spikeRates: Record<string, number>
): SimStats {
  const layerSpikes = new Map<string, number>();
  const layerAvgVoltage = new Map<string, number>();
  let totalSpikes = 0;

  for (const layer of layers) {
    const rate = spikeRates[layer.name] ?? 0.05;
    const spikes = Math.round(layer.neuronCount * rate);
    layerSpikes.set(layer.name, spikes);
    totalSpikes += spikes;

    const vRest = layer.lifParams?.vRest ?? -65.0;
    layerAvgVoltage.set(layer.name, vRest + Math.random() * 5);
  }

  return {
    totalSpikes,
    layerSpikes,
    layerAvgVoltage,
    stepTimeMs: 0.5,
    simTimeMs: timestep,
  };
}

/**
 * Feed SimulationStats into the SparsityMonitor, bridging snn-webgpu
 * output format to SparsityMonitor input format.
 */
function feedStatsToMonitor(
  monitor: SparsityMonitor,
  stats: SimStats,
  layers: SimLayerConfig[],
  timestep: number
): void {
  for (const layer of layers) {
    const spikeCount = stats.layerSpikes.get(layer.name) ?? 0;
    const avgVoltage = stats.layerAvgVoltage.get(layer.name);

    monitor.recordLayerActivity(layer.name, {
      neuronCount: layer.neuronCount,
      spikeCount,
      timestep,
      avgMembranePotential: avgVoltage,
    });
  }
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Integration: SparsityMonitor with Simulated SNN Data (snn-webgpu types)', () => {
  // ---------------------------------------------------------------------------
  // End-to-End: SNN Activity -> Snapshots -> Quality History Entry
  // ---------------------------------------------------------------------------

  describe('full pipeline: simulated SNN -> SparsityMonitor -> quality-history entry', () => {
    it('processes MNIST-like SNN data and produces a valid quality-history entry', () => {
      const layers = createMNISTNetworkConfig();
      const monitor = new SparsityMonitor({ sparsityThreshold: 0.93 });

      // Simulate 10 timesteps of SNN activity with ~5% spike rate (95% sparsity)
      for (let t = 0; t < 10; t++) {
        for (const layer of layers) {
          monitor.recordLayerActivity(layer.name, simulateLayerActivity(layer, t, 0.05));
        }
      }

      // Take snapshot
      const snapshot = monitor.takeSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot!.aggregateSparsity).toBeGreaterThan(0.9);

      // Generate quality-history entry
      const entry = monitor.toQualityHistoryEntry(1);

      // Validate quality-history.json structure
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.cycle).toBe(1);
      expect(entry.composite).toBeGreaterThan(0);
      expect(entry.composite).toBeLessThanOrEqual(1);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(entry.grade);
      expect(entry.focus).toBe('snn-sparsity');
      expect(typeof entry.summary).toBe('string');
      expect(entry.summary.length).toBeGreaterThan(0);

      // Validate sparsity metrics sub-object
      expect(entry.sparsityMetrics.aggregateSparsity).toBeGreaterThan(0);
      expect(entry.sparsityMetrics.aggregateSpikeRate).toBeGreaterThan(0);
      expect(entry.sparsityMetrics.layerCount).toBe(4);
      expect(entry.sparsityMetrics.totalNeurons).toBe(784 + 256 + 128 + 10);
      expect(typeof entry.sparsityMetrics.inCompliance).toBe('boolean');
    });

    it('uses SimulationStats format to bridge snn-webgpu -> SparsityMonitor', () => {
      const layers = createMNISTNetworkConfig();
      const monitor = new SparsityMonitor();

      // Use the SimulationStats bridge function
      const spikeRates: Record<string, number> = {
        input_encoder: 0.03,
        hidden_1: 0.05,
        hidden_2: 0.04,
        output: 0.1,
      };

      for (let t = 0; t < 5; t++) {
        const stats = simulateStats(layers, t, spikeRates);
        feedStatsToMonitor(monitor, stats, layers, t);
      }

      const snapshot = monitor.takeSnapshot();
      expect(snapshot).not.toBeNull();

      // Verify layer-level metrics match expected neuron counts
      const inputLayer = snapshot!.layers.find((l) => l.layerId === 'input_encoder');
      expect(inputLayer).toBeDefined();
      expect(inputLayer!.neuronCount).toBe(784);

      const outputLayer = snapshot!.layers.find((l) => l.layerId === 'output');
      expect(outputLayer).toBeDefined();
      expect(outputLayer!.neuronCount).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Sparsity Threshold Compliance (W.041)
  // ---------------------------------------------------------------------------

  describe('W.041 sparsity threshold compliance', () => {
    it('detects no violations when all layers maintain >= 93% sparsity', () => {
      const layers = createMNISTNetworkConfig();
      const monitor = new SparsityMonitor({ sparsityThreshold: 0.93 });

      // Use a spike rate that ensures all layers stay above 93% sparsity,
      // including the small output layer (10 neurons). With 3% spike rate:
      // - 784 neurons: ~24 spikes (97% sparsity)
      // - 256 neurons: ~8 spikes (97% sparsity)
      // - 128 neurons: ~4 spikes (97% sparsity)
      // - 10 neurons: 0 spikes (100% sparsity, since Math.round(10*0.03) = 0)
      for (let t = 0; t < 10; t++) {
        for (const layer of layers) {
          monitor.recordLayerActivity(layer.name, simulateLayerActivity(layer, t, 0.03));
        }
      }

      const violations = monitor.getActiveViolations();
      expect(violations).toHaveLength(0);

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.sparsityMetrics.inCompliance).toBe(true);
      expect(entry.sparsityMetrics.violationCount).toBe(0);
    });

    it('detects warning violation when sparsity drops below 93% but above 85%', () => {
      const monitor = new SparsityMonitor({
        sparsityThreshold: 0.93,
        criticalThreshold: 0.85,
      });

      // 10% spike rate = 90% sparsity (below 93% warning threshold)
      monitor.recordLayerActivity('noisy_layer', {
        neuronCount: 1000,
        spikeCount: 100, // 10% spike rate
        timestep: 0,
      });

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].severity).toBe('warning');
      expect(violations[0].layerId).toBe('noisy_layer');
      expect(violations[0].measuredSparsity).toBe(0.9);
      expect(violations[0].deficit).toBeGreaterThan(0);
    });

    it('detects critical violation when sparsity drops below 85%', () => {
      const monitor = new SparsityMonitor({
        sparsityThreshold: 0.93,
        criticalThreshold: 0.85,
      });

      // 20% spike rate = 80% sparsity (below 85% critical threshold)
      monitor.recordLayerActivity('overactive_layer', {
        neuronCount: 500,
        spikeCount: 100, // 20% spike rate
        timestep: 0,
      });

      const violations = monitor.getActiveViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].severity).toBe('critical');
      expect(violations[0].measuredSparsity).toBe(0.8);
    });

    it('reflects violation in quality-history entry grade', () => {
      const monitor = new SparsityMonitor({ sparsityThreshold: 0.93 });

      // Very noisy layer: 30% spike rate = 70% sparsity
      monitor.recordLayerActivity('very_noisy', {
        neuronCount: 100,
        spikeCount: 30,
        timestep: 0,
      });

      monitor.takeSnapshot();
      const entry = monitor.toQualityHistoryEntry(1);

      // With 70% sparsity vs 93% threshold, composite = 70/93 ~ 0.753
      expect(entry.sparsityMetrics.inCompliance).toBe(false);
      expect(entry.sparsityMetrics.violationCount).toBeGreaterThan(0);
      // Grade should be C or lower
      expect(['C', 'D', 'F']).toContain(entry.grade);
    });
  });

  // ---------------------------------------------------------------------------
  // Energy Efficiency Metrics
  // ---------------------------------------------------------------------------

  describe('energy efficiency calculation from SNN layer data', () => {
    it('computes correct ops saved for sparse SNN activity', () => {
      const monitor = new SparsityMonitor({
        avgSynapsesPerNeuron: 100,
        opsPerSynapse: 2,
      });

      // Layer with 1000 neurons, 50 spikes (5% spike rate)
      monitor.recordLayerActivity('efficient_layer', {
        neuronCount: 1000,
        spikeCount: 50,
        timestep: 0,
      });

      const snapshot = monitor.takeSnapshot();
      expect(snapshot).not.toBeNull();

      const eff = snapshot!.energyEfficiency;
      // Dense ops: 1000 * 100 * 2 = 200,000
      expect(eff.denseOps).toBe(200000);
      // Sparse ops: 50 * 100 * 2 = 10,000
      expect(eff.sparseOps).toBe(10000);
      // Ops saved: 190,000
      expect(eff.opsSaved).toBe(190000);
      // Efficiency ratio: 190,000 / 200,000 = 0.95
      expect(eff.efficiencyRatio).toBe(0.95);
      // Energy savings factor: 200,000 / 10,000 = 20x
      expect(eff.energySavingsFactor).toBe(20);
    });

    it('computes multi-layer aggregate energy efficiency', () => {
      const layers = createMNISTNetworkConfig();
      const monitor = new SparsityMonitor({
        avgSynapsesPerNeuron: 100,
        opsPerSynapse: 2,
      });

      // Record deterministic activity for all layers
      const spikeRates: Record<string, number> = {
        input_encoder: 0.03, // 3% spike rate
        hidden_1: 0.05, // 5% spike rate
        hidden_2: 0.04, // 4% spike rate
        output: 0.1, // 10% spike rate
      };

      for (const layer of layers) {
        const rate = spikeRates[layer.name];
        monitor.recordLayerActivity(layer.name, {
          neuronCount: layer.neuronCount,
          spikeCount: Math.round(layer.neuronCount * rate),
          timestep: 0,
        });
      }

      const snapshot = monitor.takeSnapshot();
      expect(snapshot).not.toBeNull();

      // Efficiency should be high since all layers are sparse
      expect(snapshot!.energyEfficiency.efficiencyRatio).toBeGreaterThan(0.9);
      expect(snapshot!.energyEfficiency.energySavingsFactor).toBeGreaterThan(10);

      // Verify in quality history
      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.sparsityMetrics.energyEfficiencyRatio).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Batch Recording from SimulationStats
  // ---------------------------------------------------------------------------

  describe('batch recording matching snn-webgpu SimulationStats flow', () => {
    it('recordBatchActivity processes all layers simultaneously', () => {
      const layers = createMNISTNetworkConfig();
      const monitor = new SparsityMonitor();

      // Create a batch input matching SimulationStats pattern
      const batchInput: Record<string, LayerActivityInput> = {};
      for (const layer of layers) {
        batchInput[layer.name] = {
          neuronCount: layer.neuronCount,
          spikeCount: Math.round(layer.neuronCount * 0.05),
          timestep: 0,
        };
      }

      const metrics = monitor.recordBatchActivity(batchInput);
      expect(metrics).toHaveLength(4);

      // Each metric should have correct layer info
      const layerNames = new Set(metrics.map((m) => m.layerId));
      expect(layerNames.has('input_encoder')).toBe(true);
      expect(layerNames.has('hidden_1')).toBe(true);
      expect(layerNames.has('hidden_2')).toBe(true);
      expect(layerNames.has('output')).toBe(true);

      // All should be sparse
      for (const m of metrics) {
        expect(m.activationSparsity).toBeGreaterThan(0.85);
      }
    });

    it('batch recording produces same results as individual recording', () => {
      const layers = createMNISTNetworkConfig();

      // Monitor 1: individual recording
      const monitor1 = new SparsityMonitor();
      for (const layer of layers) {
        monitor1.recordLayerActivity(layer.name, {
          neuronCount: layer.neuronCount,
          spikeCount: Math.round(layer.neuronCount * 0.05),
          timestep: 0,
        });
      }
      const snapshot1 = monitor1.takeSnapshot();

      // Monitor 2: batch recording
      const monitor2 = new SparsityMonitor();
      const batchInput: Record<string, LayerActivityInput> = {};
      for (const layer of layers) {
        batchInput[layer.name] = {
          neuronCount: layer.neuronCount,
          spikeCount: Math.round(layer.neuronCount * 0.05),
          timestep: 0,
        };
      }
      monitor2.recordBatchActivity(batchInput);
      const snapshot2 = monitor2.takeSnapshot();

      // Should produce identical aggregate metrics
      expect(snapshot1!.aggregateSparsity).toBe(snapshot2!.aggregateSparsity);
      expect(snapshot1!.aggregateSpikeRate).toBe(snapshot2!.aggregateSpikeRate);
      expect(snapshot1!.totalNeurons).toBe(snapshot2!.totalNeurons);
      expect(snapshot1!.totalSpikes).toBe(snapshot2!.totalSpikes);
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-Timestep Simulation
  // ---------------------------------------------------------------------------

  describe('multi-timestep simulation tracking', () => {
    it('tracks layer history across multiple timesteps', () => {
      const monitor = new SparsityMonitor({ perLayerTracking: true });

      // Simulate 20 timesteps with varying spike rates
      for (let t = 0; t < 20; t++) {
        const spikeRate = 0.03 + t * 0.002; // Gradually increasing spike rate
        monitor.recordLayerActivity('test_layer', {
          neuronCount: 500,
          spikeCount: Math.round(500 * spikeRate),
          timestep: t,
        });
      }

      const history = monitor.getLayerHistory('test_layer');
      expect(history).toHaveLength(20);

      // Sparsity should decrease over time (spike rate increases)
      expect(history[0].activationSparsity).toBeGreaterThan(history[19].activationSparsity);
    });

    it('produces accurate rolling statistics', () => {
      const layers = createMNISTNetworkConfig();
      const monitor = new SparsityMonitor({ windowSize: 10 });

      // Simulate 50 timesteps
      for (let t = 0; t < 50; t++) {
        for (const layer of layers) {
          monitor.recordLayerActivity(layer.name, simulateLayerActivity(layer, t, 0.05));
        }
        if (t % 5 === 0) {
          monitor.takeSnapshot();
        }
      }

      const stats = monitor.getStats();
      expect(stats.totalTimesteps).toBe(50 * layers.length);
      expect(stats.totalSnapshots).toBe(10); // t=0,5,10,15,20,25,30,35,40,45
      expect(stats.trackedLayers).toBe(4);
      expect(stats.meanSparsity).toBeGreaterThan(0.9);
      expect(stats.minSparsity).toBeGreaterThan(0.85);
      expect(stats.maxSparsity).toBeLessThanOrEqual(1.0);
      expect(stats.stdDevSparsity).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Quality History Grade Mapping
  // ---------------------------------------------------------------------------

  describe('quality-history grade mapping', () => {
    it('assigns grade A for >= 95% composite score', () => {
      const monitor = new SparsityMonitor({ sparsityThreshold: 0.93 });

      // Very sparse: 2% spike rate = 98% sparsity -> composite ~1.05 -> capped at 1.0
      monitor.recordLayerActivity('sparse_layer', {
        neuronCount: 1000,
        spikeCount: 20,
        timestep: 0,
      });
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.grade).toBe('A');
      expect(entry.composite).toBeGreaterThanOrEqual(0.95);
    });

    it('assigns grade B for 85-95% composite score', () => {
      const monitor = new SparsityMonitor({ sparsityThreshold: 0.93 });

      // 12% spike rate = 88% sparsity -> composite = 88/93 ~ 0.946
      monitor.recordLayerActivity('moderate_layer', {
        neuronCount: 1000,
        spikeCount: 120,
        timestep: 0,
      });
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.grade).toBe('B');
    });

    it('assigns grade F for very low sparsity', () => {
      const monitor = new SparsityMonitor({ sparsityThreshold: 0.93 });

      // 60% spike rate = 40% sparsity -> composite = 40/93 ~ 0.43
      monitor.recordLayerActivity('dense_layer', {
        neuronCount: 100,
        spikeCount: 60,
        timestep: 0,
      });
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(1);
      expect(entry.grade).toBe('F');
      expect(entry.composite).toBeLessThan(0.5);
    });
  });

  // ---------------------------------------------------------------------------
  // Harvester Integration Metrics
  // ---------------------------------------------------------------------------

  describe('SelfImproveHarvester integration metrics', () => {
    it('produces harvester metrics matching expected keys', () => {
      const monitor = new SparsityMonitor();

      monitor.recordLayerActivity('layer_1', {
        neuronCount: 256,
        spikeCount: 10,
        timestep: 0,
      });
      monitor.takeSnapshot();

      const metrics = monitor.getHarvesterMetrics();

      // Validate all expected keys exist
      expect(typeof metrics.snn_mean_sparsity).toBe('number');
      expect(typeof metrics.snn_min_sparsity).toBe('number');
      expect(typeof metrics.snn_max_sparsity).toBe('number');
      expect(typeof metrics.snn_violation_count).toBe('number');
      expect(typeof metrics.snn_energy_efficiency).toBe('number');
      expect(typeof metrics.snn_in_compliance).toBe('boolean');
      expect(typeof metrics.snn_tracked_layers).toBe('number');
      expect(typeof metrics.snn_total_timesteps).toBe('number');

      // Verify values are reasonable
      expect(metrics.snn_mean_sparsity).toBeGreaterThan(0.9);
      expect(metrics.snn_tracked_layers).toBe(1);
      expect(metrics.snn_total_timesteps).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Input Validation
  // ---------------------------------------------------------------------------

  describe('input validation from SNN data', () => {
    it('rejects negative spike counts', () => {
      const monitor = new SparsityMonitor();
      expect(() =>
        monitor.recordLayerActivity('bad', {
          neuronCount: 100,
          spikeCount: -1,
          timestep: 0,
        })
      ).toThrow('non-negative');
    });

    it('rejects zero neuron count', () => {
      const monitor = new SparsityMonitor();
      expect(() =>
        monitor.recordLayerActivity('bad', {
          neuronCount: 0,
          spikeCount: 0,
          timestep: 0,
        })
      ).toThrow('positive');
    });

    it('rejects spike count exceeding neuron count', () => {
      const monitor = new SparsityMonitor();
      expect(() =>
        monitor.recordLayerActivity('bad', {
          neuronCount: 100,
          spikeCount: 101,
          timestep: 0,
        })
      ).toThrow('cannot exceed');
    });
  });

  // ---------------------------------------------------------------------------
  // Reset and Factory
  // ---------------------------------------------------------------------------

  describe('monitor reset and factory function', () => {
    it('reset clears all state', () => {
      const monitor = new SparsityMonitor();

      monitor.recordLayerActivity('layer', {
        neuronCount: 100,
        spikeCount: 5,
        timestep: 0,
      });
      monitor.takeSnapshot();

      const statsBefore = monitor.getStats();
      expect(statsBefore.totalTimesteps).toBe(1);

      monitor.reset();

      const statsAfter = monitor.getStats();
      expect(statsAfter.totalTimesteps).toBe(0);
      expect(statsAfter.totalSnapshots).toBe(0);
      expect(statsAfter.trackedLayers).toBe(0);
      expect(monitor.getSnapshots()).toHaveLength(0);
    });

    it('createSparsityMonitor factory produces working instance', () => {
      const monitor = createSparsityMonitor({ sparsityThreshold: 0.9 });

      monitor.recordLayerActivity('test', {
        neuronCount: 200,
        spikeCount: 10,
        timestep: 0,
      });

      const snapshot = monitor.takeSnapshot();
      expect(snapshot).not.toBeNull();
      expect(monitor.getConfig().sparsityThreshold).toBe(0.9);
    });
  });

  // ---------------------------------------------------------------------------
  // Quality History Summary Content
  // ---------------------------------------------------------------------------

  describe('quality-history summary content validation', () => {
    it('summary includes key metrics in human-readable format', () => {
      const layers = createMNISTNetworkConfig();
      const monitor = new SparsityMonitor({ sparsityThreshold: 0.93 });

      for (const layer of layers) {
        monitor.recordLayerActivity(layer.name, simulateLayerActivity(layer, 0, 0.04));
      }
      monitor.takeSnapshot();

      const entry = monitor.toQualityHistoryEntry(5);
      const summary = entry.summary;

      expect(summary).toContain('SNN Sparsity Monitor');
      expect(summary).toContain('Grade:');
      expect(summary).toContain('Layers:');
      expect(summary).toContain('Mean Sparsity:');
      expect(summary).toContain('threshold:');
      expect(summary).toContain('Energy Efficiency:');
    });
  });
});
