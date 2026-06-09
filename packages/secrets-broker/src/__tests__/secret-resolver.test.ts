import { describe, it, expect, vi } from 'vitest';
import { createSecretStore, createInMemorySecretBackend, type SecretStore } from '../secret-store';
import {
  createEnvKekProvider,
  generateKekBase64,
  KEK_CURRENT_ENV,
  kekEnvVar,
} from '../env-kek-provider';
import {
  createSecretResolver,
  AuthRequiredError,
  type SecretResolveAudit,
} from '../secret-resolver';
import { PolicyDeniedError } from '../secret-access-policy';

function buildStore(): SecretStore {
  const env = { [KEK_CURRENT_ENV]: 'v1', [kekEnvVar('v1')]: generateKekBase64() };
  return createSecretStore({
    backend: createInMemorySecretBackend(),
    kekProvider: createEnvKekProvider({ env }),
  });
}

describe('secret-resolver (fail-closed + owner-bound + audited)', () => {
  it('FAIL CLOSED: no authenticated owner -> AuthRequiredError, store never touched, audit denied', async () => {
    const store = buildStore();
    const getSpy = vi.spyOn(store, 'get');
    const audits: SecretResolveAudit[] = [];
    const resolver = createSecretResolver({ store, audit: (e) => audits.push(e) });

    for (const owner of [undefined, null, '']) {
      await expect(
        resolver.resolve({ authenticatedOwnerId: owner, ref: 'vault:KEY' })
      ).rejects.toThrow(AuthRequiredError);
    }
    expect(getSpy).not.toHaveBeenCalled(); // never reached the store
    expect(audits).toHaveLength(3);
    expect(audits.every((a) => a.outcome === 'denied' && a.reason === 'AuthRequiredError')).toBe(
      true
    );
    expect(audits.every((a) => a.ownerId === '<none>')).toBe(true);
  });

  it('resolves the owner-own secret and audits an allow (no value in the audit)', async () => {
    const store = buildStore();
    await store.put({ ownerId: 'user-A', name: 'KEY', value: 'super-secret' });
    const audits: SecretResolveAudit[] = [];
    const resolver = createSecretResolver({ store, audit: (e) => audits.push(e) });

    const { value } = await resolver.resolve({
      authenticatedOwnerId: 'user-A',
      ref: 'vault:KEY',
      purpose: 'brittney-llm-call',
    });
    expect(value).toBe('super-secret');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      outcome: 'allowed',
      ownerId: 'user-A',
      ref: 'vault:KEY',
      purpose: 'brittney-llm-call',
    });
    expect(JSON.stringify(audits[0])).not.toContain('super-secret'); // audit carries no value
  });

  it("DENIES a cross-owner resolve (user B cannot read user A's secret) and audits the denial", async () => {
    const store = buildStore();
    await store.put({ ownerId: 'user-A', name: 'KEY', value: 'a-only' });
    const audits: SecretResolveAudit[] = [];
    const resolver = createSecretResolver({ store, audit: (e) => audits.push(e) });

    await expect(
      resolver.resolve({ authenticatedOwnerId: 'user-B', ref: 'vault:KEY' })
    ).rejects.toThrow(); // SecretNotFound (owner-scoped lookup) — no value, no oracle
    expect(audits).toHaveLength(1);
    expect(audits[0].outcome).toBe('denied');
    expect(audits[0].ownerId).toBe('user-B');
  });

  it('audits a denial for an absent secret', async () => {
    const store = buildStore();
    const audits: SecretResolveAudit[] = [];
    const resolver = createSecretResolver({ store, audit: (e) => audits.push(e) });

    await expect(
      resolver.resolve({ authenticatedOwnerId: 'user-A', ref: 'vault:NOPE' })
    ).rejects.toThrow();
    expect(audits[0]).toMatchObject({
      outcome: 'denied',
      ownerId: 'user-A',
      reason: 'SecretNotFoundError',
    });
  });
});

describe('secret-resolver scope gate (HoloGate scope axis)', () => {
  it('resolver-level policy DENIES an out-of-scope ref BEFORE the store is touched', async () => {
    const store = buildStore();
    await store.put({ ownerId: 'user-A', name: 'FLEET_DEPLOY_KEY', value: 'do-not-leak' });
    const getSpy = vi.spyOn(store, 'get');
    const audits: SecretResolveAudit[] = [];
    const resolver = createSecretResolver({
      store,
      audit: (e) => audits.push(e),
      policy: { allow: ['vault:OPENAI_API_KEY'] }, // FLEET_DEPLOY_KEY is out of scope
    });

    await expect(
      resolver.resolve({ authenticatedOwnerId: 'user-A', ref: 'vault:FLEET_DEPLOY_KEY' })
    ).rejects.toThrow(PolicyDeniedError);
    expect(getSpy).not.toHaveBeenCalled(); // scope is checked before the store — no decrypt
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      outcome: 'denied',
      ownerId: 'user-A',
      ref: 'vault:FLEET_DEPLOY_KEY',
      reason: 'PolicyDeniedError',
    });
  });

  it('resolver-level policy ALLOWS an in-scope, owned ref', async () => {
    const store = buildStore();
    await store.put({ ownerId: 'user-A', name: 'OPENAI_API_KEY', value: 'sk-in-scope' });
    const resolver = createSecretResolver({
      store,
      policy: { allow: ['vault:OPENAI_API_KEY'] },
    });

    const { value } = await resolver.resolve({
      authenticatedOwnerId: 'user-A',
      ref: 'vault:OPENAI_API_KEY',
    });
    expect(value).toBe('sk-in-scope');
  });

  it('per-call scope denies even with NO resolver-level policy, without touching the store', async () => {
    const store = buildStore();
    await store.put({ ownerId: 'user-A', name: 'FLEET_DEPLOY_KEY', value: 'do-not-leak' });
    const getSpy = vi.spyOn(store, 'get');
    const resolver = createSecretResolver({ store }); // no resolver-level policy

    await expect(
      resolver.resolve({
        authenticatedOwnerId: 'user-A',
        ref: 'vault:FLEET_DEPLOY_KEY',
        scope: { allow: ['vault:OPENAI_API_KEY'] },
      })
    ).rejects.toThrow(PolicyDeniedError);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('per-call scope can only RESTRICT the resolver policy, never widen it', async () => {
    const store = buildStore();
    // Owner genuinely owns it AND the resolver policy admits it — only the call scope excludes it.
    await store.put({ ownerId: 'user-A', name: 'FLEET_DEPLOY_KEY', value: 'do-not-leak' });
    const getSpy = vi.spyOn(store, 'get');
    const resolver = createSecretResolver({
      store,
      policy: { allow: ['vault:*'] }, // resolver policy WOULD admit it
    });

    // Narrowed by a per-call scope that excludes it -> denied despite ownership + resolver policy.
    await expect(
      resolver.resolve({
        authenticatedOwnerId: 'user-A',
        ref: 'vault:FLEET_DEPLOY_KEY',
        scope: { allow: ['vault:OPENAI_API_KEY'] },
      })
    ).rejects.toThrow(PolicyDeniedError);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('block WINS through the resolver — an owned, allow-matched ref on the blocklist is denied', async () => {
    const store = buildStore();
    await store.put({ ownerId: 'user-A', name: 'FLEET_DEPLOY_KEY', value: 'do-not-leak' });
    const getSpy = vi.spyOn(store, 'get');
    const audits: SecretResolveAudit[] = [];
    const resolver = createSecretResolver({
      store,
      audit: (e) => audits.push(e),
      policy: { allow: ['vault:*'], block: ['vault:FLEET_*'] },
    });

    const err = await resolver
      .resolve({ authenticatedOwnerId: 'user-A', ref: 'vault:FLEET_DEPLOY_KEY' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PolicyDeniedError);
    expect((err as PolicyDeniedError).reason).toBe('blocked');
    expect(getSpy).not.toHaveBeenCalled();
    expect(audits[0]).toMatchObject({ outcome: 'denied', reason: 'PolicyDeniedError' });
  });
});
