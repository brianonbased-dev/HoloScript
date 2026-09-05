import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetHoloMeshClientForTests, holomeshTools, handleHoloMeshTool } from '../holomesh-tools';
import { HOLOMESH_PAGE_EXTRACT_KIND } from '../observed-page-extract';

const OBSERVE = {
  operation: 'observe',
  session: { url: 'https://docs.holoscript.example/observe' },
  markdown: '# Observe Fixture\n\nfixture body text for mesh fold\n\n# Heading One',
  dom: {
    url: 'https://docs.holoscript.example/observe',
    title: 'Observe Fixture',
    bodyText: 'fixture body text for mesh fold',
    elementCount: 4,
  },
};

function findTool(name: string) {
  return holomeshTools.find((tool) => tool.name === name);
}

describe('holomesh observe extract registration', () => {
  it('keeps contribute and feed_source on the existing holomesh tool list', () => {
    expect(findTool('holomesh_contribute')).toBeDefined();
    expect(findTool('holomesh_feed_source')).toBeDefined();
  });

  it('advertises leftover-2 observe / pageExtract / bodyText+markdown+url on both tools', () => {
    for (const name of ['holomesh_contribute', 'holomesh_feed_source'] as const) {
      const schema = findTool(name)?.inputSchema as {
        properties?: Record<string, unknown>;
      };
      expect(schema.properties).toMatchObject({
        observe: expect.anything(),
        pageExtract: expect.anything(),
        markdown: expect.anything(),
        bodyText: expect.anything(),
        url: expect.anything(),
      });
    }
  });
});

describe('holomesh_contribute + holomesh_feed_source observe extract', () => {
  const originalApiKey = process.env.HOLOSCRIPT_API_KEY;
  const originalWorldState = process.env.HOLOMESH_WORLD_STATE_PATH;

  beforeEach(() => {
    delete process.env.HOLOSCRIPT_API_KEY;
    process.env.HOLOMESH_WORLD_STATE_PATH = '';
  });

  afterEach(() => {
    _resetHoloMeshClientForTests();
    if (originalApiKey) process.env.HOLOSCRIPT_API_KEY = originalApiKey;
    else delete process.env.HOLOSCRIPT_API_KEY;
    if (originalWorldState !== undefined) process.env.HOLOMESH_WORLD_STATE_PATH = originalWorldState;
    else delete process.env.HOLOMESH_WORLD_STATE_PATH;
  });

  it('contribute without a key still errors when no extract is given', async () => {
    const result = (await handleHoloMeshTool('holomesh_contribute', {
      type: 'wisdom',
      content: 'plain knowledge without observe extract',
    })) as Record<string, unknown>;
    expect(result.error).toMatch(/HOLOSCRIPT_API_KEY/);
  });

  it('contribute accepts browser_session observe on :7411 without a remote key', async () => {
    const result = (await handleHoloMeshTool('holomesh_contribute', {
      observe: OBSERVE,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.pageExtractPresent).toBe(true);
    expect(result.localOnly).toBe(true);
    expect(result.localFeedAppended).toBe(true);
    expect(result.type).toBe('wisdom');
    expect(result.pageExtract).toMatchObject({
      kind: HOLOMESH_PAGE_EXTRACT_KIND,
      pageExtractPresent: true,
      url: 'https://docs.holoscript.example/observe',
      title: 'Observe Fixture',
      source: 'observe',
    });
    expect(String(result.feedSource)).toContain('@observed_page');
    expect(String(result.feedSource)).toContain('fixture body text for mesh fold');
  });

  it('contribute accepts absorb pageExtract + flat bodyText/markdown/url', async () => {
    const fromReceipt = (await handleHoloMeshTool('holomesh_contribute', {
      pageExtract: {
        url: 'https://docs.holoscript.example/page-extract',
        title: 'Absorb PageExtract',
        bodyText: 'absorb leftover-2 pageExtract body',
        markdown: '# Absorb\n\nabsorb leftover-2 pageExtract body',
      },
      type: 'pattern',
    })) as Record<string, unknown>;
    expect(fromReceipt).toMatchObject({
      success: true,
      pageExtractPresent: true,
      type: 'pattern',
    });
    expect((fromReceipt.pageExtract as Record<string, unknown>).source).toBe('pageExtract');

    const fromFlat = (await handleHoloMeshTool('holomesh_contribute', {
      url: 'https://docs.holoscript.example/flat',
      title: 'Flat Extract',
      bodyText: 'flat body text for mesh contribute',
      markdown: '# Flat\n\nflat body text for mesh contribute',
      type: 'gotcha',
    })) as Record<string, unknown>;
    expect(fromFlat).toMatchObject({
      success: true,
      pageExtractPresent: true,
      type: 'gotcha',
    });
    expect((fromFlat.pageExtract as Record<string, unknown>).source).toBe('markdown');
  });

  it('feed_source accepts one observe extract and returns the local feed', async () => {
    const result = (await handleHoloMeshTool('holomesh_feed_source', {
      observe: OBSERVE,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.pageExtractPresent).toBe(true);
    expect(String(result.source)).toContain('@observed_page');
    expect(String(result.source)).toContain('https://docs.holoscript.example/observe');
    expect(result.pageExtract).toMatchObject({
      kind: HOLOMESH_PAGE_EXTRACT_KIND,
      source: 'observe',
      pageExtractPresent: true,
    });
  });

  it('feed_source without extract still requires the mesh key', async () => {
    const result = (await handleHoloMeshTool('holomesh_feed_source', {})) as Record<
      string,
      unknown
    >;
    expect(result.error).toMatch(/HOLOSCRIPT_API_KEY/);
  });

  it('rejects crawl-shaped contribute args', async () => {
    const result = (await handleHoloMeshTool('holomesh_contribute', {
      urls: ['https://a.example', 'https://b.example'],
      url: 'https://a.example',
      bodyText: 'should not be used when crawl-shaped',
    })) as Record<string, unknown>;
    expect(result).toMatchObject({
      error: 'page_extract_not_crawl',
    });
  });

  it('contribute with extract + remote key still folds locally then syncs', async () => {
    process.env.HOLOSCRIPT_API_KEY = 'test-mesh-key';
    const contributeKnowledge = vi.fn().mockResolvedValue(1);
    const { HoloMeshOrchestratorClient } = await import('../orchestrator-client');
    const registerSpy = vi
      .spyOn(HoloMeshOrchestratorClient.prototype, 'registerAgent')
      .mockResolvedValue('did:agent:test');
    const contributeSpy = vi
      .spyOn(HoloMeshOrchestratorClient.prototype, 'contributeKnowledge')
      .mockImplementation(contributeKnowledge);
    const getAgentIdSpy = vi
      .spyOn(HoloMeshOrchestratorClient.prototype, 'getAgentId')
      .mockReturnValue('did:agent:test');

    try {
      const result = (await handleHoloMeshTool('holomesh_contribute', {
        observe: OBSERVE,
        type: 'wisdom',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.pageExtractPresent).toBe(true);
      expect(result.localOnly).toBe(false);
      expect(result.synced).toBe(1);
      expect(contributeKnowledge).toHaveBeenCalledTimes(1);
      const entries = contributeKnowledge.mock.calls[0][0] as Array<{
        content: string;
        tags?: string[];
        metadata?: { pageExtract?: { kind: string } };
      }>;
      expect(entries[0].content).toContain('fixture body text for mesh fold');
      expect(entries[0].tags).toEqual(expect.arrayContaining(['observed-page', 'observe']));
      expect(entries[0].metadata?.pageExtract?.kind).toBe(HOLOMESH_PAGE_EXTRACT_KIND);
    } finally {
      registerSpy.mockRestore();
      contributeSpy.mockRestore();
      getAgentIdSpy.mockRestore();
    }
  });
});
