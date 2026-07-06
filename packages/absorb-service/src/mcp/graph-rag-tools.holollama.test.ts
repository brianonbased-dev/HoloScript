import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CodebaseGraph } from '../engine/CodebaseGraph';
import type { SymbolSearchIndex } from '../engine/SearchIndex';
import type { ExternalSymbolDefinition } from '../engine/types';
import { GraphRAGEngine } from '../engine/GraphRAGEngine';
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

describe('holo_ask_codebase HoloLlama synthesis lane', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetGraphRAGStateForTests();
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
  });

  it('exposes HoloLlama as an explicit synthesis provider without making it an embedding lane', () => {
    const askTool = graphRagTools.find((tool) => tool.name === 'holo_ask_codebase');
    const inputSchema = askTool?.inputSchema as
      | {
          properties?: Record<string, { enum?: string[]; type?: string; description?: string }>;
        }
      | undefined;

    expect(inputSchema?.properties?.llmProvider.enum).toContain('holollama');
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
});
