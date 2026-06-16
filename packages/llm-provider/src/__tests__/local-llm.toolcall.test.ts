/**
 * LocalLLMAdapter.complete() tool-calling tests.
 *
 * Regression guard for the loader-to-encoder-class gap: complete() (the method
 * AgentRunner calls) previously sent NO tools and parsed NO tool_calls, so a
 * local model wired into the headless agent never tool-called. These tests prove
 * complete() now (a) sends tools in the request and (b) maps OpenAI-format
 * tool_calls into toolUses + assistantBlocks + finishReason='tool_use'.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { LocalLLMAdapter } from '../adapters/local-llm';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function sentBodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LocalLLMAdapter.complete() — tool calling', () => {
  it('sends tools and parses tool_calls into toolUses + finishReason tool_use', async () => {
    // Native Ollama /api/chat shape (the adapter routes :11434 to the native
    // path; arguments is an OBJECT in native, a JSON string in OpenAI-compat).
    const body = {
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'write_file',
              arguments: { path: 'scene.holo', content: 'composition X {}' },
            },
          },
        ],
      },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 12,
      eval_count: 8,
      model: 'qwen3.5:4b',
    };
    const fetchMock = mockFetch(body);
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new LocalLLMAdapter({ baseURL: 'http://localhost:11434' });
    const resp = await adapter.complete({
      messages: [{ role: 'user', content: 'make a scene' }],
      tools: [
        {
          name: 'write_file',
          description: 'write a file',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' }, content: { type: 'string' } },
            required: ['path', 'content'],
          },
        },
      ],
    });

    // (a) tools were actually sent in the request body
    const sent = sentBodyOf(fetchMock);
    expect(Array.isArray(sent.tools)).toBe(true);
    const tools = sent.tools as Array<{ function?: { name?: string } }>;
    expect(tools[0]?.function?.name).toBe('write_file');

    // (b) tool_calls parsed into the unified shape AgentRunner consumes
    expect(resp.finishReason).toBe('tool_use');
    expect(resp.toolUses?.length).toBe(1);
    expect(resp.toolUses?.[0]?.name).toBe('write_file');
    expect(resp.toolUses?.[0]?.input).toEqual({
      path: 'scene.holo',
      content: 'composition X {}',
    });
    expect((resp.assistantBlocks ?? []).length).toBeGreaterThan(0);
  });

  it('omits tools and behaves as before when none are given', async () => {
    const body = {
      message: { role: 'assistant', content: 'hi' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 1,
      eval_count: 1,
      model: 'qwen3.5:4b',
    };
    const fetchMock = mockFetch(body);
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new LocalLLMAdapter({ baseURL: 'http://localhost:11434' });
    const resp = await adapter.complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(sentBodyOf(fetchMock).tools).toBeUndefined();
    expect(resp.finishReason).toBe('stop');
    expect(resp.toolUses).toBeUndefined();
    expect(resp.content).toBe('hi');
  });
});
