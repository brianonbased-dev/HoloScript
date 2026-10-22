import { afterEach, describe, expect, it, vi } from 'vitest';
import { absorbArgsHavePageExtract, foldObservedPageIntoAbsorbArgs } from './absorb-page-extract';

const OBSERVE = {
  operation: 'observe',
  session: { url: 'https://docs.holoscript.example/observe' },
  markdown: '# Observe Fixture\n\nfixture body text for absorb fold\n\n# Heading One',
  dom: {
    url: 'https://docs.holoscript.example/observe',
    title: 'Observe Fixture',
    bodyText: 'fixture body text for absorb fold',
    elementCount: 4,
  },
};

describe('foldObservedPageIntoAbsorbArgs', () => {
  it('detects observe extract on the existing holo_absorb_repo args', () => {
    expect(absorbArgsHavePageExtract({ observe: OBSERVE })).toBe(true);
    expect(absorbArgsHavePageExtract({ rootDir: '/repo' })).toBe(false);
  });

  it('folds observe into the existing sourceFiles absorb path', async () => {
    const folded = await foldObservedPageIntoAbsorbArgs({
      observe: OBSERVE,
      outputFormat: 'stats',
    });

    expect(folded.ok).toBe(true);
    if (!folded.ok) return;
    expect(folded.args.outputFormat).toBe('stats');
    expect(folded.args.sourceFiles).toEqual([
      expect.objectContaining({ path: 'observed-page.holo' }),
      expect.objectContaining({
        path: 'observed-page.md',
        content: expect.stringContaining('fixture body text for absorb fold'),
      }),
    ]);
    expect(folded.pageExtract).toMatchObject({
      kind: 'HoloAbsorbPageExtract',
      url: 'https://docs.holoscript.example/observe',
      title: 'Observe Fixture',
      source: 'observe',
      formatId: 'markdown',
      sourceFiles: ['observed-page.holo', 'observed-page.md'],
      holoPartial: false,
    });
  });

  it('rejects mixing a page extract with a repo root', async () => {
    const folded = await foldObservedPageIntoAbsorbArgs({
      observe: OBSERVE,
      rootDir: '/repo',
    });
    expect(folded).toMatchObject({
      ok: false,
      error: 'page_extract_exclusive',
    });
  });
});

describe('holo_absorb_repo page fold never fetches a caller url', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['metadata', 'http://169.254.169.254/latest/meta-data/iam/security-credentials/'],
    ['metadata v6', 'http://[fd00:ec2::254]/latest/meta-data/'],
    ['loopback', 'http://127.0.0.1:6379/'],
    ['loopback v6', 'http://[::1]/'],
    ['ULA', 'http://[fd12:3456::1]/'],
    ['private v4', 'http://10.0.0.5/admin'],
    ['integer loopback', 'http://2130706433/'],
    ['mapped v6', 'http://[::ffff:a9fe:a9fe]/'],
    ['public host that could redirect to a private address', 'https://redirector.example/to-169.254.169.254'],
  ])('url-only %s (%s) is refused with no network call', async (_label, url) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
    );
    const folded = await foldObservedPageIntoAbsorbArgs({ url, outputFormat: 'stats' });
    expect(folded).toMatchObject({ ok: false, error: 'url_fetch_refused' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('observe/pageExtract with only a url is refused too', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const args of [
      { observe: { operation: 'observe', session: { url: 'http://169.254.169.254/' } } },
      { pageExtract: { url: 'http://127.0.0.1/' } },
    ]) {
      const folded = await foldObservedPageIntoAbsorbArgs(args);
      expect(folded.ok).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a url sent with page text is only a label and is not fetched', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const folded = await foldObservedPageIntoAbsorbArgs({
      url: 'http://169.254.169.254/latest/meta-data/',
      bodyText: 'caller supplied page text about widgets',
      title: 'Widgets',
    });
    expect(folded.ok).toBe(true);
    if (!folded.ok) return;
    expect(folded.pageExtract?.fetched).toBe(false);
    expect(folded.pageExtract?.source).toBe('bodyText');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
