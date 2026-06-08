/**
 * Postgres-backed SecretStore backend — production persistence for HoloKey.
 *
 * This is the storage half of the encrypted per-owner SecretStore
 * (`secret-store.ts`). It holds ONLY ciphertext + crypto metadata; the
 * plaintext value is never a column, never a param, never logged. Envelope
 * encryption lives in the store; this module just persists the sealed
 * {@link SecretRow} and reads it back, byte-for-byte, into and out of the
 * `secret_store` table ({@link SECRET_STORE_DDL}).
 *
 * ── Decoupling (mirrors {@link createPostgresLeaseAdapter}) ──────────────────
 * The backend takes an INJECTED `query` runner rather than a hardcoded
 * `pg.Pool`, so it is testable with an in-memory fake and reusable across any
 * driver. The established in-repo pattern is `pg.Pool#query` — e.g.
 * `packages/mcp-server/src/auth/postgres-token-store.ts` does
 * `import type { Pool } from 'pg'` then `this.pool.query(sql, params)`. To wire
 * this backend against a real database, pass that pool's bound method:
 *
 * ```ts
 * import { Pool } from 'pg';
 * import { createPostgresSecretBackend } from './postgres-secret-backend';
 * import { SECRET_STORE_DDL, createSecretStore } from './secret-store';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * await pool.query(SECRET_STORE_DDL); // or run the migration
 * const backend = createPostgresSecretBackend({
 *   query: (sql, params) => pool.query(sql, params as unknown[]),
 * });
 * const store = createSecretStore({ backend, kekProvider });
 * ```
 *
 * The backend itself imports NO driver, only `SecretStoreBackend`/`SecretRow`
 * types — this package adds no runtime dependency.
 *
 * ── bytea ⇄ Buffer ──────────────────────────────────────────────────────────
 * The `pg` driver returns a Node `Buffer` for `bytea` columns and accepts a
 * `Buffer` param for them. So the seven ciphertext/crypto columns round-trip as
 * Buffers with no encoding step. Every read column is narrowed with a strict
 * helper (no `any`); a malformed/missing required column throws rather than
 * silently coercing — a corrupt secret row must fail loud, never return garbage.
 *
 * ── timestamptz ⇄ ISO string ────────────────────────────────────────────────
 * `SecretRow.createdAt` is an ISO string and `lastUsedAt` is `string | null`.
 * The `pg` driver hands back a JS `Date` for `timestamptz` (a fake may hand back
 * an ISO string), so reads normalize via `asIsoString` / `asNullableIsoString`.
 * Writes pass ISO strings as params; Postgres parses them into `timestamptz`.
 *
 * @module secrets-broker/postgres-secret-backend
 */

import type { SecretRef } from './types';
import type { SecretRow, SecretStoreBackend } from './secret-store';

/**
 * Minimal query-runner contract the backend depends on. Structurally compatible
 * with `pg.Pool#query` / `pg.PoolClient#query` (those return additional fields
 * such as `rowCount`, which this contract simply ignores). Identical in shape to
 * the lease adapter's `LeaseQueryRunner`.
 */
export interface SecretQueryRunner {
  query(sql: string, params: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Dependencies for {@link createPostgresSecretBackend}. */
export interface PostgresSecretBackendDeps {
  /** Injected query runner (e.g. a bound `pg.Pool#query`). */
  query: SecretQueryRunner['query'];
}

// ── Column narrowing (strict, no `any`) ──────────────────────────────────────

/**
 * Coerce a `bytea` column to a `Buffer`. The `pg` driver returns a `Buffer`; a
 * fake may hand back a `Uint8Array`. Throws on any non-binary value — a secret's
 * ciphertext/crypto bytes must never be silently dropped or coerced.
 */
function asBuffer(value: unknown, column: string): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError(`postgres-secret-backend: column "${column}" is not bytea/Buffer`);
}

/** Coerce a required `text`/`uuid` column to a string. Throws if not a string. */
function asString(value: unknown, column: string): string {
  if (typeof value === 'string') return value;
  throw new TypeError(`postgres-secret-backend: column "${column}" is not a string`);
}

/**
 * Coerce a required numeric column (`int`) to a number. The `pg` driver returns
 * a JS number for `int4`; a fake may return a numeric string. Throws on a
 * non-finite/unparseable value.
 */
function asNumber(value: unknown, column: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  throw new TypeError(`postgres-secret-backend: column "${column}" is not a finite number`);
}

/** Coerce a nullable `text` column to `string | null`. Throws on a non-string non-null. */
function asNullableString(value: unknown, column: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  throw new TypeError(`postgres-secret-backend: column "${column}" is not string|null`);
}

/**
 * Normalize a required `timestamptz` column to an ISO 8601 string. `pg` returns
 * a `Date`; a fake may return an ISO string or epoch number. Throws on an
 * invalid/missing date — `SecretRow.createdAt` is `string`, never optional.
 */
function asIsoString(value: unknown, column: string): string {
  const iso = toIso(value);
  if (iso === null) {
    throw new TypeError(`postgres-secret-backend: column "${column}" is not a valid timestamp`);
  }
  return iso;
}

/** Normalize a nullable `timestamptz` column to `string | null`. */
function asNullableIsoString(value: unknown, column: string): string | null {
  if (value === null || value === undefined) return null;
  const iso = toIso(value);
  if (iso === null) {
    throw new TypeError(
      `postgres-secret-backend: column "${column}" is not a valid timestamp|null`
    );
  }
  return iso;
}

/** Best-effort ISO-string conversion for a Date / ISO-string / epoch-number. */
function toIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * Narrow a raw `secret_store` row into a {@link SecretRow}. Every column is
 * checked; a missing/malformed required column throws (a corrupt row fails loud
 * rather than decrypting garbage). `ref` is the broker's `vault:<name>` label,
 * typed as {@link SecretRef}.
 */
function narrowSecretRow(row: Record<string, unknown>): SecretRow {
  return {
    id: asString(row.id, 'id'),
    ownerId: asString(row.owner_id, 'owner_id'),
    name: asString(row.name, 'name'),
    ref: asString(row.ref, 'ref') as SecretRef,
    ciphertext: asBuffer(row.ciphertext, 'ciphertext'),
    iv: asBuffer(row.iv, 'iv'),
    authTag: asBuffer(row.auth_tag, 'auth_tag'),
    wrappedDek: asBuffer(row.wrapped_dek, 'wrapped_dek'),
    dekIv: asBuffer(row.dek_iv, 'dek_iv'),
    dekAuthTag: asBuffer(row.dek_auth_tag, 'dek_auth_tag'),
    kekId: asString(row.kek_id, 'kek_id'),
    version: asNumber(row.version, 'version'),
    createdAt: asIsoString(row.created_at, 'created_at'),
    lastUsedAt: asNullableIsoString(row.last_used_at, 'last_used_at'),
  };
}

/** Columns selected by every read path, in stable order. */
const SELECT_COLUMNS =
  'id, owner_id, name, ref, ciphertext, iv, auth_tag, wrapped_dek, dek_iv, dek_auth_tag, kek_id, version, created_at, last_used_at';

/**
 * Create a production Postgres-backed {@link SecretStoreBackend}.
 *
 * Implements every method of the interface against the `secret_store` table:
 *   - `insert` UPSERTs on `UNIQUE(owner_id, name)` so a re-put supersedes the
 *     prior row and carries the bumped version — matching the in-memory backend.
 *   - `getByRef` / `getByName` are owner-scoped single-row reads.
 *   - `listByOwner` is owner-scoped; `listByKekId` spans owners (rotation only).
 *   - `deleteByRef` returns whether a row was removed (RETURNING).
 *   - `touchLastUsed` / `updateWrappedDek` are id-keyed updates.
 *
 * The backend performs no schema management — run {@link SECRET_STORE_DDL}
 * (or the migration) before first use.
 */
export function createPostgresSecretBackend(deps: PostgresSecretBackendDeps): SecretStoreBackend {
  const { query } = deps;

  return {
    /**
     * Insert a fully-sealed row. UPSERT on the UNIQUE(owner_id, name) constraint:
     * a re-put (new version) for the same owner+name OVERWRITES every crypto
     * column plus ref/kek_id/version/created_at, so the latest put supersedes
     * exactly as the in-memory backend's replace-on-conflict does. `last_used_at`
     * is reset to NULL on supersede (a freshly-sealed row has never been read).
     */
    async insert(row: SecretRow): Promise<void> {
      await query(
        `INSERT INTO secret_store (
           id, owner_id, name, ref,
           ciphertext, iv, auth_tag,
           wrapped_dek, dek_iv, dek_auth_tag,
           kek_id, version, created_at, last_used_at
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7,
           $8, $9, $10,
           $11, $12, $13, $14
         )
         ON CONFLICT (owner_id, name) DO UPDATE SET
           ref          = EXCLUDED.ref,
           ciphertext   = EXCLUDED.ciphertext,
           iv           = EXCLUDED.iv,
           auth_tag     = EXCLUDED.auth_tag,
           wrapped_dek  = EXCLUDED.wrapped_dek,
           dek_iv       = EXCLUDED.dek_iv,
           dek_auth_tag = EXCLUDED.dek_auth_tag,
           kek_id       = EXCLUDED.kek_id,
           version      = EXCLUDED.version,
           created_at   = EXCLUDED.created_at,
           last_used_at = EXCLUDED.last_used_at`,
        [
          row.id,
          row.ownerId,
          row.name,
          row.ref,
          row.ciphertext,
          row.iv,
          row.authTag,
          row.wrappedDek,
          row.dekIv,
          row.dekAuthTag,
          row.kekId,
          row.version,
          row.createdAt,
          row.lastUsedAt,
        ]
      );
    },

    async getByRef({ ownerId, ref }): Promise<SecretRow | null> {
      const { rows } = await query(
        `SELECT ${SELECT_COLUMNS} FROM secret_store WHERE owner_id = $1 AND ref = $2`,
        [ownerId, ref]
      );
      const first = rows[0];
      return first ? narrowSecretRow(first) : null;
    },

    async getByName({ ownerId, name }): Promise<SecretRow | null> {
      const { rows } = await query(
        `SELECT ${SELECT_COLUMNS} FROM secret_store WHERE owner_id = $1 AND name = $2`,
        [ownerId, name]
      );
      const first = rows[0];
      return first ? narrowSecretRow(first) : null;
    },

    async listByOwner(ownerId: string): Promise<SecretRow[]> {
      const { rows } = await query(
        `SELECT ${SELECT_COLUMNS} FROM secret_store WHERE owner_id = $1`,
        [ownerId]
      );
      return rows.map(narrowSecretRow);
    },

    async listByKekId(kekId: string): Promise<SecretRow[]> {
      // Spans owners deliberately — rotation re-wraps every row under a KEK.
      const { rows } = await query(`SELECT ${SELECT_COLUMNS} FROM secret_store WHERE kek_id = $1`, [
        kekId,
      ]);
      return rows.map(narrowSecretRow);
    },

    async deleteByRef({ ownerId, ref }): Promise<boolean> {
      const { rows } = await query(
        `DELETE FROM secret_store WHERE owner_id = $1 AND ref = $2 RETURNING id`,
        [ownerId, ref]
      );
      return rows.length > 0;
    },

    async touchLastUsed({ id, lastUsedAt }): Promise<void> {
      await query(`UPDATE secret_store SET last_used_at = $2 WHERE id = $1`, [id, lastUsedAt]);
    },

    async updateWrappedDek({ id, wrappedDek, dekIv, dekAuthTag, kekId }): Promise<void> {
      await query(
        `UPDATE secret_store
         SET wrapped_dek = $2, dek_iv = $3, dek_auth_tag = $4, kek_id = $5
         WHERE id = $1`,
        [id, wrappedDek, dekIv, dekAuthTag, kekId]
      );
    },
  };
}
