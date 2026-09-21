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
 * wherever it matches in the text, so a caller could aim a query past any
 * teaser and read a premium entry's paid part 120 characters at a time.
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

  it('a query aimed past the teaser gets only the teaser back', async () => {
    const results = await search({ query: PAID_TAIL, types: ['entry'] });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(premiumEntry.id);
    expect(JSON.stringify(results)).not.toContain(PAID_TAIL);
  });
});
