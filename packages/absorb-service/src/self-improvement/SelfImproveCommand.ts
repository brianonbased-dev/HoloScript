/**
 * SelfImproveCommand.ts
 *
 * Orchestrates the autonomous self-improvement loop:
 *
 *   1. **Absorb** -- Scan the codebase to build the knowledge graph
 *   2. **Query** -- Use GraphRAG to find untested / low-coverage code
 *   3. **Generate** -- Produce a test file for the identified target
 *   4. **Test** -- Run `vitest` on the generated test
 *   5. **Commit** -- If the test passes, commit the new test file
 *
 * The loop repeats until convergence is detected (quality score plateaus)
 * or the maximum iteration count is reached.
 *
 * All external side-effects (file I/O, process spawning, git) are injected
 * via the `SelfImproveIO` interface so the command can be unit-tested with
 * pure stubs.
 *
 * @module self-improvement
 */

import type { QualityMetrics, QualityReport } from './QualityScore';
import { calculateQualityScore } from './QualityScore';
import type { ConvergenceConfig, ConvergenceStatus } from './ConvergenceDetector';
import { ConvergenceDetector } from './ConvergenceDetector';

// =============================================================================
// TYPES
// =============================================================================

/** Abstraction over all I/O so the command is testable in isolation */
export interface SelfImproveIO {
  /** Run codebase absorption (scanner + graph build).  Returns file count. */
  absorb(rootDir: string): Promise<AbsorbResult>;

  /** Query GraphRAG for symbols / files that lack test coverage */
  queryUntested(query: string): Promise<UntestedTarget[]>;

  /** Generate a vitest test file for the given target.  Returns file content. */
  generateTest(target: UntestedTarget): Promise<GeneratedTest>;

  /** Write a file to disk */
  writeFile(filePath: string, content: string): Promise<void>;

  /** Run vitest on a specific test file.  Returns pass/fail + metrics. */
  runVitest(testFilePath: string): Promise<VitestResult>;

  /** Run full vitest suite and return aggregate metrics */
  runFullVitest(): Promise<VitestSuiteResult>;

  /** Run TypeScript type-checker.  Returns true if clean. */
  runTypeCheck(): Promise<boolean>;

  /** Run linter.  Returns issue count + files linted. */
  runLint(): Promise<LintResult>;

  /** Get circuit breaker health score (0-100) */
  getCircuitBreakerHealth(): Promise<number>;

  /** Git: stage a file */
  gitAdd(filePath: string): Promise<void>;

  /** Git: commit staged changes */
  gitCommit(message: string): Promise<void>;

  /** Log a message to the user */
  log(level: 'info' | 'warn' | 'error', message: string): void;
}

export interface AbsorbResult {
  filesScanned: number;
  symbolsIndexed: number;
  graphNodes: number;
  graphEdges: number;
}

export interface UntestedTarget {
  /** Fully-qualified symbol name (e.g. "CircuitBreaker.recordFailure") */
  symbolName: string;
  /** Relative file path of the source file */
  filePath: string;
  /** Language of the source file */
  language: string;
  /** GraphRAG relevance score */
  relevanceScore: number;
  /** Brief description from the graph context */
  description: string;
}

export interface GeneratedTest {
  /** Relative path where the test should be written */
  testFilePath: string;
  /** Full test file content */
  content: string;
  /** The target this test covers */
  target: UntestedTarget;
}

export interface VitestResult {
  passed: boolean;
  testsPassed: number;
  testsFailed: number;
  testsTotal: number;
  duration: number;
  error?: string;
}

export interface VitestSuiteResult {
  passed: boolean;
  testsPassed: number;
  testsFailed: number;
  testsTotal: number;
  coveragePercent: number;
  duration: number;
}

export interface LintResult {
  issueCount: number;
  filesLinted: number;
}

// ---------------------------------------------------------------------------
// Command config
// ---------------------------------------------------------------------------

export interface SelfImproveConfig {
  /** Root directory of the project to improve */
  rootDir: string;
  /** Maximum iterations before stopping (default: 20) */
  maxIterations: number;
  /** GraphRAG query to find untested code (default provided) */
  graphRAGQuery: string;
  /** Convergence detector overrides */
  convergence: Partial<ConvergenceConfig>;
  /** Whether to auto-commit passing tests (default: true) */
  autoCommit: boolean;
  /** Whether to run full suite metrics each iteration (default: true) */
  fullSuiteMetrics: boolean;
  /** Maximum consecutive failures before aborting (default: 3) */
  maxConsecutiveFailures: number;
}

const DEFAULT_CONFIG: SelfImproveConfig = {
  rootDir: '.',
  maxIterations: 20,
  graphRAGQuery: 'Find functions and classes that have no test coverage or low test coverage',
  convergence: {},
  autoCommit: true,
  fullSuiteMetrics: true,
  maxConsecutiveFailures: 3,
};

// ---------------------------------------------------------------------------
// Iteration record
// ---------------------------------------------------------------------------

export interface IterationRecord {
  iteration: number;
  target: UntestedTarget | null;
  testGenerated: boolean;
  testPassed: boolean;
  committed: boolean;
  qualityReport: QualityReport | null;
  convergenceStatus: ConvergenceStatus | null;
  error?: string;
  duration: number;
}

/** Final summary after the loop finishes */
export interface SelfImproveResult {
  iterations: IterationRecord[];
  finalQuality: QualityReport | null;
  convergence: ConvergenceStatus | null;
  totalTestsAdded: number;
  totalCommits: number;
  abortReason: 'converged' | 'max_iterations' | 'max_failures' | 'no_targets' | null;
  totalDuration: number;
}

// =============================================================================
// COMMAND
// =============================================================================

export class SelfImproveCommand {
  private config: SelfImproveConfig;
  private io: SelfImproveIO;
  private detector: ConvergenceDetector;
  private iterations: IterationRecord[] = [];
  private consecutiveFailures = 0;
  private testsAdded = 0;
  private commits = 0;
  private running = false;
  private attemptedTargets = new Set<string>();

  constructor(io: SelfImproveIO, config: Partial<SelfImproveConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.io = io;
    this.detector = new ConvergenceDetector(this.config.convergence);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Execute the self-improvement loop.
   *
   * 1. Absorb the codebase
   * 2. Loop:
   *    a. Query GraphRAG for untested code
   *    b. Generate a test
   *    c. Run vitest on the generated test
   *    d. If green, commit
   *    e. Collect quality metrics and check convergence
   * 3. Return summary
   */
  async execute(): Promise<SelfImproveResult> {
    this.running = true;
    const startTime = Date.now();

    this.io.log('info', '=== Self-Improve Pipeline Starting ===');

    // Step 1: Absorb
    this.io.log('info', '[1/2] Absorbing codebase...');
    let absorbResult: AbsorbResult;
    try {
      absorbResult = await this.io.absorb(this.config.rootDir);
      this.io.log(
        'info',
        `Absorbed: ${absorbResult.filesScanned} files, ${absorbResult.symbolsIndexed} symbols, ` +
          `${absorbResult.graphNodes} nodes, ${absorbResult.graphEdges} edges`
      );
    } catch (err) {
      this.io.log('error', `Absorb failed: ${String(err)}`);
      return this.buildResult(startTime, null);
    }

    // Step 2: Collect baseline quality
    this.io.log('info', '[2/2] Collecting baseline quality metrics...');
    const baselineReport = await this.collectQualityReport();
    if (baselineReport) {
      this.detector.record(baselineReport.score);
      this.io.log(
        'info',
        `Baseline quality: ${baselineReport.scorePercent}% (${baselineReport.status})`
      );
    }

    // Main improvement loop
    let abortReason: SelfImproveResult['abortReason'] = null;

    for (let i = 0; i < this.config.maxIterations && this.running; i++) {
      this.io.log('info', `\n--- Iteration ${i + 1}/${this.config.maxIterations} ---`);
      const iterStart = Date.now();
      const record: IterationRecord = {
        iteration: i + 1,
        target: null,
        testGenerated: false,
        testPassed: false,
        committed: false,
        qualityReport: null,
        convergenceStatus: null,
        duration: 0,
      };

      try {
        // 2a. Query for untested code
        this.io.log('info', 'Querying GraphRAG for untested code...');
        const targets = await this.io.queryUntested(this.config.graphRAGQuery);

        if (targets.length === 0) {
          this.io.log('info', 'No more untested targets found. Pipeline complete.');
          record.duration = Date.now() - iterStart;
          this.iterations.push(record);
          abortReason = 'no_targets';
          break;
        }

        // Pick the highest-relevance target that hasn't been attempted this session
        const target = targets.find(
          (t) => !this.attemptedTargets.has(`${t.filePath}:${t.symbolName}`)
        );
        if (!target) {
          this.io.log('info', 'All available targets already attempted this session.');
          record.duration = Date.now() - iterStart;
          this.iterations.push(record);
          abortReason = 'no_targets';
          break;
        }
        this.attemptedTargets.add(`${target.filePath}:${target.symbolName}`);
        record.target = target;
        this.io.log(
          'info',
          `Target: ${target.symbolName} (${target.filePath}) [score: ${target.relevanceScore}]`
        );

        // 2b. Generate test
        this.io.log('info', 'Generating test...');
        const generated = await this.io.generateTest(target);
        record.testGenerated = true;

        // Write the test file
        await this.io.writeFile(generated.testFilePath, generated.content);
        this.io.log('info', `Test written to: ${generated.testFilePath}`);

        // 2c. Run vitest on the generated test
        this.io.log('info', 'Running vitest...');
        const vitestResult = await this.io.runVitest(generated.testFilePath);

        record.testPassed = vitestResult.passed;

        if (vitestResult.passed) {
          this.io.log(
            'info',
            `Tests PASSED (${vitestResult.testsPassed}/${vitestResult.testsTotal}) in ${vitestResult.duration}ms`
          );
          this.consecutiveFailures = 0;
          this.testsAdded++;

          // 2d. Commit if enabled
          if (this.config.autoCommit) {
            this.io.log('info', 'Committing...');
            await this.io.gitAdd(generated.testFilePath);
            await this.io.gitCommit(
              `test(self-improve): add test for ${target.symbolName}\n\n` +
                `Auto-generated by SelfImproveCommand iteration ${i + 1}.\n` +
                `Target: ${target.filePath}\n` +
                `Tests: ${vitestResult.testsPassed}/${vitestResult.testsTotal} passed`
            );
            record.committed = true;
            this.commits++;
          }
        } else {
          this.io.log(
            'warn',
            `Tests FAILED (${vitestResult.testsPassed}/${vitestResult.testsTotal}): ${vitestResult.error ?? 'unknown error'}`
          );
          this.consecutiveFailures++;

          if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
            this.io.log(
              'error',
              `Max consecutive failures (${this.config.maxConsecutiveFailures}) reached. Aborting.`
            );
            record.duration = Date.now() - iterStart;
            this.iterations.push(record);
            abortReason = 'max_failures';
            break;
          }
        }

        // 2e. Collect quality metrics
        if (this.config.fullSuiteMetrics) {
          const report = await this.collectQualityReport();
          record.qualityReport = report;

          if (report) {
            const convergence = this.detector.record(report.score);
            record.convergenceStatus = convergence;

            this.io.log(
              'info',
              `Quality: ${report.scorePercent}% (${report.status}) | ` +
                `Convergence: slope=${convergence.windowSlope}, plateau=${convergence.plateauCount}`
            );

            if (convergence.converged) {
              this.io.log('info', `Convergence detected (${convergence.reason}). Stopping.`);
              record.duration = Date.now() - iterStart;
              this.iterations.push(record);
              abortReason = 'converged';
              break;
            }
          }
        }
      } catch (err) {
        record.error = String(err);
        this.io.log('error', `Iteration ${i + 1} error: ${String(err)}`);
        this.consecutiveFailures++;

        if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
          this.io.log('error', `Max consecutive failures reached. Aborting.`);
          record.duration = Date.now() - iterStart;
          this.iterations.push(record);
          abortReason = 'max_failures';
          break;
        }
      }

      record.duration = Date.now() - iterStart;
      this.iterations.push(record);
    }

    if (!abortReason && this.iterations.length >= this.config.maxIterations) {
      abortReason = 'max_iterations';
    }

    return this.buildResult(startTime, abortReason);
  }

  /**
   * Stop the loop after the current iteration completes.
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Get the convergence detector (for external monitoring).
   */
  getDetector(): ConvergenceDetector {
    return this.detector;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async collectQualityReport(): Promise<QualityReport | null> {
    try {
      const [suiteResult, typeCheckPassed, lintResult, cbHealth] = await Promise.all([
        this.config.fullSuiteMetrics
          ? this.io.runFullVitest()
          : Promise.resolve<VitestSuiteResult>({
              passed: true,
              testsPassed: 0,
              testsFailed: 0,
              testsTotal: 0,
              coveragePercent: 0,
              duration: 0,
            }),
        this.io.runTypeCheck(),
        this.io.runLint(),
        this.io.getCircuitBreakerHealth(),
      ]);

      const metrics: QualityMetrics = {
        testsPassed: suiteResult.testsPassed,
        testsTotal: suiteResult.testsTotal,
        coveragePercent: suiteResult.coveragePercent,
        typeCheckPassed,
        lintIssues: lintResult.issueCount,
        lintFilesTotal: lintResult.filesLinted,
        circuitBreakerHealth: cbHealth,
      };

      return calculateQualityScore(metrics);
    } catch (err) {
      this.io.log('warn', `Failed to collect quality metrics: ${String(err)}`);
      return null;
    }
  }

  private buildResult(
    startTime: number,
    abortReason: SelfImproveResult['abortReason']
  ): SelfImproveResult {
    const lastQuality = this.iterations.filter((r) => r.qualityReport).pop()?.qualityReport ?? null;

    return {
      iterations: [...this.iterations],
      finalQuality: lastQuality,
      convergence: this.detector.getStatus(),
      totalTestsAdded: this.testsAdded,
      totalCommits: this.commits,
      abortReason,
      totalDuration: Date.now() - startTime,
    };
  }
}
