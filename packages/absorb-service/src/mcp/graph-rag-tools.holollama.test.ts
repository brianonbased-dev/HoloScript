import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHoloLlamaLiveEndpoint } from '@holoscript/holollama';
import type { CodebaseGraph } from '../engine/CodebaseGraph';
import type { SymbolSearchIndex } from '../engine/SearchIndex';
import type { ExternalSymbolDefinition } from '../engine/types';
import { GraphRAGEngine } from '../engine/GraphRAGEngine';
import { configureConfigSecretResolver, resetConfigSecretResolver } from '@holoscript/config';
import {
  createHoloLlamaSynthesisProvider,
  graphRagTools,
  handleGraphRagTool,
  HOLOLLAMA_SYNTHESIS_RECEIPT_SCHEMA,
  normalizeHoloLlamaChatCompletionsUrl,
  resetGraphRAGStateForTests,
  setGraphRAGState,
} from './graph-rag-tools';

const originalHoloLlamaEndpoint = process.env.HOLOLLAMA_ENDPOINT;
const originalHoloLlamaProfile = process.env.HOLOLLAMA_PROFILE;
const originalJetsonLiveEndpoint = process.env.HOLO_LLAMA_JETSON_ENDPOINT;

describe('holo_ask_codebase HoloLlama synthesis lane', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetGraphRAGStateForTests();
    resetConfigSecretResolver();
    if (originalHoloLlamaEndpoint === undefined) {
      delete process.env.HOLOLLAMA_ENDPOINT;
    } else {
      process.env.HOLOLLAMA_ENDPOINT = originalHoloLlamaEndpoint;
    }
    if (originalHoloLlamaProfile === undefined) {
      delete process.env.HOLOLLAMA_PROFILE;
    } else {
      process.env.HOLOLLAMA_PROFILE = originalHoloLlamaProfile;
    }
    if (originalJetsonLiveEndpoint === undefined) {
      delete process.env.HOLO_LLAMA_JETSON_ENDPOINT;
    } else {
      process.env.HOLO_LLAMA_JETSON_ENDPOINT = originalJetsonLiveEndpoint;
    }
  });

  it('exposes HoloLlama as an explicit synthesis provider without making it an embedding lane', () => {
    const askTool = graphRagTools.find((tool) => tool.name === 'holo_ask_codebase');
    const inputSchema = askTool?.inputSchema as
      | {
          properties?: Record<string, { enum?: string[]; type?: string; description?: string }>;
        }
      | undefined;

    expect(inputSchema?.properties?.llmProvider.enum).toContain('holollama');
    expect(inputSchema?.properties?.llmProvider.description).toContain('Default is HoloLlama');
    expect(inputSchema?.properties?.llmApiKey.description).toContain('explicitly selected cloud');
    expect(inputSchema?.properties?.holoLlamaProfile.enum).toEqual([
      'jetson-orin',
      'laptop-windows',
      'vast-linux-gpu',
    ]);
    expect(inputSchema?.properties?.holoLlamaEndpoint.type).toBe('string');
    expect(inputSchema?.properties?.holoLlamaEndpoint.description).toContain('OpenAI-compatible');
  });

  it('normalizes base, v1, and chat-completions HoloLlama endpoints', () => {
    expect(normalizeHoloLlamaChatCompletionsUrl('http://127.0.0.1:18080')).toBe(
      'http://127.0.0.1:18080/v1/chat/completions'
    );
    expect(normalizeHoloLlamaChatCompletionsUrl('http://127.0.0.1:18080/v1/')).toBe(
      'http://127.0.0.1:18080/v1/chat/completions'
    );
    expect(
      normalizeHoloLlamaChatCompletionsUrl('http://127.0.0.1:18080/v1/chat/completions/')
    ).toBe('http://127.0.0.1:18080/v1/chat/completions');
  });

  it('creates an OpenAI-compatible provider with an Absorb synthesis receipt', async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'local HoloLlama answer' } }],
        }),
        {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });

    const provider = await createHoloLlamaSynthesisProvider({
      profile: 'jetson-orin',
      endpoint: 'http://127.0.0.1:18080/v1',
      model: 'brittney-edge:test',
      generatedAt: '2026-07-05T00:00:00.000Z',
      fetchImpl,
    });

    const response = await provider.complete({
      messages: [{ role: 'user', content: 'Explain Absorb.' }],
    });

    expect(response.content).toBe('local HoloLlama answer');
    expect(String(calls[0]?.input)).toBe('http://127.0.0.1:18080/v1/chat/completions');
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      stream: boolean;
    };
    expect(body).toEqual({
      model: 'brittney-edge:test',
      messages: [{ role: 'user', content: 'Explain Absorb.' }],
      stream: false,
    });
    expect(provider.receipt).toMatchObject({
      schema: HOLOLLAMA_SYNTHESIS_RECEIPT_SCHEMA,
      generatedAt: '2026-07-05T00:00:00.000Z',
      provider: 'holollama',
      role: 'answer-synthesis',
      profile: 'jetson-orin',
      registryHandle: 'jetson-brittney-edge',
      endpoint: 'http://127.0.0.1:18080/v1',
      chatCompletionsUrl: 'http://127.0.0.1:18080/v1/chat/completions',
      model: 'brittney-edge:test',
      node: 'jetson-orin',
      registerAs: 'jetson-brittney-edge',
      embeddingProvider: 'holoembed',
      embeddingPolicy: 'holoembed-query-tower-only',
      graphProvider: 'holograph',
    });
  });

  it('never targets the jetson-orin bind wildcard 0.0.0.0 as a connect endpoint (task_1784541081251_sdmp)', async () => {
    // Reproduces the observed bug: with no explicit endpoint and no
    // HOLOLLAMA_ENDPOINT/HOLOLLAMA_URL config secret, the default jetson-orin
    // profile's compiled bundle.registryEntry.endpoint is bind-derived
    // (`http://0.0.0.0:18080/v1` — the llama-server `--host` flag, never a
    // valid CONNECT target). createHoloLlamaSynthesisProvider must fall back
    // to the package's own live-endpoint resolver instead, so a bare
    // holo_ask_codebase call never dials an address that can never answer.
    delete process.env.HOLOLLAMA_ENDPOINT;
    delete process.env.HOLO_LLAMA_JETSON_ENDPOINT;

    const provider = await createHoloLlamaSynthesisProvider({
      profile: 'jetson-orin',
      generatedAt: '2026-07-20T00:00:00.000Z',
      fetchImpl: vi.fn(),
    });

    expect(provider.receipt.endpoint).not.toContain('0.0.0.0');
    expect(provider.receipt.chatCompletionsUrl).not.toContain('0.0.0.0');
    expect(provider.receipt.endpoint).toBe(resolveHoloLlamaLiveEndpoint('jetson-orin'));
  });

  it('resolves Jetson HoloLlama profile and endpoint through the HoloKey-aware config bridge', async () => {
    configureConfigSecretResolver({
      async resolve(nameOrRef: string) {
        if (nameOrRef === 'HOLOLLAMA_PROFILE') return 'jetson-orin';
        if (nameOrRef === 'HOLOLLAMA_ENDPOINT') return 'http://jetson.local:18080';
        return undefined;
      },
    });

    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Jetson-backed HoloLlama answer' } }],
        }),
        {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });

    const provider = await createHoloLlamaSynthesisProvider({
      generatedAt: '2026-07-06T00:00:00.000Z',
      fetchImpl,
    });

    expect(provider.receipt).toMatchObject({
      generatedAt: '2026-07-06T00:00:00.000Z',
      profile: 'jetson-orin',
      endpoint: 'http://jetson.local:18080',
      chatCompletionsUrl: 'http://jetson.local:18080/v1/chat/completions',
      registryHandle: 'jetson-brittney-edge',
    });

    const response = await provider.complete({
      messages: [{ role: 'user', content: 'Use the Jetson lane.' }],
    });
    expect(response.content).toBe('Jetson-backed HoloLlama answer');
    expect(String(calls[0]?.input)).toBe('http://jetson.local:18080/v1/chat/completions');
  });

  it('defaults holo_ask_codebase synthesis to HoloLlama even when cloud keys exist', async () => {
    configureConfigSecretResolver({
      async resolve(nameOrRef: string) {
        if (nameOrRef === 'HOLOLLAMA_PROFILE') return 'jetson-orin';
        if (nameOrRef === 'HOLOLLAMA_URL') return 'http://127.0.0.1:18080/v1';
        if (nameOrRef === 'OPENROUTER_API_KEY') return 'sk-openrouter-test';
        if (nameOrRef === 'ANTHROPIC_API_KEY') return 'sk-anthropic-test';
        if (nameOrRef === 'OPENAI_API_KEY') return 'sk-openai-test';
        if (nameOrRef === 'GEMINI_API_KEY') return 'sk-gemini-test';
        return undefined;
      },
    });

    const symbol: ExternalSymbolDefinition = {
      name: 'AbsorbService',
      type: 'class',
      filePath: 'packages/absorb-service/src/index.ts',
      line: 12,
      column: 1,
      language: 'typescript',
      visibility: 'public',
      signature: 'class AbsorbService',
    };
    const searchResult = {
      symbol,
      score: 0.99,
      file: symbol.filePath,
      type: symbol.type,
    };
    const index: SymbolSearchIndex = {
      search: async () => [searchResult],
      searchWithFilters: async () => [searchResult],
    };
    const graph = {
      getCallersOf: () => [],
      getCalleesOf: () => [],
      getSymbolImpact: () => new Set<string>(),
      getCommunityForFile: () => 'absorb-service',
      getSymbolsInFile: (file: string) => (file === symbol.filePath ? [symbol] : []),
    } as unknown as CodebaseGraph;
    const engine = new GraphRAGEngine(graph, index);
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Default HoloLlama answer' } }],
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );

    setGraphRAGState(index, engine);
    const result = (await handleGraphRagTool('holo_ask_codebase', {
      question: 'Which provider answers by default?',
      topK: 1,
    })) as {
      answer?: string;
      llmProvider?: string;
      holoLlamaReceipt?: { schema: string; endpoint: string; graphProvider: string };
    };

    expect(result.answer).toBe('Default HoloLlama answer');
    expect(result.llmProvider).toBe('holollama');
    expect(result.holoLlamaReceipt).toMatchObject({
      schema: HOLOLLAMA_SYNTHESIS_RECEIPT_SCHEMA,
      endpoint: 'http://127.0.0.1:18080/v1',
      graphProvider: 'holograph',
    });
    expect(String(calls[0]?.input)).toBe('http://127.0.0.1:18080/v1/chat/completions');
  });

  it('attaches a HoloLlama receipt to holo_ask_codebase answers', async () => {
    const symbol: ExternalSymbolDefinition = {
      name: 'AbsorbService',
      type: 'class',
      filePath: 'packages/absorb-service/src/index.ts',
      line: 12,
      column: 1,
      language: 'typescript',
      visibility: 'public',
      signature: 'class AbsorbService',
    };
    const searchResult = {
      symbol,
      score: 0.99,
      file: symbol.filePath,
      type: symbol.type,
    };
    const index: SymbolSearchIndex = {
      search: async () => [searchResult],
      searchWithFilters: async () => [searchResult],
    };
    const graph = {
      getCallersOf: () => [],
      getCalleesOf: () => [],
      getSymbolImpact: () => new Set<string>(),
      getCommunityForFile: () => 'absorb-service',
      getSymbolsInFile: (file: string) => (file === symbol.filePath ? [symbol] : []),
    } as unknown as CodebaseGraph;
    const engine = new GraphRAGEngine(graph, index);
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Absorb uses GraphRAG context.' } }],
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );

    setGraphRAGState(index, engine);
    const result = (await handleGraphRagTool('holo_ask_codebase', {
      question: 'How does Absorb answer codebase questions?',
      llmProvider: 'holollama',
      holoLlamaEndpoint: 'http://127.0.0.1:18080/v1',
      llmModel: 'brittney-edge:test',
      topK: 1,
    })) as {
      answer?: string;
      llmProvider?: string;
      citations?: Array<{ name: string; file: string; line: number }>;
      holoLlamaReceipt?: { schema: string; embeddingProvider: string; graphProvider: string };
    };

    expect(result.answer).toBe('Absorb uses GraphRAG context.');
    expect(result.llmProvider).toBe('holollama');
    expect(result.citations).toEqual([
      { name: 'AbsorbService', file: 'packages/absorb-service/src/index.ts', line: 12 },
    ]);
    expect(result.holoLlamaReceipt).toMatchObject({
      schema: HOLOLLAMA_SYNTHESIS_RECEIPT_SCHEMA,
      embeddingProvider: 'holoembed',
      graphProvider: 'holograph',
    });
    expect(String(calls[0]?.input)).toBe('http://127.0.0.1:18080/v1/chat/completions');
  });

  it(
    'returns an honest no-answer status (not a fake answer string) when the LLM is ' +
      'unreachable AND the extractive fallback has no citable context (task_1784541081251_sdmp)',
    async () => {
      // Reproduces the observed bug end-to-end: the configured LLM endpoint is
      // unreachable (fetch rejects), so holo_ask_codebase falls back to
      // buildExtractiveCodebaseAnswer — but the retrieved context's citations
      // don't resolve against the graph (getSymbolsInFile returns []), so the
      // provenance guard rejects every citation. Previously this produced
      // `answer: "[Provenance guard rejected: ...]"` — a string that reads
      // like failed prose an agent could relay as if it were the answer. It
      // must instead be an honest, machine-checkable "no answer" status.
      const symbol: ExternalSymbolDefinition = {
        name: 'checkRegistryColdStart',
        type: 'function',
        filePath: 'scripts/holo-ci/check-registry-cold-start.mjs',
        line: 3,
        column: 1,
        language: 'javascript',
        visibility: 'public',
        signature: 'function checkRegistryColdStart()',
      };
      const searchResult = {
        symbol,
        score: 0.11,
        file: symbol.filePath,
        type: symbol.type,
      };
      const index: SymbolSearchIndex = {
        search: async () => [searchResult],
        searchWithFilters: async () => [searchResult],
      };
      const graph = {
        getCallersOf: () => [],
        getCalleesOf: () => [],
        getSymbolImpact: () => new Set<string>(),
        getCommunityForFile: () => undefined,
        // Every citation is unresolvable against the graph, regardless of file.
        getSymbolsInFile: () => [],
      } as unknown as CodebaseGraph;
      const engine = new GraphRAGEngine(graph, index);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('fetch failed');
        })
      );

      setGraphRAGState(index, engine);
      const result = (await handleGraphRagTool('holo_ask_codebase', {
        question: 'How does seat provisioning work in hooks/sessionstart/seat-identity.mjs?',
        llmProvider: 'ollama',
        topK: 1,
      })) as {
        answered?: boolean;
        answer?: string | null;
        note?: string;
        fallback?: string;
        fallbackReason?: string;
        citations?: unknown[];
        context?: unknown[];
        provenanceGuard?: { passed?: boolean; unresolvedCount?: number };
      };

      expect(result.fallback).toBe('extractive-graphrag');
      expect(result.fallbackReason).toContain('fetch failed');
      expect(result.provenanceGuard?.passed).toBe(false);
      expect(result.answered).toBe(false);
      // The answer field must be null, not a bracket-string that reads like
      // failed prose (`[Provenance guard rejected: ...]`) an agent could
      // relay verbatim as if it were a real answer.
      expect(result.answer).toBeNull();
      expect(result.note).toBeTruthy();
      expect(result.note).toContain('No LLM was reachable');
      expect(result.citations).toEqual([]);
      // The raw structural context still comes through — a caller can use it
      // even though nothing was synthesized.
      expect(result.context?.length).toBeGreaterThan(0);
    }
  );
});
