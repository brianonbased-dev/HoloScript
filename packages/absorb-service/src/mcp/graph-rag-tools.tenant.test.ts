import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodebaseGraph } from '../engine/CodebaseGraph';
import { GraphRAGEngine } from '../engine/GraphRAGEngine';
import { makeSymbolObjectId } from '../engine/SymbolObjectId';
import type { SymbolSearchIndex } from '../engine/SearchIndex';
import type { ExternalSymbolDefinition } from '../engine/types';
import {
  getGraphRAGStateStatus,
  handleGraphRagTool,
  isGraphRAGReady,
  resetGraphRAGState,
  resetGraphRAGStateForTests,
  runWithGraphRAGOwner,
  setGraphRAGState,
} from './graph-rag-tools';
import {
  ABSORB_EMBEDDING_INDEX_ERROR,
  ABSORB_GRAPH_RAG_ENGINE_ERROR,
} from './graph-rag-prerequisite';

const ROOT_A = 'C:/tenant-a-private-repo';
const A = 'user:tenant-a';
const B = 'user:tenant-b';

function fixture(): { graph: CodebaseGraph; index: SymbolSearchIndex; sym: ExternalSymbolDefinition } {
  const sym: ExternalSymbolDefinition = {
    name: 'tenantASecretFn',
    type: 'function',
    language: 'typescript',
    visibility: 'public',
    filePath: `${ROOT_A}/secret.ts`,
    line: 1,
    column: 0,
    signature: 'function tenantASecretFn()',
  };
  const graph = new CodebaseGraph();
  graph.addFile({
    path: sym.filePath,
    language: 'typescript',
    symbols: [sym],
    imports: [],
    calls: [],
    loc: 10,
    sizeBytes: 100,
  });
  graph.buildIndexes();
  const results = [
    {
      symbol: sym,
      file: sym.filePath,
      type: sym.type,
      score: 0.9,
      vectorScore: 0.9,
      lexicalScore: 1,
      exactMatch: true,
      matchKind: 'exact-name' as const,
    },
  ];
  const index: SymbolSearchIndex = {
    search: async () => results,
    searchWithFilters: async () => results,
    searchHybrid: async () => results,
    searchHybridWithFilters: async () => results,
  };
  return { graph, index, sym };
}

function absorbAsA(): ExternalSymbolDefinition {
  const { graph, index, sym } = fixture();
  runWithGraphRAGOwner(A, () =>
    setGraphRAGState(index, new GraphRAGEngine(graph, index), { rootDir: ROOT_A, timestamp: Date.now() })
  );
  return sym;
}

afterEach(() => {
  resetGraphRAGStateForTests();
  vi.restoreAllMocks();
});

describe('graph-rag state is per owner (Mapping H1/H2)', () => {
  it('B gets the absorb-first error from all three tools after A absorbs, and never sees A state', async () => {
    const sym = absorbAsA();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in test'));

    const search = (await handleGraphRagTool(
      'holo_semantic_search',
      { query: 'tenantASecretFn', useCachedAbsorbIndex: true },
      { ownerKey: B }
    )) as Record<string, unknown>;
    const ask = (await handleGraphRagTool(
      'holo_ask_codebase',
      { question: 'what does tenantASecretFn do?' },
      { ownerKey: B }
    )) as Record<string, unknown>;
    const visual = (await handleGraphRagTool(
      'holo_visual_graph_context',
      { selectedNodeIds: [makeSymbolObjectId(sym)] },
      { ownerKey: B }
    )) as Record<string, unknown>;

    expect(search.error).toBe(ABSORB_EMBEDDING_INDEX_ERROR);
    expect(ask.error).toBe(ABSORB_GRAPH_RAG_ENGINE_ERROR);
    expect(visual.error).toBe(ABSORB_GRAPH_RAG_ENGINE_ERROR);
    for (const r of [search, ask, visual]) {
      const text = JSON.stringify(r);
      expect(text).not.toContain(ROOT_A);
      expect(text).not.toContain('tenantASecretFn');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getGraphRAGStateStatus(B)).toMatchObject({ ready: false, rootDir: null });
    expect(isGraphRAGReady(B)).toBe(false);
  });

  it('A still works after B is refused, and only A sees its rootDir', async () => {
    const sym = absorbAsA();
    await handleGraphRagTool('holo_visual_graph_context', { selectedNodeIds: [] }, { ownerKey: B });

    const search = (await handleGraphRagTool(
      'holo_semantic_search',
      { query: 'tenantASecretFn', useCachedAbsorbIndex: true },
      { ownerKey: A }
    )) as Record<string, unknown>;
    const visual = (await handleGraphRagTool(
      'holo_visual_graph_context',
      { selectedNodeIds: [makeSymbolObjectId(sym)] },
      { ownerKey: A }
    )) as Record<string, any>;

    expect(search.error).toBeUndefined();
    expect(JSON.stringify(search)).toContain('tenantASecretFn');
    expect(visual.error).toBeUndefined();
    expect(visual.graphState.rootDir).toBe(ROOT_A);
    expect(getGraphRAGStateStatus(A)).toMatchObject({ ready: true, rootDir: ROOT_A });
  });

  it('A ask_codebase passes the absorb gate (B does not)', async () => {
    absorbAsA();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in test'));
    const ask = (await handleGraphRagTool(
      'holo_ask_codebase',
      { question: 'what does tenantASecretFn do?', topK: 1 },
      { ownerKey: A }
    )) as Record<string, unknown>;
    expect(ask.error).not.toBe(ABSORB_GRAPH_RAG_ENGINE_ERROR);
    expect(ask.error).not.toBe('graph_rag_owner_required');
  });

  it.each([null, '', '   '])('refuses a context with no principal (%j)', async (ownerKey) => {
    absorbAsA();
    for (const name of ['holo_semantic_search', 'holo_ask_codebase', 'holo_visual_graph_context']) {
      const r = (await handleGraphRagTool(name, { query: 'x', question: 'x' }, { ownerKey })) as Record<
        string,
        unknown
      >;
      expect(r.error).toBe('graph_rag_owner_required');
      expect(JSON.stringify(r)).not.toContain(ROOT_A);
    }
  });

  it('an unscoped (local) absorb is not visible to a tenant', async () => {
    const { graph, index } = fixture();
    setGraphRAGState(index, new GraphRAGEngine(graph, index), { rootDir: ROOT_A });
    expect(isGraphRAGReady()).toBe(true);
    const visual = (await handleGraphRagTool(
      'holo_visual_graph_context',
      { selectedNodeIds: [] },
      { ownerKey: B }
    )) as Record<string, unknown>;
    expect(visual.error).toBe(ABSORB_GRAPH_RAG_ENGINE_ERROR);
  });

  it('resetGraphRAGState clears only the calling owner', () => {
    absorbAsA();
    runWithGraphRAGOwner(B, () => resetGraphRAGState());
    expect(isGraphRAGReady(A)).toBe(true);
    runWithGraphRAGOwner(A, () => resetGraphRAGState());
    expect(isGraphRAGReady(A)).toBe(false);
  });

  it('runWithGraphRAGOwner rejects an empty owner', () => {
    expect(() => runWithGraphRAGOwner('', () => 1)).toThrow();
  });
});
