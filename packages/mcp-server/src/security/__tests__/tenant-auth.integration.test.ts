import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateTenantKey } from '../tenant-auth.js';
import { authorizeToolCall } from '../tool-scopes.js';

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
    expect(result?.tenantContext?.tenantId).toBe('tenant_dev_mock');
    expect(result?.tenantContext?.subscriptionTier).toBe('enterprise');
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  // task jch1: an enterprise key used to carry admin:* and tools:admin, which reach the host's
  // files, git, secrets and install_plugin's in-process code on the server every tenant shares.
  // This proves the key's own scopes and what the scope gate makes of them on a direct call. A
  // tool the key may run that runs OTHER tools (execute_workflow, batch_tool_call) must re-check
  // each inner tool against these same scopes. That is #407 (tasks myvj, 1q9t), and "cannot reach
  // an operator tool" on every route holds only with it merged.
  it('an enterprise key carries no operator scope, so the scope gate refuses it every operator tool', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = 'development';
    process.env.TENANT_AUTH_DEV_MOCK_KEY = 'local-only-key';
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const scopes = (await validateTenantKey('local-only-key'))?.scopes ?? [];
    expect(scopes).not.toContain('admin:*');
    expect(scopes).not.toContain('tools:admin');
    for (const operatorTool of [
      'install_plugin',
      'holo_secrets_resolve',
      'holo_write_file',
      'holo_git_commit',
    ]) {
      expect(authorizeToolCall(operatorTool, scopes).authorized).toBe(false);
    }
    // Control: the key still reaches the ordinary tools it is sold for.
    expect(authorizeToolCall('execute_workflow', scopes).authorized).toBe(true);
    expect(authorizeToolCall('batch_tool_call', scopes).authorized).toBe(true);
  });
});
