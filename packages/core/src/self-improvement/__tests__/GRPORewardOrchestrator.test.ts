import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RewardToolRunner } from '../GRPORewardFunctions';
import { GRPO_REWARD_WEIGHTS } from '../GRPORewardFunctions';
import { GRPORewardOrchestrator } from '../GRPORewardOrchestrator';

// =============================================================================
// MOCK TOOL RUNNER
// =============================================================================

function createMockRunner(overrides: Partial<RewardToolRunner> = {}): RewardToolRunner {
  return {
    writeTempFile: vi.fn().mockResolvedValue('/tmp/test-file.ts'),
    deleteTempFile: vi.fn().mockResolvedValue(undefined),
    runVitest: vi.fn().mockResolvedValue({
      passed: 10,
      total: 10,
      coveragePercent: 80,
      output: 'All tests passed',
    }),
    runTypeCheck: vi.fn().mockResolvedValue({
      passed: true,
      output: '',
    }),
    runLint: vi.fn().mockResolvedValue({
      issueCount: 0,
      output: '',
    }),
    getCircuitBreakerHealth: vi.fn().mockResolvedValue(100),
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('GRPORewardOrchestrator', () => {
  let runner: RewardToolRunner;
  let orchestrator: GRPORewardOrchestrator;

  beforeEach(() => {
    runner = createMockRunner();
    orchestrator = new GRPORewardOrchestrator(runner, {
      cacheEnabled: false, // Disable cache in most tests for predictability
    });
  });

  // ---------------------------------------------------------------------------
  // Constructor validation
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('creates an orchestrator with default weights', () => {
      const orch = new GRPORewardOrchestrator(runner);
      const weights = orch.getWeights();
      expect(weights).toEqual(GRPO_REWARD_WEIGHTS);
    });

    it('accepts custom weights that sum to 1.0', () => {
      const orch = new GRPORewardOrchestrator(runner, {
        weights: {
          testPassReward: 0.50,
          typeCheckReward: 0.20,
          lintReward: 0.10,
          coverageReward: 0.10,
          circuitBreakerReward: 0.10,
        },
      });
      expect(orch.getWeights().testPassReward).toBe(0.50);
    });

    it('throws when weights do not sum to 1.0', () => {
      expect(() => {
        new GRPORewardOrchestrator(runner, {
          weights: {
            testPassReward: 0.50,
            typeCheckReward: 0.50,
            lintReward: 0.50,
            coverageReward: 0.50,
            circuitBreakerReward: 0.50,
          },
        });
      }).toThrow('must sum to 1.0');
    });
  });

  // ---------------------------------------------------------------------------
  // evaluate()
  // ---------------------------------------------------------------------------

  describe('evaluate', () => {
    it('returns composite rewards for a batch', async () => {
      const result = await orchestrator.evaluate(['code1', 'code2']);

      expect(result.compositeRewards).toHaveLength(2);
      expect(result.batchSize).toBe(2);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('computes correct composite reward with perfect scores', async () => {
      // All functions return perfect scores:
      // testPass=1.0, typeCheck=1.0, lint=1.0, coverage=0.8 (from mock), cb=1.0
      const result = await orchestrator.evaluate(['code']);

      // Expected composite:
      // 1.0 * 0.40 + 1.0 * 0.20 + 1.0 * 0.15 + 0.8 * 0.15 + 1.0 * 0.10
      // = 0.40 + 0.20 + 0.15 + 0.12 + 0.10 = 0.97
      expect(result.compositeRewards[0]).toBeCloseTo(0.97, 2);
    });

    it('computes correct composite reward with failing type check', async () => {
      vi.mocked(runner.runTypeCheck).mockResolvedValue({
        passed: false,
        output: 'Type error',
      });

      const result = await orchestrator.evaluate(['code']);

      // typeCheck = 0.0, others remain
      // 1.0 * 0.40 + 0.0 * 0.20 + 1.0 * 0.15 + 0.8 * 0.15 + 1.0 * 0.10
      // = 0.40 + 0.00 + 0.15 + 0.12 + 0.10 = 0.77
      expect(result.compositeRewards[0]).toBeCloseTo(0.77, 2);
    });

    it('returns 5 function results', async () => {
      const result = await orchestrator.evaluate(['code']);

      expect(result.functionResults).toHaveLength(5);
      const names = result.functionResults.map((fr) => fr.name);
      expect(names).toContain('testPassReward');
      expect(names).toContain('typeCheckReward');
      expect(names).toContain('lintReward');
      expect(names).toContain('coverageReward');
      expect(names).toContain('circuitBreakerReward');
    });

    it('each function result has correct structure', async () => {
      const result = await orchestrator.evaluate(['a', 'b']);

      for (const fr of result.functionResults) {
        expect(fr.name).toBeTypeOf('string');
        expect(fr.weight).toBeTypeOf('number');
        expect(fr.rewards).toHaveLength(2);
        expect(fr.weightedRewards).toHaveLength(2);
        expect(fr.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('weighted rewards = raw rewards * weight', async () => {
      const result = await orchestrator.evaluate(['code']);

      for (const fr of result.functionResults) {
        for (let i = 0; i < fr.rewards.length; i++) {
          expect(fr.weightedRewards[i]).toBeCloseTo(
            fr.rewards[i] * fr.weight,
            4,
          );
        }
      }
    });

    it('composite reward is clamped to [0, 1]', async () => {
      const result = await orchestrator.evaluate(['code']);

      for (const reward of result.compositeRewards) {
        expect(reward).toBeGreaterThanOrEqual(0);
        expect(reward).toBeLessThanOrEqual(1);
      }
    });

    it('handles empty completions array', async () => {
      const result = await orchestrator.evaluate([]);

      expect(result.compositeRewards).toHaveLength(0);
      expect(result.batchSize).toBe(0);
    });

    it('handles all reward functions failing gracefully', async () => {
      runner = createMockRunner({
        runVitest: vi.fn().mockRejectedValue(new Error('vitest crash')),
        runTypeCheck: vi.fn().mockRejectedValue(new Error('tsc crash')),
        runLint: vi.fn().mockRejectedValue(new Error('eslint crash')),
        getCircuitBreakerHealth: vi.fn().mockRejectedValue(new Error('CB crash')),
      });
      orchestrator = new GRPORewardOrchestrator(runner, { cacheEnabled: false });

      const result = await orchestrator.evaluate(['code']);

      // All rewards should be 0 except circuit breaker which falls back to 1.0
      expect(result.compositeRewards[0]).toBeGreaterThanOrEqual(0);
      expect(result.compositeRewards[0]).toBeLessThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Parallel vs Sequential
  // ---------------------------------------------------------------------------

  describe('parallel execution', () => {
    it('runs reward functions in parallel by default', async () => {
      const callOrder: string[] = [];

      vi.mocked(runner.runVitest).mockImplementation(async () => {
        callOrder.push('vitest');
        return { passed: 5, total: 5, coveragePercent: 80, output: '' };
      });
      vi.mocked(runner.runTypeCheck).mockImplementation(async () => {
        callOrder.push('typecheck');
        return { passed: true, output: '' };
      });
      vi.mocked(runner.runLint).mockImplementation(async () => {
        callOrder.push('lint');
        return { issueCount: 0, output: '' };
      });

      orchestrator = new GRPORewardOrchestrator(runner, {
        parallel: true,
        cacheEnabled: false,
      });

      await orchestrator.evaluate(['code']);

      // All functions should have been called
      expect(callOrder).toContain('vitest');
      expect(callOrder).toContain('typecheck');
      expect(callOrder).toContain('lint');
    });

    it('runs reward functions sequentially when parallel is false', async () => {
      orchestrator = new GRPORewardOrchestrator(runner, {
        parallel: false,
        cacheEnabled: false,
      });

      const result = await orchestrator.evaluate(['code']);
      expect(result.compositeRewards).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Caching
  // ---------------------------------------------------------------------------

  describe('caching', () => {
    it('caches results for identical completions', async () => {
      orchestrator = new GRPORewardOrchestrator(runner, {
        cacheEnabled: true,
      });

      // First evaluation
      const result1 = await orchestrator.evaluate(['code']);
      expect(result1.cacheHits).toBe(0);

      // Reset mock call counts
      vi.mocked(runner.runVitest).mockClear();
      vi.mocked(runner.runTypeCheck).mockClear();

      // Second evaluation with same completion
      const result2 = await orchestrator.evaluate(['code']);
      expect(result2.cacheHits).toBe(1);
      expect(result2.compositeRewards[0]).toBe(result1.compositeRewards[0]);

      // Tool runners should not have been called again for cached result
      expect(runner.runVitest).not.toHaveBeenCalled();
    });

    it('does not cache when cacheEnabled is false', async () => {
      orchestrator = new GRPORewardOrchestrator(runner, {
        cacheEnabled: false,
      });

      await orchestrator.evaluate(['code']);
      const result2 = await orchestrator.evaluate(['code']);

      expect(result2.cacheHits).toBe(0);
    });

    it('evicts oldest entries when cache is full', async () => {
      orchestrator = new GRPORewardOrchestrator(runner, {
        cacheEnabled: true,
        maxCacheSize: 2,
      });

      await orchestrator.evaluate(['code1']);
      await orchestrator.evaluate(['code2']);
      await orchestrator.evaluate(['code3']); // Should evict 'code1'

      // Clear mocks to test
      vi.mocked(runner.runVitest).mockClear();

      // code1 should be evicted
      const result = await orchestrator.evaluate(['code1']);
      expect(result.cacheHits).toBe(0);
    });

    it('clearCache removes all cached results', async () => {
      orchestrator = new GRPORewardOrchestrator(runner, {
        cacheEnabled: true,
      });

      await orchestrator.evaluate(['code']);
      orchestrator.clearCache();

      vi.mocked(runner.runVitest).mockClear();

      const result = await orchestrator.evaluate(['code']);
      expect(result.cacheHits).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  describe('statistics', () => {
    it('tracks batch count', async () => {
      await orchestrator.evaluate(['a']);
      await orchestrator.evaluate(['b']);
      await orchestrator.evaluate(['c']);

      const stats = orchestrator.getStats();
      expect(stats.totalBatches).toBe(3);
      expect(stats.totalCompletions).toBe(3);
    });

    it('tracks per-function statistics', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 8,
        total: 10,
        coveragePercent: 70,
        output: '',
      });

      await orchestrator.evaluate(['a', 'b', 'c']);

      const stats = orchestrator.getStats();
      const testStats = stats.perFunction['testPassReward'];

      expect(testStats.count).toBe(3);
      expect(testStats.mean).toBeCloseTo(0.8, 2);
      expect(testStats.min).toBeCloseTo(0.8, 2);
      expect(testStats.max).toBeCloseTo(0.8, 2);
    });

    it('computes correct standard deviation across batches', async () => {
      // Use two separate batches with different pass rates to produce variance
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 5,
        total: 10,
        coveragePercent: 50,
        output: '',
      });
      await orchestrator.evaluate(['a']);

      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 10,
        total: 10,
        coveragePercent: 100,
        output: '',
      });
      await orchestrator.evaluate(['b']);

      const stats = orchestrator.getStats();
      const testStats = stats.perFunction['testPassReward'];

      expect(testStats.count).toBe(2);
      // Values are 0.5 and 1.0, so std should be > 0
      expect(testStats.std).toBeGreaterThan(0);
    });

    it('tracks composite statistics', async () => {
      await orchestrator.evaluate(['a']);

      const stats = orchestrator.getStats();
      expect(stats.composite.count).toBe(1);
      expect(stats.composite.mean).toBeGreaterThan(0);
    });

    it('tracks cache hit rate', async () => {
      orchestrator = new GRPORewardOrchestrator(runner, {
        cacheEnabled: true,
      });

      await orchestrator.evaluate(['code']);
      await orchestrator.evaluate(['code']); // Cache hit

      const stats = orchestrator.getStats();
      expect(stats.cacheHitRate).toBeGreaterThan(0);
      expect(stats.totalCacheHits).toBe(1);
    });

    it('reset clears all statistics', async () => {
      await orchestrator.evaluate(['a']);
      await orchestrator.evaluate(['b']);

      orchestrator.reset();

      const stats = orchestrator.getStats();
      expect(stats.totalBatches).toBe(0);
      expect(stats.totalCompletions).toBe(0);
      expect(stats.composite.count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getRewardFuncsArray
  // ---------------------------------------------------------------------------

  describe('getRewardFuncsArray', () => {
    it('returns array of 5 functions', () => {
      const fns = orchestrator.getRewardFuncsArray();
      expect(fns).toHaveLength(5);
      for (const fn of fns) {
        expect(fn).toBeTypeOf('function');
      }
    });

    it('each function in array is callable with completions', async () => {
      const fns = orchestrator.getRewardFuncsArray();

      for (const fn of fns) {
        const rewards = await fn(['code']);
        expect(rewards).toHaveLength(1);
        expect(rewards[0]).toBeGreaterThanOrEqual(0);
        expect(rewards[0]).toBeLessThanOrEqual(1);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getWeights
  // ---------------------------------------------------------------------------

  describe('getWeights', () => {
    it('returns a copy of weights (not a reference)', () => {
      const weights = orchestrator.getWeights();
      // Mutating the returned object should not affect the orchestrator
      (weights as Record<string, number>).testPassReward = 999;

      const originalWeights = orchestrator.getWeights();
      expect(originalWeights.testPassReward).not.toBe(999);
    });
  });
});
