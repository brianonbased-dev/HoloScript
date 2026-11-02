import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const poolConfigs: unknown[] = [];
const queryMock = vi.fn();

vi.mock('pg', () => ({
  Pool: class {
    query = queryMock;
    constructor(config: unknown) {
      poolConfigs.push(config);
    }
  },
}));

describe('tenant-auth Postgres pool', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    poolConfigs.length = 0;
    queryMock.mockReset();
    process.env.DATABASE_URL = 'postgres://unit-test-host/tenant';
    delete process.env.DATABASE_SSL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('builds the pool from the shared Railway pool options', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { createRailwayPostgresPoolOptions } = await import('../../postgres-pool-options');
    const { validateTenantKey } = await import('../tenant-auth');

    await expect(validateTenantKey('unit-test-key')).resolves.toBeNull();

    expect(poolConfigs).toHaveLength(1);
    expect(poolConfigs[0]).toEqual(
      createRailwayPostgresPoolOptions('postgres://unit-test-host/tenant')
    );
  });

  it('honours DATABASE_SSL=false through the shared helper', async () => {
    process.env.DATABASE_SSL = 'false';
    queryMock.mockResolvedValue({ rows: [] });
    const { validateTenantKey } = await import('../tenant-auth');

    await validateTenantKey('unit-test-key');

    expect(poolConfigs[0]).toMatchObject({ ssl: false });
  });

  it('logs only the error code and name when the query fails', async () => {
    const dbError = Object.assign(
      new Error('connect failed for postgres://user:secret@unit-test-host/tenant'),
      {
        code: 'SELF_SIGNED_CERT_IN_CHAIN',
        host: 'unit-test-host',
      }
    );
    queryMock.mockRejectedValue(dbError);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { validateTenantKey } = await import('../tenant-auth');

    await expect(validateTenantKey('unit-test-key')).resolves.toBeNull();

    const call = warn.mock.calls.find((args) =>
      String(args[0]).includes('[TenantAuth] DB query failed')
    );
    expect(call).toBeDefined();
    expect(call?.slice(1)).toEqual([{ code: 'SELF_SIGNED_CERT_IN_CHAIN', name: 'Error' }]);
    expect(JSON.stringify(call)).not.toContain('secret');
    expect(JSON.stringify(call)).not.toContain('unit-test-host');
  });
});
