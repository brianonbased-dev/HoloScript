import { describe, expect, it } from 'vitest';
import { knowledgeEntryMatchesQuery } from '../entry-lookup';

describe('knowledgeEntryMatchesQuery', () => {
  const dump = [
    { id: 'W.old.1', type: 'gotcha', content: 'junction leak from a shared cwd pin' },
    { id: 'W.old.2', type: 'gotcha', content: 'unrelated lease expiry noise' },
  ];

  it('makes a real token and a nonsense token return different id sets', () => {
    const hit = dump.filter((e) => knowledgeEntryMatchesQuery(e, 'junction')).map((e) => e.id);
    const miss = dump
      .filter((e) => knowledgeEntryMatchesQuery(e, 'zzzz-nonsense-query-nothing-matches'))
      .map((e) => e.id);
    expect(hit).toEqual(['W.old.1']);
    expect(miss).toEqual([]);
    expect(hit).not.toEqual(miss);
  });
});
