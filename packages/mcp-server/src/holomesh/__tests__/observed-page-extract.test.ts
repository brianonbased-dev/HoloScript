import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  HOLOMESH_PAGE_EXTRACT_KIND,
  hasCrawlShape,
  meshArgsHavePageExtract,
  meshPageExtractReceipt,
  normalizeObservedPageExtract,
  normalizeObservedPageExtractSync,
  observedPageToFeedBlock,
  observedPageToKnowledgeContent,
  resolveMeshObservedPage,
} from '../observed-page-extract';

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

const PAGE_EXTRACT = {
  url: 'https://docs.holoscript.example/page-extract',
  title: 'Absorb PageExtract',
  bodyText: 'absorb leftover-2 pageExtract body',
  markdown: '# Absorb PageExtract\n\nabsorb leftover-2 pageExtract body',
};

describe('meshArgsHavePageExtract', () => {
  it('detects leftover-2 observe / pageExtract / flat text', () => {
    expect(meshArgsHavePageExtract({ observe: OBSERVE })).toBe(true);
    expect(meshArgsHavePageExtract({ pageExtract: PAGE_EXTRACT })).toBe(true);
    expect(
      meshArgsHavePageExtract({
        bodyText: 'visible text',
        markdown: '# md',
        url: 'https://docs.holoscript.example/flat',
      })
    ).toBe(true);
    expect(meshArgsHavePageExtract({ type: 'wisdom', content: 'plain entry' })).toBe(false);
  });

  it('rejects crawl-shaped args', () => {
    expect(hasCrawlShape({ urls: ['https://a.example', 'https://b.example'] })).toBe(true);
    expect(meshArgsHavePageExtract({ urls: ['https://a.example'], url: 'https://a.example' })).toBe(
      false
    );
  });
});

describe('normalizeObservedPageExtractSync', () => {
  it('reads browser_session observe dom.bodyText + markdown', () => {
    const extract = normalizeObservedPageExtractSync({ observe: OBSERVE });
    expect(extract).toMatchObject({
      url: 'https://docs.holoscript.example/observe',
      title: 'Observe Fixture',
      source: 'observe',
      fetched: false,
      bodyText: 'fixture body text for mesh fold',
    });
    expect(extract.markdown).toContain('fixture body text for mesh fold');
    expect(extract.sha256).toBe(createHash('sha256').update(extract.text).digest('hex'));
    expect(extract.charCount).toBe(extract.text.length);
  });

  it('reads absorb leftover-2 pageExtract', () => {
    const extract = normalizeObservedPageExtractSync({ pageExtract: PAGE_EXTRACT });
    expect(extract).toMatchObject({
      url: 'https://docs.holoscript.example/page-extract',
      title: 'Absorb PageExtract',
      source: 'pageExtract',
      text: expect.stringContaining('absorb leftover-2 pageExtract body'),
    });
  });

  it('reads flat bodyText + markdown + url', () => {
    const extract = normalizeObservedPageExtractSync({
      url: 'https://docs.holoscript.example/flat',
      title: 'Flat Extract',
      bodyText: 'flat body',
      markdown: '# Flat\n\nflat body',
    });
    expect(extract.source).toBe('markdown');
    expect(extract.url).toBe('https://docs.holoscript.example/flat');
    expect(extract.text).toContain('flat body');
  });

  it('throws when observe has no text', () => {
    expect(() =>
      normalizeObservedPageExtractSync({
        observe: { operation: 'observe', dom: { url: 'https://empty.example' } },
      })
    ).toThrow(/empty/i);
  });
});

describe('normalizeObservedPageExtract url fetch', () => {
  it('fetches one URL when text is missing', async () => {
    const fetchImpl = async () =>
      new Response('<html><title>Fetched Page</title><body><p>one url body</p></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    const extract = await normalizeObservedPageExtract({
      url: 'https://docs.holoscript.example/one',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(extract).toMatchObject({
      url: 'https://docs.holoscript.example/one',
      title: 'Fetched Page',
      source: 'url',
      fetched: true,
    });
    expect(extract.text).toContain('one url body');
  });

  it('rejects non-http(s) URL fetch', async () => {
    await expect(
      normalizeObservedPageExtract({
        url: 'file:///etc/passwd',
        fetchImpl: (async () => new Response('nope')) as typeof fetch,
      })
    ).rejects.toThrow(/protocol/i);
  });
});

describe('mesh fold helpers', () => {
  it('builds a comment-only feed block and knowledge content', () => {
    const extract = normalizeObservedPageExtractSync({ observe: OBSERVE });
    const feed = observedPageToFeedBlock(extract);
    expect(feed).toContain('@observed_page');
    expect(feed).toContain('https://docs.holoscript.example/observe');
    expect(feed.split('\n').every((line) => line.startsWith('//'))).toBe(true);

    const content = observedPageToKnowledgeContent(extract);
    expect(content).toContain('# Observe Fixture');
    expect(content).toContain('fixture body text for mesh fold');
    expect(content).toContain(extract.sha256);
  });

  it('receipt is HoloMeshPageExtract with pageExtractPresent', () => {
    const extract = normalizeObservedPageExtractSync({ observe: OBSERVE });
    expect(meshPageExtractReceipt(extract)).toMatchObject({
      kind: HOLOMESH_PAGE_EXTRACT_KIND,
      pageExtractPresent: true,
      url: extract.url,
      source: 'observe',
    });
  });

  it('resolveMeshObservedPage rejects crawl arrays', async () => {
    const resolved = await resolveMeshObservedPage({
      urls: ['https://a.example', 'https://b.example'],
      url: 'https://a.example',
    });
    expect(resolved).toMatchObject({ ok: false, error: 'page_extract_not_crawl' });
  });
});
