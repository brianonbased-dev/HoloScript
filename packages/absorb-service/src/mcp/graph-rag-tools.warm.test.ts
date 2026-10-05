import { afterEach, describe, expect, it, vi } from 'vitest';

const warmState = vi.hoisted(() => ({
  value: undefined as
    | undefined
    | {
        loaded: boolean;
        graphRAGReady: boolean;
        warmJobId?: string;
        warm?: { status: string; progress: number; phase: string; rootDir: string };
      },
}));

vi.mock('./codebase-tools', () => ({
  refuseNestedWorkspaceSliceForSemanticTools: async () => null,
  ensureCachedGraphRAGStateFromCodebaseTools: async () => warmState.value,
  getAuthoritativeGraphForVisualContext: async () => null,
}));

import { handleGraphRagTool, resetGraphRAGStateForTests } from './graph-rag-tools';

describe('semantic tools while the HoloEmbed index is being built', () => {
  afterEach(() => {
    warmState.value = undefined;
    resetGraphRAGStateForTests();
  });

  it('reports the running build instead of telling the model to absorb again', async () => {
    warmState.value = {
      loaded: true,
      graphRAGReady: false,
      warmJobId: 'absorb-warm-1-test',
      warm: {
        status: 'indexing',
        progress: 40,
        phase: 'Building cached embeddings batch 1327/12615',
        rootDir: '/repo',
      },
    };

    for (const tool of ['holo_ask_codebase', 'holo_semantic_search']) {
      const result = (await handleGraphRagTool(tool, { question: 'q', query: 'q' })) as {
        error?: string;
        message?: string;
        warmJobId?: string;
      };
      expect(result.error).toBe('semantic_index_building');
      expect(result.message).toContain('batch 1327/12615');
      expect(result.message).toContain('Do not call holo_absorb_repo');
      expect(result.warmJobId).toBe('absorb-warm-1-test');
    }
  });

  it('keeps the absorb-first error when no build is running', async () => {
    warmState.value = { loaded: false, graphRAGReady: false };
    const result = (await handleGraphRagTool('holo_ask_codebase', { question: 'q' })) as {
      error?: string;
    };
    expect(result.error).toContain('No Graph RAG engine initialized');
  });
});
