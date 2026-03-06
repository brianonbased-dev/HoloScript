import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RewardToolRunner } from '../GRPORewardFunctions';
import {
  createGRPORewardFunctions,
  GRPO_REWARD_WEIGHTS,
} from '../GRPORewardFunctions';

// =============================================================================
// MOCK TOOL RUNNER
// =============================================================================

function createMockRunner(overrides: Partial<RewardToolRunner> = {}): RewardToolRunner {
  return {
    writeTempFile: vi.fn().mockResolvedValue('/tmp/test-file.ts'),
    deleteTempFile: vi.fn().mockResolvedValue(undefined),
    runVitest: vi.fn().mockResolvedValue({
      passed: 5,
      total: 5,
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

describe('GRPORewardFunctions', () => {
  // ---------------------------------------------------------------------------
  // GRPO_REWARD_WEIGHTS
  // ---------------------------------------------------------------------------

  describe('GRPO_REWARD_WEIGHTS', () => {
    it('weights sum to 1.0', () => {
      const sum =
        GRPO_REWARD_WEIGHTS.testPassReward +
        GRPO_REWARD_WEIGHTS.typeCheckReward +
        GRPO_REWARD_WEIGHTS.lintReward +
        GRPO_REWARD_WEIGHTS.coverageReward +
        GRPO_REWARD_WEIGHTS.circuitBreakerReward;
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('has correct individual weights', () => {
      expect(GRPO_REWARD_WEIGHTS.testPassReward).toBe(0.40);
      expect(GRPO_REWARD_WEIGHTS.typeCheckReward).toBe(0.20);
      expect(GRPO_REWARD_WEIGHTS.lintReward).toBe(0.15);
      expect(GRPO_REWARD_WEIGHTS.coverageReward).toBe(0.15);
      expect(GRPO_REWARD_WEIGHTS.circuitBreakerReward).toBe(0.10);
    });
  });

  // ---------------------------------------------------------------------------
  // createGRPORewardFunctions
  // ---------------------------------------------------------------------------

  describe('createGRPORewardFunctions', () => {
    it('returns all 5 reward functions', () => {
      const runner = createMockRunner();
      const fns = createGRPORewardFunctions(runner);

      expect(fns.testPassReward).toBeTypeOf('function');
      expect(fns.typeCheckReward).toBeTypeOf('function');
      expect(fns.lintReward).toBeTypeOf('function');
      expect(fns.coverageReward).toBeTypeOf('function');
      expect(fns.circuitBreakerReward).toBeTypeOf('function');
    });
  });

  // ---------------------------------------------------------------------------
  // testPassReward
  // ---------------------------------------------------------------------------

  describe('testPassReward', () => {
    let runner: RewardToolRunner;
    let fns: ReturnType<typeof createGRPORewardFunctions>;

    beforeEach(() => {
      runner = createMockRunner();
      fns = createGRPORewardFunctions(runner);
    });

    it('returns pass rate for each completion', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 8,
        total: 10,
        output: '',
      });

      const rewards = await fns.testPassReward(['code1', 'code2']);

      expect(rewards).toHaveLength(2);
      expect(rewards[0]).toBeCloseTo(0.8, 4);
      expect(rewards[1]).toBeCloseTo(0.8, 4);
    });

    it('returns 1.0 when all tests pass', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 10,
        total: 10,
        output: '',
      });

      const rewards = await fns.testPassReward(['code']);
      expect(rewards[0]).toBe(1.0);
    });

    it('returns 0 when all tests fail', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 0,
        total: 10,
        output: '',
      });

      const rewards = await fns.testPassReward(['code']);
      expect(rewards[0]).toBe(0);
    });

    it('returns 0 when there are no tests', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 0,
        total: 0,
        output: '',
      });

      const rewards = await fns.testPassReward(['code']);
      expect(rewards[0]).toBe(0);
    });

    it('returns 0 when vitest throws', async () => {
      vi.mocked(runner.runVitest).mockRejectedValue(new Error('vitest crash'));

      const rewards = await fns.testPassReward(['code']);
      expect(rewards[0]).toBe(0);
    });

    it('writes temp file and cleans up', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 5,
        total: 5,
        output: '',
      });

      await fns.testPassReward(['code'], { cleanup: true });

      expect(runner.writeTempFile).toHaveBeenCalledWith('code', '.ts');
      expect(runner.deleteTempFile).toHaveBeenCalledWith('/tmp/test-file.ts');
    });

    it('does not clean up when cleanup is false', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 5,
        total: 5,
        output: '',
      });

      await fns.testPassReward(['code'], { cleanup: false });

      expect(runner.writeTempFile).toHaveBeenCalled();
      expect(runner.deleteTempFile).not.toHaveBeenCalled();
    });

    it('handles batch of multiple completions', async () => {
      let callCount = 0;
      vi.mocked(runner.runVitest).mockImplementation(async () => {
        callCount++;
        return {
          passed: callCount * 2,
          total: 10,
          output: '',
        };
      });

      const rewards = await fns.testPassReward(['a', 'b', 'c']);

      expect(rewards).toHaveLength(3);
      expect(rewards[0]).toBeCloseTo(0.2, 4);
      expect(rewards[1]).toBeCloseTo(0.4, 4);
      expect(rewards[2]).toBeCloseTo(0.6, 4);
    });

    it('clamps reward to [0, 1]', async () => {
      // Edge case: passed > total (should never happen but be safe)
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 15,
        total: 10,
        output: '',
      });

      const rewards = await fns.testPassReward(['code']);
      expect(rewards[0]).toBeLessThanOrEqual(1.0);
    });
  });

  // ---------------------------------------------------------------------------
  // typeCheckReward
  // ---------------------------------------------------------------------------

  describe('typeCheckReward', () => {
    let runner: RewardToolRunner;
    let fns: ReturnType<typeof createGRPORewardFunctions>;

    beforeEach(() => {
      runner = createMockRunner();
      fns = createGRPORewardFunctions(runner);
    });

    it('returns 1.0 when type check passes', async () => {
      vi.mocked(runner.runTypeCheck).mockResolvedValue({
        passed: true,
        output: '',
      });

      const rewards = await fns.typeCheckReward(['code']);
      expect(rewards[0]).toBe(1.0);
    });

    it('returns 0.0 when type check fails', async () => {
      vi.mocked(runner.runTypeCheck).mockResolvedValue({
        passed: false,
        output: 'Type error at line 5',
      });

      const rewards = await fns.typeCheckReward(['code']);
      expect(rewards[0]).toBe(0.0);
    });

    it('returns 0 when tsc throws', async () => {
      vi.mocked(runner.runTypeCheck).mockRejectedValue(new Error('tsc not found'));

      const rewards = await fns.typeCheckReward(['code']);
      expect(rewards[0]).toBe(0);
    });

    it('is strictly binary with no partial credit', async () => {
      vi.mocked(runner.runTypeCheck)
        .mockResolvedValueOnce({ passed: true, output: '' })
        .mockResolvedValueOnce({ passed: false, output: 'error' });

      const rewards = await fns.typeCheckReward(['good', 'bad']);

      expect(rewards[0]).toBe(1.0);
      expect(rewards[1]).toBe(0.0);
      // No values between 0 and 1
    });
  });

  // ---------------------------------------------------------------------------
  // lintReward
  // ---------------------------------------------------------------------------

  describe('lintReward', () => {
    let runner: RewardToolRunner;
    let fns: ReturnType<typeof createGRPORewardFunctions>;

    beforeEach(() => {
      runner = createMockRunner();
      fns = createGRPORewardFunctions(runner);
    });

    it('returns 1.0 when there are no lint issues', async () => {
      vi.mocked(runner.runLint).mockResolvedValue({
        issueCount: 0,
        output: '',
      });

      const rewards = await fns.lintReward(['code']);
      expect(rewards[0]).toBe(1.0);
    });

    it('returns 0.0 when issues exceed maxLintIssues', async () => {
      vi.mocked(runner.runLint).mockResolvedValue({
        issueCount: 25,
        output: '',
      });

      const rewards = await fns.lintReward(['code'], { maxLintIssues: 20 });
      expect(rewards[0]).toBe(0.0);
    });

    it('returns proportional reward for partial lint issues', async () => {
      vi.mocked(runner.runLint).mockResolvedValue({
        issueCount: 10,
        output: '',
      });

      const rewards = await fns.lintReward(['code'], { maxLintIssues: 20 });
      expect(rewards[0]).toBeCloseTo(0.5, 4);
    });

    it('handles zero maxLintIssues without division error', async () => {
      vi.mocked(runner.runLint).mockResolvedValue({
        issueCount: 5,
        output: '',
      });

      // maxLintIssues=0 should be clamped to max(1, 0) = 1
      const rewards = await fns.lintReward(['code'], { maxLintIssues: 0 });
      expect(rewards[0]).toBeDefined();
      expect(rewards[0]).toBeGreaterThanOrEqual(0);
      expect(rewards[0]).toBeLessThanOrEqual(1);
    });

    it('returns 0 when eslint throws', async () => {
      vi.mocked(runner.runLint).mockRejectedValue(new Error('eslint crash'));

      const rewards = await fns.lintReward(['code']);
      expect(rewards[0]).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // coverageReward
  // ---------------------------------------------------------------------------

  describe('coverageReward', () => {
    let runner: RewardToolRunner;
    let fns: ReturnType<typeof createGRPORewardFunctions>;

    beforeEach(() => {
      runner = createMockRunner();
      fns = createGRPORewardFunctions(runner);
    });

    it('returns coverage/100 as reward', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 5,
        total: 5,
        coveragePercent: 85,
        output: '',
      });

      const rewards = await fns.coverageReward(['code']);
      expect(rewards[0]).toBeCloseTo(0.85, 4);
    });

    it('returns 1.0 for 100% coverage', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 5,
        total: 5,
        coveragePercent: 100,
        output: '',
      });

      const rewards = await fns.coverageReward(['code']);
      expect(rewards[0]).toBe(1.0);
    });

    it('returns 0 for 0% coverage', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 0,
        total: 0,
        coveragePercent: 0,
        output: '',
      });

      const rewards = await fns.coverageReward(['code']);
      expect(rewards[0]).toBe(0);
    });

    it('handles missing coveragePercent gracefully', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 5,
        total: 5,
        output: '',
        // coveragePercent is undefined
      });

      const rewards = await fns.coverageReward(['code']);
      expect(rewards[0]).toBe(0);
    });

    it('calls runVitest with withCoverage: true', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 5,
        total: 5,
        coveragePercent: 50,
        output: '',
      });

      await fns.coverageReward(['code']);

      expect(runner.runVitest).toHaveBeenCalledWith(
        '/tmp/test-file.ts',
        expect.objectContaining({ withCoverage: true }),
      );
    });

    it('clamps coverage above 100 to 1.0', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 5,
        total: 5,
        coveragePercent: 150,
        output: '',
      });

      const rewards = await fns.coverageReward(['code']);
      expect(rewards[0]).toBe(1.0);
    });
  });

  // ---------------------------------------------------------------------------
  // circuitBreakerReward
  // ---------------------------------------------------------------------------

  describe('circuitBreakerReward', () => {
    let runner: RewardToolRunner;
    let fns: ReturnType<typeof createGRPORewardFunctions>;

    beforeEach(() => {
      runner = createMockRunner();
      fns = createGRPORewardFunctions(runner);
    });

    it('returns health/100 for all completions uniformly', async () => {
      vi.mocked(runner.getCircuitBreakerHealth).mockResolvedValue(80);

      const rewards = await fns.circuitBreakerReward(['a', 'b', 'c']);

      expect(rewards).toHaveLength(3);
      expect(rewards[0]).toBeCloseTo(0.8, 4);
      expect(rewards[1]).toBeCloseTo(0.8, 4);
      expect(rewards[2]).toBeCloseTo(0.8, 4);
    });

    it('returns 1.0 for all completions when health is 100', async () => {
      vi.mocked(runner.getCircuitBreakerHealth).mockResolvedValue(100);

      const rewards = await fns.circuitBreakerReward(['a', 'b']);
      expect(rewards).toEqual([1.0, 1.0]);
    });

    it('returns 0 for all completions when health is 0', async () => {
      vi.mocked(runner.getCircuitBreakerHealth).mockResolvedValue(0);

      const rewards = await fns.circuitBreakerReward(['a']);
      expect(rewards[0]).toBe(0);
    });

    it('returns 1.0 for all completions when health check fails', async () => {
      vi.mocked(runner.getCircuitBreakerHealth).mockRejectedValue(
        new Error('CB unavailable'),
      );

      const rewards = await fns.circuitBreakerReward(['a', 'b']);
      expect(rewards).toEqual([1.0, 1.0]);
    });

    it('does not call writeTempFile (system-level metric)', async () => {
      vi.mocked(runner.getCircuitBreakerHealth).mockResolvedValue(90);

      await fns.circuitBreakerReward(['a']);

      expect(runner.writeTempFile).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Timeout handling
  // ---------------------------------------------------------------------------

  describe('timeout handling', () => {
    it('returns 0 when evaluation exceeds timeout', async () => {
      const runner = createMockRunner({
        runVitest: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 10_000)),
        ),
      });
      const fns = createGRPORewardFunctions(runner);

      const rewards = await fns.testPassReward(['code'], { timeout: 50 });

      expect(rewards[0]).toBe(0);
    }, 10_000);
  });

  // ---------------------------------------------------------------------------
  // Empty completions
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty completions array', async () => {
      const runner = createMockRunner();
      const fns = createGRPORewardFunctions(runner);

      const rewards = await fns.testPassReward([]);
      expect(rewards).toEqual([]);
    });

    it('handles empty string completion', async () => {
      const runner = createMockRunner();
      const fns = createGRPORewardFunctions(runner);

      vi.mocked(runner.runVitest).mockResolvedValue({
        passed: 0,
        total: 0,
        output: '',
      });

      const rewards = await fns.testPassReward(['']);
      expect(rewards).toHaveLength(1);
      expect(rewards[0]).toBe(0);
    });
  });
});
