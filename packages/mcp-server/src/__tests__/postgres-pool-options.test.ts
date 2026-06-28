import { afterEach, describe, expect, it } from 'vitest';
import { createComputeTracePostgresPoolOptions } from '../compute-trace-store';
import { createDaemonEmergencePostgresPoolOptions } from '../daemon-emergence-store';
import { createRailwayPostgresPoolOptions } from '../postgres-pool-options';

const originalDatabaseSsl = process.env.DATABASE_SSL;

afterEach(() => {
  if (originalDatabaseSsl === undefined) {
    delete process.env.DATABASE_SSL;
  } else {
    process.env.DATABASE_SSL = originalDatabaseSsl;
  }
});

describe('Railway Postgres pool options', () => {
  it('enables TLS by default for Railway-compatible store pools', () => {
    delete process.env.DATABASE_SSL;

    const expected = {
      connectionString: 'postgres://unit-test/corpus-store',
      ssl: { rejectUnauthorized: false },
    };

    expect(createRailwayPostgresPoolOptions(expected.connectionString)).toEqual(expected);
    expect(createComputeTracePostgresPoolOptions(expected.connectionString)).toEqual(expected);
    expect(createDaemonEmergencePostgresPoolOptions(expected.connectionString)).toEqual(expected);
  });

  it('allows local non-TLS Postgres with DATABASE_SSL=false', () => {
    process.env.DATABASE_SSL = 'false';

    const expected = {
      connectionString: 'postgres://unit-test/local-store',
      ssl: false,
    };

    expect(createRailwayPostgresPoolOptions(expected.connectionString)).toEqual(expected);
    expect(createComputeTracePostgresPoolOptions(expected.connectionString)).toEqual(expected);
    expect(createDaemonEmergencePostgresPoolOptions(expected.connectionString)).toEqual(expected);
  });

  it('preserves explicit pool extras such as HoloKey max connections', () => {
    delete process.env.DATABASE_SSL;

    expect(createRailwayPostgresPoolOptions('postgres://unit-test/holokey', { max: 2 })).toEqual({
      connectionString: 'postgres://unit-test/holokey',
      ssl: { rejectUnauthorized: false },
      max: 2,
    });
  });
});
