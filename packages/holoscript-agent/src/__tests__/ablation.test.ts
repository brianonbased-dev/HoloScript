import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ILLMProvider, LLMCompletionRequest, LLMCompletionResponse } from '@holoscript/llm-provider';
import { runAblation, renderAblationMarkdown } from '../ablation.js';
import type { AblationProviderSpec, AblationTaskSpec } from '../ablation.js';
import { CostGuard } from '../cost-guard.js';

function provider(name: 'anthropic' | 'openai' | 'gemini' | 'mock', opts: {
  model: string;
  content?: string;
  promptTokens?: number;
  completionTokens?: number;
  throwError?: string;
  delayMs?: number;
}): ILLMProvider {
  return {
    name,
    models: [opts.model],
    defaultHoloScriptModel: opts.model,
    async complete(_req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.throwError) throw new Error(opts.throwError);
      const usage = {
        promptTokens: opts.promptTokens ?? 100,
        completionTokens: opts.completionTokens ?? 50,
        totalTokens: (opts.promptTokens ?? 100) + (opts.completionTokens ?? 50),
      };
      return {
        content: opts.content ?? `${name} says hi`,
        usage,
        model: opts.model,
        provider: name,
        finishReason: 'stop',
      };
    },
    async generateHoloScript() {
      throw new Error('not used');
    },
    async healthCheck() {
      return { ok: true, latencyMs: 1 };
    },
  };
}

const TASK: AblationTaskSpec = {
  taskId: 'task_paper19_inference',
  taskTitle: 'Paper 19 trait-inference accuracy across providers',
  systemPrompt: 'You are a trait inference system.',
  userPrompt: 'Infer traits for: cube { @color(red) @grabbable }',
  brainPath: 'compositions/trait-inference-brain.hsplus',
  maxTokens: 256,
  temperature: 0.0,
};

describe('runAblation', () => {
  it('runs all providers, captures usage + cost + duration per cell, sums total cost', async () => {
    const specs: AblationProviderSpec[] = [
      {
        label: 'opus',
        provider: 'anthropic',
        model: 'claude-opus-4-7',
        build: () => provider('anthropic', { model: 'claude-opus-4-7', promptTokens: 200, completionTokens: 100 }),
        pricer: (u) => (u.promptTokens * 15 + u.completionTokens * 75) / 1_000_000,
      },
      {
        label: 'gpt5',
        provider: 'openai',
        model: 'gpt-5',
        build: () => provider('openai', { model: 'gpt-5', promptTokens: 200, completionTokens: 100 }),
        pricer: () => 0.01,
      },
      {
        label: 'gemini',
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        build: () => provider('gemini', { model: 'gemini-2.5-pro', promptTokens: 200, completionTokens: 100 }),
        pricer: () => 0.005,
      },
    ];

    const matrix = await runAblation({ task: TASK, providers: specs });

    expect(matrix.cells).toHaveLength(3);
    expect(matrix.cells[0].label).toBe('opus');
    expect(matrix.cells[0].costUsd).toBeCloseTo((200 * 15 + 100 * 75) / 1_000_000, 6);
    expect(matrix.cells[1].costUsd).toBe(0.01);
    expect(matrix.cells[2].costUsd).toBe(0.005);
    expect(matrix.totalCostUsd).toBeCloseTo(matrix.cells[0].costUsd + 0.015, 6);
    expect(matrix.taskId).toBe('task_paper19_inference');
    expect(matrix.brainPath).toBe('compositions/trait-inference-brain.hsplus');
    expect(matrix.promptHash).toMatch(/^[0-9a-f]{16}$/);
    expect(matrix.budgetExhausted).toBe(false);
    matrix.cells.forEach((c) => expect(c.errorMessage).toBeUndefined());
  });

  it('captures provider failures as errorMessage cells (matrix stays full, never gappy — paper-program reproducibility)', async () => {
    const specs: AblationProviderSpec[] = [
      {
        label: 'anthropic-ok',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        build: () => provider('anthropic', { model: 'claude-haiku-4-5' }),
        pricer: () => 0.001,
      },
      {
        label: 'openai-rate-limit',
        provider: 'openai',
        model: 'gpt-5',
        build: () => provider('openai', { model: 'gpt-5', throwError: 'rate limit exceeded for openai' }),
      },
      {
        label: 'gemini-ok',
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        build: () => provider('gemini', { model: 'gemini-2.5-pro' }),
        pricer: () => 0.002,
      },
    ];

    const matrix = await runAblation({ task: TASK, providers: specs });

    expect(matrix.cells).toHaveLength(3);
    expect(matrix.cells[0].errorMessage).toBeUndefined();
    expect(matrix.cells[1].errorMessage).toContain('rate limit');
    expect(matrix.cells[1].finishReason).toBe('error');
    expect(matrix.cells[1].costUsd).toBe(0);
    expect(matrix.cells[2].errorMessage).toBeUndefined();
  });

  it('respects timeoutPerCellMs and reports a structured timeout error', async () => {
    const specs: AblationProviderSpec[] = [
      {
        label: 'fast',
        provider: 'anthropic',
        model: 'm1',
        build: () => provider('anthropic', { model: 'm1', delayMs: 5 }),
        pricer: () => 0,
      },
      {
        label: 'slow',
        provider: 'openai',
        model: 'm2',
        build: () => provider('openai', { model: 'm2', delayMs: 1000 }),
      },
    ];

    const matrix = await runAblation({ task: TASK, providers: specs, timeoutPerCellMs: 50 });

    expect(matrix.cells[0].errorMessage).toBeUndefined();
    expect(matrix.cells[1].errorMessage).toMatch(/timed out after 50ms/);
  });

  it('skips remaining cells once shared cost guard hits the daily ceiling (founder ruling Q1)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'abl-'));
    const guard = new CostGuard({
      statePath: join(dir, 'state.json'),
      dailyBudgetUsd: 0.0009,
      pricer: () => 0.001,
    });
    const specs: AblationProviderSpec[] = [
      {
        label: 'first',
        provider: 'anthropic',
        model: 'a1',
        build: () => provider('anthropic', { model: 'a1' }),
      },
      {
        label: 'second-skipped',
        provider: 'openai',
        model: 'o1',
        build: () => provider('openai', { model: 'o1' }),
      },
    ];

    const matrix = await runAblation({ task: TASK, providers: specs, costGuard: guard });
    expect(matrix.cells[0].errorMessage).toBeUndefined();
    expect(matrix.cells[1].errorMessage).toBe('budget-exhausted-before-cell');
    expect(matrix.budgetExhausted).toBe(true);
  });

  it('produces deterministic prompt hashes (provenance — same prompt => same hash across runs)', async () => {
    const m1 = await runAblation({
      task: TASK,
      providers: [
        {
          label: 'mock',
          provider: 'mock',
          model: 'mock-1',
          build: () => provider('mock', { model: 'mock-1' }),
        },
      ],
    });
    const m2 = await runAblation({
      task: TASK,
      providers: [
        {
          label: 'mock',
          provider: 'mock',
          model: 'mock-1',
          build: () => provider('mock', { model: 'mock-1' }),
        },
      ],
    });
    expect(m1.promptHash).toBe(m2.promptHash);
  });
});

describe('renderAblationMarkdown', () => {
  it('produces a paper-paste-ready markdown table with all cells', async () => {
    const matrix = await runAblation({
      task: TASK,
      providers: [
        {
          label: 'opus',
          provider: 'anthropic',
          model: 'claude-opus-4-7',
          build: () => provider('anthropic', {
            model: 'claude-opus-4-7',
            content: 'Inferred traits: color=red, grabbable=true',
            promptTokens: 50,
            completionTokens: 12,
          }),
          pricer: () => 0.001,
        },
        {
          label: 'gpt5',
          provider: 'openai',
          model: 'gpt-5',
          build: () => provider('openai', {
            model: 'gpt-5',
            content: 'traits = {color: red, grabbable: yes}',
            promptTokens: 48,
            completionTokens: 14,
          }),
          pricer: () => 0.0008,
        },
      ],
    });

    const md = renderAblationMarkdown(matrix);

    expect(md).toContain('# Ablation: Paper 19 trait-inference accuracy across providers');
    expect(md).toContain('| Label | Provider | Model | Tokens (in/out) | Cost (USD) | Duration (ms) | Finish | Excerpt |');
    expect(md).toContain('| opus | anthropic | claude-opus-4-7 | 50/12 |');
    expect(md).toContain('| gpt5 | openai | gpt-5 | 48/14 |');
    expect(md).toContain(`prompt_hash: \`${matrix.promptHash}\``);
    expect(md).toContain(`brain: \`compositions/trait-inference-brain.hsplus\``);
    expect(md).toContain(`total_cost_usd: $${matrix.totalCostUsd.toFixed(4)}`);
  });

  it('flags budget_exhausted in the markdown header so the paper reflects truncation', async () => {
    const matrix = {
      taskId: 'x',
      taskTitle: 't',
      promptHash: 'aaaa',
      cells: [],
      totalCostUsd: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      budgetExhausted: true,
    };
    const md = renderAblationMarkdown(matrix);
    expect(md).toContain('**budget_exhausted: true** (some cells skipped)');
  });

  it('escapes pipe characters in response excerpts so the markdown table is valid', async () => {
    const matrix = await runAblation({
      task: TASK,
      providers: [
        {
          label: 'piper',
          provider: 'mock',
          model: 'mock-1',
          build: () => provider('mock', { model: 'mock-1', content: 'a | b | c piped response' }),
          pricer: () => 0,
        },
      ],
    });
    const md = renderAblationMarkdown(matrix);
    expect(md).toContain('a \\| b \\| c piped response');
  });
});
