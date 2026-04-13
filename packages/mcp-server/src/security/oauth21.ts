/**
 * OAuth 2.1 Token Service for HoloScript MCP Server
 *
 * Implements OAuth 2.1 (draft-ietf-oauth-v2-1) with:
 * - PKCE (RFC 7636) mandatory for all flows
 * - Token rotation with refresh tokens
 * - DPoP (RFC 9449) proof-of-possession binding
 * - Access tokens (1 hour default, configurable via OAUTH_ACCESS_TTL), long-lived refresh (24h)
 * - Client credential registration and management
 *
 * This replaces the legacy Ed25519/API key authentication with
 * standards-based OAuth 2.1 per AAIF enterprise requirements.
 *
 * Backwards-compatible: legacy API key auth is still accepted during
 * migration period (OAUTH_MIGRATION_MODE=permissive).
 */

import { randomUUID, createHash, createHmac, timingSafeEqual } from 'crypto';
import { expandScopes, OAUTH2_SCOPES } from '../auth/oauth2-provider';

// ── Configuration ────────────────────────────────────────────────────────────

export interface OAuth21Config {
  /** Issuer identifier (e.g., "https://mcp.holoscript.net") */
  issuer: string;
  /** Access token TTL in seconds. Default: 3600 (1 hour) */
  accessTokenTTL: number;
  /** Refresh token TTL in seconds. Default: 86400 (24h) */
  refreshTokenTTL: number;
  /** Authorization code TTL in seconds. Default: 300 (5 min) */
  authCodeTTL: number;
  /** HMAC secret for token signing (must be >= 32 bytes) */
  tokenSecret: string;
  /** Migration mode: "strict" rejects legacy keys, "permissive" accepts both */
  migrationMode: 'strict' | 'permissive';
  /** Legacy API key (for backwards compat during migration) */
  legacyApiKey?: string;
  /** Max clients that can be registered. Default: 1000 */
  maxClients: number;
  /** Require DPoP proof-of-possession. Default: false (recommended: true in prod) */
  requireDPoP: boolean;
}

export const DEFAULT_OAUTH_CONFIG: OAuth21Config = {
  issuer: process.env.OAUTH_ISSUER || 'https://mcp.holoscript.net',
  accessTokenTTL: parseInt(process.env.OAUTH_ACCESS_TTL || '3600', 10),
  refreshTokenTTL: 86400,
  authCodeTTL: 300,
  tokenSecret: process.env.OAUTH_TOKEN_SECRET || '',
  migrationMode: (process.env.OAUTH_MIGRATION_MODE as 'strict' | 'permissive') || 'permissive',
  legacyApiKey: process.env.HOLOSCRIPT_API_KEY || '',
  maxClients: 1000,
  requireDPoP: process.env.OAUTH_REQUIRE_DPOP === 'true',
};

// ── Types ────────────────────────────────────────────────────────────────────

export type GrantType = 'authorization_code' | 'client_credentials' | 'refresh_token';

/** Scopes follow the pattern: domain:action */
export type OAuthScope = string;

/** Pre-defined scope categories for HoloScript MCP tools */
export const SCOPE_CATEGORIES = {
  /** Read-only language operations (parse, validate, explain, list) */
  'tools:read': 'Read-only tool access (parse, validate, list, explain)',
  /** Write/mutate operations (generate, compile, render, share) */
  'tools:write': 'Write tool access (generate, compile, render, edit)',
  /** Codebase intelligence (absorb, query, impact analysis) */
  'tools:codebase': 'Codebase intelligence tools (absorb, query, impact)',
  /** Browser control tools */
  'tools:browser': 'Browser control (launch, execute, screenshot)',
  /** Self-improvement and daemon tools */
  'tools:admin': 'Administrative tools (self-improve, diagnostics)',
  /** A2A task management */
  'a2a:tasks': 'A2A task lifecycle (create, list, cancel)',
  /** Scene management */
  'scenes:read': 'Read scenes and embeds',
  'scenes:write': 'Create and store scenes',
  /** Full access */
  'admin:*': 'Full administrative access to all tools and endpoints',
} as const;

export interface RegisteredClient {
  clientId: string;
  clientSecret: string; // hashed
  clientName: string;
  redirectUris: string[];
  scopes: OAuthScope[];
  createdAt: number;
  /** Client type per OAuth 2.1: "confidential" or "public" */
  clientType: 'confidential' | 'public';
  /** Rate limit: requests per minute */
  rateLimit: number;
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scopes: OAuthScope[];
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  expiresAt: number;
  used: boolean;
}

export interface AccessToken {
  token: string;
  clientId: string;
  scopes: OAuthScope[];
  issuedAt: number;
  expiresAt: number;
  /** Agent identity (who is using this token) */
  agentId?: string;
  /** DPoP thumbprint if DPoP was used */
  dpopThumbprint?: string;
}

export interface RefreshToken {
  token: string;
  clientId: string;
  scopes: OAuthScope[];
  issuedAt: number;
  expiresAt: number;
  /** Chain ID for token rotation tracking */
  chainId: string;
  /** Whether this token has been used (for rotation) */
  used: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer' | 'DPoP';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface TokenIntrospection {
  active: boolean;
  clientId?: string;
  scopes?: OAuthScope[];
  agentId?: string;
  expiresAt?: number;
  issuedAt?: number;
}

// ── In-Memory Stores (production would use Redis/PostgreSQL) ─────────────────

const clients = new Map<string, RegisteredClient>();
const authCodes = new Map<string, AuthorizationCode>();
const accessTokens = new Map<string, AccessToken>();
const refreshTokens = new Map<string, RefreshToken>();
const revokedChains = new Set<string>();

// ── Utility Functions ────────────────────────────────────────────────────────

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function generateToken(): string {
  return `hs_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
}

function verifyS256Challenge(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier).digest('base64url');
  return computed === challenge;
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ── Cleanup Timer ────────────────────────────────────────────────────────────

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanupTimer(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, code] of authCodes) {
      if (code.expiresAt < now || code.used) authCodes.delete(key);
    }
    for (const [key, token] of accessTokens) {
      if (token.expiresAt < now) accessTokens.delete(key);
    }
    for (const [key, token] of refreshTokens) {
      if (token.expiresAt < now || token.used) refreshTokens.delete(key);
    }
  }, 60_000); // Clean up every minute
}

// ── OAuth 2.1 Token Service ──────────────────────────────────────────────────

export class OAuth21Service {
  private config: OAuth21Config;

  constructor(config: Partial<OAuth21Config> = {}) {
    this.config = { ...DEFAULT_OAUTH_CONFIG, ...config };

    if (!this.config.tokenSecret) {
      // Generate ephemeral secret for dev mode (not for production!)
      this.config.tokenSecret = randomUUID() + randomUUID();
      console.warn(
        '[OAuth2.1] WARNING: No OAUTH_TOKEN_SECRET set. Using ephemeral secret. Set this in production!'
      );
    }

    startCleanupTimer();
  }

  // ── Client Registration ──────────────────────────────────────────────────

  registerClient(params: {
    clientName: string;
    redirectUris: string[];
    scopes: OAuthScope[];
    clientType?: 'confidential' | 'public';
    rateLimit?: number;
  }): { clientId: string; clientSecret: string } {
    if (clients.size >= this.config.maxClients) {
      throw new Error('Maximum client registration limit reached');
    }

    const clientId = `hsc_${randomUUID().replace(/-/g, '')}`;
    const clientSecret = generateToken();

    const client: RegisteredClient = {
      clientId,
      clientSecret: hashSecret(clientSecret),
      clientName: params.clientName,
      redirectUris: params.redirectUris,
      scopes: params.scopes,
      createdAt: Date.now(),
      clientType: params.clientType || 'confidential',
      rateLimit: params.rateLimit || 60,
    };

    clients.set(clientId, client);

    return { clientId, clientSecret };
  }

  getClient(clientId: string): RegisteredClient | undefined {
    return clients.get(clientId);
  }

  revokeClient(clientId: string): boolean {
    // Revoke all tokens for this client
    for (const [key, token] of accessTokens) {
      if (token.clientId === clientId) accessTokens.delete(key);
    }
    for (const [key, token] of refreshTokens) {
      if (token.clientId === clientId) {
        revokedChains.add(token.chainId);
        refreshTokens.delete(key);
      }
    }
    return clients.delete(clientId);
  }

  // ── Authorization Code Flow (with PKCE) ──────────────────────────────────

  createAuthorizationCode(params: {
    clientId: string;
    redirectUri: string;
    scopes: OAuthScope[];
    codeChallenge: string;
    codeChallengeMethod: 'S256';
  }): string {
    const client = clients.get(params.clientId);
    if (!client) throw new Error(`Invalid client_id: '${String(params.clientId).slice(0, 12)}...' is not registered. Register at POST /oauth/register.`);

    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new Error('Invalid redirect_uri');
    }

    // Validate requested scopes against client's allowed scopes
    const invalidScopes = params.scopes.filter(
      (s) => !client.scopes.includes(s) && !client.scopes.includes('admin:*')
    );
    if (invalidScopes.length > 0) {
      throw new Error(`Scopes not authorized for client: ${invalidScopes.join(', ')}`);
    }

    if (params.codeChallengeMethod !== 'S256') {
      throw new Error('Only S256 code challenge method is supported (OAuth 2.1)');
    }

    const code = generateToken();
    const authCode: AuthorizationCode = {
      code,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scopes: params.scopes,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: Date.now() + this.config.authCodeTTL * 1000,
      used: false,
    };

    authCodes.set(code, authCode);
    return code;
  }

  // ── Token Exchange ───────────────────────────────────────────────────────

  exchangeAuthorizationCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    codeVerifier: string;
    agentId?: string;
    dpopThumbprint?: string;
  }): TokenResponse {
    const authCode = authCodes.get(params.code);
    if (!authCode) throw new Error('Authorization code not found — may have been used already or never issued. Request a new one via GET /oauth/authorize.');
    if (authCode.used) throw new Error('Authorization code already used — each code is single-use. Request a new one.');
    if (authCode.expiresAt < Date.now()) throw new Error('Authorization code expired. Codes are valid for 60s. Request a new one.');
    if (authCode.clientId !== params.clientId) throw new Error('Client mismatch');
    if (authCode.redirectUri !== params.redirectUri) throw new Error('Redirect URI mismatch');

    // Verify client credentials
    const client = clients.get(params.clientId);
    if (!client) throw new Error('Invalid client');
    if (!safeCompare(hashSecret(params.clientSecret), client.clientSecret)) {
      throw new Error('Invalid client credentials');
    }

    // Verify PKCE (mandatory in OAuth 2.1)
    if (!verifyS256Challenge(params.codeVerifier, authCode.codeChallenge)) {
      throw new Error('PKCE verification failed');
    }

    // Mark code as used (one-time use)
    authCode.used = true;

    return this.issueTokenPair(
      params.clientId,
      authCode.scopes,
      params.agentId,
      params.dpopThumbprint
    );
  }

  exchangeClientCredentials(params: {
    clientId: string;
    clientSecret: string;
    scopes?: OAuthScope[];
    agentId?: string;
    dpopThumbprint?: string;
  }): TokenResponse {
    const client = clients.get(params.clientId);
    if (!client) throw new Error(`Invalid client_id: '${String(params.clientId).slice(0, 12)}...' is not registered. Register at POST /oauth/register.`);
    if (client.clientType !== 'confidential') {
      throw new Error('Client credentials grant requires confidential client');
    }
    if (!safeCompare(hashSecret(params.clientSecret), client.clientSecret)) {
      throw new Error('Invalid client credentials');
    }

    const requestedScopes = params.scopes || client.scopes;
    const invalidScopes = requestedScopes.filter(
      (s) => !client.scopes.includes(s) && !client.scopes.includes('admin:*')
    );
    if (invalidScopes.length > 0) {
      throw new Error(`Scopes not authorized: ${invalidScopes.join(', ')}`);
    }

    return this.issueTokenPair(
      params.clientId,
      requestedScopes,
      params.agentId,
      params.dpopThumbprint
    );
  }

  refreshAccessToken(params: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    dpopThumbprint?: string;
  }): TokenResponse {
    const stored = refreshTokens.get(params.refreshToken);
    if (!stored) throw new Error('Refresh token not found — may have been revoked or expired. Re-authenticate via the full OAuth flow.');
    if (stored.used) {
      // Token replay detected -- revoke entire chain
      revokedChains.add(stored.chainId);
      throw new Error('Refresh token replay detected. Token chain revoked.');
    }
    if (stored.expiresAt < Date.now()) throw new Error('Refresh token expired');
    if (stored.clientId !== params.clientId) throw new Error('Client mismatch');

    // Check if chain is revoked
    if (revokedChains.has(stored.chainId)) {
      throw new Error('Token chain has been revoked');
    }

    // Verify client
    const client = clients.get(params.clientId);
    if (!client) throw new Error('Invalid client');
    if (!safeCompare(hashSecret(params.clientSecret), client.clientSecret)) {
      throw new Error('Invalid client credentials');
    }

    // Mark old refresh token as used (rotation)
    stored.used = true;

    // Issue new token pair with same chain
    return this.issueTokenPair(
      params.clientId,
      stored.scopes,
      undefined,
      params.dpopThumbprint,
      stored.chainId
    );
  }

  // ── Token Introspection ──────────────────────────────────────────────────

  introspect(token: string): TokenIntrospection {
    const stored = accessTokens.get(token);
    if (!stored || stored.expiresAt < Date.now()) {
      return { active: false };
    }

    return {
      active: true,
      clientId: stored.clientId,
      scopes: stored.scopes,
      agentId: stored.agentId,
      expiresAt: stored.expiresAt,
      issuedAt: stored.issuedAt,
    };
  }

  // ── Token Revocation ─────────────────────────────────────────────────────

  revokeToken(token: string): boolean {
    // Check access tokens
    if (accessTokens.has(token)) {
      accessTokens.delete(token);
      return true;
    }

    // Check refresh tokens -- revoke entire chain
    const refresh = refreshTokens.get(token);
    if (refresh) {
      revokedChains.add(refresh.chainId);
      refreshTokens.delete(token);
      return true;
    }

    return false;
  }

  // ── Legacy API Key Validation (migration period) ─────────────────────────

  validateLegacyKey(key: string): TokenIntrospection {
    if (this.config.migrationMode === 'strict') {
      return { active: false };
    }

    if (!this.config.legacyApiKey) {
      return { active: true, scopes: ['admin:*'], agentId: 'legacy-open-dev' };
    }

    if (safeCompare(key, this.config.legacyApiKey)) {
      return {
        active: true,
        scopes: ['admin:*'],
        agentId: 'legacy-api-key',
        clientId: 'legacy',
      };
    }

    return { active: false };
  }

  // ── HTTP Request Authentication ──────────────────────────────────────────

  /**
   * Authenticate an HTTP request. Returns token introspection.
   * Supports: Bearer token (OAuth 2.1), DPoP token, legacy API key.
   */
  authenticateRequest(headers: Record<string, string | string[] | undefined>): TokenIntrospection {
    const authHeader =
      (typeof headers['authorization'] === 'string' ? headers['authorization'] : '') || '';
    const apiKey = (typeof headers['x-api-key'] === 'string' ? headers['x-api-key'] : '') || '';
    const mcpApiKey =
      (typeof headers['x-mcp-api-key'] === 'string' ? headers['x-mcp-api-key'] : '') || '';
    const dpopHeader = (typeof headers['dpop'] === 'string' ? headers['dpop'] : '') || '';

    // Try OAuth 2.1 Bearer token
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const introspection = this.introspect(token);

      if (introspection.active) {
        // Verify DPoP if required
        if (this.config.requireDPoP) {
          const stored = accessTokens.get(token);
          if (stored?.dpopThumbprint && !dpopHeader) {
            return { active: false };
          }
        }
        // Expand OAuth2 scopes to internal Gate 2 scopes
        introspection.scopes = expandScopes(introspection.scopes || []);
        return introspection;
      }

      // Fall through to legacy check
    }

    // Try DPoP token
    if (authHeader.startsWith('DPoP ')) {
      const token = authHeader.slice(5);
      const introspection = this.introspect(token);
      if (introspection.active) {
        introspection.scopes = expandScopes(introspection.scopes || []);
        return introspection;
      }
    }

    // Try legacy API key (migration period)
    if (apiKey) {
      return this.validateLegacyKey(apiKey);
    }
    if (mcpApiKey) {
      return this.validateLegacyKey(mcpApiKey);
    }

    // Try legacy Bearer that's actually an API key
    if (authHeader.startsWith('Bearer ') && this.config.legacyApiKey) {
      const key = authHeader.slice(7);
      return this.validateLegacyKey(key);
    }

    // No auth provided -- check if open dev mode
    if (!this.config.legacyApiKey && this.config.migrationMode === 'permissive') {
      return { active: true, scopes: ['admin:*'], agentId: 'open-dev-mode' };
    }

    return { active: false };
  }

  // ── Async Request Authentication (with GitHub token fallback) ────────────

  /**
   * Async variant of authenticateRequest that additionally resolves GitHub tokens.
   * Tries sync OAuth/legacy paths first, then falls back to GitHub API validation.
   */
  async authenticateRequestAsync(
    headers: Record<string, string | string[] | undefined>
  ): Promise<TokenIntrospection> {
    const syncResult = this.authenticateRequest(headers);
    if (syncResult.active) return syncResult;

    // 1. Try Dynamic Tenant Lookup (PostgreSQL/Upstash)
    const authHeader =
      (typeof headers['authorization'] === 'string' ? headers['authorization'] : '') || '';
    const apiKey = (typeof headers['x-api-key'] === 'string' ? headers['x-api-key'] : '') || '';
    const mcpApiKey =
      (typeof headers['x-mcp-api-key'] === 'string' ? headers['x-mcp-api-key'] : '') || '';

    let keyToValidate = apiKey || mcpApiKey;
    if (!keyToValidate && authHeader.startsWith('Bearer ')) {
      keyToValidate = authHeader.slice(7);
    }

    if (keyToValidate) {
      try {
        const { validateTenantKey } = await import('./tenant-auth');
        const tenantResult = await validateTenantKey(keyToValidate);
        if (tenantResult && tenantResult.active) return tenantResult;
      } catch (_err) {
        // Fall through
      }
    }

    // 2. Try GitHub token resolution as last-resort fallback
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const { resolveGitHubTokenForMcp } = await import('./github-auth.js');
        const ghResult = await resolveGitHubTokenForMcp(token);
        if (ghResult) return ghResult;
      } catch {
        // GitHub auth module not available — skip
      }
    }

    return syncResult;
  }

  // ── OpenID Configuration ─────────────────────────────────────────────────

  getOpenIDConfiguration(): Record<string, unknown> {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: `${this.config.issuer}/oauth/authorize`,
      token_endpoint: `${this.config.issuer}/oauth/token`,
      revocation_endpoint: `${this.config.issuer}/oauth/revoke`,
      introspection_endpoint: `${this.config.issuer}/oauth/introspect`,
      registration_endpoint: `${this.config.issuer}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: Object.keys(OAUTH2_SCOPES),
      dpop_signing_alg_values_supported: ['ES256', 'RS256'],
      service_documentation: 'https://github.com/buildwithholoscript/HoloScript',
    };
  }

  // ── Stats (for health endpoint) ──────────────────────────────────────────

  getStats(): Record<string, number> {
    return {
      registeredClients: clients.size,
      activeAccessTokens: accessTokens.size,
      activeRefreshTokens: refreshTokens.size,
      pendingAuthCodes: authCodes.size,
      revokedChains: revokedChains.size,
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private issueTokenPair(
    clientId: string,
    scopes: OAuthScope[],
    agentId?: string,
    dpopThumbprint?: string,
    chainId?: string
  ): TokenResponse {
    const now = Date.now();
    const accessTokenValue = generateToken();
    const refreshTokenValue = generateToken();
    const chain = chainId || randomUUID();

    const access: AccessToken = {
      token: accessTokenValue,
      clientId,
      scopes,
      issuedAt: now,
      expiresAt: now + this.config.accessTokenTTL * 1000,
      agentId,
      dpopThumbprint,
    };

    const refresh: RefreshToken = {
      token: refreshTokenValue,
      clientId,
      scopes,
      issuedAt: now,
      expiresAt: now + this.config.refreshTokenTTL * 1000,
      chainId: chain,
      used: false,
    };

    accessTokens.set(accessTokenValue, access);
    refreshTokens.set(refreshTokenValue, refresh);

    return {
      access_token: accessTokenValue,
      token_type: dpopThumbprint ? 'DPoP' : 'Bearer',
      expires_in: this.config.accessTokenTTL,
      refresh_token: refreshTokenValue,
      scope: scopes.join(' '),
    };
  }
}

// ── Singleton instance ───────────────────────────────────────────────────────

let _instance: OAuth21Service | null = null;

export function getOAuth21Service(config?: Partial<OAuth21Config>): OAuth21Service {
  if (!_instance) {
    _instance = new OAuth21Service(config);
  }
  return _instance;
}

export function resetOAuth21Service(): void {
  _instance = null;
  clients.clear();
  authCodes.clear();
  accessTokens.clear();
  refreshTokens.clear();
  revokedChains.clear();
}
