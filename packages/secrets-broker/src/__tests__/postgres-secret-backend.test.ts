/**
 * Postgres SecretStore backend tests.
 *
 * A small in-memory fake `query` pattern-matches ONLY the statements the backend
 * emits (INSERT ... ON CONFLICT / SELECT / DELETE ... RETURNING / two UPDATEs),
 * mirroring how `postgres-lease-adapter.test.ts` fakes the runner. It is NOT a
 * general SQL engine — it operates on a Map and reproduces the one piece of
 * Postgres semantics the backend relies on: UPSERT on UNIQUE(owner_id, name)
 * (the conflicting row keeps its primary key and every crypto column is
 * overwritten). bytea columns round-trip as Buffers; timestamptz columns are
 * handed back as JS `Date`s (as the real `pg` driver does) to exercise the
 * backend's ISO-normalization read path.
 *
 * Coverage: insert+getByRef round-trip (Buffers byte-for-byte), getByName,
 * UPSERT (re-insert same owner/name replaces + bumps version), listByOwner
 * (owner-scoped), listByKekId (spans owners), deleteByRef (boolean),
 * touchLastUsed, updateWrappedDek. Then an INTEGRATION test driving a real
 * `createSecretStore` over this backend to prove owner isolation holds THROUGH
 * the Postgres backend.
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createPostgresSecretBackend,
  type SecretQueryRunner,
} from '../postgres-secret-backend';
import {
  createSecretStore,
  OwnerMismatchError,
  type KekProvider,
  type SecretRow,
} from '../secret-store';
import type { SecretRef } from '../types';

// ── Fake `secret_store` table + query runner ─────────────────────────────────

/** A stored row in the fake DB. Buffers stay Buffers; timestamps stay ISO strings. */
interface FakeSecretRow {
  id: string;
  owner_id: string;
  name: string;
  ref: string;
  ciphertext: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  wrapped_dek: Buffer;
  dek_iv: Buffer;
  dek_auth_tag: Buffer;
  kek_id: string;
  version: number;
  created_at: string; // ISO; read path hands back a Date built from this
  last_used_at: string | null;
}

/** Project a stored row to the column shape a real `pg` SELECT would return. */
function projectRow(r: FakeSecretRow): Record<string, unknown> {
  return {
    id: r.id,
    owner_id: r.owner_id,
    name: r.name,
    ref: r.ref,
    // bytea → Buffer (exactly what the pg driver returns).
    ciphertext: r.ciphertext,
    iv: r.iv,
    auth_tag: r.auth_tag,
    wrapped_dek: r.wrapped_dek,
    dek_iv: r.dek_iv,
    dek_auth_tag: r.dek_auth_tag,
    kek_id: r.kek_id,
    version: r.version,
    // timestamptz → Date (exercise the backend's Date→ISO normalization).
    created_at: new Date(r.created_at),
    last_used_at: r.last_used_at === null ? null : new Date(r.last_used_at),
  };
}

function createFakeDb(): {
  query: SecretQueryRunner['query'];
  rows: Map<string, FakeSecretRow>;
} {
  const rows = new Map<string, FakeSecretRow>();

  const findByOwnerName = (ownerId: string, name: string): FakeSecretRow | undefined => {
    for (const r of rows.values()) {
      if (r.owner_id === ownerId && r.name === name) return r;
    }
    return undefined;
  };

  const query: SecretQueryRunner['query'] = async (sql, params) => {
    const text = sql.trim();

    if (text.startsWith('INSERT INTO secret_store')) {
      const [
        id,
        ownerId,
        name,
        ref,
        ciphertext,
        iv,
        authTag,
        wrappedDek,
        dekIv,
        dekAuthTag,
        kekId,
        version,
        createdAt,
        lastUsedAt,
      ] = params as [
        string,
        string,
        string,
        string,
        Buffer,
        Buffer,
        Buffer,
        Buffer,
        Buffer,
        Buffer,
        string,
        number,
        string,
        string | null,
      ];

      const conflict = findByOwnerName(ownerId, name);
      if (conflict) {
        // ON CONFLICT (owner_id, name) DO UPDATE: the conflicting row keeps its
        // primary key; every crypto column + ref/kek_id/version/created_at/
        // last_used_at is overwritten with the EXCLUDED (new) values.
        conflict.ref = ref;
        conflict.ciphertext = ciphertext;
        conflict.iv = iv;
        conflict.auth_tag = authTag;
        conflict.wrapped_dek = wrappedDek;
        conflict.dek_iv = dekIv;
        conflict.dek_auth_tag = dekAuthTag;
        conflict.kek_id = kekId;
        conflict.version = version;
        conflict.created_at = createdAt;
        conflict.last_used_at = lastUsedAt;
      } else {
        rows.set(id, {
          id,
          owner_id: ownerId,
          name,
          ref,
          ciphertext,
          iv,
          auth_tag: authTag,
          wrapped_dek: wrappedDek,
          dek_iv: dekIv,
          dek_auth_tag: dekAuthTag,
          kek_id: kekId,
          version,
          created_at: createdAt,
          last_used_at: lastUsedAt,
        });
      }
      return { rows: [] };
    }

    if (text.startsWith('SELECT')) {
      // Three SELECT shapes: by (owner_id, ref), by (owner_id, name), by owner_id,
      // and by kek_id. Disambiguate on the WHERE clause text.
      if (text.includes('WHERE owner_id = $1 AND ref = $2')) {
        const [ownerId, ref] = params as [string, string];
        for (const r of rows.values()) {
          if (r.owner_id === ownerId && r.ref === ref) return { rows: [projectRow(r)] };
        }
        return { rows: [] };
      }
      if (text.includes('WHERE owner_id = $1 AND name = $2')) {
        const [ownerId, name] = params as [string, string];
        const r = findByOwnerName(ownerId, name);
        return { rows: r ? [projectRow(r)] : [] };
      }
      if (text.includes('WHERE owner_id = $1')) {
        const [ownerId] = params as [string];
        return {
          rows: [...rows.values()].filter((r) => r.owner_id === ownerId).map(projectRow),
        };
      }
      if (text.includes('WHERE kek_id = $1')) {
        const [kekId] = params as [string];
        return {
          rows: [...rows.values()].filter((r) => r.kek_id === kekId).map(projectRow),
        };
      }
      throw new Error(`Fake DB: unrecognized SELECT: ${text.slice(0, 80)}`);
    }

    if (text.startsWith('DELETE FROM secret_store')) {
      const [ownerId, ref] = params as [string, string];
      for (const [id, r] of rows) {
        if (r.owner_id === ownerId && r.ref === ref) {
          rows.delete(id);
          return { rows: [{ id }] }; // RETURNING id
        }
      }
      return { rows: [] };
    }

    if (text.startsWith('UPDATE secret_store')) {
      if (text.includes('SET last_used_at = $2')) {
        const [id, lastUsedAt] = params as [string, string];
        const r = rows.get(id);
        if (r) r.last_used_at = lastUsedAt;
        return { rows: [] };
      }
      if (text.includes('SET wrapped_dek = $2')) {
        const [id, wrappedDek, dekIv, dekAuthTag, kekId] = params as [
          string,
          Buffer,
          Buffer,
          Buffer,
          string,
        ];
        const r = rows.get(id);
        if (r) {
          r.wrapped_dek = wrappedDek;
          r.dek_iv = dekIv;
          r.dek_auth_tag = dekAuthTag;
          r.kek_id = kekId;
        }
        return { rows: [] };
      }
      throw new Error(`Fake DB: unrecognized UPDATE: ${text.slice(0, 80)}`);
    }

    throw new Error(`Fake DB received an unexpected statement: ${text.slice(0, 80)}`);
  };

  return { query, rows };
}

// ── A fully-sealed SecretRow fixture (random bytes stand in for ciphertext) ──

function makeRow(overrides: Partial<SecretRow> = {}): SecretRow {
  const name = overrides.name ?? 'stripe';
  return {
    id: overrides.id ?? `id-${Math.random().toString(16).slice(2)}`,
    ownerId: overrides.ownerId ?? 'alice',
    name,
    ref: overrides.ref ?? (`vault:${name}` as SecretRef),
    ciphertext: overrides.ciphertext ?? randomBytes(48),
    iv: overrides.iv ?? randomBytes(12),
    authTag: overrides.authTag ?? randomBytes(16),
    wrappedDek: overrides.wrappedDek ?? randomBytes(48),
    dekIv: overrides.dekIv ?? randomBytes(12),
    dekAuthTag: overrides.dekAuthTag ?? randomBytes(16),
    kekId: overrides.kekId ?? 'kek-1',
    version: overrides.version ?? 1,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    lastUsedAt: overrides.lastUsedAt ?? null,
  };
}

describe('createPostgresSecretBackend — backend contract', () => {
  it('insert + getByRef round-trips every Buffer byte-for-byte', async () => {
    const { query } = createFakeDb();
    const backend = createPostgresSecretBackend({ query });

    const row = makeRow();
    await backend.insert(row);

    const got = await backend.getByRef({ ownerId: row.ownerId, ref: row.ref });
    expect(got).not.toBeNull();
    // Scalar fields.
    expect(got!.id).toBe(row.id);
    expect(got!.ownerId).toBe(row.ownerId);
    expect(got!.name).toBe(row.name);
    expect(got!.ref).toBe(row.ref);
    expect(got!.kekId).toBe(row.kekId);
    expect(got!.version).toBe(1);
    expect(got!.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(got!.lastUsedAt).toBeNull();
    // Every bytea column preserved exactly.
    expect(got!.ciphertext.equals(row.ciphertext)).toBe(true);
    expect(got!.iv.equals(row.iv)).toBe(true);
    expect(got!.authTag.equals(row.authTag)).toBe(true);
    expect(got!.wrappedDek.equals(row.wrappedDek)).toBe(true);
    expect(got!.dekIv.equals(row.dekIv)).toBe(true);
    expect(got!.dekAuthTag.equals(row.dekAuthTag)).toBe(true);
  });

  it('getByRef returns null for a missing ref', async () => {
    const { query } = createFakeDb();
    const backend = createPostgresSecretBackend({ query });
    const got = await backend.getByRef({ ownerId: 'alice', ref: 'vault:nope' as SecretRef });
    expect(got).toBeNull();
  });

  it('getByName fetches the owner-scoped row', async () => {
    const { query } = createFakeDb();
    const backend = createPostgresSecretBackend({ query });

    await backend.insert(makeRow({ ownerId: 'alice', name: 'github' }));
    const got = await backend.getByName({ ownerId: 'alice', name: 'github' });
    expect(got).not.toBeNull();
    expect(got!.name).toBe('github');
    expect(got!.ref).toBe('vault:github');

    // Wrong owner → null.
    const miss = await backend.getByName({ ownerId: 'bob', name: 'github' });
    expect(miss).toBeNull();
  });

  it('insert UPSERTs on (owner_id, name): re-insert replaces + bumps version', async () => {
    const { query, rows } = createFakeDb();
    const backend = createPostgresSecretBackend({ query });

    const v1 = makeRow({ ownerId: 'alice', name: 'stripe', version: 1 });
    await backend.insert(v1);

    // Second put for the SAME owner+name — distinct id + new crypto + version 2.
    const v2 = makeRow({ ownerId: 'alice', name: 'stripe', version: 2 });
    expect(v2.id).not.toBe(v1.id);
    await backend.insert(v2);

    // Exactly one physical row remains for (alice, stripe).
    const aliceStripe = [...rows.values()].filter(
      (r) => r.owner_id === 'alice' && r.name === 'stripe'
    );
    expect(aliceStripe).toHaveLength(1);

    const got = await backend.getByName({ ownerId: 'alice', name: 'stripe' });
    expect(got!.version).toBe(2);
    // New crypto material replaced the old (ciphertext now matches v2, not v1).
    expect(got!.ciphertext.equals(v2.ciphertext)).toBe(true);
    expect(got!.ciphertext.equals(v1.ciphertext)).toBe(false);
  });

  it('listByOwner is owner-scoped', async () => {
    const { query } = createFakeDb();
    const backend = createPostgresSecretBackend({ query });

    await backend.insert(makeRow({ ownerId: 'alice', name: 'stripe' }));
    await backend.insert(makeRow({ ownerId: 'alice', name: 'github' }));
    await backend.insert(makeRow({ ownerId: 'bob', name: 'stripe' }));

    const aliceRows = await backend.listByOwner('alice');
    expect(aliceRows.map((r) => r.name).sort()).toEqual(['github', 'stripe']);
    expect(aliceRows.every((r) => r.ownerId === 'alice')).toBe(true);

    const bobRows = await backend.listByOwner('bob');
    expect(bobRows).toHaveLength(1);
  });

  it('listByKekId spans owners (for rotation)', async () => {
    const { query } = createFakeDb();
    const backend = createPostgresSecretBackend({ query });

    await backend.insert(makeRow({ ownerId: 'alice', name: 'stripe', kekId: 'kek-1' }));
    await backend.insert(makeRow({ ownerId: 'bob', name: 'github', kekId: 'kek-1' }));
    await backend.insert(makeRow({ ownerId: 'carol', name: 'aws', kekId: 'kek-2' }));

    const underKek1 = await backend.listByKekId('kek-1');
    expect(underKek1).toHaveLength(2);
    expect(underKek1.map((r) => r.ownerId).sort()).toEqual(['alice', 'bob']);

    const underKek2 = await backend.listByKekId('kek-2');
    expect(underKek2).toHaveLength(1);
    expect(underKek2[0].ownerId).toBe('carol');
  });

  it('deleteByRef returns true when a row is removed, false otherwise', async () => {
    const { query } = createFakeDb();
    const backend = createPostgresSecretBackend({ query });

    await backend.insert(makeRow({ ownerId: 'alice', name: 'stripe' }));

    const hit = await backend.deleteByRef({ ownerId: 'alice', ref: 'vault:stripe' as SecretRef });
    expect(hit).toBe(true);

    // Gone now.
    const gone = await backend.getByRef({ ownerId: 'alice', ref: 'vault:stripe' as SecretRef });
    expect(gone).toBeNull();

    // Second delete (and wrong-owner delete) → false.
    const miss = await backend.deleteByRef({ ownerId: 'alice', ref: 'vault:stripe' as SecretRef });
    expect(miss).toBe(false);
  });

  it('touchLastUsed updates last_used_at by id', async () => {
    const { query } = createFakeDb();
    const backend = createPostgresSecretBackend({ query });

    const row = makeRow();
    await backend.insert(row);
    expect((await backend.getByRef({ ownerId: row.ownerId, ref: row.ref }))!.lastUsedAt).toBeNull();

    await backend.touchLastUsed({ id: row.id, lastUsedAt: '2026-02-02T12:00:00.000Z' });

    const got = await backend.getByRef({ ownerId: row.ownerId, ref: row.ref });
    expect(got!.lastUsedAt).toBe('2026-02-02T12:00:00.000Z');
  });

  it('updateWrappedDek re-wraps the DEK columns (value ciphertext untouched)', async () => {
    const { query } = createFakeDb();
    const backend = createPostgresSecretBackend({ query });

    const row = makeRow({ kekId: 'kek-1' });
    await backend.insert(row);

    const newWrapped = randomBytes(48);
    const newDekIv = randomBytes(12);
    const newDekTag = randomBytes(16);
    await backend.updateWrappedDek({
      id: row.id,
      wrappedDek: newWrapped,
      dekIv: newDekIv,
      dekAuthTag: newDekTag,
      kekId: 'kek-2',
    });

    const got = await backend.getByRef({ ownerId: row.ownerId, ref: row.ref });
    expect(got!.kekId).toBe('kek-2');
    expect(got!.wrappedDek.equals(newWrapped)).toBe(true);
    expect(got!.dekIv.equals(newDekIv)).toBe(true);
    expect(got!.dekAuthTag.equals(newDekTag)).toBe(true);
    // The value ciphertext (and its IV/tag) are NOT touched by a DEK re-wrap.
    expect(got!.ciphertext.equals(row.ciphertext)).toBe(true);
    expect(got!.iv.equals(row.iv)).toBe(true);
    expect(got!.authTag.equals(row.authTag)).toBe(true);
  });
});

// ── INTEGRATION: full SecretStore over the Postgres backend ──────────────────

/** Trivial test KEK provider returning a fixed 32-byte Buffer for any id. */
function fixedKekProvider(): KekProvider {
  const kek = randomBytes(32);
  return {
    async getKek(): Promise<Buffer> {
      return kek;
    },
    currentKekId(): string {
      return 'kek-1';
    },
  };
}

describe('createSecretStore over Postgres backend — INTEGRATION', () => {
  it('put → get round-trips the plaintext value through the Postgres backend', async () => {
    const { query } = createFakeDb();
    const store = createSecretStore({
      backend: createPostgresSecretBackend({ query }),
      kekProvider: fixedKekProvider(),
    });

    const value = 'sk-live-INTEGRATION-9f8e7d6c';
    const { ref, version } = await store.put({ ownerId: 'alice', name: 'stripe', value });
    expect(ref).toBe('vault:stripe');
    expect(version).toBe(1);

    const got = await store.get({ ownerId: 'alice', ref });
    expect(got.value).toBe(value);
  });

  it('re-put through the backend bumps the version and supersedes the value', async () => {
    const { query } = createFakeDb();
    const store = createSecretStore({
      backend: createPostgresSecretBackend({ query }),
      kekProvider: fixedKekProvider(),
    });

    const first = await store.put({ ownerId: 'alice', name: 'stripe', value: 'v1' });
    expect(first.version).toBe(1);
    const second = await store.put({ ownerId: 'alice', name: 'stripe', value: 'v2' });
    expect(second.version).toBe(2);

    const got = await store.get({ ownerId: 'alice', ref: 'vault:stripe' as SecretRef });
    expect(got.value).toBe('v2');
  });

  it('OWNER ISOLATION holds THROUGH the Postgres backend: B cannot read A’s secret', async () => {
    const { query } = createFakeDb();
    const kekProvider = fixedKekProvider();

    // User A stores a secret.
    const storeA = createSecretStore({
      backend: createPostgresSecretBackend({ query }),
      kekProvider,
    });
    await storeA.put({ ownerId: 'alice', name: 'stripe', value: 'alice-only-value' });

    // User B, sharing the SAME database, asks for A's ref. The owner-scoped
    // backend query returns nothing for B → SecretNotFoundError, never a value.
    const storeB = createSecretStore({
      backend: createPostgresSecretBackend({ query }),
      kekProvider,
    });
    await expect(
      storeB.get({ ownerId: 'bob', ref: 'vault:stripe' as SecretRef })
    ).rejects.toThrow();

    // Belt-and-suspenders: even with a leaky backend that hands B the row
    // anyway, the store's in-function owner check throws OwnerMismatchError and
    // surfaces no plaintext — isolation lives in the store, not just the SQL.
    const realBackend = createPostgresSecretBackend({ query });
    const aliceRow = await realBackend.getByRef({
      ownerId: 'alice',
      ref: 'vault:stripe' as SecretRef,
    });
    expect(aliceRow).not.toBeNull();
    const leakyBackend = { ...realBackend, async getByRef() { return aliceRow; } };
    const storeBLeaky = createSecretStore({ backend: leakyBackend, kekProvider });

    await expect(
      storeBLeaky.get({ ownerId: 'bob', ref: 'vault:stripe' as SecretRef })
    ).rejects.toBeInstanceOf(OwnerMismatchError);

    let leaked: string | undefined;
    try {
      leaked = (await storeBLeaky.get({ ownerId: 'bob', ref: 'vault:stripe' as SecretRef })).value;
    } catch {
      leaked = undefined;
    }
    expect(leaked).toBeUndefined();
  });
});
