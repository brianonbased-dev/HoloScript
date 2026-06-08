import { describe, it, expect } from 'vitest';
import {
  createEnvKekProvider,
  generateKekBase64,
  kekEnvVar,
  KEK_CURRENT_ENV,
  EnvKekConfigError,
} from '../env-kek-provider';
import { createSecretStore, createInMemorySecretBackend } from '../secret-store';

function envWith(kekId: string, b64: string): Record<string, string | undefined> {
  return { [KEK_CURRENT_ENV]: kekId, [kekEnvVar(kekId)]: b64 };
}

describe('env-kek-provider', () => {
  it('generateKekBase64 produces base64 of exactly 32 bytes', () => {
    const b64 = generateKekBase64();
    expect(Buffer.from(b64, 'base64').length).toBe(32);
  });

  it('getKek() returns the current 32-byte KEK; currentKekId() returns the id', async () => {
    const b64 = generateKekBase64();
    const p = createEnvKekProvider({ env: envWith('v1', b64) });
    expect(p.currentKekId()).toBe('v1');
    const kek = await p.getKek();
    expect(kek.length).toBe(32);
    expect(kek.equals(Buffer.from(b64, 'base64'))).toBe(true);
  });

  it('getKek(kekId) resolves a specific KEK version (for rotation/history)', async () => {
    const v1 = generateKekBase64();
    const v2 = generateKekBase64();
    const env = {
      [KEK_CURRENT_ENV]: 'v2',
      [kekEnvVar('v1')]: v1,
      [kekEnvVar('v2')]: v2,
    };
    const p = createEnvKekProvider({ env });
    expect((await p.getKek('v1')).equals(Buffer.from(v1, 'base64'))).toBe(true);
    expect((await p.getKek('v2')).equals(Buffer.from(v2, 'base64'))).toBe(true);
    expect((await p.getKek()).equals(Buffer.from(v2, 'base64'))).toBe(true); // current = v2
  });

  it('throws when SECRETS_VAULT_KEK_CURRENT is unset', async () => {
    const p = createEnvKekProvider({ env: {} });
    expect(() => p.currentKekId()).toThrow(EnvKekConfigError);
    await expect(p.getKek()).rejects.toThrow(EnvKekConfigError);
  });

  it('throws when the named KEK var is missing', async () => {
    const p = createEnvKekProvider({ env: { [KEK_CURRENT_ENV]: 'v9' } });
    await expect(p.getKek()).rejects.toThrow(/SECRETS_VAULT_KEK_V9 is not set/);
  });

  it('throws when the KEK is not 32 bytes (never echoes the value)', async () => {
    const short = Buffer.alloc(16).toString('base64');
    const p = createEnvKekProvider({ env: envWith('v1', short) });
    await expect(p.getKek()).rejects.toThrow(/must be base64 of 32 bytes \(got 16\)/);
  });

  it('rejects an unsafe kekId charset (env-var-name injection guard)', async () => {
    const p = createEnvKekProvider({ env: { [KEK_CURRENT_ENV]: 'v1; rm -rf' } });
    expect(() => p.currentKekId()).toThrow(EnvKekConfigError);
  });

  it('round-trips a real secret through SecretStore using the env provider', async () => {
    const provider = createEnvKekProvider({ env: envWith('v1', generateKekBase64()) });
    const store = createSecretStore({ backend: createInMemorySecretBackend(), kekProvider: provider });
    await store.put({ ownerId: 'user-A', name: 'OPENAI_API_KEY', value: 'sk-live-xyz' });
    const got = await store.get({ ownerId: 'user-A', ref: 'vault:OPENAI_API_KEY' });
    expect(got.value).toBe('sk-live-xyz');
  });
});
