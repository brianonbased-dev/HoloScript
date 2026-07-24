/**
 * LocalLLMAdapter — streamCompletion OpenAI-compat SSE translation
 *
 * Pins the contract that `streamCompletion()` with `nativeOllamaApi: false`
 * speaks the OpenAI-compatible SSE surface (`POST /v1/chat/completions`,
 * `stream: true`) — the protocol of llama.cpp llama-server, HoloServe
 * (pytorch-holo), LM Studio, and vLLM — instead of Ollama NDJSON:
 *
 * 1. protocol split — nativeOllamaApi:false → /v1/chat/completions;
 *    true → /api/chat. Before this branch, streaming was hardwired to Ollama
 *    NDJSON regardless of configuration.
 * 2. text deltas — every `data:` frame with delta.content → one text_delta,
 *    order preserved, `data: [DONE]` terminates.
 * 3. tool-call fragments — OpenAI streams function arguments in pieces per
 *    tool-call index; the adapter accumulates and emits tool_use_start +
 *    tool_use_end with the FULLY PARSED input, before message_stop.
 * 4. exactly-one message_stop with finishReason + usage (from the final frame).
 * 5. error contract parity — mid-stream error object → message_stop 'error' +
 *    throw; SSE keepalive comments and split frames handled.
 * 6. `grammar` passthrough (HoloServe sovereign constrained decoding, W.780 /
 *    llama-server GBNF) on both complete() and streamCompletion().
 * 7. createLocalLLMProviderForRoute maps route.backend → protocol in-band.
 *
 * HoloServe P4a (research/2026-07-12_holoserve-native-sovereign-inference-server.md).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import type { LLMStreamChunk } from '../types';
import { LocalLLMAdapter } from '../adapters/local-llm';
import { LLMProviderError } from '../types';
import { createLocalLLMProviderForRoute } from '../index';

// =============================================================================
// Helpers — build mock SSE response streams
// =============================================================================

/** Encode objects as OpenAI SSE frames, appending `data: [DONE]` unless told not to. */
function sse(objects: Record<string, unknown>[], opts: { done?: boolean; extraLines?: string[] } = {}): string {
  const frames = objects.map((o) => `data: ${JSON.stringify(o)}\n\n`);
  if (opts.extraLines) frames.unshift(...opts.extraLines.map((l) => `${l}\n`));
  if (opts.done !== false) frames.push('data: [DONE]\n\n');
  return frames.join('');
}

/** Mock Response with a ReadableStream body delivered in the given chunks. */
function mockSseResponse(chunks: string[], status = 200): Response {
  const encoded = chunks.map((c) => new TextEncoder().encode(c));
  let i = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (i < encoded.length) controller.enqueue(encoded[i++]);
      else controller.close();
    },
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  } as Response;
}

async function collect(stream: AsyncIterable<LLMStreamChunk>): Promise<LLMStreamChunk[]> {
  const out: LLMStreamChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

function chatChunk(delta: Record<string, unknown>, finish: string | null = null, extra: Record<string, unknown> = {}) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'holorunner-s0',
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...extra,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// Protocol split
// =============================================================================

describe('streamCompletion protocol split', () => {
  it('nativeOllamaApi:false → POST /v1/chat/completions (OpenAI-compat SSE)', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return mockSseResponse([sse([chatChunk({ content: 'hi' }, 'stop')])]);
    });
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });
    await collect(adapter.streamCompletion({ messages: [{ role: 'user', content: 'x' }] }));
    expect(urls).toEqual(['http://127.0.0.1:8099/v1/chat/completions']);
  });

  it('nativeOllamaApi:true still → POST /api/chat (Ollama NDJSON path untouched)', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      const ndjson = `${JSON.stringify({ message: { content: 'hi' }, done: true, done_reason: 'stop' })}\n`;
      return mockSseResponse([ndjson]);
    });
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:11434', nativeOllamaApi: true });
    await collect(adapter.streamCompletion({ messages: [{ role: 'user', content: 'x' }] }));
    expect(urls).toEqual(['http://127.0.0.1:11434/api/chat']);
  });

  it('createLocalLLMProviderForRoute maps backend → protocol (no port heuristic)', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      if (url.endsWith('/api/chat')) {
        return mockSseResponse([`${JSON.stringify({ message: { content: 'a' }, done: true })}\n`]);
      }
      return mockSseResponse([sse([chatChunk({ content: 'b' }, 'stop')])]);
    });
    // pytorch-holo on a random port → OpenAI-compat, NOT guessed from the port
    const holo = createLocalLLMProviderForRoute({
      baseURL: 'http://127.0.0.1:8099',
      model: 'holorunner-s0',
      backend: 'pytorch-holo',
    });
    await collect(holo.streamCompletion({ messages: [{ role: 'user', content: 'x' }] }));
    // ollama on a NON-11434 port (the heuristic would have guessed wrong) → native
    const ollama = createLocalLLMProviderForRoute({
      baseURL: 'http://192.168.0.119:9999',
      model: 'qwen3:4b-instruct',
      backend: 'ollama',
    });
    await collect(ollama.streamCompletion({ messages: [{ role: 'user', content: 'x' }] }));
    expect(urls).toEqual([
      'http://127.0.0.1:8099/v1/chat/completions',
      'http://192.168.0.119:9999/api/chat',
    ]);
  });
});

// =============================================================================
// SSE translation
// =============================================================================

describe('streamOpenAICompat SSE translation', () => {
  it('forwards the opt-in HoloServe payload pipeline in streaming requests', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return mockSseResponse([sse([chatChunk({ content: '153' }, 'stop')])]);
    });
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });

    await collect(
      adapter.streamCompletion({
        messages: [{ role: 'user', content: 'Return 17 multiplied by 9 as a bare integer.' }],
        holoPipeline: 'broker-v1',
      })
    );

    expect(bodies).toHaveLength(1);
    expect(bodies[0].holo_pipeline).toBe('broker-v1');
  });

  it('text deltas in order + exactly one message_stop with usage from the final frame', async () => {
    vi.stubGlobal('fetch', async () =>
      mockSseResponse([
        sse([
          chatChunk({ role: 'assistant', content: '' }),
          chatChunk({ content: 'Hello' }),
          chatChunk({ content: ', world' }),
          chatChunk({}, 'stop', { usage: { prompt_tokens: 24, completion_tokens: 364, total_tokens: 388 } }),
        ]),
      ])
    );
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });
    const chunks = await collect(adapter.streamCompletion({ messages: [{ role: 'user', content: 'x' }] }));

    const texts = chunks.filter((c) => c.type === 'text_delta').map((c) => (c as { text: string }).text);
    expect(texts).toEqual(['Hello', ', world']);
    const stops = chunks.filter((c) => c.type === 'message_stop');
    expect(stops).toHaveLength(1);
    expect(chunks[chunks.length - 1].type).toBe('message_stop');
    const stop = stops[0] as { finishReason: string; usage: { totalTokens: number }; model: string };
    expect(stop.finishReason).toBe('stop');
    expect(stop.usage.totalTokens).toBe(388);
    expect(stop.model).toBe('holorunner-s0');
  });

  it('handles frames split across network chunks and skips SSE keepalive comments', async () => {
    const full = sse(
      [chatChunk({ content: 'AB' }), chatChunk({ content: 'CD' }, 'length')],
      { extraLines: [': keepalive'] }
    );
    const cut = Math.floor(full.length / 2) + 3; // split mid-frame
    vi.stubGlobal('fetch', async () => mockSseResponse([full.slice(0, cut), full.slice(cut)]));
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });
    const chunks = await collect(adapter.streamCompletion({ messages: [{ role: 'user', content: 'x' }] }));
    const texts = chunks.filter((c) => c.type === 'text_delta').map((c) => (c as { text: string }).text);
    expect(texts.join('')).toBe('ABCD');
    expect((chunks[chunks.length - 1] as { finishReason: string }).finishReason).toBe('length');
  });

  it('accumulates tool-call argument fragments → tool_use_start/end with parsed input before message_stop', async () => {
    vi.stubGlobal('fetch', async () =>
      mockSseResponse([
        sse([
          chatChunk({ tool_calls: [{ index: 0, id: 'call_abc', function: { name: 'get_weather', arguments: '{"ci' } }] }),
          chatChunk({ tool_calls: [{ index: 0, function: { arguments: 'ty":"Tokyo"}' } }] }),
          chatChunk({}, 'tool_calls'),
        ]),
      ])
    );
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });
    const chunks = await collect(adapter.streamCompletion({ messages: [{ role: 'user', content: 'x' }] }));

    const types = chunks.map((c) => c.type);
    expect(types).toEqual(['tool_use_start', 'tool_use_end', 'message_stop']);
    expect((chunks[0] as { id: string; name: string }).id).toBe('call_abc');
    expect((chunks[0] as { name: string }).name).toBe('get_weather');
    expect((chunks[1] as { input: unknown }).input).toEqual({ city: 'Tokyo' });
    expect((chunks[2] as { finishReason: string }).finishReason).toBe('tool_use');
  });

  it('bare EOF with neither a finish_reason frame nor [DONE] → truncated stream = error (not clean stop)', async () => {
    // HoloServe bodies are EOF-terminated (Connection: close): a server-side crash
    // mid-generation is a wire-level PREFIX of a success. Only the final frames
    // (finish_reason, [DONE]) distinguish them — their absence must not read as stop.
    vi.stubGlobal('fetch', async () =>
      mockSseResponse([sse([chatChunk({ content: 'partial IR...' })], { done: false })])
    );
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });
    const seen: LLMStreamChunk[] = [];
    await expect(async () => {
      for await (const c of adapter.streamCompletion({ messages: [{ role: 'user', content: 'x' }] })) seen.push(c);
    }).rejects.toThrow(LLMProviderError);
    expect((seen[seen.length - 1] as { finishReason: string }).finishReason).toBe('error');
  });

  it('truncated tool-call arguments (finish length / EOF) are NOT emitted as empty-input tool calls', async () => {
    vi.stubGlobal('fetch', async () =>
      mockSseResponse([
        sse([
          chatChunk({ tool_calls: [{ index: 0, id: 'call_x', function: { name: 'get_weather', arguments: '{"ci' } }] }),
          chatChunk({}, 'length'),
        ]),
      ])
    );
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });
    const chunks = await collect(adapter.streamCompletion({ messages: [{ role: 'user', content: 'x' }] }));
    expect(chunks.filter((c) => c.type === 'tool_use_start')).toHaveLength(0); // no {} phantom call
    expect((chunks[chunks.length - 1] as { finishReason: string }).finishReason).toBe('length');
  });

  it('mid-stream error object → message_stop finishReason "error", then throws', async () => {
    vi.stubGlobal('fetch', async () =>
      mockSseResponse([
        sse([chatChunk({ content: 'partial' }), { error: { message: 'boom' } } as Record<string, unknown>], {
          done: false,
        }),
      ])
    );
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });
    const seen: LLMStreamChunk[] = [];
    await expect(async () => {
      for await (const c of adapter.streamCompletion({ messages: [{ role: 'user', content: 'x' }] })) seen.push(c);
    }).rejects.toThrow(LLMProviderError);
    const stop = seen[seen.length - 1] as { type: string; finishReason: string };
    expect(stop.type).toBe('message_stop');
    expect(stop.finishReason).toBe('error');
    expect(seen.filter((c) => c.type === 'text_delta')).toHaveLength(1); // partial text still delivered
  });
});

// =============================================================================
// grammar passthrough (HoloServe W.780 / llama-server GBNF)
// =============================================================================

describe('grammar passthrough', () => {
  it('streamCompletion sends request.grammar in the OpenAI-compat body', async () => {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init?: { body?: string }) => {
      bodies.push(init?.body ?? '');
      return mockSseResponse([sse([chatChunk({ content: '{}' }, 'stop')])]);
    });
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });
    await collect(
      adapter.streamCompletion({ messages: [{ role: 'user', content: 'x' }], grammar: 'containment' })
    );
    expect(JSON.parse(bodies[0]).grammar).toBe('containment');
    expect(JSON.parse(bodies[0]).stream).toBe(true);
  });

  it('complete() sends request.grammar on the OpenAI-compat path and omits it when unset', async () => {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init?: { body?: string }) => {
      bodies.push(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: {} }),
        text: () => Promise.resolve(''),
        headers: new Headers(),
      } as Response;
    });
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:8099', nativeOllamaApi: false });
    await adapter.complete({ messages: [{ role: 'user', content: 'x' }], grammar: 'deontic' });
    await adapter.complete({ messages: [{ role: 'user', content: 'x' }] });
    expect(JSON.parse(bodies[0]).grammar).toBe('deontic');
    expect('grammar' in JSON.parse(bodies[1])).toBe(false);
  });
});
