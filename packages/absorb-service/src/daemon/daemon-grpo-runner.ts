/**
 * Daemon GRPO Runner — Bridges GRPORewardOrchestrator into the daemon pipeline.
 *
 * The daemon's existing pipeline (absorb → diagnose → validate) now gains a
 * GRPO scoring sub-phase: after generating completions, the daemon can score
 * them through the 5-dimension reward orchestrator to produce composite
 * rewards for each candidate.
 *
 * D.012 lights-out improvement depends on this wiring.
 * Source: idea-run-13 Pattern B
 *
 * @module daemon
 */

import {
  GRPOPromptExtractor,
  createNodeFS,
  GRPORewardOrchestrator,
  type GRPOOrchestratorConfig,
  type OrchestratorResult,
  type OrchestratorStats,
} from '../self-improvement/index.js';
import type { RewardToolRunner, RewardFunctionOptions } from '../self-improvement/index.js';
import {
  packageProcessFailureOutput,
  resolvePackageBinary,
  resolvePackageEntry,
  runPackageTool,
  type PackageProcessFailure,
} from '../self-improvement/PackageToolRuntime.js';
import { pathToFileURL } from 'url';
import * as path from 'path';
import * as fs from 'fs';

const ownedTempDirs = new Set<string>();

export { resolvePackageBinary };

interface VitestJsonResult {
  numPassedTests?: number;
  numTotalTests?: number;
  coveragePercent?: number;
}

interface CoverageSummary {
  total?: {
    lines?: {
      pct?: number | string;
    };
  };
}

function parseVitestJson(output: string): VitestJsonResult | null {
  const lines = output.trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    const candidate = line.trim();
    if (!candidate.startsWith('{')) continue;

    try {
      const result = JSON.parse(candidate) as VitestJsonResult;
      if (typeof result.numTotalTests === 'number') return result;
    } catch {
      // Keep searching in case diagnostics preceded the JSON reporter output.
    }
  }

  return null;
}

function readCoveragePercent(summaryPath: string): number | undefined {
  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as CoverageSummary;
    const rawPercent = summary.total?.lines?.pct;
    const percent =
      typeof rawPercent === 'number' ? rawPercent : Number.parseFloat(String(rawPercent));
    return Number.isFinite(percent) ? percent : undefined;
  } catch {
    return undefined;
  }
}

function vitestCounts(
  output: string,
  outputLimit: number,
  coveragePercent?: number
): { passed: number; total: number; coveragePercent?: number; output: string } {
  const result = parseVitestJson(output);
  return {
    passed: result?.numPassedTests ?? 0,
    total: result?.numTotalTests ?? 0,
    coveragePercent: result?.coveragePercent ?? coveragePercent,
    output: output.slice(0, outputLimit),
  };
}

function parseEslintIssueCount(output: string): number | null {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start < 0 || end < start) return null;

  try {
    const result = JSON.parse(output.slice(start, end + 1)) as Array<{
      errorCount?: number;
      warningCount?: number;
    }>;
    if (!Array.isArray(result)) return null;
    return result.reduce(
      (count, fileResult) => count + (fileResult.errorCount ?? 0) + (fileResult.warningCount ?? 0),
      0
    );
  } catch {
    return null;
  }
}

// =============================================================================
// TYPES
// =============================================================================

/** Configuration for a GRPO daemon pass */
export interface DaemonGRPOConfig {
  /** Root directory of the monorepo */
  rootDir: string;
  /** File glob to filter source files for prompt extraction */
  glob?: string;
  /** Maximum prompts to extract */
  maxPrompts?: number;
  /** ROUGE-L deduplication threshold */
  maxRougeLSimilarity?: number;
  /** Custom orchestrator weights */
  weights?: GRPOOrchestratorConfig['weights'];
  /** Run reward functions in parallel */
  parallel?: boolean;
  /** Batch timeout in ms */
  batchTimeout?: number;
  /** Per-completion timeout in ms */
  perCompletionTimeout?: number;
}

/** Result of a GRPO daemon pass */
export interface DaemonGRPOResult {
  /** Number of prompts extracted before dedup */
  promptsExtracted: number;
  /** Number of prompts after dedup */
  promptsAfterDedup: number;
  /** Extraction statistics by source */
  bySource: Record<string, number>;
  /** Extraction statistics by difficulty */
  byDifficulty: Record<string, number>;
  /** Extraction statistics by domain */
  byDomain: Record<string, number>;
  /** Packages covered by extraction */
  packagesCovered: string[];
  /** Number of completions scored (0 if no completions provided) */
  completionsScored: number;
  /** Composite rewards per completion (empty if no completions) */
  compositeRewards: number[];
  /** Per-function breakdown (empty if no completions) */
  functionResults: Array<{
    name: string;
    weight: number;
    rewards: number[];
    weightedRewards: number[];
    durationMs: number;
  }>;
  /** Total evaluation duration in ms */
  totalDurationMs: number;
  /** Orchestrator statistics (null if no completions) */
  stats: OrchestratorStats | null;
  /** Error message if extraction or scoring failed */
  error?: string;
}

// =============================================================================
// REAL TOOL RUNNER (reuses same implementation as MCP tool)
// =============================================================================

/**
 * A vitest config injected into the reward temp dir, isolated from whatever
 * package the daemon happens to be running from. Without this, Vitest
 * walks up from the temp dir's cwd and picks up the nearest ancestor
 * vitest.config.ts (e.g. absorb-service's own, which restricts `include` to
 * `src/**` / `src/__tests__/**`) — a completion temp file living outside that
 * tree is invisible to vitest no matter what it's named. This config's
 * permissive `include` matches vitest's own default test-file glob so a
 * `*.test.ts` / `*.spec.ts` completion is always discovered when the CLI is
 * pointed at it via `--config` + `--root` (see realToolRunner.runVitest).
 */
function createEphemeralVitestConfig(coverageDirectory?: string): string {
  const coverageConfig = coverageDirectory
    ? `,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['json-summary'],
      reportsDirectory: ${JSON.stringify(coverageDirectory)},
      reportOnFailure: true,
      allowExternal: true,
    }`
    : '';

  return `export default {
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    passWithNoTests: false${coverageConfig},
  },
};
`;
}

function createEphemeralEslintConfig(): string {
  const parserUrl = pathToFileURL(resolvePackageEntry('@typescript-eslint/parser')).href;
  const pluginUrl = pathToFileURL(resolvePackageEntry('@typescript-eslint/eslint-plugin')).href;

  return `import * as parserNamespace from ${JSON.stringify(parserUrl)};
import * as pluginNamespace from ${JSON.stringify(pluginUrl)};

const parser = parserNamespace.default ?? parserNamespace;
const plugin = pluginNamespace.default ?? pluginNamespace;

export default [{
  files: ['**/*.ts', '**/*.tsx'],
  languageOptions: {
    parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    globals: {
      Buffer: 'readonly',
      console: 'readonly',
      process: 'readonly',
      setInterval: 'readonly',
      setTimeout: 'readonly',
      clearInterval: 'readonly',
      clearTimeout: 'readonly',
      describe: 'readonly',
      it: 'readonly',
      test: 'readonly',
      expect: 'readonly',
      vi: 'readonly',
      beforeEach: 'readonly',
      afterEach: 'readonly',
    },
  },
  plugins: {
    '@typescript-eslint': plugin,
  },
  rules: {
    'no-unreachable': 'error',
    'no-constant-binary-expression': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    }],
  },
}];
`;
}

// Exported (not just module-private) so tests can exercise the REAL
// implementation end-to-end (real vitest subprocess, real temp files)
// instead of re-deriving a second hand-rolled copy that could silently
// diverge from the fix — see GRPORewardFunctions.test.ts's
// 'real (non-mocked) tool runner' suite.
export const realToolRunner: RewardToolRunner = {
  async writeTempFile(
    content: string,
    extension: string,
    options?: { workDir?: string }
  ): Promise<string> {
    if (!/^\.[a-z0-9]+(?:\.[a-z0-9]+)*$/iu.test(extension)) {
      throw new Error(`Invalid GRPO completion extension: ${extension}`);
    }

    const workDir = path.resolve(options?.workDir ?? process.cwd());
    const tmpRoot = path.join(workDir, '.grpo-tmp');
    fs.mkdirSync(tmpRoot, { recursive: true });
    const tmpDir = fs.mkdtempSync(path.join(tmpRoot, `${process.pid}-`));
    ownedTempDirs.add(tmpDir);
    const filePath = path.join(tmpDir, `completion${extension}`);
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return filePath;
    } catch (error) {
      ownedTempDirs.delete(tmpDir);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      try {
        fs.rmdirSync(tmpRoot);
      } catch {
        // Another concurrent reward evaluation may still own this root.
      }
      throw error;
    }
  },

  async deleteTempFile(filePath: string): Promise<void> {
    const dir = path.resolve(path.dirname(filePath));
    if (!ownedTempDirs.has(dir)) return;

    try {
      // Recursive removal (not unlink+rmdir): the vitest run may have left an
      // ephemeral vitest.config.mjs and/or a .vite cache dir alongside the
      // completion file — a plain rmdir would silently no-op on a non-empty
      // dir and leak temp dirs.
      await fs.promises.rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
      ownedTempDirs.delete(dir);
      await fs.promises.rmdir(path.dirname(dir)).catch(() => {});
    } catch {
      // Best effort cleanup
    }
  },

  async runVitest(
    filePath: string,
    options?: { withCoverage?: boolean; timeout?: number }
  ): Promise<{ passed: number; total: number; coveragePercent?: number; output: string }> {
    const timeout = options?.timeout ?? 30_000;
    const workDir = path.dirname(filePath);
    const configPath = path.join(workDir, 'vitest.config.mjs');
    const coverageDirectory = options?.withCoverage
      ? path.join(workDir, 'coverage-report')
      : undefined;
    const coverageSummaryPath = coverageDirectory
      ? path.join(coverageDirectory, 'coverage-summary.json')
      : undefined;
    let executableTestPath = filePath;
    try {
      if (coverageDirectory && !/\.test\.[cm]?[jt]sx?$/u.test(filePath)) {
        executableTestPath = path.join(workDir, 'completion.coverage.test.ts');
        const completionImport = `./${path.basename(filePath).replace(/\\/gu, '/')}`;
        fs.writeFileSync(
          executableTestPath,
          `import ${JSON.stringify(completionImport)};\n`,
          'utf-8'
        );
      }
      fs.writeFileSync(configPath, createEphemeralVitestConfig(coverageDirectory), 'utf-8');
    } catch {
      // Best effort. The explicit config/test paths below fail closed if either
      // artifact could not be created.
    }
    try {
      const { stdout, stderr } = await runPackageTool({
        packageName: 'vitest',
        binaryName: 'vitest',
        args: [
          'run',
          '--reporter=json',
          '--root',
          workDir,
          '--config',
          configPath,
          executableTestPath,
        ],
        cwd: workDir,
        timeout,
        // The logical pnpm path protects ordinary Vitest runs from deep
        // Windows package-scope resolution. Coverage-v8 must instead resolve
        // its peer dependency graph through pnpm's real virtual-store path;
        // preserving symlinks there can bind an incompatible trace-mapping
        // copy and abort before the JSON summary is written.
        preserveSymlinks: !options?.withCoverage,
      });
      return vitestCounts(
        stdout + stderr,
        2000,
        coverageSummaryPath ? readCoveragePercent(coverageSummaryPath) : undefined
      );
    } catch (e: unknown) {
      // `vitest run` exits non-zero whenever ANY test in the file fails —
      // not just on a crash — so this branch is hit for every completion
      // with a partial pass rate. execFile still captures stdout/stderr on a
      // rejected process, and the JSON reporter output has the real counts.
      return vitestCounts(
        packageProcessFailureOutput(e),
        1000,
        coverageSummaryPath ? readCoveragePercent(coverageSummaryPath) : undefined
      );
    }
  },

  async runTypeCheck(
    filePath: string,
    options?: { timeout?: number }
  ): Promise<{ passed: boolean; output: string }> {
    const timeout = options?.timeout ?? 30_000;
    const workDir = path.dirname(filePath);
    try {
      const { stdout, stderr } = await runPackageTool({
        packageName: 'typescript',
        binaryName: 'tsc',
        args: ['--noEmit', '--pretty', 'false', '--skipLibCheck', filePath],
        cwd: workDir,
        timeout,
      });
      return { passed: true, output: (stdout + stderr).slice(0, 2000) };
    } catch (e: unknown) {
      return { passed: false, output: packageProcessFailureOutput(e).slice(0, 2000) };
    }
  },

  async runLint(
    filePath: string,
    options?: { timeout?: number }
  ): Promise<{ issueCount: number; output: string }> {
    const timeout = options?.timeout ?? 30_000;
    const workDir = path.dirname(filePath);
    const configPath = path.join(workDir, 'eslint.config.mjs');
    try {
      fs.writeFileSync(configPath, createEphemeralEslintConfig(), 'utf-8');
      const { stdout, stderr } = await runPackageTool({
        packageName: 'eslint',
        binaryName: 'eslint',
        args: ['--no-config-lookup', '--config', configPath, filePath, '--format', 'json'],
        cwd: workDir,
        timeout,
      });
      const output = stdout + stderr;
      const issueCount = parseEslintIssueCount(stdout);
      const errorCount = (output.match(/^\s*\d+:\d+\s+error\s/gm) ?? []).length;
      const warningCount = (output.match(/^\s*\d+:\d+\s+warning\s/gm) ?? []).length;
      return {
        issueCount: issueCount ?? errorCount + warningCount,
        output: output.slice(0, 2000),
      };
    } catch (e: unknown) {
      const failure = e as PackageProcessFailure;
      const output = packageProcessFailureOutput(e);
      const parsedIssueCount = parseEslintIssueCount(failure.stdout ?? output);
      const errorCount = (output.match(/^\s*\d+:\d+\s+error\s/gm) ?? []).length;
      const warningCount = (output.match(/^\s*\d+:\d+\s+warning\s/gm) ?? []).length;
      return {
        issueCount: parsedIssueCount ?? Math.max(1, errorCount + warningCount),
        output: output.slice(0, 2000),
      };
    }
  },

  async getCircuitBreakerHealth(): Promise<number> {
    return 100; // Default: healthy. Override with real metrics when available.
  },
};

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Run a GRPO pass within the daemon pipeline.
 *
 * Phase 1: Extract prompts from source files via GRPOPromptExtractor.
 * Phase 2 (optional): Score completions via GRPORewardOrchestrator.
 *
 * If no completions are provided, only prompt extraction runs.
 */
export async function runDaemonGRPOPass(
  config: DaemonGRPOConfig,
  completions?: string[]
): Promise<DaemonGRPOResult> {
  const {
    rootDir,
    maxPrompts = 100,
    maxRougeLSimilarity = 0.7,
    weights,
    parallel = true,
    batchTimeout,
    perCompletionTimeout,
  } = config;

  // -------------------------------------------------------------------------
  // Phase 1: Extract prompts
  // -------------------------------------------------------------------------
  const extractorConfig = {
    rootDir,
    maxPrompts,
    maxRougeLSimilarity,
    extensions: ['.ts'] as string[],
    excludeDirs: [
      'node_modules',
      'dist',
      'build',
      '.git',
      'coverage',
      '.stryker-tmp',
      '.turbo',
      '.grpo-tmp',
    ],
  };

  let extractor: GRPOPromptExtractor;
  try {
    const nodeFS = createNodeFS();
    extractor = new GRPOPromptExtractor(extractorConfig, nodeFS);
  } catch (err: unknown) {
    return {
      promptsExtracted: 0,
      promptsAfterDedup: 0,
      bySource: {},
      byDifficulty: {},
      byDomain: {},
      packagesCovered: [],
      completionsScored: 0,
      compositeRewards: [],
      functionResults: [],
      totalDurationMs: 0,
      stats: null,
      error: `GRPOPromptExtractor init failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let extractionResult: Awaited<ReturnType<typeof extractor.extract>>;
  try {
    extractionResult = await extractor.extract();
  } catch (err: unknown) {
    return {
      promptsExtracted: 0,
      promptsAfterDedup: 0,
      bySource: {},
      byDifficulty: {},
      byDomain: {},
      packagesCovered: [],
      completionsScored: 0,
      compositeRewards: [],
      functionResults: [],
      totalDurationMs: 0,
      stats: null,
      error: `Prompt extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // -------------------------------------------------------------------------
  // Phase 2: Score completions (if provided)
  // -------------------------------------------------------------------------
  let orchestratorResult: OrchestratorResult | null = null;
  let orchestratorStats: OrchestratorStats | null = null;
  const totalStart = Date.now();

  if (completions && completions.length > 0) {
    const orchestratorConfig: GRPOOrchestratorConfig = {};
    if (weights) orchestratorConfig.weights = weights;
    if (parallel !== undefined) orchestratorConfig.parallel = parallel;
    if (batchTimeout !== undefined) orchestratorConfig.batchTimeout = batchTimeout;
    if (perCompletionTimeout !== undefined)
      orchestratorConfig.perCompletionTimeout = perCompletionTimeout;

    try {
      const orchestrator = new GRPORewardOrchestrator(realToolRunner, orchestratorConfig);
      const kwargs: RewardFunctionOptions = {
        workDir: rootDir,
        timeout: perCompletionTimeout ?? 30_000,
      };

      orchestratorResult = await orchestrator.evaluate(completions, kwargs);
      orchestratorStats = orchestrator.getStats();
    } catch (err: unknown) {
      // Orchestrator failure — return prompts with error note
      return {
        promptsExtracted: extractionResult.stats.totalExtracted,
        promptsAfterDedup: extractionResult.stats.totalAfterDedup,
        bySource: extractionResult.stats.bySource,
        byDifficulty: extractionResult.stats.byDifficulty,
        byDomain: extractionResult.stats.byDomain,
        packagesCovered: extractionResult.stats.packagesCovered,
        completionsScored: 0,
        compositeRewards: [],
        functionResults: [],
        totalDurationMs: Date.now() - totalStart,
        stats: null,
        error: `Reward scoring failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const totalDurationMs = Date.now() - totalStart;

  return {
    promptsExtracted: extractionResult.stats.totalExtracted,
    promptsAfterDedup: extractionResult.stats.totalAfterDedup,
    bySource: extractionResult.stats.bySource,
    byDifficulty: extractionResult.stats.byDifficulty,
    byDomain: extractionResult.stats.byDomain,
    packagesCovered: extractionResult.stats.packagesCovered,
    completionsScored: orchestratorResult?.batchSize ?? 0,
    compositeRewards: orchestratorResult?.compositeRewards ?? [],
    functionResults:
      orchestratorResult?.functionResults.map((fr) => ({
        name: fr.name,
        weight: fr.weight,
        rewards: fr.rewards,
        weightedRewards: fr.weightedRewards,
        durationMs: fr.durationMs,
      })) ?? [],
    totalDurationMs: orchestratorResult?.totalDurationMs ?? totalDurationMs,
    stats: orchestratorStats,
  };
}
