/**
 * OpenAICompatibleAdapter — usage and billed cost, for a paid endpoint.
 *
 * A paid OpenAI-compatible endpoint (xAI, for Brittney's paid fallback) sends
 * token usage at the end of a stream only when asked with
 * `stream_options.include_usage`, and xAI adds the billed cost as
 * `usage.cost_in_usd_ticks` (1 USD = 10^10 ticks, docs.x.ai cost tracking).
 * Measured against xAI 2026-09-28: with the option, one extra final chunk
 * (choices: []) carries usage and cost; without it, none.
 *
 * Pinned here: the option is sent only when the adapter is configured for it
 * (not every compatible server accepts it), the cost reaches message_stop's
 * usage as dollars, and a stream with no cost leaves costUsd undefined rather
 * than zero.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAICompatibleAdapter } from '../adapters/openai-compatible';
import type { LLMStreamChunk } from '../types';

function sse(objects: Record<string, unknown>[]): string {
  return objects.map((o) => `data: ${JSON.stringify(o)}\n\n`).join('') + 'data: [DONE]\n\n';
}

function sseResponse(body: string): Response {
  const bytes = new TextEncoder().encode(body);
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );
}

const TEXT = { choices: [{ delta: { content: 'Hi.' }, finish_reason: null }] };
const STOP = { choices: [{ delta: {}, finish_reason: 'stop' }] };
const USAGE = {
  choices: [],
  usage: {
    prompt_tokens: 185,
    completion_tokens: 2,
    total_tokens: 187,
    cost_in_usd_ticks: 1_093_500,
  },
};

async function drain(adapter: OpenAICompatibleAdapter): Promise<LLMStreamChunk[]> {
  const out: LLMStreamChunk[] = [];
  for await (const chunk of adapter.streamCompletion({
    messages: [{ role: 'user', content: 'Say hi.' }],
  })) {
    out.push(chunk);
  }
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAICompatibleAdapter usage and cost', () => {
  it('asks for usage only when configured to', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return sseResponse(sse([TEXT, STOP]));
      })
    );

    await drain(
      new OpenAICompatibleAdapter({ baseURL: 'https://api.example.test/v1', model: 'm' })
    );
    await drain(
      new OpenAICompatibleAdapter({
        baseURL: 'https://api.example.test/v1',
        model: 'm',
        includeUsage: true,
      })
    );

    expect(bodies[0]).not.toHaveProperty('stream_options');
    expect(bodies[1].stream_options).toEqual({ include_usage: true });
  });

  it('puts the billed cost on message_stop, in dollars', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(sse([TEXT, STOP, USAGE])))
    );

    const chunks = await drain(
      new OpenAICompatibleAdapter({
        baseURL: 'https://api.example.test/v1',
        model: 'm',
        includeUsage: true,
      })
    );
    const stop = chunks.find((c) => c.type === 'message_stop') as Extract<
      LLMStreamChunk,
      { type: 'message_stop' }
    >;

    expect(stop.usage).toMatchObject({ promptTokens: 185, completionTokens: 2, totalTokens: 187 });
    expect(stop.usage?.costUsd).toBeCloseTo(0.00010935, 10);
    expect(
      chunks.filter((c) => c.type === 'text_delta').map((c) => (c as { text: string }).text)
    ).toEqual(['Hi.']);
  });

  it('leaves the cost undefined, not zero, when the endpoint reports none', async () => {
    const noCost = {
      choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(sse([TEXT, STOP, noCost])))
    );

    const chunks = await drain(
      new OpenAICompatibleAdapter({
        baseURL: 'https://api.example.test/v1',
        model: 'm',
        includeUsage: true,
      })
    );
    const stop = chunks.find((c) => c.type === 'message_stop') as Extract<
      LLMStreamChunk,
      { type: 'message_stop' }
    >;

    expect(stop.usage?.totalTokens).toBe(11);
    expect(stop.usage?.costUsd).toBeUndefined();
  });

  it('reads the cost from a non-streaming reply too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'Hi.' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 185, completion_tokens: 1, cost_in_usd_ticks: 993_500 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
      )
    );

    const reply = await new OpenAICompatibleAdapter({
      baseURL: 'https://api.example.test/v1',
      model: 'm',
    }).complete({ messages: [{ role: 'user', content: 'Say hi.' }] });

    expect(reply.usage).toMatchObject({ promptTokens: 185, completionTokens: 1, totalTokens: 186 });
    expect(reply.usage.costUsd).toBeCloseTo(0.00009935, 10);
  });
});
