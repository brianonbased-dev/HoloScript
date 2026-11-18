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

  it('logs only the error code and name when the Upstash lookup fails', async () => {
    delete process.env.DATABASE_URL;
    process.env.UPSTASH_REDIS_REST_URL = 'https://unit-test-cache.example';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'unit-test-cache-token';
    const fetchError = Object.assign(
      new Error(
        'request to https://unit-test-cache.example/get/apikey:unitTestTenantKey0001 failed'
      ),
      { code: 'ECONNRESET' }
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(fetchError));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { validateTenantKey } = await import('../tenant-auth');

    await expect(validateTenantKey('unitTestTenantKey0001')).resolves.toBeNull();

    const call = warn.mock.calls.find((args) =>
      String(args[0]).includes('[TenantAuth] Upstash query failed')
    );
    expect(call?.slice(1)).toEqual([{ code: 'ECONNRESET', name: 'Error' }]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('unitTestTenantKey0001');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('unit-test-cache');
    vi.unstubAllGlobals();
  });

  describe('revokeTenantKeyById', () => {
    it('marks the row revoked by id', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 7, tenant_id: 'tenant_seven', key: 'k' }] });
      const { revokeTenantKeyById } = await import('../tenant-auth');

      await expect(revokeTenantKeyById(7)).resolves.toEqual({
        status: 'revoked',
        id: 7,
        tenantId: 'tenant_seven',
        cacheCleared: null,
      });
      const [sql, params] = queryMock.mock.calls[0];
      expect(sql).toContain('SET revoked = true');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual([7]);
    });

    it('reports not_found when no row matches', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const { revokeTenantKeyById } = await import('../tenant-auth');
      await expect(revokeTenantKeyById(99)).resolves.toEqual({ status: 'not_found' });
    });

    it('reports unavailable without a database', async () => {
      delete process.env.DATABASE_URL;
      const { revokeTenantKeyById } = await import('../tenant-auth');
      await expect(revokeTenantKeyById(7)).resolves.toEqual({ status: 'unavailable' });
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('reports unavailable and logs only code and name when the update fails', async () => {
      queryMock.mockRejectedValue(
        Object.assign(new Error('connect failed for postgres://user:secret@unit-test-host/t'), {
          code: 'ECONNREFUSED',
        })
      );
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { revokeTenantKeyById } = await import('../tenant-auth');

      await expect(revokeTenantKeyById(7)).resolves.toEqual({ status: 'unavailable' });
      expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('unit-test-host');
    });

    it('clears the cached entry when Upstash is configured', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://unit-test-cache.example';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'unit-test-cache-token';
      queryMock.mockResolvedValue({ rows: [{ id: 7, tenant_id: 'tenant_seven', key: 'abc/def' }] });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      const { revokeTenantKeyById } = await import('../tenant-auth');

      const result = await revokeTenantKeyById(7);

      expect(result).toMatchObject({ status: 'revoked', cacheCleared: true });
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://unit-test-cache.example/del/apikey:abc%2Fdef'
      );
      vi.unstubAllGlobals();
    });
  });
});
