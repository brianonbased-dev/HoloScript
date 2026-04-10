/**
 * In-Memory API Key Store
 *
 * Provides CRUD operations for API keys with SHA-256 hash storage.
 * ADR-003: Raw keys are never stored -- only SHA-256 hashes.
 *
 * NOTE: This is an in-memory store suitable for single-instance deployments.
 * For production multi-instance deployments, replace with a database-backed
 * implementation (e.g., PostgreSQL, Redis) that implements the same interface.
 */

export interface ApiKeyRecord {
  /** SHA-256 hash prefix used as identifier */
  keyId: string;
  /** Full SHA-256 hash for lookup */
  hash: string;
  /** Human-readable name */
  name: string;
  /** RBAC role */
  role: 'admin' | 'developer' | 'viewer' | 'service';
  /** Whether the key is active */
  active: boolean;
  /** ISO timestamp of creation */
  createdAt: string;
  /** Identity of creator */
  createdBy: string;
  /** Optional expiration (ISO timestamp) */
  expiresAt: string | null;
  /** ISO timestamp if revoked */
  revokedAt: string | null;
  /** Identity of revoker */
  revokedBy: string | null;
}

class ApiKeyStore {
  private keys: Map<string, ApiKeyRecord> = new Map();

  /**
   * Store a new API key record.
   * @param hash Full SHA-256 hash of the raw key
   * @param name Human-readable name
   * @param role RBAC role
   * @param createdBy Identity of creator
   * @param expiresAt Optional expiration timestamp
   * @returns The stored record
   */
  create(
    hash: string,
    name: string,
    role: ApiKeyRecord['role'],
    createdBy: string,
    expiresAt?: string
  ): ApiKeyRecord {
    const keyId = hash.slice(0, 12);
    const record: ApiKeyRecord = {
      keyId,
      hash,
      name,
      role,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy,
      expiresAt: expiresAt ?? null,
      revokedAt: null,
      revokedBy: null,
    };
    this.keys.set(hash, record);
    return record;
  }

  /**
   * Find a key record by its full SHA-256 hash.
   * Returns undefined if not found.
   */
  findByHash(hash: string): ApiKeyRecord | undefined {
    return this.keys.get(hash);
  }

  /**
   * Find a key record by its short keyId (hash prefix).
   */
  findByKeyId(keyId: string): ApiKeyRecord | undefined {
    for (const record of this.keys.values()) {
      if (record.keyId === keyId) return record;
    }
    return undefined;
  }

  /**
   * Check if a key is valid (exists, active, not expired).
   */
  isValid(hash: string): boolean {
    const record = this.keys.get(hash);
    if (!record || !record.active) return false;
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) return false;
    return true;
  }

  /**
   * List all key records (metadata only, no raw keys).
   */
  list(): Omit<ApiKeyRecord, 'hash'>[] {
    return Array.from(this.keys.values()).map(({ hash: _hash, ...rest }) => rest);
  }

  /**
   * Revoke a key by keyId.
   * Returns true if found and revoked, false if not found.
   */
  revoke(keyId: string, revokedBy: string): boolean {
    for (const record of this.keys.values()) {
      if (record.keyId === keyId) {
        record.active = false;
        record.revokedAt = new Date().toISOString();
        record.revokedBy = revokedBy;
        return true;
      }
    }
    return false;
  }

  /** Total number of keys (active and revoked). */
  get size(): number {
    return this.keys.size;
  }

  /** Number of active keys. */
  get activeCount(): number {
    let count = 0;
    for (const record of this.keys.values()) {
      if (record.active) count++;
    }
    return count;
  }
}

/** Singleton in-memory API key store */
export const apiKeyStore = new ApiKeyStore();
