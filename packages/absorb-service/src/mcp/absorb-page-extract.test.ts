import { afterEach, describe, expect, it } from 'vitest';
import { absorbArgsHavePageExtract, foldObservedPageIntoAbsorbArgs } from './absorb-page-extract';
import { CodebaseGraph } from '../engine/CodebaseGraph';
import { getActiveGraph, setKnowledgeExtractionGraph } from './knowledge-extraction-tools';

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

  afterEach(() => setKnowledgeExtractionGraph(null));

  it("an unowned fold cannot overwrite the victim workspace's knowledge graph", async () => {
    const victim = new CodebaseGraph();
    setKnowledgeExtractionGraph(victim, 'victim-ws');
    const folded = await foldObservedPageIntoAbsorbArgs({ observe: OBSERVE, workspaceId: 'victim-ws' });
    expect(folded.ok).toBe(true);
    expect(getActiveGraph('victim-ws')).toBe(victim);
  });

  it('an owned fold stores the page graph under that owner only', async () => {
    await foldObservedPageIntoAbsorbArgs({ observe: OBSERVE, workspaceId: 'ws-o' }, { ownerId: 'owner-1' });
    expect(getActiveGraph('ws-o', 'owner-1')).not.toBeNull();
    expect(getActiveGraph('ws-o')).toBeNull();
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
