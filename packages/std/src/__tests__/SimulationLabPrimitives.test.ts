import { describe, it, expect } from 'vitest';
import {
  mean,
  variance,
  standardDeviation,
  standardError,
  cohensD,
  tTest,
  oneSampleTTest,
  mannWhitneyU,
  chiSquaredTest,
  expandSweep,
  generateSweepCombinations,
  extractMetric,
  groupByParameter,
  summarizeMetrics,
  isParameterRange,
} from '../traits/SimulationLabPrimitives.js';
import type {
  ParameterRange,
  ParameterSet,
  SimulationMetrics,
} from '../traits/SimulationLabPrimitives.js';
import {
  SimulationLabTraits,
  getSimulationTraitNames,
  getSimulationTrait,
} from '../traits/SimulationLabTraits.js';

// =============================================================================
// BASIC STATISTICS
// =============================================================================

describe('Basic Statistics', () => {
  describe('mean', () => {
    it('should return 0 for empty array', () => {
      expect(mean([])).toBe(0);
    });
    it('should calculate correct mean', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });
    it('should handle single element', () => {
      expect(mean([42])).toBe(42);
    });
    it('should handle negative numbers', () => {
      expect(mean([-10, 10])).toBe(0);
    });
  });

  describe('variance', () => {
    it('should return 0 for single element', () => {
      expect(variance([5])).toBe(0);
    });
    it('should return 0 for identical values', () => {
      expect(variance([3, 3, 3, 3])).toBe(0);
    });
    it('should calculate sample variance with Bessel correction', () => {
      // [1,2,3,4,5]: mean=3, sum of sq diffs=10, n-1=4 -> var=2.5
      expect(variance([1, 2, 3, 4, 5])).toBe(2.5);
    });
  });

  describe('standardDeviation', () => {
    it('should be sqrt of variance', () => {
      const data = [1, 2, 3, 4, 5];
      expect(standardDeviation(data)).toBeCloseTo(Math.sqrt(2.5), 10);
    });
  });

  describe('standardError', () => {
    it('should return 0 for empty array', () => {
      expect(standardError([])).toBe(0);
    });
    it('should equal sd / sqrt(n)', () => {
      const data = [1, 2, 3, 4, 5];
      const sd = standardDeviation(data);
      expect(standardError(data)).toBeCloseTo(sd / Math.sqrt(5), 10);
    });
  });

  describe('cohensD', () => {
    it('should return 0 for identical groups', () => {
      expect(cohensD([5, 5, 5], [5, 5, 5])).toBe(0);
    });
    it('should return positive d when group1 > group2', () => {
      const d = cohensD([10, 11, 12], [1, 2, 3]);
      expect(d).toBeGreaterThan(0);
    });
    it('should return large d for well-separated groups', () => {
      const d = cohensD([100, 101, 102], [1, 2, 3]);
      expect(Math.abs(d)).toBeGreaterThan(2); // Large effect
    });
    it('should handle insufficient data', () => {
      expect(cohensD([5], [3])).toBe(0);
    });
  });
});

// =============================================================================
// PARAMETER SWEEP
// =============================================================================

describe('Parameter Sweep', () => {
  describe('isParameterRange', () => {
    it('should identify range', () => {
      const r: ParameterRange = { name: 'x', min: 0, max: 10, step: 1 };
      expect(isParameterRange(r)).toBe(true);
    });
    it('should reject set', () => {
      const s: ParameterSet = { name: 'x', values: [1, 2, 3] };
      expect(isParameterRange(s)).toBe(false);
    });
  });

  describe('expandSweep', () => {
    it('should expand range correctly', () => {
      const r: ParameterRange = { name: 'x', min: 0, max: 1, step: 0.5 };
      const values = expandSweep(r);
      expect(values).toEqual([0, 0.5, 1.0]);
    });
    it('should return values for discrete set', () => {
      const s: ParameterSet = { name: 'x', values: [1, 5, 10] };
      expect(expandSweep(s)).toEqual([1, 5, 10]);
    });
    it('should handle zero step', () => {
      const r: ParameterRange = { name: 'x', min: 5, max: 10, step: 0 };
      expect(expandSweep(r)).toEqual([5]);
    });
    it('should handle reversed range', () => {
      const r: ParameterRange = { name: 'x', min: 10, max: 5, step: 1 };
      expect(expandSweep(r)).toEqual([]);
    });
    it('should handle single-value range', () => {
      const r: ParameterRange = { name: 'x', min: 5, max: 5, step: 1 };
      expect(expandSweep(r)).toEqual([5]);
    });
  });

  describe('generateSweepCombinations', () => {
    it('should return [{}] for empty sweeps', () => {
      expect(generateSweepCombinations([])).toEqual([{}]);
    });
    it('should generate all values for single sweep', () => {
      const combos = generateSweepCombinations([{ name: 'x', values: [1, 2, 3] }]);
      expect(combos).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
    });
    it('should generate Cartesian product for two sweeps', () => {
      const combos = generateSweepCombinations([
        { name: 'x', values: [1, 2] },
        { name: 'y', values: [10, 20] },
      ]);
      expect(combos).toHaveLength(4);
      expect(combos).toContainEqual({ x: 1, y: 10 });
      expect(combos).toContainEqual({ x: 1, y: 20 });
      expect(combos).toContainEqual({ x: 2, y: 10 });
      expect(combos).toContainEqual({ x: 2, y: 20 });
    });
    it('should handle three sweeps', () => {
      const combos = generateSweepCombinations([
        { name: 'a', values: [1, 2] },
        { name: 'b', values: [3, 4] },
        { name: 'c', values: [5, 6] },
      ]);
      expect(combos).toHaveLength(8); // 2 * 2 * 2
    });
  });
});

// =============================================================================
// STATISTICAL TESTS
// =============================================================================

describe('Statistical Tests', () => {
  describe('tTest (Welch)', () => {
    it('should detect significantly different means', () => {
      const group1 = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i));
      const group2 = Array.from({ length: 100 }, (_, i) => 50 + Math.sin(i));
      const result = tTest(group1, group2);
      expect(result.significant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.testName).toBe('welch_t_test');
    });

    it('should NOT detect difference in identical groups', () => {
      const data = Array.from({ length: 50 }, (_, i) => Math.sin(i) * 10);
      const result = tTest(data, data);
      expect(result.significant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('should handle small samples gracefully', () => {
      const result = tTest([1], [2]);
      expect(result.pValue).toBe(1);
      expect(result.significant).toBe(false);
    });

    it('should report positive effect size when group1 > group2', () => {
      const g1 = [100, 110, 120, 130, 140];
      const g2 = [10, 20, 30, 40, 50];
      const result = tTest(g1, g2);
      expect(result.effectSize).toBeGreaterThan(0);
    });

    it('should respect directional hypotheses', () => {
      const high = Array.from({ length: 50 }, () => 100 + Math.random() * 5);
      const low = Array.from({ length: 50 }, () => 50 + Math.random() * 5);
      const greater = tTest(high, low, 0.05, 'greater');
      const less = tTest(high, low, 0.05, 'less');
      expect(greater.pValue).toBeLessThan(less.pValue);
    });
  });

  describe('oneSampleTTest', () => {
    it('should detect mean different from population', () => {
      const data = Array.from({ length: 100 }, (_, i) => 50 + Math.sin(i));
      const result = oneSampleTTest(data, 0);
      expect(result.significant).toBe(true);
      expect(result.testName).toBe('one_sample_t_test');
    });

    it('should NOT reject when sample comes from population', () => {
      // Data centered around 100
      const data = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i) * 0.01);
      const result = oneSampleTTest(data, 100);
      expect(result.significant).toBe(false);
    });
  });

  describe('mannWhitneyU', () => {
    it('should detect difference in ranked groups', () => {
      const high = [90, 91, 92, 93, 94, 95, 96, 97, 98, 99];
      const low = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = mannWhitneyU(high, low);
      expect(result.significant).toBe(true);
      expect(result.testName).toBe('mann_whitney_u');
    });

    it('should handle empty groups', () => {
      const result = mannWhitneyU([], [1, 2, 3]);
      expect(result.significant).toBe(false);
      expect(result.pValue).toBe(1);
    });

    it('should report effect size', () => {
      const high = [90, 91, 92, 93, 94];
      const low = [1, 2, 3, 4, 5];
      const result = mannWhitneyU(high, low);
      expect(Math.abs(result.effectSize)).toBeGreaterThan(0.5);
    });
  });

  describe('chiSquaredTest', () => {
    it('should NOT reject when observed matches expected', () => {
      const observed = [50, 50, 50, 50];
      const expected = [50, 50, 50, 50];
      const result = chiSquaredTest(observed, expected);
      expect(result.significant).toBe(false);
      expect(result.statistic).toBe(0);
    });

    it('should reject when observed differs significantly from expected', () => {
      const observed = [100, 10, 10, 10];
      const expected = [32.5, 32.5, 32.5, 32.5];
      const result = chiSquaredTest(observed, expected);
      expect(result.significant).toBe(true);
    });

    it('should handle mismatched lengths', () => {
      const result = chiSquaredTest([1, 2], [1]);
      expect(result.significant).toBe(false);
      expect(result.sampleSize).toBe(0);
    });

    it('should calculate Cramers V effect size', () => {
      const observed = [100, 10, 10, 10];
      const expected = [32.5, 32.5, 32.5, 32.5];
      const result = chiSquaredTest(observed, expected);
      expect(result.effectSize).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// METRIC AGGREGATION
// =============================================================================

describe('Metric Aggregation', () => {
  const mockMetrics: SimulationMetrics[] = [
    { values: { score: 100, time: 5 }, seed: 1, params: { difficulty: 1 }, durationMs: 10 },
    { values: { score: 120, time: 6 }, seed: 2, params: { difficulty: 1 }, durationMs: 12 },
    { values: { score: 80, time: 8 }, seed: 3, params: { difficulty: 2 }, durationMs: 15 },
    { values: { score: 70, time: 9 }, seed: 4, params: { difficulty: 2 }, durationMs: 14 },
  ];

  describe('extractMetric', () => {
    it('should extract named metric values', () => {
      expect(extractMetric(mockMetrics, 'score')).toEqual([100, 120, 80, 70]);
    });
    it('should return empty for unknown metric', () => {
      expect(extractMetric(mockMetrics, 'unknown')).toEqual([]);
    });
  });

  describe('groupByParameter', () => {
    it('should group by parameter value', () => {
      const groups = groupByParameter(mockMetrics, 'difficulty');
      expect(groups.size).toBe(2);
      expect(groups.get(1)!).toHaveLength(2);
      expect(groups.get(2)!).toHaveLength(2);
    });
    it('should handle missing parameter', () => {
      const groups = groupByParameter(mockMetrics, 'nonexistent');
      expect(groups.size).toBe(0);
    });
  });

  describe('summarizeMetrics', () => {
    it('should produce correct summary', () => {
      const summary = summarizeMetrics(mockMetrics, 'score');
      expect(summary.n).toBe(4);
      expect(summary.mean).toBeCloseTo(92.5, 1);
      expect(summary.min).toBe(70);
      expect(summary.max).toBe(120);
      expect(summary.std).toBeGreaterThan(0);
    });
    it('should handle missing metric', () => {
      const summary = summarizeMetrics(mockMetrics, 'nonexistent');
      expect(summary.n).toBe(0);
    });
  });
});

// =============================================================================
// TRAIT DEFINITIONS
// =============================================================================

describe('SimulationLab Traits', () => {
  it('should define @simulation_lab trait', () => {
    expect(SimulationLabTraits.simulation_lab).toBeDefined();
    expect(SimulationLabTraits.simulation_lab.name).toBe('@simulation_lab');
  });

  it('should require hypothesis and metrics params', () => {
    const trait = SimulationLabTraits.simulation_lab;
    expect(trait.params.hypothesis.required).toBe(true);
    expect(trait.params.metrics.required).toBe(true);
  });

  it('should validate correct params', () => {
    const valid = SimulationLabTraits.simulation_lab.validator!({
      hypothesis: 'Test hypothesis',
      metrics: ['score'],
      epochs: 100,
      confidence_level: 0.95,
      direction: 'greater',
    });
    expect(valid).toBe(true);
  });

  it('should reject missing hypothesis', () => {
    const invalid = SimulationLabTraits.simulation_lab.validator!({
      metrics: ['score'],
    });
    expect(invalid).toBe(false);
  });

  it('should reject empty metrics', () => {
    const invalid = SimulationLabTraits.simulation_lab.validator!({
      hypothesis: 'Test',
      metrics: [],
    });
    expect(invalid).toBe(false);
  });

  it('should reject invalid direction', () => {
    const invalid = SimulationLabTraits.simulation_lab.validator!({
      hypothesis: 'Test',
      metrics: ['x'],
      direction: 'sideways',
    });
    expect(invalid).toBe(false);
  });

  it('should compose with all economic traits', () => {
    const trait = SimulationLabTraits.simulation_lab;
    expect(trait.composesWith).toContain('@tradeable');
    expect(trait.composesWith).toContain('@pid_controlled');
    expect(trait.composesWith).toContain('@bonding_curved');
  });

  it('should use worker thread for batch execution', () => {
    const hints = SimulationLabTraits.simulation_lab.compiler_hints;
    expect(hints?.thread_safety).toBe('worker_thread');
    expect(hints?.batch_mode).toBe(true);
  });

  describe('getSimulationTraitNames', () => {
    it('should return trait names', () => {
      const names = getSimulationTraitNames();
      expect(names).toContain('@simulation_lab');
    });
  });

  describe('getSimulationTrait', () => {
    it('should find by name with @', () => {
      expect(getSimulationTrait('@simulation_lab')).toBeDefined();
    });
    it('should find by name without @', () => {
      expect(getSimulationTrait('simulation_lab')).toBeDefined();
    });
    it('should return undefined for unknown', () => {
      expect(getSimulationTrait('@unknown')).toBeUndefined();
    });
  });
});
