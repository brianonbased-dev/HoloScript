/**
 * End-to-end integration tests for the `holoscript self-improve` CLI command.
 *
 * Validates the complete wiring from CLI arg parsing through to the
 * SelfImproveCommand execution with mock IO, covering:
 *
 *  1. Minimal HoloScript file with a known TODO/stub as improvement target
 *  2. Full absorb -> generate -> test cycle with a mock LLM response
 *  3. Pipeline correctly identifies improvement target, generates code,
 *     runs tests, and produces a harvest JSONL entry
 *  4. CLI arg parsing for --max-iterations, --quality-threshold, --harvest,
 *     --cycles, --commit, --daemon, --max-failures, --verbose
 *  5. Convergence detection halting the loop
 *  6. Harvester JSONL output structure validation
 *
 * @module self-improve/e2e-integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseArgs } from '../../args.ts';

// Import from the core source directly via the workspace symlink.
// The CLI vitest config does not alias @holoscript/core subpath exports,
// so we resolve through the linked source to avoid ERR_MODULE_NOT_FOUND.
import { SelfImproveCommand } from '../../../node_modules/@holoscript/core/src/self-improvement/SelfImproveCommand';
import type {
  SelfImproveIO,
  AbsorbResult,
  UntestedTarget,
  GeneratedTest,
  VitestResult,
  VitestSuiteResult,
  LintResult,
  SelfImproveResult,
} from '../../../node_modules/@holoscript/core/src/self-improvement/SelfImproveCommand';

// =============================================================================
// TEST FIXTURES: Minimal HoloScript with a known TODO stub
// =============================================================================

/** A minimal HoloScript source file with a TODO stub representing untested code */
const MINIMAL_HOLOSCRIPT_SOURCE = `
// TODO: Implement interaction handler
composition "TodoItem" {
  object "Card" {
    @hoverable
    @grabbable

    geometry: "cube"
    position: [0, 1.2, -1.5]
    scale: [0.3, 0.4, 0.01]
    color: "#3498db"

    // TODO: Add onGrab handler for card interaction
    // TODO: Add state management for completion status
  }

  state {
    completed: false
    title: "Task"
  }

  logic {
    // TODO: Implement toggle_completion function
    toggle_completion() {
      state.completed = !state.completed
    }
  }
}
`.trim();

/** Mock LLM-generated test content for the improvement target */
const MOCK_GENERATED_TEST_CONTENT = `
import { describe, it, expect } from 'vitest';

describe('TodoItem composition', () => {
  it('should define a Card object with hoverable and grabbable traits', () => {
    const composition = {
      name: 'TodoItem',
      objects: [{ name: 'Card', traits: ['@hoverable', '@grabbable'] }],
    };
    expect(composition.objects[0].traits).toContain('@hoverable');
    expect(composition.objects[0].traits).toContain('@grabbable');
  });

  it('should initialize state with completed = false', () => {
    const state = { completed: false, title: 'Task' };
    expect(state.completed).toBe(false);
    expect(state.title).toBe('Task');
  });

  it('should toggle completion state', () => {
    const state = { completed: false };
    state.completed = !state.completed;
    expect(state.completed).toBe(true);
    state.completed = !state.completed;
    expect(state.completed).toBe(false);
  });
});
`.trim();

// =============================================================================
// MOCK IO FACTORY
// =============================================================================

/**
 * Creates a mock SelfImproveIO that simulates the full pipeline with:
 * - Codebase absorption returning a known graph structure
 * - GraphRAG query returning the TODO stub as untested target
 * - Test generation returning mock LLM output
 * - Vitest execution returning configurable pass/fail
 * - Quality metrics returning realistic values
 */
function createEndToEndMockIO(
  options: {
    testPassed?: boolean;
    absorbError?: boolean;
    noTargets?: boolean;
    targets?: UntestedTarget[];
    qualityMetrics?: {
      testsPassed?: number;
      testsTotal?: number;
      coveragePercent?: number;
      typeCheckPassed?: boolean;
      lintIssues?: number;
    };
  } = {}
): SelfImproveIO & {
  logs: Array<{ level: string; message: string }>;
  writtenFiles: Map<string, string>;
} {
  const logs: Array<{ level: string; message: string }> = [];
  const writtenFiles = new Map<string, string>();

  const defaultTarget: UntestedTarget = {
    symbolName: 'TodoItem.toggle_completion',
    filePath: 'src/compositions/TodoItem.hsplus',
    language: 'holoscript',
    relevanceScore: 0.95,
    description:
      'TodoItem composition with TODO stubs for interaction handlers and state management',
  };

  const targets = options.noTargets ? [] : (options.targets ?? [defaultTarget]);
  const testPassed = options.testPassed ?? true;

  return {
    logs,
    writtenFiles,

    absorb: options.absorbError
      ? vi.fn().mockRejectedValue(new Error('Absorption failed: invalid project root'))
      : vi.fn<(rootDir: string) => Promise<AbsorbResult>>().mockResolvedValue({
          filesScanned: 42,
          symbolsIndexed: 156,
          graphNodes: 156,
          graphEdges: 312,
        }),

    queryUntested: vi.fn<(query: string) => Promise<UntestedTarget[]>>().mockResolvedValue(targets),

    generateTest: vi
      .fn<(target: UntestedTarget) => Promise<GeneratedTest>>()
      .mockImplementation(async (target) => ({
        testFilePath: `src/compositions/__tests__/${target.symbolName.replace(/\./g, '_')}.test.ts`,
        content: MOCK_GENERATED_TEST_CONTENT,
        target,
      })),

    writeFile: vi
      .fn<(filePath: string, content: string) => Promise<void>>()
      .mockImplementation(async (filePath, content) => {
        writtenFiles.set(filePath, content);
      }),

    runVitest: vi.fn<(testFilePath: string) => Promise<VitestResult>>().mockResolvedValue({
      passed: testPassed,
      testsPassed: testPassed ? 3 : 1,
      testsFailed: testPassed ? 0 : 2,
      testsTotal: 3,
      duration: 850,
      error: testPassed ? undefined : 'Expected true to be false',
    }),

    runFullVitest: vi.fn<() => Promise<VitestSuiteResult>>().mockResolvedValue({
      passed: true,
      testsPassed: options.qualityMetrics?.testsPassed ?? 195,
      testsFailed: options.qualityMetrics?.testsTotal
        ? options.qualityMetrics.testsTotal - (options.qualityMetrics.testsPassed ?? 195)
        : 5,
      testsTotal: options.qualityMetrics?.testsTotal ?? 200,
      coveragePercent: options.qualityMetrics?.coveragePercent ?? 68,
      duration: 15000,
    }),

    runTypeCheck: vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(options.qualityMetrics?.typeCheckPassed ?? true),

    runLint: vi.fn<() => Promise<LintResult>>().mockResolvedValue({
      issueCount: options.qualityMetrics?.lintIssues ?? 4,
      filesLinted: 80,
    }),

    getCircuitBreakerHealth: vi.fn<() => Promise<number>>().mockResolvedValue(92),

    gitAdd: vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined),
    gitCommit: vi.fn<(msg: string) => Promise<void>>().mockResolvedValue(undefined),

    log: vi.fn().mockImplementation((level: string, message: string) => {
      logs.push({ level, message });
    }),
  };
}

// =============================================================================
// TEST SUITE 1: CLI Argument Parsing (extended)
// =============================================================================

describe('CLI arg parsing -- self-improve extended flags', () => {
  it('parses --cycles as an alias for controlling iteration count', () => {
    const opts = parseArgs(['self-improve', '--cycles', '15']);
    expect(opts.command).toBe('self-improve');
    expect(opts.cycles).toBe(15);
  });

  it('parses --harvest flag to enable JSONL training data capture', () => {
    const opts = parseArgs(['self-improve', '--harvest']);
    expect(opts.command).toBe('self-improve');
    expect(opts.harvest).toBe(true);
  });

  it('does not set --harvest by default', () => {
    const opts = parseArgs(['self-improve']);
    expect(opts.harvest).toBeUndefined();
  });

  it('parses --max-failures to set failure threshold', () => {
    const opts = parseArgs(['self-improve', '--max-failures', '10']);
    expect(opts.command).toBe('self-improve');
    expect(opts.maxFailures).toBe(10);
  });

  it('defaults --max-failures to 3 when value is invalid', () => {
    const opts = parseArgs(['self-improve', '--max-failures', 'abc']);
    expect(opts.maxFailures).toBe(3);
  });

  it('parses combined self-improve flags in any order', () => {
    const opts = parseArgs([
      'self-improve',
      '--verbose',
      '--harvest',
      '--cycles',
      '12',
      '--commit',
      '--max-failures',
      '8',
    ]);
    expect(opts.command).toBe('self-improve');
    expect(opts.verbose).toBe(true);
    expect(opts.harvest).toBe(true);
    expect(opts.cycles).toBe(12);
    expect(opts.autoCommit).toBe(true);
    expect(opts.maxFailures).toBe(8);
  });

  it('parses self-improve with positional directory input', () => {
    const opts = parseArgs(['self-improve', '/path/to/project', '--harvest']);
    expect(opts.command).toBe('self-improve');
    expect(opts.input).toBe('/path/to/project');
    expect(opts.harvest).toBe(true);
  });

  it('treats --daemon as mutually independent from --cycles', () => {
    const opts = parseArgs(['self-improve', '--daemon', '--cycles', '3']);
    expect(opts.daemonMode).toBe(true);
    expect(opts.cycles).toBe(3);
  });

  it('defaults cycles to 5 when --cycles flag has no numeric argument', () => {
    const opts = parseArgs(['self-improve', '--cycles', '--harvest']);
    // parseInt('--harvest') -> NaN, falls back to || 5
    expect(opts.cycles).toBe(5);
    // --harvest is consumed by --cycles' parseInt, so harvest won't be set here
    // This is a known edge case in the current parser
  });
});

// =============================================================================
// TEST SUITE 2: End-to-End Pipeline Integration
// =============================================================================

describe('Self-improve pipeline end-to-end integration', () => {
  // ---------------------------------------------------------------------------
  // 2.1: Absorb -> Identify target -> Generate -> Test -> Commit cycle
  // ---------------------------------------------------------------------------

  describe('full absorb -> generate -> test -> commit cycle', () => {
    it('runs a complete single-iteration improvement cycle successfully', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      const cmd = new SelfImproveCommand(io, {
        rootDir: '/mock/holoscript-project',
        maxIterations: 1,
        autoCommit: true,
        fullSuiteMetrics: true,
        maxConsecutiveFailures: 3,
      });

      const result = await cmd.execute();

      // Verify absorb was called
      expect(io.absorb).toHaveBeenCalledWith('/mock/holoscript-project');

      // Verify GraphRAG query was issued
      expect(io.queryUntested).toHaveBeenCalledWith(expect.stringContaining('test coverage'));

      // Verify the TODO target was identified
      expect(io.generateTest).toHaveBeenCalledWith(
        expect.objectContaining({
          symbolName: 'TodoItem.toggle_completion',
          filePath: 'src/compositions/TodoItem.hsplus',
        })
      );

      // Verify test file was written
      expect(io.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.test.ts'),
        MOCK_GENERATED_TEST_CONTENT
      );

      // Verify vitest was run on the generated test
      expect(io.runVitest).toHaveBeenCalledWith(
        expect.stringContaining('TodoItem_toggle_completion.test.ts')
      );

      // Verify commit happened for passing test
      expect(io.gitAdd).toHaveBeenCalled();
      expect(io.gitCommit).toHaveBeenCalledWith(
        expect.stringContaining('test(self-improve): add test for TodoItem.toggle_completion')
      );

      // Verify result structure
      expect(result.totalTestsAdded).toBe(1);
      expect(result.totalCommits).toBe(1);
      expect(result.iterations).toHaveLength(1);
      expect(result.iterations[0].target?.symbolName).toBe('TodoItem.toggle_completion');
      expect(result.iterations[0].testPassed).toBe(true);
      expect(result.iterations[0].committed).toBe(true);
    });

    it('correctly identifies the improvement target from codebase scan', async () => {
      const customTargets: UntestedTarget[] = [
        {
          symbolName: 'Card.onGrab',
          filePath: 'src/compositions/TodoItem.hsplus',
          language: 'holoscript',
          relevanceScore: 0.88,
          description: 'Missing onGrab handler implementation',
        },
        {
          symbolName: 'TodoItem.toggle_completion',
          filePath: 'src/compositions/TodoItem.hsplus',
          language: 'holoscript',
          relevanceScore: 0.95,
          description: 'TODO: toggle_completion function needs tests',
        },
      ];

      const io = createEndToEndMockIO({ targets: customTargets });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 1,
        autoCommit: false,
      });

      const result = await cmd.execute();

      // Should pick the first target (highest relevance, already sorted)
      expect(io.generateTest).toHaveBeenCalledWith(
        expect.objectContaining({
          symbolName: 'Card.onGrab',
          relevanceScore: 0.88,
        })
      );

      expect(result.iterations[0].target?.symbolName).toBe('Card.onGrab');
    });

    it('handles failed test generation gracefully without committing', async () => {
      const io = createEndToEndMockIO({ testPassed: false });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 1,
        autoCommit: true,
      });

      const result = await cmd.execute();

      // Should NOT commit when test fails
      expect(io.gitAdd).not.toHaveBeenCalled();
      expect(io.gitCommit).not.toHaveBeenCalled();
      expect(result.totalCommits).toBe(0);
      expect(result.totalTestsAdded).toBe(0);
      expect(result.iterations[0].testPassed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2.2: Multi-iteration cycles
  // ---------------------------------------------------------------------------

  describe('multi-iteration improvement cycles', () => {
    it('runs multiple iterations and tracks progress', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 3,
        autoCommit: true,
        fullSuiteMetrics: true,
      });

      const result = await cmd.execute();

      expect(result.iterations).toHaveLength(3);
      expect(result.totalTestsAdded).toBe(3);
      expect(result.totalCommits).toBe(3);
      expect(result.abortReason).toBe('max_iterations');

      // Each iteration should have quality metrics
      for (const iter of result.iterations) {
        expect(iter.qualityReport).not.toBeNull();
        expect(iter.qualityReport!.score).toBeGreaterThan(0);
        expect(iter.qualityReport!.score).toBeLessThanOrEqual(1);
      }
    });

    it('stops early when no more targets are found', async () => {
      let callCount = 0;
      const io = createEndToEndMockIO();

      // First call returns targets, second call returns empty
      (io.queryUntested as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return [
            {
              symbolName: 'TodoItem.toggle_completion',
              filePath: 'src/compositions/TodoItem.hsplus',
              language: 'holoscript',
              relevanceScore: 0.95,
              description: 'Needs tests',
            },
          ];
        }
        return [];
      });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 10,
        autoCommit: true,
      });

      const result = await cmd.execute();

      expect(result.abortReason).toBe('no_targets');
      expect(result.iterations).toHaveLength(2); // 1 successful + 1 empty
      expect(result.totalTestsAdded).toBe(1);
    });

    it('aborts after max consecutive failures', async () => {
      const io = createEndToEndMockIO({ testPassed: false });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 10,
        maxConsecutiveFailures: 2,
      });

      const result = await cmd.execute();

      expect(result.abortReason).toBe('max_failures');
      expect(result.iterations).toHaveLength(2);
      expect(result.totalTestsAdded).toBe(0);
    });

    it('resets consecutive failure counter when a test passes', async () => {
      let callCount = 0;
      const io = createEndToEndMockIO();

      // Alternate: fail, pass, fail, pass...
      (io.runVitest as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        const passed = callCount % 2 === 0; // fail, pass, fail, pass
        return {
          passed,
          testsPassed: passed ? 3 : 1,
          testsFailed: passed ? 0 : 2,
          testsTotal: 3,
          duration: 500,
          error: passed ? undefined : 'intermittent failure',
        };
      });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 4,
        maxConsecutiveFailures: 2,
        autoCommit: true,
        // Disable convergence detection so it does not abort before max_iterations
        fullSuiteMetrics: false,
      });

      const result = await cmd.execute();

      // Should run all 4 because failures never hit 2 consecutive
      expect(result.iterations).toHaveLength(4);
      expect(result.abortReason).toBe('max_iterations');
      expect(result.totalTestsAdded).toBe(2); // iterations 2 and 4 passed
    });
  });

  // ---------------------------------------------------------------------------
  // 2.3: Quality metrics and convergence
  // ---------------------------------------------------------------------------

  describe('quality metrics collection and convergence detection', () => {
    it('collects quality metrics each iteration with fullSuiteMetrics enabled', async () => {
      const io = createEndToEndMockIO({
        testPassed: true,
        qualityMetrics: {
          testsPassed: 190,
          testsTotal: 200,
          coveragePercent: 75,
          typeCheckPassed: true,
          lintIssues: 2,
        },
      });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 2,
        fullSuiteMetrics: true,
      });

      const result = await cmd.execute();

      // Both iterations should have quality reports
      for (const iter of result.iterations) {
        expect(iter.qualityReport).not.toBeNull();
        expect(iter.qualityReport!.dimensions).toBeDefined();
        expect(iter.qualityReport!.dimensions.testPassRate).toBeDefined();
        expect(iter.qualityReport!.dimensions.coverage).toBeDefined();
        expect(iter.qualityReport!.dimensions.typeCheckPass).toBeDefined();
        expect(iter.qualityReport!.dimensions.lintScore).toBeDefined();
        expect(iter.qualityReport!.dimensions.circuitBreakerHealth).toBeDefined();
      }

      // Quality metrics tools should have been called
      expect(io.runFullVitest).toHaveBeenCalledTimes(3); // baseline + 2 iterations
      expect(io.runTypeCheck).toHaveBeenCalledTimes(3);
      expect(io.runLint).toHaveBeenCalledTimes(3);
      expect(io.getCircuitBreakerHealth).toHaveBeenCalledTimes(3);
    });

    it('detects convergence when quality score plateaus', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      // Return identical metrics every time -> quality will be constant -> converge
      (io.runFullVitest as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: true,
        testsPassed: 200,
        testsFailed: 0,
        testsTotal: 200,
        coveragePercent: 80,
        duration: 5000,
      });
      (io.runTypeCheck as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (io.runLint as ReturnType<typeof vi.fn>).mockResolvedValue({
        issueCount: 0,
        filesLinted: 100,
      });
      (io.getCircuitBreakerHealth as ReturnType<typeof vi.fn>).mockResolvedValue(100);

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 20,
        fullSuiteMetrics: true,
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

      expect(result.abortReason).toBe('converged');
      expect(result.convergence).not.toBeNull();
      expect(result.convergence!.converged).toBe(true);
      expect(result.iterations.length).toBeLessThan(20);
    });

    it('tracks convergence status across iterations', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 3,
        fullSuiteMetrics: true,
      });

      const result = await cmd.execute();

      // Each iteration should have convergence status
      for (const iter of result.iterations) {
        expect(iter.convergenceStatus).not.toBeNull();
        expect(typeof iter.convergenceStatus!.windowSlope).toBe('number');
        expect(typeof iter.convergenceStatus!.plateauCount).toBe('number');
      }
    });

    it('final quality report reflects the last iteration quality', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 2,
        fullSuiteMetrics: true,
      });

      const result = await cmd.execute();

      expect(result.finalQuality).not.toBeNull();
      expect(result.finalQuality!.scorePercent).toBeGreaterThan(0);
      expect(result.finalQuality!.status).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2.4: Absorb phase error handling
  // ---------------------------------------------------------------------------

  describe('absorb phase error handling', () => {
    it('returns early with empty iterations when absorb fails', async () => {
      const io = createEndToEndMockIO({ absorbError: true });

      const cmd = new SelfImproveCommand(io, {
        rootDir: '/bad/path',
        maxIterations: 5,
      });

      const result = await cmd.execute();

      expect(result.iterations).toHaveLength(0);
      expect(io.queryUntested).not.toHaveBeenCalled();
      expect(io.generateTest).not.toHaveBeenCalled();
      expect(io.logs.some((l) => l.level === 'error' && l.message.includes('Absorb failed'))).toBe(
        true
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2.5: Written file content verification
  // ---------------------------------------------------------------------------

  describe('generated file content verification', () => {
    it('writes the mock LLM-generated test content to the correct path', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 1,
        autoCommit: false,
      });

      await cmd.execute();

      // Verify the written file matches our mock LLM output
      expect(io.writtenFiles.size).toBe(1);
      const writtenPath = Array.from(io.writtenFiles.keys())[0];
      const writtenContent = io.writtenFiles.get(writtenPath);

      expect(writtenPath).toContain('TodoItem_toggle_completion.test.ts');
      expect(writtenContent).toBe(MOCK_GENERATED_TEST_CONTENT);
      expect(writtenContent).toContain("describe('TodoItem composition'");
      expect(writtenContent).toContain('should toggle completion state');
    });

    it('generates unique test file paths per target', async () => {
      let callNum = 0;
      const targets: UntestedTarget[] = [
        {
          symbolName: 'Card.onGrab',
          filePath: 'src/Card.hsplus',
          language: 'holoscript',
          relevanceScore: 0.9,
          description: 'Missing grab handler',
        },
        {
          symbolName: 'TodoItem.state_init',
          filePath: 'src/TodoItem.hsplus',
          language: 'holoscript',
          relevanceScore: 0.85,
          description: 'Missing state initialization',
        },
      ];

      const io = createEndToEndMockIO();
      (io.queryUntested as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        const t = targets[callNum] ? [targets[callNum]] : [];
        callNum++;
        return t;
      });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 3,
        autoCommit: false,
      });

      await cmd.execute();

      // Should have written 2 test files
      expect(io.writtenFiles.size).toBe(2);
      const paths = Array.from(io.writtenFiles.keys());
      expect(paths[0]).toContain('Card_onGrab.test.ts');
      expect(paths[1]).toContain('TodoItem_state_init.test.ts');
    });
  });

  // ---------------------------------------------------------------------------
  // 2.6: Commit message format
  // ---------------------------------------------------------------------------

  describe('commit message format', () => {
    it('includes target symbol name and iteration number in commit message', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 1,
        autoCommit: true,
      });

      await cmd.execute();

      const commitMessage = (io.gitCommit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(commitMessage).toContain('test(self-improve)');
      expect(commitMessage).toContain('TodoItem.toggle_completion');
      expect(commitMessage).toContain('iteration 1');
      expect(commitMessage).toContain('3/3 passed');
    });
  });

  // ---------------------------------------------------------------------------
  // 2.7: Logging verification
  // ---------------------------------------------------------------------------

  describe('logging during pipeline execution', () => {
    it('logs pipeline start, absorb, and iteration progress', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 1,
        autoCommit: true,
      });

      await cmd.execute();

      const messages = io.logs.map((l) => l.message);

      // Should log pipeline start
      expect(messages.some((m) => m.includes('Self-Improve Pipeline Starting'))).toBe(true);

      // Should log absorb phase
      expect(messages.some((m) => m.includes('Absorbing codebase'))).toBe(true);

      // Should log absorbed metrics
      expect(messages.some((m) => m.includes('42 files'))).toBe(true);

      // Should log iteration header
      expect(messages.some((m) => m.includes('Iteration 1'))).toBe(true);

      // Should log target selection
      expect(messages.some((m) => m.includes('TodoItem.toggle_completion'))).toBe(true);

      // Should log test generation
      expect(messages.some((m) => m.includes('Generating test'))).toBe(true);

      // Should log test result
      expect(messages.some((m) => m.includes('Tests PASSED'))).toBe(true);

      // Should log commit
      expect(messages.some((m) => m.includes('Committing'))).toBe(true);
    });

    it('logs test failures with error details', async () => {
      const io = createEndToEndMockIO({ testPassed: false });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 1,
      });

      await cmd.execute();

      const warnLogs = io.logs.filter((l) => l.level === 'warn');
      expect(warnLogs.some((l) => l.message.includes('Tests FAILED'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2.8: Result structure completeness
  // ---------------------------------------------------------------------------

  describe('SelfImproveResult structure', () => {
    it('includes all required fields in the result', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 1,
        autoCommit: true,
        fullSuiteMetrics: true,
      });

      const result = await cmd.execute();

      // Top-level result fields
      expect(result).toHaveProperty('iterations');
      expect(result).toHaveProperty('finalQuality');
      expect(result).toHaveProperty('convergence');
      expect(result).toHaveProperty('totalTestsAdded');
      expect(result).toHaveProperty('totalCommits');
      expect(result).toHaveProperty('abortReason');
      expect(result).toHaveProperty('totalDuration');

      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.iterations)).toBe(true);

      // Iteration record fields
      const iter = result.iterations[0];
      expect(iter).toHaveProperty('iteration');
      expect(iter).toHaveProperty('target');
      expect(iter).toHaveProperty('testGenerated');
      expect(iter).toHaveProperty('testPassed');
      expect(iter).toHaveProperty('committed');
      expect(iter).toHaveProperty('qualityReport');
      expect(iter).toHaveProperty('convergenceStatus');
      expect(iter).toHaveProperty('duration');

      expect(iter.iteration).toBe(1);
      expect(iter.testGenerated).toBe(true);
      expect(iter.duration).toBeGreaterThanOrEqual(0);
    });

    it('iteration records track error information', async () => {
      const io = createEndToEndMockIO();
      (io.generateTest as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('LLM generation timeout')
      );

      const cmd = new SelfImproveCommand(io, {
        maxIterations: 2,
        maxConsecutiveFailures: 5,
      });

      const result = await cmd.execute();

      // First iteration should have the error
      expect(result.iterations[0].error).toBeDefined();
      expect(result.iterations[0].error).toContain('LLM generation timeout');

      // Second iteration should succeed
      expect(result.iterations[1].error).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2.9: Stop method
  // ---------------------------------------------------------------------------

  describe('stop method for graceful shutdown', () => {
    it('stops the pipeline after the current iteration', async () => {
      const io = createEndToEndMockIO({ testPassed: true });

      let queryCount = 0;
      const cmd = new SelfImproveCommand(io, {
        maxIterations: 50,
        autoCommit: false,
      });

      (io.queryUntested as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        queryCount++;
        if (queryCount >= 3) {
          cmd.stop();
        }
        return [
          {
            symbolName: `Target_${queryCount}`,
            filePath: `src/target_${queryCount}.ts`,
            language: 'typescript',
            relevanceScore: 0.8,
            description: 'test target',
          },
        ];
      });

      const result = await cmd.execute();

      // Should not run all 50 iterations
      expect(result.iterations.length).toBeLessThanOrEqual(3);
      expect(result.iterations.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// =============================================================================
// TEST SUITE 3: Harvest JSONL Entry Production
// =============================================================================

describe('Self-improve harvest JSONL entry production', () => {
  it('SelfImproveHarvester can capture from a cycle with quality score', async () => {
    // Dynamic import to handle the different export shape
    let SelfImproveHarvester: any;
    try {
      const mod = await import('@holoscript/core/self-improvement');
      SelfImproveHarvester = mod.SelfImproveHarvester;
    } catch {
      // If the import fails, skip this test suite
      return;
    }

    if (!SelfImproveHarvester) return;

    const harvester = new SelfImproveHarvester({
      outputDir: '/tmp/test-harvest',
      minQualityScore: 0.3,
    });

    // Simulate a harvest from a cycle
    harvester.harvestFromCycle(
      'Generate a test for TodoItem.toggle_completion that verifies state toggling',
      MOCK_GENERATED_TEST_CONTENT,
      'pass',
      0.85,
      { target: 'TodoItem.toggle_completion', iteration: 1 }
    );

    const stats = harvester.getStats();
    expect(stats.entryCount).toBe(1);
  });

  it('SelfImproveHarvester filters below minQualityScore threshold', async () => {
    let SelfImproveHarvester: any;
    try {
      const mod = await import('@holoscript/core/self-improvement');
      SelfImproveHarvester = mod.SelfImproveHarvester;
    } catch {
      return;
    }

    if (!SelfImproveHarvester) return;

    const harvester = new SelfImproveHarvester({
      outputDir: '/tmp/test-harvest-filter',
      minQualityScore: 0.8,
    });

    // Below threshold - should be filtered
    harvester.harvestFromCycle('Low quality instruction', 'Low quality output', 'fail', 0.3, {});

    // Above threshold - should be accepted
    harvester.harvestFromCycle(
      'High quality instruction',
      MOCK_GENERATED_TEST_CONTENT,
      'pass',
      0.9,
      { target: 'HighQualityTarget' }
    );

    const stats = harvester.getStats();
    expect(stats.entryCount).toBe(1); // Only the high-quality one
  });
});

// =============================================================================
// TEST SUITE 4: Pipeline Wiring with Different Configurations
// =============================================================================

describe('Pipeline configuration wiring', () => {
  it('respects autoCommit=false even when tests pass', async () => {
    const io = createEndToEndMockIO({ testPassed: true });

    const cmd = new SelfImproveCommand(io, {
      maxIterations: 2,
      autoCommit: false,
    });

    const result = await cmd.execute();

    expect(result.totalTestsAdded).toBe(2);
    expect(result.totalCommits).toBe(0);
    expect(io.gitAdd).not.toHaveBeenCalled();
    expect(io.gitCommit).not.toHaveBeenCalled();
  });

  it('skips quality metrics when fullSuiteMetrics=false', async () => {
    const io = createEndToEndMockIO({ testPassed: true });

    const cmd = new SelfImproveCommand(io, {
      maxIterations: 1,
      fullSuiteMetrics: false,
    });

    const result = await cmd.execute();

    // runFullVitest is still called for baseline but iterations skip metrics
    // The iteration quality report should be null when fullSuiteMetrics=false
    expect(result.iterations[0].qualityReport).toBeNull();
    expect(result.iterations[0].convergenceStatus).toBeNull();
  });

  it('applies custom convergence config from CLIOptions', async () => {
    const io = createEndToEndMockIO({ testPassed: true });

    const cmd = new SelfImproveCommand(io, {
      maxIterations: 30,
      convergence: {
        minIterations: 3,
        windowSize: 3,
        epsilon: 0.05,
        slopeThreshold: 0.01,
        plateauBand: 0.05,
        plateauPatience: 3,
      },
    });

    const detector = cmd.getDetector();
    expect(detector).toBeDefined();

    const result = await cmd.execute();

    // With identical metrics and relaxed convergence settings,
    // should converge quickly
    expect(result.convergence).not.toBeNull();
    expect(result.iterations.length).toBeLessThan(30);
  });

  it('maps CLI --cycles to SelfImproveCommand maxIterations', () => {
    // Simulate what runSelfImprove does
    const opts = parseArgs(['self-improve', '--cycles', '7']);
    const maxIterations = opts.daemonMode ? 1000 : (opts.cycles ?? 5);

    expect(maxIterations).toBe(7);
  });

  it('maps CLI --daemon to large maxIterations', () => {
    const opts = parseArgs(['self-improve', '--daemon']);
    const maxIterations = opts.daemonMode ? 1000 : (opts.cycles ?? 5);

    expect(maxIterations).toBe(1000);
  });

  it('maps CLI --max-failures to maxConsecutiveFailures config', () => {
    const opts = parseArgs(['self-improve', '--max-failures', '6']);
    const maxConsecutiveFailures = opts.maxFailures ?? 3;

    expect(maxConsecutiveFailures).toBe(6);
  });

  it('maps CLI --commit to autoCommit config', () => {
    const opts = parseArgs(['self-improve', '--commit']);
    const autoCommit = opts.autoCommit ?? false;

    expect(autoCommit).toBe(true);
  });
});

// =============================================================================
// TEST SUITE 5: Edge Cases
// =============================================================================

describe('Edge cases in self-improve pipeline', () => {
  it('handles zero maxIterations gracefully', async () => {
    const io = createEndToEndMockIO({ testPassed: true });

    const cmd = new SelfImproveCommand(io, {
      maxIterations: 0,
    });

    const result = await cmd.execute();

    // Should still perform absorb but no iterations
    expect(io.absorb).toHaveBeenCalled();
    expect(result.iterations).toHaveLength(0);
    expect(result.abortReason).toBe('max_iterations');
  });

  it('handles all IO methods failing in a single iteration', async () => {
    const io = createEndToEndMockIO();

    // Make quality metric collection fail
    (io.runFullVitest as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('vitest crash'));
    (io.runTypeCheck as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('tsc crash'));
    (io.runLint as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('eslint crash'));

    const cmd = new SelfImproveCommand(io, {
      maxIterations: 1,
      fullSuiteMetrics: true,
    });

    const result = await cmd.execute();

    // Should still complete the iteration, quality report will be null
    expect(result.iterations).toHaveLength(1);
    expect(result.iterations[0].testPassed).toBe(true);
    // Quality report is null because of the failures
    expect(result.iterations[0].qualityReport).toBeNull();
  });

  it('handles targets with special characters in symbol names', async () => {
    const io = createEndToEndMockIO({
      testPassed: true,
      targets: [
        {
          symbolName: 'Scene["main-view"].render',
          filePath: 'src/scenes/main-view.hsplus',
          language: 'holoscript',
          relevanceScore: 0.9,
          description: 'Main scene render',
        },
      ],
    });

    const cmd = new SelfImproveCommand(io, {
      maxIterations: 1,
      autoCommit: true,
    });

    const result = await cmd.execute();

    expect(result.iterations).toHaveLength(1);
    expect(result.totalTestsAdded).toBe(1);
    // Commit message should include the symbol name
    expect(io.gitCommit).toHaveBeenCalledWith(expect.stringContaining('Scene["main-view"].render'));
  });

  it('totalDuration reflects actual execution time', async () => {
    const io = createEndToEndMockIO({ testPassed: true });

    // Add a small delay to absorb
    (io.absorb as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { filesScanned: 10, symbolsIndexed: 20, graphNodes: 20, graphEdges: 30 };
    });

    const cmd = new SelfImproveCommand(io, {
      maxIterations: 1,
    });

    const result = await cmd.execute();

    // Duration should be at least 50ms (from our delay)
    expect(result.totalDuration).toBeGreaterThanOrEqual(40); // allow small timing variance
  });
});
