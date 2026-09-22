import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Session } from '../session.js';
import { runAgentTurn, capToolResult, type AgentEvent } from '../agent.js';
import { McpClient, type CallToolResult } from '../mcp-client.js';
import {
  InMemoryHoloDocumentStore,
  RefusableMutationController,
  type MutationPreview,
} from '../mutations.js';

/**
 * Fake Ollama: scripted responses, returns one queued response per call.
 * Lets us simulate "model issues a tool call → tool returns → model emits final text".
 */
function fakeOllamaFetch(scripted: Array<unknown>): typeof fetch {
  let call = 0;
  return (async (_url: string | URL, _init?: RequestInit) => {
    const body = scripted[call++];
    if (body === undefined) {
      throw new Error(`fakeOllamaFetch ran out of scripted responses (call ${call})`);
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

class StubMcpClient extends McpClient {
  public calls: Array<{ server: string; tool: string; args: Record<string, unknown> }> = [];
  constructor(private result: CallToolResult) {
    super({ endpoint: 'http://stub', apiKey: 'stub', timeoutMs: 1000 });
  }
  async callTool(args: {
    server: string;
    tool: string;
    args: Record<string, unknown>;
  }): Promise<CallToolResult> {
    this.calls.push(args);
    return this.result;
  }
}

describe('runAgentTurn', () => {
  it('returns plain text when the model does not request a tool', async () => {
    const session = new Session({ ollamaHost: 'http://fake', model: 'fake-model' });
    session.push('user', 'hello');
    const events: AgentEvent[] = [];
    const result = await runAgentTurn({
      session,
      mcp: new StubMcpClient({ ok: true, status: 200, data: {} }),
      onEvent: (e) => events.push(e),
      fetchImpl: fakeOllamaFetch([
        {
          message: { role: 'assistant', content: 'hi there' },
          eval_count: 3,
          eval_duration: 1_000_000,
        },
      ]),
    });
    expect(result.ok).toBe(true);
    expect(result.finalText).toBe('hi there');
    expect(result.toolCallsExecuted).toBe(0);
    expect(result.iterations).toBe(1);
    expect(events.find((e) => e.kind === 'final')?.message).toBe('hi there');
    // Final assistant text is committed to history.
    const last = session.messages().at(-1);
    expect(last?.role).toBe('assistant');
    expect(last?.content).toBe('hi there');
  });

  it('dispatches a tool call and incorporates the result on the next turn', async () => {
    const session = new Session({ ollamaHost: 'http://fake', model: 'fake-model' });
    session.push('user', 'where does the trait registry live?');
    const stub = new StubMcpClient({
      ok: true,
      status: 200,
      data: { hits: [{ file: 'packages/core/src/traits/registry.ts', line: 42 }] },
    });
    const events: AgentEvent[] = [];
    const result = await runAgentTurn({
      session,
      mcp: stub,
      onEvent: (e) => events.push(e),
      fetchImpl: fakeOllamaFetch([
        // turn 1: model requests a tool
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                function: {
                  name: 'holo_query_codebase',
                  arguments: { query: 'find', symbol: 'TraitRegistry' },
                },
              },
            ],
          },
        },
        // turn 2: model produces final text using the tool result
        {
          message: {
            role: 'assistant',
            content: 'TraitRegistry is at packages/core/src/traits/registry.ts:42.',
          },
        },
      ]),
    });
    expect(result.ok).toBe(true);
    expect(result.finalText).toContain('packages/core/src/traits/registry.ts');
    expect(result.toolCallsExecuted).toBe(1);
    expect(result.iterations).toBe(2);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]).toMatchObject({
      server: 'holoscript-tools',
      tool: 'holo_query_codebase',
      args: { query: 'find', symbol: 'TraitRegistry' },
    });
    // Session history should now contain: system, user, assistant (with tool_calls), tool, assistant (final)
    const history = session.messages();
    expect(history.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
    const toolMsg = history[3];
    expect(toolMsg.tool_call_id).toBe('call_1');
    expect(toolMsg.name).toBe('holo_query_codebase');
    expect(toolMsg.content).toContain('packages/core/src/traits/registry.ts');
  });

  it('handles unknown tool names without crashing the loop', async () => {
    const session = new Session({ ollamaHost: 'http://fake', model: 'fake-model' });
    session.push('user', 'do something');
    const result = await runAgentTurn({
      session,
      mcp: new StubMcpClient({ ok: true, status: 200, data: {} }),
      fetchImpl: fakeOllamaFetch([
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'x', function: { name: 'made_up_tool', arguments: {} } }],
          },
        },
        { message: { role: 'assistant', content: 'sorry, I cannot do that.' } },
      ]),
    });
    expect(result.ok).toBe(true);
    expect(result.finalText).toBe('sorry, I cannot do that.');
    expect(result.toolCallsExecuted).toBe(1);
    const toolMsg = session.messages().find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('unknown tool');
  });

  it('routes edit_holo through a refusable diff preview before applying', async () => {
    const session = new Session({ ollamaHost: 'http://fake', model: 'fake-model' });
    session.push('user', 'turn the cube blue');
    const store = new InMemoryHoloDocumentStore({
      active: 'cube { @color(red) }\n',
    });
    const mutations = new RefusableMutationController(store, {
      idFactory: () => 'preview_agent_1',
      now: () => new Date('2026-05-25T00:00:00.000Z'),
    });
    const stub = new StubMcpClient({ ok: true, status: 200, data: {} });
    const events: AgentEvent[] = [];

    const result = await runAgentTurn({
      session,
      mcp: stub,
      mutationController: mutations,
      onEvent: (event) => events.push(event),
      fetchImpl: fakeOllamaFetch([
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'edit_1',
                function: {
                  name: 'edit_holo',
                  arguments: {
                    documentId: 'active',
                    nextSource: 'cube { @color(blue) }\n',
                  },
                },
              },
            ],
          },
        },
        {
          message: { role: 'assistant', content: 'I have a diff preview ready for confirmation.' },
        },
      ]),
    });

    expect(result.ok).toBe(true);
    expect(stub.calls).toEqual([]);
    expect(store.read('active')).toBe('cube { @color(red) }\n');
    expect(events.some((event) => event.kind === 'mutation-preview')).toBe(true);

    const toolMsg = session
      .messages()
      .find((message) => message.role === 'tool' && message.name === 'edit_holo');
    const preview = JSON.parse(toolMsg?.content ?? '{}') as MutationPreview;
    expect(preview).toMatchObject({
      type: 'mutation-preview',
      previewId: 'preview_agent_1',
      requiresConfirmation: true,
      status: 'pending',
    });
    expect(preview.diff).toContain('-cube { @color(red) }');
    expect(preview.diff).toContain('+cube { @color(blue) }');
    expect(store.read('active')).toBe('cube { @color(red) }\n');

    await mutations.confirm(preview.previewId);

    expect(store.read('active')).toBe('cube { @color(blue) }\n');
  });

  it('caps iterations on a confused model', async () => {
    const session = new Session({ ollamaHost: 'http://fake', model: 'fake-model' });
    session.push('user', 'loop me');
    const looping = {
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'l',
            function: { name: 'holo_query_codebase', arguments: { query: 'find', symbol: 'X' } },
          },
        ],
      },
    };
    const result = await runAgentTurn({
      session,
      mcp: new StubMcpClient({ ok: true, status: 200, data: {} }),
      maxIterations: 3,
      fetchImpl: fakeOllamaFetch([looping, looping, looping]),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/max iterations/);
    expect(result.iterations).toBe(3);
    expect(result.toolCallsExecuted).toBe(3);
  });

  it('parses tool arguments from a JSON string when the model returns one', async () => {
    const session = new Session({ ollamaHost: 'http://fake', model: 'fake-model' });
    session.push('user', 'go');
    const stub = new StubMcpClient({ ok: true, status: 200, data: { ok: true } });
    await runAgentTurn({
      session,
      mcp: stub,
      fetchImpl: fakeOllamaFetch([
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 's',
                function: {
                  name: 'knowledge_query',
                  arguments: '{"search":"trait registry"}',
                },
              },
            ],
          },
        },
        { message: { role: 'assistant', content: 'done' } },
      ]),
    });
    expect(stub.calls[0].args).toEqual({ search: 'trait registry' });
  });
});

/**
 * Fake OpenAI-compatible server (llama-server / holo-inference-proxy): one
 * scripted completion per request, records every request body, and — like
 * llama-server builds that predate tool-call ids — omits `id` on tool_calls.
 */
function fakeOpenAIFetch(scripted: Array<Record<string, unknown>>) {
  const requests: Array<{ url: string; body: Record<string, any> }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const message = scripted[requests.length - 1];
    if (message === undefined) {
      throw new Error(`fakeOpenAIFetch ran out of scripted responses (call ${requests.length})`);
    }
    return new Response(
      JSON.stringify({
        choices: [{ index: 0, message: { role: 'assistant', ...message }, finish_reason: 'stop' }],
        usage: { completion_tokens: 1 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as unknown as typeof fetch;
  return { impl, requests };
}

/** A tool call exactly as an id-less server emits it: no `id`, arguments as a JSON string. */
function idlessCall(name: string, args: Record<string, unknown>) {
  return { type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

interface WireMessage {
  role: string;
  tool_calls?: Array<{ id?: string }>;
  tool_call_id?: string;
}

describe('runAgentTurn against an OpenAI-compatible server that omits tool-call ids', () => {
  const STYLE_KEY = 'AIBRITTNEY_API_STYLE';

  beforeEach(() => {
    process.env[STYLE_KEY] = 'openai';
  });

  afterEach(() => {
    delete process.env[STYLE_KEY];
  });

  it('announces the ids the tool results answer to, unique across two tool-call iterations', async () => {
    const session = new Session({ ollamaHost: 'http://127.0.0.1:18080', model: 'qwen3:4b' });
    session.push('user', 'look two things up, then two more');
    const stub = new StubMcpClient({ ok: true, status: 200, data: { hits: [] } });
    const server = fakeOpenAIFetch([
      // iteration 1: two calls to the same tool, no ids
      {
        content: null,
        tool_calls: [
          idlessCall('holo_query_codebase', { query: 'find', symbol: 'A' }),
          idlessCall('holo_query_codebase', { query: 'find', symbol: 'B' }),
        ],
      },
      // iteration 2: two more, still no ids
      {
        content: null,
        tool_calls: [
          idlessCall('holo_query_codebase', { query: 'find', symbol: 'C' }),
          idlessCall('knowledge_query', { search: 'D' }),
        ],
      },
      // iteration 3: the final answer
      { content: 'done' },
    ]);

    const result = await runAgentTurn({
      session,
      mcp: stub,
      maxIterations: 3,
      fetchImpl: server.impl,
    });
    expect(result).toMatchObject({
      ok: true,
      finalText: 'done',
      toolCallsExecuted: 4,
      iterations: 3,
    });
    expect(server.requests.map((r) => r.url)).toEqual(
      Array(3).fill('http://127.0.0.1:18080/v1/chat/completions')
    );

    // The third request carries the whole conversation as the server saw it.
    const wire = server.requests[2].body.messages as WireMessage[];
    const announced: string[] = [];
    const answered: string[] = [];
    let current: string[] = [];
    let matched = 0;
    for (const m of wire) {
      if (m.role === 'assistant' && m.tool_calls) {
        current = m.tool_calls.map((c) => c.id ?? '<missing>');
        announced.push(...current);
      }
      if (m.role === 'tool') {
        answered.push(m.tool_call_id ?? '<missing>');
        // The id must come from the assistant message immediately before this result.
        if (m.tool_call_id !== undefined && current.includes(m.tool_call_id)) matched += 1;
      }
    }
    expect(`${matched} of ${answered.length} matched`).toBe('4 of 4 matched');
    expect(announced).toHaveLength(4);
    expect(new Set(announced).size).toBe(4);
    expect([...answered].sort()).toEqual([...announced].sort());
    // Exactly 9 alphanumerics: what the strictest chat templates (Mistral / Devstral / Nemo) accept.
    for (const id of announced) expect(id).toMatch(/^[A-Za-z0-9]{9}$/);
    // Never a tool name where an id belongs.
    expect(answered).not.toContain('holo_query_codebase');
    expect(answered).not.toContain('knowledge_query');
  });
});

describe('tool-result cap', () => {
  const CAP_KEY = 'AIBRITTNEY_TOOL_RESULT_MAX_CHARS';

  afterEach(() => {
    delete process.env[CAP_KEY];
  });

  it('cuts to at most maxChars and states exactly how much was dropped', () => {
    const text = 'x'.repeat(50_000);
    for (const cap of [4000, 100, 27]) {
      const capped = capToolResult(text, cap);
      expect(capped.length).toBeLessThanOrEqual(cap);
      const marker = capped.match(/\[truncated (\d+) chars\]$/);
      expect(marker).not.toBeNull();
      const kept = capped.length - (marker as RegExpMatchArray)[0].length;
      expect(kept + Number((marker as RegExpMatchArray)[1])).toBe(text.length);
      expect(capped.startsWith('x'.repeat(kept))).toBe(true);
    }
    expect(capToolResult('short', 4000)).toBe('short');
    expect(capToolResult('x'.repeat(4000), 4000)).toBe('x'.repeat(4000));
  });

  /** One iteration that pushes `blob` through a real (stubbed) tool call, then answers. */
  async function dumpThroughTool(blob: string) {
    const session = new Session({ ollamaHost: 'http://fake', model: 'fake-model' });
    session.push('user', 'dump it');
    const stub = new StubMcpClient({ ok: true, status: 200, data: { blob } });
    const events: AgentEvent[] = [];
    const result = await runAgentTurn({
      session,
      mcp: stub,
      onEvent: (e) => events.push(e),
      fetchImpl: fakeOllamaFetch([
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'big',
                function: {
                  name: 'holo_query_codebase',
                  arguments: { query: 'find', symbol: 'X' },
                },
              },
            ],
          },
        },
        { message: { role: 'assistant', content: 'done' } },
      ]),
    });
    expect(result.ok).toBe(true);
    const toolMsg = session.messages().find((m) => m.role === 'tool');
    if (!toolMsg) throw new Error('no tool message in history');
    return { content: toolMsg.content, events, raw: JSON.stringify({ blob }) };
  }

  it('a 50 KB tool result enters the history under the default 4000-char cap, with the marker', async () => {
    const { content, events, raw } = await dumpThroughTool('y'.repeat(50 * 1024));
    expect(raw.length).toBeGreaterThan(50_000);
    expect(content.length).toBeLessThanOrEqual(4000);
    expect(content.startsWith('{"blob":"yyyy')).toBe(true);
    expect(content).toMatch(/\[truncated \d+ chars\]$/);
    expect(events.find((e) => e.kind === 'tool-result')?.message).toContain(
      `${raw.length} bytes, ${content.length} kept`
    );
  });

  it('honours AIBRITTNEY_TOOL_RESULT_MAX_CHARS and leaves a small result untouched', async () => {
    process.env[CAP_KEY] = '200';
    const big = await dumpThroughTool('z'.repeat(1000));
    expect(big.content.length).toBeLessThanOrEqual(200);
    expect(big.content).toMatch(/\[truncated \d+ chars\]$/);

    const small = await dumpThroughTool('ok');
    expect(small.content).toBe('{"blob":"ok"}');
    expect(small.events.find((e) => e.kind === 'tool-result')?.message).toContain('13 bytes)');
  });
});
