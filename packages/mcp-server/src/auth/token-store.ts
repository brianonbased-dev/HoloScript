/**
 * Token Store — Pluggable Storage Backend for OAuth 2.1 Tokens
 *
 * Provides an abstraction layer over token storage with:
 * - In-memory implementation (dev/testing)
 * - Interface for pluggable backends (Redis, PostgreSQL)
 * - Token rotation on refresh
 * - Configurable TTL (access: 1hr default, refresh: 30d default)
 * - Automatic cleanup of expired entries
 *
 * The in-memory store is suitable for single-process deployments and tests.
 * Production deployments should use a distributed backend (Redis, PostgreSQL)
 * by implementing the TokenStoreBackend interface.
 */

import { randomUUID, createHash, timingSafeEqual } from 'crypto';

// ── Configuration ────────────────────────────────────────────────────────────

export interface TokenStoreTTL {
  /** Access token TTL in seconds. Default: 3600 (1 hour) */
  accessTokenTTL: number;
  /** Refresh token TTL in seconds. Default: 2592000 (30 days) */
  refreshTokenTTL: number;
  /** Authorization code TTL in seconds. Default: 300 (5 min) */
  authCodeTTL: number;
}

export const DEFAULT_TTL: TokenStoreTTL = {
  accessTokenTTL: 3600,       // 1 hour
  refreshTokenTTL: 2592000,   // 30 days
  authCodeTTL: 300,           // 5 minutes
};

// ── Token Types ──────────────────────────────────────────────────────────────

export interface StoredAccessToken {
  token: string;
  clientId: string;
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
  agentId?: string;
  dpopThumbprint?: string;
}

export interface StoredRefreshToken {
  token: string;
  clientId: string;
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
  /** Chain ID for token rotation tracking */
  chainId: string;
  /** Whether this token has been consumed (rotation) */
  used: boolean;
}

export interface StoredAuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  expiresAt: number;
  used: boolean;
}

export interface StoredClient {
  clientId: string;
  /** SHA-256 hash of client secret */
  clientSecretHash: string;
  clientName: string;
  redirectUris: string[];
  scopes: string[];
  createdAt: number;
  clientType: 'confidential' | 'public';
  rateLimit: number;
}

// ── Backend Interface ────────────────────────────────────────────────────────

/**
 * Pluggable backend interface for token storage.
 *
 * Implement this interface to use Redis, PostgreSQL, or any other
 * distributed storage system. All methods are async to support
 * network-based backends.
 *
 * Example Redis implementation:
 * ```typescript
 * class RedisTokenStore implements TokenStoreBackend {
 *   constructor(private redis: Redis) {}
 *
 *   async getAccessToken(token: string) {
 *     const data = await this.redis.get(`at:${token}`);
 *     return data ? JSON.parse(data) : undefined;
 *   }
 *
 *   async setAccessToken(token: StoredAccessToken) {
 *     const ttl = Math.ceil((token.expiresAt - Date.now()) / 1000);
 *     await this.redis.set(`at:${token.token}`, JSON.stringify(token), 'EX', ttl);
 *   }
 *   // ... etc
 * }
 * ```
 *
 * Example PostgreSQL implementation:
 * ```typescript
 * class PostgresTokenStore implements TokenStoreBackend {
 *   constructor(private pool: Pool) {}
 *
 *   async getAccessToken(token: string) {
 *     const { rows } = await this.pool.query(
 *       'SELECT * FROM access_tokens WHERE token = $1 AND expires_at > NOW()',
 *       [token]
 *     );
 *     return rows[0] || undefined;
 *   }
 *   // ... etc
 * }
 * ```
 */
export interface TokenStoreBackend {
  // ── Access Tokens ─────────────────────────────────────────────────────
  getAccessToken(token: string): Promise<StoredAccessToken | undefined>;
  setAccessToken(token: StoredAccessToken): Promise<void>;
  deleteAccessToken(token: string): Promise<boolean>;
  deleteAccessTokensByClient(clientId: string): Promise<number>;

  // ── Refresh Tokens ────────────────────────────────────────────────────
  getRefreshToken(token: string): Promise<StoredRefreshToken | undefined>;
  setRefreshToken(token: StoredRefreshToken): Promise<void>;
  deleteRefreshToken(token: string): Promise<boolean>;
  deleteRefreshTokensByClient(clientId: string): Promise<number>;
  markRefreshTokenUsed(token: string): Promise<void>;

  // ── Authorization Codes ───────────────────────────────────────────────
  getAuthorizationCode(code: string): Promise<StoredAuthorizationCode | undefined>;
  setAuthorizationCode(code: StoredAuthorizationCode): Promise<void>;
  deleteAuthorizationCode(code: string): Promise<boolean>;
  markAuthorizationCodeUsed(code: string): Promise<void>;

  // ── Clients ───────────────────────────────────────────────────────────
  getClient(clientId: string): Promise<StoredClient | undefined>;
  setClient(client: StoredClient): Promise<void>;
  deleteClient(clientId: string): Promise<boolean>;
  countClients(): Promise<number>;

  // ── Revoked Chains ────────────────────────────────────────────────────
  isChainRevoked(chainId: string): Promise<boolean>;
  revokeChain(chainId: string): Promise<void>;

  // ── Cleanup ───────────────────────────────────────────────────────────
  /**
   * Remove expired tokens and codes. Called periodically by the store.
   * Returns the number of entries removed.
   */
  cleanup(): Promise<number>;

  // ── Stats ─────────────────────────────────────────────────────────────
  getStats(): Promise<TokenStoreStats>;
}

export interface TokenStoreStats {
  registeredClients: number;
  activeAccessTokens: number;
  activeRefreshTokens: number;
  pendingAuthCodes: number;
  revokedChains: number;
}

// ── In-Memory Backend ────────────────────────────────────────────────────────

/**
 * In-memory token store backend for development and testing.
 *
 * This backend stores all tokens in JavaScript Maps. It is NOT suitable for
 * multi-process deployments because state is not shared between workers.
 *
 * For production, implement TokenStoreBackend with Redis or PostgreSQL.
 */
export class InMemoryTokenStore implements TokenStoreBackend {
  private accessTokens = new Map<string, StoredAccessToken>();
  private refreshTokens = new Map<string, StoredRefreshToken>();
  private authCodes = new Map<string, StoredAuthorizationCode>();
  private clients = new Map<string, StoredClient>();
  private revokedChains = new Set<string>();

  // ── Access Tokens ─────────────────────────────────────────────────────

  async getAccessToken(token: string): Promise<StoredAccessToken | undefined> {
    const stored = this.accessTokens.get(token);
    if (stored && stored.expiresAt < Date.now()) {
      this.accessTokens.delete(token);
      return undefined;
    }
    return stored;
  }

  async setAccessToken(token: StoredAccessToken): Promise<void> {
    this.accessTokens.set(token.token, token);
  }

  async deleteAccessToken(token: string): Promise<boolean> {
    return this.accessTokens.delete(token);
  }

  async deleteAccessTokensByClient(clientId: string): Promise<number> {
    let count = 0;
    for (const [key, token] of this.accessTokens) {
      if (token.clientId === clientId) {
        this.accessTokens.delete(key);
        count++;
      }
    }
    return count;
  }

  // ── Refresh Tokens ────────────────────────────────────────────────────

  async getRefreshToken(token: string): Promise<StoredRefreshToken | undefined> {
    const stored = this.refreshTokens.get(token);
    if (stored && stored.expiresAt < Date.now()) {
      this.refreshTokens.delete(token);
      return undefined;
    }
    return stored;
  }

  async setRefreshToken(token: StoredRefreshToken): Promise<void> {
    this.refreshTokens.set(token.token, token);
  }

  async deleteRefreshToken(token: string): Promise<boolean> {
    return this.refreshTokens.delete(token);
  }

  async deleteRefreshTokensByClient(clientId: string): Promise<number> {
    let count = 0;
    for (const [key, token] of this.refreshTokens) {
      if (token.clientId === clientId) {
        this.revokedChains.add(token.chainId);
        this.refreshTokens.delete(key);
        count++;
      }
    }
    return count;
  }

  async markRefreshTokenUsed(token: string): Promise<void> {
    const stored = this.refreshTokens.get(token);
    if (stored) {
      stored.used = true;
    }
  }

  // ── Authorization Codes ───────────────────────────────────────────────

  async getAuthorizationCode(code: string): Promise<StoredAuthorizationCode | undefined> {
    const stored = this.authCodes.get(code);
    if (stored && stored.expiresAt < Date.now()) {
      this.authCodes.delete(code);
      return undefined;
    }
    return stored;
  }

  async setAuthorizationCode(code: StoredAuthorizationCode): Promise<void> {
    this.authCodes.set(code.code, code);
  }

  async deleteAuthorizationCode(code: string): Promise<boolean> {
    return this.authCodes.delete(code);
  }

  async markAuthorizationCodeUsed(code: string): Promise<void> {
    const stored = this.authCodes.get(code);
    if (stored) {
      stored.used = true;
    }
  }

  // ── Clients ───────────────────────────────────────────────────────────

  async getClient(clientId: string): Promise<StoredClient | undefined> {
    return this.clients.get(clientId);
  }

  async setClient(client: StoredClient): Promise<void> {
    this.clients.set(client.clientId, client);
  }

  async deleteClient(clientId: string): Promise<boolean> {
    return this.clients.delete(clientId);
  }

  async countClients(): Promise<number> {
    return this.clients.size;
  }

  // ── Revoked Chains ────────────────────────────────────────────────────

  async isChainRevoked(chainId: string): Promise<boolean> {
    return this.revokedChains.has(chainId);
  }

  async revokeChain(chainId: string): Promise<void> {
    this.revokedChains.add(chainId);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  async cleanup(): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [key, code] of this.authCodes) {
      if (code.expiresAt < now || code.used) {
        this.authCodes.delete(key);
        removed++;
      }
    }

    for (const [key, token] of this.accessTokens) {
      if (token.expiresAt < now) {
        this.accessTokens.delete(key);
        removed++;
      }
    }

    for (const [key, token] of this.refreshTokens) {
      if (token.expiresAt < now || token.used) {
        this.refreshTokens.delete(key);
        removed++;
      }
    }

    return removed;
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async getStats(): Promise<TokenStoreStats> {
    return {
      registeredClients: this.clients.size,
      activeAccessTokens: this.accessTokens.size,
      activeRefreshTokens: this.refreshTokens.size,
      pendingAuthCodes: this.authCodes.size,
      revokedChains: this.revokedChains.size,
    };
  }

  // ── Test Helpers ──────────────────────────────────────────────────────

  /** Clear all data (for tests) */
  clear(): void {
    this.accessTokens.clear();
    this.refreshTokens.clear();
    this.authCodes.clear();
    this.clients.clear();
    this.revokedChains.clear();
  }
}

// ── Token Store Wrapper ──────────────────────────────────────────────────────

/**
 * TokenStore wraps a backend with TTL configuration and periodic cleanup.
 *
 * Usage:
 * ```typescript
 * // Dev/test (in-memory)
 * const store = new TokenStore();
 *
 * // Production (Redis)
 * const store = new TokenStore({
 *   backend: new RedisTokenStore(redisClient),
 *   ttl: { accessTokenTTL: 3600, refreshTokenTTL: 2592000, authCodeTTL: 300 },
 * });
 * ```
 */
export class TokenStore {
  readonly backend: TokenStoreBackend;
  readonly ttl: TokenStoreTTL;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options?: {
    backend?: TokenStoreBackend;
    ttl?: Partial<TokenStoreTTL>;
    /** Cleanup interval in ms. Default: 60000 (1 min). Set 0 to disable. */
    cleanupIntervalMs?: number;
  }) {
    this.backend = options?.backend || new InMemoryTokenStore();
    this.ttl = { ...DEFAULT_TTL, ...options?.ttl };

    const cleanupMs = options?.cleanupIntervalMs ?? 60_000;
    if (cleanupMs > 0) {
      this.startCleanup(cleanupMs);
    }
  }

  // ── Token Generation ──────────────────────────────────────────────────

  generateToken(): string {
    return `hs_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
  }

  generateClientId(): string {
    return `hsc_${randomUUID().replace(/-/g, '')}`;
  }

  hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  verifyS256Challenge(verifier: string, challenge: string): boolean {
    const computed = createHash('sha256')
      .update(verifier)
      .digest('base64url');
    return computed === challenge;
  }

  // ── Access Token CRUD ─────────────────────────────────────────────────

  async createAccessToken(params: {
    clientId: string;
    scopes: string[];
    agentId?: string;
    dpopThumbprint?: string;
  }): Promise<StoredAccessToken> {
    const now = Date.now();
    const token: StoredAccessToken = {
      token: this.generateToken(),
      clientId: params.clientId,
      scopes: params.scopes,
      issuedAt: now,
      expiresAt: now + this.ttl.accessTokenTTL * 1000,
      agentId: params.agentId,
      dpopThumbprint: params.dpopThumbprint,
    };
    await this.backend.setAccessToken(token);
    return token;
  }

  async getAccessToken(token: string): Promise<StoredAccessToken | undefined> {
    return this.backend.getAccessToken(token);
  }

  async revokeAccessToken(token: string): Promise<boolean> {
    return this.backend.deleteAccessToken(token);
  }

  // ── Refresh Token CRUD ────────────────────────────────────────────────

  async createRefreshToken(params: {
    clientId: string;
    scopes: string[];
    chainId?: string;
  }): Promise<StoredRefreshToken> {
    const now = Date.now();
    const token: StoredRefreshToken = {
      token: this.generateToken(),
      clientId: params.clientId,
      scopes: params.scopes,
      issuedAt: now,
      expiresAt: now + this.ttl.refreshTokenTTL * 1000,
      chainId: params.chainId || randomUUID(),
      used: false,
    };
    await this.backend.setRefreshToken(token);
    return token;
  }

  async getRefreshToken(token: string): Promise<StoredRefreshToken | undefined> {
    return this.backend.getRefreshToken(token);
  }

  async markRefreshTokenUsed(token: string): Promise<void> {
    return this.backend.markRefreshTokenUsed(token);
  }

  async revokeRefreshChain(chainId: string): Promise<void> {
    return this.backend.revokeChain(chainId);
  }

  async isChainRevoked(chainId: string): Promise<boolean> {
    return this.backend.isChainRevoked(chainId);
  }

  // ── Token Pair Issuance ───────────────────────────────────────────────

  /**
   * Issue an access + refresh token pair.
   * Used after successful authorization code exchange, client credentials,
   * or refresh token rotation.
   */
  async issueTokenPair(params: {
    clientId: string;
    scopes: string[];
    agentId?: string;
    dpopThumbprint?: string;
    chainId?: string;
  }): Promise<{ accessToken: StoredAccessToken; refreshToken: StoredRefreshToken }> {
    const chainId = params.chainId || randomUUID();

    const accessToken = await this.createAccessToken({
      clientId: params.clientId,
      scopes: params.scopes,
      agentId: params.agentId,
      dpopThumbprint: params.dpopThumbprint,
    });

    const refreshToken = await this.createRefreshToken({
      clientId: params.clientId,
      scopes: params.scopes,
      chainId,
    });

    return { accessToken, refreshToken };
  }

  // ── Authorization Code CRUD ───────────────────────────────────────────

  async createAuthorizationCode(params: {
    clientId: string;
    redirectUri: string;
    scopes: string[];
    codeChallenge: string;
    codeChallengeMethod: 'S256';
  }): Promise<StoredAuthorizationCode> {
    const now = Date.now();
    const code: StoredAuthorizationCode = {
      code: this.generateToken(),
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scopes: params.scopes,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      expiresAt: now + this.ttl.authCodeTTL * 1000,
      used: false,
    };
    await this.backend.setAuthorizationCode(code);
    return code;
  }

  async getAuthorizationCode(code: string): Promise<StoredAuthorizationCode | undefined> {
    return this.backend.getAuthorizationCode(code);
  }

  async markAuthorizationCodeUsed(code: string): Promise<void> {
    return this.backend.markAuthorizationCodeUsed(code);
  }

  // ── Client CRUD ───────────────────────────────────────────────────────

  async registerClient(params: {
    clientName: string;
    redirectUris: string[];
    scopes: string[];
    clientType?: 'confidential' | 'public';
    rateLimit?: number;
    maxClients?: number;
  }): Promise<{ clientId: string; clientSecret: string }> {
    const maxClients = params.maxClients || 1000;
    const count = await this.backend.countClients();
    if (count >= maxClients) {
      throw new Error('Maximum client registration limit reached');
    }

    const clientId = this.generateClientId();
    const clientSecret = this.generateToken();

    await this.backend.setClient({
      clientId,
      clientSecretHash: this.hashSecret(clientSecret),
      clientName: params.clientName,
      redirectUris: params.redirectUris,
      scopes: params.scopes,
      createdAt: Date.now(),
      clientType: params.clientType || 'confidential',
      rateLimit: params.rateLimit || 60,
    });

    return { clientId, clientSecret };
  }

  async getClient(clientId: string): Promise<StoredClient | undefined> {
    return this.backend.getClient(clientId);
  }

  async revokeClient(clientId: string): Promise<boolean> {
    await this.backend.deleteAccessTokensByClient(clientId);
    await this.backend.deleteRefreshTokensByClient(clientId);
    return this.backend.deleteClient(clientId);
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async getStats(): Promise<TokenStoreStats> {
    return this.backend.getStats();
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  private startCleanup(intervalMs: number): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.backend.cleanup();
      } catch {
        // Cleanup failure is non-fatal
      }
    }, intervalMs);

    // Ensure the interval doesn't keep the process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /** Stop cleanup timer and release resources */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
