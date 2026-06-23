import { describe, it, expect } from 'vitest';
import {
  withVaultSecrets,
  resolveVaultSecret,
  agentSecretSpecs,
  type VaultSecretSpec,
} from '../vault-secrets.js';

describe('vault-secrets — vault-first / env-fallback (I.022 phase 2)', () => {
  it('vault OFF (no HOLOKEY_VAULT_BIN): returns the SAME env reference, unchanged', () => {
    const env = {
      HOLOSCRIPT_AGENT_HANDLE: 'jetson-orin-01',
      HOLOSCRIPT_AGENT_X402_BEARER: 'env-bearer',
      HOLOMESH_API_KEY: 'env-key',
    } as NodeJS.ProcessEnv;
    // Identity (not a copy) — proves zero new code path runs when the vault is off.
    expect(withVaultSecrets(env)).toBe(env);
  });

  it('vault ON: overlays the vault value over env, leaving the original env untouched', () => {
    const env = {
      HOLOKEY_VAULT_BIN: '/x/holokey-vault.cjs',
      HOLOSCRIPT_AGENT_HANDLE: 'jetson-orin-01',
      HOLOSCRIPT_AGENT_X402_BEARER: 'env-bearer',
      HOLOMESH_API_KEY: 'env-key',
    } as NodeJS.ProcessEnv;
    const fetch = (_bin: string, spec: VaultSecretSpec): string | undefined =>
      spec.name === 'HOLOSCRIPT_AGENT_X402_BEARER' ? 'vault-bearer' : 'vault-key';

    const out = withVaultSecrets(env, { fetch });
    expect(out).not.toBe(env);
    expect(out.HOLOSCRIPT_AGENT_X402_BEARER).toBe('vault-bearer');
    expect(out.HOLOMESH_API_KEY).toBe('vault-key');
    // original env is never mutated
    expect(env.HOLOSCRIPT_AGENT_X402_BEARER).toBe('env-bearer');
    expect(env.HOLOMESH_API_KEY).toBe('env-key');
  });

  it('vault MISS: falls back to the env value', () => {
    const env = {
      HOLOKEY_VAULT_BIN: '/x',
      HOLOSCRIPT_AGENT_HANDLE: 'h',
      HOLOSCRIPT_AGENT_X402_BEARER: 'env-bearer',
    } as NodeJS.ProcessEnv;
    const fetch = (): string | undefined => undefined;
    expect(withVaultSecrets(env, { fetch }).HOLOSCRIPT_AGENT_X402_BEARER).toBe('env-bearer');
  });

  it('vault ERROR: never throws — falls back to the env value', () => {
    const env = {
      HOLOKEY_VAULT_BIN: '/x',
      HOLOSCRIPT_AGENT_HANDLE: 'h',
      HOLOMESH_API_KEY: 'env-key',
    } as NodeJS.ProcessEnv;
    const fetch = (): string | undefined => {
      throw new Error('boom');
    };
    expect(() => withVaultSecrets(env, { fetch })).not.toThrow();
    expect(withVaultSecrets(env, { fetch }).HOLOMESH_API_KEY).toBe('env-key');
  });

  it('scopes the bearer owner to the seat handle and the API key to infra', () => {
    const seen: Array<[string, string]> = [];
    const fetch = (_bin: string, spec: VaultSecretSpec): string | undefined => {
      seen.push([spec.name, spec.owner]);
      return undefined;
    };
    withVaultSecrets(
      { HOLOKEY_VAULT_BIN: '/x', HOLOSCRIPT_AGENT_HANDLE: 'jetson-orin-fara' } as NodeJS.ProcessEnv,
      { fetch }
    );
    expect(seen).toContainEqual(['HOLOSCRIPT_AGENT_X402_BEARER', 'jetson-orin-fara']);
    expect(seen).toContainEqual(['HOLOMESH_API_KEY', 'infra']);
  });

  it('HOLOKEY_INFRA_OWNER overrides the infra owner; no handle → no bearer spec', () => {
    const specs = agentSecretSpecs({ HOLOKEY_INFRA_OWNER: 'ops' } as NodeJS.ProcessEnv);
    expect(specs).toEqual([{ name: 'HOLOMESH_API_KEY', owner: 'ops' }]);
  });

  it('resolveVaultSecret vault-OFF returns env value directly (no fetch invoked)', () => {
    let called = false;
    const fetch = (): string | undefined => {
      called = true;
      return 'should-not-be-used';
    };
    const v = resolveVaultSecret(
      { name: 'HOLOMESH_API_KEY', owner: 'infra' },
      { HOLOMESH_API_KEY: 'env-key' } as NodeJS.ProcessEnv,
      { fetch }
    );
    expect(v).toBe('env-key');
    expect(called).toBe(false);
  });
});
