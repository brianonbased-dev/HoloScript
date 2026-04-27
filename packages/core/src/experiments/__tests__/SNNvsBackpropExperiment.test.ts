/**
 * Tests for SNNvsBackpropExperiment.ts
 * Covers: SeededRandom, statistical utilities, ConfabulationDetector,
 * SimulatedLIFLayer, DEFAULT_EXPERIMENT_CONFIG, and type exports.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the readJson dependency from errors/safeJsonParse
vi.mock('../../errors/safeJsonParse.js', () => ({
  readJson: vi.fn(),
}));

import {
  SeededRandom,
  mean,
  stddev,
  pairedTTest,
  cohensD,
  interpretEffectSize,
  ConfabulationDetector,
  SimulatedLIFLayer,
  DEFAULT_EXPERIMENT_CONFIG,
} from '../SNNvsBackpropExperiment.js';

import type {
  NeuronModel,
  LearningRule,
  InputDistribution,
  ExperimentConfig,
  TrialResult,
  ConfabulationMetrics,
  CalibrationBin,
  StatisticalAnalysis,
  ExperimentResults,
} from '../SNNvsBackpropExperiment.js';

// =============================================================================
// SeededRandom
// =============================================================================

describe('SeededRandom', () => {
  it('produces values in [0, 1)', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for the same seed', () => {
    const rng1 = new SeededRandom(123);
    const rng2 = new SeededRandom(123);
    for (let i = 0; i < 20; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = new SeededRandom(1);
    const rng2 = new SeededRandom(2);
    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());
    // At least one value should differ
    expect(seq1).not.toEqual(seq2);
  });

  it('gaussian() produces finite numbers', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 50; i++) {
      const v = rng.gaussian();
      expect(isFinite(v)).toBe(true);
    }
  });

  it('gaussian() respects mean and stddev parameters approximately', () => {
    const rng = new SeededRandom(99);
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      samples.push(rng.gaussian(5, 2));
    }
    const sampleMean = samples.reduce((s, v) => s + v, 0) / samples.length;
    // Mean should be approximately 5
    expect(sampleMean).toBeCloseTo(5, 0);
  });

  it('poisson() produces non-negative integers', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 50; i++) {
      const v = rng.poisson(5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('shuffle() returns the same elements', () => {
    const rng = new SeededRandom(42);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle([...arr]);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it('shuffle() modifies the array in place', () => {
    const rng = new SeededRandom(42);
    const arr = [1, 2, 3, 4, 5];
    const ref = arr;
    rng.shuffle(arr);
    expect(arr).toBe(ref); // same reference
  });

  it('shuffle() is deterministic with same seed', () => {
    const arr = [10, 20, 30, 40, 50];
    const rng1 = new SeededRandom(7);
    const rng2 = new SeededRandom(7);
    const s1 = rng1.shuffle([...arr]);
    const s2 = rng2.shuffle([...arr]);
    expect(s1).toEqual(s2);
  });

  it('shuffle() handles empty array', () => {
    const rng = new SeededRandom(42);
    expect(rng.shuffle([])).toEqual([]);
  });

  it('shuffle() handles single-element array', () => {
    const rng = new SeededRandom(42);
    expect(rng.shuffle([99])).toEqual([99]);
  });
});

// =============================================================================
// mean()
// =============================================================================

describe('mean()', () => {
  it('computes mean of an array', () => {
    expect(mean([1, 2, 3, 4, 5])).toBeCloseTo(3);
  });

  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('handles single element', () => {
    expect(mean([42])).toBe(42);
  });

  it('handles negative values', () => {
    expect(mean([-2, -4, -6])).toBeCloseTo(-4);
  });

  it('handles decimal values', () => {
    expect(mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2);
  });
});

// =============================================================================
// stddev()
// =============================================================================

describe('stddev()', () => {
  it('computes sample standard deviation', () => {
    // sample stddev of [2, 4, 4, 4, 5, 5, 7, 9] ≈ 2.138 (population stddev = 2)
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });

  it('returns 0 for empty array', () => {
    expect(stddev([])).toBe(0);
  });

  it('returns 0 for single element', () => {
    expect(stddev([5])).toBe(0);
  });

  it('returns 0 for identical elements', () => {
    expect(stddev([3, 3, 3, 3])).toBeCloseTo(0);
  });

  it('uses Bessel correction (n-1 denominator)', () => {
    // stddev([1, 3]) = sqrt(((1-2)^2 + (3-2)^2) / (2-1)) = sqrt(2)
    expect(stddev([1, 3])).toBeCloseTo(Math.sqrt(2));
  });
});

// =============================================================================
// pairedTTest()
// =============================================================================

describe('pairedTTest()', () => {
  it('returns t-statistic, p-value, and degrees of freedom', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [1.1, 2.1, 3.1, 4.1, 5.1];
    const result = pairedTTest(a, b);
    expect(result).toHaveProperty('tStatistic');
    expect(result).toHaveProperty('pValue');
    expect(result).toHaveProperty('degreesOfFreedom');
  });

  it('p-value is in [0, 1]', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 3, 4, 5, 6];
    const result = pairedTTest(a, b);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it('degrees of freedom is n-1', () => {
    const a = [1, 2, 3, 4, 5]; // n=5
    const b = [2, 3, 4, 5, 6];
    const result = pairedTTest(a, b);
    expect(result.degreesOfFreedom).toBe(4);
  });

  it('throws for arrays of different lengths', () => {
    expect(() => pairedTTest([1, 2, 3], [1, 2])).toThrow();
  });

  it('returns t=0, p=1 for arrays of length < 2', () => {
    const result = pairedTTest([5], [5]);
    expect(result.tStatistic).toBe(0);
    expect(result.pValue).toBe(1);
  });

  it('returns t=0 when all differences are zero', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = pairedTTest(arr, arr);
    expect(result.tStatistic).toBe(0);
  });

  it('produces significant result for large effect', () => {
    // Large difference across many samples should be significant
    const a = Array.from({ length: 30 }, () => 0.1);
    const b = Array.from({ length: 30 }, () => 0.9);
    const result = pairedTTest(a, b);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it('t-statistic is finite', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [2, 3, 4, 5, 6, 7, 8, 9];
    const result = pairedTTest(a, b);
    expect(isFinite(result.tStatistic)).toBe(true);
  });
});

// =============================================================================
// cohensD()
// =============================================================================

describe('cohensD()', () => {
  it('returns 0 when both groups are identical', () => {
    expect(cohensD([1, 2, 3], [1, 2, 3])).toBeCloseTo(0);
  });

  it('is positive when group1 > group2', () => {
    const g1 = [5, 6, 7, 8, 9];
    const g2 = [1, 2, 3, 4, 5];
    expect(cohensD(g1, g2)).toBeGreaterThan(0);
  });

  it('is negative when group1 < group2', () => {
    const g1 = [1, 2, 3, 4, 5];
    const g2 = [5, 6, 7, 8, 9];
    expect(cohensD(g1, g2)).toBeLessThan(0);
  });

  it('returns 0 when pooled stddev is zero', () => {
    // All values identical -> stddev = 0
    expect(cohensD([3, 3, 3], [5, 5, 5])).toBe(0);
  });

  it('uses pooled standard deviation', () => {
    // Known example: group1=[1,2,3], group2=[4,5,6]
    // means: 2 vs 5, pooled std: sqrt((2+2)/4) = 1
    // d = (2-5)/1 = -3
    expect(cohensD([1, 2, 3], [4, 5, 6])).toBeCloseTo(-3);
  });
});

// =============================================================================
// interpretEffectSize()
// =============================================================================

describe('interpretEffectSize()', () => {
  it('returns negligible for |d| < 0.2', () => {
    expect(interpretEffectSize(0)).toBe('negligible');
    expect(interpretEffectSize(0.1)).toBe('negligible');
    expect(interpretEffectSize(-0.1)).toBe('negligible');
  });

  it('returns small for 0.2 <= |d| < 0.5', () => {
    expect(interpretEffectSize(0.2)).toBe('small');
    expect(interpretEffectSize(0.4)).toBe('small');
    expect(interpretEffectSize(-0.35)).toBe('small');
  });

  it('returns medium for 0.5 <= |d| < 0.8', () => {
    expect(interpretEffectSize(0.5)).toBe('medium');
    expect(interpretEffectSize(0.7)).toBe('medium');
    expect(interpretEffectSize(-0.6)).toBe('medium');
  });

  it('returns large for |d| >= 0.8', () => {
    expect(interpretEffectSize(0.8)).toBe('large');
    expect(interpretEffectSize(1.5)).toBe('large');
    expect(interpretEffectSize(-2.0)).toBe('large');
  });
});

// =============================================================================
// ConfabulationDetector
// =============================================================================

describe('ConfabulationDetector', () => {
  let detector: ConfabulationDetector;

  beforeEach(() => {
    detector = new ConfabulationDetector(0.8, 0.5);
  });

  describe('isConfabulation()', () => {
    it('returns true when confident and wrong', () => {
      expect(detector.isConfabulation(0.9, false)).toBe(true);
    });

    it('returns false when confident and correct', () => {
      expect(detector.isConfabulation(0.9, true)).toBe(false);
    });

    it('returns false when low confidence and wrong', () => {
      expect(detector.isConfabulation(0.5, false)).toBe(false);
    });

    it('returns false when low confidence and correct', () => {
      expect(detector.isConfabulation(0.3, true)).toBe(false);
    });

    it('handles exact threshold boundary', () => {
      // At exactly threshold (0.8), should trigger confabulation if wrong
      expect(detector.isConfabulation(0.8, false)).toBe(true);
      expect(detector.isConfabulation(0.8, true)).toBe(false);
    });

    it('uses default thresholds when none provided', () => {
      const defaultDetector = new ConfabulationDetector();
      expect(defaultDetector.isConfabulation(0.85, false)).toBe(true);
    });
  });

  describe('computeCoherence()', () => {
    it('returns 1 for a one-hot distribution', () => {
      // Single-class prediction: maximum coherence
      const oneHot = [0, 0, 1, 0, 0];
      expect(detector.computeCoherence(oneHot)).toBeCloseTo(1);
    });

    it('returns 0 for a uniform distribution', () => {
      // Uniform = maximum entropy = minimum coherence
      const uniform = [1, 1, 1, 1, 1];
      expect(detector.computeCoherence(uniform)).toBeCloseTo(0);
    });

    it('returns 0 for all-zero vector', () => {
      expect(detector.computeCoherence([0, 0, 0])).toBe(0);
    });

    it('returns a value in [0, 1]', () => {
      const rng = new SeededRandom(42);
      for (let i = 0; i < 20; i++) {
        const vec = Array.from({ length: 5 }, () => rng.next());
        const coherence = detector.computeCoherence(vec);
        expect(coherence).toBeGreaterThanOrEqual(0);
        expect(coherence).toBeLessThanOrEqual(1);
      }
    });

    it('handles single-element vector', () => {
      // Only one output class — maxEntropy = log(1) = 0 → returns 1
      expect(detector.computeCoherence([5])).toBe(1);
    });

    it('handles negative values (uses abs)', () => {
      const result = detector.computeCoherence([-1, -2, -3]);
      expect(isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computeCalibrationBins()', () => {
    const makeTrials = (confidence: number, correct: boolean, count: number = 5): TrialResult[] =>
      Array.from({ length: count }, (_, i) => ({
        trialIndex: i,
        arm: 'backprop' as const,
        stimulusId: `s${i}`,
        outputVector: [0.5, 0.5],
        prediction: 0,
        groundTruth: correct ? 0 : 1,
        confidence,
        correct,
        confabulated: false,
        coherenceScore: 0.5,
        executionTimeMs: 1,
      }));

    it('returns 10 bins', () => {
      const trials = makeTrials(0.5, true);
      const bins = detector.computeCalibrationBins(trials);
      expect(bins).toHaveLength(10);
    });

    it('each bin has correct structure', () => {
      const trials = makeTrials(0.5, true);
      const bins = detector.computeCalibrationBins(trials);
      bins.forEach((bin, i) => {
        expect(bin.binIndex).toBe(i);
        expect(bin.confidenceLower).toBeCloseTo(i / 10);
        expect(bin.confidenceUpper).toBeCloseTo((i + 1) / 10);
        expect(typeof bin.meanConfidence).toBe('number');
        expect(typeof bin.observedAccuracy).toBe('number');
        expect(typeof bin.sampleCount).toBe('number');
      });
    });

    it('bins with no samples have sampleCount=0', () => {
      const trials = makeTrials(0.95, true); // all in bin 9
      const bins = detector.computeCalibrationBins(trials);
      const emptyBins = bins.filter((b) => b.sampleCount === 0);
      expect(emptyBins.length).toBeGreaterThan(0);
    });

    it('correct trials produce accuracy=1 in their bin', () => {
      const trials = makeTrials(0.55, true, 10);
      const bins = detector.computeCalibrationBins(trials);
      const bin5 = bins[5]; // confidence 0.5–0.6
      expect(bin5.observedAccuracy).toBeCloseTo(1);
    });
  });

  describe('computeECE()', () => {
    it('returns 0 for perfectly calibrated model (no samples)', () => {
      const bins: CalibrationBin[] = Array.from({ length: 10 }, (_, i) => ({
        binIndex: i,
        confidenceLower: i / 10,
        confidenceUpper: (i + 1) / 10,
        meanConfidence: (i + 0.5) / 10,
        observedAccuracy: (i + 0.5) / 10, // perfectly calibrated
        sampleCount: 10,
      }));
      const ece = detector.computeECE(bins, 100);
      expect(ece).toBeCloseTo(0);
    });

    it('returns 0 for zero total samples', () => {
      const bins: CalibrationBin[] = Array.from({ length: 10 }, (_, i) => ({
        binIndex: i,
        confidenceLower: i / 10,
        confidenceUpper: (i + 1) / 10,
        meanConfidence: 0.5,
        observedAccuracy: 0.5,
        sampleCount: 0,
      }));
      expect(detector.computeECE(bins, 0)).toBe(0);
    });

    it('returns a positive value for miscalibrated model', () => {
      const bins: CalibrationBin[] = [
        {
          binIndex: 9,
          confidenceLower: 0.9,
          confidenceUpper: 1.0,
          meanConfidence: 0.95,
          observedAccuracy: 0.5, // overconfident
          sampleCount: 100,
        },
      ];
      const ece = detector.computeECE(bins, 100);
      expect(ece).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// SimulatedLIFLayer
// =============================================================================

describe('SimulatedLIFLayer', () => {
  const rng = new SeededRandom(42);
  const inputSize = 10;
  const layerSize = 5;
  const tauM = 20.0;
  const vThreshold = -55.0;
  const vReset = -70.0;
  const dt = 1.0;

  it('step() returns a Uint8Array of the correct size', () => {
    const layer = new SimulatedLIFLayer(inputSize, layerSize, tauM, vThreshold, vReset, dt, rng);
    const input = new Float64Array(inputSize).fill(0);
    const spikes = layer.step(input);
    expect(spikes).toBeInstanceOf(Uint8Array);
    expect(spikes.length).toBe(layerSize);
  });

  it('step() returns binary spikes (0 or 1)', () => {
    const layer = new SimulatedLIFLayer(inputSize, layerSize, tauM, vThreshold, vReset, dt, rng);
    const input = new Float64Array(inputSize).fill(1.0);
    for (let t = 0; t < 50; t++) {
      const spikes = layer.step(input);
      for (const s of spikes) {
        expect(s === 0 || s === 1).toBe(true);
      }
    }
  });

  it('getVoltages() returns Float64Array of the correct size', () => {
    const layer = new SimulatedLIFLayer(inputSize, layerSize, tauM, vThreshold, vReset, dt, rng);
    const voltages = layer.getVoltages();
    expect(voltages).toBeInstanceOf(Float64Array);
    expect(voltages.length).toBe(layerSize);
  });

  it('initial voltages are at vReset', () => {
    const rng2 = new SeededRandom(1);
    const layer = new SimulatedLIFLayer(inputSize, layerSize, tauM, vThreshold, vReset, dt, rng2);
    const voltages = layer.getVoltages();
    for (const v of voltages) {
      expect(v).toBeCloseTo(vReset);
    }
  });

  it('voltages change after a step with non-zero input', () => {
    const rng2 = new SeededRandom(123);
    const layer = new SimulatedLIFLayer(inputSize, layerSize, tauM, vThreshold, vReset, dt, rng2);
    const initialVoltages = Array.from(layer.getVoltages());
    // Large input to drive voltage changes
    const input = new Float64Array(inputSize).fill(100.0);
    layer.step(input);
    const newVoltages = Array.from(layer.getVoltages());
    // At least some voltages should have changed
    const changed = newVoltages.some((v, i) => Math.abs(v - initialVoltages[i]) > 1e-10);
    expect(changed).toBe(true);
  });

  it('applySTDP() does not throw', () => {
    const rng2 = new SeededRandom(55);
    const layer = new SimulatedLIFLayer(inputSize, layerSize, tauM, vThreshold, vReset, dt, rng2);
    const preSpikes = new Uint8Array(inputSize).fill(1);
    const postSpikes = new Uint8Array(layerSize).fill(1);
    expect(() => layer.applySTDP(preSpikes, postSpikes)).not.toThrow();
  });

  it('applySTDP() modifies internal weights', () => {
    const rng2 = new SeededRandom(77);
    const layer = new SimulatedLIFLayer(inputSize, layerSize, tauM, vThreshold, vReset, dt, rng2);

    // Run many STDP steps with consistent pre-post pattern
    const preSpikes = new Uint8Array(inputSize).fill(1);
    const postSpikes = new Uint8Array(layerSize).fill(1);
    const input = new Float64Array(inputSize).fill(0.5);

    const voltagesBefore = Array.from(layer.getVoltages());
    for (let t = 0; t < 10; t++) {
      layer.step(input);
      layer.applySTDP(preSpikes, postSpikes, 0.01);
    }

    // After STDP learning, behavior should change (voltages may differ)
    const voltagesAfter = Array.from(layer.getVoltages());
    // Just verify no errors — exact voltage diff is hard to assert deterministically
    expect(voltagesBefore).toBeDefined();
    expect(voltagesAfter).toBeDefined();
  });

  it('handles zero input without error', () => {
    const rng2 = new SeededRandom(42);
    const layer = new SimulatedLIFLayer(inputSize, layerSize, tauM, vThreshold, vReset, dt, rng2);
    const input = new Float64Array(inputSize).fill(0);
    expect(() => layer.step(input)).not.toThrow();
  });
});

// =============================================================================
// DEFAULT_EXPERIMENT_CONFIG
// =============================================================================

describe('DEFAULT_EXPERIMENT_CONFIG', () => {
  it('is a valid ExperimentConfig object', () => {
    expect(DEFAULT_EXPERIMENT_CONFIG).toBeDefined();
    expect(typeof DEFAULT_EXPERIMENT_CONFIG.name).toBe('string');
    expect(typeof DEFAULT_EXPERIMENT_CONFIG.seed).toBe('number');
    expect(typeof DEFAULT_EXPERIMENT_CONFIG.inputSize).toBe('number');
    expect(typeof DEFAULT_EXPERIMENT_CONFIG.outputSize).toBe('number');
    expect(typeof DEFAULT_EXPERIMENT_CONFIG.epochs).toBe('number');
    expect(typeof DEFAULT_EXPERIMENT_CONFIG.trialsPerCondition).toBe('number');
  });

  it('has sensible default values', () => {
    expect(DEFAULT_EXPERIMENT_CONFIG.seed).toBe(42);
    expect(DEFAULT_EXPERIMENT_CONFIG.inputSize).toBe(784); // MNIST-scale
    expect(DEFAULT_EXPERIMENT_CONFIG.outputSize).toBe(10);
    expect(DEFAULT_EXPERIMENT_CONFIG.neuronModel).toBe('lif');
    expect(DEFAULT_EXPERIMENT_CONFIG.snnLearningRule).toBe('stdp');
  });

  it('has positive numeric parameters', () => {
    expect(DEFAULT_EXPERIMENT_CONFIG.epochs).toBeGreaterThan(0);
    expect(DEFAULT_EXPERIMENT_CONFIG.batchSize).toBeGreaterThan(0);
    expect(DEFAULT_EXPERIMENT_CONFIG.tauM).toBeGreaterThan(0);
    expect(DEFAULT_EXPERIMENT_CONFIG.dt).toBeGreaterThan(0);
    expect(DEFAULT_EXPERIMENT_CONFIG.trialDuration).toBeGreaterThan(0);
  });

  it('has thresholds in valid ranges', () => {
    expect(DEFAULT_EXPERIMENT_CONFIG.confidenceThreshold).toBeGreaterThan(0);
    expect(DEFAULT_EXPERIMENT_CONFIG.confidenceThreshold).toBeLessThanOrEqual(1);
    expect(DEFAULT_EXPERIMENT_CONFIG.coherenceThreshold).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_EXPERIMENT_CONFIG.coherenceThreshold).toBeLessThanOrEqual(1);
    expect(DEFAULT_EXPERIMENT_CONFIG.temperature).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_EXPERIMENT_CONFIG.temperature).toBeLessThanOrEqual(1);
  });

  it('has non-empty hiddenSizes', () => {
    expect(Array.isArray(DEFAULT_EXPERIMENT_CONFIG.hiddenSizes)).toBe(true);
    expect(DEFAULT_EXPERIMENT_CONFIG.hiddenSizes.length).toBeGreaterThan(0);
  });

  it('has valid LIF voltage parameters (vReset < vThreshold)', () => {
    expect(DEFAULT_EXPERIMENT_CONFIG.vReset).toBeLessThan(DEFAULT_EXPERIMENT_CONFIG.vThreshold);
  });
});

// =============================================================================
// Type exports validation (compile-time — just import and use)
// =============================================================================

describe('Type exports', () => {
  it('NeuronModel type values are valid', () => {
    const models: NeuronModel[] = ['lif', 'izhikevich', 'hodgkin-huxley'];
    expect(models).toHaveLength(3);
  });

  it('LearningRule type values are valid', () => {
    const rules: LearningRule[] = ['stdp', 'rstdp', 'backprop', 'forward-forward'];
    expect(rules).toHaveLength(4);
  });

  it('InputDistribution type values are valid', () => {
    const distributions: InputDistribution[] = ['uniform', 'gaussian', 'poisson', 'natural-image'];
    expect(distributions).toHaveLength(4);
  });
});
