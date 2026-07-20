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
      async (query: string) =>
        query.toLowerCase().includes('supernova') ? [seededEntry] : []
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
