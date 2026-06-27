import { describe, it, expect, vi, afterEach } from 'vitest';
import { VastServerlessAdapter } from '../adapters/vast-serverless';
import type { LLMCompletionRequest, LLMStreamChunk } from '../types';

const ROUTE = 'https://run.vast.ai/route/';

function sse(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
function json(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
const req = (content = 'hi') =>
  ({ messages: [{ role: 'user', content }] }) as unknown as LLMCompletionRequest;

describe('VastServerlessAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does route → envelope and streams text + a fragmented tool call', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        calls.push({ url, body });
        if (url === ROUTE)
          return json({ url: 'http://worker.test:8000', signature: 'sig123', request_idx: 0 });
        return sse([
          'data: {"choices":[{"delta":{"content":"Hi"}}],"model":"qwen3:14b"}\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"id":"c1","function":{"name":"find_tools","arguments":"{\\"goal\\""}}]}}]}\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":":\\"compile to unity\\"}"}}]}}]}\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n',
          'data: [DONE]\n',
        ]);
      })
    );

    const adapter = new VastServerlessAdapter({
      apiKey: 'vk',
      endpointName: 'holoscript-qwen-coder',
      model: 'qwen3:14b',
    });
    expect(adapter.name).toBe('fleet');
    const chunks: LLMStreamChunk[] = [];
    for await (const c of adapter.streamCompletion(req(), 'qwen3:14b')) chunks.push(c);

    // 1. route call first, with the endpoint + cost (cold-pool wake) + the vast key
    expect(calls[0].url).toBe(ROUTE);
    expect(calls[0].body.endpoint).toBe('holoscript-qwen-coder');
    expect(calls[0].body.cost).toBe(100);
    expect(calls[0].body.api_key).toBe('vk');
    // 2. worker call carries the FULL route body as auth_data + the openai payload
    expect(calls[1].url).toBe('http://worker.test:8000/v1/chat/completions');
    expect(calls[1].body.auth_data).toMatchObject({
      url: 'http://worker.test:8000',
      signature: 'sig123',
    });
    expect(calls[1].body.session_id).toBeNull();
    expect((calls[1].body.payload as Record<string, unknown>).stream).toBe(true);
    expect((calls[1].body.payload as Record<string, unknown>).model).toBe('qwen3:14b');
    // 3. SSE → LLMStreamChunk, tool args assembled across fragments
    const types = chunks.map((c) => c.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'text_delta',
        'tool_use_start',
        'tool_use_input_delta',
        'tool_use_end',
        'message_stop',
      ])
    );
    expect(types[types.length - 1]).toBe('message_stop');
    const stop = chunks[types.length - 1] as Extract<LLMStreamChunk, { type: 'message_stop' }>;
    expect(stop.requestId).toBe('vast:holoscript-qwen-coder:0');
    expect(stop.responseHeaders).toMatchObject({
      'x-holoscript-fleet-endpoint': 'holoscript-qwen-coder',
      'x-holoscript-fleet-worker-url': 'http://worker.test:8000',
      'x-holoscript-fleet-request-idx': '0',
    });
    const start = chunks.find((c) => c.type === 'tool_use_start') as Extract<
      LLMStreamChunk,
      { type: 'tool_use_start' }
    >;
    expect(start.name).toBe('find_tools');
    const end = chunks.find((c) => c.type === 'tool_use_end') as Extract<
      LLMStreamChunk,
      { type: 'tool_use_end' }
    >;
    expect(end.input).toEqual({ goal: 'compile to unity' });
  });

  it('polls the route until a worker is READY (cold-pool wake)', async () => {
    let routeHits = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === ROUTE) {
          routeHits++;
          if (routeHits < 3)
            return json({ status: { ready: 0, total: 1 }, request_idx: routeHits });
          return json({ url: 'http://w:8000' });
        }
        return sse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n', 'data: [DONE]\n']);
      })
    );
    const adapter = new VastServerlessAdapter({
      apiKey: 'vk',
      endpointName: 'e',
      model: 'm',
      pollIntervalMs: 1,
    });
    const chunks: LLMStreamChunk[] = [];
    for await (const c of adapter.streamCompletion(req())) chunks.push(c);
    expect(routeHits).toBe(3); // 2 not-ready polls + 1 ready
    expect(chunks.some((c) => c.type === 'text_delta')).toBe(true);
  });

  it('complete() returns content + parsed tool uses via the envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === ROUTE) return json({ url: 'http://w:8000', request_idx: 7 });
        return json({
          choices: [
            {
              message: {
                content: 'done',
                tool_calls: [
                  { id: 't1', function: { name: 'compile_to_unity', arguments: '{"x":1}' } },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          model: 'qwen3:14b',
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        });
      })
    );
    const adapter = new VastServerlessAdapter({
      apiKey: 'vk',
      endpointName: 'e',
      model: 'qwen3:14b',
    });
    const res = await adapter.complete(req(), 'qwen3:14b');
    expect(res.provider).toBe('fleet');
    expect(res.requestId).toBe('vast:e:7');
    expect(res.responseHeaders).toMatchObject({
      'x-holoscript-fleet-endpoint': 'e',
      'x-holoscript-fleet-worker-url': 'http://w:8000',
      'x-holoscript-fleet-request-idx': '7',
    });
    expect(res.content).toBe('done');
    expect(res.finishReason).toBe('tool_use');
    expect(res.toolUses?.[0]).toMatchObject({ name: 'compile_to_unity', input: { x: 1 } });
  });

  it('healthCheck can route-probe once without waiting for the cold pool', async () => {
    let routeHits = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === ROUTE) {
          routeHits++;
          return json({ status: { ready: 0, total: 1 }, request_idx: 0 });
        }
        throw new Error('worker should not be called');
      })
    );
    const adapter = new VastServerlessAdapter({
      apiKey: 'vk',
      endpointName: 'holoscript-qwen-coder',
      model: 'qwen3:14b',
      maxWaitS: 0,
      pollIntervalMs: 1,
    });
    const health = await adapter.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.error).toMatch(/latest route status/);
    expect(routeHits).toBe(1);
  });

  it('surfaces Vast route error_msg immediately', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error_msg: 'endpoint 0 not found or unauthorized' }))
    );

    const adapter = new VastServerlessAdapter({
      apiKey: 'vk',
      endpointName: 'missing-endpoint',
      model: 'qwen3:14b',
      pollIntervalMs: 1,
    });

    await expect(adapter.complete(req())).rejects.toThrow(/endpoint 0 not found or unauthorized/);
  });
});
