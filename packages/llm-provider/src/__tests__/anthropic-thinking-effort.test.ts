/**
 * AnthropicAdapter — adaptive thinking + output_config.effort pass-through
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { streamCalls } = vi.hoisted(() => ({ streamCalls: [] as Array<Record<string, unknown>> }));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    public readonly messages = {
      stream: (args: Record<string, unknown>) => {
        streamCalls.push(args);
        return {
          finalMessage: async () => ({
            content: [{ type: 'text' as const, text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
            model: (args.model as string) ?? 'claude-opus-4-7',
            stop_reason: 'end_turn',
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

import { AnthropicAdapter, buildThinkingAndOutputForAnthropic } from '../adapters/anthropic';
import type { LLMCompletionRequest } from '../types';

describe('buildThinkingAndOutputForAnthropic (pure)', () => {
  it('downgrades max effort on non-Opus to high', () => {
    const r: LLMCompletionRequest = {
      messages: [],
      effort: 'max',
    };
    const o = buildThinkingAndOutputForAnthropic('claude-sonnet-4-6', r);
    expect(o.output_config?.effort).toBe('high');
  });

  it('downgrades xhigh on non–Opus-4-7 to high', () => {
    const r: LLMCompletionRequest = { messages: [], effort: 'xhigh' };
    const o = buildThinkingAndOutputForAnthropic('claude-sonnet-4-6', r);
    expect(o.output_config?.effort).toBe('high');
  });
});

describe('AnthropicAdapter messages.stream thinking + output_config', () => {
  beforeEach(() => {
    streamCalls.length = 0;
  });

  const userMsg = { role: 'user' as const, content: 'Hi' };

  it('claude-opus-4-7: default adaptive + summarized + effort xhigh reach stream()', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete({ messages: [userMsg] }, 'claude-opus-4-7');
    expect(streamCalls).toHaveLength(1);
    const a = streamCalls[0];
    expect(a.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(a.output_config).toEqual({ effort: 'xhigh' });
  });

  it('claude-sonnet-4-6: default adaptive + effort high reach stream()', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete({ messages: [userMsg] }, 'claude-sonnet-4-6');
    const a = streamCalls[0];
    expect(a.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(a.output_config).toEqual({ effort: 'high' });
  });

  it('explicit effort + thinking + thinkingDisplay are plumbed (opus-4-7)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete(
      {
        messages: [userMsg],
        thinking: { type: 'adaptive' },
        thinkingDisplay: 'omitted',
        effort: 'low',
      },
      'claude-opus-4-7',
    );
    const a = streamCalls[0];
    expect(a.thinking).toEqual({ type: 'adaptive', display: 'omitted' });
    expect(a.output_config).toEqual({ effort: 'low' });
  });

  it('thinking disabled omits default adaptive and default effort', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k' });
    await adapter.complete(
      { messages: [userMsg], thinking: { type: 'disabled' } },
      'claude-opus-4-7',
    );
    const a = streamCalls[0];
    expect(a.thinking).toEqual({ type: 'disabled' });
    expect(a.output_config).toBeUndefined();
  });
});
