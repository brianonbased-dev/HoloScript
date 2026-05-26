import { describe, it, expect } from 'vitest';
import { parseFounderInboxEntries } from './parse';

const push = (over: Record<string, unknown> = {}) => ({
  id: (over.id as string) ?? 'f1',
  content: JSON.stringify({
    founderInbox: true,
    v: 1,
    url: 'https://holoscript.studio/quest-proof',
    label: 'world ready',
    kind: 'action',
    taskId: null,
    pushedBy: 'claude',
    ts: '2026-05-26T20:00:00.000Z',
    ...over,
  }),
});

describe('parseFounderInboxEntries', () => {
  it('extracts a founderInbox feed entry into an inbox item', () => {
    const items = parseFounderInboxEntries([push()]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      label: 'world ready',
      url: 'https://holoscript.studio/quest-proof',
      kind: 'action',
    });
  });

  it('FAILING-IF-BROKEN: a non-founderInbox feed entry is NOT rendered', () => {
    const ordinary = { id: 'x', content: JSON.stringify({ kind: 'intelligence', content: 'board report' }) };
    expect(parseFounderInboxEntries([ordinary])).toHaveLength(0);
  });

  it('rejects junk: non-URL or empty label never reaches the founder', () => {
    expect(parseFounderInboxEntries([push({ url: 'not-a-url' })])).toHaveLength(0);
    expect(parseFounderInboxEntries([push({ label: '   ' })])).toHaveLength(0);
  });

  it('newest-first and capped by limit', () => {
    const items = parseFounderInboxEntries(
      [
        push({ id: 'a', label: 'older', ts: '2026-05-26T10:00:00.000Z' }),
        push({ id: 'b', label: 'newer', ts: '2026-05-26T22:00:00.000Z' }),
      ],
      1,
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('newer');
  });

  it('tolerates malformed content + non-array input', () => {
    expect(parseFounderInboxEntries([{ id: 'bad', content: '{not json' }])).toHaveLength(0);
    expect(parseFounderInboxEntries(null)).toHaveLength(0);
  });
});
