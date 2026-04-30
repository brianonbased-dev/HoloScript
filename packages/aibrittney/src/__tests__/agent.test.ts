import { describe, it, expect } from 'vitest';
import { Session } from '../session.js';
import { runAgentTurn, type AgentEvent } from '../agent.js';
import { McpClient, type CallToolResult } from '../mcp-client.js';

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
  async callTool(args: { server: string; tool: string; args: Record<string, unknown> }): Promise<CallToolResult> {
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
        { message: { role: 'assistant', content: 'hi there' }, eval_count: 3, eval_duration: 1_000_000 },
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
    expect(history.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'assistant']);
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
            tool_calls: [
              { id: 'x', function: { name: 'made_up_tool', arguments: {} } },
            ],
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
