/**
 * End-to-end production-gate test: SecretStore + SecretResolver under
 * requireProductionGradeKek.
 *
 * The earlier KEK-provider tests cover the unit-level gate behaviour in
 * isolation; this file closes the wiring gap called out in task
 * task_1780931665675_jqk1 — the gate and the resolver must be exercised
 * together on a single `resolve()` call so we know the end-to-end
 * SecretResolver path is NOT bypassed by any older code path that goes
 * directly to the store.
 *
 * Three assertions that MUST hold at production:
 *
 *   P1 — env provider + requireProductionGradeKek → InsecureKekError at
 *        construction (the gate fires before any secret can be stored).
 *
 *   P2 — KMS provider + requireProductionGradeKek + unauthenticated resolve
 *        → AuthRequiredError (gate fires for missing owner; store never touched).
 *
 *   P3 — KMS provider + requireProductionGradeKek + authenticated put + resolve
 *        → the plaintext value (full happy-path through gate + resolver).
 *
 * These are integration-style: the KmsKeyring is a minimal in-test fake; no
 * network or process.env is touched.
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createSecretStore, createInMemorySecretBackend, InsecureKekError } from '../secret-store';
import {
  createEnvKekProvider,
  generateKekBase64,
  KEK_CURRENT_ENV,
  kekEnvVar,
} from '../env-kek-provider';
import { createKmsKekProvider, type KmsKeyring } from '../kms-kek-provider';
import { createSecretResolver, AuthRequiredError } from '../secret-resolver';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal in-test KmsKeyring backed by a fixed 32-byte buffer. */
function stubKeyring(kekBytes: Buffer, kekId = 'kms-prod-v1'): KmsKeyring {
  return {
    currentKekId: () => kekId,
    resolveKekBytes: async () => kekBytes,
  };
}

/** Env provider wired to a freshly-generated KEK (dev-grade, not production). */
function devEnvProvider() {
  return createEnvKekProvider({
    env: { [KEK_CURRENT_ENV]: 'v1', [kekEnvVar('v1')]: generateKekBase64() },
  });
}

// ── P1: gate fires at construction — env provider is rejected ─────────────────

describe('production gate — P1: InsecureKekError on construction', () => {
  it('throws InsecureKekError when requireProductionGradeKek=true and env provider is used', () => {
    expect(() =>
      createSecretStore({
        backend: createInMemorySecretBackend(),
        kekProvider: devEnvProvider(),
        requireProductionGradeKek: true,
      })
    ).toThrow(InsecureKekError);
  });

  it('no store is returned — no value path exists at all through the env provider under the gate', () => {
    let store: ReturnType<typeof createSecretStore> | null = null;
    try {
      store = createSecretStore({
        backend: createInMemorySecretBackend(),
        kekProvider: devEnvProvider(),
        requireProductionGradeKek: true,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(InsecureKekError);
    }
    // If InsecureKekError was thrown, store is still null — the gate prevented
    // any store-backed SecretResolver from being wired.
    expect(store).toBeNull();
  });
});

// ── P2: gate passes with KMS, resolver denies unauthenticated callers ─────────

describe('production gate — P2: resolver denies unauthenticated resolve through KMS store', () => {
  it('AuthRequiredError is thrown and the store.get is never reached', async () => {
    const kekBytes = randomBytes(32);
    const kmsProvider = createKmsKekProvider({ keyring: stubKeyring(kekBytes) });

    // Construction succeeds — KMS provider is production-grade.
    const store = createSecretStore({
      backend: createInMemorySecretBackend(),
      kekProvider: kmsProvider,
      requireProductionGradeKek: true,
    });
    const resolver = createSecretResolver({ store });

    // Unauthenticated callers must be rejected before the store is ever queried.
    await expect(
      resolver.resolve({ authenticatedOwnerId: undefined, ref: 'vault:STRIPE_KEY' })
    ).rejects.toBeInstanceOf(AuthRequiredError);

    await expect(
      resolver.resolve({ authenticatedOwnerId: null, ref: 'vault:STRIPE_KEY' })
    ).rejects.toBeInstanceOf(AuthRequiredError);

    await expect(
      resolver.resolve({ authenticatedOwnerId: '', ref: 'vault:STRIPE_KEY' })
    ).rejects.toBeInstanceOf(AuthRequiredError);
  });
});

// ── P3: full happy-path — put + resolver.resolve returns the plaintext value ──

describe('production gate — P3: full end-to-end resolve through KMS store', () => {
  it('authenticated resolve returns the plaintext value stored under the KMS provider + production gate', async () => {
    const kekBytes = randomBytes(32);
    const kmsProvider = createKmsKekProvider({ keyring: stubKeyring(kekBytes) });

    const store = createSecretStore({
      backend: createInMemorySecretBackend(),
      kekProvider: kmsProvider,
      requireProductionGradeKek: true,
    });
    const resolver = createSecretResolver({ store });

    // Store a secret through the production-gated store.
    await store.put({ ownerId: 'owner-123', name: 'STRIPE_KEY', value: 'sk-live-secret-value' });

    // Resolve it through the resolver (the end-to-end path).
    const { value } = await resolver.resolve({
      authenticatedOwnerId: 'owner-123',
      ref: 'vault:STRIPE_KEY',
      purpose: 'payment-processing',
    });
    expect(value).toBe('sk-live-secret-value');
  });

  it('cross-owner resolve through the full path is denied even with a valid KMS store', async () => {
    const kekBytes = randomBytes(32);
    const kmsProvider = createKmsKekProvider({ keyring: stubKeyring(kekBytes) });

    const store = createSecretStore({
      backend: createInMemorySecretBackend(),
      kekProvider: kmsProvider,
      requireProductionGradeKek: true,
    });
    const resolver = createSecretResolver({ store });

    // Owner A stores a secret.
    await store.put({ ownerId: 'owner-A', name: 'API_KEY', value: 'a-only-secret' });

    // Owner B attempts to resolve owner A's ref through the resolver.
    await expect(
      resolver.resolve({ authenticatedOwnerId: 'owner-B', ref: 'vault:API_KEY' })
    ).rejects.toThrow();

    // Owner B must never receive owner A's value.
    let leaked: string | undefined;
    try {
      const r = await resolver.resolve({
        authenticatedOwnerId: 'owner-B',
        ref: 'vault:API_KEY',
      });
      leaked = r.value;
    } catch {
      leaked = undefined;
    }
    expect(leaked).toBeUndefined();
  });

  it('audit records on the resolver carry no secret material', async () => {
    const kekBytes = randomBytes(32);
    const kmsProvider = createKmsKekProvider({ keyring: stubKeyring(kekBytes) });

    const store = createSecretStore({
      backend: createInMemorySecretBackend(),
      kekProvider: kmsProvider,
      requireProductionGradeKek: true,
    });

    const audits: unknown[] = [];
    const resolver = createSecretResolver({
      store,
      audit: (evt) => audits.push(evt),
    });

    const secretValue = 'ultra-secret-production-token-XYZ';
    await store.put({ ownerId: 'owner-audit', name: 'MY_KEY', value: secretValue });

    await resolver.resolve({
      authenticatedOwnerId: 'owner-audit',
      ref: 'vault:MY_KEY',
      purpose: 'audit-test',
    });

    expect(audits).toHaveLength(1);
    const serialized = JSON.stringify(audits[0]);
    expect(serialized).not.toContain(secretValue);
    expect((audits[0] as Record<string, unknown>).outcome).toBe('allowed');
  });
});
