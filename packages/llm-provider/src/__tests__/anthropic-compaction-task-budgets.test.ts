/**
 * AnthropicAdapter — server-side compaction (beta `compact-2026-01-12`) and
 * per-loop task budgets (beta `task-budgets-2026-03-13`) wiring.
 *
 * Covers:
 *   - Pure helpers `collectAnthropicBetaHeaders` (compaction/taskBudget
 *     detection) and `buildAnthropicExtensionBody` (request-body field
 *     emission).
 *   - Adapter integration: presence of `provider.anthropic.compaction`
 *     injects the `anthropic-beta: compact-2026-01-12` header AND the body
 *     `compaction` field; presence of `provider.anthropic.taskBudget`
 *     injects `anthropic-beta: task-budgets-2026-03-13` AND `task_budget`.
 *   - The false case (G.GOLD.013): when neither extension is set, the
 *     adapter calls stream() with one arg (no options) and the body
 *     omits both fields — preserving the W.production literal-object call
 *     shape that the 30s-wall workaround depends on.
 *   - Both fields together: header is comma-joined, body has both keys.
 *
 * Acceptance criteria from task_1778558687937_wi7l (compaction) and
 * task_1778558767631_4tyo (task budgets):
 *   - compact:'auto' on long Brittney sessions ⇒ server compacts upstream
 *     of refusal (header + body field plumbed for caller opt-in).
 *   - task_budget enforcement server-side, not just client-side estimate
 *     (header + body field plumbed; cost-guard wiring is the next task).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { streamCalls } = vi.hoisted(() => ({
  streamCalls: [] as Array<{ body: Record<string, unknown>; options?: Record<string, unknown> }>,
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    public readonly messages = {
      stream: (body: Record<string, unknown>, options?: Record<string, unknown>) => {
        streamCalls.push({ body, options });
        const model = (body.model as string) ?? 'claude-opus-4-7';
        return {
          async *[Symbol.asyncIterator]() {
            yield {
              type: 'content_block_start' as const,
              content_block: { type: 'text' as const },
            };
            yield {
              type: 'content_block_delta' as const,
              delta: { type: 'text_delta' as const, text: 'ok' },
            };
            yield { type: 'content_block_stop' as const };
            yield {
              type: 'message_delta' as const,
              delta: { stop_reason: 'end_turn' as const },
            };
          },
          finalMessage: async () => ({
            content: [{ type: 'text' as const, text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
            model,
            stop_reason: 'end_turn',
          }),
          get request_id() {
            return 'req_compact_test';
          },
          get response() {
            return { headers: new Headers() };
          },
        };
      },
    };
    constructor(_config: Record<string, unknown>) {
      // no-op
    }
  }
  return { default: MockAnthropic };
});

import {
  AnthropicAdapter,
  ANTHROPIC_COMPACT_BETA,
  ANTHROPIC_TASK_BUDGETS_BETA,
  buildAnthropicExtensionBody,
  collectAnthropicBetaHeaders,
} from '../adapters/anthropic';
import type { LLMCompletionRequest } from '../types';

const userMsg = { role: 'user' as const, content: 'Hi' };

const compactionExt = { type: 'compact_20260112' as const };
const taskBudgetExt = { type: 'tokens' as const, total: 50_000 };

describe('collectAnthropicBetaHeaders — compaction + task budgets (pure)', () => {
  it('returns undefined when neither extension is set (false case — G.GOLD.013)', () => {
    const req: LLMCompletionRequest = { messages: [userMsg] };
    expect(collectAnthropicBetaHeaders(req)).toBeUndefined();
  });

  it('returns compact beta token when provider.anthropic.compaction is set', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      provider: { anthropic: { compaction: compactionExt } },
    };
    expect(collectAnthropicBetaHeaders(req)).toEqual([ANTHROPIC_COMPACT_BETA]);
  });

  it('returns task-budgets beta token when provider.anthropic.taskBudget is set', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      provider: { anthropic: { taskBudget: taskBudgetExt } },
    };
    expect(collectAnthropicBetaHeaders(req)).toEqual([ANTHROPIC_TASK_BUDGETS_BETA]);
  });

  it('returns both beta tokens when both extensions are set, compaction first', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      provider: {
        anthropic: { compaction: compactionExt, taskBudget: taskBudgetExt },
      },
    };
    expect(collectAnthropicBetaHeaders(req)).toEqual([
      ANTHROPIC_COMPACT_BETA,
      ANTHROPIC_TASK_BUDGETS_BETA,
    ]);
  });

  it('dedupes when explicit betaHeaders duplicates an auto-collected token', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      provider: {
        anthropic: {
          compaction: compactionExt,
          betaHeaders: [ANTHROPIC_COMPACT_BETA, 'managed-agents-2026-04-01'],
        },
      },
    };
    expect(collectAnthropicBetaHeaders(req)).toEqual([
      ANTHROPIC_COMPACT_BETA,
      'managed-agents-2026-04-01',
    ]);
  });
});

describe('buildAnthropicExtensionBody (pure)', () => {
  it('returns empty object when neither extension is set (false case — G.GOLD.013)', () => {
    const req: LLMCompletionRequest = { messages: [userMsg] };
    expect(buildAnthropicExtensionBody(req)).toEqual({});
  });

  it('emits compaction body field when provider.anthropic.compaction is set', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      provider: { anthropic: { compaction: compactionExt } },
    };
    expect(buildAnthropicExtensionBody(req)).toEqual({
      compaction: { type: 'compact_20260112' },
    });
  });

  it('emits task_budget body field (snake_case) when taskBudget is set', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      provider: { anthropic: { taskBudget: taskBudgetExt } },
    };
    expect(buildAnthropicExtensionBody(req)).toEqual({
      task_budget: { type: 'tokens', total: 50_000 },
    });
  });

  it('emits both fields when both extensions are set', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      provider: {
        anthropic: { compaction: compactionExt, taskBudget: taskBudgetExt },
      },
    };
    expect(buildAnthropicExtensionBody(req)).toEqual({
      compaction: { type: 'compact_20260112' },
      task_budget: { type: 'tokens', total: 50_000 },
    });
  });
});

describe('AnthropicAdapter — compaction + task-budget beta header + body injection', () => {
  beforeEach(() => {
    streamCalls.length = 0;
  });

  it('complete(): injects compact beta header AND compaction body field', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete(
      {
        messages: [userMsg],
        provider: { anthropic: { compaction: compactionExt } },
      },
      'claude-opus-4-7',
    );
    expect(streamCalls).toHaveLength(1);
    const call = streamCalls[0];
    const headers = (call.options as { headers?: Record<string, string> }).headers;
    expect(headers!['anthropic-beta']).toBe(ANTHROPIC_COMPACT_BETA);
    expect(call.body.compaction).toEqual({ type: 'compact_20260112' });
    expect(call.body.task_budget).toBeUndefined();
  });

  it('complete(): injects task-budgets beta header AND task_budget body field', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete(
      {
        messages: [userMsg],
        provider: { anthropic: { taskBudget: taskBudgetExt } },
      },
      'claude-opus-4-7',
    );
    const call = streamCalls[0];
    const headers = (call.options as { headers?: Record<string, string> }).headers;
    expect(headers!['anthropic-beta']).toBe(ANTHROPIC_TASK_BUDGETS_BETA);
    expect(call.body.task_budget).toEqual({ type: 'tokens', total: 50_000 });
    expect(call.body.compaction).toBeUndefined();
  });

  it('complete(): joins both beta tokens with comma AND emits both body fields', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete(
      {
        messages: [userMsg],
        provider: {
          anthropic: { compaction: compactionExt, taskBudget: taskBudgetExt },
        },
      },
      'claude-opus-4-7',
    );
    const call = streamCalls[0];
    const headers = (call.options as { headers?: Record<string, string> }).headers;
    expect(headers!['anthropic-beta']).toBe(
      `${ANTHROPIC_COMPACT_BETA},${ANTHROPIC_TASK_BUDGETS_BETA}`,
    );
    expect(call.body.compaction).toEqual({ type: 'compact_20260112' });
    expect(call.body.task_budget).toEqual({ type: 'tokens', total: 50_000 });
  });

  it('complete(): does NOT inject anything when neither extension is set (false case — G.GOLD.013)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete({ messages: [userMsg] }, 'claude-opus-4-7');
    const call = streamCalls[0];
    expect(call.options).toBeUndefined();
    expect(call.body.compaction).toBeUndefined();
    expect(call.body.task_budget).toBeUndefined();
  });

  it('streamCompletion(): injects compact beta header AND compaction body field', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    const chunks: unknown[] = [];
    for await (const c of adapter.streamCompletion(
      {
        messages: [userMsg],
        provider: { anthropic: { compaction: compactionExt } },
      },
      'claude-opus-4-7',
    )) {
      chunks.push(c);
    }
    const call = streamCalls[0];
    const headers = (call.options as { headers?: Record<string, string> }).headers;
    expect(headers!['anthropic-beta']).toBe(ANTHROPIC_COMPACT_BETA);
    expect(call.body.compaction).toEqual({ type: 'compact_20260112' });
    const last = chunks[chunks.length - 1] as { type: string };
    expect(last.type).toBe('message_stop');
  });

  it('streamCompletion(): injects task-budgets beta header AND task_budget body field', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    const chunks: unknown[] = [];
    for await (const _c of adapter.streamCompletion(
      {
        messages: [userMsg],
        provider: { anthropic: { taskBudget: taskBudgetExt } },
      },
      'claude-opus-4-7',
    )) {
      chunks.push(_c);
    }
    const call = streamCalls[0];
    const headers = (call.options as { headers?: Record<string, string> }).headers;
    expect(headers!['anthropic-beta']).toBe(ANTHROPIC_TASK_BUDGETS_BETA);
    expect(call.body.task_budget).toEqual({ type: 'tokens', total: 50_000 });
  });

  it('streamCompletion(): does NOT inject anything when neither extension is set (false case — G.GOLD.013)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    const chunks: unknown[] = [];
    for await (const _c of adapter.streamCompletion(
      { messages: [userMsg] },
      'claude-opus-4-7',
    )) {
      chunks.push(_c);
    }
    const call = streamCalls[0];
    expect(call.options).toBeUndefined();
    expect(call.body.compaction).toBeUndefined();
    expect(call.body.task_budget).toBeUndefined();
  });
});
