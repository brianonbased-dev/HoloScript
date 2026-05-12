/**
 * AnthropicAdapter — advisor tool (beta `advisor-tool-2026-03-01`) wiring.
 *
 * Covers:
 *   - Pure helper `collectAnthropicBetaHeaders` (advisor detection, explicit
 *     betaHeaders pass-through, dedupe, undefined-when-empty).
 *   - Adapter integration: presence of advisor tool injects the
 *     `anthropic-beta: advisor-tool-2026-03-01` header on the
 *     `client.messages.stream` options arg, and absence does NOT
 *     (the false case per G.GOLD.013 — computed assertions must be tested).
 *   - The advisor tool shape is round-tripped through `tools` unchanged.
 *
 * Acceptance criterion from task_1778558623699_n77u:
 *   "integration test with mock Anthropic server passes; Brittney can opt in
 *    via tools array; no behavior change when advisor tool absent."
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
          // streamCompletion() in the adapter iterates the stream via
          // `for await (const event of stream)`, so the mock must be
          // async-iterable. We emit a minimal text-only event sequence
          // so the chunk translation in streamCompletion completes
          // cleanly and yields its terminating `message_stop`.
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
            return 'req_advisor_test';
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
  ANTHROPIC_ADVISOR_BETA,
  collectAnthropicBetaHeaders,
} from '../adapters/anthropic';
import type {
  AnthropicAdvisorToolSpec,
  LLMCompletionRequest,
  ToolSpec,
} from '../types';
import { isAnthropicAdvisorTool } from '../types';

const userMsg = { role: 'user' as const, content: 'Hi' };

const advisorTool: AnthropicAdvisorToolSpec = {
  type: 'advisor_20260301',
  name: 'advisor',
  model: 'claude-opus-4-7',
};

const echoTool: ToolSpec = {
  name: 'echo',
  description: 'Echo the input.',
  input_schema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
};

describe('collectAnthropicBetaHeaders (pure)', () => {
  it('returns undefined when no tools and no explicit betaHeaders', () => {
    const req: LLMCompletionRequest = { messages: [userMsg] };
    expect(collectAnthropicBetaHeaders(req)).toBeUndefined();
  });

  it('returns undefined when only generic tools are present (false case — G.GOLD.013)', () => {
    const req: LLMCompletionRequest = { messages: [userMsg], tools: [echoTool] };
    expect(collectAnthropicBetaHeaders(req)).toBeUndefined();
  });

  it('returns advisor beta token when an advisor tool is present', () => {
    const req: LLMCompletionRequest = { messages: [userMsg], tools: [advisorTool] };
    expect(collectAnthropicBetaHeaders(req)).toEqual([ANTHROPIC_ADVISOR_BETA]);
  });

  it('returns advisor beta token when an advisor tool is mixed with generic tools', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      tools: [echoTool, advisorTool],
    };
    expect(collectAnthropicBetaHeaders(req)).toEqual([ANTHROPIC_ADVISOR_BETA]);
  });

  it('passes explicit provider.anthropic.betaHeaders through verbatim', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      provider: {
        anthropic: { betaHeaders: ['task-budgets-2026-03-13'] },
      },
    };
    expect(collectAnthropicBetaHeaders(req)).toEqual(['task-budgets-2026-03-13']);
  });

  it('combines advisor token with explicit betaHeaders, advisor first, no dupes', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      tools: [advisorTool],
      provider: {
        anthropic: {
          betaHeaders: [ANTHROPIC_ADVISOR_BETA, 'task-budgets-2026-03-13'],
        },
      },
    };
    // Explicit duplicate of advisor token must NOT cause a duplicate in the
    // output — adapter dedupes while preserving first-seen order.
    expect(collectAnthropicBetaHeaders(req)).toEqual([
      ANTHROPIC_ADVISOR_BETA,
      'task-budgets-2026-03-13',
    ]);
  });

  it('ignores empty and non-string betaHeader entries defensively', () => {
    const req: LLMCompletionRequest = {
      messages: [userMsg],
      provider: {
        anthropic: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          betaHeaders: ['', 'task-budgets-2026-03-13', undefined as any],
        },
      },
    };
    expect(collectAnthropicBetaHeaders(req)).toEqual(['task-budgets-2026-03-13']);
  });
});

describe('isAnthropicAdvisorTool (type guard)', () => {
  it('returns true for the advisor shape', () => {
    expect(isAnthropicAdvisorTool(advisorTool)).toBe(true);
  });

  it('returns false for a generic function tool (false case — G.GOLD.013)', () => {
    expect(isAnthropicAdvisorTool(echoTool)).toBe(false);
  });
});

describe('AnthropicAdapter — advisor tool beta header injection', () => {
  beforeEach(() => {
    streamCalls.length = 0;
  });

  it('complete(): injects anthropic-beta header when advisor tool is present', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete(
      { messages: [userMsg], tools: [advisorTool] },
      'claude-opus-4-7',
    );
    expect(streamCalls).toHaveLength(1);
    const call = streamCalls[0];
    expect(call.options).toBeDefined();
    const headers = (call.options as { headers?: Record<string, string> }).headers;
    expect(headers).toBeDefined();
    expect(headers!['anthropic-beta']).toBe(ANTHROPIC_ADVISOR_BETA);
    // Advisor tool shape passes through to the request body unchanged.
    expect(call.body.tools).toEqual([advisorTool]);
  });

  it('complete(): does NOT inject anthropic-beta header when advisor tool is absent (false case — G.GOLD.013)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete({ messages: [userMsg] }, 'claude-opus-4-7');
    expect(streamCalls).toHaveLength(1);
    const call = streamCalls[0];
    // Acceptance: "no behavior change when advisor tool absent" — adapter
    // must call stream() with one arg (no options object), preserving the
    // literal-object call shape relied on by the W.production 30s-wall
    // workaround comment in anthropic.ts.
    expect(call.options).toBeUndefined();
  });

  it('complete(): does NOT inject anthropic-beta header for generic tools only (false case)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete(
      { messages: [userMsg], tools: [echoTool] },
      'claude-opus-4-7',
    );
    expect(streamCalls).toHaveLength(1);
    expect(streamCalls[0].options).toBeUndefined();
  });

  it('complete(): joins multiple beta tokens with comma when both advisor + explicit are present', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete(
      {
        messages: [userMsg],
        tools: [advisorTool],
        provider: {
          anthropic: { betaHeaders: ['task-budgets-2026-03-13'] },
        },
      },
      'claude-opus-4-7',
    );
    const headers = (streamCalls[0].options as { headers?: Record<string, string> })
      .headers;
    expect(headers!['anthropic-beta']).toBe(
      `${ANTHROPIC_ADVISOR_BETA},task-budgets-2026-03-13`,
    );
  });

  it('complete(): explicit betaHeaders alone (no advisor) still injects the header', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete(
      {
        messages: [userMsg],
        provider: {
          anthropic: { betaHeaders: ['task-budgets-2026-03-13'] },
        },
      },
      'claude-opus-4-7',
    );
    const headers = (streamCalls[0].options as { headers?: Record<string, string> })
      .headers;
    expect(headers!['anthropic-beta']).toBe('task-budgets-2026-03-13');
  });

  it('streamCompletion(): injects anthropic-beta header when advisor tool is present', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    const chunks: unknown[] = [];
    for await (const c of adapter.streamCompletion(
      { messages: [userMsg], tools: [advisorTool] },
      'claude-opus-4-7',
    )) {
      chunks.push(c);
    }
    expect(streamCalls).toHaveLength(1);
    const headers = (streamCalls[0].options as { headers?: Record<string, string> })
      .headers;
    expect(headers!['anthropic-beta']).toBe(ANTHROPIC_ADVISOR_BETA);
    // Stream must still terminate with message_stop (no behavior regression).
    const last = chunks[chunks.length - 1] as { type: string };
    expect(last.type).toBe('message_stop');
  });

  it('streamCompletion(): does NOT inject anthropic-beta header when advisor tool is absent (false case — G.GOLD.013)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    const chunks: unknown[] = [];
    for await (const c of adapter.streamCompletion(
      { messages: [userMsg] },
      'claude-opus-4-7',
    )) {
      chunks.push(c);
    }
    expect(streamCalls).toHaveLength(1);
    expect(streamCalls[0].options).toBeUndefined();
  });
});
