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
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

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
 * package the daemon happens to be running from. Without this, `npx vitest`
 * walks up from the temp dir's cwd and picks up the nearest ancestor
 * vitest.config.ts (e.g. absorb-service's own, which restricts `include` to
 * `src/**` / `src/__tests__/**`) — a completion temp file living outside that
 * tree is invisible to vitest no matter what it's named. This config's
 * permissive `include` matches vitest's own default test-file glob so a
 * `*.test.ts` / `*.spec.ts` completion is always discovered when the CLI is
 * pointed at it via `--config` + `--root` (see realToolRunner.runVitest).
 */
const EPHEMERAL_VITEST_CONFIG = `export default {
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    passWithNoTests: false,
  },
};
`;

// Exported (not just module-private) so tests can exercise the REAL
// implementation end-to-end (real vitest subprocess, real temp files)
// instead of re-deriving a second hand-rolled copy that could silently
// diverge from the fix — see GRPORewardFunctions.test.ts's
// 'real (non-mocked) tool runner' suite.
export const realToolRunner: RewardToolRunner = {
  async writeTempFile(content: string, extension: string): Promise<string> {
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.grpo-tmp-'));
    const filePath = path.join(tmpDir, `completion${extension}`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  },

  async deleteTempFile(filePath: string): Promise<void> {
    try {
      // Recursive removal (not unlink+rmdir): the vitest run may have left an
      // ephemeral vitest.config.mjs and/or a .vite cache dir alongside the
      // completion file — a plain rmdir would silently no-op on a non-empty
      // dir and leak temp dirs.
      const dir = path.dirname(filePath);
      await fs.promises.rm(dir, { recursive: true, force: true });
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
    try {
      fs.writeFileSync(configPath, EPHEMERAL_VITEST_CONFIG, 'utf-8');
    } catch {
      // Best effort — if this fails, fall through to the (broken) ancestor
      // config rather than crash the whole reward evaluation.
    }
    try {
      const cmd = `npx vitest run --reporter=json --root "${workDir}" --config "${configPath}" "${filePath}" 2>&1`;
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: workDir,
        timeout,
        maxBuffer: 5 * 1024 * 1024,
      });
      const output = stdout + stderr;
      const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          return {
            passed: result.numPassedTests ?? 0,
            total: result.numTotalTests ?? 0,
            coveragePercent: result.coveragePercent,
            output: output.slice(0, 2000),
          };
        } catch {
          // JSON parse failed
        }
      }
      return { passed: 0, total: 0, output: output.slice(0, 2000) };
    } catch (e: unknown) {
      // `vitest run` exits non-zero whenever ANY test in the file fails —
      // not just on a crash — so this branch is hit for every completion
      // with a partial pass rate, not only total failures. execAsync still
      // captures stdout/stderr on a rejected exec, and the JSON reporter's
      // output (with the real passed/total counts) is in there; parse it
      // the same way the try branch does instead of discarding it wholesale
      // (which previously collapsed every partial-pass completion to 0/0).
      const execErr = e as { stdout?: string; stderr?: string };
      const output = (execErr.stdout ?? '') + (execErr.stderr ?? '');
      const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          return {
            passed: result.numPassedTests ?? 0,
            total: result.numTotalTests ?? 0,
            coveragePercent: result.coveragePercent,
            output: output.slice(0, 1000),
          };
        } catch {
          // JSON parse failed — fall through to the zeroed result below.
        }
      }
      return { passed: 0, total: 0, output: output.slice(0, 1000) };
    }
  },

  async runTypeCheck(
    filePath: string,
    options?: { timeout?: number }
  ): Promise<{ passed: boolean; output: string }> {
    const timeout = options?.timeout ?? 30_000;
    const workDir = path.dirname(filePath);
    try {
      const { stdout, stderr } = await execAsync(
        `npx tsc --noEmit --pretty false "${filePath}" 2>&1`,
        { cwd: workDir, timeout, maxBuffer: 5 * 1024 * 1024 }
      );
      const output = stdout + stderr;
      const errorCount = (output.match(/error TS\d+/g) ?? []).length;
      return { passed: errorCount === 0, output: output.slice(0, 2000) };
    } catch (e: unknown) {
      const execErr = e as { stdout?: string; stderr?: string };
      const output = (execErr.stdout ?? '') + (execErr.stderr ?? '');
      const errorCount = (output.match(/error TS\d+/g) ?? []).length;
      return { passed: errorCount === 0, output: output.slice(0, 2000) };
    }
  },

  async runLint(
    filePath: string,
    options?: { timeout?: number }
  ): Promise<{ issueCount: number; output: string }> {
    const timeout = options?.timeout ?? 30_000;
    const workDir = path.dirname(filePath);
    try {
      const { stdout, stderr } = await execAsync(`npx eslint "${filePath}" --format json 2>&1`, {
        cwd: workDir,
        timeout,
        maxBuffer: 5 * 1024 * 1024,
      });
      const output = stdout + stderr;
      try {
        const result = JSON.parse(output);
        let issueCount = 0;
        if (Array.isArray(result)) {
          for (const fileResult of result) {
            issueCount += (fileResult.errorCount ?? 0) + (fileResult.warningCount ?? 0);
          }
        }
        return { issueCount, output: output.slice(0, 2000) };
      } catch {
        const errorCount = (output.match(/^\s*\d+:\d+\s+error\s/gm) ?? []).length;
        const warningCount = (output.match(/^\s*\d+:\d+\s+warning\s/gm) ?? []).length;
        return { issueCount: errorCount + warningCount, output: output.slice(0, 2000) };
      }
    } catch (e: unknown) {
      const execErr = e as { stdout?: string; stderr?: string };
      const output = (execErr.stdout ?? '') + (execErr.stderr ?? '');
      const issueCount = (output.match(/^\s*\d+:\d+\s+error\s/gm) ?? []).length;
      return { issueCount, output: output.slice(0, 2000) };
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
