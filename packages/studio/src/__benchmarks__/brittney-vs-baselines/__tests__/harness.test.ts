import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  ConfigRunner,
  ConfigRunResult,
  RubricCriterion,
  Task,
} from '../types';
import { CostTracker, costOf } from '../cost-tracker';
import { aggregateByConfig, paretoFrontier, renderParetoMarkdown } from '../pareto';
import { runBenchmark } from '../runner';
import { loadAllTasks, loadQuickSubset } from '../tasks';
import { renderResultsMarkdown, writeResults } from '../reporter';
import { makeBrittneyProd, estimateTokens } from '../configs/brittney-prod';

const FAKE_USAGE = { input_tokens: 1000, output_tokens: 500 };

function makeFakeConfig(
  name: ConfigRunner['name'],
  outputForTask: (task: Task) => string,
  opts: { fail?: boolean; toolRounds?: number } = {}
): ConfigRunner {
  return {
    name,
    async run(task) {
      if (opts.fail) {
        return {
          output_text: '',
          tool_rounds: 0,
          usage: FAKE_USAGE,
          model_id: 'claude-opus-4-7',
          scene_mutations: [],
          error: 'simulated config failure',
        };
      }
      return {
        output_text: outputForTask(task),
        tool_rounds: opts.toolRounds ?? 1,
        usage: FAKE_USAGE,
        model_id: 'claude-opus-4-7',
        scene_mutations: [],
      } satisfies ConfigRunResult;
    },
  };
}

function fakeAnthropicForJudge(
  decision: (taskOutput: string, criteria: RubricCriterion[]) => boolean[]
) {
  return {
    messages: {
      create: vi.fn(async (req: { messages: { content: string }[] }) => {
        const userContent = req.messages[0].content;
        const taskMatch = userContent.match(/CANDIDATE OUTPUT:\n--- BEGIN OUTPUT ---\n([\s\S]*?)\n--- END OUTPUT ---/);
        const candidate = taskMatch?.[1] ?? '';
        const rubricBlock = userContent.split('RUBRIC:\n')[1]?.split('\n\nCANDIDATE')[0] ?? '';
        const idLines = rubricBlock.match(/id=([\w]+)/g) ?? [];
        const criteria: RubricCriterion[] = idLines.map((l) => ({
          id: l.replace('id=', ''),
          description: '',
          required: true,
        }));
        const decisions = decision(candidate, criteria);
        const verdicts = criteria.map((c, i) => ({
          criterion_id: c.id,
          passed: decisions[i] ?? false,
          rationale: 'fake-judge',
        }));
        return {
          content: [
            {
              type: 'tool_use',
              id: 'tu_fake',
              name: 'submit_verdicts',
              input: { verdicts },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 200, output_tokens: 100 },
        };
      }),
    },
  };
}

describe('cost-tracker', () => {
  it('sums standard input + output costs by model pricing', () => {
    const cost = costOf(
      { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      'claude-opus-4-7'
    );
    expect(cost).toBeCloseTo(15 + 75, 5);
  });

  it('respects budget exceeded threshold', () => {
    const tracker = new CostTracker(1.0);
    expect(tracker.exceeded()).toBe(false);
    tracker.add({ input_tokens: 100_000, output_tokens: 100_000 }, 'claude-opus-4-7');
    expect(tracker.used()).toBeCloseTo(15 * 0.1 + 75 * 0.1, 5);
    expect(tracker.exceeded()).toBe(true);
  });

  it('handles cache tokens when present', () => {
    const cost = costOf(
      {
        input_tokens: 1_000_000,
        output_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
      },
      'claude-opus-4-7'
    );
    expect(cost).toBeCloseTo(15 + 18.75 + 1.5, 5);
  });
});

describe('task corpus', () => {
  it('loads exactly 30 tasks across 3 tiers (10 each)', () => {
    const tasks = loadAllTasks();
    expect(tasks.length).toBe(30);
    const byTier = new Map<string, number>();
    for (const t of tasks) byTier.set(t.tier, (byTier.get(t.tier) ?? 0) + 1);
    expect(byTier.get('trivial-scene')).toBe(10);
    expect(byTier.get('multi-object-scene')).toBe(10);
    expect(byTier.get('agentic-multi-step')).toBe(10);
  });

  it('every task has at least one required criterion', () => {
    for (const t of loadAllTasks()) {
      const required = t.evaluation_rubric.filter((c) => c.required);
      expect(required.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('quick subset has one task from each tier', () => {
    const sub = loadQuickSubset();
    expect(sub.length).toBe(3);
    const tiers = new Set(sub.map((t) => t.tier));
    expect(tiers.size).toBe(3);
  });
});

describe('pareto frontier', () => {
  it('keeps only undominated points', () => {
    const aggs = [
      {
        config: 'a' as never,
        trials: 1,
        completion_rate: 0.9,
        mean_cost_usd: 0.1,
        mean_wall_seconds: 1,
        mean_tool_rounds: 1,
        sim_contract_pass_rate: 0,
      },
      {
        config: 'b' as never,
        trials: 1,
        completion_rate: 0.5,
        mean_cost_usd: 0.5,
        mean_wall_seconds: 1,
        mean_tool_rounds: 1,
        sim_contract_pass_rate: 0,
      },
      {
        config: 'c' as never,
        trials: 1,
        completion_rate: 0.95,
        mean_cost_usd: 1.0,
        mean_wall_seconds: 1,
        mean_tool_rounds: 1,
        sim_contract_pass_rate: 0,
      },
    ];
    const front = paretoFrontier(aggs);
    const ids = front.map((a) => a.config);
    expect(ids).toContain('a');
    expect(ids).toContain('c');
    expect(ids).not.toContain('b');
  });

  it('renders markdown without throwing on empty input', () => {
    const md = renderParetoMarkdown([]);
    expect(md).toContain('no aggregates');
  });
});

describe('rubric judge consistency on golden cases', () => {
  it('produces consistent verdicts on golden examples', async () => {
    const goldenPath = path.resolve(__dirname, 'golden', 'golden-judge-cases.json');
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as Array<{
      id: string;
      task_id: string;
      candidate_output: string;
      expected_completion: boolean;
    }>;
    const tasks = loadAllTasks();
    const taskById = new Map(tasks.map((t) => [t.id, t]));

    const fakeAnthropic = fakeAnthropicForJudge((candidate, criteria) => {
      return criteria.map((c) => {
        const desc = c.id.toLowerCase();
        if (desc.includes('count') && /4 white spheres/.test(candidate)) return false;
        if (desc.includes('color') && !/red|blue|green|white|yellow|gray|pink|orange|brown|black/i.test(candidate))
          return false;
        if (desc.includes('color_red') && !/red/i.test(candidate)) return false;
        if (desc.includes('object_is_cube') && !/cube/i.test(candidate)) return false;
        if (desc.includes('single_object') && !/cube/i.test(candidate)) return false;
        if (desc.includes('position_origin') && !/origin|0,\s*0,\s*0|\(0,0,0\)/i.test(candidate))
          return false;
        if (desc.includes('five_spheres') && !/5\s+(?:white\s+)?spheres/i.test(candidate))
          return false;
        if (desc.includes('all_white') && !/white/i.test(candidate)) return false;
        if (desc.includes('x_spacing') && !/\(0,0,0\).*\(1,0,0\).*\(2,0,0\).*\(3,0,0\).*\(4,0,0\)/s.test(candidate))
          return false;
        if (desc.includes('y_z_zero') && !/0,\s*0,\s*0/.test(candidate)) return false;
        return true;
      });
    });

    for (const g of golden) {
      const t = taskById.get(g.task_id)!;
      const { judgeRun, isCompleted } = await import('../judge');
      const res = await judgeRun(t, 'vanilla-baseline', 1, g.candidate_output, {
        client: fakeAnthropic as never,
      });
      const completed = isCompleted(res.verdicts, t.evaluation_rubric);
      expect(completed, `${g.id}: expected ${g.expected_completion}, got ${completed}`).toBe(
        g.expected_completion
      );
    }
  });
});

describe('runner gracefully handles config failures', () => {
  it('records error outcomes without crashing the run, and continues to other cells', async () => {
    const tasks = loadQuickSubset().slice(0, 1);
    const goodConfig = makeFakeConfig('vanilla-baseline', () => 'red cube at origin');
    const badConfig = makeFakeConfig('cursor-baseline', () => '', { fail: true });
    const fakeAnthropic = fakeAnthropicForJudge(() => [true, true, true, true]);

    const run = await runBenchmark({
      configs: [goodConfig, badConfig],
      tasks,
      trialsPerCell: 1,
      budgetUsdMax: 100,
      judgeClient: fakeAnthropic as never,
    });

    expect(run.outcomes).toHaveLength(2);
    const errOutcome = run.outcomes.find((o) => o.config === 'cursor-baseline')!;
    expect(errOutcome.error).toContain('simulated config failure');
    expect(errOutcome.creation_completion).toBe(false);

    const okOutcome = run.outcomes.find((o) => o.config === 'vanilla-baseline')!;
    expect(okOutcome.error).toBeUndefined();
  });

  it('halts when budget is exceeded mid-run', async () => {
    const tasks = loadAllTasks().slice(0, 5);
    const cfg = makeFakeConfig('vanilla-baseline', () => 'output');
    const fakeAnthropic = fakeAnthropicForJudge(() => [true, true, true, true]);

    const run = await runBenchmark({
      configs: [cfg],
      tasks,
      trialsPerCell: 1,
      budgetUsdMax: 0.001,
      judgeClient: fakeAnthropic as never,
    });

    expect(run.outcomes.length).toBeLessThan(5);
    expect(run.budget_usd_used).toBeGreaterThan(run.budget_usd_max);
  });
});

describe('reporter', () => {
  it('writes results.json + results.md to a run dir', async () => {
    const tmp = path.join(__dirname, '.tmp-results');
    fs.rmSync(tmp, { recursive: true, force: true });
    const tasks = loadQuickSubset().slice(0, 1);
    const cfg = makeFakeConfig('vanilla-baseline', () => 'out');
    const fakeAnthropic = fakeAnthropicForJudge(() => [true, true, true, true, true]);
    const run = await runBenchmark({
      configs: [cfg],
      tasks,
      trialsPerCell: 1,
      budgetUsdMax: 100,
      judgeClient: fakeAnthropic as never,
    });
    const { jsonPath, mdPath } = writeResults({ run, outDir: tmp });
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    const md = fs.readFileSync(mdPath, 'utf8');
    expect(md).toContain('# Brittney vs Baselines');
    expect(md).toContain('Pareto frontier');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('renderResultsMarkdown handles empty outcomes', () => {
    const md = renderResultsMarkdown({
      run_id: 'empty',
      started_at: '2026-04-27T00:00:00Z',
      finished_at: '2026-04-27T00:00:00Z',
      configs: [],
      tasks: [],
      trials_per_cell: 1,
      outcomes: [],
      budget_usd_max: 1,
      budget_usd_used: 0,
    });
    expect(md).toContain('Total cells**: 0');
  });
});

describe('brittney-prod SSE parsing + token-usage fallback', () => {
  function makeMockSseFetch(events: Array<{ type: string; payload: unknown }>) {
    return async (_url: string, _init?: RequestInit): Promise<Response> => {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const ev of events) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
          }
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
  }

  it('estimates tokens from char counts when SSE has no usage event', async () => {
    const fetchImpl = makeMockSseFetch([
      { type: 'text', payload: 'I created a red cube at origin.' },
      { type: 'tool_call', payload: { name: 'create_object', arguments: { type: 'cube' } } },
      { type: 'tool_result', payload: { name: 'create_object', success: true } },
      { type: 'done', payload: null },
    ]);
    const cfg = makeBrittneyProd({
      endpoint: 'https://example.test/api/brittney',
      fetchImpl: fetchImpl as never,
    });
    const task: Task = {
      id: 'TX',
      tier: 'trivial-scene',
      prompt: 'Create a red cube at origin.',
      evaluation_rubric: [{ id: 'x', description: 'x', required: true }],
      expected_artifacts: [],
    };
    const result = await cfg.run(task, new AbortController().signal);
    expect(result.usage.input_tokens).toBeGreaterThan(0);
    expect(result.usage.output_tokens).toBeGreaterThan(0);
    expect(result.scene_mutations).toHaveLength(1);
    expect(result.scene_mutations[0].tool_name).toBe('create_object');
    expect(result.tool_rounds).toBe(1);
  });

  it('uses reported usage when SSE emits usage event', async () => {
    const fetchImpl = makeMockSseFetch([
      { type: 'text', payload: 'short' },
      { type: 'usage', payload: { input_tokens: 12345, output_tokens: 6789 } },
      { type: 'done', payload: null },
    ]);
    const cfg = makeBrittneyProd({
      endpoint: 'https://example.test/api/brittney',
      fetchImpl: fetchImpl as never,
    });
    const task: Task = {
      id: 'TX',
      tier: 'trivial-scene',
      prompt: 'short',
      evaluation_rubric: [{ id: 'x', description: 'x', required: true }],
      expected_artifacts: [],
    };
    const result = await cfg.run(task, new AbortController().signal);
    expect(result.usage.input_tokens).toBe(12345);
    expect(result.usage.output_tokens).toBe(6789);
  });

  it('reports http error without throwing', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response('boom', { status: 500 });
    const cfg = makeBrittneyProd({
      endpoint: 'https://example.test/api/brittney',
      fetchImpl: fetchImpl as never,
    });
    const task: Task = {
      id: 'TX',
      tier: 'trivial-scene',
      prompt: 'p',
      evaluation_rubric: [{ id: 'x', description: 'x', required: true }],
      expected_artifacts: [],
    };
    const result = await cfg.run(task, new AbortController().signal);
    expect(result.error).toContain('brittney http 500');
  });

  it('records simContractCheck=passed against the next scene tool_call', async () => {
    const fetchImpl = makeMockSseFetch([
      {
        type: 'simContractCheck',
        payload: {
          passed: true,
          contractId: 'c1',
          mutation: { tool: 'create_object', input: { type: 'cube' } },
        },
      },
      { type: 'tool_call', payload: { name: 'create_object', arguments: { type: 'cube' } } },
      { type: 'tool_result', payload: { name: 'create_object', success: true } },
      { type: 'caelChain', payload: { chainId: 'sess1', fnv1a: 'abc12345' } },
      { type: 'done', payload: null },
    ]);
    const cfg = makeBrittneyProd({
      endpoint: 'https://example.test/api/brittney',
      fetchImpl: fetchImpl as never,
    });
    const task: Task = {
      id: 'TX',
      tier: 'trivial-scene',
      prompt: 'cube',
      evaluation_rubric: [{ id: 'x', description: 'x', required: true }],
      expected_artifacts: [],
    };
    const result = await cfg.run(task, new AbortController().signal);
    expect(result.scene_mutations).toHaveLength(1);
    expect(result.scene_mutations[0].sim_contract_passed).toBe(true);
    expect(result.cael_chain_fnv1a).toBe('abc12345');
  });

  it('records simContractCheck=failed even when no tool_call follows (rejected mutation)', async () => {
    const fetchImpl = makeMockSseFetch([
      {
        type: 'simContractCheck',
        payload: {
          passed: false,
          contractId: 'c1',
          mutation: { tool: 'add_trait', input: { trait: 'rigidbody' } },
          reason: 'trait conflict',
        },
      },
      { type: 'tool_result', payload: { name: 'add_trait', success: false } },
      { type: 'done', payload: null },
    ]);
    const cfg = makeBrittneyProd({
      endpoint: 'https://example.test/api/brittney',
      fetchImpl: fetchImpl as never,
    });
    const task: Task = {
      id: 'TX',
      tier: 'trivial-scene',
      prompt: 'p',
      evaluation_rubric: [{ id: 'x', description: 'x', required: true }],
      expected_artifacts: [],
    };
    const result = await cfg.run(task, new AbortController().signal);
    expect(result.scene_mutations).toHaveLength(1);
    expect(result.scene_mutations[0].sim_contract_passed).toBe(false);
    expect(result.scene_mutations[0].tool_name).toBe('add_trait');
  });

  it('estimateTokens floors at 0 and rounds up', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(-5)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(7)).toBe(2);
    expect(estimateTokens(400)).toBe(100);
  });
});

describe('aggregate-by-config groups outcomes correctly', () => {
  it('computes mean cost and completion rate per config', () => {
    const aggs = aggregateByConfig({
      run_id: 'agg',
      started_at: '',
      finished_at: '',
      configs: ['vanilla-baseline'],
      tasks: ['T01', 'T02'],
      trials_per_cell: 1,
      budget_usd_max: 1,
      budget_usd_used: 0.5,
      outcomes: [
        {
          task_id: 'T01',
          tier: 'trivial-scene',
          config: 'vanilla-baseline',
          trial: 1,
          creation_completion: true,
          sim_contract_pass_rate: 0,
          tool_rounds_to_completion: 0,
          token_cost_usd: 0.2,
          wall_clock_seconds: 1,
          per_criterion: [],
        },
        {
          task_id: 'T02',
          tier: 'trivial-scene',
          config: 'vanilla-baseline',
          trial: 1,
          creation_completion: false,
          sim_contract_pass_rate: 0,
          tool_rounds_to_completion: null,
          token_cost_usd: 0.3,
          wall_clock_seconds: 2,
          per_criterion: [],
        },
      ],
    });
    expect(aggs).toHaveLength(1);
    expect(aggs[0].completion_rate).toBeCloseTo(0.5, 5);
    expect(aggs[0].mean_cost_usd).toBeCloseTo(0.25, 5);
  });
});
