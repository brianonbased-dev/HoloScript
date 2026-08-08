import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import {
  PostgresTeamStoreBackend,
  TeamStore,
  type TeamStoreBackend,
  createTeamStorePostgresPoolOptions,
} from '../team-store';

const originalDatabaseSsl = process.env.DATABASE_SSL;

afterEach(() => {
  if (originalDatabaseSsl === undefined) {
    delete process.env.DATABASE_SSL;
  } else {
    process.env.DATABASE_SSL = originalDatabaseSsl;
  }
});

function makeTeam(id: string) {
  return {
    id,
    name: 'Custody Test Team',
    members: [],
    taskBoard: [],
    doneLog: [],
    createdAt: new Date().toISOString(),
  } as any;
}

class FlakyTeamStoreBackend implements TeamStoreBackend {
  attempts = 0;

  constructor(
    private readonly failuresBeforeSuccess: number,
    private readonly teams: Map<string, ReturnType<typeof makeTeam>> = new Map()
  ) {}

  async get(teamId: string) {
    return this.teams.get(teamId);
  }

  async set(teamId: string, team: ReturnType<typeof makeTeam>): Promise<void> {
    this.teams.set(teamId, team);
  }

  async delete(teamId: string): Promise<void> {
    this.teams.delete(teamId);
  }

  async getAll() {
    this.attempts += 1;
    if (this.attempts <= this.failuresBeforeSuccess) {
      const error = new Error('private DNS not ready') as Error & { code?: string };
      error.code = 'EAI_AGAIN';
      throw error;
    }
    return new Map(this.teams);
  }
}

class HangingTeamStoreBackend extends FlakyTeamStoreBackend {
  override async getAll(): Promise<Map<string, ReturnType<typeof makeTeam>>> {
    this.attempts += 1;
    return new Promise(() => undefined);
  }
}

describe('TeamStore PostgreSQL custody options', () => {
  it('enables TLS by default and allows explicit local non-TLS override', () => {
    delete process.env.DATABASE_SSL;
    expect(createTeamStorePostgresPoolOptions('postgres://unit-test/team-store')).toEqual({
      connectionString: 'postgres://unit-test/team-store',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5_000,
      query_timeout: 5_000,
    });

    process.env.DATABASE_SSL = 'false';
    expect(createTeamStorePostgresPoolOptions('postgres://unit-test/team-store')).toEqual({
      connectionString: 'postgres://unit-test/team-store',
      ssl: false,
      connectionTimeoutMillis: 5_000,
      query_timeout: 5_000,
    });
  });

  it('re-arms PostgreSQL schema initialization after a transient connection failure', async () => {
    let connectAttempts = 0;
    const client = {
      query: async () => ({ rows: [] }),
      release: () => undefined,
    };
    const pool = {
      connect: async () => {
        connectAttempts += 1;
        if (connectAttempts === 1) {
          const error = new Error('private DNS not ready') as Error & { code?: string };
          error.code = 'EAI_AGAIN';
          throw error;
        }
        return client;
      },
      query: async () => ({ rows: [] }),
      end: async () => undefined,
    } as unknown as Pool;
    const backend = new PostgresTeamStoreBackend(pool);

    await expect(backend.getAll()).rejects.toThrow('private DNS not ready');
    await expect(backend.getAll()).resolves.toEqual(new Map());
    expect(connectAttempts).toBe(2);
  });

  it('retries a transient durable load and keeps PostgreSQL custody', async () => {
    const team = makeTeam('team_custody');
    const backend = new FlakyTeamStoreBackend(2, new Map([[team.id, team]]));
    const store = new TeamStore(backend, true);
    const delays: number[] = [];

    await store.loadAll({
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 10,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    });

    expect(backend.attempts).toBe(3);
    expect(delays).toEqual([10, 10]);
    expect(store.usesPostgres).toBe(true);
    expect(store.get(team.id)).toEqual(team);
  });

  it('fails closed after the retry window instead of demoting to writable memory', async () => {
    const backend = new FlakyTeamStoreBackend(Number.POSITIVE_INFINITY);
    const store = new TeamStore(backend, true);
    const team = makeTeam('team_cached');
    store.set(team.id, team);

    await expect(
      store.loadAll({
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        sleep: async () => undefined,
      })
    ).rejects.toThrow('private DNS not ready');

    expect(backend.attempts).toBe(3);
    expect(store.usesPostgres).toBe(true);
    expect(store.get(team.id)).toEqual(team);
  });

  it('times out a hung durable load and keeps the retry window finite', async () => {
    const backend = new HangingTeamStoreBackend(0);
    const store = new TeamStore(backend, true);

    await expect(
      store.loadAll({
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        attemptTimeoutMs: 5,
        sleep: async () => undefined,
      })
    ).rejects.toThrow('durable team load timed out after 5ms');

    expect(backend.attempts).toBe(2);
    expect(store.usesPostgres).toBe(true);
  });

  it('rejects non-finite retry options before starting a durable load', async () => {
    const backend = new FlakyTeamStoreBackend(0);
    const store = new TeamStore(backend, true);

    await expect(store.loadAll({ maxAttempts: Number.NaN })).rejects.toThrow(
      'maxAttempts must be finite'
    );
    await expect(store.loadAll({ maxAttempts: Number.POSITIVE_INFINITY })).rejects.toThrow(
      'maxAttempts must be finite'
    );
    await expect(store.loadAll({ attemptTimeoutMs: Number.POSITIVE_INFINITY })).rejects.toThrow(
      'attemptTimeoutMs must be finite'
    );
    expect(backend.attempts).toBe(0);
  });

  it('makes initStores reject without entering JSON team fallback after exhaustion', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousDataDir = process.env.HOLOMESH_DATA_DIR;
    const dataDir = mkdtempSync(join(tmpdir(), 'holomesh-team-store-fail-closed-'));
    const exhaustion = new Error('durable retry window exhausted');

    process.env.DATABASE_URL = 'postgres://unit-test/team-store-fail-closed';
    process.env.HOLOMESH_DATA_DIR = dataDir;
    vi.resetModules();
    vi.doMock('@holoscript/framework', () => ({
      BountyManager: class BountyManager {},
      KnowledgeMarketplace: class KnowledgeMarketplace {},
    }));

    try {
      const state = await import('../state');
      const loadAll = vi.spyOn(state.teamStore, 'loadAll').mockRejectedValue(exhaustion);
      const fallbackSet = vi.spyOn(state.teamStore, 'set');

      await expect(state.initStores()).rejects.toBe(exhaustion);
      expect(loadAll).toHaveBeenCalledTimes(1);
      expect(fallbackSet).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      vi.doUnmock('@holoscript/framework');
      vi.resetModules();
      rmSync(dataDir, { recursive: true, force: true });
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousDataDir === undefined) delete process.env.HOLOMESH_DATA_DIR;
      else process.env.HOLOMESH_DATA_DIR = previousDataDir;
    }
  });
});
