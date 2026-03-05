import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelfImproveCommand } from '../SelfImproveCommand';
import type {
  SelfImproveIO,
  AbsorbResult,
  UntestedTarget,
  GeneratedTest,
  VitestResult,
  VitestSuiteResult,
  LintResult,
} from '../SelfImproveCommand';

// =============================================================================
// Mock IO factory
// =============================================================================

function createMockIO(overrides: Partial<SelfImproveIO> = {}): SelfImproveIO {
  return {
    absorb: vi.fn<(rootDir: string) => Promise<AbsorbResult>>().mockResolvedValue({
      filesScanned: 100,
      symbolsIndexed: 500,
      graphNodes: 500,
      graphEdges: 1200,
    }),

    queryUntested: vi.fn<(query: string) => Promise<UntestedTarget[]>>().mockResolvedValue([
      {
        symbolName: 'CircuitBreaker.recordFailure',
        filePath: 'src/CircuitBreaker.ts',
        language: 'typescript',
        relevanceScore: 0.92,
        description: 'Records a failed request in the circuit breaker',
      },
    ]),

    generateTest: vi.fn<(target: UntestedTarget) => Promise<GeneratedTest>>().mockImplementation(
      async (target) => ({
        testFilePath: `src/__tests__/${target.symbolName.replace(/\./g, '_')}.test.ts`,
        content: `describe('${target.symbolName}', () => { it('works', () => { expect(true).toBe(true); }); });`,
        target,
      }),
    ),

    writeFile: vi.fn<(path: string, content: string) => Promise<void>>().mockResolvedValue(undefined),

    runVitest: vi.fn<(testFilePath: string) => Promise<VitestResult>>().mockResolvedValue({
      passed: true,
      testsPassed: 3,
      testsFailed: 0,
      testsTotal: 3,
      duration: 1500,
    }),

    runFullVitest: vi.fn<() => Promise<VitestSuiteResult>>().mockResolvedValue({
      passed: true,
      testsPassed: 250,
      testsFailed: 2,
      testsTotal: 252,
      coveragePercent: 72,
      duration: 30000,
    }),

    runTypeCheck: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),

    runLint: vi.fn<() => Promise<LintResult>>().mockResolvedValue({
      issueCount: 3,
      filesLinted: 100,
    }),

    getCircuitBreakerHealth: vi.fn<() => Promise<number>>().mockResolvedValue(85),

    gitAdd: vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined),
    gitCommit: vi.fn<(msg: string) => Promise<void>>().mockResolvedValue(undefined),

    log: vi.fn(),

    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('SelfImproveCommand', () => {
  let io: SelfImproveIO;

  beforeEach(() => {
    io = createMockIO();
  });

  // -------------------------------------------------------------------------
  // Basic execution
  // -------------------------------------------------------------------------

  describe('basic execution', () => {
    it('runs absorb then queries for untested code', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 1 });
      await cmd.execute();

      expect(io.absorb).toHaveBeenCalledOnce();
      expect(io.queryUntested).toHaveBeenCalled();
    });

    it('generates a test for the found target', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 1 });
      await cmd.execute();

      expect(io.generateTest).toHaveBeenCalledWith(
        expect.objectContaining({ symbolName: 'CircuitBreaker.recordFailure' }),
      );
    });

    it('writes the generated test file', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 1 });
      await cmd.execute();

      expect(io.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.test.ts'),
        expect.any(String),
      );
    });

    it('runs vitest on the generated test', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 1 });
      await cmd.execute();

      expect(io.runVitest).toHaveBeenCalledWith(
        expect.stringContaining('.test.ts'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Commit behaviour
  // -------------------------------------------------------------------------

  describe('commit behaviour', () => {
    it('commits when test passes and autoCommit is true', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 1, autoCommit: true });
      const result = await cmd.execute();

      expect(io.gitAdd).toHaveBeenCalled();
      expect(io.gitCommit).toHaveBeenCalledWith(
        expect.stringContaining('test(self-improve)'),
      );
      expect(result.totalCommits).toBe(1);
    });

    it('does not commit when autoCommit is false', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 1, autoCommit: false });
      const result = await cmd.execute();

      expect(io.gitAdd).not.toHaveBeenCalled();
      expect(io.gitCommit).not.toHaveBeenCalled();
      expect(result.totalCommits).toBe(0);
    });

    it('does not commit when test fails', async () => {
      io = createMockIO({
        runVitest: vi.fn().mockResolvedValue({
          passed: false,
          testsPassed: 1,
          testsFailed: 2,
          testsTotal: 3,
          duration: 2000,
          error: 'assertion failed',
        }),
      });

      const cmd = new SelfImproveCommand(io, { maxIterations: 1 });
      const result = await cmd.execute();

      expect(io.gitCommit).not.toHaveBeenCalled();
      expect(result.totalCommits).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Quality metrics
  // -------------------------------------------------------------------------

  describe('quality metrics', () => {
    it('collects quality metrics when fullSuiteMetrics is true', async () => {
      const cmd = new SelfImproveCommand(io, {
        maxIterations: 1,
        fullSuiteMetrics: true,
      });
      const result = await cmd.execute();

      expect(io.runFullVitest).toHaveBeenCalled();
      expect(io.runTypeCheck).toHaveBeenCalled();
      expect(io.runLint).toHaveBeenCalled();
      expect(io.getCircuitBreakerHealth).toHaveBeenCalled();
      // Should have a quality report in the iteration
      expect(result.iterations[0].qualityReport).not.toBeNull();
    });

    it('computes correct quality dimensions', async () => {
      const cmd = new SelfImproveCommand(io, {
        maxIterations: 1,
        fullSuiteMetrics: true,
      });
      const result = await cmd.execute();

      const report = result.iterations[0].qualityReport;
      expect(report).not.toBeNull();
      expect(report!.score).toBeGreaterThan(0);
      expect(report!.score).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Abort conditions
  // -------------------------------------------------------------------------

  describe('abort conditions', () => {
    it('stops on no_targets when no untested code found', async () => {
      io = createMockIO({
        queryUntested: vi.fn().mockResolvedValue([]),
      });

      const cmd = new SelfImproveCommand(io, { maxIterations: 10 });
      const result = await cmd.execute();

      expect(result.abortReason).toBe('no_targets');
      expect(result.iterations.length).toBe(1);
    });

    it('stops on max_iterations', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 3 });
      const result = await cmd.execute();

      expect(result.iterations.length).toBe(3);
      expect(result.abortReason).toBe('max_iterations');
    });

    it('stops on max_failures when consecutive tests fail', async () => {
      io = createMockIO({
        runVitest: vi.fn().mockResolvedValue({
          passed: false,
          testsPassed: 0,
          testsFailed: 1,
          testsTotal: 1,
          duration: 500,
          error: 'always fails',
        }),
      });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 10,
        maxConsecutiveFailures: 2,
      });
      const result = await cmd.execute();

      expect(result.abortReason).toBe('max_failures');
      expect(result.iterations.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Convergence detection
  // -------------------------------------------------------------------------

  describe('convergence detection', () => {
    it('stops when convergence is detected', async () => {
      // Return identical metrics every time → quality score will plateau → converge
      io = createMockIO({
        runFullVitest: vi.fn().mockResolvedValue({
          passed: true,
          testsPassed: 200,
          testsFailed: 0,
          testsTotal: 200,
          coveragePercent: 80,
          duration: 5000,
        }),
      });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 20,
        convergence: {
          minIterations: 5,
          windowSize: 5,
          epsilon: 0.01,
          slopeThreshold: 0.005,
          plateauBand: 0.02,
          plateauPatience: 5,
        },
      });

      const result = await cmd.execute();

      // Should converge before 20 iterations because quality is constant
      expect(result.abortReason).toBe('converged');
      expect(result.convergence).not.toBeNull();
      expect(result.convergence!.converged).toBe(true);
    });

    it('exposes the convergence detector', () => {
      const cmd = new SelfImproveCommand(io);
      const det = cmd.getDetector();
      expect(det).toBeDefined();
      expect(det.getHistory()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Stop method
  // -------------------------------------------------------------------------

  describe('stop', () => {
    it('stops the loop after current iteration', async () => {
      let iterCount = 0;
      io = createMockIO({
        runVitest: vi.fn().mockImplementation(async () => {
          iterCount++;
          return {
            passed: true,
            testsPassed: 1,
            testsFailed: 0,
            testsTotal: 1,
            duration: 100,
          };
        }),
      });

      const cmd = new SelfImproveCommand(io, { maxIterations: 100 });

      // Stop after first query callback
      const origQuery = io.queryUntested;
      let callCount = 0;
      (io as any).queryUntested = vi.fn().mockImplementation(async (...args: unknown[]) => {
        callCount++;
        if (callCount >= 2) {
          cmd.stop();
        }
        return (origQuery as Function)(...args);
      });

      const result = await cmd.execute();
      expect(result.iterations.length).toBeLessThan(100);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('handles absorb failure gracefully', async () => {
      io = createMockIO({
        absorb: vi.fn().mockRejectedValue(new Error('scan failed')),
      });

      const cmd = new SelfImproveCommand(io, { maxIterations: 5 });
      const result = await cmd.execute();

      expect(result.iterations.length).toBe(0);
      expect(io.log).toHaveBeenCalledWith('error', expect.stringContaining('Absorb failed'));
    });

    it('handles generateTest errors and continues', async () => {
      let callCount = 0;
      io = createMockIO({
        generateTest: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('generation failed');
          }
          return {
            testFilePath: 'test.ts',
            content: 'test content',
            target: { symbolName: 'X', filePath: 'x.ts', language: 'ts', relevanceScore: 0.5, description: '' },
          };
        }),
      });

      const cmd = new SelfImproveCommand(io, { maxIterations: 2, maxConsecutiveFailures: 5 });
      const result = await cmd.execute();

      // First iteration should have an error but second should succeed
      expect(result.iterations[0].error).toBeDefined();
      expect(result.iterations.length).toBe(2);
    });

    it('handles quality collection failure gracefully', async () => {
      io = createMockIO({
        runFullVitest: vi.fn().mockRejectedValue(new Error('vitest suite crashed')),
      });

      const cmd = new SelfImproveCommand(io, { maxIterations: 1 });
      const result = await cmd.execute();

      // Should still complete the iteration, just with null quality report
      expect(result.iterations.length).toBe(1);
      expect(result.iterations[0].qualityReport).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Result structure
  // -------------------------------------------------------------------------

  describe('result structure', () => {
    it('returns complete result with all fields', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 1 });
      const result = await cmd.execute();

      expect(result).toHaveProperty('iterations');
      expect(result).toHaveProperty('finalQuality');
      expect(result).toHaveProperty('convergence');
      expect(result).toHaveProperty('totalTestsAdded');
      expect(result).toHaveProperty('totalCommits');
      expect(result).toHaveProperty('abortReason');
      expect(result).toHaveProperty('totalDuration');
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('counts tests added correctly', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 3 });
      const result = await cmd.execute();

      expect(result.totalTestsAdded).toBe(3);
    });

    it('iteration records have duration', async () => {
      const cmd = new SelfImproveCommand(io, { maxIterations: 1 });
      const result = await cmd.execute();

      expect(result.iterations[0].duration).toBeGreaterThanOrEqual(0);
    });
  });
});
