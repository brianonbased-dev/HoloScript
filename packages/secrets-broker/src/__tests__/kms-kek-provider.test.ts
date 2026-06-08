import { describe, it, expect } from 'vitest';
import { createKmsKekProvider, KmsKekError, type KmsKeyring } from '../kms-kek-provider';
import { createSecretStore, createInMemorySecretBackend, InsecureKekError } from '../secret-store';
import {
  createEnvKekProvider,
  generateKekBase64,
  KEK_CURRENT_ENV,
  kekEnvVar,
} from '../env-kek-provider';

function fakeKeyring(kekBytes: Buffer, kekId = 'kms-v1'): KmsKeyring {
  return {
    currentKekId: () => kekId,
    async resolveKekBytes() {
      return kekBytes;
    },
  };
}

function envProvider() {
  return createEnvKekProvider({
    env: { [KEK_CURRENT_ENV]: 'v1', [kekEnvVar('v1')]: generateKekBase64() },
  });
}

describe('kms-kek-provider + Phase-3 production gate', () => {
  it('resolves the KEK from the keyring and is marked production-grade', async () => {
    const bytes = Buffer.alloc(32, 7);
    const p = createKmsKekProvider({ keyring: fakeKeyring(bytes) });
    expect(p.productionGrade).toBe(true);
    expect(p.currentKekId()).toBe('kms-v1');
    expect((await p.getKek()).equals(bytes)).toBe(true);
    expect((await p.getKek('kms-v1')).equals(bytes)).toBe(true);
  });

  it('throws KmsKekError on non-32-byte material (length only, no value echoed)', async () => {
    const p = createKmsKekProvider({ keyring: fakeKeyring(Buffer.alloc(16)) });
    await expect(p.getKek()).rejects.toThrow(KmsKekError);
  });

  it('GATE: requireProductionGradeKek REJECTS the env provider with InsecureKekError', () => {
    expect(() =>
      createSecretStore({
        backend: createInMemorySecretBackend(),
        kekProvider: envProvider(),
        requireProductionGradeKek: true,
      })
    ).toThrow(InsecureKekError);
  });

  it('GATE: requireProductionGradeKek ACCEPTS the KMS provider', () => {
    const p = createKmsKekProvider({ keyring: fakeKeyring(Buffer.alloc(32, 9)) });
    expect(() =>
      createSecretStore({
        backend: createInMemorySecretBackend(),
        kekProvider: p,
        requireProductionGradeKek: true,
      })
    ).not.toThrow();
  });

  it('GATE: without the flag, the env provider is allowed (dev default)', () => {
    expect(() =>
      createSecretStore({ backend: createInMemorySecretBackend(), kekProvider: envProvider() })
    ).not.toThrow();
  });

  it('round-trips a real secret through the KMS provider behind the gate', async () => {
    const p = createKmsKekProvider({ keyring: fakeKeyring(Buffer.alloc(32, 3)) });
    const store = createSecretStore({
      backend: createInMemorySecretBackend(),
      kekProvider: p,
      requireProductionGradeKek: true,
    });
    await store.put({ ownerId: 'user-A', name: 'STRIPE_KEY', value: 'sk-prod-123' });
    expect((await store.get({ ownerId: 'user-A', ref: 'vault:STRIPE_KEY' })).value).toBe(
      'sk-prod-123'
    );
  });
});
