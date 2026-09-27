import { describe, it, expect, beforeAll } from 'vitest';
import { search, registerSearchProviders, handleSearchTool, type SearchResult } from '../search';

/**
 * Regression coverage for task_1784578782174_oo87: `registerSearchProviders()`
 * (search.ts) was never called anywhere in the codebase, so the module-level
 * `agentProvider`/`entryProvider` stayed `null` forever and `holomesh_search`
 * silently returned 0 results for every query, with the entry/agent branches
 * of `search()` permanently dead. http-server.ts now wires real providers
 * (the registered-agent store + the orchestrator knowledge client) at
 * startup; this test wires equivalent fake providers directly against the
 * exported contract so it doesn't depend on the HTTP server boot sequence.
 */

const seededAgent = {
  id: 'agent_test_star',
  name: 'Stargazer',
  traits: ['@astronomy'],
  reputation: 42,
  profile: { bio: 'Watches for supernovae across the fleet.' },
};

const seededEntry = {
  id: 'entry_test_star',
  type: 'wisdom',
  content: 'Supernova detection requires a wide-field telescope array.',
  domain: 'astronomy',
  authorName: 'Stargazer',
  queryCount: 3,
};

describe('holomesh_search providers (registerSearchProviders wiring)', () => {
  beforeAll(() => {
    registerSearchProviders(
      () => [seededAgent],
      async (query: string) => (query.toLowerCase().includes('supernova') ? [seededEntry] : [])
    );
  });

  it('returns non-empty agent results once agentProvider is registered', async () => {
    const results = await search({ query: 'stargazer', types: ['agent'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('agent');
    expect(results[0].id).toBe(seededAgent.id);
  });

  it('returns non-empty entry results once entryProvider is registered', async () => {
    const results = await search({ query: 'supernova', types: ['entry'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('entry');
    expect(results[0].id).toBe(seededEntry.id);
  });

  it('holomesh_search tool returns non-empty results end-to-end for a seeded query', async () => {
    const result = (await handleSearchTool('holomesh_search', {
      query: 'supernova',
    })) as { count: number; results: SearchResult[] };

    expect(result.count).toBeGreaterThan(0);
    expect(result.results.some((r) => r.id === seededEntry.id)).toBe(true);
  });

  it('still returns no results for a query that matches nothing', async () => {
    const results = await search({ query: 'zzz_nonexistent_zzz' });
    expect(results).toEqual([]);
  });
});

/**
 * Doors audit 2026-09-15, round 3. The entry snippet follows the query to
 * wherever it matches in the text. An unentitled premium row is dropped
 * before that snippet is built, so aiming past the teaser returns nothing.
 */
describe('holomesh_search never snippets premium text', () => {
  const PAID_TAIL = 'SEARCH-PAID-TAIL-NEVER-FREE';
  const premiumEntry = {
    id: 'entry_premium_search',
    type: 'gotcha',
    content: `${'Paid search body. '.repeat(12)}${PAID_TAIL} and more paid text after it.`,
    domain: 'compilation',
    authorName: 'author',
    queryCount: 0,
    price: 0.05,
  };

  beforeAll(() => {
    registerSearchProviders(
      () => [],
      async (query: string) => (query.includes(PAID_TAIL) ? [premiumEntry] : [])
    );
  });

  it('a query aimed past the teaser drops the premium row', async () => {
    const results = await search({ query: PAID_TAIL, types: ['entry'] });

    expect(results).toHaveLength(0);
    expect(JSON.stringify(results)).not.toContain(premiumEntry.id);
    expect(JSON.stringify(results)).not.toContain(PAID_TAIL);
  });

  it('paid probe: search() drops a premium row matched on hidden paid text', async () => {
    const premiumId = 'entry_search_paid_probe';
    const token = 'xylophonequartz9f3a';
    registerSearchProviders(
      () => [],
      async () => [
        {
          id: premiumId,
          type: 'gotcha',
          content: `${token} paidprobe ${'Paid search body. '.repeat(12)}`,
          domain: 'compilation',
          authorName: 'author',
          authorId: 'author-agent',
          queryCount: 0,
          price: 0.05,
        },
        {
          id: 'entry_search_free_keep',
          type: 'wisdom',
          content: 'ordinary free note with no overlap',
          domain: 'compilation',
          authorName: 'someone',
          authorId: 'someone-else',
          price: 0,
        },
      ]
    );

    const results = await search({ query: 'guidance', types: ['entry'] });
    const text = JSON.stringify(results);
    expect(results.map((row) => row.id)).toEqual(['entry_search_free_keep']);
    expect({
      hasId: text.includes(premiumId),
      hasToken: text.includes(token),
      hasPaidProbe: text.includes('paidprobe'),
    }).toEqual({ hasId: false, hasToken: false, hasPaidProbe: false });

    const author = await search({
      query: 'guidance',
      types: ['entry'],
      viewer: { authenticated: true, id: 'author-agent' },
    });
    expect(author.map((row) => row.id)).toContain(premiumId);
    expect(JSON.stringify(author)).toContain(token);
  });
});
