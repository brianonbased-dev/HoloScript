/**
 * Token Manager — platform re-export
 *
 * Sprint 6 Priority 2: Private packages / CI token auth
 *
 * Generates, validates, and revokes bearer tokens for registry authentication.
 * Tokens are scoped to an organization and carry permission levels.
 */

import { createHash, randomBytes } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TokenPermission = 'read' | 'publish' | 'admin';

export interface TokenRecord {
  id: string;
  token: string;
  name: string;
  orgScope: string;
  permissions: TokenPermission[];
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  readonly?: boolean;
  revoked: boolean;
}

export interface CreateTokenOptions {
  name: string;
  orgScope: string;
  permissions?: TokenPermission[];
  readonly?: boolean;
  /** Expiry in seconds from now */
  expiresIn?: number;
}

export interface ValidateResult {
  valid: boolean;
  record?: TokenRecord;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TokenManager
// ─────────────────────────────────────────────────────────────────────────────

export class TokenManager {
  private tokens: Map<string, TokenRecord> = new Map();

  /**
   * Generate a new registry token.
   * Returns the raw token (shown once) and the stored record.
   */
  create(options: CreateTokenOptions): { rawToken: string; record: TokenRecord } {
    const rawToken = 'hls_' + randomBytes(24).toString('hex');
    const id = createHash('sha256').update(rawToken).digest('hex').slice(0, 16);

    const record: TokenRecord = {
      id,
      token: this.hash(rawToken),
      name: options.name,
      orgScope: options.orgScope,
      permissions: options.permissions ?? ['read'],
      createdAt: new Date(),
      expiresAt: options.expiresIn ? new Date(Date.now() + options.expiresIn * 1000) : undefined,
      readonly: options.readonly ?? false,
      revoked: false,
    };

    this.tokens.set(id, record);
    return { rawToken, record };
  }

  /**
   * Validate a raw token string.
   */
  validate(rawToken: string): ValidateResult {
    const hashed = this.hash(rawToken);
    for (const record of this.tokens.values()) {
      if (record.token !== hashed) continue;
      if (record.revoked) return { valid: false, reason: 'Token has been revoked' };
      if (record.expiresAt && record.expiresAt < new Date()) {
        return { valid: false, reason: 'Token has expired' };
      }
      record.lastUsedAt = new Date();
      return { valid: true, record };
    }
    return { valid: false, reason: 'Unknown token' };
  }

  /**
   * Revoke a token by its id.
   */
  revoke(id: string): boolean {
    const record = this.tokens.get(id);
    if (!record) return false;
    record.revoked = true;
    return true;
  }

  /**
   * List all tokens for an org scope.
   */
  listByScope(orgScope: string): TokenRecord[] {
    return Array.from(this.tokens.values()).filter((r) => r.orgScope === orgScope);
  }

  /**
   * Get a token record by id.
   */
  getById(id: string): TokenRecord | undefined {
    return this.tokens.get(id);
  }

  /**
   * Check if a (already validated) record has a given permission.
   */
  hasPermission(record: TokenRecord, permission: TokenPermission): boolean {
    if (record.revoked) return false;
    if (record.expiresAt && record.expiresAt < new Date()) return false;
    if (record.readonly && permission !== 'read') return false;
    return record.permissions.includes(permission) || record.permissions.includes('admin');
  }

  /**
   * Delete all tokens (for testing).
   */
  clear(): void {
    this.tokens.clear();
  }

  get size(): number {
    return this.tokens.size;
  }

  // ─────────────────────────────────────────────────────────────────────────
  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}

export function createTokenManager(): TokenManager {
  return new TokenManager();
}
