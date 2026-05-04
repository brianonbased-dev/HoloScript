import Anthropic from '@anthropic-ai/sdk';
import { OllamaClient } from './lib/ollama-client';
import type {
  BenchmarkRun,
  ConfigName,
  ConfigRunner,
  RubricCriterion,
  RunOutcome,
  Task,
} from './types';
import { CostTracker, costOf } from './cost-tracker';
import { judgeRun, isCompleted } from './judge';

export interface RunnerOptions {
  configs: ConfigRunner[];
  tasks: Task[];
  trialsPerCell: number;
  budgetUsdMax: number;
  judgeClient: Anthropic;
  judgeModel?: string;
  perRunTimeoutMs?: number;
  onProgress?: (event: ProgressEvent) => void;
  /** Optional Ollama client for judge fallback when Anthropic credits are depleted. */
  judgeOllamaClient?: OllamaClient;
  /** If true, attempt one retry with hint injection for cells that fail. */
  retryWithHint?: boolean;
}

export type ProgressEvent =
  | {
      type: 'cell_start';
      task_id: string;
      config: ConfigName;
      trial: number;
      is_retry: boolean;
    }
  | {
      type: 'cell_complete';
      outcome: RunOutcome;
    }
  | {
      type: 'cell_error';
      task_id: string;
      config: ConfigName;
      trial: number;
      error: string;
      is_retry: boolean;
    }
  | {
      type: 'budget_exceeded';
      used_usd: number;
      max_usd: number;
    };

const DEFAULT_TIMEOUT_MS = 120_000;

export async function runBenchmark(opts: RunnerOptions): Promise<BenchmarkRun> {
  const startedAt = new Date().toISOString();
  const tracker = new CostTracker(opts.budgetUsdMax);
  const outcomes: RunOutcome[] = [];
  const judgeModel = opts.judgeModel ?? 'claude-opus-4-7';
  const perRunTimeoutMs = opts.perRunTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (const task of opts.tasks) {
    for (const config of opts.configs) {
      for (let trial = 1; trial <= opts.trialsPerCell; trial++) {
        if (tracker.exceeded()) {
          opts.onProgress?.({
            type: 'budget_exceeded',
            used_usd: tracker.used(),
            max_usd: opts.budgetUsdMax,
          });
          break;
        }

        // Run original attempt
        const original = await executeCell({
          task,
          config,
          trial,
          judgeClient: opts.judgeClient,
          judgeModel,
          judgeOllamaClient: opts.judgeOllamaClient,
          perRunTimeoutMs,
          tracker,
          onProgress: opts.onProgress,
          isRetry: false,
        });
        outcomes.push(original);

        // Retry with hint if the original failed cleanly (no error, not complete)
        if (
          opts.retryWithHint &&
          !original.creation_completion &&
          !original.error &&
          original.per_criterion.length > 0
        ) {
          const failedCriteria = original.per_criterion.filter((v) => !v.passed);
          const requiredFailed = failedCriteria.filter((v) => {
            const criterion = task.evaluation_rubric.find((c) => c.id === v.criterion_id);
            return criterion?.required ?? true;
          });

          if (requiredFailed.length > 0) {
            const hint = buildHint(original.per_criterion, task.evaluation_rubric);
            const hintedTask: Task = {
              ...task,
              prompt: task.prompt + '\n\n' + hint,
            };

            const retry = await executeCell({
              task: hintedTask,
              config,
              trial,
              judgeClient: opts.judgeClient,
              judgeModel,
              judgeOllamaClient: opts.judgeOllamaClient,
              perRunTimeoutMs,
              tracker,
              onProgress: opts.onProgress,
              isRetry: true,
              retryOfTrial: trial,
              hintText: hint,
            });
            outcomes.push(retry);
          }
        }
      }
      if (tracker.exceeded()) break;
    }
    if (tracker.exceeded()) break;
  }

  return {
    run_id: makeRunId(startedAt),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    configs: opts.configs.map((c) => c.name),
    tasks: opts.tasks.map((t) => t.id),
    trials_per_cell: opts.trialsPerCell,
    outcomes,
    budget_usd_max: opts.budgetUsdMax,
    budget_usd_used: tracker.used(),
  };
}

interface ExecuteCellOptions {
  task: Task;
  config: ConfigRunner;
  trial: number;
  judgeClient: Anthropic;
  judgeModel: string;
  judgeOllamaClient?: OllamaClient;
  perRunTimeoutMs: number;
  tracker: CostTracker;
  onProgress?: (event: ProgressEvent) => void;
  isRetry: boolean;
  retryOfTrial?: number;
  hintText?: string;
}

async function executeCell(opts: ExecuteCellOptions): Promise<RunOutcome> {
  opts.onProgress?.({
    type: 'cell_start',
    task_id: opts.task.id,
    config: opts.config.name,
    trial: opts.trial,
    is_retry: opts.isRetry,
  });

  const wallStart = Date.now();
  const ac = new AbortController();
  // Per-config override (e.g. brittney-prod's Ollama-routed slow path
  // needs more headroom than Anthropic-direct configs) takes priority
  // over the runner-level default.
  const cellTimeoutMs = opts.config.perRunTimeoutMs ?? opts.perRunTimeoutMs;
  const timeout = setTimeout(() => ac.abort(), cellTimeoutMs);
  let outcome: RunOutcome;
  try {
    const cfgResult = await opts.config.run(opts.task, ac.signal);
    const runCost = costOf(cfgResult.usage, cfgResult.model_id);
    opts.tracker.add(cfgResult.usage, cfgResult.model_id);

    let completion = false;
    let perCriterion: RunOutcome['per_criterion'] = [];

    if (cfgResult.error) {
      perCriterion = opts.task.evaluation_rubric.map((c) => ({
        task_id: opts.task.id,
        config: opts.config.name,
        trial: opts.trial,
        criterion_id: c.id,
        passed: false,
        rationale: `config error: ${cfgResult.error}`,
      }));
    } else {
      const judged = await judgeRun(
        opts.task,
        opts.config.name,
        opts.trial,
        cfgResult.output_text,
        cfgResult.scene_mutations,
        {
          client: opts.judgeClient,
          model: opts.judgeModel,
          ollamaClient: opts.judgeOllamaClient,
        }
      );
      opts.tracker.add(judged.usage, opts.judgeModel);
      perCriterion = judged.verdicts;
      completion = isCompleted(judged.verdicts, opts.task.evaluation_rubric);
    }

    const mutationCount = cfgResult.scene_mutations.length;
    const passedSc =
      mutationCount === 0
        ? 0
        : cfgResult.scene_mutations.filter((m) => m.sim_contract_passed === true).length /
          mutationCount;

    outcome = {
      task_id: opts.task.id,
      tier: opts.task.tier,
      config: opts.config.name,
      trial: opts.trial,
      creation_completion: completion,
      sim_contract_pass_rate: passedSc,
      tool_rounds_to_completion: completion ? cfgResult.tool_rounds : null,
      token_cost_usd: runCost,
      wall_clock_seconds: (Date.now() - wallStart) / 1000,
      per_criterion: perCriterion,
      error: cfgResult.error,
      create_object_count: cfgResult.create_object_count,
      thinking_content: cfgResult.thinking_content,
      scene_mutations: cfgResult.scene_mutations,
      retry_of_trial: opts.retryOfTrial,
      hint_text: opts.hintText,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    outcome = {
      task_id: opts.task.id,
      tier: opts.task.tier,
      config: opts.config.name,
      trial: opts.trial,
      creation_completion: false,
      sim_contract_pass_rate: 0,
      tool_rounds_to_completion: null,
      token_cost_usd: 0,
      wall_clock_seconds: (Date.now() - wallStart) / 1000,
      per_criterion: opts.task.evaluation_rubric.map((c) => ({
        task_id: opts.task.id,
        config: opts.config.name,
        trial: opts.trial,
        criterion_id: c.id,
        passed: false,
        rationale: `harness error: ${msg}`,
      })),
      error: msg,
      retry_of_trial: opts.retryOfTrial,
      hint_text: opts.hintText,
    };
    opts.onProgress?.({
      type: 'cell_error',
      task_id: opts.task.id,
      config: opts.config.name,
      trial: opts.trial,
      error: msg,
      is_retry: opts.isRetry,
    });
  } finally {
    clearTimeout(timeout);
  }

  opts.onProgress?.({ type: 'cell_complete', outcome });
  return outcome;
}

function buildHint(
  verdicts: RunOutcome['per_criterion'],
  rubric: RubricCriterion[]
): string {
  const failed = verdicts.filter((v) => !v.passed);
  if (failed.length === 0) return '';

  const lines = failed.map((v) => {
    const criterion = rubric.find((c) => c.id === v.criterion_id);
    const label = criterion?.id ?? v.criterion_id;
    return `- ${label}: ${v.rationale}`;
  });

  return [
    '[RETRY HINT]',
    'The previous attempt was evaluated against the rubric and the following criteria were not satisfied:',
    ...lines,
    'Please correct these issues in your next attempt.',
  ].join('\n');
}

function makeRunId(isoStarted: string): string {
  return isoStarted.replace(/[-:.]/g, '').slice(0, 15);
}
