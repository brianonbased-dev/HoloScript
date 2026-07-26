/**
 * MCP GRPO Tools for HoloScript
 *
 * Exposes the GRPO self-improvement loop as an MCP tool, enabling AI agents
 * to extract training prompts and score completions through the reward
 * orchestrator pipeline.
 *
 * Tools:
 * - holo_run_grpo_pass: Extract prompts from a file glob via GRPOPromptExtractor,
 *   run reward scoring via GRPORewardOrchestrator, return scored completions.
 *
 * D.012 lights-out improvement depends on this.
 * Source: idea-run-13 Pattern B + packages/absorb-service/src/self-improvement/
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import {
  GRPOPromptExtractor,
  createNodeFS,
  GRPORewardOrchestrator,
  type GRPOOrchestratorConfig,
  type OrchestratorResult,
  type OrchestratorStats,
} from '@holoscript/absorb-service/self-improvement';
import type { RewardFunctionOptions } from '@holoscript/absorb-service/self-improvement';
import { realToolRunner } from '@holoscript/absorb-service/daemon';

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const grpoTools: Tool[] = [
  {
    name: 'holo_run_grpo_pass',
    description:
      'Run a single GRPO training pass: extract prompts from source files, ' +
      'score completions through the 5-dimension reward orchestrator (test pass, ' +
      'type check, lint, coverage, circuit breaker), and return the scored results. ' +
      'The orchestrator uses weighted composite scoring with caching and statistics. ' +
      'Returns per-completion rewards, per-function breakdowns, and aggregate stats. ' +
      'D.012 lights-out improvement depends on this.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the monorepo to scan. Defaults to process.cwd().',
        },
        glob: {
          type: 'string',
          description:
            'File glob pattern to select source files for prompt extraction. ' +
            'Examples: "packages/core/src/**/*.ts", "**/*Solver*.ts". ' +
            'Defaults to all .ts files under rootDir.',
        },
        completions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of completion strings to score. Each completion is evaluated ' +
            'against all 5 reward dimensions. If omitted, only prompt extraction runs.',
        },
        maxPrompts: {
          type: 'number',
          description: 'Maximum number of prompts to extract before stopping. Defaults to 100.',
        },
        maxRougeLSimilarity: {
          type: 'number',
          description:
            'ROUGE-L similarity threshold for deduplication. Prompts above this ' +
            'similarity are merged. Defaults to 0.7.',
        },
        weights: {
          type: 'object',
          description:
            'Custom weights for the 5 reward dimensions. Must sum to 1.0. ' +
            'Defaults: testPassReward=0.40, typeCheckReward=0.20, lintReward=0.15, ' +
            'coverageReward=0.15, circuitBreakerReward=0.10.',
          properties: {
            testPassReward: { type: 'number' },
            typeCheckReward: { type: 'number' },
            lintReward: { type: 'number' },
            coverageReward: { type: 'number' },
            circuitBreakerReward: { type: 'number' },
          },
        },
        parallel: {
          type: 'boolean',
          description: 'Run reward functions in parallel. Defaults to true.',
        },
        batchTimeout: {
          type: 'number',
          description:
            'Global timeout for the entire batch evaluation in milliseconds. Defaults to 120000.',
        },
        perCompletionTimeout: {
          type: 'number',
          description:
            'Per-completion timeout for reward functions in milliseconds. Defaults to 30000.',
        },
        includeStats: {
          type: 'boolean',
          description:
            'Whether to include orchestrator statistics in the response. Defaults to true.',
        },
      },
      required: [],
    },
  },
  {
    name: 'holo_extract_grpo_prompts',
    description:
      'Extract GRPO training prompts from source files without running reward scoring. ' +
      'Scans for 4 prompt sources: task-marker comments (TODO/FIXME/HACK), stub implementations, ' +
      'skipped tests, and low-coverage exports. Returns deduplicated prompts with ' +
      'difficulty estimates, domain tags, and TRL-compatible JSONL records.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the monorepo to scan.',
        },
        glob: {
          type: 'string',
          description: 'File glob pattern to filter source files. Defaults to all .ts files.',
        },
        maxPrompts: {
          type: 'number',
          description: 'Maximum prompts to extract. Defaults to 100.',
        },
        maxRougeLSimilarity: {
          type: 'number',
          description: 'Deduplication threshold. Defaults to 0.7.',
        },
        outputFormat: {
          type: 'string',
          enum: ['full', 'trl'],
          description:
            'Output format. "full" returns GRPOPrompt objects with all metadata. ' +
            '"trl" returns TRL-compatible JSONL records for GRPOTrainer. Defaults to "full".',
        },
      },
      required: ['rootDir'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

export async function handleGrpoTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holo_run_grpo_pass':
      return handleRunGrpoPass(args);
    case 'holo_extract_grpo_prompts':
      return handleExtractGrpoPrompts(args);
    default:
      return null;
  }
}

// =============================================================================
// holo_run_grpo_pass HANDLER
// =============================================================================

async function handleRunGrpoPass(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = (args.rootDir as string) ?? process.cwd();

  if (!fs.existsSync(rootDir)) {
    return { error: `Root directory not found: ${rootDir}` };
  }

  const glob = args.glob as string | undefined;
  const completions = args.completions as string[] | undefined;
  const maxPrompts = (args.maxPrompts as number) ?? 100;
  const maxRougeLSimilarity = (args.maxRougeLSimilarity as number) ?? 0.7;
  const includeStats = (args.includeStats as boolean) ?? true;

  // ---------------------------------------------------------------------------
  // Phase 1: Extract prompts via GRPOPromptExtractor
  // ---------------------------------------------------------------------------
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
  let nodeFS: ReturnType<typeof createNodeFS>;

  try {
    nodeFS = createNodeFS();
    extractor = new GRPOPromptExtractor(extractorConfig, nodeFS);
  } catch (err: unknown) {
    return { error: `Failed to initialize GRPOPromptExtractor: ${errMsg(err)}` };
  }

  let prompts: Awaited<ReturnType<typeof extractor.extract>>;

  try {
    prompts = await extractor.extract();
  } catch (err: unknown) {
    return { error: `Prompt extraction failed: ${errMsg(err)}` };
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Score completions via GRPORewardOrchestrator (if provided)
  // ---------------------------------------------------------------------------
  let orchestratorResult: OrchestratorResult | null = null;
  let orchestratorStats: OrchestratorStats | null = null;

  if (completions && completions.length > 0) {
    // Build orchestrator config from args
    const orchestratorConfig: GRPOOrchestratorConfig = {};
    if (args.weights) {
      orchestratorConfig.weights = args.weights as GRPOOrchestratorConfig['weights'];
    }
    if (args.parallel !== undefined) {
      orchestratorConfig.parallel = args.parallel as boolean;
    }
    if (args.batchTimeout !== undefined) {
      orchestratorConfig.batchTimeout = args.batchTimeout as number;
    }
    if (args.perCompletionTimeout !== undefined) {
      orchestratorConfig.perCompletionTimeout = args.perCompletionTimeout as number;
    }

    try {
      const orchestrator = new GRPORewardOrchestrator(realToolRunner, orchestratorConfig);
      const kwargs: RewardFunctionOptions = {
        workDir: rootDir,
        timeout: orchestratorConfig.perCompletionTimeout ?? 30_000,
      };

      orchestratorResult = await orchestrator.evaluate(completions, kwargs);

      if (includeStats) {
        orchestratorStats = orchestrator.getStats();
      }
    } catch (err: unknown) {
      // Orchestrator failure is non-fatal — return prompts with error note
      return {
        prompts: prompts.prompts.length,
        promptStats: prompts.stats,
        error: `Reward scoring failed: ${errMsg(err)}`,
        completions: completions.length,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 3: Build response
  // ---------------------------------------------------------------------------
  const response: Record<string, unknown> = {
    promptsExtracted: prompts.prompts.length,
    promptsAfterDedup: prompts.stats.totalAfterDedup,
    promptStats: prompts.stats,
  };

  if (orchestratorResult) {
    response.completionsScored = orchestratorResult.batchSize;
    response.compositeRewards = orchestratorResult.compositeRewards;
    response.functionResults = orchestratorResult.functionResults.map((fr) => ({
      name: fr.name,
      weight: fr.weight,
      rewards: fr.rewards,
      weightedRewards: fr.weightedRewards,
      durationMs: fr.durationMs,
    }));
    response.totalDurationMs = orchestratorResult.totalDurationMs;
    response.cacheHits = orchestratorResult.cacheHits;
  }

  if (orchestratorStats) {
    response.stats = orchestratorStats;
  }

  // Return top prompts (limited for readability)
  response.topPrompts = prompts.prompts.slice(0, 20).map((p) => ({
    instruction: p.instruction.slice(0, 200),
    packageName: p.packageName,
    filePath: p.filePath,
    difficulty: p.difficulty,
    source: p.source,
    domainTags: p.domainTags,
    line: p.line,
  }));

  return response;
}

// =============================================================================
// holo_extract_grpo_prompts HANDLER
// =============================================================================

async function handleExtractGrpoPrompts(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;

  if (!rootDir || !fs.existsSync(rootDir)) {
    return { error: `Root directory not found: ${rootDir ?? '(missing)'}` };
  }

  const glob = args.glob as string | undefined;
  const maxPrompts = (args.maxPrompts as number) ?? 100;
  const maxRougeLSimilarity = (args.maxRougeLSimilarity as number) ?? 0.7;
  const outputFormat = (args.outputFormat as string) ?? 'full';

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
    return { error: `Failed to initialize GRPOPromptExtractor: ${errMsg(err)}` };
  }

  let result: Awaited<ReturnType<typeof extractor.extract>>;

  try {
    result = await extractor.extract();
  } catch (err: unknown) {
    return { error: `Prompt extraction failed: ${errMsg(err)}` };
  }

  if (outputFormat === 'trl') {
    return {
      totalExtracted: result.stats.totalExtracted,
      totalAfterDedup: result.stats.totalAfterDedup,
      removedByDedup: result.stats.removedByDedup,
      bySource: result.stats.bySource,
      byDifficulty: result.stats.byDifficulty,
      byDomain: result.stats.byDomain,
      packagesCovered: result.stats.packagesCovered,
      outputFile: result.stats.outputFile,
      records: result.records,
    };
  }

  // Full format: return GRPOPrompt objects with all metadata
  return {
    totalExtracted: result.stats.totalExtracted,
    totalAfterDedup: result.stats.totalAfterDedup,
    removedByDedup: result.stats.removedByDedup,
    bySource: result.stats.bySource,
    byDifficulty: result.stats.byDifficulty,
    byDomain: result.stats.byDomain,
    packagesCovered: result.stats.packagesCovered,
    outputFile: result.stats.outputFile,
    prompts: result.prompts,
  };
}
