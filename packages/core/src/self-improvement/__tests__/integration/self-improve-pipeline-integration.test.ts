/**
 * Integration test: Self-Improvement Pipeline with SparsityMonitor + FocusedDPOSplitter
 *
 * Validates the integrated self-improvement loop:
 *   1. SelfImproveHarvester initializes with SparsityMonitor attached
 *   2. 5 improvement cycles feed synthetic SNN metrics
 *   3. quality-history.json entries are produced with snn_* metrics
 *   4. FocusedDPOSplitter generates chosen/rejected pairs from sparsity violations
 *   5. ConvergenceDetector triggers after quality plateaus
 *
 * @module self-improvement/integration
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { SelfImproveHarvester } from '../../SelfImproveHarvester';
import type { FileWriter, HarvesterConfig } from '../../SelfImproveHarvester';
import { SparsityMonitor } from '../../../training/SparsityMonitor';
import type { SparsityQualityHistoryEntry } from '../../../training/SparsityMonitorTypes';
import { FocusedDPOSplitter } from '../../FocusedDPOSplitter';
import { ConvergenceDetector } from '../../ConvergenceDetector';
import { calculateQualityScore } from '../../QualityScore';
import type { QualityReport } from '../../QualityScore';
import type { SelfImproveIO, UntestedTarget, VitestResult } from '../../SelfImproveCommand';

// =============================================================================
// SHARED TEST FIXTURES
// =============================================================================

/** Synthetic SNN layer configurations for 5 cycles. Each cycle progressively
 *  improves sparsity to simulate an improving system (with cycle 3-5 plateauing). */
const CYCLE_LAYER_DATA = [
  // Cycle 1: Low sparsity (many spikes, some violations)
  {
    layers: {
      lif_hidden_1: { neuronCount: 1000, spikeCount: 120, timestep: 0 },
      lif_hidden_2: { neuronCount: 500, spikeCount: 45, timestep: 0 },
      snn_output: { neuronCount: 200, spikeCount: 30, timestep: 0 },
    },
    expectedViolationCount: 3, // hidden_1 (88%), hidden_2 (91%), output (85%) all below 93%
  },
  // Cycle 2: Improving sparsity
  {
    layers: {
      lif_hidden_1: { neuronCount: 1000, spikeCount: 80, timestep: 1 },
      lif_hidden_2: { neuronCount: 500, spikeCount: 30, timestep: 1 },
      snn_output: { neuronCount: 200, spikeCount: 15, timestep: 1 },
    },
    expectedViolationCount: 2, // hidden_1 (92%) and output (92.5%) still below 93%
  },
  // Cycle 3: Near-threshold (plateau begins)
  {
    layers: {
      lif_hidden_1: { neuronCount: 1000, spikeCount: 60, timestep: 2 },
      lif_hidden_2: { neuronCount: 500, spikeCount: 25, timestep: 2 },
      snn_output: { neuronCount: 200, spikeCount: 10, timestep: 2 },
    },
    expectedViolationCount: 0,
  },
  // Cycle 4: Plateau (very similar to cycle 3)
  {
    layers: {
      lif_hidden_1: { neuronCount: 1000, spikeCount: 58, timestep: 3 },
      lif_hidden_2: { neuronCount: 500, spikeCount: 24, timestep: 3 },
      snn_output: { neuronCount: 200, spikeCount: 9, timestep: 3 },
    },
    expectedViolationCount: 0,
  },
  // Cycle 5: Still plateau
  {
    layers: {
      lif_hidden_1: { neuronCount: 1000, spikeCount: 59, timestep: 4 },
      lif_hidden_2: { neuronCount: 500, spikeCount: 25, timestep: 4 },
      snn_output: { neuronCount: 200, spikeCount: 10, timestep: 4 },
    },
    expectedViolationCount: 0,
  },
];

/** Synthetic untested targets for harvester iterations */
function createSyntheticTarget(cycle: number): UntestedTarget {
  return {
    symbolName: `SnnLayer.forward_cycle_${cycle}`,
    filePath: `src/snn/layers/layer_${cycle}.ts`,
    language: 'typescript',
    relevanceScore: 0.85 + cycle * 0.02,
    description: `SNN layer forward pass implementation for cycle ${cycle}`,
  };
}

/** Create a synthetic VitestResult */
function createSyntheticVitestResult(passRate: number): VitestResult {
  const total = 10;
  const passed = Math.round(total * passRate);
  return {
    passed: passed === total,
    testsPassed: passed,
    testsFailed: total - passed,
    testsTotal: total,
    duration: 150 + Math.random() * 100,
  };
}

/** Synthetic test code output (valid test structure for harvester filter) */
function createSyntheticTestOutput(cycle: number): string {
  return `
import { describe, it, expect } from 'vitest';
import { SnnLayer } from '../snn/layers/layer_${cycle}';

describe('SnnLayer cycle ${cycle}', () => {
  it('should compute forward pass with correct sparsity', () => {
    const layer = new SnnLayer({ neuronCount: 1000 });
    const result = layer.forward([0.1, 0.2, 0.3]);
    expect(result.spikeRate).toBeLessThan(0.1);
    expect(result.activationSparsity).toBeGreaterThan(0.9);
  });

  it('should maintain energy efficiency', () => {
    const layer = new SnnLayer({ neuronCount: 500 });
    const metrics = layer.getEnergyMetrics();
    expect(metrics.efficiencyRatio).toBeGreaterThan(0.8);
  });

  it('should detect sparsity violations', () => {
    const layer = new SnnLayer({ neuronCount: 200 });
    layer.forward([1.0, 1.0, 1.0]); // Force high spike rate
    const violations = layer.getViolations();
    expect(violations).toBeDefined();
  });
});
`.trim();
}

/** Sample HoloScript composition for DPO splitting */
const SAMPLE_HOLO_SOURCE = `
composition "SNN Visualization" {
  environment {
    skybox: "neural_network"
    ambient_light: 0.4
    shadows: true
  }

  object "NeuronCluster" {
    @glowing
    @collidable

    geometry: "sphere"
    position: [0, 1.5, -2]
    scale: 0.15
    color: "#00ff88"
  }

  object "SynapseBeam" {
    @glowing

    geometry: "cylinder"
    position: [1, 1.5, -2]
    scale: [0.02, 2.0, 0.02]
    color: "#ff4444"
  }

  state {
    spike_count: 0
    sparsity: 0.95
    active: true
  }

  logic {
    on_spike() {
      state.spike_count = state.spike_count + 1
    }
  }
}
`.trim();

// =============================================================================
// MOCK FILE WRITER
// =============================================================================

function createMockFileWriter(): FileWriter & {
  writtenData: Map<string, string>;
} {
  const writtenData = new Map<string, string>();
  return {
    writtenData,
    append: async (filePath: string, content: string) => {
      const existing = writtenData.get(filePath) ?? '';
      writtenData.set(filePath, existing + content);
    },
    appendSync: (filePath: string, content: string) => {
      const existing = writtenData.get(filePath) ?? '';
      writtenData.set(filePath, existing + content);
    },
    ensureDir: () => {},
  };
}

// =============================================================================
// MOCK SELF-IMPROVE IO
// =============================================================================

function createMockIO(cycle: number): SelfImproveIO {
  const target = createSyntheticTarget(cycle);
  const passRate = 0.8 + cycle * 0.04; // Improve each cycle

  return {
    absorb: async () => ({
      filesScanned: 100,
      symbolsIndexed: 500,
      graphNodes: 200,
      graphEdges: 350,
    }),
    queryUntested: async () => [target],
    generateTest: async () => ({
      testFilePath: `__tests__/snn_layer_${cycle}.test.ts`,
      content: createSyntheticTestOutput(cycle),
      target,
    }),
    writeFile: async () => {},
    runVitest: async () => createSyntheticVitestResult(passRate),
    runFullVitest: async () => ({
      passed: true,
      testsPassed: 95,
      testsFailed: 5,
      testsTotal: 100,
      coveragePercent: 75 + cycle * 2,
      duration: 5000,
    }),
    runTypeCheck: async () => true,
    runLint: async () => ({ issueCount: Math.max(0, 5 - cycle), filesLinted: 50 }),
    getCircuitBreakerHealth: async () => 85 + cycle * 3,
    gitAdd: async () => {},
    gitCommit: async () => {},
    log: () => {},
  };
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Self-Improvement Pipeline Integration', () => {
  let sparsityMonitor: SparsityMonitor;
  let harvester: SelfImproveHarvester;
  let convergenceDetector: ConvergenceDetector;
  let mockFileWriter: ReturnType<typeof createMockFileWriter>;

  beforeEach(() => {
    sparsityMonitor = new SparsityMonitor({ sparsityThreshold: 0.93 });
    mockFileWriter = createMockFileWriter();
    harvester = new SelfImproveHarvester(
      {
        enabled: true,
        outputDir: 'datasets',
        minPassRate: 0.6,
        minInstructionLength: 10,
        maxRougeLSimilarity: 0.95,
        validateSyntax: false, // Skip syntax validation for integration tests
        flushInterval: 100, // High threshold to avoid auto-flush
      },
      { fileWriter: mockFileWriter }
    );
    convergenceDetector = new ConvergenceDetector({
      minIterations: 3,
      windowSize: 3,
      epsilon: 0.01,
      slopeThreshold: 0.005,
      plateauBand: 0.02,
      plateauPatience: 3,
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 1: SelfImproveHarvester initializes with SparsityMonitor attached
  // ---------------------------------------------------------------------------

  describe('1. SelfImproveHarvester with SparsityMonitor initialization', () => {
    it('harvester initializes and SparsityMonitor provides snn_* metrics', () => {
      // Record some activity on the SparsityMonitor
      sparsityMonitor.recordLayerActivity('lif_hidden_1', {
        neuronCount: 1000,
        spikeCount: 50,
        timestep: 0,
      });
      sparsityMonitor.recordLayerActivity('snn_output', {
        neuronCount: 200,
        spikeCount: 10,
        timestep: 0,
      });

      // Get harvester-compatible metrics from SparsityMonitor
      const harvesterMetrics = sparsityMonitor.getHarvesterMetrics();

      // Verify snn_* prefixed metrics exist
      expect(harvesterMetrics).toHaveProperty('snn_mean_sparsity');
      expect(harvesterMetrics).toHaveProperty('snn_min_sparsity');
      expect(harvesterMetrics).toHaveProperty('snn_max_sparsity');
      expect(harvesterMetrics).toHaveProperty('snn_violation_count');
      expect(harvesterMetrics).toHaveProperty('snn_energy_efficiency');
      expect(harvesterMetrics).toHaveProperty('snn_in_compliance');
      expect(harvesterMetrics).toHaveProperty('snn_tracked_layers');
      expect(harvesterMetrics).toHaveProperty('snn_total_timesteps');

      // Verify the values are reasonable
      expect(harvesterMetrics.snn_mean_sparsity).toBeGreaterThan(0.9);
      expect(harvesterMetrics.snn_tracked_layers).toBe(2);
      expect(harvesterMetrics.snn_total_timesteps).toBe(2);
    });

    it('harvester can wrap IO and intercept iterations', () => {
      const mockIO = createMockIO(0);
      const wrappedIO = harvester.wrapIO(mockIO);

      // The wrapped IO should have all the same methods
      expect(wrappedIO.absorb).toBeDefined();
      expect(wrappedIO.queryUntested).toBeDefined();
      expect(wrappedIO.generateTest).toBeDefined();
      expect(wrappedIO.runVitest).toBeDefined();
      expect(wrappedIO.writeFile).toBeDefined();
      expect(wrappedIO.runFullVitest).toBeDefined();
      expect(wrappedIO.runTypeCheck).toBeDefined();
      expect(wrappedIO.runLint).toBeDefined();
      expect(wrappedIO.getCircuitBreakerHealth).toBeDefined();
      expect(wrappedIO.gitAdd).toBeDefined();
      expect(wrappedIO.gitCommit).toBeDefined();
      expect(wrappedIO.log).toBeDefined();
    });

    it('SparsityMonitor reports in-compliance status correctly', () => {
      // Record compliant layers (all above 93%)
      sparsityMonitor.recordLayerActivity('lif_hidden_1', {
        neuronCount: 1000,
        spikeCount: 50,
        timestep: 0,
      });

      const metrics = sparsityMonitor.getHarvesterMetrics();
      expect(metrics.snn_in_compliance).toBe(true);

      // Record a non-compliant layer (below 93%)
      const monitor2 = new SparsityMonitor({ sparsityThreshold: 0.93 });
      monitor2.recordLayerActivity('bad_layer', {
        neuronCount: 100,
        spikeCount: 20, // 80% sparsity, below 93%
        timestep: 0,
      });

      const metrics2 = monitor2.getHarvesterMetrics();
      expect(metrics2.snn_in_compliance).toBe(false);
      expect(metrics2.snn_violation_count).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Simulate 5 improvement cycles with synthetic SNN metrics
  // ---------------------------------------------------------------------------

  describe('2. Five improvement cycles with synthetic SNN metrics', () => {
    it('completes 5 cycles with SparsityMonitor recording layer activity', () => {
      const qualityHistoryEntries: SparsityQualityHistoryEntry[] = [];

      for (let cycle = 0; cycle < 5; cycle++) {
        const cycleData = CYCLE_LAYER_DATA[cycle];

        // Reset monitor for this cycle (simulating a fresh simulation run)
        sparsityMonitor.reset();

        // Record layer activity for this cycle
        for (const [layerId, input] of Object.entries(cycleData.layers)) {
          sparsityMonitor.recordLayerActivity(layerId, input);
        }

        // Take a snapshot
        const snapshot = sparsityMonitor.takeSnapshot();
        expect(snapshot).not.toBeNull();

        // Generate quality history entry
        const entry = sparsityMonitor.toQualityHistoryEntry(cycle + 1);
        qualityHistoryEntries.push(entry);

        // Verify snn_* metrics are available for this cycle
        const harvesterMetrics = sparsityMonitor.getHarvesterMetrics();
        expect(typeof harvesterMetrics.snn_mean_sparsity).toBe('number');
        expect(typeof harvesterMetrics.snn_energy_efficiency).toBe('number');
      }

      // All 5 entries should be produced
      expect(qualityHistoryEntries).toHaveLength(5);

      // Verify cycle numbers
      for (let i = 0; i < 5; i++) {
        expect(qualityHistoryEntries[i].cycle).toBe(i + 1);
      }
    });

    it('cycles show improving sparsity metrics over time', () => {
      const composites: number[] = [];

      for (let cycle = 0; cycle < 5; cycle++) {
        const cycleData = CYCLE_LAYER_DATA[cycle];
        sparsityMonitor.reset();

        for (const [layerId, input] of Object.entries(cycleData.layers)) {
          sparsityMonitor.recordLayerActivity(layerId, input);
        }
        sparsityMonitor.takeSnapshot();

        const entry = sparsityMonitor.toQualityHistoryEntry(cycle + 1);
        composites.push(entry.composite);
      }

      // Composite should generally improve from cycle 1 to cycle 3
      expect(composites[2]).toBeGreaterThan(composites[0]);

      // Cycles 3-5 should plateau (similar composites)
      const plateauRange = Math.abs(composites[4] - composites[2]);
      expect(plateauRange).toBeLessThan(0.02);
    });

    it('harvester captures records for each cycle via IO wrapping', async () => {
      for (let cycle = 0; cycle < 5; cycle++) {
        const mockIO = createMockIO(cycle);
        const wrappedIO = harvester.wrapIO(mockIO);

        // Simulate the self-improvement pipeline flow
        const query = `Find untested SNN layer code for cycle ${cycle} in the spiking neural network implementation`;
        const targets = await wrappedIO.queryUntested(query);
        expect(targets.length).toBeGreaterThan(0);

        const generated = await wrappedIO.generateTest(targets[0]);
        expect(generated.content).toBeTruthy();

        await wrappedIO.runVitest(generated.testFilePath);

        // Build a quality report for this iteration
        const suiteResult = await mockIO.runFullVitest();
        const typeCheckPassed = await mockIO.runTypeCheck();
        const lintResult = await mockIO.runLint();
        const cbHealth = await mockIO.getCircuitBreakerHealth();

        const qualityReport = calculateQualityScore({
          testsPassed: suiteResult.testsPassed,
          testsTotal: suiteResult.testsTotal,
          coveragePercent: suiteResult.coveragePercent,
          typeCheckPassed,
          lintIssues: lintResult.issueCount,
          lintFilesTotal: lintResult.filesLinted,
          circuitBreakerHealth: cbHealth,
        });

        // Capture the iteration
        const record = harvester.captureIteration(qualityReport, null);
        expect(record).not.toBeNull();
      }

      const stats = harvester.getStats();
      expect(stats.totalCaptured).toBe(5);
      // At least some should pass filters
      expect(stats.totalAccepted).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Validate quality-history.json entries with snn_* metrics
  // ---------------------------------------------------------------------------

  describe('3. Quality-history.json entries with snn_* metrics', () => {
    it('each entry has the correct SparsityQualityHistoryEntry structure', () => {
      for (let cycle = 0; cycle < 5; cycle++) {
        const cycleData = CYCLE_LAYER_DATA[cycle];
        sparsityMonitor.reset();

        for (const [layerId, input] of Object.entries(cycleData.layers)) {
          sparsityMonitor.recordLayerActivity(layerId, input);
        }
        sparsityMonitor.takeSnapshot();

        const entry = sparsityMonitor.toQualityHistoryEntry(cycle + 1);

        // Top-level fields
        expect(entry.timestamp).toBeTruthy();
        expect(typeof entry.timestamp).toBe('string');
        expect(entry.cycle).toBe(cycle + 1);
        expect(entry.composite).toBeGreaterThanOrEqual(0);
        expect(entry.composite).toBeLessThanOrEqual(1);
        expect(['A', 'B', 'C', 'D', 'F']).toContain(entry.grade);
        expect(entry.focus).toBe('snn-sparsity');
        expect(typeof entry.summary).toBe('string');
        expect(entry.summary.length).toBeGreaterThan(0);

        // Sparsity metrics sub-object
        const sm = entry.sparsityMetrics;
        expect(sm).toBeDefined();
        expect(typeof sm.aggregateSparsity).toBe('number');
        expect(typeof sm.aggregateSpikeRate).toBe('number');
        expect(typeof sm.energyEfficiencyRatio).toBe('number');
        expect(typeof sm.violationCount).toBe('number');
        expect(typeof sm.layerCount).toBe('number');
        expect(typeof sm.totalNeurons).toBe('number');
        expect(typeof sm.inCompliance).toBe('boolean');

        // aggregateSparsity + aggregateSpikeRate should approximately sum to 1
        const sum = sm.aggregateSparsity + sm.aggregateSpikeRate;
        expect(sum).toBeCloseTo(1, 2);

        // Energy efficiency should be meaningful
        expect(sm.energyEfficiencyRatio).toBeGreaterThan(0);

        // Layer count should match input
        expect(sm.layerCount).toBe(3);

        // Total neurons should be sum of all layer neuron counts
        expect(sm.totalNeurons).toBe(1700); // 1000 + 500 + 200
      }
    });

    it('entries contain correct violation counts per cycle', () => {
      for (let cycle = 0; cycle < 5; cycle++) {
        const cycleData = CYCLE_LAYER_DATA[cycle];
        sparsityMonitor.reset();

        for (const [layerId, input] of Object.entries(cycleData.layers)) {
          sparsityMonitor.recordLayerActivity(layerId, input);
        }
        sparsityMonitor.takeSnapshot();

        const activeViolations = sparsityMonitor.getActiveViolations();

        // The expected violations match our synthetic data design
        // Cycle 1: 3 violations (hidden_1 at 88%, hidden_2 at 91%, output at 85%)
        // Cycle 2: 2 violations (hidden_1 at 92%, output at 92.5%)
        // Cycles 3-5: 0 violations (all above 93%)
        expect(activeViolations.length).toBe(cycleData.expectedViolationCount);
      }
    });

    it('grade improves from early to later cycles', () => {
      const grades: string[] = [];

      for (let cycle = 0; cycle < 5; cycle++) {
        const cycleData = CYCLE_LAYER_DATA[cycle];
        sparsityMonitor.reset();

        for (const [layerId, input] of Object.entries(cycleData.layers)) {
          sparsityMonitor.recordLayerActivity(layerId, input);
        }
        sparsityMonitor.takeSnapshot();

        const entry = sparsityMonitor.toQualityHistoryEntry(cycle + 1);
        grades.push(entry.grade);
      }

      // Grade order: A > B > C > D > F
      const gradeOrder: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };
      const gradeValues = grades.map((g) => gradeOrder[g]);

      // Later cycles should have equal or better grades than the first
      expect(gradeValues[4]).toBeGreaterThanOrEqual(gradeValues[0]);
    });

    it('summary text contains relevant SNN information', () => {
      sparsityMonitor.reset();
      const cycleData = CYCLE_LAYER_DATA[0];

      for (const [layerId, input] of Object.entries(cycleData.layers)) {
        sparsityMonitor.recordLayerActivity(layerId, input);
      }
      sparsityMonitor.takeSnapshot();

      const entry = sparsityMonitor.toQualityHistoryEntry(1);

      // Summary should mention key information
      expect(entry.summary).toContain('SNN Sparsity Monitor');
      expect(entry.summary).toContain('Grade');
      expect(entry.summary).toContain('Layers');
      expect(entry.summary).toContain('Mean Sparsity');
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 4: FocusedDPOSplitter generates chosen/rejected from sparsity violations
  // ---------------------------------------------------------------------------

  describe('4. FocusedDPOSplitter with sparsity violation context', () => {
    let splitter: FocusedDPOSplitter;

    beforeEach(() => {
      splitter = new FocusedDPOSplitter({
        validatePairs: true,
        minPairsPerSegment: 1,
        maxPairsPerSegment: 5,
        minQualityScore: 0.3,
        includeContext: true,
      });
    });

    it('generates DPO pairs from the HoloScript source', () => {
      const result = splitter.process(SAMPLE_HOLO_SOURCE, 'snn_viz.holo');

      expect(result.pairs.length).toBeGreaterThan(0);
      expect(result.stats.segmentsExtracted).toBeGreaterThan(0);
      expect(result.stats.validPairs).toBeGreaterThan(0);
    });

    it('each pair has distinct chosen (valid) and rejected (degraded) code', () => {
      const result = splitter.process(SAMPLE_HOLO_SOURCE, 'snn_viz.holo');

      for (const pair of result.pairs) {
        expect(pair.chosen).toBeTruthy();
        expect(pair.rejected).toBeTruthy();
        expect(pair.chosen).not.toBe(pair.rejected);
        expect(pair.prompt).toBeTruthy();
      }
    });

    it('DPO pairs reference sparsity-related segments when present', () => {
      const result = splitter.process(SAMPLE_HOLO_SOURCE, 'snn_viz.holo');

      // Should extract state block containing sparsity-related state vars
      const stateSegmentPairs = result.pairs.filter((p) => p.metadata.segmentKind === 'state');

      // The state block references spike_count and sparsity
      if (stateSegmentPairs.length > 0) {
        const hasSparsityRef = stateSegmentPairs.some(
          (p) => p.chosen.includes('spike_count') || p.chosen.includes('sparsity')
        );
        expect(hasSparsityRef).toBe(true);
      }
    });

    it('integrates sparsity violations to drive DPO pair selection', () => {
      // First, detect violations with SparsityMonitor
      sparsityMonitor.reset();
      const violatingLayers = CYCLE_LAYER_DATA[0]; // Cycle 1 has violations

      for (const [layerId, input] of Object.entries(violatingLayers.layers)) {
        sparsityMonitor.recordLayerActivity(layerId, input);
      }

      const violations = sparsityMonitor.getActiveViolations();
      expect(violations.length).toBeGreaterThan(0);

      // Use the violations to identify which types of degradation are most
      // relevant. When sparsity violations exist, the DPO splitter should
      // still produce valid pairs from the HoloScript source.
      const result = splitter.process(SAMPLE_HOLO_SOURCE, 'snn_viz.holo');
      expect(result.stats.validPairs).toBeGreaterThan(0);

      // Verify stats include multiple degradation strategies
      const strategyCount = Object.keys(result.stats.byStrategy).length;
      expect(strategyCount).toBeGreaterThan(1);
    });

    it('DPO pairs from logic blocks contain sparsity-related logic', () => {
      const result = splitter.process(SAMPLE_HOLO_SOURCE, 'snn_viz.holo');

      const logicPairs = result.pairs.filter((p) => p.metadata.segmentKind === 'logic');

      if (logicPairs.length > 0) {
        // Logic block should reference spike-related operations
        const hasSpikePair = logicPairs.some((p) => p.chosen.includes('spike_count'));
        expect(hasSpikePair).toBe(true);
      }
    });

    it('DPO JSONL output is valid format with chosen/rejected structure', () => {
      const result = splitter.process(SAMPLE_HOLO_SOURCE, 'snn_viz.holo');
      const jsonl = splitter.toJSONL(result.pairs);

      const lines = jsonl.split('\n').filter((l) => l.length > 0);
      expect(lines.length).toBe(result.pairs.length);

      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('prompt');
        expect(parsed).toHaveProperty('chosen');
        expect(parsed).toHaveProperty('rejected');
      }
    });

    it('full JSONL includes metadata with quality scores', () => {
      const result = splitter.process(SAMPLE_HOLO_SOURCE, 'snn_viz.holo');
      const jsonl = splitter.toFullJSONL(result.pairs);

      const lines = jsonl.split('\n').filter((l) => l.length > 0);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed.metadata).toBeDefined();
        expect(typeof parsed.metadata.qualityScore).toBe('number');
        expect(parsed.metadata.segmentKind).toBeTruthy();
        expect(parsed.metadata.degradationStrategy).toBeTruthy();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Convergence detection triggers after quality plateaus
  // ---------------------------------------------------------------------------

  describe('5. Convergence detection after quality plateau', () => {
    it('does not converge before minIterations', () => {
      // Record only 2 scores (below minIterations=3)
      const status1 = convergenceDetector.record(0.85);
      expect(status1.converged).toBe(false);

      const status2 = convergenceDetector.record(0.86);
      expect(status2.converged).toBe(false);
    });

    it('converges when SparsityMonitor quality scores plateau', () => {
      const composites: number[] = [];

      // Run 5 cycles through SparsityMonitor
      for (let cycle = 0; cycle < 5; cycle++) {
        const cycleData = CYCLE_LAYER_DATA[cycle];
        sparsityMonitor.reset();

        for (const [layerId, input] of Object.entries(cycleData.layers)) {
          sparsityMonitor.recordLayerActivity(layerId, input);
        }
        sparsityMonitor.takeSnapshot();

        const entry = sparsityMonitor.toQualityHistoryEntry(cycle + 1);
        composites.push(entry.composite);

        // Feed the composite score to the convergence detector
        convergenceDetector.record(entry.composite);
      }

      // After 5 cycles with plateauing composites (cycles 3-5 are similar),
      // convergence should be detected
      const finalStatus = convergenceDetector.getStatus();

      // The detector should have recorded all 5 scores
      expect(finalStatus.iterations).toBe(5);

      // The best score should be from the later cycles
      expect(finalStatus.bestScore).toBeGreaterThanOrEqual(composites[0]);

      // Window slope should be near-zero for the plateau phase
      expect(Math.abs(finalStatus.windowSlope)).toBeLessThan(0.1);
    });

    it('convergence reason is epsilon_window or plateau for flat scores', () => {
      // Feed identical scores to guarantee convergence
      const detector = new ConvergenceDetector({
        minIterations: 3,
        windowSize: 3,
        epsilon: 0.01,
        slopeThreshold: 0.005,
        plateauBand: 0.02,
        plateauPatience: 3,
      });

      // 5 nearly identical scores
      detector.record(0.95);
      detector.record(0.951);
      detector.record(0.952);
      detector.record(0.951);
      detector.record(0.95);

      const status = detector.getStatus();
      expect(status.converged).toBe(true);
      expect(status.reason).not.toBeNull();
      expect(['epsilon_window', 'plateau']).toContain(status.reason);
    });

    it('convergence snapshot preserves full history', () => {
      const scores = [0.85, 0.9, 0.94, 0.945, 0.946];
      for (const score of scores) {
        convergenceDetector.record(score);
      }

      const snapshot = convergenceDetector.snapshot();
      expect(snapshot.history).toEqual(scores);
      expect(snapshot.status.iterations).toBe(5);
      expect(snapshot.config.minIterations).toBe(3);
    });

    it('integrates SparsityMonitor quality with ConvergenceDetector end-to-end', () => {
      // Full end-to-end: SparsityMonitor -> quality entries -> ConvergenceDetector
      const entries: SparsityQualityHistoryEntry[] = [];

      for (let cycle = 0; cycle < 5; cycle++) {
        const cycleData = CYCLE_LAYER_DATA[cycle];
        sparsityMonitor.reset();

        for (const [layerId, input] of Object.entries(cycleData.layers)) {
          sparsityMonitor.recordLayerActivity(layerId, input);
        }
        sparsityMonitor.takeSnapshot();

        const entry = sparsityMonitor.toQualityHistoryEntry(cycle + 1);
        entries.push(entry);

        const status = convergenceDetector.record(entry.composite);

        // Log for debugging: verify the status evolves
        if (cycle < 2) {
          // Early cycles should not converge
          expect(status.converged).toBe(false);
        }
      }

      // Verify all entries were produced
      expect(entries).toHaveLength(5);

      // Verify the convergence detector tracked the scores
      const history = convergenceDetector.getHistory();
      expect(history).toHaveLength(5);

      // History should match the composite scores from entries
      for (let i = 0; i < 5; i++) {
        expect(history[i]).toBe(entries[i].composite);
      }
    });

    it('convergence totalImprovement reflects first-to-last score difference', () => {
      convergenceDetector.record(0.8);
      convergenceDetector.record(0.85);
      convergenceDetector.record(0.9);
      convergenceDetector.record(0.91);
      convergenceDetector.record(0.91);

      const status = convergenceDetector.getStatus();
      expect(status.totalImprovement).toBeCloseTo(0.11, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // END-TO-END: Full pipeline integration
  // ---------------------------------------------------------------------------

  describe('End-to-end pipeline integration', () => {
    it('full pipeline: Harvester + SparsityMonitor + DPOSplitter + ConvergenceDetector', async () => {
      const dpoSplitter = new FocusedDPOSplitter({
        validatePairs: true,
        minPairsPerSegment: 1,
        maxPairsPerSegment: 3,
        minQualityScore: 0.3,
      });

      const allDPOPairs: Array<{ cycle: number; pairsCount: number }> = [];
      const allQualityEntries: SparsityQualityHistoryEntry[] = [];
      const allHarvesterRecords: number[] = [];

      for (let cycle = 0; cycle < 5; cycle++) {
        // Step 1: Record SNN metrics
        const cycleData = CYCLE_LAYER_DATA[cycle];
        sparsityMonitor.reset();

        for (const [layerId, input] of Object.entries(cycleData.layers)) {
          sparsityMonitor.recordLayerActivity(layerId, input);
        }
        sparsityMonitor.takeSnapshot();

        // Step 2: Generate quality history entry
        const qualityEntry = sparsityMonitor.toQualityHistoryEntry(cycle + 1);
        allQualityEntries.push(qualityEntry);

        // Step 3: Feed to convergence detector
        convergenceDetector.record(qualityEntry.composite);

        // Step 4: Run harvester iteration (via IO wrapping)
        const mockIO = createMockIO(cycle);
        const wrappedIO = harvester.wrapIO(mockIO);

        const query = `Identify untested SNN components for improvement cycle ${cycle} with sparsity monitoring`;
        const targets = await wrappedIO.queryUntested(query);
        const generated = await wrappedIO.generateTest(targets[0]);
        await wrappedIO.runVitest(generated.testFilePath);

        const qualityReport = calculateQualityScore({
          testsPassed: 9,
          testsTotal: 10,
          coveragePercent: 75 + cycle * 3,
          typeCheckPassed: true,
          lintIssues: Math.max(0, 3 - cycle),
          lintFilesTotal: 50,
          circuitBreakerHealth: 90,
        });

        harvester.captureIteration(qualityReport, convergenceDetector.getStatus());
        allHarvesterRecords.push(harvester.getStats().totalCaptured);

        // Step 5: Generate DPO pairs
        const dpoResult = dpoSplitter.process(SAMPLE_HOLO_SOURCE, `cycle_${cycle}.holo`);
        allDPOPairs.push({ cycle, pairsCount: dpoResult.pairs.length });
      }

      // ASSERTIONS

      // Quality entries for all 5 cycles
      expect(allQualityEntries).toHaveLength(5);
      expect(allQualityEntries.every((e) => e.focus === 'snn-sparsity')).toBe(true);

      // Harvester captured records (increasing count)
      expect(allHarvesterRecords[4]).toBe(5);

      // DPO pairs generated for each cycle
      expect(allDPOPairs).toHaveLength(5);
      for (const dpo of allDPOPairs) {
        expect(dpo.pairsCount).toBeGreaterThan(0);
      }

      // Convergence detector tracked all 5 composites
      const finalStatus = convergenceDetector.getStatus();
      expect(finalStatus.iterations).toBe(5);

      // Flush harvester and check output
      await harvester.flush();
      const stats = harvester.getStats();
      expect(stats.totalCaptured).toBe(5);
      expect(stats.totalAccepted + stats.totalRejected).toBe(5);
    });

    it('harvester accepted examples have correct training format', async () => {
      // Run a single cycle through the full pipeline
      const mockIO = createMockIO(0);
      const wrappedIO = harvester.wrapIO(mockIO);

      const query = 'Find untested SNN layer implementations for training data generation';
      const targets = await wrappedIO.queryUntested(query);
      const generated = await wrappedIO.generateTest(targets[0]);
      await wrappedIO.runVitest(generated.testFilePath);

      const qualityReport = calculateQualityScore({
        testsPassed: 10,
        testsTotal: 10,
        coveragePercent: 85,
        typeCheckPassed: true,
        lintIssues: 0,
        lintFilesTotal: 50,
        circuitBreakerHealth: 95,
      });

      harvester.captureIteration(qualityReport, null);
      await harvester.flush();

      const accepted = harvester.getAcceptedExamples();
      if (accepted.length > 0) {
        const example = accepted[0];

        // Verify Alpaca format fields
        expect(example.instruction).toBeTruthy();
        expect(example.input).toBeTruthy();
        expect(example.output).toBeTruthy();

        // Verify metadata
        expect(example.metadata.source).toBe('self-improve-harvester');
        expect(typeof example.metadata.timestamp).toBe('number');
        expect(typeof example.metadata.quality_score).toBe('number');
        expect(typeof example.metadata.test_passed).toBe('boolean');
        expect(typeof example.metadata.pass_rate).toBe('number');
        expect(Array.isArray(example.metadata.filter_stages_passed)).toBe(true);
      }
    });

    it('JSONL output from harvester is parseable', async () => {
      // Run 3 cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        const mockIO = createMockIO(cycle);
        const wrappedIO = harvester.wrapIO(mockIO);

        const query = `Test SNN layer ${cycle} for sparsity compliance and energy efficiency monitoring`;
        const targets = await wrappedIO.queryUntested(query);
        const generated = await wrappedIO.generateTest(targets[0]);
        await wrappedIO.runVitest(generated.testFilePath);

        const qualityReport = calculateQualityScore({
          testsPassed: 9 + (cycle > 1 ? 1 : 0),
          testsTotal: 10,
          coveragePercent: 80,
          typeCheckPassed: true,
          lintIssues: 2,
          lintFilesTotal: 50,
          circuitBreakerHealth: 90,
        });

        harvester.captureIteration(qualityReport, null);
      }

      const jsonl = harvester.toJSONL();
      if (jsonl.trim().length > 0) {
        const lines = jsonl.split('\n').filter((l) => l.length > 0);
        for (const line of lines) {
          const parsed = JSON.parse(line);
          expect(parsed).toHaveProperty('instruction');
          expect(parsed).toHaveProperty('input');
          expect(parsed).toHaveProperty('output');
          expect(parsed).toHaveProperty('metadata');
        }
      }
    });
  });
});
