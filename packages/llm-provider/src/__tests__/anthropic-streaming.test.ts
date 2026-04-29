/**
 * AnthropicAdapter — streamCompletion event translation
 *
 * Pins the contract that AnthropicAdapter's `streamCompletion()` translates
 * Anthropic SDK stream events to provider-agnostic `LLMStreamChunk`s with
 * the correct shape and ordering. Specifically:
 *
 * 1. text_delta translation — every SDK content_block_delta with text → one
 *    text_delta chunk preserving exact text bytes.
 * 2. tool_use lifecycle — tool_use_start (id+name) precedes any
 *    tool_use_input_delta (id+partialJson) which precedes tool_use_end
 *    (id+parsed input). The terminating tool_use_end MUST carry fully
 *    PARSED input (not partial JSON), even if the model emitted multiple
 *    fragments that only became valid JSON after concatenation.
 * 3. exactly-one message_stop — the stream always ends with exactly one
 *    message_stop chunk carrying finishReason + usage + model.
 * 4. ordering — chunks are yielded in stream-event order; tool_use_end
 *    arrives BEFORE message_stop.
 *
 * Why this is wired up: D.025 (provider routing by deployment) requires
 * Brittney's route to consume a unified streaming surface so the same code
 * path works on Anthropic (cloud) and Ollama (downloaded app). This test
 * pins Phase 1 of that work — the unified surface itself + the Anthropic
 * implementation. Phase 2 adds the Ollama implementation; Phase 3 migrates
 * the Brittney route to consume `streamCompletion()`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { LLMStreamChunk } from '../types';

type StreamEvent =
  | { type: 'content_block_start'; content_block: { type: 'text' } | { type: 'tool_use'; id: string; name: string } }
  | { type: 'content_block_delta'; delta: { type: 'text_delta'; text: string } | { type: 'input_json_delta'; partial_json: string } }
  | { type: 'content_block_stop' }
  | { type: 'message_delta'; delta: { stop_reason: string | null } };

const { streamEvents, finalMessageData } = vi.hoisted(() => ({
  streamEvents: [] as StreamEvent[],
  finalMessageData: {
    value: {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn' as string | null,
    },
  },
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    public readonly messages = {
      stream: (_args: Record<string, unknown>) => ({
        async *[Symbol.asyncIterator]() {
          for (const ev of streamEvents) yield ev;
        },
        finalMessage: async () => finalMessageData.value,
      }),
    };
    constructor(_config: Record<string, unknown>) {
      // no-op
    }
  }
  return { default: MockAnthropic };
});

import { AnthropicAdapter } from '../adapters/anthropic';

async function collect(stream: AsyncIterable<LLMStreamChunk>): Promise<LLMStreamChunk[]> {
  const chunks: LLMStreamChunk[] = [];
  for await (const c of stream) chunks.push(c);
  return chunks;
}

describe('AnthropicAdapter.streamCompletion — chunk translation', () => {
  it('translates text-only stream to text_delta + message_stop', async () => {
    streamEvents.length = 0;
    streamEvents.push(
      { type: 'content_block_start', content_block: { type: 'text' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ', world' } },
      { type: 'content_block_stop' },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } }
    );
    finalMessageData.value = {
      content: [{ type: 'text', text: 'Hello, world' }],
      usage: { input_tokens: 12, output_tokens: 4 },
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
    };

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'hi' }] })
    );

    const textDeltas = chunks.filter((c) => c.type === 'text_delta');
    expect(textDeltas).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ', world' },
    ]);

    // exactly one message_stop, last
    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
    expect(chunks[chunks.length - 1].type).toBe('message_stop');
    if (stops[0].type === 'message_stop') {
      expect(stops[0].finishReason).toBe('stop');
      expect(stops[0].usage).toEqual({
        promptTokens: 12,
        completionTokens: 4,
        totalTokens: 16,
      });
      expect(stops[0].model).toBe('claude-sonnet-4-6');
    }
  });

  it('translates tool_use lifecycle: start → input_delta(s) → end with parsed input', async () => {
    streamEvents.length = 0;
    // Anthropic emits tool input as a sequence of input_json_delta fragments
    // that only become valid JSON after concatenation. The adapter must
    // accumulate them and emit `tool_use_end` with the FULLY PARSED object.
    streamEvents.push(
      {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'toolu_abc', name: 'create_object' },
      },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"obj' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: 'ect":"cube",' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '"x":1}' } },
      { type: 'content_block_stop' },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } }
    );
    finalMessageData.value = {
      content: [
        { type: 'tool_use', id: 'toolu_abc', name: 'create_object', input: { object: 'cube', x: 1 } },
      ] as never,
      usage: { input_tokens: 20, output_tokens: 8 },
      model: 'claude-sonnet-4-6',
      stop_reason: 'tool_use',
    };

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'make a cube' }] })
    );

    // tool_use_start — exactly one, with id + name
    const starts = chunks.filter((c) => c.type === 'tool_use_start');
    expect(starts).toHaveLength(1);
    if (starts[0].type === 'tool_use_start') {
      expect(starts[0].id).toBe('toolu_abc');
      expect(starts[0].name).toBe('create_object');
    }

    // tool_use_input_delta — three, in order, with the original fragments
    const deltas = chunks.filter((c) => c.type === 'tool_use_input_delta');
    expect(deltas).toHaveLength(3);
    expect(deltas.map((d) => (d.type === 'tool_use_input_delta' ? d.partialJson : ''))).toEqual([
      '{"obj',
      'ect":"cube",',
      '"x":1}',
    ]);

    // tool_use_end — exactly one, with parsed input (NOT the partial fragments)
    const ends = chunks.filter((c) => c.type === 'tool_use_end');
    expect(ends).toHaveLength(1);
    if (ends[0].type === 'tool_use_end') {
      expect(ends[0].id).toBe('toolu_abc');
      expect(ends[0].input).toEqual({ object: 'cube', x: 1 });
    }

    // ordering — start before any delta, end after all deltas, message_stop last
    const idx = (pred: (c: LLMStreamChunk) => boolean) => chunks.findIndex(pred);
    const startIdx = idx((c) => c.type === 'tool_use_start');
    const firstDeltaIdx = idx((c) => c.type === 'tool_use_input_delta');
    const lastDeltaIdx = chunks.findLastIndex((c) => c.type === 'tool_use_input_delta');
    const endIdx = idx((c) => c.type === 'tool_use_end');
    const stopIdx = idx((c) => c.type === 'message_stop');
    expect(startIdx).toBeLessThan(firstDeltaIdx);
    expect(lastDeltaIdx).toBeLessThan(endIdx);
    expect(endIdx).toBeLessThan(stopIdx);

    // message_stop carries tool_use finishReason
    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
    if (stops[0].type === 'message_stop') {
      expect(stops[0].finishReason).toBe('tool_use');
    }
  });

  it('emits message_stop exactly once even on a refusal stop_reason', async () => {
    streamEvents.length = 0;
    streamEvents.push(
      { type: 'content_block_start', content_block: { type: 'text' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'I cannot help with that.' } },
      { type: 'content_block_stop' },
      { type: 'message_delta', delta: { stop_reason: 'refusal' } }
    );
    finalMessageData.value = {
      content: [{ type: 'text', text: 'I cannot help with that.' }],
      usage: { input_tokens: 6, output_tokens: 7 },
      model: 'claude-sonnet-4-6',
      stop_reason: 'refusal',
    };

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: '...' }] })
    );

    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
    if (stops[0].type === 'message_stop') {
      expect(stops[0].finishReason).toBe('refusal');
    }
  });

  it('handles truncated/malformed tool input by yielding tool_use_end with empty input', async () => {
    // Truncation: stream ends mid-JSON (e.g. max_tokens cut off the model
    // before it closed the input object). Adapter must NOT throw — it
    // yields tool_use_end with input:{} so the caller's tool dispatch
    // fails fast on missing fields rather than receiving garbage.
    streamEvents.length = 0;
    streamEvents.push(
      {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'toolu_xyz', name: 'broken' },
      },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"incom' } },
      { type: 'content_block_stop' },
      { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }
    );
    finalMessageData.value = {
      content: [],
      usage: { input_tokens: 5, output_tokens: 1 },
      model: 'claude-sonnet-4-6',
      stop_reason: 'max_tokens',
    };

    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: '...' }] })
    );

    const ends = chunks.filter((c) => c.type === 'tool_use_end');
    expect(ends).toHaveLength(1);
    if (ends[0].type === 'tool_use_end') {
      expect(ends[0].input).toEqual({});
    }

    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
    if (stops[0].type === 'message_stop') {
      expect(stops[0].finishReason).toBe('length');
    }
  });
});

describe('BaseLLMAdapter default streamCompletion (fallback)', () => {
  it('synthesizes a single batch of chunks from complete() output', async () => {
    // We exercise the default fallback by importing MockAdapter, which
    // doesn't override streamCompletion. The adapter inherits the
    // BaseLLMAdapter default that wraps complete() in a single-batch
    // async iterator.
    const { MockAdapter } = await import('../adapters/mock');
    const adapter = new MockAdapter({ apiKey: 'test' });

    const chunks: LLMStreamChunk[] = [];
    for await (const c of adapter.streamCompletion({
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      chunks.push(c);
    }

    // Always at least a message_stop
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[chunks.length - 1].type).toBe('message_stop');
  });
});
