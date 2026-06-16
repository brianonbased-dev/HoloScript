import { describe, it, expect } from 'vitest';
import { generateKekBase64, kekEnvVar, KEK_CURRENT_ENV } from '../env-kek-provider';
import { createHoloKeyVault } from '../vault-bootstrap';

/** A working dev env-KEK env block (the bootstrap secret, for tests). */
function devKekEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const kekId = 'k1';
  return { [KEK_CURRENT_ENV]: kekId, [kekEnvVar(kekId)]: generateKekBase64(), ...extra };
}

describe('createHoloKeyVault — Phase 0: turn the vault on', () => {
  it('returns null when no KEK is configured (flag-gate OFF — wiring it into a boot cannot break the boot)', () => {
    expect(createHoloKeyVault({ env: {} })).toBeNull();
  });

  it('turns on with a dev env-KEK and round-trips put -> get -> resolve (encrypted at rest)', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }) });
    expect(vault).not.toBeNull();
    expect(vault!.backend).toBe('in-memory');
    expect(vault!.kekGrade).toBe('dev');

    const owner = 'service:mcp-server';
    const { ref, version } = await vault!.store.put({
      ownerId: owner,
      name: 'OPENAI_API_KEY',
      value: 'sk-test-abc123',
    });
    expect(ref).toBe('vault:OPENAI_API_KEY');
    expect(version).toBe(1);

    // The trusted server-side resolve path returns the plaintext for the owner.
    const resolved = await vault!.resolver.resolve({ authenticatedOwnerId: owner, ref });
    expect(resolved.value).toBe('sk-test-abc123');

    // The raw store get is owner-isolated and returns the same value.
    const got = await vault!.store.get({ ownerId: owner, ref });
    expect(got.value).toBe('sk-test-abc123');
  });

  it('owner-isolation: a different owner cannot resolve another owner\'s secret', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }) })!;
    const { ref } = await vault.store.put({ ownerId: 'service:a', name: 'K', value: 'v' });
    await expect(
      vault.resolver.resolve({ authenticatedOwnerId: 'service:b', ref })
    ).rejects.toThrow();
  });

  it('fail-closed: a resolve with no authenticated owner is denied (never returns a value)', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }) })!;
    await expect(
      vault.resolver.resolve({ authenticatedOwnerId: '', ref: 'vault:anything' })
    ).rejects.toThrow();
  });

  it('prod gate: a dev KEK under NODE_ENV=production stays OFF (returns null, never throws)', () => {
    // requireProductionGradeKek rejects the env KEK; the bootstrap catches it and returns null
    // so a production boot keeps its prior (vault-off) behavior instead of crashing.
    expect(createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'production' }) })).toBeNull();
  });
});
