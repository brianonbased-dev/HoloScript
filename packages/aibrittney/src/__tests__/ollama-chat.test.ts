import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  chatOnceFromOllama,
  resetApiStyleCache,
  resolveApiStyle,
  resolveNumCtx,
  toOpenAIMessages,
  type ChatResult,
} from '../ollama-chat.js';
import type { ChatMessage } from '../session.js';

describe('resolveNumCtx', () => {
  const ENV_KEY = 'AIBRITTNEY_NUM_CTX';

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('returns 16384 when env var is unset', () => {
    expect(resolveNumCtx()).toBe(16384);
  });

  it('returns the env value when set to a positive integer', () => {
    process.env[ENV_KEY] = '8192';
    expect(resolveNumCtx()).toBe(8192);
  });

  it('returns 16384 for zero (not a valid context size)', () => {
    process.env[ENV_KEY] = '0';
    expect(resolveNumCtx()).toBe(16384);
  });

  it('returns 16384 for non-numeric string', () => {
    process.env[ENV_KEY] = 'invalid';
    expect(resolveNumCtx()).toBe(16384);
  });

  it('returns 16384 for negative value', () => {
    process.env[ENV_KEY] = '-1024';
    expect(resolveNumCtx()).toBe(16384);
  });
});

const STYLE_KEY = 'AIBRITTNEY_API_STYLE';
const HOST = 'http://127.0.0.1:18080';

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
}

/** A fetch double that records every request and answers (or throws) per URL. */
function recordingFetch(answer: (url: string) => Response | Error) {
  const calls: RecordedCall[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    const out = answer(url);
    if (out instanceof Error) throw out;
    return out;
  }) as typeof fetch;
  return { impl, calls };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** An OpenAI-style chat completion carrying `message`. */
function completion(message: Record<string, unknown>, completionTokens = 7): Response {
  return json(200, {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', ...message }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 20, completion_tokens: completionTokens },
  });
}

describe('resolveApiStyle', () => {
  beforeEach(() => {
    delete process.env[STYLE_KEY];
    resetApiStyleCache();
  });

  afterEach(() => {
    delete process.env[STYLE_KEY];
    resetApiStyleCache();
  });

  it('defaults to auto', () => {
    expect(resolveApiStyle(HOST)).toBe('auto');
  });

  it('honours the env pin, case- and whitespace-insensitively', () => {
    process.env[STYLE_KEY] = ' OpenAI ';
    expect(resolveApiStyle(HOST)).toBe('openai');
    process.env[STYLE_KEY] = 'ollama';
    expect(resolveApiStyle(HOST)).toBe('ollama');
  });

  it('treats an unknown value as auto', () => {
    process.env[STYLE_KEY] = 'anthropic';
    expect(resolveApiStyle(HOST)).toBe('auto');
  });
});

describe('chatOnceFromOllama with AIBRITTNEY_API_STYLE=openai', () => {
  beforeEach(() => {
    process.env[STYLE_KEY] = 'openai';
    resetApiStyleCache();
  });

  afterEach(() => {
    delete process.env[STYLE_KEY];
    resetApiStyleCache();
  });

  const history: ChatMessage[] = [
    { role: 'system', content: 'You are Brittney.' },
    { role: 'user', content: 'read a.holo' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_ab12cd_7', function: { name: 'read_file', arguments: { path: 'a.holo' } } },
      ],
    },
    { role: 'tool', name: 'read_file', tool_call_id: 'call_ab12cd_7', content: '{"ok":true}' },
  ];

  it('posts to /v1/chat/completions with stringified tool-call arguments and maps the reply back', async () => {
    const { impl, calls } = recordingFetch(() =>
      completion({
        content: null,
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"b.holo"}' },
          },
        ],
      })
    );
    const tools = [{ type: 'function' as const, function: { name: 'read_file' } }];

    const result = await chatOnceFromOllama({
      host: HOST,
      model: 'qwen3:4b',
      messages: history,
      tools,
      apiKey: 'test-key',
      fetchImpl: impl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${HOST}/v1/chat/completions`);
    expect(calls[0].headers.Authorization).toBe('Bearer test-key');
    expect(calls[0].body.model).toBe('qwen3:4b');
    expect(calls[0].body.stream).toBe(false);
    expect(calls[0].body.options).toBeUndefined();
    expect(calls[0].body.tools).toEqual(tools);
    expect(calls[0].body.messages[0]).toEqual({ role: 'system', content: 'You are Brittney.' });
    expect(calls[0].body.messages[2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_ab12cd_7',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"a.holo"}' },
        },
      ],
    });
    expect(calls[0].body.messages[3]).toEqual({
      role: 'tool',
      content: '{"ok":true}',
      tool_call_id: 'call_ab12cd_7',
    });

    expect(result).toEqual({
      ok: true,
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_abc', function: { name: 'read_file', arguments: { path: 'b.holo' } } },
        ],
      },
      evalCount: 7,
      evalDurationMs: undefined,
    });
  });

  it('keeps an argument string that is not a JSON object', async () => {
    const { impl } = recordingFetch(() =>
      completion({
        content: '',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'echo', arguments: 'not json' } },
        ],
      })
    );
    const result = await chatOnceFromOllama({
      host: HOST,
      model: 'm',
      messages: history,
      fetchImpl: impl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.tool_calls?.[0].function.arguments).toBe('not json');
    }
  });

  it('sends a tool result without tool_call_id without one: never the tool name', () => {
    // Assistant tool calls always carry their id (ChatMessage.tool_calls[].id is
    // required). tool_call_id on a tool result stays optional until `role`
    // becomes a discriminated union, so a missing one is omitted, never substituted.
    const wire = toOpenAIMessages([
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_ab12cd_8', function: { name: 'read_file', arguments: {} } }],
      },
      { role: 'tool', name: 'read_file', content: '{}' },
    ]);
    expect(wire[0].tool_calls?.[0]).toMatchObject({ id: 'call_ab12cd_8', type: 'function' });
    expect(wire[1]).not.toHaveProperty('tool_call_id');
    expect(wire[1]).toEqual({ role: 'tool', content: '{}' });
  });

  it('reports a top-level error object and a non-OK status in plain words', async () => {
    const errorBody = { error: { code: 500, message: 'model not loaded', type: 'server_error' } };

    const ok200 = recordingFetch(() => json(200, errorBody));
    expect(
      await chatOnceFromOllama({ host: HOST, model: 'm', messages: history, fetchImpl: ok200.impl })
    ).toEqual({
      ok: false,
      error: 'model not loaded',
    });

    const http500 = recordingFetch(() => json(500, errorBody));
    expect(
      await chatOnceFromOllama({
        host: HOST,
        model: 'm',
        messages: history,
        fetchImpl: http500.impl,
      })
    ).toEqual({
      ok: false,
      error: 'openai-compatible endpoint returned HTTP 500: model not loaded',
    });
  });
});

describe('chatOnceFromOllama with the default auto style', () => {
  beforeEach(() => {
    delete process.env[STYLE_KEY];
    resetApiStyleCache();
  });

  afterEach(() => {
    delete process.env[STYLE_KEY];
    resetApiStyleCache();
  });

  const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

  /** llama-server / holo-inference-proxy: no /api/chat, but /v1/chat/completions answers. */
  const llamaServer = (status: number) => (url: string) =>
    url.endsWith('/api/chat')
      ? new Response('File Not Found', { status })
      : completion({ content: 'hello from llama-server' });

  it.each([404, 405])(
    'falls back to /v1/chat/completions on a %i from /api/chat and remembers the host',
    async (status) => {
      const { impl, calls } = recordingFetch(llamaServer(status));

      const first = await chatOnceFromOllama({ host: HOST, model: 'm', messages, fetchImpl: impl });
      expect(first).toMatchObject({ ok: true, message: { content: 'hello from llama-server' } });
      expect(calls.map((c) => c.url)).toEqual([`${HOST}/api/chat`, `${HOST}/v1/chat/completions`]);
      expect(resolveApiStyle(HOST)).toBe('openai');

      const second = await chatOnceFromOllama({
        host: HOST,
        model: 'm',
        messages,
        fetchImpl: impl,
      });
      expect(second.ok).toBe(true);
      expect(calls).toHaveLength(3);
      expect(calls[2].url).toBe(`${HOST}/v1/chat/completions`);

      resetApiStyleCache();
      expect(resolveApiStyle(HOST)).toBe('auto');
    }
  );

  it('learns nothing from a host whose /v1 route is missing too', async () => {
    const { impl, calls } = recordingFetch(() => new Response('nope', { status: 404 }));

    const result = await chatOnceFromOllama({ host: HOST, model: 'm', messages, fetchImpl: impl });
    expect(result).toEqual({ ok: false, error: 'openai-compatible endpoint returned HTTP 404' });
    expect(resolveApiStyle(HOST)).toBe('auto');

    await chatOnceFromOllama({ host: HOST, model: 'm', messages, fetchImpl: impl });
    expect(calls.map((c) => c.url)).toEqual([
      `${HOST}/api/chat`,
      `${HOST}/v1/chat/completions`,
      `${HOST}/api/chat`,
      `${HOST}/v1/chat/completions`,
    ]);
  });

  it('returns a connection error from /api/chat without guessing', async () => {
    const { impl, calls } = recordingFetch(() => new Error('connect ECONNREFUSED 127.0.0.1:18080'));

    const result = await chatOnceFromOllama({ host: HOST, model: 'm', messages, fetchImpl: impl });
    expect(result).toEqual({
      ok: false,
      error: `failed to reach ollama at ${HOST}: connect ECONNREFUSED 127.0.0.1:18080`,
    });
    expect(calls).toHaveLength(1);
    expect(resolveApiStyle(HOST)).toBe('auto');
  });

  it('keeps talking Ollama when /api/chat answers', async () => {
    const { impl, calls } = recordingFetch(() =>
      json(200, {
        message: { role: 'assistant', content: 'hi there' },
        eval_count: 3,
        eval_duration: 2_000_000,
      })
    );

    const result = await chatOnceFromOllama({
      host: `${HOST}/`,
      model: 'm',
      messages,
      fetchImpl: impl,
    });
    expect(result).toEqual({
      ok: true,
      message: { role: 'assistant', content: 'hi there', tool_calls: undefined },
      evalCount: 3,
      evalDurationMs: 2,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${HOST}/api/chat`);
    expect(calls[0].body.options).toEqual({ num_ctx: 16384 });
    expect(resolveApiStyle(HOST)).toBe('auto');
  });

  it('never re-routes when the style is pinned to ollama', async () => {
    process.env[STYLE_KEY] = 'ollama';
    const { impl, calls } = recordingFetch(llamaServer(404));

    const result = await chatOnceFromOllama({ host: HOST, model: 'm', messages, fetchImpl: impl });
    expect(result).toEqual({ ok: false, error: 'ollama returned HTTP 404 ' });
    expect(calls).toHaveLength(1);
  });
});

// Exactly 9 alphanumerics: what the strictest chat templates (Mistral / Devstral / Nemo) accept.
const TOOL_CALL_ID = /^[A-Za-z0-9]{9}$/;

function toolCallIds(result: ChatResult): string[] {
  return result.ok ? (result.message.tool_calls ?? []).map((call) => call.id) : [];
}

describe('tool-call ids', () => {
  beforeEach(() => {
    delete process.env[STYLE_KEY];
    resetApiStyleCache();
  });

  afterEach(() => {
    delete process.env[STYLE_KEY];
    resetApiStyleCache();
  });

  const messages: ChatMessage[] = [{ role: 'user', content: 'go' }];
  const turn = (fetchImpl: typeof fetch) =>
    chatOnceFromOllama({ host: HOST, model: 'm', messages, fetchImpl });

  it('mints distinct ids for two calls to the same tool in one turn, on both routes', async () => {
    process.env[STYLE_KEY] = 'openai';
    const openai = recordingFetch(() =>
      completion({
        content: null,
        tool_calls: [
          { type: 'function', function: { name: 'read_file', arguments: '{"path":"a"}' } },
          { type: 'function', function: { name: 'read_file', arguments: '{"path":"b"}' } },
        ],
      })
    );
    const viaOpenAI = await turn(openai.impl);

    process.env[STYLE_KEY] = 'ollama';
    const ollama = recordingFetch(() =>
      json(200, {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { function: { name: 'read_file', arguments: { path: 'a' } } },
            { function: { name: 'read_file', arguments: { path: 'b' } } },
          ],
        },
      })
    );
    const viaOllama = await turn(ollama.impl);

    const ids = [...toolCallIds(viaOpenAI), ...toolCallIds(viaOllama)];
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(TOOL_CALL_ID);
  });

  it('keeps an id the server sent, on both routes', async () => {
    process.env[STYLE_KEY] = 'ollama';
    const ollama = recordingFetch(() =>
      json(200, {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'srv_9', function: { name: 'read_file', arguments: {} } }],
        },
      })
    );
    expect(toolCallIds(await turn(ollama.impl))).toEqual(['srv_9']);

    process.env[STYLE_KEY] = 'openai';
    const openai = recordingFetch(() =>
      completion({
        content: null,
        tool_calls: [
          { id: 'call_srv', type: 'function', function: { name: 'read_file', arguments: '{}' } },
        ],
      })
    );
    expect(toolCallIds(await turn(openai.impl))).toEqual(['call_srv']);
  });

  it('recovers text tool calls with ids that stay unique across iterations and routes', async () => {
    const text = '<tool_call>{"name":"read_file","arguments":{"path":"a"}}</tool_call>';

    process.env[STYLE_KEY] = 'ollama';
    const ollama = recordingFetch(() =>
      json(200, { message: { role: 'assistant', content: text } })
    );
    const turn1 = await turn(ollama.impl);
    const turn2 = await turn(ollama.impl);

    process.env[STYLE_KEY] = 'openai';
    const openai = recordingFetch(() => completion({ content: text }));
    const turn3 = await turn(openai.impl);

    const turns = [turn1, turn2, turn3];
    expect(turns.map((t) => t.ok && t.message.tool_calls?.[0]?.function.name)).toEqual([
      'read_file',
      'read_file',
      'read_file',
    ]);
    const ids = turns.flatMap(toolCallIds);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(TOOL_CALL_ID);
  });
});
