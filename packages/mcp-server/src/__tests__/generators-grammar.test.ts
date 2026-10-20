import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateHoloScriptGbnf } from '@holoscript/core/compiler';

/**
 * Task rnbt — the whole-program grammar guard reaches the local model, and only it.
 *
 * A `.holo` request to `local-llm` carries the GBNF that holds decoding to one
 * `composition "Name" { ... }` program that parses (llama.cpp applies it on the
 * OpenAI-compatible path). Cloud providers never receive it, and `.hsplus` requests
 * do not either: the grammar describes `.holo` programs only. A local server that
 * refuses the grammar (HoloServe takes a grammar name) gets the request again without it.
 */
const state = vi.hoisted(() => ({
  registered: ['local-llm'] as string[],
  calls: [] as Array<{ provider: string; request: Record<string, unknown> }>,
  // How the server fails a request that carries the grammar: a status code (HoloServe takes
  // a grammar name and answers 400), or a failure with none (a timeout); null succeeds.
  failWithGrammar: null as null | { statusCode?: number; message: string },
}));

vi.mock('@holoscript/llm-provider', () => ({
  createProviderManager: vi.fn(() => ({
    getRegisteredProviders: () => state.registered,
    getProvider: (name: string) => ({
      generateHoloScript: async (request: Record<string, unknown>) => {
        state.calls.push({ provider: name, request });
        if (state.failWithGrammar && 'grammar' in request) {
          const { statusCode, message } = state.failWithGrammar;
          throw Object.assign(new Error(message), statusCode ? { statusCode } : {});
        }
        return {
          code: 'composition "Lamp" {\n  object "lamp" {\n    geometry: "sphere"\n  }\n}',
          provider: name,
          detectedTraits: [],
        };
      },
    }),
  })),
}));

describe('generators — grammar guard for local models', () => {
  beforeEach(() => {
    state.calls.length = 0;
    state.failWithGrammar = null;
    delete process.env.HOLOSCRIPT_MCP_AI_PROVIDER;
  });

  it('a local-llm server that refuses the grammar is asked once more without it', async () => {
    state.registered = ['local-llm'];
    state.failWithGrammar = {
      statusCode: 400,
      message: 'Local LLM server returned 400: unknown grammar',
    };
    const { generateSceneForMCP } = await import('../generators');
    const result = await generateSceneForMCP('a lamp');
    expect(result.source).toBe('ai');
    expect(result.code).toContain('composition "Lamp"');
    expect(state.calls).toHaveLength(2);
    expect(state.calls[0].request.grammar).toBe(generateHoloScriptGbnf());
    expect(state.calls[1].provider).toBe('local-llm');
    expect(state.calls[1].request).not.toHaveProperty('grammar');
    expect(result.grammarDropped).toBe(true);
  });

  // claude6, rnbt round 2: only a refusal of the grammar earns the second call. The adapter
  // already retried a 5xx, and a timeout repeated without the grammar doubles the wait.
  it.each([
    ['a 503', { statusCode: 503, message: 'Local LLM server returned 503: busy' }],
    ['a timeout', { message: 'The operation was aborted due to timeout' }],
  ])(
    '%s with the grammar makes exactly one call and keeps the grammar',
    async (_label, failure) => {
      state.registered = ['local-llm'];
      state.failWithGrammar = failure;
      const { generateSceneForMCP } = await import('../generators');
      const result = await generateSceneForMCP('a lamp');
      expect(state.calls).toHaveLength(1);
      expect(state.calls[0].request.grammar).toBe(generateHoloScriptGbnf());
      expect(result.source).toBe('heuristic');
      expect(result.grammarDropped).toBeUndefined();
    }
  );

  it('a .holo scene request to local-llm carries the whole-program grammar', async () => {
    state.registered = ['local-llm'];
    const { generateSceneForMCP } = await import('../generators');
    const result = await generateSceneForMCP('a lamp');
    expect(result.source).toBe('ai');
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].provider).toBe('local-llm');
    expect(state.calls[0].request.targetFormat).toBe('holo');
    expect(state.calls[0].request.grammar).toBe(generateHoloScriptGbnf());
    expect(String(state.calls[0].request.grammar)).toContain('root ::= ws composition ws');
  });

  it('a cloud provider never receives the grammar', async () => {
    state.registered = ['anthropic'];
    const { generateSceneForMCP } = await import('../generators');
    await generateSceneForMCP('a lamp');
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].provider).toBe('anthropic');
    expect(state.calls[0].request).not.toHaveProperty('grammar');
  });

  // A .holo file is a composition, so an object asked for in .holo comes back as a
  // one-object program: the grammar holds the model to that shape.
  it('a .holo object request to local-llm carries the grammar and keeps the program', async () => {
    state.registered = ['local-llm'];
    const { generateObjectForMCP } = await import('../generators');
    const result = await generateObjectForMCP('a lamp', { format: 'holo' });
    expect(result.source).toBe('ai');
    expect(result.code).toContain('composition "Lamp"');
    expect(result.code).toContain('object "lamp"');
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].request.grammar).toBe(generateHoloScriptGbnf());
  });

  it('an .hsplus object request to local-llm carries no grammar', async () => {
    state.registered = ['local-llm'];
    const { generateObjectForMCP } = await import('../generators');
    await generateObjectForMCP('a lamp', { format: 'hsplus' });
    expect(state.calls.length).toBeGreaterThan(0);
    for (const call of state.calls) {
      expect(call.request.targetFormat).toBe('hsplus');
      expect(call.request).not.toHaveProperty('grammar');
    }
  });
});
