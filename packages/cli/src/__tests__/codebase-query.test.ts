import { describe, expect, it, vi } from 'vitest';
import { executeCanonicalCodebaseQuery } from '../commands/codebase-query';

describe('executeCanonicalCodebaseQuery', () => {
  it('reuses the canonical Absorb handlers and current in-memory index', async () => {
    const handleCodebaseTool = vi.fn().mockResolvedValue({
      cacheHit: true,
      graphRagReady: true,
    });
    const handleGraphRagTool = vi.fn().mockResolvedValue({
      results: [{ name: 'TransportSupervisor', score: 0.9 }],
    });

    const result = await executeCanonicalCodebaseQuery(
      {
        input: 'transport recovery',
        queryDir: '.',
        queryTopK: 7,
      },
      { handleCodebaseTool, handleGraphRagTool }
    );

    expect(handleCodebaseTool).toHaveBeenCalledWith(
      'holo_absorb_repo',
      expect.objectContaining({ force: false, outputFormat: 'graph' })
    );
    expect(handleGraphRagTool).toHaveBeenCalledWith('holo_semantic_search', {
      query: 'transport recovery',
      topK: 7,
      useCachedAbsorbIndex: true,
    });
    expect(result.queryProvenance).toMatchObject({
      mode: 'direct-canonical-handler',
      cacheAuthority: 'absorb-workspace-v1',
      transportIndependent: true,
    });
  });

  it('routes synthesized questions through the canonical ask tool', async () => {
    const handleCodebaseTool = vi.fn().mockResolvedValue({ graphRagReady: true });
    const handleGraphRagTool = vi.fn().mockResolvedValue({
      answer: 'Cited answer',
      citations: [],
    });

    await executeCanonicalCodebaseQuery(
      {
        input: 'How does recovery work?',
        queryWithLlm: true,
        queryLlm: 'holollama',
        queryModel: 'local-model',
      },
      { handleCodebaseTool, handleGraphRagTool }
    );

    expect(handleGraphRagTool).toHaveBeenCalledWith('holo_ask_codebase', {
      question: 'How does recovery work?',
      topK: 10,
      llmProvider: 'holollama',
      llmModel: 'local-model',
    });
  });

  it('returns an explicit absorb-stage receipt instead of silently rescanning elsewhere', async () => {
    const result = await executeCanonicalCodebaseQuery(
      { input: 'query' },
      {
        handleCodebaseTool: vi.fn().mockResolvedValue({ error: 'cache_corrupt' }),
        handleGraphRagTool: vi.fn(),
      }
    );

    expect(result).toMatchObject({
      error: 'cache_corrupt',
      queryProvenance: {
        mode: 'direct-canonical-handler',
        stage: 'absorb',
      },
    });
  });
});
