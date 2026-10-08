import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHandlers, executeCanonicalCodebaseQuery } from '../commands/codebase-query';

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

  describe('--dir scopes the workspace root the handlers judge the graph against', () => {
    afterEach(() => vi.unstubAllEnvs());

    // Records HOLOSCRIPT_WORKSPACE_ROOT as each handler sees it. Without the pin, a
    // --dir below the cwd is absorbed, then refused by the semantic tools as a nested
    // slice of the cwd (cache_root_mismatch).
    function recordingHandlers() {
      const seen: Record<string, string | undefined> = {};
      return {
        seen,
        handlers: {
          handleCodebaseTool: vi.fn(async () => {
            seen.absorb = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
            return { graphRagReady: true };
          }),
          handleGraphRagTool: vi.fn(async () => {
            seen.search = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
            return { results: [] };
          }),
        },
      };
    }

    it('pins the root to --dir for both handler calls, then removes the pin', async () => {
      vi.stubEnv('HOLOSCRIPT_WORKSPACE_ROOT', undefined);
      const { seen, handlers } = recordingHandlers();
      await executeCanonicalCodebaseQuery(
        { input: 'where is the parser', queryDir: 'packages/cli/src/commands' },
        handlers
      );
      const expected = path.resolve('packages/cli/src/commands');
      expect(seen).toEqual({ absorb: expected, search: expected });
      expect(process.env.HOLOSCRIPT_WORKSPACE_ROOT).toBeUndefined();
    });

    it('restores an existing pin, including when a handler throws', async () => {
      vi.stubEnv('HOLOSCRIPT_WORKSPACE_ROOT', '/srv/pinned-repo');
      const { handlers } = recordingHandlers();
      handlers.handleGraphRagTool.mockRejectedValueOnce(new Error('index unavailable'));
      await expect(
        executeCanonicalCodebaseQuery({ input: 'q', queryDir: '/tmp/some-slice' }, handlers)
      ).rejects.toThrow('index unavailable');
      expect(process.env.HOLOSCRIPT_WORKSPACE_ROOT).toBe('/srv/pinned-repo');
    });

    it('leaves the root alone when no --dir is given', async () => {
      vi.stubEnv('HOLOSCRIPT_WORKSPACE_ROOT', '/srv/pinned-repo');
      const { seen, handlers } = recordingHandlers();
      await executeCanonicalCodebaseQuery({ input: 'q' }, handlers);
      expect(seen).toEqual({ absorb: '/srv/pinned-repo', search: '/srv/pinned-repo' });
    });
  });

  // claude4's round 2 review (P3): the library default is "no code", so the
  // CLI reads code only because its real handlers opt the process in. Every
  // other case injects handlers, so deleting the opt-in kept the suite green.
  it('opts the CLI process in to code reading when it loads the real handlers', async () => {
    const mcp = await import('@holoscript/absorb-service/mcp');
    mcp.setCodeReadDefault(false);
    try {
      expect(mcp.codeReadAllowed()).toBe(false);
      const handlers = await defaultHandlers();
      expect(mcp.codeReadAllowed()).toBe(true);
      expect(handlers.handleCodebaseTool).toBe(mcp.handleCodebaseTool);
      expect(handlers.handleGraphRagTool).toBe(mcp.handleGraphRagTool);
    } finally {
      mcp.setCodeReadDefault(false);
    }
  }, 60_000);
});
