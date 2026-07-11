import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clientQueryMock, connectMock, endMock, queryMock, releaseMock } = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  connectMock: vi.fn(),
  endMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: class MockPool {
    query = queryMock;
    end = endMock;
    connect = connectMock;
  },
}));

import {
  SOVEREIGN_MEMORY_REQUIRED_COLUMNS,
  SOVEREIGN_MEMORY_SCHEMA_SQL,
  SOVEREIGN_MEMORY_TABLE,
  SovereignMemoryStore,
} from './sovereign-memory-store.js';

describe('SovereignMemoryStore workspace isolation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    clientQueryMock.mockReset();
    connectMock.mockReset();
    endMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockResolvedValue({ query: clientQueryMock, release: releaseMock });
  });

  it('scopes recall queries to the configured workspace', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const store = new SovereignMemoryStore({ workspaceId: 'workspace-a' });

    await store.recall('fleet');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id = $1 AND content ILIKE $2'),
      ['workspace-a', '%fleet%', 10]
    );
  });

  it('scopes deletes to the configured workspace', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const store = new SovereignMemoryStore({ workspaceId: 'workspace-a' });

    await store.forget('W.AGENTS.abc');

    expect(queryMock).toHaveBeenCalledWith(
      `DELETE FROM ${SOVEREIGN_MEMORY_TABLE} WHERE workspace_id = $1 AND id = $2`,
      ['workspace-a', 'W.AGENTS.abc']
    );
  });

  it('refuses to overwrite an entry owned by another workspace', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    const store = new SovereignMemoryStore({ workspaceId: 'workspace-a' });

    await expect(
      store.store({
        id: 'W.AGENTS.shared',
        authorAgent: 'agent-a',
        content: 'attempted overwrite',
      })
    ).rejects.toThrow('belongs to a different workspace');
  });

  it('reports schema readiness without exposing connection configuration', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          table_name: SOVEREIGN_MEMORY_TABLE,
          present_column_count: SOVEREIGN_MEMORY_REQUIRED_COLUMNS.length,
        },
      ],
    });
    const store = new SovereignMemoryStore({
      connectionString: 'postgres://memory:secret@example.test/knowledge',
      workspaceId: 'workspace-a',
    });

    const health = await store.health();

    expect(health.ok).toBe(true);
    expect(health.schemaReady).toBe(true);
    expect(health.workspaceId).toBe('workspace-a');
    expect(JSON.stringify(health)).not.toContain('secret');
    expect(JSON.stringify(health)).not.toContain('example.test');
  });

  it('boots the schema in transaction order before checking health', async () => {
    clientQueryMock.mockResolvedValue({ rows: [] });
    queryMock.mockResolvedValue({
      rows: [
        {
          table_name: SOVEREIGN_MEMORY_TABLE,
          present_column_count: SOVEREIGN_MEMORY_REQUIRED_COLUMNS.length,
        },
      ],
    });
    const store = new SovereignMemoryStore({ workspaceId: 'workspace-a' });

    const receipt = await store.ensureSchema();

    expect(clientQueryMock.mock.calls.map(([statement]) => statement)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ...SOVEREIGN_MEMORY_SCHEMA_SQL,
      'COMMIT',
    ]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledOnce();
    expect(receipt.ok).toBe(true);
    expect(receipt.statementsApplied).toBe(SOVEREIGN_MEMORY_SCHEMA_SQL.length);
  });

  it('rolls back and releases the client when schema creation fails', async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockResolvedValueOnce({ rows: [] });
    const store = new SovereignMemoryStore({ workspaceId: 'workspace-a' });

    await expect(store.ensureSchema()).rejects.toThrow('permission denied');

    expect(clientQueryMock.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(releaseMock).toHaveBeenCalledOnce();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
