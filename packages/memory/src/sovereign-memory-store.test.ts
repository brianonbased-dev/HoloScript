import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const endMock = vi.fn();

vi.mock('pg', () => ({
  Pool: class MockPool {
    query = queryMock;
    end = endMock;
  },
}));

import { SovereignMemoryStore } from './sovereign-memory-store.js';

describe('SovereignMemoryStore workspace isolation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    endMock.mockReset();
  });

  it('scopes recall queries to the configured workspace', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const store = new SovereignMemoryStore({ workspaceId: 'workspace-a' });

    await store.recall('fleet');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id = $1 AND content ILIKE $2'),
      ['workspace-a', '%fleet%', 10],
    );
  });

  it('scopes deletes to the configured workspace', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const store = new SovereignMemoryStore({ workspaceId: 'workspace-a' });

    await store.forget('W.AGENTS.abc');

    expect(queryMock).toHaveBeenCalledWith(
      'DELETE FROM memory_entries WHERE workspace_id = $1 AND id = $2',
      ['workspace-a', 'W.AGENTS.abc'],
    );
  });

  it('refuses to overwrite an entry owned by another workspace', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    const store = new SovereignMemoryStore({ workspaceId: 'workspace-a' });

    await expect(store.store({
      id: 'W.AGENTS.shared',
      authorAgent: 'agent-a',
      content: 'attempted overwrite',
    })).rejects.toThrow('belongs to a different workspace');
  });
});
