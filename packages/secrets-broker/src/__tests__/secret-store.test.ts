/**
 * SecretStore crypto + owner-isolation tests.
 *
 * Uses the exported in-memory backend and a tiny in-test KEK provider so the
 * envelope encryption is exercised without Postgres or any ambient env.
 *
 * The load-bearing case is #2 (owner isolation): user A puts, user B's get of
 * the same ref MUST throw OwnerMismatchError and return no value.
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createSecretStore,
  createInMemorySecretBackend,
  OwnerMismatchError,
  SecretNotFoundError,
  DecryptError,
  type KekProvider,
  type SecretStoreBackend,
} from '../secret-store';

/**
 * In-test KEK provider over a fixed map of `kekId -> 32-byte Buffer`.
 * `current` selects which id `getKek()` (no arg) returns.
 */
function makeKekProvider(keks: Record<string, Buffer>, current: string): KekProvider {
  return {
    async getKek(kekId?: string): Promise<Buffer> {
      const id = kekId ?? current;
      const kek = keks[id];
      if (!kek) throw new Error(`test kek provider: unknown kekId ${id}`);
      return kek;
    },
    currentKekId(): string {
      return current;
    },
  };
}

const KEK_A = randomBytes(32);

function freshStore(provider?: KekProvider): {
  backend: SecretStoreBackend;
  store: ReturnType<typeof createSecretStore>;
} {
  const backend = createInMemorySecretBackend();
  const kekProvider = provider ?? makeKekProvider({ 'kek-1': KEK_A }, 'kek-1');
  const store = createSecretStore({ backend, kekProvider });
  return { backend, store };
}

describe('createSecretStore — round-trip', () => {
  it('put then get (same owner) returns the exact value', async () => {
    const { store } = freshStore();
    const value = 'sk-live-ABC123-secret-value';

    const { ref, version } = await store.put({ ownerId: 'alice', name: 'stripe', value });
    expect(ref).toBe('vault:stripe');
    expect(version).toBe(1);

    const got = await store.get({ ownerId: 'alice', ref });
    expect(got.value).toBe(value);
  });

  it('re-put under the same name bumps the version', async () => {
    const { store } = freshStore();
    const first = await store.put({ ownerId: 'alice', name: 'stripe', value: 'v1' });
    expect(first.version).toBe(1);
    const second = await store.put({ ownerId: 'alice', name: 'stripe', value: 'v2' });
    expect(second.version).toBe(2);
    const got = await store.get({ ownerId: 'alice', ref: 'vault:stripe' });
    expect(got.value).toBe('v2');
  });
});

describe('createSecretStore — OWNER ISOLATION (load-bearing)', () => {
  it('user B get() of user A secret THROWS OwnerMismatchError and returns no value', async () => {
    const { backend, store } = freshStore();
    await store.put({ ownerId: 'alice', name: 'stripe', value: 'alice-only' });

    // B fetches by the same ref. The store enforces isolation INSIDE get():
    // it must throw before any decryption, surfacing no value.
    // We drive the backend to return alice's row regardless of the ownerId
    // filter, so we are testing the store's own owner check — not the backend's.
    const ref = 'vault:stripe';
    const aliceRow = await backend.getByRef({ ownerId: 'alice', ref });
    expect(aliceRow).not.toBeNull();

    const leakyBackend: SecretStoreBackend = {
      ...backend,
      // Return alice's row even when bob asks — forces the store's get() to be
      // the thing that rejects, proving isolation lives in the store.
      async getByRef() {
        return aliceRow;
      },
    };
    const storeWithLeakyBackend = createSecretStore({
      backend: leakyBackend,
      kekProvider: makeKekProvider({ 'kek-1': KEK_A }, 'kek-1'),
    });

    await expect(
      storeWithLeakyBackend.get({ ownerId: 'bob', ref })
    ).rejects.toBeInstanceOf(OwnerMismatchError);

    // And no value is ever produced for bob.
    let leaked: string | undefined;
    try {
      const r = await storeWithLeakyBackend.get({ ownerId: 'bob', ref });
      leaked = r.value;
    } catch {
      leaked = undefined;
    }
    expect(leaked).toBeUndefined();
  });

  it('owner-scoped getByRef alone also yields not-found for the wrong owner', async () => {
    // Belt-and-suspenders: with a normal (non-leaky) backend, bob simply gets
    // SecretNotFoundError because the owner-scoped lookup returns nothing.
    const { store } = freshStore();
    await store.put({ ownerId: 'alice', name: 'stripe', value: 'alice-only' });
    await expect(
      store.get({ ownerId: 'bob', ref: 'vault:stripe' })
    ).rejects.toBeInstanceOf(SecretNotFoundError);
  });
});

describe('createSecretStore — list is metadata only', () => {
  it('list returns names/metadata and NEVER the value or ciphertext', async () => {
    const { store } = freshStore();
    const secret = 'super-secret-token-XYZ';
    await store.put({ ownerId: 'alice', name: 'stripe', value: secret });
    await store.put({ ownerId: 'alice', name: 'github', value: 'ghp_other' });

    const items = await store.list({ ownerId: 'alice' });
    expect(items).toHaveLength(2);

    const names = items.map((i) => i.name).sort();
    expect(names).toEqual(['github', 'stripe']);

    for (const item of items) {
      expect(item.ref).toBe(`vault:${item.name}`);
      expect(item.version).toBe(1);
      expect(typeof item.createdAt).toBe('string');
      // No value/ciphertext fields exist on the metadata shape at all.
      const serialized = JSON.stringify(item);
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain('ciphertext');
      expect(serialized).not.toContain('wrappedDek');
      expect(Object.keys(item)).toEqual(
        expect.arrayContaining(['name', 'ref', 'version', 'createdAt', 'lastUsedAt'])
      );
      expect(Object.keys(item)).not.toContain('ciphertext');
      expect(Object.keys(item)).not.toContain('value');
    }

    // list() must not scope-leak: bob sees none of alice's secrets.
    const bobItems = await store.list({ ownerId: 'bob' });
    expect(bobItems).toHaveLength(0);
  });
});

describe('createSecretStore — tamper detection (GCM auth tag)', () => {
  it('flipping a byte of stored ciphertext makes get throw DecryptError', async () => {
    const { backend, store } = freshStore();
    await store.put({ ownerId: 'alice', name: 'stripe', value: 'untampered-value' });

    const row = await backend.getByRef({ ownerId: 'alice', ref: 'vault:stripe' });
    expect(row).not.toBeNull();
    // Mutate the stored ciphertext in place — GCM tag will no longer verify.
    row!.ciphertext[0] = row!.ciphertext[0] ^ 0xff;

    await expect(
      store.get({ ownerId: 'alice', ref: 'vault:stripe' })
    ).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('createSecretStore — wrong KEK', () => {
  it('a different 32-byte KEK makes get throw DecryptError (DEK unwrap fails)', async () => {
    // put with KEK_A under id 'kek-1'.
    const backend = createInMemorySecretBackend();
    const putStore = createSecretStore({
      backend,
      kekProvider: makeKekProvider({ 'kek-1': KEK_A }, 'kek-1'),
    });
    await putStore.put({ ownerId: 'alice', name: 'stripe', value: 'value-under-kek-A' });

    // get with a provider that returns a DIFFERENT key for the SAME id 'kek-1'.
    const wrongKek = randomBytes(32);
    const getStore = createSecretStore({
      backend,
      kekProvider: makeKekProvider({ 'kek-1': wrongKek }, 'kek-1'),
    });

    await expect(
      getStore.get({ ownerId: 'alice', ref: 'vault:stripe' })
    ).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('createSecretStore — KEK rotation', () => {
  it('rotateKek(old→new): get still works, rows tagged new kekId, only new KEK decrypts', async () => {
    const kekOld = randomBytes(32);
    const kekNew = randomBytes(32);
    const backend = createInMemorySecretBackend();

    // All KEKs available during rotation (provider can resolve both ids).
    const fullProvider = makeKekProvider({ old: kekOld, new: kekNew }, 'old');
    const store = createSecretStore({ backend, kekProvider: fullProvider });

    await store.put({ ownerId: 'alice', name: 'stripe', value: 'rotating-value' });
    await store.put({ ownerId: 'bob', name: 'github', value: 'bob-rotating' });

    // Before rotation, rows are tagged 'old'.
    const before = await backend.getByRef({ ownerId: 'alice', ref: 'vault:stripe' });
    expect(before!.kekId).toBe('old');

    const { rotated } = await store.rotateKek({ fromKekId: 'old', toKekId: 'new' });
    expect(rotated).toBe(2);

    // get still returns the original value (value ciphertext was untouched).
    const got = await store.get({ ownerId: 'alice', ref: 'vault:stripe' });
    expect(got.value).toBe('rotating-value');

    // Rows are now tagged with the new kekId.
    const after = await backend.getByRef({ ownerId: 'alice', ref: 'vault:stripe' });
    expect(after!.kekId).toBe('new');

    // A provider holding ONLY the new KEK can decrypt the rotated rows...
    const newOnly = createSecretStore({
      backend,
      kekProvider: makeKekProvider({ new: kekNew }, 'new'),
    });
    const gotNewOnly = await newOnly.get({ ownerId: 'bob', ref: 'vault:github' });
    expect(gotNewOnly.value).toBe('bob-rotating');

    // ...but a provider holding ONLY the old KEK cannot (rows now reference
    // kekId 'new', which this provider can't resolve → DecryptError).
    const oldOnly = createSecretStore({
      backend,
      kekProvider: makeKekProvider({ old: kekOld }, 'old'),
    });
    await expect(
      oldOnly.get({ ownerId: 'alice', ref: 'vault:stripe' })
    ).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('createSecretStore — delete', () => {
  it('after delete, get throws SecretNotFoundError', async () => {
    const { store } = freshStore();
    await store.put({ ownerId: 'alice', name: 'stripe', value: 'deletable' });

    const res = await store.delete({ ownerId: 'alice', ref: 'vault:stripe' });
    expect(res.deleted).toBe(true);

    await expect(
      store.get({ ownerId: 'alice', ref: 'vault:stripe' })
    ).rejects.toBeInstanceOf(SecretNotFoundError);
  });

  it('user B cannot delete user A secret (owner-scoped delete is a no-op)', async () => {
    const { store } = freshStore();
    await store.put({ ownerId: 'alice', name: 'stripe', value: 'alice-keeps-this' });

    const bobDelete = await store.delete({ ownerId: 'bob', ref: 'vault:stripe' });
    expect(bobDelete.deleted).toBe(false);

    // Alice's secret is still intact and readable.
    const got = await store.get({ ownerId: 'alice', ref: 'vault:stripe' });
    expect(got.value).toBe('alice-keeps-this');
  });
});
