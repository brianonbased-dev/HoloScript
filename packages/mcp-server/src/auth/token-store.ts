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
  accessTokenTTL: 3600, // 1 hour
  refreshTokenTTL: 2592000, // 30 days
  authCodeTTL: 300, // 5 minutes
};

// ── Client retention ─────────────────────────────────────────────────────────

/**
 * How many clients the store holds before a registration must first retire an
 * idle one.
 *
 * This was 1000 with nothing ever retired, so the production store filled on
 * 2026-06-28 and refused every registration after it (board
 * task_1790545471449_w6yi). Retirement below is the fix; the higher cap is only
 * the bridge across its first idle window. Clients stored before usage was
 * recorded start their idle clock when recording starts, so none of them can be
 * shown idle for a full window until one has passed. Without room in the
 * meantime the store would stay shut for that whole window.
 */
export const DEFAULT_MAX_CLIENTS = 5000;

/**
 * A client can be retired only after going this long without being issued a
 * token.
 *
 * 30 days: longer than any token this server issues (refresh tokens last at
 * most 30 days, and the legacy issuer's last 24 hours), so a retired client
 * holds nothing that could still be redeemed; and long enough that a weekly or
 * monthly caller keeps its client. A retired client that comes back has to be
 * registered again, the way it was the first time; where remote registration
 * is closed, that means an operator registering it over loopback, which is why
 * retirement waits for the cap and for a full idle window.
 * TokenStore never goes below the refresh-token lifetime, whatever is passed.
 */
export const DEFAULT_CLIENT_IDLE_RETIREMENT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Thrown when a registration finds the client store full and nothing in it is
 * provably idle.
 *
 * The message keeps its old prefix, so callers that match on it still do. The
 * type exists so a caller can tell "the store is full" apart from "the request
 * was malformed" and answer each honestly, instead of catching everything the
 * same way (which is how `/oauth/register` came to hand out clients the store
 * had refused).
 */
export class ClientStoreFullError extends Error {
  readonly store: 'durable' | 'memory';
  readonly count: number;
  readonly maxClients: number;
  /** Idle clients deleted by this attempt before it still came up short. */
  readonly retiredClientIds: string[];

  constructor(params: {
    store: 'durable' | 'memory';
    count: number;
    maxClients: number;
    idleMs?: number;
    retiredClientIds?: string[];
  }) {
    const days = params.idleMs ? Math.round(params.idleMs / 86_400_000) : undefined;
    super(
      params.store === 'durable'
        ? `Maximum client registration limit reached: the client store holds ${params.count} ` +
            `of ${params.maxClients} clients, and none has gone ${days ?? '?'} days without a ` +
            `token while holding no live token, so none could be retired to make room.`
        : `Maximum client registration limit reached: the in-memory client registry holds ` +
            `${params.count} of ${params.maxClients} clients.`
    );
    this.name = 'ClientStoreFullError';
    this.store = params.store;
    this.count = params.count;
    this.maxClients = params.maxClients;
    this.retiredClientIds = params.retiredClientIds ?? [];
  }
}

/** True for a ClientStoreFullError, including one from another copy of this module. */
export function isClientStoreFullError(err: unknown): err is ClientStoreFullError {
  return (
    err instanceof ClientStoreFullError ||
    (err instanceof Error && err.name === 'ClientStoreFullError')
  );
}

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
  /**
   * Agent identity this chain was issued to. Durable parity with the in-memory
   * registry: a deploy wipes the maps, so a rotation after one must be able to
   * recover the identity from here instead of dropping it.
   */
  agentId?: string;
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
  /**
   * Agent this client is bound to, recorded at registration and only when the
   * registering request proved that agent's own key.
   *
   * This durable copy is the one that survives a deploy. Without it the binding
   * lived only in the in-memory registry, which is wiped on every push: the
   * client was rehydrated WITHOUT its agent, and the next token request — the
   * same legitimate request that had already proved the agent once, at
   * registration — was refused unless it re-presented the agent key. A binding
   * that silently expires at deploy time is not a binding.
   */
  agentId?: string;
  /**
   * Last time this client was registered or issued a token (ms). This is the
   * only record of use: token rows are deleted within a minute of expiring, so
   * their absence proves nothing past a day. A backend that is handed a client
   * without it stamps the write time, so the idle clock starts then and never
   * earlier.
   */
  lastUsedAt?: number;
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

  /**
   * Record that `clientId` was just issued a token, moving `lastUsedAt` forward
   * (never back). Resolves false when the store holds no such client.
   *
   * Optional, like `retireIdleClients`: a backend that records no use cannot
   * prove any client idle, so TokenStore never retires from it and a full store
   * simply refuses.
   */
  touchClient?(clientId: string, at: number): Promise<boolean>;

  /**
   * Delete at most `limit` clients that are provably idle, longest-idle first,
   * and resolve the ids actually deleted. A client qualifies only when ALL hold:
   *   - no access-token row and no refresh-token row, in any state;
   *   - `lastUsedAt` before `idleBefore`;
   *   - registered before `idleBefore`.
   * Anything that cannot be shown to meet all three stays.
   */
  retireIdleClients?(params: { idleBefore: number; limit: number }): Promise<string[]>;

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
    // Same rule as the Postgres backend: a missing lastUsedAt starts the idle
    // clock at the write, and a rewrite never moves the clock back.
    const previous = this.clients.get(client.clientId)?.lastUsedAt;
    const written = client.lastUsedAt ?? Date.now();
    this.clients.set(client.clientId, {
      ...client,
      lastUsedAt: previous !== undefined ? Math.max(previous, written) : written,
    });
  }

  async deleteClient(clientId: string): Promise<boolean> {
    return this.clients.delete(clientId);
  }

  async countClients(): Promise<number> {
    return this.clients.size;
  }

  async touchClient(clientId: string, at: number): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.lastUsedAt = Math.max(client.lastUsedAt ?? at, at);
    return true;
  }

  async retireIdleClients(params: { idleBefore: number; limit: number }): Promise<string[]> {
    if (params.limit <= 0) return [];
    // Any token row at all, live or not yet swept, keeps its client.
    const holdsTokens = new Set<string>();
    for (const token of this.accessTokens.values()) holdsTokens.add(token.clientId);
    for (const token of this.refreshTokens.values()) holdsTokens.add(token.clientId);

    const idle = [...this.clients.values()]
      .filter(
        (client) =>
          client.lastUsedAt !== undefined &&
          client.lastUsedAt < params.idleBefore &&
          client.createdAt < params.idleBefore &&
          !holdsTokens.has(client.clientId)
      )
      .sort(
        (a, b) =>
          (a.lastUsedAt as number) - (b.lastUsedAt as number) ||
          a.clientId.localeCompare(b.clientId)
      )
      .slice(0, params.limit);

    for (const client of idle) this.clients.delete(client.clientId);
    return idle.map((client) => client.clientId);
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
    const computed = createHash('sha256').update(verifier).digest('base64url');
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
    await this.recordClientUse(params.clientId, now);
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
    agentId?: string;
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
      ...(params.agentId ? { agentId: params.agentId } : {}),
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

  /**
   * Write-through an externally-issued access token (legacy oauth21 registry
   * parity) so Bearers survive redeploys of the in-memory registry.
   *
   * This is the path every production grant takes, so it is also where the
   * client's use is recorded.
   */
  async importAccessToken(token: StoredAccessToken): Promise<void> {
    await this.recordClientUse(token.clientId, token.issuedAt);
    await this.backend.setAccessToken(token);
  }

  /** Write-through an externally-issued refresh token (legacy registry parity). */
  async importRefreshToken(token: StoredRefreshToken): Promise<void> {
    await this.backend.setRefreshToken(token);
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
      agentId: params.agentId,
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

  /**
   * Register a client, making room first if the store is full.
   *
   * Room is made only by retiring clients that are provably idle (see
   * `TokenStoreBackend.retireIdleClients`), longest-idle first, exactly as many
   * as this one registration needs. Below the cap nothing is retired, so an
   * idle client stays on record until its slot is actually wanted. When nothing
   * qualifies, this throws ClientStoreFullError; it never quietly stores less.
   *
   * No de-duplication by caller identity. A registration carries no identity a
   * caller cannot copy except a proven agent_id, and one agent can have several
   * live sessions at once (concurrent sessions share a seat). Replacing "that
   * agent's client" would cut off a sibling session that is using it right now.
   * The one in-place case is a clientId this store already holds (import mode):
   * that row is rewritten and takes no new slot, so the cap does not refuse it.
   */
  async registerClient(params: {
    clientName: string;
    redirectUris: string[];
    scopes: string[];
    clientType?: 'confidential' | 'public';
    rateLimit?: number;
    maxClients?: number;
    /**
     * Minimum time without a token before a client may be retired. Default
     * DEFAULT_CLIENT_IDLE_RETIREMENT_MS; never less than the refresh-token
     * lifetime, so no client is retired while a refresh token it holds could
     * still be redeemed.
     */
    clientIdleRetirementMs?: number;
    /**
     * Import mode: reuse an externally-issued identity so parallel registries
     * (legacy in-memory oauth21 + this durable store) share ONE client_id.
     * Without this the /oauth/register dual-write diverges and the durable
     * copy is unreachable by the credentials the caller holds.
     */
    clientId?: string;
    clientSecret?: string;
    /**
     * Only set by a caller that proved this agent's own key at registration.
     * Persisted so the binding outlives the deploy that wipes the in-memory
     * registry.
     */
    agentId?: string;
  }): Promise<{ clientId: string; clientSecret: string; retiredClientIds: string[] }> {
    const maxClients = params.maxClients || DEFAULT_MAX_CLIENTS;
    const now = Date.now();
    let retiredClientIds: string[] = [];

    const rewritesStoredClient =
      params.clientId !== undefined &&
      (await this.backend.getClient(params.clientId)) !== undefined;

    if (!rewritesStoredClient) {
      const count = await this.backend.countClients();
      if (count >= maxClients) {
        const idleMs = this.clientIdleRetirementMs(params.clientIdleRetirementMs);
        if (this.backend.retireIdleClients) {
          retiredClientIds = await this.backend.retireIdleClients({
            idleBefore: now - idleMs,
            limit: count - maxClients + 1,
          });
        }
        if (retiredClientIds.length > 0) {
          console.warn(
            `[auth] retired ${retiredClientIds.length} OAuth client(s) idle for ` +
              `${Math.round(idleMs / 86_400_000)}+ days with no live token, to make room: ` +
              retiredClientIds.join(', ')
          );
        }
        if (count - retiredClientIds.length >= maxClients) {
          throw new ClientStoreFullError({
            store: 'durable',
            count: count - retiredClientIds.length,
            maxClients,
            idleMs,
            retiredClientIds,
          });
        }
      }
    }

    const clientId = params.clientId ?? this.generateClientId();
    const clientSecret = params.clientSecret ?? this.generateToken();

    try {
      await this.backend.setClient({
        clientId,
        clientSecretHash: this.hashSecret(clientSecret),
        clientName: params.clientName,
        redirectUris: params.redirectUris,
        scopes: params.scopes,
        createdAt: now,
        clientType: params.clientType || 'confidential',
        rateLimit: params.rateLimit || 60,
        lastUsedAt: now,
        ...(params.agentId ? { agentId: params.agentId } : {}),
      });
    } catch (err) {
      // Any clients retired above are already gone. Say which, so the caller
      // can still drop them from memory and record them.
      if (retiredClientIds.length > 0 && err instanceof Error) {
        (err as Error & { retiredClientIds?: string[] }).retiredClientIds = retiredClientIds;
      }
      throw err;
    }

    return { clientId, clientSecret, retiredClientIds };
  }

  /** The idle window actually applied: never shorter than a refresh token's life. */
  private clientIdleRetirementMs(requested?: number): number {
    return Math.max(
      requested ?? DEFAULT_CLIENT_IDLE_RETIREMENT_MS,
      this.ttl.refreshTokenTTL * 1000
    );
  }

  /**
   * Record that `clientId` is being used right now.
   *
   * Resolves true when recorded, false when the store holds no such client
   * (retired, or never stored), and undefined when nothing could be recorded:
   * the backend keeps no usage record, or the write failed. Never throws.
   * Only false is evidence that the client is gone; undefined is not.
   *
   * The sign-in routes call this (through OAuth2Provider) BEFORE any code or
   * token is issued. A retirement racing that request then either sees the new
   * lastUsedAt and skips the client, or has already deleted it, and the request
   * is refused before anything is issued.
   */
  async noteClientUse(clientId: string, at: number = Date.now()): Promise<boolean | undefined> {
    if (!this.backend.touchClient) return undefined;
    try {
      return await this.backend.touchClient(clientId, at);
    } catch (err) {
      console.error(
        `[auth] could not record use of OAuth client ${clientId}: ` +
          (err instanceof Error ? err.message : String(err))
      );
      return undefined;
    }
  }

  /**
   * Record use again as a token is written. The sign-in routes already
   * recorded it before issuing; this keeps the record right for tokens written
   * any other way. Runs before the token row is written, for the same reason.
   * Never throws: a failed record must not cost the caller the token write that
   * follows it (the refresh-token write-through comes after this one).
   */
  private async recordClientUse(clientId: string, at: number): Promise<void> {
    const known = await this.noteClientUse(clientId, at);
    if (known === false) {
      console.warn(
        `[auth] token issued to OAuth client ${clientId}, which the client store does not ` +
          `hold. It will not survive a restart; the caller must register again then.`
      );
    }
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
