import { describe, it, expect } from 'vitest';
import { generateKekBase64, kekEnvVar, KEK_CURRENT_ENV } from '../env-kek-provider';
import { createHoloKeyVault } from '../vault-bootstrap';
import { createServiceSecretResolver } from '../service-secret-resolver';
import {
  infraSecretRef,
  normalizeServiceSecretRef,
  resolveServiceIdentity,
} from '../service-identity';

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

  it('service identity: derives owner from HoloMesh agent id when HOLOKEY_OWNER is absent', async () => {
    const identity = resolveServiceIdentity({ env: { HOLOMESH_AGENT_ID: 'agent_123' } });
    expect(identity).toMatchObject({
      ownerId: 'infra://agent/agent_123',
      source: 'holomesh-agent',
      namespace: 'infra',
    });
  });

  it('service identity: explicit HOLOKEY_OWNER preserves compatibility', async () => {
    const identity = resolveServiceIdentity({
      env: { HOLOKEY_OWNER: 'infra', HOLOMESH_AGENT_ID: 'agent_123' },
    });
    expect(identity.ownerId).toBe('infra');
    expect(identity.source).toBe('explicit');
  });

  it('service identity: x402 bearer becomes a hash fingerprint, not a plaintext owner id', async () => {
    const identity = resolveServiceIdentity({ env: { HOLOMESH_X402_BEARER: 'bearer-secret' } });
    expect(identity.source).toBe('x402-bearer');
    expect(identity.ownerId).toMatch(/^infra:\/\/x402\/[a-f0-9]{20}$/);
    expect(identity.ownerId).not.toContain('bearer-secret');
    expect(identity.label).not.toContain('bearer-secret');
  });

  it('infra:// refs resolve against the service owner and fall back to env by secret name', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv() })!;
    const owner = 'infra://agent/agent_service_1';
    await vault.store.put({ ownerId: owner, name: 'OPENAI_API_KEY', value: 'sk-infra-vault' });
    const r = createServiceSecretResolver({
      vault,
      env: {
        HOLOMESH_AGENT_ID: 'agent_service_1',
        OPENAI_API_KEY: 'sk-infra-env',
        ANTHROPIC_API_KEY: 'sk-infra-anthropic-env',
      },
      log: silent,
    });
    expect(r.identity().ownerId).toBe(owner);
    expect(await r.resolve('infra://OPENAI_API_KEY')).toBe('sk-infra-vault');
    expect(await r.resolve('infra://mcp-server/ANTHROPIC_API_KEY')).toBe(
      'sk-infra-anthropic-env'
    );
  });

  it('normalizes operational refs without widening non-infra workspace refs', () => {
    expect(normalizeServiceSecretRef('OPENAI_API_KEY')).toEqual({
      ref: 'vault:OPENAI_API_KEY',
      envName: 'OPENAI_API_KEY',
      namespace: 'env-name',
    });
    expect(normalizeServiceSecretRef('vault:OPENAI_API_KEY')).toEqual({
      ref: 'vault:OPENAI_API_KEY',
      envName: 'OPENAI_API_KEY',
      namespace: 'vault',
    });
    expect(normalizeServiceSecretRef('infra://mcp/OPENAI_API_KEY')).toEqual({
      ref: 'vault:OPENAI_API_KEY',
      envName: 'OPENAI_API_KEY',
      namespace: 'infra',
    });
    expect(infraSecretRef('OPENAI_API_KEY')).toBe('infra://OPENAI_API_KEY');
    expect(() => normalizeServiceSecretRef('secret://workspace/ws/OPENAI_API_KEY')).toThrow(
      /UPPER_SNAKE/
    );
  });
});
