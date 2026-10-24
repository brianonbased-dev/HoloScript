import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CodebaseGraph } from '../engine/CodebaseGraph';
import type { SymbolSearchIndex } from '../engine/SearchIndex';
import type { ExternalSymbolDefinition } from '../engine/types';
import { GraphRAGEngine } from '../engine/GraphRAGEngine';
import { configureConfigSecretResolver, resetConfigSecretResolver } from '@holoscript/config';
import * as graphRag from './graph-rag-tools';
import {
  handleGraphRagTool,
  isGraphRAGReady,
  resetGraphRAGStateForTests,
  setGraphRAGState,
} from './graph-rag-tools';

function fixture() {
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
  const hit = { symbol, score: 0.99, file: symbol.filePath, type: symbol.type };
  const index: SymbolSearchIndex = {
    search: async () => [hit],
    searchWithFilters: async () => [hit],
  };
  const graph = {
    getCallersOf: () => [],
    getCalleesOf: () => [],
    getSymbolImpact: () => new Set<string>(),
    getCommunityForFile: () => 'absorb-service',
    getSymbolsInFile: (file: string) => (file === symbol.filePath ? [symbol] : []),
  } as unknown as CodebaseGraph;
  return { index, engine: new GraphRAGEngine(graph, index) };
}

const USER = { ownerId: 'gh-user-1', serverKeysAllowed: false };

describe('holo_ask_codebase / GraphRAG for remote callers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetGraphRAGStateForTests();
    resetConfigSecretResolver();
  });

  it('never resolves a server provider key for a non-service caller', async () => {
    const asked: string[] = [];
    configureConfigSecretResolver({
      async resolve(name: string) {
        asked.push(name);
        return name.endsWith('_API_KEY') ? 'server-provider-key-placeholder' : undefined;
      },
    });
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { index, engine } = fixture();
    setGraphRAGState(index, engine, { ownerId: 'gh-user-1' });

    const result = (await handleGraphRagTool(
      'holo_ask_codebase',
      { question: 'What is AbsorbService?', llmProvider: 'openai', topK: 1 },
      USER
    )) as { refused?: boolean; status?: number };

    expect(result.refused).toBe(true);
    expect(result.status).toBe(403);
    expect(asked).not.toContain('OPENAI_API_KEY');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers locally (no hosted model) when a non-service caller names no provider', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { index, engine } = fixture();
    setGraphRAGState(index, engine, { ownerId: 'gh-user-1' });

    const result = (await handleGraphRagTool(
      'holo_ask_codebase',
      { question: 'What is AbsorbService?', topK: 1 },
      USER
    )) as { fallback?: string; llmProvider?: string };

    expect(result.fallback).toBe('extractive-graphrag');
    expect(result.llmProvider).toBe('none');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keys GraphRAG state by owner: one owner's graph is invisible to another and to no-owner calls", async () => {
    const { index, engine } = fixture();
    setGraphRAGState(index, engine, { ownerId: 'alice' });

    // The owner's graph did not land in the shared slot.
    expect(isGraphRAGReady()).toBe(false);
    for (const ctx of [{ ownerId: 'bob' }, { ownerId: null }, {}]) {
      const r = (await handleGraphRagTool(
        'holo_semantic_search',
        { query: 'AbsorbService' },
        ctx
      )) as {
        error?: string;
        results?: unknown[];
      };
      expect(r.results).toBeUndefined();
      expect(r.error).toBeDefined();
    }
    const own = (await handleGraphRagTool(
      'holo_semantic_search',
      { query: 'AbsorbService' },
      { ownerId: 'alice' }
    )) as { error?: string };
    expect(own.error).toBeUndefined();
  });

  it('a remote call never reads the shared slot', async () => {
    const { index, engine } = fixture();
    setGraphRAGState(index, engine); // operator's shared graph
    const r = (await handleGraphRagTool(
      'holo_semantic_search',
      { query: 'AbsorbService' },
      USER
    )) as {
      error?: string;
    };
    expect(r.error).toBeDefined();
  });

  it('holds at most MAX_OWNER_GRAPH_RAG_STATES owners, dropping the least recently used', () => {
    const max = graphRag.MAX_OWNER_GRAPH_RAG_STATES;
    expect(max).toBe(64);
    const { index, engine } = fixture();
    for (let i = 0; i < max; i++) setGraphRAGState(index, engine, { ownerId: `o-${i}` });
    expect(graphRag.getOwnerGraphRAGState('o-0')).not.toBeNull(); // touch
    setGraphRAGState(index, engine, { ownerId: 'o-new' });
    expect(graphRag.getOwnerGraphRAGState('o-1')).toBeNull();
    expect(graphRag.getOwnerGraphRAGState('o-0')).not.toBeNull();
    expect(graphRag.getOwnerGraphRAGState('o-new')).not.toBeNull();
  });
});
