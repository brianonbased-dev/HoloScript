import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateTenantKey } from '../tenant-auth.js';

describe('tenant-auth validateTenantKey', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('returns null when no store is configured and key is arbitrary', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.TENANT_AUTH_DEV_MOCK_KEY;
    process.env.NODE_ENV = 'test';

    await expect(validateTenantKey('any-key')).resolves.toBeNull();
  });

  it('never uses dev mock outside NODE_ENV=development', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = 'production';
    process.env.TENANT_AUTH_DEV_MOCK_KEY = 'super-secret-dev-mock';

    await expect(validateTenantKey('super-secret-dev-mock')).resolves.toBeNull();
  });

  it('never uses dev mock in test env even if TENANT_AUTH_DEV_MOCK_KEY matches', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = 'test';
    process.env.TENANT_AUTH_DEV_MOCK_KEY = 'unit-test-key';

    await expect(validateTenantKey('unit-test-key')).resolves.toBeNull();
  });

  it('grants mock enterprise context in development when TENANT_AUTH_DEV_MOCK_KEY matches', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = 'development';
    process.env.TENANT_AUTH_DEV_MOCK_KEY = 'local-only-key';

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await validateTenantKey('local-only-key');
    expect(result).not.toBeNull();
    expect(result?.active).toBe(true);
    expect(result?.scopes).toContain('admin:*');
    expect(result?.tenantContext?.tenantId).toBe('tenant_dev_mock');
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
