import { describe, it, expect, beforeAll } from 'vitest';
import {
  createInMemorySecretBackend,
  createEnvKekProvider,
  generateKekBase64,
  kekEnvVar,
  KEK_CURRENT_ENV,
} from '@holoscript/secrets-broker';
import {
  createUserVault,
  resolveUserSecret,
  putUserSecret,
  listUserSecretNames,
  isUserVaultConfigured,
  VaultUnconfiguredError,
  __resetUserVaultForTests,
} from '../userSecretStore';

/** A real (non-production) KEK provider for the in-memory round-trip tests. */
function testKekProvider() {
  return createEnvKekProvider({
    env: { [KEK_CURRENT_ENV]: 'v1', [kekEnvVar('v1')]: generateKekBase64() },
  });
}

describe('createUserVault — owner-bound HoloKey vault core', () => {
  it('stores and resolves a secret for its owner (round-trip)', async () => {
    const vault = createUserVault({
      backend: createInMemorySecretBackend(),
      kekProvider: testKekProvider(),
    });
    await vault.store.put({ ownerId: 'user-A', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-owned' });
    const { value } = await vault.resolver.resolve({
      authenticatedOwnerId: 'user-A',
      ref: 'vault:ANTHROPIC_API_KEY',
    });
    expect(value).toBe('sk-ant-owned');
  });

  it("DENIES resolving another user's secret (owner isolation)", async () => {
    const vault = createUserVault({
      backend: createInMemorySecretBackend(),
      kekProvider: testKekProvider(),
    });
    await vault.store.put({ ownerId: 'user-A', name: 'KEY', value: 'a-only' });
    await expect(
      vault.resolver.resolve({ authenticatedOwnerId: 'user-B', ref: 'vault:KEY' })
    ).rejects.toThrow(); // owner-scoped lookup yields no value for user-B
  });

  it('list returns names only (never values); delete removes the secret', async () => {
    const vault = createUserVault({
      backend: createInMemorySecretBackend(),
      kekProvider: testKekProvider(),
    });
    await vault.store.put({ ownerId: 'user-A', name: 'OPENAI_API_KEY', value: 'sk-secret-value' });
    const meta = await vault.store.list({ ownerId: 'user-A' });
    expect(meta.map((m) => m.name)).toEqual(['OPENAI_API_KEY']);
    expect(JSON.stringify(meta)).not.toContain('sk-secret-value'); // metadata carries no value

    const { deleted } = await vault.store.delete({ ownerId: 'user-A', ref: 'vault:OPENAI_API_KEY' });
    expect(deleted).toBe(true);
    await expect(
      vault.resolver.resolve({ authenticatedOwnerId: 'user-A', ref: 'vault:OPENAI_API_KEY' })
    ).rejects.toThrow();
  });
});

describe('user vault singleton — fail-soft when unconfigured', () => {
  beforeAll(() => {
    // No DATABASE_URL and no KEK → the vault must be DISABLED (callers fall back to env).
    delete process.env.DATABASE_URL;
    delete process.env.HOLOKEY_PROD_KEK_CURRENT;
    delete process.env[KEK_CURRENT_ENV];
    __resetUserVaultForTests();
  });

  it('reports not-configured', () => {
    expect(isUserVaultConfigured()).toBe(false);
  });

  it('resolveUserSecret returns null and never throws (clean fall-back signal)', async () => {
    await expect(
      resolveUserSecret({ ownerId: 'user-A', name: 'ANTHROPIC_API_KEY' })
    ).resolves.toBeNull();
  });

  it('putUserSecret throws VaultUnconfiguredError so the write API can surface 501', async () => {
    await expect(putUserSecret({ ownerId: 'user-A', name: 'KEY', value: 'v' })).rejects.toThrow(
      VaultUnconfiguredError
    );
  });

  it('listUserSecretNames returns empty', async () => {
    await expect(listUserSecretNames('user-A')).resolves.toEqual([]);
  });
});
