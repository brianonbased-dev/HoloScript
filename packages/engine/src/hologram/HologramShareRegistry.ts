/**
 * HologramShareRegistry — tracks share metadata and expiry for HoloGram bundles.
 *
 * Content-addressed bundles are immutable (they live in HologramStore), but
 * the SHARE layer sits on top: a share record tracks when a gram was shared,
 * who shared it, an optional expiry time, and a view counter. When a gram
 * expires, the /g/<hash> viewer page returns 410 Gone instead of rendering.
 *
 * Storage: JSON sidecar files alongside the bundle directory, at
 *   <storeRoot>/<shard>/<hash>/share.json
 * This keeps share metadata co-located with the bundle it describes and
 * avoids a separate database.
 *
 * SECURITY:
 *   - Hashes are validated via assertValidHash before any path construction.
 *   - Share records are never user-writable directly — they are created
 *     by the upload flow or the share API endpoint.
 *   - Expiry timestamps are server-side generated (not user-supplied) to
 *     prevent a malicious client from setting expiry=far-future.
 *
 * @see D.019: HoloGram product line + telegram push metaphor
 * @see Wave B Stream 5: share URL infrastructure + expiry policy
 */

import { promises as fs, constants as fsConstants } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import { assertValidHash, bundleRelDir, HologramStoreError } from './HologramStore';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HologramShareRecord {
  /** Content hash this share refers to (64 hex chars). */
  hash: string;
  /** ISO 8601 timestamp of when the share was created. */
  createdAt: string;
  /**
   * ISO 8601 timestamp of when the share expires. Null = never expires.
   * Set at creation time based on the configured default TTL.
   */
  expiresAt: string | null;
  /** Number of times the gram has been viewed via the share URL. */
  viewCount: number;
  /**
   * Who created this share. Empty string for anonymous/worker uploads.
   * For authenticated Studio sessions, the user identifier.
   */
  createdBy: string;
  /** Schema version for future migration. */
  schemaVersion: 1;
}

export interface HologramShareRegistryOptions {
  /** Same rootDir as the FileSystemHologramStore. */
  rootDir: string;
  /**
   * Default TTL for new shares in seconds. 0 = never expire.
   * Default: 0 (never expire — content-addressed grams are permanent
   * by default; explicit TTL is opt-in for ephemeral shares).
   */
  defaultTtlSeconds?: number;
  /**
   * Maximum allowed TTL in seconds. Prevents clients from requesting
   * absurdly long expiry times. Default: 365 days (31536000 seconds).
   */
  maxTtlSeconds?: number;
}

export interface CreateShareParams {
  hash: string;
  createdBy?: string;
  /** Override TTL for this specific share (seconds). 0 = never expire. */
  ttlSeconds?: number;
}

export interface ShareStatusResult {
  record: HologramShareRecord | null;
  expired: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_TTL_SECONDS = 0; // never expire by default
const MAX_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year max
const SHARE_FILE = 'share.json';

// ── Implementation ────────────────────────────────────────────────────────────

export class HologramShareRegistry {
  private readonly rootDir: string;
  private readonly defaultTtlSeconds: number;
  private readonly maxTtlSeconds: number;

  constructor(opts: HologramShareRegistryOptions) {
    if (typeof opts.rootDir !== 'string' || opts.rootDir.length === 0) {
      throw new HologramStoreError(
        'io_error',
        'HologramShareRegistry: rootDir must be a non-empty absolute path'
      );
    }
    this.rootDir = resolve(opts.rootDir);
    this.defaultTtlSeconds = opts.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS;
    this.maxTtlSeconds = opts.maxTtlSeconds ?? MAX_TTL_SECONDS;
  }

  /**
   * Create a share record for a bundle. If a share record already exists
   * for this hash, returns the existing record (idempotent).
   *
   * The TTL is resolved in priority order:
   *   1. Explicit ttlSeconds parameter (clamped to maxTtlSeconds)
   *   2. Registry defaultTtlSeconds
   *   3. 0 (never expire)
   */
  async createShare(params: CreateShareParams): Promise<HologramShareRecord> {
    assertValidHash(params.hash);
    const sharePath = this.resolveSharePath(params.hash);

    // Idempotent: return existing if present
    const existing = await this.readShareFile(sharePath);
    if (existing) return existing;

    const now = new Date();
    const ttl = this.resolveTtl(params.ttlSeconds);
    const expiresAt = ttl > 0 ? new Date(now.getTime() + ttl * 1000).toISOString() : null;

    const record: HologramShareRecord = {
      hash: params.hash,
      createdAt: now.toISOString(),
      expiresAt,
      viewCount: 0,
      createdBy: params.createdBy ?? '',
      schemaVersion: 1,
    };

    // Ensure parent dir exists (the bundle dir may already exist from
    // HologramStore.put, but the share file is written separately).
    await fs.mkdir(dirname(sharePath), { recursive: true, mode: 0o755 });
    await this.writeAtomic(sharePath, Buffer.from(JSON.stringify(record, null, 2) + '\n', 'utf8'));

    return record;
  }

  /**
   * Get the share status for a bundle. Returns null record + expired=false
   * if no share record exists (unshared bundles are always accessible).
   * Returns the record + expired=true if the share has expired.
   */
  async getShareStatus(hash: string): Promise<ShareStatusResult> {
    assertValidHash(hash);
    const sharePath = this.resolveSharePath(hash);
    const record = await this.readShareFile(sharePath);

    if (!record) {
      return { record: null, expired: false };
    }

    if (record.expiresAt) {
      const expiryTime = new Date(record.expiresAt).getTime();
      if (Date.now() > expiryTime) {
        return { record, expired: true };
      }
    }

    return { record, expired: false };
  }

  /**
   * Increment the view counter for a share. No-op if no share record exists.
   * This is a lightweight touch — we read-modify-write the share.json file.
   * Race-condition tolerance: a missed increment is acceptable (views are
   * approximate, not financial).
   */
  async incrementViewCount(hash: string): Promise<void> {
    assertValidHash(hash);
    const sharePath = this.resolveSharePath(hash);
    const record = await this.readShareFile(sharePath);
    if (!record) return;

    record.viewCount++;
    await this.writeAtomic(sharePath, Buffer.from(JSON.stringify(record, null, 2) + '\n', 'utf8'));
  }

  /**
   * Update the expiry time for an existing share. Used to extend or
   * shorten the TTL of an already-shared gram. Setting expiresAt to
   * null removes the expiry (makes the share permanent).
   *
   * Returns the updated record, or null if no share exists.
   */
  async setExpiry(hash: string, expiresAt: string | null): Promise<HologramShareRecord | null> {
    assertValidHash(hash);
    const sharePath = this.resolveSharePath(hash);
    const record = await this.readShareFile(sharePath);
    if (!record) return null;

    record.expiresAt = expiresAt;
    await this.writeAtomic(sharePath, Buffer.from(JSON.stringify(record, null, 2) + '\n', 'utf8'));
    return record;
  }

  /**
   * Get the default TTL in seconds for new shares.
   */
  getDefaultTtl(): number {
    return this.defaultTtlSeconds;
  }

  /**
   * Get the max allowed TTL in seconds.
   */
  getMaxTtl(): number {
    return this.maxTtlSeconds;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private resolveTtl(requestedTtl?: number): number {
    if (typeof requestedTtl !== 'number' || !Number.isFinite(requestedTtl) || requestedTtl < 0) {
      return this.defaultTtlSeconds;
    }
    return Math.min(requestedTtl, this.maxTtlSeconds);
  }

  private resolveSharePath(hash: string): string {
    const relPath = `${bundleRelDir(hash)}/${SHARE_FILE}`;
    const abs = resolve(this.rootDir, relPath);
    const rootWithSep = this.rootDir.endsWith(sep) ? this.rootDir : this.rootDir + sep;
    if (abs !== this.rootDir && !abs.startsWith(rootWithSep)) {
      throw new HologramStoreError(
        'invalid_hash',
        `path traversal blocked: resolved path ${abs} is outside store root ${this.rootDir}`
      );
    }
    return abs;
  }

  private async readShareFile(absPath: string): Promise<HologramShareRecord | null> {
    try {
      const buf = await fs.readFile(absPath);
      const parsed: unknown = JSON.parse(new TextDecoder().decode(buf));
      if (!isHologramShareRecord(parsed)) return null;
      return parsed;
    } catch (err) {
      if (isEnoent(err)) return null;
      throw new HologramStoreError(
        'io_error',
        `failed to read share record: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  }

  private async writeAtomic(absPath: string, bytes: Buffer): Promise<void> {
    const { createHash } = await import('node:crypto');
    const tmp = `${absPath}.tmp.${process.pid}.${createHash('sha256')
      .update(bytes)
      .digest('hex')
      .slice(0, 8)}`;
    const fh = await fs.open(tmp, 'w', 0o644);
    try {
      await fh.writeFile(bytes);
      await fh.sync();
    } finally {
      await fh.close();
    }
    try {
      await fs.rename(tmp, absPath);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  }
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isHologramShareRecord(v: unknown): v is HologramShareRecord {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.hash === 'string' &&
    /^[0-9a-f]{64}$/.test(o.hash) &&
    typeof o.createdAt === 'string' &&
    (o.expiresAt === null || typeof o.expiresAt === 'string') &&
    typeof o.viewCount === 'number' &&
    typeof o.createdBy === 'string' &&
    o.schemaVersion === 1
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}