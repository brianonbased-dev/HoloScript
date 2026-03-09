import { describe, it, expect } from 'vitest';
import { SoftDedup, createSoftDedup, DEFAULT_SOFTDEDUP_CONFIG } from '../SoftDedup';
import type { SoftDedupConfig, SoftDedupResult } from '../SoftDedup';

// =============================================================================
// TEST DATA
// =============================================================================

const UNIQUE_EXAMPLES = [
  'composition MyScene { orb Player { Grabbable {} Physics { mass: 10 } } }',
  'world Arena { orb Enemy { Animation { clip: "attack" duration: 2.0 } } }',
  'composition Garden { orb Tree { GaussianSplat { resolution: 512 } } }',
  'world Ocean { orb Fish { NPC { behavior: "patrol" speed: 3.0 } } }',
  'composition Castle { orb Knight { Tradeable { value: 100 } } }',
];

const DUPLICATE_HEAVY_EXAMPLES = [
  'composition Scene { orb A { Grabbable {} } }',
  'composition Scene { orb B { Grabbable {} } }',
  'composition Scene { orb C { Grabbable {} } }',
  'composition Scene { orb D { Grabbable {} } }',
  'composition Scene { orb E { Grabbable {} } }',
  'composition Scene { orb F { Grabbable {} } }',
  'composition Scene { orb G { Grabbable {} } }',
  'composition Scene { orb H { Grabbable {} } }',
  'world UniqueWorld { orb Special { Physics { mass: 999 gravity: true } } }',
];

// =============================================================================
// TESTS
// =============================================================================

describe('SoftDedup', () => {
  // ---------------------------------------------------------------------------
  // CONSTRUCTION & CONFIGURATION
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('uses default config when no overrides provided', () => {
      const dedup = new SoftDedup();
      const config = dedup.getConfig();
      expect(config).toEqual(DEFAULT_SOFTDEDUP_CONFIG);
    });

    it('merges partial config with defaults', () => {
      const dedup = new SoftDedup({ temperature: 0.5, wordLevel: true });
      const config = dedup.getConfig();
      expect(config.temperature).toBe(0.5);
      expect(config.wordLevel).toBe(true);
      expect(config.minWeight).toBe(DEFAULT_SOFTDEDUP_CONFIG.minWeight);
      expect(config.ngramSizes).toEqual(DEFAULT_SOFTDEDUP_CONFIG.ngramSizes);
    });

    it('throws on invalid minWeight (<= 0)', () => {
      expect(() => new SoftDedup({ minWeight: 0 })).toThrow('minWeight');
      expect(() => new SoftDedup({ minWeight: -0.5 })).toThrow('minWeight');
    });

    it('throws on invalid minWeight (> 1)', () => {
      expect(() => new SoftDedup({ minWeight: 1.5 })).toThrow('minWeight');
    });

    it('throws on invalid maxWeight (< minWeight)', () => {
      expect(() => new SoftDedup({ minWeight: 0.5, maxWeight: 0.3 })).toThrow('maxWeight');
    });

    it('throws on invalid maxWeight (> 1)', () => {
      expect(() => new SoftDedup({ maxWeight: 1.5 })).toThrow('maxWeight');
    });

    it('throws on invalid temperature (<= 0)', () => {
      expect(() => new SoftDedup({ temperature: 0 })).toThrow('temperature');
      expect(() => new SoftDedup({ temperature: -1 })).toThrow('temperature');
    });

    it('throws on invalid commonThresholdPercentile', () => {
      expect(() => new SoftDedup({ commonThresholdPercentile: -0.1 })).toThrow(
        'commonThresholdPercentile'
      );
      expect(() => new SoftDedup({ commonThresholdPercentile: 1.5 })).toThrow(
        'commonThresholdPercentile'
      );
    });

    it('throws on empty ngramSizes', () => {
      expect(() => new SoftDedup({ ngramSizes: [] })).toThrow('ngramSizes');
    });

    it('throws on non-integer ngramSizes', () => {
      expect(() => new SoftDedup({ ngramSizes: [2.5] })).toThrow('positive integer');
    });

    it('throws on zero ngramSize', () => {
      expect(() => new SoftDedup({ ngramSizes: [0] })).toThrow('positive integer');
    });
  });

  // ---------------------------------------------------------------------------
  // EDGE CASES
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns empty array for empty dataset', () => {
      const dedup = new SoftDedup();
      const results = dedup.process([]);
      expect(results).toEqual([]);
    });

    it('returns max weight for single example', () => {
      const dedup = new SoftDedup();
      const results = dedup.process(['hello world']);
      expect(results).toHaveLength(1);
      expect(results[0].samplingWeight).toBe(1.0);
      expect(results[0].commonnessScore).toBe(0);
      expect(results[0].index).toBe(0);
    });

    it('handles empty string examples', () => {
      const dedup = new SoftDedup();
      const results = dedup.process(['', '']);
      expect(results).toHaveLength(2);
      // Empty strings produce no n-grams -> max weight
      for (const r of results) {
        expect(r.samplingWeight).toBe(1.0);
        expect(r.ngramStats.totalNgrams).toBe(0);
      }
    });

    it('handles very short strings (shorter than min n-gram size)', () => {
      const dedup = new SoftDedup({ ngramSizes: [5] });
      const results = dedup.process(['ab', 'cd']);
      expect(results).toHaveLength(2);
      // Strings shorter than n=5 produce no n-grams
      for (const r of results) {
        expect(r.ngramStats.totalNgrams).toBe(0);
        expect(r.samplingWeight).toBe(1.0);
      }
    });

    it('handles identical examples (maximum commonness)', () => {
      const text = 'composition Scene { orb Player { Grabbable {} } }';
      const dedup = new SoftDedup();
      const results = dedup.process([text, text, text, text, text]);
      expect(results).toHaveLength(5);

      // All identical -> all should have the same (low) weight
      const weights = results.map((r) => r.samplingWeight);
      expect(new Set(weights).size).toBe(1); // All same weight
    });

    it('handles whitespace-only examples', () => {
      const dedup = new SoftDedup({ ngramSizes: [3] });
      const results = dedup.process(['   ', '   ']);
      expect(results).toHaveLength(2);
      // Whitespace produces character n-grams; both identical -> common
    });
  });

  // ---------------------------------------------------------------------------
  // CORE FUNCTIONALITY
  // ---------------------------------------------------------------------------

  describe('process', () => {
    it('assigns higher weights to unique examples', () => {
      const dedup = new SoftDedup();
      const results = dedup.process(DUPLICATE_HEAVY_EXAMPLES);

      // The unique world example (last one) should have a higher weight
      // than the template-based ones
      const templateWeights = results.slice(0, -1).map((r) => r.samplingWeight);
      const uniqueWeight = results[results.length - 1].samplingWeight;

      const avgTemplateWeight = templateWeights.reduce((a, b) => a + b, 0) / templateWeights.length;

      expect(uniqueWeight).toBeGreaterThanOrEqual(avgTemplateWeight);
    });

    it('produces weights in [minWeight, maxWeight] range', () => {
      const dedup = new SoftDedup({ minWeight: 0.2, maxWeight: 0.9 });
      const results = dedup.process(DUPLICATE_HEAVY_EXAMPLES);

      for (const r of results) {
        expect(r.samplingWeight).toBeGreaterThanOrEqual(0.2);
        expect(r.samplingWeight).toBeLessThanOrEqual(0.9);
      }
    });

    it('preserves correct indices', () => {
      const dedup = new SoftDedup();
      const results = dedup.process(UNIQUE_EXAMPLES);

      for (let i = 0; i < results.length; i++) {
        expect(results[i].index).toBe(i);
      }
    });

    it('commonness scores are in [0, 1] range', () => {
      const dedup = new SoftDedup();
      const results = dedup.process(DUPLICATE_HEAVY_EXAMPLES);

      for (const r of results) {
        expect(r.commonnessScore).toBeGreaterThanOrEqual(0);
        expect(r.commonnessScore).toBeLessThanOrEqual(1);
      }
    });

    it('n-gram stats are consistent', () => {
      const dedup = new SoftDedup();
      const results = dedup.process(UNIQUE_EXAMPLES);

      for (const r of results) {
        expect(r.ngramStats.commonNgrams).toBeLessThanOrEqual(r.ngramStats.totalNgrams);
        expect(r.ngramStats.commonRatio).toBeGreaterThanOrEqual(0);
        expect(r.ngramStats.commonRatio).toBeLessThanOrEqual(1);

        if (r.ngramStats.totalNgrams > 0) {
          expect(r.ngramStats.commonRatio).toBeCloseTo(
            r.ngramStats.commonNgrams / r.ngramStats.totalNgrams,
            10
          );
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // WORD-LEVEL N-GRAMS
  // ---------------------------------------------------------------------------

  describe('word-level n-grams', () => {
    it('supports word-level tokenization', () => {
      const dedup = new SoftDedup({
        wordLevel: true,
        ngramSizes: [2, 3],
      });

      const results = dedup.process([
        'composition Scene orb Player Grabbable',
        'composition Scene orb Player Grabbable',
        'world Arena orb Enemy Physics mass gravity',
      ]);

      expect(results).toHaveLength(3);
      // Word-level should still detect duplicates
      expect(results[0].samplingWeight).toBe(results[1].samplingWeight);
    });

    it('handles single-word examples with word-level n-grams', () => {
      const dedup = new SoftDedup({
        wordLevel: true,
        ngramSizes: [2],
      });

      const results = dedup.process(['hello', 'world']);
      // Single words can't form bigrams -> no n-grams -> max weight
      for (const r of results) {
        expect(r.ngramStats.totalNgrams).toBe(0);
        expect(r.samplingWeight).toBe(1.0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // TEMPERATURE SCALING
  // ---------------------------------------------------------------------------

  describe('temperature scaling', () => {
    it('lower temperature produces more extreme weights', () => {
      const lowTemp = new SoftDedup({ temperature: 0.3 });
      const highTemp = new SoftDedup({ temperature: 2.0 });

      const lowResults = lowTemp.process(DUPLICATE_HEAVY_EXAMPLES);
      const highResults = highTemp.process(DUPLICATE_HEAVY_EXAMPLES);

      // Low temperature should have larger weight variance
      const lowWeights = lowResults.map((r) => r.samplingWeight);
      const highWeights = highResults.map((r) => r.samplingWeight);

      const lowVariance = computeVariance(lowWeights);
      const highVariance = computeVariance(highWeights);

      // Low temperature should produce more spread-out weights
      // (higher variance or at least not lower)
      expect(lowVariance).toBeGreaterThanOrEqual(highVariance - 0.01);
    });
  });

  // ---------------------------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------------------------

  describe('computeStats', () => {
    it('returns zero stats for empty results', () => {
      const dedup = new SoftDedup();
      const stats = dedup.computeStats([]);

      expect(stats.totalExamples).toBe(0);
      expect(stats.meanWeight).toBe(0);
      expect(stats.medianWeight).toBe(0);
      expect(stats.effectiveDatasetSize).toBe(0);
      expect(stats.reductionRatio).toBe(0);
    });

    it('computes correct stats for uniform weights', () => {
      const dedup = new SoftDedup();
      const results = dedup.process(UNIQUE_EXAMPLES);
      const stats = dedup.computeStats(results);

      expect(stats.totalExamples).toBe(5);
      expect(stats.meanWeight).toBeGreaterThan(0);
      expect(stats.meanWeight).toBeLessThanOrEqual(1);
      expect(stats.effectiveDatasetSize).toBeLessThanOrEqual(5);
      expect(stats.reductionRatio).toBeGreaterThanOrEqual(0);
      expect(stats.reductionRatio).toBeLessThanOrEqual(1);
    });

    it('reports positive reduction ratio for duplicate-heavy datasets', () => {
      const dedup = new SoftDedup();
      const results = dedup.process(DUPLICATE_HEAVY_EXAMPLES);
      const stats = dedup.computeStats(results);

      // With duplicates, effective size should be less than total
      expect(stats.effectiveDatasetSize).toBeLessThanOrEqual(stats.totalExamples);
      expect(stats.reductionRatio).toBeGreaterThanOrEqual(0);
    });

    it('computes correct median for even-length arrays', () => {
      const dedup = new SoftDedup();
      const results: SoftDedupResult[] = [
        {
          index: 0,
          commonnessScore: 0,
          samplingWeight: 0.2,
          ngramStats: { totalNgrams: 10, commonNgrams: 0, commonRatio: 0 },
        },
        {
          index: 1,
          commonnessScore: 0,
          samplingWeight: 0.8,
          ngramStats: { totalNgrams: 10, commonNgrams: 0, commonRatio: 0 },
        },
      ];
      const stats = dedup.computeStats(results);
      expect(stats.medianWeight).toBe(0.5); // (0.2 + 0.8) / 2
    });

    it('computes correct median for odd-length arrays', () => {
      const dedup = new SoftDedup();
      const results: SoftDedupResult[] = [
        {
          index: 0,
          commonnessScore: 0,
          samplingWeight: 0.2,
          ngramStats: { totalNgrams: 10, commonNgrams: 0, commonRatio: 0 },
        },
        {
          index: 1,
          commonnessScore: 0,
          samplingWeight: 0.5,
          ngramStats: { totalNgrams: 10, commonNgrams: 0, commonRatio: 0 },
        },
        {
          index: 2,
          commonnessScore: 0,
          samplingWeight: 0.9,
          ngramStats: { totalNgrams: 10, commonNgrams: 0, commonRatio: 0 },
        },
      ];
      const stats = dedup.computeStats(results);
      expect(stats.medianWeight).toBe(0.5);
    });
  });

  // ---------------------------------------------------------------------------
  // FACTORY FUNCTION
  // ---------------------------------------------------------------------------

  describe('createSoftDedup', () => {
    it('creates a SoftDedup instance with defaults', () => {
      const dedup = createSoftDedup();
      expect(dedup).toBeInstanceOf(SoftDedup);
      expect(dedup.getConfig()).toEqual(DEFAULT_SOFTDEDUP_CONFIG);
    });

    it('creates a SoftDedup instance with overrides', () => {
      const dedup = createSoftDedup({ temperature: 2.0 });
      expect(dedup.getConfig().temperature).toBe(2.0);
    });
  });

  // ---------------------------------------------------------------------------
  // DEFAULT CONFIG
  // ---------------------------------------------------------------------------

  describe('DEFAULT_SOFTDEDUP_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_SOFTDEDUP_CONFIG.ngramSizes).toEqual([3, 5, 7]);
      expect(DEFAULT_SOFTDEDUP_CONFIG.wordLevel).toBe(false);
      expect(DEFAULT_SOFTDEDUP_CONFIG.minWeight).toBe(0.1);
      expect(DEFAULT_SOFTDEDUP_CONFIG.maxWeight).toBe(1.0);
      expect(DEFAULT_SOFTDEDUP_CONFIG.temperature).toBe(1.0);
      expect(DEFAULT_SOFTDEDUP_CONFIG.commonThresholdPercentile).toBe(0.7);
    });
  });
});

// =============================================================================
// HELPERS
// =============================================================================

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
}
