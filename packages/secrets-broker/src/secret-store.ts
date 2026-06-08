/**
 * Encrypted per-owner SecretStore — the value-holding half of the secrets broker.
 *
 * The lease adapter (`lease-adapter.ts`) only answers "may this agent read this
 * ref?" — it never stores or decrypts the secret VALUE. This module is that
 * missing half: it holds the encrypted value behind a `vault:<key>` SecretRef
 * (`types.ts`), keyed per OWNER, and only decrypts for the authenticated owner.
 *
 * ── Crypto: envelope encryption (matches the house style in
 *    `packages/mcp-server/src/holomesh/identity/custodial-wallet.ts`) ──────────
 *
 *   value  ──AES-256-GCM(DEK, iv12)──▶  { ciphertext, iv, authTag }
 *   DEK    ──AES-256-GCM(KEK, dekIv12)─▶ { wrappedDek, dekIv, dekAuthTag }
 *
 *   - One fresh 32-byte DEK per secret (`crypto.randomBytes(32)`).
 *   - One master KEK, sourced by an INJECTED `kekProvider` — this module NEVER
 *     reads `process.env`; the provider owns env-now / KMS-later key sourcing.
 *   - Every row records the `kekId` of the KEK that wrapped its DEK, so
 *     `rotateKek` can find and re-wrap exactly the rows under an old KEK.
 *
 * ── Security invariant ──────────────────────────────────────────────────────
 *   `get()` enforces owner isolation INSIDE the function: it fetches the row by
 *   ref, and if `row.owner_id !== ownerId` it throws `OwnerMismatchError`
 *   WITHOUT decrypting. Isolation is never assumed to live in an upstream gate.
 *
 * GCM's authentication tag is the integrity guarantee: any tamper of the
 * ciphertext, or an attempt to unwrap a DEK with the wrong KEK, fails the tag
 * check and surfaces as `DecryptError` — the store never returns a wrong/garbled
 * value, it refuses.
 *
 * Errors carry ZERO secret material. Storage is behind an injected `backend`
 * interface so the crypto is testable without Postgres; an in-memory backend
 * and a Postgres DDL (`SECRET_STORE_DDL`) are exported.
 *
 * @module secrets-broker/secret-store
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';

import type { SecretRef } from './types';

// ── Crypto constants ────────────────────────────────────────────────────────

/** AES-256 key length in bytes (DEK and KEK are both 256-bit). */
const KEY_BYTES = 32;

/** AES-GCM IV length — 96 bits per NIST SP 800-38D (fresh per encryption). */
const IV_BYTES = 12;

/** AES-GCM authentication tag length — 128 bits. */
const AUTH_TAG_BYTES = 16;

/** Cipher used for both the value (under the DEK) and the DEK (under the KEK). */
const CIPHER = 'aes-256-gcm' as const;

// ── KEK provider (injected — the store never reads process.env) ──────────────

/**
 * Key-encryption-key provider. The store calls this to obtain the master KEK
 * used to wrap/unwrap per-secret DEKs. The provider owns key sourcing — env in
 * dev, a KMS in production — so this module stays free of `process.env`.
 *
 * `getKek(kekId?)` MUST return a 32-byte Buffer. When `kekId` is given the
 * provider returns THAT specific KEK (needed to unwrap historical rows and to
 * rotate); when omitted it returns the current KEK.
 */
export interface KekProvider {
  /** Resolve a 32-byte KEK. With `kekId`, resolve that exact KEK version. */
  getKek(kekId?: string): Promise<Buffer>;
  /** The id of the KEK that `getKek()` (no arg) currently returns. */
  currentKekId(): string;
  /**
   * Whether this provider sources the KEK from a production-grade store (KMS / HSM /
   * service-scoped secret) rather than a shared-surface env var. The env provider sets
   * `false`; the KMS provider sets `true`. Read by the SecretStore's
   * `requireProductionGradeKek` gate — `undefined` is treated as NOT production-grade.
   */
  readonly productionGrade?: boolean;
}

// ── Stored row (ciphertext only — never plaintext) ──────────────────────────

/**
 * A row as persisted by the backend. Holds ONLY ciphertext + crypto metadata;
 * the plaintext value is never stored or logged. Buffers map to Postgres
 * `bytea` columns (see {@link SECRET_STORE_DDL}).
 */
export interface SecretRow {
  /** Row id (uuid). */
  id: string;
  /** Authenticated owner identity that put this secret. */
  ownerId: string;
  /** Human-readable name, unique per owner. */
  name: string;
  /** Canonical ref — `vault:${name}`. */
  ref: SecretRef;
  /** AES-256-GCM ciphertext of the value (under the DEK). */
  ciphertext: Buffer;
  /** 12-byte IV used to encrypt the value. */
  iv: Buffer;
  /** 16-byte GCM auth tag over the value ciphertext. */
  authTag: Buffer;
  /** The DEK, itself AES-256-GCM-encrypted under the KEK. */
  wrappedDek: Buffer;
  /** 12-byte IV used to wrap the DEK. */
  dekIv: Buffer;
  /** 16-byte GCM auth tag over the wrapped DEK. */
  dekAuthTag: Buffer;
  /** Id of the KEK that wrapped `wrappedDek` (tracks rotation). */
  kekId: string;
  /** Monotonic version, bumped on overwrite of an existing name. */
  version: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp of the last successful owner-authorized get, or null. */
  lastUsedAt: string | null;
}

/**
 * Storage backend. Crypto lives in the store; persistence lives here, so the
 * envelope encryption is testable without Postgres. All lookups are scoped by
 * `ownerId` at the call site; the backend must additionally treat
 * `(ownerId, name)` as unique.
 */
export interface SecretStoreBackend {
  /** Insert a fully-encrypted row. */
  insert(row: SecretRow): Promise<void>;
  /** Fetch a single row by `(ownerId, ref)`, or null. */
  getByRef(params: { ownerId: string; ref: SecretRef }): Promise<SecretRow | null>;
  /** Fetch a single row by `(ownerId, name)`, or null (used to bump version). */
  getByName(params: { ownerId: string; name: string }): Promise<SecretRow | null>;
  /** All rows for an owner — WITHOUT decrypting. Used by metadata `list()`. */
  listByOwner(ownerId: string): Promise<SecretRow[]>;
  /** All rows wrapped under `kekId`, across owners — used only by rotation. */
  listByKekId(kekId: string): Promise<SecretRow[]>;
  /** Delete a single row by `(ownerId, ref)`. Returns whether a row was removed. */
  deleteByRef(params: { ownerId: string; ref: SecretRef }): Promise<boolean>;
  /** Update last-used timestamp after a successful owner-authorized get. */
  touchLastUsed(params: { id: string; lastUsedAt: string }): Promise<void>;
  /** Re-wrap a row's DEK under a new KEK (rotation). Ciphertext is untouched. */
  updateWrappedDek(params: {
    id: string;
    wrappedDek: Buffer;
    dekIv: Buffer;
    dekAuthTag: Buffer;
    kekId: string;
  }): Promise<void>;
}

// ── Errors (NEVER include secret material in messages) ───────────────────────

/**
 * Thrown by `get()`/`delete()` when the authenticated caller does not own the
 * row. Carries only the ref (an audit-safe label) — never the value.
 */
export class OwnerMismatchError extends Error {
  readonly ref: SecretRef;
  constructor(ref: SecretRef) {
    super(`secret-store: caller is not the owner of ${ref}`);
    this.name = 'OwnerMismatchError';
    this.ref = ref;
  }
}

/** Thrown when no secret exists for the given owner+ref. */
export class SecretNotFoundError extends Error {
  readonly ref: SecretRef;
  constructor(ref: SecretRef) {
    super(`secret-store: no secret found for ${ref}`);
    this.name = 'SecretNotFoundError';
    this.ref = ref;
  }
}

/**
 * Thrown when decryption fails: a tampered value ciphertext (GCM tag mismatch),
 * or a DEK that cannot be unwrapped because the wrong KEK was supplied. Carries
 * only the ref — never plaintext, key bytes, or the underlying crypto error
 * detail (which can leak oracle signal).
 */
export class DecryptError extends Error {
  readonly ref: SecretRef;
  constructor(ref: SecretRef) {
    super(`secret-store: failed to decrypt ${ref}`);
    this.name = 'DecryptError';
    this.ref = ref;
  }
}

/**
 * Thrown at construction when `requireProductionGradeKek` is set but the KEK provider is
 * not production-grade (e.g. the env provider). The Phase-3 gate: no real user secret may
 * be backed by a shared-surface env KEK in production.
 */
export class InsecureKekError extends Error {
  constructor() {
    super(
      'secret-store: requireProductionGradeKek is set but the KEK provider is not ' +
        'production-grade — use createKmsKekProvider (KMS / HSM / service-scoped secret), ' +
        'not the env provider, before storing real user secrets'
    );
    this.name = 'InsecureKekError';
  }
}

// ── Public API surface ───────────────────────────────────────────────────────

export interface PutInput {
  /** Authenticated owner identity. */
  ownerId: string;
  /** Human-readable secret name (unique per owner). `ref` is `vault:${name}`. */
  name: string;
  /** The plaintext secret value to encrypt at rest. */
  value: string;
}

export interface PutResult {
  ref: SecretRef;
  version: number;
}

export interface GetInput {
  /** Authenticated caller identity — REQUIRED; owner isolation enforced here. */
  ownerId: string;
  /** Canonical ref of the secret to read. */
  ref: SecretRef;
}

export interface GetResult {
  value: string;
}

/** Metadata-only view of a secret — NEVER includes the value or ciphertext. */
export interface SecretMetadata {
  name: string;
  ref: SecretRef;
  version: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RotateKekInput {
  /** KEK id whose rows should be re-wrapped. */
  fromKekId: string;
  /** KEK id to re-wrap them under. */
  toKekId: string;
}

export interface RotateKekResult {
  /** Number of rows re-wrapped from `fromKekId` to `toKekId`. */
  rotated: number;
}

/** The store's dependencies — both injected, nothing read from the ambient env. */
export interface SecretStoreDeps {
  backend: SecretStoreBackend;
  kekProvider: KekProvider;
  /**
   * Phase-3 safety gate: when true, the store REFUSES to construct unless
   * `kekProvider.productionGrade` is true — so a dev/env KEK can never back real user
   * secrets in production. The app sets this from NODE_ENV (or an explicit flag).
   */
  requireProductionGradeKek?: boolean;
  /** Optional fixed clock for deterministic tests. */
  now?: () => Date;
}

export interface SecretStore {
  /** Encrypt + store a value. Bumps version if `name` already exists for owner. */
  put(input: PutInput): Promise<PutResult>;
  /** Owner-isolated decrypt. Throws `OwnerMismatchError` for a non-owner. */
  get(input: GetInput): Promise<GetResult>;
  /** Metadata for all of the owner's secrets — never values. */
  list(input: { ownerId: string }): Promise<SecretMetadata[]>;
  /** Owner-scoped delete. */
  delete(input: { ownerId: string; ref: SecretRef }): Promise<{ deleted: boolean }>;
  /** Re-wrap every DEK under `fromKekId` with `toKekId`. Values unchanged. */
  rotateKek(input: RotateKekInput): Promise<RotateKekResult>;
}

/** Build the canonical ref for a secret name. */
function refForName(name: string): SecretRef {
  return `vault:${name}`;
}

/**
 * Encrypt `plaintext` under a fresh DEK, then wrap that DEK under `kek`.
 * Returns all ciphertext components plus the wrapped-DEK components.
 */
function sealValue(
  plaintext: string,
  kek: Buffer
): {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  wrappedDek: Buffer;
  dekIv: Buffer;
  dekAuthTag: Buffer;
} {
  // Fresh per-secret DEK.
  const dek = randomBytes(KEY_BYTES);

  // Encrypt the value with the DEK.
  const iv = randomBytes(IV_BYTES);
  const valueCipher = createCipheriv(CIPHER, dek, iv, { authTagLength: AUTH_TAG_BYTES });
  const ciphertext = Buffer.concat([
    valueCipher.update(plaintext, 'utf8'),
    valueCipher.final(),
  ]);
  const authTag = valueCipher.getAuthTag();

  // Wrap the DEK with the KEK.
  const { wrappedDek, dekIv, dekAuthTag } = wrapDek(dek, kek);

  return { ciphertext, iv, authTag, wrappedDek, dekIv, dekAuthTag };
}

/** Wrap (encrypt) a DEK with a KEK using AES-256-GCM and a fresh IV. */
function wrapDek(
  dek: Buffer,
  kek: Buffer
): { wrappedDek: Buffer; dekIv: Buffer; dekAuthTag: Buffer } {
  const dekIv = randomBytes(IV_BYTES);
  const dekCipher = createCipheriv(CIPHER, kek, dekIv, { authTagLength: AUTH_TAG_BYTES });
  const wrappedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekAuthTag = dekCipher.getAuthTag();
  return { wrappedDek, dekIv, dekAuthTag };
}

/**
 * Unwrap a DEK with a KEK. A wrong KEK (or a tampered wrapped DEK) fails the GCM
 * tag and throws — the caller maps that to `DecryptError`.
 */
function unwrapDek(row: SecretRow, kek: Buffer): Buffer {
  const decipher = createDecipheriv(CIPHER, kek, row.dekIv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(row.dekAuthTag);
  return Buffer.concat([decipher.update(row.wrappedDek), decipher.final()]);
}

/**
 * Decrypt a row's value given its already-unwrapped DEK. A tampered ciphertext
 * fails the GCM tag and throws — the caller maps that to `DecryptError`.
 */
function openValue(row: SecretRow, dek: Buffer): string {
  const decipher = createDecipheriv(CIPHER, dek, row.iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(row.authTag);
  const plaintext = Buffer.concat([decipher.update(row.ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Create an encrypted per-owner SecretStore over an injected backend + KEK
 * provider. The store performs envelope encryption; the backend persists
 * ciphertext; the provider sources KEKs. Nothing is read from `process.env`.
 */
export function createSecretStore(deps: SecretStoreDeps): SecretStore {
  const { backend, kekProvider } = deps;
  // Phase-3 gate: refuse to back real secrets with a non-production KEK in production.
  if (deps.requireProductionGradeKek && !kekProvider.productionGrade) {
    throw new InsecureKekError();
  }
  const now = deps.now ?? (() => new Date());

  return {
    async put(input: PutInput): Promise<PutResult> {
      const { ownerId, name, value } = input;
      if (!ownerId) throw new TypeError('secret-store.put: ownerId required');
      if (!name) throw new TypeError('secret-store.put: name required');

      const ref = refForName(name);
      const kekId = kekProvider.currentKekId();
      const kek = await kekProvider.getKek();

      const sealed = sealValue(value, kek);

      // Bump version if this owner already has a secret under `name`.
      const existing = await backend.getByName({ ownerId, name });
      const version = existing ? existing.version + 1 : 1;

      const row: SecretRow = {
        id: randomUUID(),
        ownerId,
        name,
        ref,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        wrappedDek: sealed.wrappedDek,
        dekIv: sealed.dekIv,
        dekAuthTag: sealed.dekAuthTag,
        kekId,
        version,
        createdAt: now().toISOString(),
        lastUsedAt: null,
      };

      await backend.insert(row);
      return { ref, version };
    },

    /**
     * ── SECURITY INVARIANT (owner isolation enforced HERE, inside get) ──
     * `ownerId` is the AUTHENTICATED CALLER. We fetch by ref; if the stored
     * row's owner differs we throw `OwnerMismatchError` and DO NOT decrypt.
     * Only on an owner match do we unwrap the DEK and open the value.
     */
    async get(input: GetInput): Promise<GetResult> {
      const { ownerId, ref } = input;
      if (!ownerId) throw new TypeError('secret-store.get: ownerId required');

      const row = await backend.getByRef({ ownerId, ref });
      if (!row) throw new SecretNotFoundError(ref);

      // Owner isolation: never decrypt another owner's secret.
      if (row.ownerId !== ownerId) {
        throw new OwnerMismatchError(ref);
      }

      // Unwrap the DEK with the KEK that wrapped THIS row, then open the value.
      // Any GCM failure (wrong KEK, tampered ciphertext) → DecryptError.
      let value: string;
      try {
        const kek = await kekProvider.getKek(row.kekId);
        const dek = unwrapDek(row, kek);
        value = openValue(row, dek);
      } catch {
        throw new DecryptError(ref);
      }

      await backend.touchLastUsed({ id: row.id, lastUsedAt: now().toISOString() });
      return { value };
    },

    async list(input: { ownerId: string }): Promise<SecretMetadata[]> {
      const { ownerId } = input;
      if (!ownerId) throw new TypeError('secret-store.list: ownerId required');

      const rows = await backend.listByOwner(ownerId);
      // Metadata ONLY — never the value or any ciphertext component.
      return rows.map((row) => ({
        name: row.name,
        ref: row.ref,
        version: row.version,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
      }));
    },

    async delete(input: { ownerId: string; ref: SecretRef }): Promise<{ deleted: boolean }> {
      const { ownerId, ref } = input;
      if (!ownerId) throw new TypeError('secret-store.delete: ownerId required');

      const deleted = await backend.deleteByRef({ ownerId, ref });
      return { deleted };
    },

    async rotateKek(input: RotateKekInput): Promise<RotateKekResult> {
      const { fromKekId, toKekId } = input;
      if (fromKekId === toKekId) {
        throw new TypeError('secret-store.rotateKek: fromKekId and toKekId must differ');
      }

      const oldKek = await kekProvider.getKek(fromKekId);
      const newKek = await kekProvider.getKek(toKekId);

      const rows = await backend.listByKekId(fromKekId);
      let rotated = 0;
      for (const row of rows) {
        // Unwrap the DEK under the OLD KEK; the value ciphertext is untouched.
        let dek: Buffer;
        try {
          dek = unwrapDek(row, oldKek);
        } catch {
          throw new DecryptError(row.ref);
        }
        // Re-wrap the same DEK under the NEW KEK and persist the new wrapping.
        const rewrapped = wrapDek(dek, newKek);
        await backend.updateWrappedDek({
          id: row.id,
          wrappedDek: rewrapped.wrappedDek,
          dekIv: rewrapped.dekIv,
          dekAuthTag: rewrapped.dekAuthTag,
          kekId: toKekId,
        });
        rotated += 1;
      }
      return { rotated };
    },
  };
}

// ── In-memory backend (exported, for tests / local dev) ──────────────────────

/**
 * In-memory {@link SecretStoreBackend} for tests and local development. Holds
 * encrypted rows only — it never sees plaintext (the store seals before insert).
 * NOT for production: rows evaporate on process exit and enforce uniqueness in
 * a single process only.
 */
export function createInMemorySecretBackend(): SecretStoreBackend {
  // Keyed by row id; secondary lookups scan (fine for tests / small dev sets).
  const rows = new Map<string, SecretRow>();

  const findByRef = (ownerId: string, ref: SecretRef): SecretRow | undefined => {
    for (const row of rows.values()) {
      if (row.ownerId === ownerId && row.ref === ref) return row;
    }
    return undefined;
  };

  return {
    async insert(row: SecretRow): Promise<void> {
      // Enforce UNIQUE(owner_id, name): replace any prior row for this pair so
      // a re-put (version bump) supersedes rather than duplicates.
      for (const [id, existing] of rows) {
        if (existing.ownerId === row.ownerId && existing.name === row.name) {
          rows.delete(id);
        }
      }
      rows.set(row.id, row);
    },

    async getByRef({ ownerId, ref }): Promise<SecretRow | null> {
      return findByRef(ownerId, ref) ?? null;
    },

    async getByName({ ownerId, name }): Promise<SecretRow | null> {
      for (const row of rows.values()) {
        if (row.ownerId === ownerId && row.name === name) return row;
      }
      return null;
    },

    async listByOwner(ownerId: string): Promise<SecretRow[]> {
      return [...rows.values()].filter((row) => row.ownerId === ownerId);
    },

    async listByKekId(kekId: string): Promise<SecretRow[]> {
      return [...rows.values()].filter((row) => row.kekId === kekId);
    },

    async deleteByRef({ ownerId, ref }): Promise<boolean> {
      for (const [id, row] of rows) {
        if (row.ownerId === ownerId && row.ref === ref) {
          rows.delete(id);
          return true;
        }
      }
      return false;
    },

    async touchLastUsed({ id, lastUsedAt }): Promise<void> {
      const row = rows.get(id);
      if (row) row.lastUsedAt = lastUsedAt;
    },

    async updateWrappedDek({ id, wrappedDek, dekIv, dekAuthTag, kekId }): Promise<void> {
      const row = rows.get(id);
      if (!row) return;
      row.wrappedDek = wrappedDek;
      row.dekIv = dekIv;
      row.dekAuthTag = dekAuthTag;
      row.kekId = kekId;
    },
  };
}

// ── Postgres DDL (documented; this module does not execute SQL) ──────────────

/**
 * Postgres schema for a production {@link SecretStoreBackend}. Ciphertext and
 * crypto metadata are `bytea`; plaintext is NEVER a column. `UNIQUE(owner_id,
 * name)` enforces one current secret per name per owner (re-put bumps version),
 * and `owner_id` is indexed for owner-scoped lookups and `list()`.
 *
 * Map this module's camelCase fields to the snake_case columns in the adapter.
 */
export const SECRET_STORE_DDL = `
CREATE TABLE IF NOT EXISTS secret_store (
  id            uuid PRIMARY KEY,
  owner_id      text NOT NULL,
  name          text NOT NULL,
  ref           text NOT NULL,
  ciphertext    bytea NOT NULL,
  iv            bytea NOT NULL,
  auth_tag      bytea NOT NULL,
  wrapped_dek   bytea NOT NULL,
  dek_iv        bytea NOT NULL,
  dek_auth_tag  bytea NOT NULL,
  kek_id        text NOT NULL,
  version       int NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  UNIQUE (owner_id, name)
);

CREATE INDEX IF NOT EXISTS secret_store_owner_id_idx ON secret_store (owner_id);
CREATE INDEX IF NOT EXISTS secret_store_kek_id_idx ON secret_store (kek_id);
` as const;
