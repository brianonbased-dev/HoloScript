import { describe, expect, it, vi } from 'vitest';
import {
  holomeshGraphOwner,
  searchCodebaseForCaller,
  type CodebaseSearchGraphApi,
} from '../codebase-search-owner';

/** Fake per-owner GraphRAG store: `local` is the stdio/CLI slot a hosted route must never read. */
function fakeApi(slots: Record<string, string>) {
  const isGraphRAGReady = vi.fn((ownerKey?: string) => Boolean(slots[ownerKey ?? 'local']));
  const handleGraphRagTool = vi.fn(
    async (_name: string, _args: Record<string, unknown>, ctx?: { ownerKey: string | null }) => {
      const owner = ctx ? ctx.ownerKey : 'local';
      if (!owner) return { error: 'graph_rag_owner_required' };
      return slots[owner] ? { hits: [slots[owner]] } : { error: 'absorb first' };
    }
  );
  const api: CodebaseSearchGraphApi = { isGraphRAGReady, handleGraphRagTool };
  return { api, isGraphRAGReady, handleGraphRagTool };
}

describe('POST /api/holomesh/codebase/search owner scoping', () => {
  it('maps a caller id to its own owner key and refuses a missing one', () => {
    expect(holomeshGraphOwner('agent-a')).toBe('holomesh:agent-a');
    expect(holomeshGraphOwner('')).toBeNull();
    expect(holomeshGraphOwner('   ')).toBeNull();
    expect(holomeshGraphOwner(undefined)).toBeNull();
  });

  it('refuses with 401 owner_required when the caller has no id, without touching the graph', async () => {
    const { api, isGraphRAGReady, handleGraphRagTool } = fakeApi({ local: 'LOCAL_SECRET' });
    for (const id of ['', '  ', undefined, null]) {
      const out = await searchCodebaseForCaller(id, { query: 'q' }, api);
      expect(out.status).toBe(401);
      expect(out.body).toMatchObject({ error: 'owner_required' });
    }
    expect(isGraphRAGReady).not.toHaveBeenCalled();
    expect(handleGraphRagTool).not.toHaveBeenCalled();
  });

  it('never reads the local (stdio) slot: a caller with no graph of its own gets 503', async () => {
    const { api, isGraphRAGReady, handleGraphRagTool } = fakeApi({ local: 'LOCAL_SECRET' });
    const out = await searchCodebaseForCaller('agent-b', { query: 'q' }, api);
    expect(out.status).toBe(503);
    expect(JSON.stringify(out.body)).not.toContain('LOCAL_SECRET');
    expect(isGraphRAGReady).toHaveBeenCalledWith('holomesh:agent-b');
    expect(handleGraphRagTool).not.toHaveBeenCalled();
  });

  it('searches only the calling agent\'s own slot', async () => {
    const { api, handleGraphRagTool } = fakeApi({
      local: 'LOCAL_SECRET',
      'holomesh:agent-a': 'A_SYMBOLS',
      'holomesh:agent-b': 'B_SYMBOLS',
    });
    const a = await searchCodebaseForCaller('agent-a', { query: 'q', topK: 3 }, api);
    expect(a).toEqual({ status: 200, body: { success: true, result: { hits: ['A_SYMBOLS'] } } });
    expect(handleGraphRagTool).toHaveBeenLastCalledWith(
      'holo_semantic_search',
      { query: 'q', topK: 3 },
      { ownerKey: 'holomesh:agent-a' }
    );
    const b = await searchCodebaseForCaller('agent-b', { query: 'q' }, api);
    expect(JSON.stringify(b.body)).toContain('B_SYMBOLS');
    expect(JSON.stringify(b.body)).not.toContain('A_SYMBOLS');
    for (const call of handleGraphRagTool.mock.calls) expect(call[2]).toBeDefined();
  });

  it('returns 503 when absorb-service is unavailable and 500 when the search throws', async () => {
    expect((await searchCodebaseForCaller('agent-a', { query: 'q' }, undefined)).status).toBe(503);
    const { api, handleGraphRagTool } = fakeApi({ 'holomesh:agent-a': 'A' });
    handleGraphRagTool.mockRejectedValueOnce(new Error('boom'));
    const out = await searchCodebaseForCaller('agent-a', { query: 'q' }, api);
    expect(out).toEqual({ status: 500, body: { error: 'semantic-search-failed', detail: 'boom' } });
  });
});