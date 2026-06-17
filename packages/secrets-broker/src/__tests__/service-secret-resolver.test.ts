import { describe, it, expect } from 'vitest';
import { generateKekBase64, kekEnvVar, KEK_CURRENT_ENV } from '../env-kek-provider';
import { createHoloKeyVault } from '../vault-bootstrap';
import { createServiceSecretResolver } from '../service-secret-resolver';

function devKekEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const id = 'k1';
  return { [KEK_CURRENT_ENV]: id, [kekEnvVar(id)]: generateKekBase64(), ...extra };
}
const silent = () => {};

describe('createServiceSecretResolver — Phase 1: resolve from vault, else process.env', () => {
  it('vault HIT: returns the vault value (wins over process.env)', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv() })!;
    await vault.store.put({ ownerId: 'infra', name: 'OPENAI_API_KEY', value: 'sk-from-vault' });
    const r = createServiceSecretResolver({
      vault,
      owner: 'infra',
      env: { OPENAI_API_KEY: 'sk-from-env' },
      log: silent,
    });
    expect(await r.resolve('OPENAI_API_KEY')).toBe('sk-from-vault');
    expect(r.vaultEnabled()).toBe(true);
  });

  it('vault MISS (key not in vault): falls back to process.env — the migration bridge', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv() })!;
    const r = createServiceSecretResolver({
      vault,
      owner: 'infra',
      env: { ANTHROPIC_API_KEY: 'sk-env-anthropic' },
      log: silent,
    });
    expect(await r.resolve('ANTHROPIC_API_KEY')).toBe('sk-env-anthropic');
  });

  it('vault OFF: falls back to process.env (zero behavior change for a consumer)', async () => {
    const r = createServiceSecretResolver({ vault: null, env: { X_KEY: 'env-x' }, log: silent });
    expect(await r.resolve('X_KEY')).toBe('env-x');
    expect(r.vaultEnabled()).toBe(false);
  });

  it('missing everywhere: undefined', async () => {
    const r = createServiceSecretResolver({ vault: null, env: {}, log: silent });
    expect(await r.resolve('NOPE')).toBeUndefined();
  });

  it('owner-isolation: cannot read another owner\'s secret — falls back to env (never leaks)', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv() })!;
    await vault.store.put({ ownerId: 'other-service', name: 'K', value: 'other-secret' });
    const r = createServiceSecretResolver({ vault, owner: 'infra', env: { K: 'env-k' }, log: silent });
    expect(await r.resolve('K')).toBe('env-k');
  });
});
