/**
 * AnthropicAdapter — stop_reason mapping + effort downgrade + cache-prefix stability
 *
 * Three invariants this file pins:
 *
 * 1. `stop_reason` mapping is COMPLETE — every reason the API can emit maps
 *    to a distinct, caller-actionable `finishReason`. Specifically:
 *      - `refusal` → 'refusal' (NOT 'stop' — caller must re-shape the prompt,
 *        not retry the same bytes; Opus 4.7 emits this more often than 4.6)
 *      - `model_context_window_exceeded` → 'context_window_exceeded' (NOT
 *        'stop' or 'length' — caller must compact / split history, not just
 *        bump max_tokens)
 *      - `end_turn` / `stop_sequence` → 'stop'
 *      - `max_tokens` → 'length'
 *      - `tool_use` → 'tool_use' (handled in the call-site ternary)
 *
 * 2. `effort` downgrade is SOUND across non-Opus / non-4.7 models — `max` and
 *    `xhigh` are Opus-tier-only and Opus-4.7-only respectively; sending them
 *    on Haiku/Sonnet would be silently ignored or 400. The adapter downgrades
 *    proactively so the wire request is always model-legal.
 *
 * 3. Cache prefix is BYTE-STABLE across two identical builds — the system
 *    field shape sent to client.messages.stream() must be identical bytes
 *    when called twice with the same input, otherwise prompt caching reads
 *    miss and every request pays the ~1.25× cache-write premium. This is the
 *    structural guard against future regressions like interpolating
 *    Date.now() / randomUUID() into the system prompt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildThinkingAndOutputForAnthropic } from '../adapters/anthropic';

// ---------- shared mock for stop-reason + cache-stability tests ----------

const { streamCalls, nextStopReason } = vi.hoisted(() => ({
  streamCalls: [] as Array<Record<string, unknown>>,
  nextStopReason: { value: 'end_turn' as string },
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    public readonly messages = {
      stream: (args: Record<string, unknown>) => {
        streamCalls.push(args);
        return {
          finalMessage: async () => ({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 10, output_tokens: 5 },
            model: (args.model as string) ?? 'claude-opus-4-7',
            stop_reason: nextStopReason.value,
          }),
        };
      },
    };
    constructor(_config: Record<string, unknown>) {
      // no-op
    }
  }
  return { default: MockAnthropic };
});

// Import AFTER vi.mock so the adapter's dynamic import resolves to the mock.
import { AnthropicAdapter } from '../adapters/anthropic';

describe('AnthropicAdapter stop_reason mapping', () => {
  beforeEach(() => {
    streamCalls.length = 0;
    nextStopReason.value = 'end_turn';
  });

  it('end_turn → finishReason "stop"', async () => {
    nextStopReason.value = 'end_turn';
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const res = await adapter.complete({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.finishReason).toBe('stop');
  });

  it('stop_sequence → finishReason "stop"', async () => {
    nextStopReason.value = 'stop_sequence';
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const res = await adapter.complete({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.finishReason).toBe('stop');
  });

  it('max_tokens → finishReason "length"', async () => {
    nextStopReason.value = 'max_tokens';
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const res = await adapter.complete({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.finishReason).toBe('length');
  });

  it('refusal → finishReason "refusal" (NOT "stop")', async () => {
    // Critical: pre-2026-04-27 default bucket mapped this to 'stop', losing
    // the safety-policy signal entirely. Caller must NOT retry the same
    // bytes; needs prompt re-shaping. Opus 4.7 emits this more frequently
    // than Opus 4.6.
    nextStopReason.value = 'refusal';
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const res = await adapter.complete({
      messages: [{ role: 'user', content: 'do something disallowed' }],
    });
    expect(res.finishReason).toBe('refusal');
  });

  it('model_context_window_exceeded → finishReason "context_window_exceeded" (NOT "stop"/"length")', async () => {
    // Critical: pre-fix this bucketed to 'stop', confusable with normal
    // completion. It is NOT 'length' either — that would tell the caller
    // to bump max_tokens, but the actual fix is to compact / split history.
    nextStopReason.value = 'model_context_window_exceeded';
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const res = await adapter.complete({
      messages: [{ role: 'user', content: 'a'.repeat(50000) }],
    });
    expect(res.finishReason).toBe('context_window_exceeded');
  });

  it('unknown stop_reason → finishReason "stop" (default)', async () => {
    // Forward-compat: a future API stop_reason we don't know about yet must
    // not crash. Default bucket stays 'stop'. New reasons should each get
    // their own case as we adopt them — see the comment block at the top
    // of mapStopReason.
    nextStopReason.value = 'some_future_reason';
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const res = await adapter.complete({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.finishReason).toBe('stop');
  });
});

describe('AnthropicAdapter cache prefix byte-stability', () => {
  beforeEach(() => {
    streamCalls.length = 0;
    nextStopReason.value = 'end_turn';
  });

  it('two identical complete() calls produce byte-identical system+tools prefix', async () => {
    // Structural guard against future regressions like interpolating
    // Date.now() / randomUUID() / unsorted JSON into the cached prefix.
    // The render order is `tools → system → messages`, so the bytes that
    // matter for cache hits are everything in `system` and `tools`. If
    // these differ between back-to-back identical calls, prompt caching
    // reads miss and every request pays the 1.25× write premium.
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      enablePromptCaching: true,
    });
    const req = {
      messages: [
        { role: 'system' as const, content: 'You are a HoloScript code generator.' },
        { role: 'user' as const, content: 'Generate a cube scene.' },
      ],
      tools: [
        {
          name: 'read_file',
          description: 'Read a file from disk.',
          input_schema: {
            type: 'object' as const,
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ],
    };
    await adapter.complete(req);
    await adapter.complete(req);
    expect(streamCalls).toHaveLength(2);
    // Compare ONLY the cache-relevant prefix fields; max_tokens / model /
    // messages can vary in shape across SDK versions but tools+system are
    // what cache_control keys off.
    const a = JSON.stringify({ system: streamCalls[0].system, tools: streamCalls[0].tools });
    const b = JSON.stringify({ system: streamCalls[1].system, tools: streamCalls[1].tools });
    expect(a).toBe(b);
  });
});

describe('buildThinkingAndOutputForAnthropic — effort downgrade', () => {
  // Pure function — no SDK mock needed. Pins the wire shape we send the API.

  it('effort=max on claude-haiku-4-5 → downgrades to high (max is Opus-tier-only)', async () => {
    const out = buildThinkingAndOutputForAnthropic('claude-haiku-4-5', {
      messages: [{ role: 'user', content: 'hi' }],
      effort: 'max',
    });
    expect(out.output_config?.effort).toBe('high');
  });

  it('effort=max on claude-sonnet-4-6 → downgrades to high (Sonnet is not Opus-family)', async () => {
    const out = buildThinkingAndOutputForAnthropic('claude-sonnet-4-6', {
      messages: [{ role: 'user', content: 'hi' }],
      effort: 'max',
    });
    expect(out.output_config?.effort).toBe('high');
  });

  it('effort=max on claude-opus-4-7 → preserved (Opus-tier supports max)', async () => {
    const out = buildThinkingAndOutputForAnthropic('claude-opus-4-7', {
      messages: [{ role: 'user', content: 'hi' }],
      effort: 'max',
    });
    expect(out.output_config?.effort).toBe('max');
  });

  it('effort=max on claude-opus-4-6 → preserved (Opus 4.6 also supports max)', async () => {
    const out = buildThinkingAndOutputForAnthropic('claude-opus-4-6', {
      messages: [{ role: 'user', content: 'hi' }],
      effort: 'max',
    });
    expect(out.output_config?.effort).toBe('max');
  });

  it('effort=xhigh on claude-haiku-4-5 → downgrades to high (xhigh is Opus-4.7-only)', async () => {
    const out = buildThinkingAndOutputForAnthropic('claude-haiku-4-5', {
      messages: [{ role: 'user', content: 'hi' }],
      effort: 'xhigh',
    });
    expect(out.output_config?.effort).toBe('high');
  });

  it('effort=xhigh on claude-opus-4-6 → downgrades to high (xhigh is Opus-4.7-only, not 4.6)', async () => {
    const out = buildThinkingAndOutputForAnthropic('claude-opus-4-6', {
      messages: [{ role: 'user', content: 'hi' }],
      effort: 'xhigh',
    });
    expect(out.output_config?.effort).toBe('high');
  });

  it('effort=xhigh on claude-opus-4-7 → preserved', async () => {
    const out = buildThinkingAndOutputForAnthropic('claude-opus-4-7', {
      messages: [{ role: 'user', content: 'hi' }],
      effort: 'xhigh',
    });
    expect(out.output_config?.effort).toBe('xhigh');
  });

  it('no effort + claude-opus-4-7 → defaults to xhigh (best for coding/agentic per skill guidance)', async () => {
    const out = buildThinkingAndOutputForAnthropic('claude-opus-4-7', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out.output_config?.effort).toBe('xhigh');
  });

  it('no effort + claude-sonnet-4-6 → defaults to high (4.6 default per skill guidance)', async () => {
    const out = buildThinkingAndOutputForAnthropic('claude-sonnet-4-6', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out.output_config?.effort).toBe('high');
  });
});
