import { describe, it, expect } from 'vitest';
import { createScopedSecretKeyring, ScopedSecretKeyringError } from '../scoped-secret-keyring';
import { createKmsKekProvider } from '../kms-kek-provider';
import { createSecretStore, createInMemorySecretBackend } from '../secret-store';

function env32(kekId = 'v1'): Record<string, string | undefined> {
  return {
    HOLOKEY_PROD_KEK_CURRENT: kekId,
    [`HOLOKEY_PROD_KEK_${kekId.toUpperCase()}`]: Buffer.alloc(32, 5).toString('base64'),
  };
}

describe('scoped-secret-keyring (production KEK source)', () => {
  it('resolves the 32-byte KEK + currentKekId from the scoped env namespace', async () => {
    const k = createScopedSecretKeyring({ env: env32('v1') });
    expect(k.currentKekId()).toBe('v1');
    expect((await k.resolveKekBytes('v1')).length).toBe(32);
  });

  it('throws when the scoped vars are absent', async () => {
    const k = createScopedSecretKeyring({ env: {} });
    expect(() => k.currentKekId()).toThrow(ScopedSecretKeyringError);
    await expect(k.resolveKekBytes('v1')).rejects.toThrow(ScopedSecretKeyringError);
  });

  it('throws on wrong-length material (length only, no value echoed)', async () => {
    const k = createScopedSecretKeyring({
      env: {
        HOLOKEY_PROD_KEK_CURRENT: 'v1',
        HOLOKEY_PROD_KEK_V1: Buffer.alloc(16).toString('base64'),
      },
    });
    await expect(k.resolveKekBytes('v1')).rejects.toThrow(/32 bytes \(got 16\)/);
  });

  it('yields a production-grade provider the SecretStore gate accepts + round-trips a secret', async () => {
    const provider = createKmsKekProvider({
      keyring: createScopedSecretKeyring({ env: env32('v1') }),
    });
    expect(provider.productionGrade).toBe(true);
    const store = createSecretStore({
      backend: createInMemorySecretBackend(),
      kekProvider: provider,
      requireProductionGradeKek: true,
    });
    await store.put({ ownerId: 'u', name: 'K', value: 'v' });
    expect((await store.get({ ownerId: 'u', ref: 'vault:K' })).value).toBe('v');
  });
});
