import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  OBSERVED_PAGE_HOLO_PATH,
  OBSERVED_PAGE_MARKDOWN_PATH,
  hasObservedPageExtractInput,
  ingestObservedPage,
  ingestObservedPageSync,
  normalizeObservedPageExtractSync,
} from './ingestObservedPage';

const OBSERVE_PAYLOAD = {
  success: true,
  operation: 'observe',
  permissionEnvelope: 'read_only',
  session: { url: 'https://docs.holoscript.example/observe' },
  dom: {
    url: 'https://docs.holoscript.example/observe',
    title: 'Observe Fixture',
    bodyText: 'fixture body text for absorb fold\n\n# Heading One\nDetails about HoloAbsorb.',
    elementCount: 4,
  },
  markdown: '# Observe Fixture\n\nfixture body text for absorb fold\n\n# Heading One',
};

describe('ingestObservedPage', () => {
  it('detects observe / markdown / url extract inputs', () => {
    expect(hasObservedPageExtractInput({ observe: OBSERVE_PAYLOAD })).toBe(true);
    expect(hasObservedPageExtractInput({ markdown: '# hi' })).toBe(true);
    expect(hasObservedPageExtractInput({ url: 'https://example.com/page' })).toBe(true);
    expect(hasObservedPageExtractInput({})).toBe(false);
  });

  it('reads the live browser_session observe shape (dom.bodyText + markdown)', () => {
    const extract = normalizeObservedPageExtractSync({ observe: OBSERVE_PAYLOAD });

    expect(extract.source).toBe('observe');
    expect(extract.url).toBe('https://docs.holoscript.example/observe');
    expect(extract.title).toBe('Observe Fixture');
    expect(extract.markdown).toContain('# Observe Fixture');
    expect(extract.bodyText).toContain('fixture body text for absorb fold');
    expect(extract.text).toContain('# Observe Fixture');
    expect(extract.sha256).toHaveLength(64);
  });

  it('emits existing holo_absorb_repo sourceFiles and a knowledge graph', () => {
    const result = ingestObservedPageSync({ observe: OBSERVE_PAYLOAD });

    expect(result.kind).toBe('HoloAbsorbPageExtract');
    expect(result.sourceFiles.map((file) => file.path)).toEqual([
      OBSERVED_PAGE_HOLO_PATH,
      OBSERVED_PAGE_MARKDOWN_PATH,
    ]);
    expect(result.sourceFiles[0].content).toContain('composition "ObservedPage"');
    expect(result.sourceFiles[1].content).toContain('fixture body text for absorb fold');
    expect(result.holo.ast).not.toBeNull();
    expect(result.holo.partial).toBe(false);
    expect(result.document.formatId).toBe('markdown');
    expect(result.document.chunks[0]?.text).toContain('Heading One');
    expect(result.graph.getStats().totalFiles).toBe(1);
    expect(result.graph.getStats().totalSymbols).toBeGreaterThanOrEqual(2);
  });

  it('passes native HoloScript page text through ingestHoloSource unchanged', () => {
    const holo = `composition "LivePage" {
  object "Extracted" {
    @knowledge(source: "https://example.com/holo")
  }
}
`;
    const result = ingestObservedPageSync({ markdown: holo, url: 'https://example.com/holo' });
    expect(result.sourceFiles[0].content).toBe(holo);
    expect(result.holo.ast?.name).toBe('LivePage');
  });
});

describe('ingestObservedPage URL fetch', () => {
  let server: Server;
  let pageUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/note') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end('# Fetched Note\n\nOne URL extract lands on HoloAbsorb.');
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    pageUrl = `http://127.0.0.1:${address.port}/note`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('accepts one URL and returns structured absorb sourceFiles', async () => {
    const result = await ingestObservedPage({ url: pageUrl });
    expect(result.extract.fetched).toBe(true);
    expect(result.extract.text).toContain('One URL extract lands on HoloAbsorb');
    expect(result.sourceFiles).toHaveLength(2);
    expect(result.graph.getStats().totalFiles).toBe(1);
  });
});
