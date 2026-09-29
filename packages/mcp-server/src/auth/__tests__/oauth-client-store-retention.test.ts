/**
 * The durable OAuth client store must keep taking clients, and must say so
 * loudly when it cannot (board task_1790545471449_w6yi).
 *
 * What was wrong: the store refused every registration once it held 1000
 * clients, and nothing was ever removed, so from 2026-06-28 it took no new
 * client at all. `/oauth/register` caught that refusal, logged a warning, and
 * still answered 201 with a client held only in memory, which the next deploy
 * wiped. Nobody could tell.
 *
 * What must hold now:
 *   - a full store surfaces as a refusal the caller sees, with the in-memory
 *     half undone, an error logged, and the refusal counted;
 *   - room is made only by retiring clients that are provably idle: no token
 *     row of any kind, no token issued within the idle window, and not
 *     registered within it. A client holding a live token is never touched;
 *   - issuing a token records use, on the write-through path production takes;
 *   - rewriting a client the store already holds takes no new slot;
 *   - below the cap nothing changes, idle clients included.
 *
 * These drive the store and the registration decision directly. The HTTP route
 * is covered through the real server in
 * src/__tests__/oauth-register-durable-store.test.ts, and the Postgres SQL
 * against a real database in postgres-token-store.retention.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  ClientStoreFullError,
  DEFAULT_CLIENT_IDLE_RETIREMENT_MS,
  InMemoryTokenStore,
  TokenStore,
  type TokenStoreBackend,
} from '../token-store';
import {
  CLIENT_REGISTRATION_REFUSED_METRIC,
  CLIENTS_RETIRED_METRIC,
  OAuth2Provider,
  prepareClientForUse,
  registerClientDurably,
  type RegistrationMetrics,
} from '../oauth2-provider';
import { PostgresTokenStore } from '../postgres-token-store';
import { OAuth21Service, resetOAuth21Service } from '../../security/oauth21';

const DAY = 86_400_000;

/** cleanupIntervalMs 0: no timer, so the suite never holds the event loop open. */
function storeOver(backend: TokenStoreBackend): TokenStore {
  return new TokenStore({ backend, cleanupIntervalMs: 0 });
}

const REGISTRATION = {
  clientName: 'retention-test',
  redirectUris: ['https://client.test/callback'],
  scopes: ['tools:read'],
  clientType: 'confidential' as const,
  rateLimit: 60,
};

/** Put a client straight into the backend with a chosen age and last use. */
async function seedClient(
  backend: TokenStoreBackend,
  clientId: string,
  ages: { idleDays: number; registeredDaysAgo?: number }
): Promise<void> {
  const now = Date.now();
  await backend.setClient({
    clientId,
    clientSecretHash: 'seeded-hash',
    clientName: `seeded ${clientId}`,
    redirectUris: [],
    scopes: ['tools:read'],
    createdAt: now - (ages.registeredDaysAgo ?? Math.max(ages.idleDays, 90)) * DAY,
    clientType: 'confidential',
    rateLimit: 60,
    lastUsedAt: now - ages.idleDays * DAY,
  });
}

async function giveLiveAccessToken(backend: TokenStoreBackend, clientId: string): Promise<void> {
  const now = Date.now();
  await backend.setAccessToken({
    token: `at_${clientId}`,
    clientId,
    scopes: ['tools:read'],
    issuedAt: now - 60_000,
    expiresAt: now + 3_600_000,
  });
}

async function giveRefreshToken(backend: TokenStoreBackend, clientId: string): Promise<void> {
  const now = Date.now();
  await backend.setRefreshToken({
    token: `rt_${clientId}`,
    clientId,
    scopes: ['tools:read'],
    issuedAt: now - 60_000,
    expiresAt: now + DAY,
    chainId: `chain_${clientId}`,
    used: false,
  });
}

/** Records what registerClientDurably reports, in the shape the Prometheus registry takes. */
function recordingMetrics(): RegistrationMetrics & {
  incs: Array<{ name: string; labels?: Record<string, string>; value?: number }>;
} {
  const incs: Array<{ name: string; labels?: Record<string, string>; value?: number }> = [];
  return {
    incs,
    registerCounter: () => {},
    incCounter: (name, labels, value) => {
      incs.push({ name, labels, value });
    },
  };
}

function memoryRegistry(maxClients?: number): OAuth21Service {
  return new OAuth21Service({
    tokenSecret: 'x'.repeat(64),
    migrationMode: 'permissive',
    legacyApiKey: 'hs_legacy_key_unused_by_these_tests',
    ...(maxClients !== undefined ? { maxClients } : {}),
  });
}

beforeEach(() => {
  resetOAuth21Service();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a full client store fails loud, never a silent 201', () => {
  it('the store refuses with ClientStoreFullError when nothing in it is idle', async () => {
    const backend = new InMemoryTokenStore();
    for (const id of ['a', 'b', 'c']) await seedClient(backend, id, { idleDays: 1 });

    const attempt = storeOver(backend).registerClient({ ...REGISTRATION, maxClients: 3 });

    await expect(attempt).rejects.toBeInstanceOf(ClientStoreFullError);
    // The old message survives as the prefix, so existing matchers still hold.
    await expect(
      storeOver(backend).registerClient({ ...REGISTRATION, maxClients: 3 })
    ).rejects.toThrow('Maximum client registration limit reached');
    expect(await backend.countClients()).toBe(3);
  });

  it('the registration is refused, the in-memory half undone, the error logged and counted', async () => {
    const backend = new InMemoryTokenStore();
    for (const id of ['a', 'b', 'c']) await seedClient(backend, id, { idleDays: 1 });
    const memory = memoryRegistry();
    const durable = new OAuth2Provider({ backend, maxClients: 3 });
    const metrics = recordingMetrics();
    const logError = vi.fn();

    const outcome = await registerClientDurably({ memory, durable }, REGISTRATION, {
      metrics,
      logError,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.reason).toBe('store_full');
    expect(outcome.message).toMatch(/Nothing was created/);
    expect(outcome).not.toHaveProperty('clientId');
    // No credential exists anywhere that the durable store did not record.
    expect(memory.getStats().registeredClients).toBe(0);
    expect(await backend.countClients()).toBe(3);
    // Loud: one error line naming the reason, and the refusal counted.
    expect(logError).toHaveBeenCalledTimes(1);
    expect(String(logError.mock.calls[0][0])).toMatch(/REFUSED \(store_full\)/);
    expect(metrics.incs).toEqual([
      { name: CLIENT_REGISTRATION_REFUSED_METRIC, labels: { reason: 'store_full' } },
    ]);
    durable.destroy();
  });

  it('a durable store that fails outright is refused too, not handed out from memory', async () => {
    const memory = memoryRegistry();
    const durable = {
      registerClient: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
    };
    const metrics = recordingMetrics();
    const logError = vi.fn();

    const outcome = await registerClientDurably({ memory, durable }, REGISTRATION, {
      metrics,
      logError,
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'store_error' });
    expect(memory.getStats().registeredClients).toBe(0);
    expect(String(logError.mock.calls[0][0])).toMatch(/REFUSED \(store_error\).*ECONNREFUSED/);
    expect(metrics.incs).toEqual([
      { name: CLIENT_REGISTRATION_REFUSED_METRIC, labels: { reason: 'store_error' } },
    ]);
  });

  it('a full in-memory registry is reported as memory_full, and the durable store is not touched', async () => {
    const memory = memoryRegistry(1);
    memory.registerClient(REGISTRATION);
    const durable = { registerClient: vi.fn() };
    const metrics = recordingMetrics();

    const outcome = await registerClientDurably({ memory, durable }, REGISTRATION, {
      metrics,
      logError: () => {},
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'memory_full' });
    expect(durable.registerClient).not.toHaveBeenCalled();
    expect(memory.getStats().registeredClients).toBe(1);
  });

  it('any other failure from the in-memory registry still throws, so the route keeps answering 400', async () => {
    const memory = {
      registerClient: () => {
        throw new Error('redirect_uris must use HTTPS');
      },
      revokeClient: () => false,
    };
    const durable = { registerClient: vi.fn() };

    await expect(
      registerClientDurably({ memory, durable }, REGISTRATION, {
        metrics: recordingMetrics(),
        logError: () => {},
      })
    ).rejects.toThrow('redirect_uris must use HTTPS');
  });
});

describe('retention makes room only from provably idle clients', () => {
  it('retires the idle client with no tokens, never one holding a live access or refresh token', async () => {
    const backend = new InMemoryTokenStore();
    // The token holders are the LONGEST idle, so only the token check can save them.
    await seedClient(backend, 'idle_with_access_token', { idleDays: 60 });
    await giveLiveAccessToken(backend, 'idle_with_access_token');
    await seedClient(backend, 'idle_with_refresh_token', { idleDays: 50 });
    await giveRefreshToken(backend, 'idle_with_refresh_token');
    await seedClient(backend, 'idle_no_tokens', { idleDays: 40 });

    const registered = await storeOver(backend).registerClient({ ...REGISTRATION, maxClients: 3 });

    expect(registered.retiredClientIds).toEqual(['idle_no_tokens']);
    expect(await backend.getClient('idle_no_tokens')).toBeUndefined();
    expect(await backend.getClient('idle_with_access_token')).toBeDefined();
    expect(await backend.getClient('idle_with_refresh_token')).toBeDefined();
    expect(await backend.getClient(registered.clientId)).toBeDefined();
    expect(await backend.countClients()).toBe(3);
  });

  it('a client used within the idle window stays even with no tokens, and the store refuses instead', async () => {
    const backend = new InMemoryTokenStore();
    await seedClient(backend, 'used_29_days_ago', { idleDays: 29 });
    await seedClient(backend, 'idle_with_access_token', { idleDays: 60 });
    await giveLiveAccessToken(backend, 'idle_with_access_token');
    await seedClient(backend, 'idle_with_refresh_token', { idleDays: 50 });
    await giveRefreshToken(backend, 'idle_with_refresh_token');

    await expect(
      storeOver(backend).registerClient({ ...REGISTRATION, maxClients: 3 })
    ).rejects.toBeInstanceOf(ClientStoreFullError);

    expect(await backend.getClient('used_29_days_ago')).toBeDefined();
    expect(await backend.countClients()).toBe(3);
  });

  it('a client registered within the idle window is never retired, whatever its last-use stamp says', async () => {
    const backend = new InMemoryTokenStore();
    await seedClient(backend, 'registered_5_days_ago', { idleDays: 40, registeredDaysAgo: 5 });

    await expect(
      storeOver(backend).registerClient({ ...REGISTRATION, maxClients: 1 })
    ).rejects.toBeInstanceOf(ClientStoreFullError);
    expect(await backend.getClient('registered_5_days_ago')).toBeDefined();
  });

  it('retires the longest-idle first, and only as many as the registration needs', async () => {
    const backend = new InMemoryTokenStore();
    await seedClient(backend, 'idle_40', { idleDays: 40 });
    await seedClient(backend, 'idle_60', { idleDays: 60 });
    await seedClient(backend, 'idle_50', { idleDays: 50 });

    const registered = await storeOver(backend).registerClient({ ...REGISTRATION, maxClients: 3 });

    expect(registered.retiredClientIds).toEqual(['idle_60']);
    expect(await backend.getClient('idle_40')).toBeDefined();
    expect(await backend.getClient('idle_50')).toBeDefined();
  });

  it.each([
    [
      'the legacy write-through (every production grant)',
      async (store: TokenStore, clientId: string) => {
        const now = Date.now();
        await store.importAccessToken({
          token: 'at_written_through',
          clientId,
          scopes: ['tools:read'],
          issuedAt: now,
          expiresAt: now + 3_600_000,
        });
        await store.backend.deleteAccessToken('at_written_through');
      },
    ],
    [
      'a grant issued by the provider itself',
      async (store: TokenStore, clientId: string) => {
        const { accessToken, refreshToken } = await store.issueTokenPair({
          clientId,
          scopes: ['tools:read'],
        });
        await store.backend.deleteAccessToken(accessToken.token);
        await store.backend.deleteRefreshToken(refreshToken.token);
      },
    ],
  ])('a token issued through %s records use, so the client is no longer idle', async (_, issue) => {
    const backend = new InMemoryTokenStore();
    await seedClient(backend, 'came_back', { idleDays: 40 });
    const store = storeOver(backend);

    // Issued, then gone (expired and swept): only the recorded use remains.
    await issue(store, 'came_back');

    expect((await backend.getClient('came_back'))?.lastUsedAt).toBeGreaterThan(Date.now() - 60_000);
    await expect(store.registerClient({ ...REGISTRATION, maxClients: 1 })).rejects.toBeInstanceOf(
      ClientStoreFullError
    );
    expect(await backend.getClient('came_back')).toBeDefined();
  });

  it('the idle window never drops below the refresh-token lifetime', async () => {
    const backend = new InMemoryTokenStore();
    await seedClient(backend, 'idle_40', { idleDays: 40 });
    const store = new TokenStore({
      backend,
      cleanupIntervalMs: 0,
      ttl: { refreshTokenTTL: 60 * 24 * 3600 },
    });

    await expect(
      store.registerClient({
        ...REGISTRATION,
        maxClients: 1,
        clientIdleRetirementMs: DEFAULT_CLIENT_IDLE_RETIREMENT_MS,
      })
    ).rejects.toBeInstanceOf(ClientStoreFullError);
    expect(await backend.getClient('idle_40')).toBeDefined();
  });

  it('a backend that records no use never retires anything', async () => {
    const inner = new InMemoryTokenStore();
    await seedClient(inner, 'idle_90', { idleDays: 90 });
    // A custom backend written before retention existed: no touchClient, no retireIdleClients.
    const bare: TokenStoreBackend = {
      getAccessToken: (t) => inner.getAccessToken(t),
      setAccessToken: (t) => inner.setAccessToken(t),
      deleteAccessToken: (t) => inner.deleteAccessToken(t),
      deleteAccessTokensByClient: (c) => inner.deleteAccessTokensByClient(c),
      getRefreshToken: (t) => inner.getRefreshToken(t),
      setRefreshToken: (t) => inner.setRefreshToken(t),
      deleteRefreshToken: (t) => inner.deleteRefreshToken(t),
      deleteRefreshTokensByClient: (c) => inner.deleteRefreshTokensByClient(c),
      markRefreshTokenUsed: (t) => inner.markRefreshTokenUsed(t),
      getAuthorizationCode: (c) => inner.getAuthorizationCode(c),
      setAuthorizationCode: (c) => inner.setAuthorizationCode(c),
      deleteAuthorizationCode: (c) => inner.deleteAuthorizationCode(c),
      markAuthorizationCodeUsed: (c) => inner.markAuthorizationCodeUsed(c),
      getClient: (c) => inner.getClient(c),
      setClient: (c) => inner.setClient(c),
      deleteClient: (c) => inner.deleteClient(c),
      countClients: () => inner.countClients(),
      isChainRevoked: (c) => inner.isChainRevoked(c),
      revokeChain: (c) => inner.revokeChain(c),
      cleanup: () => inner.cleanup(),
      getStats: () => inner.getStats(),
    };

    await expect(
      storeOver(bare).registerClient({ ...REGISTRATION, maxClients: 1 })
    ).rejects.toBeInstanceOf(ClientStoreFullError);
    expect(await inner.getClient('idle_90')).toBeDefined();
  });

  it('clients retired to make room are counted and dropped from the in-memory registry too', async () => {
    const backend = new InMemoryTokenStore();
    await seedClient(backend, 'idle_no_tokens', { idleDays: 40 });
    const memory = memoryRegistry();
    // Cached in this process, as a hydrated client would be.
    memory.importClient({
      clientId: 'idle_no_tokens',
      clientSecret: 'seeded-hash',
      clientName: 'seeded idle_no_tokens',
      redirectUris: [],
      scopes: ['tools:read'],
      createdAt: Date.now() - 90 * DAY,
      clientType: 'confidential',
      rateLimit: 60,
    });
    const durable = new OAuth2Provider({ backend, maxClients: 1 });
    const metrics = recordingMetrics();

    const outcome = await registerClientDurably({ memory, durable }, REGISTRATION, {
      metrics,
      logError: () => {},
    });

    expect(outcome).toMatchObject({ ok: true, retiredClientIds: ['idle_no_tokens'] });
    expect(memory.getClient('idle_no_tokens')).toBeUndefined();
    expect(metrics.incs).toEqual([{ name: CLIENTS_RETIRED_METRIC, labels: {}, value: 1 }]);
    durable.destroy();
  });

  it('clients retired before the insert failed are still dropped from memory and counted', async () => {
    const backend = new InMemoryTokenStore();
    await seedClient(backend, 'idle_no_tokens', { idleDays: 40 });
    const memory = memoryRegistry();
    memory.importClient({
      clientId: 'idle_no_tokens',
      clientSecret: 'seeded-hash',
      clientName: 'seeded idle_no_tokens',
      redirectUris: [],
      scopes: ['tools:read'],
      createdAt: Date.now() - 90 * DAY,
      clientType: 'confidential',
      rateLimit: 60,
    });
    // The retirement commits, then the insert of the new client fails.
    const realSetClient = backend.setClient.bind(backend);
    vi.spyOn(backend, 'setClient').mockImplementation(async (client) => {
      if (client.clientId !== 'idle_no_tokens') throw new Error('insert failed: disk full');
      return realSetClient(client);
    });
    const durable = new OAuth2Provider({ backend, maxClients: 1 });
    const metrics = recordingMetrics();

    const outcome = await registerClientDurably({ memory, durable }, REGISTRATION, {
      metrics,
      logError: () => {},
    });

    expect(outcome).toMatchObject({
      ok: false,
      reason: 'store_error',
      retiredClientIds: ['idle_no_tokens'],
    });
    expect(memory.getClient('idle_no_tokens')).toBeUndefined();
    expect(metrics.incs).toContainEqual({ name: CLIENTS_RETIRED_METRIC, labels: {}, value: 1 });
    durable.destroy();
  });
});

describe('a sign-in records use before anything is issued', () => {
  it('records the use first, then loads the client into memory with its agent binding', async () => {
    const backend = new InMemoryTokenStore();
    const now = Date.now();
    await backend.setClient({
      clientId: 'returning',
      clientSecretHash: 'seeded-hash',
      clientName: 'returning',
      redirectUris: ['https://client.test/callback'],
      scopes: ['tools:read'],
      createdAt: now - 90 * DAY,
      clientType: 'confidential',
      rateLimit: 60,
      agentId: 'agent_owner',
      lastUsedAt: now - 40 * DAY,
    });
    const memory = memoryRegistry();
    const durable = new OAuth2Provider({ backend, maxClients: 1 });

    const prepared = await prepareClientForUse({ memory, durable }, 'returning');

    expect(prepared).toBe('recorded');
    expect((await backend.getClient('returning'))?.lastUsedAt).toBeGreaterThan(now - 60_000);
    expect(memory.getClient('returning')?.agentId).toBe('agent_owner');
    // Mid sign-in, a registration at the cap now finds nothing idle to retire.
    await expect(
      durable.getStore().registerClient({ ...REGISTRATION, maxClients: 1 })
    ).rejects.toBeInstanceOf(ClientStoreFullError);
    expect(await backend.getClient('returning')).toBeDefined();
    durable.destroy();
  });

  it('a client the durable store no longer holds is dropped from memory, so no token can be issued to it', async () => {
    const backend = new InMemoryTokenStore();
    const memory = memoryRegistry();
    const { clientId, clientSecret } = memory.registerClient(REGISTRATION);
    const durable = new OAuth2Provider({ backend });

    const prepared = await prepareClientForUse({ memory, durable }, clientId);

    expect(prepared).toBe('unknown');
    expect(memory.getClient(clientId)).toBeUndefined();
    expect(() => memory.exchangeClientCredentials({ clientId, clientSecret })).toThrow(
      /not registered/
    );
    durable.destroy();
  });

  it('when the store cannot answer, the sign-in goes on with the in-memory copy', async () => {
    const memory = memoryRegistry();
    const { clientId } = memory.registerClient(REGISTRATION);
    const durable = {
      noteClientUse: vi.fn().mockResolvedValue(undefined),
      getClient: vi.fn(),
    };

    const prepared = await prepareClientForUse({ memory, durable }, clientId);

    expect(prepared).toBe('unrecorded');
    expect(memory.getClient(clientId)).toBeDefined();
  });

  it('a store that does not answer in time does not hold the sign-in up', async () => {
    const memory = memoryRegistry();
    const { clientId } = memory.registerClient(REGISTRATION);
    const durable = {
      noteClientUse: vi.fn(() => new Promise<boolean | undefined>(() => {})),
      getClient: vi.fn(),
    };
    const logWarn = vi.fn();

    const prepared = await prepareClientForUse({ memory, durable }, clientId, {
      recordTimeoutMs: 20,
      logWarn,
    });

    expect(prepared).toBe('unrecorded');
    expect(memory.getClient(clientId)).toBeDefined();
    expect(String(logWarn.mock.calls[0][0])).toMatch(/took over 20ms/);
  });

  it('writing a token records use before the token row, so a racing retirement sees it first', async () => {
    const inner = new InMemoryTokenStore();
    await seedClient(inner, 'granted', { idleDays: 40 });
    const calls: string[] = [];
    const spied: TokenStoreBackend = Object.assign(Object.create(inner) as InMemoryTokenStore, {
      touchClient: async (clientId: string, at: number) => {
        calls.push('touchClient');
        return inner.touchClient(clientId, at);
      },
      setAccessToken: async (token: Parameters<InMemoryTokenStore['setAccessToken']>[0]) => {
        calls.push('setAccessToken');
        return inner.setAccessToken(token);
      },
    });
    const now = Date.now();

    await storeOver(spied).importAccessToken({
      token: 'at_granted',
      clientId: 'granted',
      scopes: ['tools:read'],
      issuedAt: now,
      expiresAt: now + 3_600_000,
    });

    expect(calls).toEqual(['touchClient', 'setAccessToken']);
  });
});

describe('re-registering an identity the store already holds', () => {
  it('rewrites that row in place: no new slot, nothing retired, the use clock only moves forward', async () => {
    const backend = new InMemoryTokenStore();
    const store = storeOver(backend);
    const first = await store.registerClient({
      ...REGISTRATION,
      clientId: 'hsc_same_identity',
      clientSecret: 'first-secret',
      maxClients: 2,
    });
    await seedClient(backend, 'idle_no_tokens', { idleDays: 40 });
    const usedAt = (await backend.getClient('hsc_same_identity'))?.lastUsedAt as number;

    const again = await store.registerClient({
      ...REGISTRATION,
      clientId: 'hsc_same_identity',
      clientSecret: 'second-secret',
      maxClients: 2,
    });

    expect(again.clientId).toBe(first.clientId);
    expect(again.retiredClientIds).toEqual([]);
    expect(await backend.getClient('idle_no_tokens')).toBeDefined();
    expect(await backend.countClients()).toBe(2);
    const row = await backend.getClient('hsc_same_identity');
    expect(row?.clientSecretHash).toBe(store.hashSecret('second-secret'));
    expect(row?.lastUsedAt).toBeGreaterThanOrEqual(usedAt);
  });
});

describe('under the cap nothing changes', () => {
  it('nothing is retired below the cap, not even clients idle for months', async () => {
    const backend = new InMemoryTokenStore();
    for (const id of ['idle_90_a', 'idle_90_b', 'idle_90_c']) {
      await seedClient(backend, id, { idleDays: 90 });
    }

    const registered = await storeOver(backend).registerClient({
      ...REGISTRATION,
      maxClients: 10,
    });

    expect(registered.retiredClientIds).toEqual([]);
    expect(await backend.countClients()).toBe(4);
  });

  it('both registries hold the same identity, and no refusal is logged or counted', async () => {
    const backend = new InMemoryTokenStore();
    const memory = memoryRegistry();
    const durable = new OAuth2Provider({ backend });
    const metrics = recordingMetrics();
    const logError = vi.fn();

    const outcome = await registerClientDurably(
      { memory, durable },
      { ...REGISTRATION, agentId: 'agent_owner' },
      { metrics, logError }
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    const inMemory = memory.getClient(outcome.clientId);
    const stored = await backend.getClient(outcome.clientId);
    expect(inMemory?.clientSecret).toBe(stored?.clientSecretHash);
    expect(stored?.agentId).toBe('agent_owner');
    expect(logError).not.toHaveBeenCalled();
    expect(metrics.incs).toEqual([]);
    durable.destroy();
  });
});

/**
 * The SQL production runs, pinned clause by clause so that deleting any
 * protection fails here, in every run, even where no PostgreSQL is available.
 * What the SQL DOES is proven against a real database in
 * postgres-token-store.retention.test.ts (`pnpm test:oauth-postgres`).
 */
describe('the Postgres retirement SQL keeps every protective clause', () => {
  function capturingStore(): { store: PostgresTokenStore; sql: string[]; params: unknown[][] } {
    const sql: string[] = [];
    const params: unknown[][] = [];
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      sql.push(text.replace(/\s+/g, ' ').trim());
      params.push(values ?? []);
      return { rows: [], rowCount: 0 };
    });
    return { store: new PostgresTokenStore({ query } as unknown as Pool), sql, params };
  }

  it('retires only rows with no token of any kind, idle and registered before the cutoff, re-checked at delete', async () => {
    const { store, sql, params } = capturingStore();

    await store.retireIdleClients({ idleBefore: 1_000, limit: 3 });

    const retire = sql[sql.length - 1];
    expect(retire).toMatch(
      /NOT EXISTS \(SELECT 1 FROM oauth_access_tokens a WHERE a\.client_id = i\.client_id\)/
    );
    expect(retire).toMatch(
      /NOT EXISTS \(SELECT 1 FROM oauth_refresh_tokens r WHERE r\.client_id = i\.client_id\)/
    );
    expect(retire).toMatch(/i\.last_used_at < \$1/);
    expect(retire).toMatch(/i\.created_at < \$1/);
    expect(retire).toMatch(/ORDER BY i\.last_used_at ASC/);
    expect(retire).toMatch(/LIMIT \$2 FOR UPDATE SKIP LOCKED/);
    expect(retire).toMatch(/\) AND c\.last_used_at < \$1 RETURNING c\.client_id$/);
    expect(params[params.length - 1]).toEqual([1_000, 3]);
  });

  it('never moves the use clock back, and adds the column to a table that already has rows', async () => {
    const { store, sql } = capturingStore();

    await store.touchClient('c', 5);
    await store.setClient({
      clientId: 'c',
      clientSecretHash: 'h',
      clientName: 'c',
      redirectUris: [],
      scopes: [],
      createdAt: 1,
      clientType: 'public',
      rateLimit: 60,
    });

    const [schema, touch, upsert] = sql;
    expect(schema).toMatch(
      /ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS last_used_at BIGINT NOT NULL DEFAULT/
    );
    expect(touch).toMatch(/SET last_used_at = GREATEST\(last_used_at, \$2\) WHERE client_id = \$1/);
    expect(upsert).toMatch(
      /last_used_at = GREATEST\(oauth_clients\.last_used_at, EXCLUDED\.last_used_at\)/
    );
  });
});

describe('the Postgres store does not cache a failed schema step', () => {
  it('a database blip at the first call is retried on the next call, not remembered forever', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5432'))
      .mockResolvedValue({ rows: [{ count: 7 }], rowCount: 1 });
    const store = new PostgresTokenStore({ query } as unknown as Pool);

    await expect(store.countClients()).rejects.toThrow('ECONNREFUSED');
    await expect(store.countClients()).resolves.toBe(7);
  });
});
