import { describe, expect, it } from 'vitest';

import {
  DEV_MEMORY_PERSISTENCE_MODE,
  getStudioPersistenceProbe,
  isDevMemoryPersistenceAllowed,
  requireDevMemoryPersistence,
} from './studio-dev-persistence';

describe('studio dev persistence gate', () => {
  it('allows in-memory persistence only when explicitly enabled outside production', () => {
    expect(
      isDevMemoryPersistenceAllowed({
        NODE_ENV: 'development',
        STUDIO_API_PERSISTENCE: DEV_MEMORY_PERSISTENCE_MODE,
      } as NodeJS.ProcessEnv)
    ).toBe(true);

    expect(
      isDevMemoryPersistenceAllowed({
        NODE_ENV: 'development',
      } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it('refuses nondurable persistence in production even with the dev flag set', async () => {
    const env = {
      NODE_ENV: 'production',
      STUDIO_API_PERSISTENCE: DEV_MEMORY_PERSISTENCE_MODE,
    } as NodeJS.ProcessEnv;

    expect(isDevMemoryPersistenceAllowed(env)).toBe(false);
    const response = requireDevMemoryPersistence('versions', env);
    expect(response?.status).toBe(503);
    await expect(response!.json()).resolves.toMatchObject({
      error: 'Durable persistence is not configured',
      surface: 'versions',
      missing: ['DATABASE_URL'],
      devFallback: {
        allowed: false,
        reason: 'In-memory persistence is disabled when NODE_ENV=production',
      },
    });
  });

  it('probes missing durable storage and the required dev memory mode', () => {
    const probe = getStudioPersistenceProbe({
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv);

    expect(probe.database).toEqual({
      configured: false,
      missing: ['DATABASE_URL'],
    });
    expect(probe.devMemory).toMatchObject({
      allowed: false,
      requiredMode: DEV_MEMORY_PERSISTENCE_MODE,
      productionSafe: true,
    });
  });
});
