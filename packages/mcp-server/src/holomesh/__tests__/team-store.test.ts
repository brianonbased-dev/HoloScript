import { afterEach, describe, expect, it } from 'vitest';
import {
  InMemoryTeamStoreBackend,
  TeamStore,
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

describe('TeamStore PostgreSQL custody options', () => {
  it('enables TLS by default and allows explicit local non-TLS override', () => {
    delete process.env.DATABASE_SSL;
    expect(createTeamStorePostgresPoolOptions('postgres://unit-test/team-store')).toEqual({
      connectionString: 'postgres://unit-test/team-store',
      ssl: { rejectUnauthorized: false },
    });

    process.env.DATABASE_SSL = 'false';
    expect(createTeamStorePostgresPoolOptions('postgres://unit-test/team-store')).toEqual({
      connectionString: 'postgres://unit-test/team-store',
      ssl: false,
    });
  });

  it('demotes a failed Postgres wrapper to memory while preserving cached teams', async () => {
    const store = new TeamStore(new InMemoryTeamStoreBackend(), true);
    const team = makeTeam('team_custody');

    store.set(team.id, team);
    expect(store.usesPostgres).toBe(true);

    store.fallbackToMemory();

    expect(store.usesPostgres).toBe(false);
    expect(store.get(team.id)).toEqual(team);
    await expect(store.persist(team.id)).resolves.toBeUndefined();
  });
});
