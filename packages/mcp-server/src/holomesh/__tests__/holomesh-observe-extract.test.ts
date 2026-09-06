import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { HOLOMESH_PAGE_EXTRACT_KIND, OBSERVED_PAGE_EXTRACT_SCHEMA_PROPERTIES } from '../observed-page-extract';
import {
  contributeObservedPageExtract,
  createMemoryPageExtractFeed,
  feedSourceObservedPageExtract,
} from '../mesh-page-extract-handlers';

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

const TOOLS_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../holomesh-tools.ts'),
  'utf8'
);

describe('holomesh observe extract registration', () => {
  it('keeps contribute and feed_source on the existing holomesh tool list', () => {
    expect(TOOLS_SRC).toContain("name: 'holomesh_contribute'");
    expect(TOOLS_SRC).toContain("name: 'holomesh_feed_source'");
    expect(TOOLS_SRC).toContain('...OBSERVED_PAGE_EXTRACT_SCHEMA_PROPERTIES');
    expect(TOOLS_SRC).toContain('meshArgsHavePageExtract');
  });

  it('advertises leftover-2 observe / pageExtract / bodyText+markdown+url', () => {
    expect(OBSERVED_PAGE_EXTRACT_SCHEMA_PROPERTIES).toMatchObject({
      observe: expect.anything(),
      pageExtract: expect.anything(),
      markdown: expect.anything(),
      bodyText: expect.anything(),
      url: expect.anything(),
    });
  });
});

describe('holomesh_contribute + holomesh_feed_source observe extract', () => {
  it('contribute accepts browser_session observe without a remote client', async () => {
    const feed = createMemoryPageExtractFeed();
    const result = await contributeObservedPageExtract(null, { observe: OBSERVE }, feed);

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
    const fromReceipt = await contributeObservedPageExtract(
      null,
      {
        pageExtract: {
          url: 'https://docs.holoscript.example/page-extract',
          title: 'Absorb PageExtract',
          bodyText: 'absorb leftover-2 pageExtract body',
          markdown: '# Absorb\n\nabsorb leftover-2 pageExtract body',
        },
        type: 'pattern',
      },
      createMemoryPageExtractFeed()
    );
    expect(fromReceipt).toMatchObject({
      success: true,
      pageExtractPresent: true,
      type: 'pattern',
    });
    expect((fromReceipt.pageExtract as Record<string, unknown>).source).toBe('pageExtract');

    const fromFlat = await contributeObservedPageExtract(
      null,
      {
        url: 'https://docs.holoscript.example/flat',
        title: 'Flat Extract',
        bodyText: 'flat body text for mesh contribute',
        markdown: '# Flat\n\nflat body text for mesh contribute',
        type: 'gotcha',
      },
      createMemoryPageExtractFeed()
    );
    expect(fromFlat).toMatchObject({
      success: true,
      pageExtractPresent: true,
      type: 'gotcha',
    });
    expect((fromFlat.pageExtract as Record<string, unknown>).source).toBe('markdown');
  });

  it('feed_source accepts one observe extract and returns the local feed', async () => {
    const result = await feedSourceObservedPageExtract(
      { observe: OBSERVE },
      createMemoryPageExtractFeed()
    );

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

  it('rejects crawl-shaped contribute args', async () => {
    const result = await contributeObservedPageExtract(null, {
      urls: ['https://a.example', 'https://b.example'],
      url: 'https://a.example',
      bodyText: 'should not be used when crawl-shaped',
    });
    expect(result).toMatchObject({
      error: 'page_extract_not_crawl',
    });
  });

  it('contribute with extract + client still folds locally then syncs', async () => {
    const contributeKnowledge = vi.fn().mockResolvedValue(1);
    const client = {
      getAgentId: () => 'did:agent:test',
      registerAgent: vi.fn(),
      contributeKnowledge,
    };
    const result = await contributeObservedPageExtract(
      client,
      { observe: OBSERVE, type: 'wisdom' },
      createMemoryPageExtractFeed()
    );
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
  });
});
