import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigRunner, ConfigRunResult, RubricCriterion, Task } from '../types';
import { CostTracker, costOf, pricingFor } from '../cost-tracker';
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
        const taskMatch = userContent.match(
          /CANDIDATE OUTPUT:\n--- BEGIN OUTPUT ---\n([\s\S]*?)\n--- END OUTPUT ---/
        );
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
    // Opus 4.7 is $5/$25 per MTok. It was listed at $15/$75 until 2026-08-03
    // — Claude 3 Opus rates, a full generation stale and 3x too high.
    const cost = costOf({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, 'claude-opus-4-7');
    expect(cost).toBeCloseTo(5 + 25, 5);
  });

  it('respects budget exceeded threshold', () => {
    const tracker = new CostTracker(1.0);
    expect(tracker.exceeded()).toBe(false);
    tracker.add({ input_tokens: 100_000, output_tokens: 100_000 }, 'claude-opus-4-7');
    expect(tracker.used()).toBeCloseTo(5 * 0.1 + 25 * 0.1, 5);
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
    // 1 MTok uncached input at 5.00, 1 MTok cache write at 1.25x, 1 MTok
    // cache read at 0.1x.
    expect(cost).toBeCloseTo(5 + 6.25 + 0.5, 5);
  });

  it('prices current-generation models instead of falling back', () => {
    // Every one of these previously fell through to the `claude-opus-4-7`
    // entry at $15/$75 — Opus 5 was billed at 3x, Sonnet 5 at 5x.
    expect(costOf({ input_tokens: 1_000_000, output_tokens: 0 }, 'claude-opus-5')).toBeCloseTo(5, 5);
    expect(costOf({ input_tokens: 1_000_000, output_tokens: 0 }, 'claude-opus-4-8')).toBeCloseTo(
      5,
      5
    );
    // Pinned to a date past the promotional window so this assertion does not
    // silently change meaning on 2026-09-01. The date-sensitive behaviour has
    // its own test below.
    expect(
      costOf({ input_tokens: 1_000_000, output_tokens: 0 }, 'claude-sonnet-5', {
        at: '2026-09-01',
      })
    ).toBeCloseTo(3, 5);
    expect(costOf({ input_tokens: 1_000_000, output_tokens: 0 }, 'claude-fable-5')).toBeCloseTo(
      10,
      5
    );
  });

  it('prices a dated snapshot as its alias', () => {
    // The old `split('-').slice(0, 3)` normalization mapped this to
    // `claude-haiku-4`, which is not a key, so it hit the fallback.
    expect(
      costOf({ input_tokens: 1_000_000, output_tokens: 0 }, 'claude-haiku-4-5-20251001')
    ).toBeCloseTo(1, 5);
    // toEqual, not toBe: pricing objects are derived per call from the shared
    // cost-guard table rather than being shared singletons.
    expect(pricingFor('claude-haiku-4-5-20251001')).toEqual(pricingFor('claude-haiku-4-5'));
  });

  it('prices locally-hosted models at zero, not at cloud rates', () => {
    // Ollama reports tag-style ids. These were billed as Opus 4.7 ($15/$75)
    // before 2026-08-03 — a local run showed up as the most expensive config
    // in the Pareto comparison.
    for (const id of ['qwen2.5-coder:7b', 'llama3.1:8b', 'ollama-error']) {
      expect(costOf({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, id)).toBe(0);
    }
  });

  it('prices an unclassifiable local model at zero when the config declares it', () => {
    // A HoloServe / HoloLlama route reports a raw GGUF name with no colon and
    // no recognizable prefix — pattern-matching cannot classify it, so without
    // the explicit flag it would take the conservative cloud fallback.
    const gguf = 'qwen2.5-coder-7b-instruct-q4_k_m';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
      expect(costOf(usage, gguf)).toBeGreaterThan(0); // guessed: unknown → cloud fallback
      expect(costOf(usage, gguf, { localCompute: true })).toBe(0); // declared: free
    } finally {
      warn.mockRestore();
    }
  });

  it('prices a decorated model id as the model it names', () => {
    // fable5-ultracode reports "claude-fable-5 [ultracode reference transcript replay]".
    expect(pricingFor('claude-fable-5 [ultracode reference transcript replay]')).toEqual(
      pricingFor('claude-fable-5')
    );
  });

  it('does not treat an unrecognized cloud model as local', () => {
    // Guards the local predicate against over-matching: a `claude-*` id it
    // does not know must still take the conservative fallback, never $0.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(pricingFor('claude-some-future-model')).toEqual(pricingFor('claude-fable-5'));
      expect(
        costOf({ input_tokens: 1_000_000, output_tokens: 0 }, 'claude-some-future-model')
      ).toBeGreaterThan(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('falls back to the most expensive known pricing for an unknown model', () => {
    // Budget guards must fail safe by over-estimating, never under.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fallback = pricingFor('claude-does-not-exist-9');
      // No known model may be pricier than the fallback, or the fallback is
      // no longer conservative.
      for (const id of ['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']) {
        expect(fallback.input_per_mtok_usd).toBeGreaterThanOrEqual(
          pricingFor(id).input_per_mtok_usd
        );
      }
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * Date-bounded pricing, delegated to the shared cost-guard schedule.
   * Sonnet 5 runs promotional $2/$10 through 2026-08-31 and reverts to
   * $3/$15 on 09-01. The old local table could not express this and
   * hardcoded the standard rate as a deliberate workaround.
   */
  it('prices Sonnet 5 at the rate in effect on the run date', () => {
    const oneMTokIn = { input_tokens: 1_000_000, output_tokens: 0 };

    // During the promotional window.
    expect(costOf(oneMTokIn, 'claude-sonnet-5', { at: '2026-08-15' })).toBeCloseTo(2, 5);
    // After it lapses.
    expect(costOf(oneMTokIn, 'claude-sonnet-5', { at: '2026-09-01' })).toBeCloseTo(3, 5);
  });

  it('resolves pricing from the shared cost-guard table, not a local copy', () => {
    // Regression guard for the drift this refactor removed: the benchmark's
    // own table had Opus 4.7 at $15/$75 and no Opus 5 entry at all.
    expect(pricingFor('claude-opus-4-7').input_per_mtok_usd).toBe(5);
    expect(pricingFor('claude-opus-4-8').input_per_mtok_usd).toBe(5);
    expect(pricingFor('claude-opus-5').input_per_mtok_usd).toBe(5);
    // Cache rates stay derived from the base input rate.
    expect(pricingFor('claude-opus-5').cache_read_per_mtok_usd).toBeCloseTo(0.5, 5);
    expect(pricingFor('claude-opus-5').cache_write_per_mtok_usd).toBeCloseTo(6.25, 5);
  });
});

describe('task corpus', () => {
  it('loads exactly 40 tasks across 4 tiers (10 each)', () => {
    const tasks = loadAllTasks();
    expect(tasks.length).toBe(40);
    const byTier = new Map<string, number>();
    for (const t of tasks) byTier.set(t.tier, (byTier.get(t.tier) ?? 0) + 1);
    expect(byTier.get('trivial-scene')).toBe(10);
    expect(byTier.get('multi-object-scene')).toBe(10);
    expect(byTier.get('agentic-multi-step')).toBe(10);
    expect(byTier.get('fable5-dimension')).toBe(10);
  });

  it('every task has at least one required criterion', () => {
    for (const t of loadAllTasks()) {
      const required = t.evaluation_rubric.filter((c) => c.required);
      expect(required.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('quick subset has one task from each tier', () => {
    const sub = loadQuickSubset();
    expect(sub.length).toBe(4);
    const tiers = new Set(sub.map((t) => t.tier));
    expect(tiers.size).toBe(4);
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
        if (
          desc.includes('color') &&
          !/red|blue|green|white|yellow|gray|pink|orange|brown|black/i.test(candidate)
        )
          return false;
        if (desc.includes('color_red') && !/red/i.test(candidate)) return false;
        if (desc.includes('object_is_cube') && !/cube/i.test(candidate)) return false;
        if (desc.includes('single_object') && !/cube/i.test(candidate)) return false;
        if (desc.includes('position_origin') && !/origin|0,\s*0,\s*0|\(0,0,0\)/i.test(candidate))
          return false;
        if (desc.includes('five_spheres') && !/5\s+(?:white\s+)?spheres/i.test(candidate))
          return false;
        if (desc.includes('all_white') && !/white/i.test(candidate)) return false;
        if (
          desc.includes('x_spacing') &&
          !/\(0,0,0\).*\(1,0,0\).*\(2,0,0\).*\(3,0,0\).*\(4,0,0\)/s.test(candidate)
        )
          return false;
        if (desc.includes('y_z_zero') && !/0,\s*0,\s*0/.test(candidate)) return false;
        return true;
      });
    });

    for (const g of golden) {
      const t = taskById.get(g.task_id)!;
      const { judgeRun, isCompleted } = await import('../judge');
      const res = await judgeRun(t, 'vanilla-baseline', 1, g.candidate_output, [], {
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
    const fetchImpl = async (): Promise<Response> => new Response('boom', { status: 500 });
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
