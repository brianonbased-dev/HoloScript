/**
 * LocalLLMAdapter — streamCompletion NDJSON translation
 *
 * Pins the contract that LocalLLMAdapter's `streamCompletion()` translates
 * Ollama NDJSON stream events to provider-agnostic `LLMStreamChunk`s with
 * the correct shape and ordering. Specifically:
 *
 * 1. text_delta translation — every NDJSON line with non-empty content → one
 *    text_delta chunk preserving exact text bytes.
 * 2. tool_use lifecycle — Ollama sends tool calls as complete blocks (not
 *    streamed JSON fragments). The adapter emits tool_use_start +
 *    tool_use_end per tool in one shot, with NO tool_use_input_delta chunks.
 *    The tool_use_end carries the FULLY PARSED input object.
 * 3. exactly-one message_stop — the stream always ends with exactly one
 *    message_stop chunk carrying finishReason + usage + model.
 * 4. ordering — chunks are yielded in NDJSON-line order; tool_use_end
 *    arrives BEFORE message_stop.
 * 5. error paths — pre-flight failures throw before the first chunk;
 *    mid-stream Ollama errors yield message_stop with finishReason 'error',
 *    then throw.
 *
 * D.025 Phase 2 — Ollama native streaming (task_1777429959591_b9zw).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LLMStreamChunk } from '../types';
import { LocalLLMAdapter } from '../adapters/local-llm';
import { LLMProviderError } from '../types';

// =============================================================================
// Helpers — build mock NDJSON response streams
// =============================================================================

/** Encode a series of JSON objects as NDJSON (newline-delimited). */
function ndjson(...objects: Record<string, unknown>[]): string {
  return objects.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

/** Create a mock Response with a ReadableStream body from an NDJSON string. */
function mockStreamResponse(body: string, status = 200): Response {
  const encoded = new TextEncoder().encode(body);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
    headers: new Headers({ 'content-type': 'application/x-ndjson' }),
  } as Response;
}

/** Create a mock Response that delivers the NDJSON body in multiple chunks. */
function mockChunkedResponse(chunks: string[], status = 200): Response {
  const encodedChunks = chunks.map((c) => new TextEncoder().encode(c));
  let chunkIndex = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < encodedChunks.length) {
        controller.enqueue(encodedChunks[chunkIndex++]);
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Headers({ 'content-type': 'application/x-ndjson' }),
  } as Response;
}

/** Create a mock Response for non-streaming error (no body). */
function mockErrorResponse(body: string, status: number): Response {
  return {
    ok: false,
    status,
    body: null,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
    headers: new Headers(),
  } as Response;
}

/** Collect all chunks from an AsyncIterable into an array. */
async function collect(stream: AsyncIterable<LLMStreamChunk>): Promise<LLMStreamChunk[]> {
  const chunks: LLMStreamChunk[] = [];
  for await (const c of stream) chunks.push(c);
  return chunks;
}

// =============================================================================
// Ollama NDJSON fixtures
// =============================================================================

/** Simple text-only stream: two content deltas + done. */
function textOnlyLines(): Record<string, unknown>[] {
  return [
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:00Z',
      message: { role: 'assistant', content: 'Hello' },
      done: false,
    },
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:01Z',
      message: { role: 'assistant', content: ', world' },
      done: false,
    },
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:02Z',
      message: { role: 'assistant', content: '' },
      done: true,
      total_duration: 123456789,
      eval_count: 8,
      prompt_eval_count: 12,
      done_reason: 'stop',
    },
  ];
}

/** Tool-call stream: one tool call in a single chunk. */
function toolCallLines(): Record<string, unknown>[] {
  return [
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'create_object',
              arguments: { object: 'cube', x: 1 },
            },
          },
        ],
      },
      done: false,
    },
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:01Z',
      message: { role: 'assistant', content: '' },
      done: true,
      eval_count: 20,
      prompt_eval_count: 15,
      done_reason: 'stop',
    },
  ];
}

/** Mixed text + tool calls. */
function mixedTextAndToolLines(): Record<string, unknown>[] {
  return [
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:00Z',
      message: { role: 'assistant', content: 'I will create ' },
      done: false,
    },
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:01Z',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'create_object',
              arguments: { object: 'cube' },
            },
          },
        ],
      },
      done: false,
    },
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:02Z',
      message: { role: 'assistant', content: '' },
      done: true,
      eval_count: 30,
      prompt_eval_count: 10,
      done_reason: 'stop',
    },
  ];
}

/** Multiple tool calls in one chunk. */
function multipleToolCallLines(): Record<string, unknown>[] {
  return [
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'create_object',
              arguments: { object: 'cube', x: 1 },
            },
          },
          {
            function: {
              name: 'set_property',
              arguments: { object: 'cube', property: 'color', value: 'red' },
            },
          },
        ],
      },
      done: false,
    },
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:01Z',
      message: { role: 'assistant', content: '' },
      done: true,
      eval_count: 40,
      prompt_eval_count: 20,
      done_reason: 'stop',
    },
  ];
}

/** Tool call with string arguments (some Ollama versions). */
function toolCallStringArgsLines(): Record<string, unknown>[] {
  return [
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'create_object',
              arguments: '{"object":"sphere","radius":2}',
            },
          },
        ],
      },
      done: false,
    },
    {
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:01Z',
      message: { role: 'assistant', content: '' },
      done: true,
      eval_count: 15,
      prompt_eval_count: 10,
      done_reason: 'stop',
    },
  ];
}

// =============================================================================
// Tests
// =============================================================================

describe('LocalLLMAdapter.streamCompletion — NDJSON chunk translation', () => {
  let adapter: LocalLLMAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new LocalLLMAdapter({ baseURL: 'http://localhost:11434' });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('translates text-only stream to text_delta + message_stop', async () => {
    fetchMock.mockResolvedValue(mockStreamResponse(ndjson(...textOnlyLines())));

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'hello' }] })
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
        completionTokens: 8,
        totalTokens: 20,
      });
      expect(stops[0].model).toBe('llama3.1');
    }
  });

  it('translates tool calls: tool_use_start + tool_use_end in one shot (no input_delta)', async () => {
    fetchMock.mockResolvedValue(mockStreamResponse(ndjson(...toolCallLines())));

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'make a cube' }] })
    );

    // tool_use_start — exactly one
    const starts = chunks.filter((c) => c.type === 'tool_use_start');
    expect(starts).toHaveLength(1);
    if (starts[0].type === 'tool_use_start') {
      expect(starts[0].name).toBe('create_object');
      // ID is generated as call_0, call_1, etc.
      expect(starts[0].id).toMatch(/^call_\d+$/);
    }

    // NO tool_use_input_delta chunks (Ollama sends complete calls)
    const deltas = chunks.filter((c) => c.type === 'tool_use_input_delta');
    expect(deltas).toHaveLength(0);

    // tool_use_end — exactly one, with parsed input
    const ends = chunks.filter((c) => c.type === 'tool_use_end');
    expect(ends).toHaveLength(1);
    if (ends[0].type === 'tool_use_end') {
      expect(ends[0].input).toEqual({ object: 'cube', x: 1 });
    }

    // message_stop carries tool_use finishReason
    const stops = chunks.filter((c) => c.type === 'message_stop');
    if (stops[0].type === 'message_stop') {
      expect(stops[0].finishReason).toBe('tool_use');
    }
  });

  it('emits text_delta before tool_use chunks for mixed content', async () => {
    fetchMock.mockResolvedValue(
      mockStreamResponse(ndjson(...mixedTextAndToolLines()))
    );

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'create a cube' }] })
    );

    // text delta arrives first
    const textIdx = chunks.findIndex((c) => c.type === 'text_delta');
    const toolStartIdx = chunks.findIndex((c) => c.type === 'tool_use_start');
    expect(textIdx).toBeLessThan(toolStartIdx);

    // tool_use_start before tool_use_end before message_stop
    const toolEndIdx = chunks.findIndex((c) => c.type === 'tool_use_end');
    const stopIdx = chunks.findIndex((c) => c.type === 'message_stop');
    expect(toolStartIdx).toBeLessThan(toolEndIdx);
    expect(toolEndIdx).toBeLessThan(stopIdx);
  });

  it('handles multiple tool calls in one chunk', async () => {
    fetchMock.mockResolvedValue(
      mockStreamResponse(ndjson(...multipleToolCallLines()))
    );

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'create cube and color it' }] })
    );

    const starts = chunks.filter((c) => c.type === 'tool_use_start');
    const ends = chunks.filter((c) => c.type === 'tool_use_end');
    expect(starts).toHaveLength(2);
    expect(ends).toHaveLength(2);

    // Each end carries the correct parsed input
    if (ends[0].type === 'tool_use_end') {
      expect(ends[0].input).toEqual({ object: 'cube', x: 1 });
    }
    if (ends[1].type === 'tool_use_end') {
      expect(ends[1].input).toEqual({ object: 'cube', property: 'color', value: 'red' });
    }

    // IDs are sequential
    if (starts[0].type === 'tool_use_start' && starts[1].type === 'tool_use_start') {
      expect(starts[0].id).not.toBe(starts[1].id);
    }
  });

  it('parses tool call arguments from JSON string (Ollama compatibility)', async () => {
    fetchMock.mockResolvedValue(
      mockStreamResponse(ndjson(...toolCallStringArgsLines()))
    );

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'create sphere' }] })
    );

    const ends = chunks.filter((c) => c.type === 'tool_use_end');
    expect(ends).toHaveLength(1);
    if (ends[0].type === 'tool_use_end') {
      expect(ends[0].input).toEqual({ object: 'sphere', radius: 2 });
    }
  });

  it('emits exactly one message_stop even when done_reason is "length"', async () => {
    const lines = [
      {
        model: 'llama3.1',
        created_at: '2026-05-01T00:00:00Z',
        message: { role: 'assistant', content: 'truncated' },
        done: false,
      },
      {
        model: 'llama3.1',
        created_at: '2026-05-01T00:00:01Z',
        message: { role: 'assistant', content: '' },
        done: true,
        eval_count: 5,
        prompt_eval_count: 10,
        done_reason: 'length',
      },
    ];
    fetchMock.mockResolvedValue(mockStreamResponse(ndjson(...lines)));

    const chunks = await collect(
      adapter.streamCompletion({
        messages: [{ role: 'user', content: 'long prompt' }],
        maxTokens: 10,
      })
    );

    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
    if (stops[0].type === 'message_stop') {
      expect(stops[0].finishReason).toBe('length');
    }
  });

  it('throws LLMProviderError on pre-flight 500 response (no chunks emitted)', async () => {
    fetchMock.mockResolvedValue(
      mockErrorResponse('internal server error', 500)
    );

    await expect(
      collect(adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] }))
    ).rejects.toThrow(LLMProviderError);

    // Verify the error is retryable (5xx)
    try {
      await collect(
        adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] })
      );
    } catch (err) {
      expect(err).toBeInstanceOf(LLMProviderError);
      if (err instanceof LLMProviderError) {
        expect(err.retryable).toBe(true);
        expect(err.statusCode).toBe(500);
      }
    }
  });

  it('throws LLMProviderError on pre-flight 429 (retryable)', async () => {
    fetchMock.mockResolvedValue(
      mockErrorResponse('rate limited', 429)
    );

    try {
      await collect(
        adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] })
      );
    } catch (err) {
      expect(err).toBeInstanceOf(LLMProviderError);
      if (err instanceof LLMProviderError) {
        expect(err.retryable).toBe(true);
        expect(err.statusCode).toBe(429);
      }
    }
  });

  it('throws informative LLMProviderError when fetch rejects (server down)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      collect(adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] }))
    ).rejects.toThrow(LLMProviderError);

    try {
      await collect(
        adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] })
      );
    } catch (err) {
      expect(err).toBeInstanceOf(LLMProviderError);
      if (err instanceof LLMProviderError) {
        expect(err.retryable).toBe(false);
        expect(err.message).toMatch(/local LLM server/i);
      }
    }
  });

  it('yields message_stop with finishReason=error on mid-stream Ollama error', async () => {
    // Ollama can return an error object mid-stream (e.g. model not found).
    const lines = [
      {
        model: 'llama3.1',
        created_at: '2026-05-01T00:00:00Z',
        message: { role: 'assistant', content: 'partial' },
        done: false,
      },
      { error: 'model not found' },
    ];
    fetchMock.mockResolvedValue(mockStreamResponse(ndjson(...lines)));

    // The stream should yield text_delta, then message_stop with error, then throw.
    const chunks: LLMStreamChunk[] = [];
    try {
      for await (const c of adapter.streamCompletion({
        messages: [{ role: 'user', content: 'test' }],
      })) {
        chunks.push(c);
      }
    } catch (err) {
      expect(err).toBeInstanceOf(LLMProviderError);
    }

    // text_delta was emitted
    expect(chunks.some((c) => c.type === 'text_delta')).toBe(true);

    // exactly one message_stop with finishReason 'error'
    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
    if (stops[0].type === 'message_stop') {
      expect(stops[0].finishReason).toBe('error');
    }
  });

  it('skips blank lines and malformed JSON in NDJSON stream', async () => {
    const validLine1 = JSON.stringify({
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:00Z',
      message: { role: 'assistant', content: 'Hello' },
      done: false,
    });
    const validLine2 = JSON.stringify({
      model: 'llama3.1',
      created_at: '2026-05-01T00:00:01Z',
      message: { role: 'assistant', content: '' },
      done: true,
      eval_count: 5,
      prompt_eval_count: 10,
      done_reason: 'stop',
    });
    // Insert blank lines and a malformed JSON line between valid lines
    const body = `${validLine1}\n\n{malformed\n${validLine2}\n`;
    fetchMock.mockResolvedValue(mockStreamResponse(body));

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] })
    );

    // Still got the text delta + message_stop (skipped the malformed line)
    expect(chunks.some((c) => c.type === 'text_delta')).toBe(true);
    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
  });

  it('handles NDJSON delivered in multiple chunks (partial reads)', async () => {
    const line1 = JSON.stringify({
      model: 'llama3.1',
      message: { role: 'assistant', content: 'Hello' },
      done: false,
    });
    const line2 = JSON.stringify({
      model: 'llama3.1',
      message: { role: 'assistant', content: '!' },
      done: true,
      eval_count: 2,
      prompt_eval_count: 5,
      done_reason: 'stop',
    });

    // Split the NDJSON mid-line to simulate partial reads
    const fullBody = `${line1}\n${line2}\n`;
    const midLineSplit = Math.floor(fullBody.length / 2);
    fetchMock.mockResolvedValue(
      mockChunkedResponse([
        fullBody.slice(0, midLineSplit),
        fullBody.slice(midLineSplit),
      ])
    );

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] })
    );

    const textDeltas = chunks.filter((c) => c.type === 'text_delta');
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);

    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
  });

  it('uses /api/chat endpoint (not /v1/chat/completions)', async () => {
    fetchMock.mockResolvedValue(
      mockStreamResponse(
        ndjson({
          model: 'mistral-7b-instruct',
          message: { role: 'assistant', content: 'ok' },
          done: true,
          eval_count: 1,
          prompt_eval_count: 2,
          done_reason: 'stop',
        })
      )
    );

    await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] })
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
  });

  it('passes tools in Ollama format (input_schema → parameters)', async () => {
    fetchMock.mockResolvedValue(
      mockStreamResponse(
        ndjson({
          model: 'mistral-7b-instruct',
          message: { role: 'assistant', content: 'ok' },
          done: true,
          eval_count: 1,
          prompt_eval_count: 2,
          done_reason: 'stop',
        })
      )
    );

    await collect(
      adapter.streamCompletion({
        messages: [{ role: 'user', content: 'create a cube' }],
        tools: [
          {
            name: 'create_object',
            description: 'Create a HoloScript object',
            input_schema: {
              type: 'object',
              properties: {
                object: { type: 'string' },
                position: { type: 'array', items: { type: 'number' } },
              },
              required: ['object'],
            },
          },
        ],
      })
    );

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].type).toBe('function');
    expect(body.tools[0].function.name).toBe('create_object');
    // input_schema → parameters mapping
    expect(body.tools[0].function.parameters).toEqual({
      type: 'object',
      properties: {
        object: { type: 'string' },
        position: { type: 'array', items: { type: 'number' } },
      },
      required: ['object'],
    });
  });

  it('strips trailing /v1 from baseURL for streaming too', async () => {
    const adapterV1 = new LocalLLMAdapter({ baseURL: 'http://localhost:11434/v1' });
    fetchMock.mockResolvedValue(
      mockStreamResponse(
        ndjson({
          model: 'mistral-7b-instruct',
          message: { role: 'assistant', content: 'ok' },
          done: true,
          eval_count: 1,
          prompt_eval_count: 2,
          done_reason: 'stop',
        })
      )
    );

    await collect(
      adapterV1.streamCompletion({ messages: [{ role: 'user', content: 'test' }] })
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Constructor strips /v1 → http://localhost:11434 → /api/chat
    expect(url).toBe('http://localhost:11434/api/chat');
  });

  it('falls back to zero-usage message_stop when response body is null', async () => {
    // Edge case: response with no body (shouldn't happen in practice, but
    // the adapter must not crash).
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    } as Response);

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] })
    );

    // Should still emit exactly one message_stop with zero usage
    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
    if (stops[0].type === 'message_stop') {
      expect(stops[0].usage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    }
  });

  it('handles tool call with missing function gracefully (empty start+end)', async () => {
    const lines = [
      {
        model: 'llama3.1',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              // Missing function — malformed tool call
            },
          ],
        },
        done: false,
      },
      {
        model: 'llama3.1',
        message: { role: 'assistant', content: '' },
        done: true,
        eval_count: 5,
        prompt_eval_count: 10,
        done_reason: 'stop',
      },
    ];
    fetchMock.mockResolvedValue(mockStreamResponse(ndjson(...lines)));

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'test' }] })
    );

    // Malformed tool call should be skipped (no start/end emitted)
    const starts = chunks.filter((c) => c.type === 'tool_use_start');
    const ends = chunks.filter((c) => c.type === 'tool_use_end');
    expect(starts).toHaveLength(0);
    expect(ends).toHaveLength(0);

    // Still got message_stop
    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
  });

  it('handles tool call with empty arguments object', async () => {
    const lines = [
      {
        model: 'llama3.1',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: 'get_time',
                // No arguments field
              },
            },
          ],
        },
        done: false,
      },
      {
        model: 'llama3.1',
        message: { role: 'assistant', content: '' },
        done: true,
        eval_count: 3,
        prompt_eval_count: 5,
        done_reason: 'stop',
      },
    ];
    fetchMock.mockResolvedValue(mockStreamResponse(ndjson(...lines)));

    const chunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'what time is it' }] })
    );

    const ends = chunks.filter((c) => c.type === 'tool_use_end');
    expect(ends).toHaveLength(1);
    if (ends[0].type === 'tool_use_end') {
      // Empty arguments → empty object
      expect(ends[0].input).toEqual({});
    }
  });

  it('maps done_reason correctly for tool_use and stop', async () => {
    // Test 1: tool calls present → finishReason = 'tool_use' regardless of done_reason
    fetchMock.mockResolvedValue(
      mockStreamResponse(ndjson(...toolCallLines()))
    );
    const toolChunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'make cube' }] })
    );
    const toolStops = toolChunks.filter((c) => c.type === 'message_stop');
    if (toolStops[0].type === 'message_stop') {
      expect(toolStops[0].finishReason).toBe('tool_use');
    }

    // Reset mock for test 2
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      mockStreamResponse(ndjson(...textOnlyLines()))
    );
    const textChunks = await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'hello' }] })
    );
    const textStops = textChunks.filter((c) => c.type === 'message_stop');
    if (textStops[0].type === 'message_stop') {
      expect(textStops[0].finishReason).toBe('stop');
    }
  });
});