import Anthropic from '@anthropic-ai/sdk';
import type {
  BenchmarkRun,
  ConfigName,
  ConfigRunner,
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
}

export type ProgressEvent =
  | {
      type: 'cell_start';
      task_id: string;
      config: ConfigName;
      trial: number;
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

        opts.onProgress?.({
          type: 'cell_start',
          task_id: task.id,
          config: config.name,
          trial,
        });

        const wallStart = Date.now();
        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), perRunTimeoutMs);
        let outcome: RunOutcome;
        try {
          const cfgResult = await config.run(task, ac.signal);
          const runCost = costOf(cfgResult.usage, cfgResult.model_id);
          tracker.add(cfgResult.usage, cfgResult.model_id);

          let completion = false;
          let perCriterion: RunOutcome['per_criterion'] = [];

          if (cfgResult.error) {
            perCriterion = task.evaluation_rubric.map((c) => ({
              task_id: task.id,
              config: config.name,
              trial,
              criterion_id: c.id,
              passed: false,
              rationale: `config error: ${cfgResult.error}`,
            }));
          } else {
            const judged = await judgeRun(
              task,
              config.name,
              trial,
              cfgResult.output_text,
              { client: opts.judgeClient, model: judgeModel }
            );
            tracker.add(judged.usage, judgeModel);
            perCriterion = judged.verdicts;
            completion = isCompleted(judged.verdicts, task.evaluation_rubric);
          }

          const mutationCount = cfgResult.scene_mutations.length;
          const passedSc =
            mutationCount === 0
              ? 0
              : cfgResult.scene_mutations.filter((m) => m.sim_contract_passed === true).length /
                mutationCount;

          outcome = {
            task_id: task.id,
            tier: task.tier,
            config: config.name,
            trial,
            creation_completion: completion,
            sim_contract_pass_rate: passedSc,
            tool_rounds_to_completion: completion ? cfgResult.tool_rounds : null,
            token_cost_usd: runCost,
            wall_clock_seconds: (Date.now() - wallStart) / 1000,
            per_criterion: perCriterion,
            error: cfgResult.error,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          outcome = {
            task_id: task.id,
            tier: task.tier,
            config: config.name,
            trial,
            creation_completion: false,
            sim_contract_pass_rate: 0,
            tool_rounds_to_completion: null,
            token_cost_usd: 0,
            wall_clock_seconds: (Date.now() - wallStart) / 1000,
            per_criterion: task.evaluation_rubric.map((c) => ({
              task_id: task.id,
              config: config.name,
              trial,
              criterion_id: c.id,
              passed: false,
              rationale: `harness error: ${msg}`,
            })),
            error: msg,
          };
          opts.onProgress?.({
            type: 'cell_error',
            task_id: task.id,
            config: config.name,
            trial,
            error: msg,
          });
        } finally {
          clearTimeout(timeout);
        }

        outcomes.push(outcome);
        opts.onProgress?.({ type: 'cell_complete', outcome });
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

function makeRunId(isoStarted: string): string {
  return isoStarted.replace(/[-:.]/g, '').slice(0, 15);
}
