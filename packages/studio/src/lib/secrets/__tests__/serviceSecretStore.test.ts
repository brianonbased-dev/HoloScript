import { describe, expect, it } from 'vitest';
import {
  createHoloKeyVault,
  generateKekBase64,
  kekEnvVar,
  KEK_CURRENT_ENV,
} from '@holoscript/secrets-broker';
import { createStudioServiceSecretResolver } from '../serviceSecretStore';

function devKekEnv(
  extra: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  const id = 'studio_k1';
  return { [KEK_CURRENT_ENV]: id, [kekEnvVar(id)]: generateKekBase64(), ...extra };
}

const silent = () => {};

describe('createStudioServiceSecretResolver', () => {
  it('resolves service LLM keys from the HoloKey vault before env fallback', async () => {
    const env = devKekEnv({ HOLOKEY_OWNER: 'infra://service/studio' });
    const vault = createHoloKeyVault({ env })!;
    await vault.store.put({
      ownerId: 'infra://service/studio',
      name: 'ANTHROPIC_API_KEY',
      value: 'sk-studio-vault',
    });

    const resolver = createStudioServiceSecretResolver({
      env: { ...env, ANTHROPIC_API_KEY: 'sk-studio-env' },
      vault,
      log: silent,
    });

    expect(await resolver.resolve('ANTHROPIC_API_KEY')).toBe('sk-studio-vault');
  });

  it('keeps env fallback for services not migrated yet', async () => {
    const resolver = createStudioServiceSecretResolver({
      env: { OPENROUTER_API_KEY: 'sk-studio-env' },
      vault: null,
      log: silent,
    });

    expect(await resolver.resolve('OPENROUTER_API_KEY')).toBe('sk-studio-env');
  });

  it('resolves env-provided vault refs and does not return ref strings as keys', async () => {
    const env = devKekEnv({ HOLOKEY_OWNER: 'infra://service/studio' });
    const vault = createHoloKeyVault({ env })!;
    await vault.store.put({
      ownerId: 'infra://service/studio',
      name: 'OPENAI_API_KEY',
      value: 'sk-openai-vault',
    });

    const resolver = createStudioServiceSecretResolver({
      env: { ...env, STUDIO_OPENAI_KEY: 'infra://studio/OPENAI_API_KEY' },
      vault,
      log: silent,
    });

    expect(await resolver.resolve('STUDIO_OPENAI_KEY')).toBe('sk-openai-vault');

    const vaultOff = createStudioServiceSecretResolver({
      env: { STUDIO_OPENAI_KEY: 'vault:OPENAI_API_KEY' },
      vault: null,
      log: silent,
    });
    expect(await vaultOff.resolve('STUDIO_OPENAI_KEY')).toBeUndefined();
  });
});
