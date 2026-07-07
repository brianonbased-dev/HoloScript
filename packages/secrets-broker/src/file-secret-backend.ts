/**
 * File-backed SecretStore backend for owned-metal local custody.
 *
 * This backend persists only sealed SecretRow values. Plaintext never enters this
 * module; encryption and owner isolation stay in secret-store.ts.
 */

import { open, readFile, rename, stat, unlink, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

import type { SecretRef } from './types';
import type { SecretRow, SecretStoreBackend } from './secret-store';

export const FILE_SECRET_STORE_SCHEMA = 'holoscript.secret-store.file.v1';
export const HOLOKEY_STORE_PATH_ENV = 'HOLOKEY_STORE_PATH';
export const SECRETS_VAULT_STORE_PATH_ENV = 'SECRETS_VAULT_STORE_PATH';

const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_LOCK_MS = 30_000;

interface SerializedSecretRow {
  id: string;
  ownerId: string;
  name: string;
  ref: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  wrappedDek: string;
  dekIv: string;
  dekAuthTag: string;
  kekId: string;
  version: number;
  createdAt: string;
  lastUsedAt: string | null;
}

interface SerializedSecretStore {
  schema: typeof FILE_SECRET_STORE_SCHEMA;
  updatedAt: string;
  rows: SerializedSecretRow[];
}

export interface FileSecretBackendDeps {
  /** JSON file path for encrypted SecretRow persistence. */
  filePath: string;
  /** Retry budget for the cross-process lock file. */
  lockTimeoutMs?: number;
  /** Stale lock age before the backend removes a leftover lock file. */
  staleLockMs?: number;
  /** Injectable clock for tests. */
  now?: () => Date;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function expandFilePath(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) throw new TypeError('file-secret-backend: filePath required');
  if (trimmed === '~') return homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return join(homedir(), trimmed.slice(2));
  }
  return resolve(trimmed);
}

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new TypeError(`file-secret-backend: ${label} is not an object`);
}

function asString(value: unknown, label: string): string {
  if (typeof value === 'string') return value;
  throw new TypeError(`file-secret-backend: ${label} is not a string`);
}

function asNumber(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new TypeError(`file-secret-backend: ${label} is not a finite number`);
}

function asNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw new TypeError(`file-secret-backend: ${label} is not string|null`);
}

function encodeBuffer(value: Buffer): string {
  return value.toString('base64');
}

function decodeBuffer(value: unknown, label: string): Buffer {
  return Buffer.from(asString(value, label), 'base64');
}

function serializeRow(row: SecretRow): SerializedSecretRow {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    ref: row.ref,
    ciphertext: encodeBuffer(row.ciphertext),
    iv: encodeBuffer(row.iv),
    authTag: encodeBuffer(row.authTag),
    wrappedDek: encodeBuffer(row.wrappedDek),
    dekIv: encodeBuffer(row.dekIv),
    dekAuthTag: encodeBuffer(row.dekAuthTag),
    kekId: row.kekId,
    version: row.version,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

function deserializeRow(value: unknown): SecretRow {
  const row = asRecord(value, 'row');
  return {
    id: asString(row.id, 'row.id'),
    ownerId: asString(row.ownerId, 'row.ownerId'),
    name: asString(row.name, 'row.name'),
    ref: asString(row.ref, 'row.ref') as SecretRef,
    ciphertext: decodeBuffer(row.ciphertext, 'row.ciphertext'),
    iv: decodeBuffer(row.iv, 'row.iv'),
    authTag: decodeBuffer(row.authTag, 'row.authTag'),
    wrappedDek: decodeBuffer(row.wrappedDek, 'row.wrappedDek'),
    dekIv: decodeBuffer(row.dekIv, 'row.dekIv'),
    dekAuthTag: decodeBuffer(row.dekAuthTag, 'row.dekAuthTag'),
    kekId: asString(row.kekId, 'row.kekId'),
    version: asNumber(row.version, 'row.version'),
    createdAt: asString(row.createdAt, 'row.createdAt'),
    lastUsedAt: asNullableString(row.lastUsedAt, 'row.lastUsedAt'),
  };
}

function cloneRow(row: SecretRow): SecretRow {
  return {
    ...row,
    ciphertext: Buffer.from(row.ciphertext),
    iv: Buffer.from(row.iv),
    authTag: Buffer.from(row.authTag),
    wrappedDek: Buffer.from(row.wrappedDek),
    dekIv: Buffer.from(row.dekIv),
    dekAuthTag: Buffer.from(row.dekAuthTag),
  };
}

function serializeStore(rows: SecretRow[], updatedAt: string): string {
  const store: SerializedSecretStore = {
    schema: FILE_SECRET_STORE_SCHEMA,
    updatedAt,
    rows: rows.map(serializeRow),
  };
  return `${JSON.stringify(store, null, 2)}\n`;
}

function parseStore(raw: string): SecretRow[] {
  const parsed = asRecord(JSON.parse(raw) as unknown, 'store');
  if (parsed.schema !== FILE_SECRET_STORE_SCHEMA) {
    throw new TypeError('file-secret-backend: unsupported store schema');
  }
  if (!Array.isArray(parsed.rows)) {
    throw new TypeError('file-secret-backend: rows is not an array');
  }
  return parsed.rows.map(deserializeRow);
}

function lockPathFor(filePath: string): string {
  return `${filePath}.lock`;
}

async function readRows(filePath: string): Promise<SecretRow[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return parseStore(raw);
  } catch (error) {
    if (codeOf(error) === 'ENOENT') return [];
    throw error;
  }
}

async function writeRows(filePath: string, rows: SecretRow[], updatedAt: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, serializeStore(rows, updatedAt), { encoding: 'utf8', mode: 0o600 });
  await rename(tmpPath, filePath);
}

async function acquireLock(args: {
  lockPath: string;
  timeoutMs: number;
  staleLockMs: number;
  now: () => Date;
}): Promise<import('node:fs/promises').FileHandle> {
  await mkdir(dirname(args.lockPath), { recursive: true, mode: 0o700 });
  const started = Date.now();
  for (;;) {
    try {
      const handle = await open(args.lockPath, 'wx', 0o600);
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: args.now().toISOString() })
      );
      return handle;
    } catch (error) {
      if (codeOf(error) !== 'EEXIST') throw error;
      try {
        const info = await stat(args.lockPath);
        if (Date.now() - info.mtimeMs > args.staleLockMs) {
          await unlink(args.lockPath);
          continue;
        }
      } catch (statError) {
        if (codeOf(statError) !== 'ENOENT') throw statError;
      }
      if (Date.now() - started > args.timeoutMs) {
        throw new Error(`file-secret-backend: timed out waiting for ${args.lockPath}`);
      }
      await sleep(25);
    }
  }
}

/**
 * Create a durable local file backend for encrypted SecretStore rows.
 */
export function createFileSecretBackend(deps: FileSecretBackendDeps): SecretStoreBackend {
  const filePath = expandFilePath(deps.filePath);
  const lockPath = lockPathFor(filePath);
  const now = deps.now ?? (() => new Date());
  const lockTimeoutMs = deps.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleLockMs = deps.staleLockMs ?? DEFAULT_STALE_LOCK_MS;

  async function updateRows(mutator: (rows: SecretRow[]) => void | Promise<void>): Promise<void> {
    const lock = await acquireLock({ lockPath, timeoutMs: lockTimeoutMs, staleLockMs, now });
    try {
      const rows = await readRows(filePath);
      await mutator(rows);
      await writeRows(filePath, rows, now().toISOString());
    } finally {
      await lock.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
    }
  }

  return {
    async insert(row: SecretRow): Promise<void> {
      await updateRows((rows) => {
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const existing = rows[i];
          if (existing.ownerId === row.ownerId && existing.name === row.name) {
            rows.splice(i, 1);
          }
        }
        rows.push(cloneRow(row));
      });
    },

    async getByRef({ ownerId, ref }): Promise<SecretRow | null> {
      const rows = await readRows(filePath);
      return cloneRowOrNull(rows.find((row) => row.ownerId === ownerId && row.ref === ref));
    },

    async getByName({ ownerId, name }): Promise<SecretRow | null> {
      const rows = await readRows(filePath);
      return cloneRowOrNull(rows.find((row) => row.ownerId === ownerId && row.name === name));
    },

    async listByOwner(ownerId: string): Promise<SecretRow[]> {
      const rows = await readRows(filePath);
      return rows.filter((row) => row.ownerId === ownerId).map(cloneRow);
    },

    async listByKekId(kekId: string): Promise<SecretRow[]> {
      const rows = await readRows(filePath);
      return rows.filter((row) => row.kekId === kekId).map(cloneRow);
    },

    async deleteByRef({ ownerId, ref }): Promise<boolean> {
      let deleted = false;
      await updateRows((rows) => {
        const next = rows.filter((row) => {
          const keep = !(row.ownerId === ownerId && row.ref === ref);
          if (!keep) deleted = true;
          return keep;
        });
        rows.splice(0, rows.length, ...next);
      });
      return deleted;
    },

    async touchLastUsed({ id, lastUsedAt }): Promise<void> {
      await updateRows((rows) => {
        const row = rows.find((candidate) => candidate.id === id);
        if (row) row.lastUsedAt = lastUsedAt;
      });
    },

    async updateWrappedDek({ id, wrappedDek, dekIv, dekAuthTag, kekId }): Promise<void> {
      await updateRows((rows) => {
        const row = rows.find((candidate) => candidate.id === id);
        if (!row) return;
        row.wrappedDek = Buffer.from(wrappedDek);
        row.dekIv = Buffer.from(dekIv);
        row.dekAuthTag = Buffer.from(dekAuthTag);
        row.kekId = kekId;
      });
    },
  };
}

function cloneRowOrNull(row: SecretRow | undefined): SecretRow | null {
  return row ? cloneRow(row) : null;
}
