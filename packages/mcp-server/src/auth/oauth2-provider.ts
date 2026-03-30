/**
 * OAuth 2.1 Provider for HoloScript MCP Server
 *
 * Implements the full OAuth 2.1 server-side flow per draft-ietf-oauth-v2-1:
 *
 * Endpoints:
 *   GET  /oauth/authorize  — Authorization endpoint (renders consent form / redirects)
 *   POST /oauth/authorize  — Authorization endpoint (processes consent)
 *   POST /oauth/token      — Token endpoint (all grant types)
 *   POST /oauth/introspect — Token introspection (RFC 7662)
 *   POST /oauth/revoke     — Token revocation (RFC 7009)
 *   POST /oauth/register   — Dynamic client registration (RFC 7591)
 *
 * Supported grant types:
 *   - authorization_code (with mandatory PKCE S256)
 *   - client_credentials
 *   - refresh_token (with rotation)
 *
 * Scopes (A2A Agent Card aligned):
 *   tools:read     — Read-only tool access (parse, validate, list, explain)
 *   tools:execute  — Execute tools that generate output (compile, render, generate)
 *   tasks:read     — Read A2A tasks
 *   tasks:write    — Create and manage A2A tasks
 *   admin          — Full administrative access
 *
 * This module layers on top of the existing security/oauth21.ts service,
 * adding HTTP endpoint handlers and the GET /oauth/authorize flow.
 * It uses the new TokenStore backend for pluggable storage.
 *
 * Backwards compatibility:
 *   Legacy API key auth (x-api-key header) is still accepted when
 *   migrationMode is 'permissive' (default).
 */

import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  TokenStore,
  InMemoryTokenStore,
  DEFAULT_TTL,
  type TokenStoreTTL,
  type TokenStoreBackend,
  type StoredAccessToken,
  type StoredClient,
} from './token-store';

// ── Configuration ────────────────────────────────────────────────────────────

export interface OAuth2ProviderConfig {
  /** Issuer identifier (base URL). Default: https://mcp.holoscript.net */
  issuer: string;
  /** Token TTL configuration */
  ttl: TokenStoreTTL;
  /** Token store backend (default: in-memory) */
  backend?: TokenStoreBackend;
  /** Migration mode: 'strict' rejects legacy keys, 'permissive' accepts both */
  migrationMode: 'strict' | 'permissive';
  /** Legacy API key for backwards compatibility */
  legacyApiKey?: string;
  /** Max clients. Default: 1000 */
  maxClients: number;
  /** Require DPoP proof-of-possession. Default: false */
  requireDPoP: boolean;
}

export const DEFAULT_PROVIDER_CONFIG: OAuth2ProviderConfig = {
  issuer: process.env.OAUTH_ISSUER || 'https://mcp.holoscript.net',
  ttl: {
    accessTokenTTL: parseInt(process.env.OAUTH_ACCESS_TTL || '3600', 10),
    refreshTokenTTL: parseInt(process.env.OAUTH_REFRESH_TTL || '2592000', 10),
    authCodeTTL: parseInt(process.env.OAUTH_CODE_TTL || '300', 10),
  },
  migrationMode: (process.env.OAUTH_MIGRATION_MODE as 'strict' | 'permissive') || 'permissive',
  legacyApiKey: process.env.MCP_API_KEY || '',
  maxClients: 1000,
  requireDPoP: process.env.OAUTH_REQUIRE_DPOP === 'true',
};

// ── Scopes ───────────────────────────────────────────────────────────────────

/**
 * OAuth 2.1 scopes aligned with A2A Agent Card securitySchemes.
 *
 * These scopes map to the scopes declared in the A2A agent card's
 * oauth2 securityScheme flows.
 */
export const OAUTH2_SCOPES = {
  'tools:read': 'Read-only access to tool outputs (parse, validate, list, explain, analyze)',
  'tools:execute': 'Execute tools that produce output (compile, render, generate, share)',
  'tasks:read': 'Read A2A task state and history',
  'tasks:write': 'Create, send, and cancel A2A tasks',
  admin: 'Full administrative access to all tools and endpoints',
} as const;

export type OAuth2Scope = keyof typeof OAUTH2_SCOPES;

/**
 * Maps the new scope names to the existing security/oauth21 scope names.
 * This allows the new provider to coexist with the existing Gate 2 authorization.
 */
export const SCOPE_BRIDGE: Record<string, string[]> = {
  'tools:read': ['tools:read'],
  'tools:execute': ['tools:write', 'tools:codebase', 'tools:browser'],
  'tasks:read': ['a2a:tasks', 'scenes:read'],
  'tasks:write': ['a2a:tasks', 'scenes:write'],
  admin: ['admin:*', 'tools:admin'],
};

/**
 * Expand a set of OAuth2 scopes into the internal scope set used by Gate 2.
 */
export function expandScopes(scopes: string[]): string[] {
  const expanded = new Set<string>();
  for (const scope of scopes) {
    if (SCOPE_BRIDGE[scope]) {
      for (const internal of SCOPE_BRIDGE[scope]) {
        expanded.add(internal);
      }
    } else {
      // Pass through unknown scopes (they may be internal scopes directly)
      expanded.add(scope);
    }
  }
  return [...expanded];
}

// ── Token Introspection Result ───────────────────────────────────────────────

export interface TokenIntrospectionResult {
  active: boolean;
  clientId?: string;
  scopes?: string[];
  agentId?: string;
  expiresAt?: number;
  issuedAt?: number;
}

// ── Token Response ───────────────────────────────────────────────────────────

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: 'Bearer' | 'DPoP';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

// ── OAuth 2.1 Provider ───────────────────────────────────────────────────────

export class OAuth2Provider {
  private config: OAuth2ProviderConfig;
  private store: TokenStore;

  constructor(config?: Partial<OAuth2ProviderConfig>) {
    this.config = { ...DEFAULT_PROVIDER_CONFIG, ...config };
    this.store = new TokenStore({
      backend: this.config.backend || new InMemoryTokenStore(),
      ttl: this.config.ttl,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLIENT REGISTRATION (POST /oauth/register)
  // ══════════════════════════════════════════════════════════════════════════

  async registerClient(params: {
    clientName: string;
    redirectUris: string[];
    scopes: string[];
    clientType?: 'confidential' | 'public';
    rateLimit?: number;
  }): Promise<{ clientId: string; clientSecret: string }> {
    return this.store.registerClient({
      ...params,
      maxClients: this.config.maxClients,
    });
  }

  async getClient(clientId: string): Promise<StoredClient | undefined> {
    return this.store.getClient(clientId);
  }

  async revokeClient(clientId: string): Promise<boolean> {
    return this.store.revokeClient(clientId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTHORIZATION ENDPOINT (GET + POST /oauth/authorize)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Handle GET /oauth/authorize
   *
   * In a full implementation this would render an HTML consent page.
   * For machine-to-machine MCP usage, we return a JSON description
   * of the authorization request that the client can use to proceed
   * via POST /oauth/authorize.
   *
   * Query parameters:
   *   response_type=code (required)
   *   client_id (required)
   *   redirect_uri (required)
   *   scope (space-separated)
   *   state (recommended, opaque to server)
   *   code_challenge (required, PKCE)
   *   code_challenge_method=S256 (required)
   */
  async handleAuthorizeGet(query: URLSearchParams): Promise<{
    status: number;
    body: Record<string, unknown>;
  }> {
    const responseType = query.get('response_type');
    const clientId = query.get('client_id');
    const redirectUri = query.get('redirect_uri');
    const scope = query.get('scope') || 'tools:read';
    const state = query.get('state');
    const codeChallenge = query.get('code_challenge');
    const codeChallengeMethod = query.get('code_challenge_method');

    // Validate required parameters
    if (responseType !== 'code') {
      return {
        status: 400,
        body: {
          error: 'unsupported_response_type',
          error_description: 'Only response_type=code is supported (OAuth 2.1)',
        },
      };
    }

    if (!clientId) {
      return {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description: 'Missing required parameter: client_id',
        },
      };
    }

    if (!redirectUri) {
      return {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description: 'Missing required parameter: redirect_uri',
        },
      };
    }

    if (!codeChallenge || codeChallengeMethod !== 'S256') {
      return {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description:
            'PKCE is mandatory. Provide code_challenge with code_challenge_method=S256',
        },
      };
    }

    // Validate client
    const client = await this.store.getClient(clientId);
    if (!client) {
      return {
        status: 400,
        body: {
          error: 'invalid_client',
          error_description: 'Unknown client_id. Register via POST /oauth/register first.',
        },
      };
    }

    if (!client.redirectUris.includes(redirectUri)) {
      return {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description: `redirect_uri "${redirectUri}" is not registered for this client`,
        },
      };
    }

    const requestedScopes = scope.split(' ').filter(Boolean);
    const invalidScopes = requestedScopes.filter(
      (s) => !client.scopes.includes(s) && !client.scopes.includes('admin')
    );

    if (invalidScopes.length > 0) {
      return {
        status: 400,
        body: {
          error: 'invalid_scope',
          error_description: `Scopes not authorized for client: ${invalidScopes.join(', ')}`,
        },
      };
    }

    // Return authorization request details
    // In a browser-based flow this would render HTML.
    // For MCP/agent usage, return JSON that the client can POST to complete.
    return {
      status: 200,
      body: {
        authorization_request: {
          client_id: clientId,
          client_name: client.clientName,
          redirect_uri: redirectUri,
          scope: requestedScopes.join(' '),
          state: state || undefined,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          available_scopes: Object.entries(OAUTH2_SCOPES).map(([name, description]) => ({
            name,
            description,
            requested: requestedScopes.includes(name),
          })),
        },
        instructions:
          'POST to /oauth/authorize with the same parameters to obtain an authorization code.',
        _links: {
          authorize: `${this.config.issuer}/oauth/authorize`,
          token: `${this.config.issuer}/oauth/token`,
          register: `${this.config.issuer}/oauth/register`,
        },
      },
    };
  }

  /**
   * Handle POST /oauth/authorize
   *
   * Creates an authorization code with PKCE binding.
   * The client exchanges this code at POST /oauth/token.
   */
  async handleAuthorizePost(body: Record<string, unknown>): Promise<{
    status: number;
    body: Record<string, unknown>;
  }> {
    const clientId = body.client_id as string;
    const redirectUri = body.redirect_uri as string;
    const scope = ((body.scope as string) || 'tools:read').split(' ').filter(Boolean);
    const codeChallenge = body.code_challenge as string;
    const codeChallengeMethod = body.code_challenge_method as string;
    const state = body.state as string | undefined;

    if (!clientId || !redirectUri || !codeChallenge) {
      return {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description: 'Missing required parameters: client_id, redirect_uri, code_challenge',
        },
      };
    }

    if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
      return {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description: 'Only S256 code challenge method is supported (OAuth 2.1)',
        },
      };
    }

    // Validate client
    const client = await this.store.getClient(clientId);
    if (!client) {
      return {
        status: 400,
        body: { error: 'invalid_client', error_description: 'Unknown client_id' },
      };
    }

    if (!client.redirectUris.includes(redirectUri)) {
      return {
        status: 400,
        body: { error: 'invalid_request', error_description: 'Invalid redirect_uri' },
      };
    }

    // Validate scopes
    const invalidScopes = scope.filter(
      (s) => !client.scopes.includes(s) && !client.scopes.includes('admin')
    );
    if (invalidScopes.length > 0) {
      return {
        status: 400,
        body: {
          error: 'invalid_scope',
          error_description: `Scopes not authorized for client: ${invalidScopes.join(', ')}`,
        },
      };
    }

    // Create authorization code
    const authCode = await this.store.createAuthorizationCode({
      clientId,
      redirectUri,
      scopes: scope,
      codeChallenge,
      codeChallengeMethod: 'S256',
    });

    return {
      status: 200,
      body: {
        code: authCode.code,
        state: state || undefined,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOKEN ENDPOINT (POST /oauth/token)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Handle POST /oauth/token
   *
   * Supports grant_type:
   *   - authorization_code (exchanges code + PKCE verifier for tokens)
   *   - client_credentials (server-to-server, confidential clients only)
   *   - refresh_token (token rotation)
   */
  async handleToken(
    body: Record<string, unknown>,
    dpopHeader?: string
  ): Promise<{
    status: number;
    body: Record<string, unknown>;
    headers?: Record<string, string>;
  }> {
    const grantType = body.grant_type as string;

    switch (grantType) {
      case 'authorization_code':
        return this.handleAuthorizationCodeGrant(body, dpopHeader);
      case 'client_credentials':
        return this.handleClientCredentialsGrant(body, dpopHeader);
      case 'refresh_token':
        return this.handleRefreshTokenGrant(body, dpopHeader);
      default:
        return {
          status: 400,
          body: {
            error: 'unsupported_grant_type',
            error_description: `Grant type "${grantType}" is not supported. Use authorization_code, client_credentials, or refresh_token.`,
          },
        };
    }
  }

  private async handleAuthorizationCodeGrant(
    body: Record<string, unknown>,
    dpopHeader?: string
  ): Promise<{ status: number; body: Record<string, unknown>; headers?: Record<string, string> }> {
    const code = body.code as string;
    const clientId = body.client_id as string;
    const clientSecret = body.client_secret as string;
    const redirectUri = body.redirect_uri as string;
    const codeVerifier = body.code_verifier as string;
    const agentId = body.agent_id as string | undefined;

    if (!code || !clientId || !clientSecret || !redirectUri || !codeVerifier) {
      return {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description:
            'Missing required parameters: code, client_id, client_secret, redirect_uri, code_verifier',
        },
      };
    }

    // Validate authorization code
    const authCode = await this.store.getAuthorizationCode(code);
    if (!authCode) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Invalid authorization code' },
      };
    }
    if (authCode.used) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Authorization code already used' },
      };
    }
    if (authCode.expiresAt < Date.now()) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Authorization code expired' },
      };
    }
    if (authCode.clientId !== clientId) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Client mismatch' },
      };
    }
    if (authCode.redirectUri !== redirectUri) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Redirect URI mismatch' },
      };
    }

    // Verify client credentials
    const client = await this.store.getClient(clientId);
    if (!client) {
      return {
        status: 400,
        body: { error: 'invalid_client', error_description: 'Invalid client' },
      };
    }
    if (!this.store.safeCompare(this.store.hashSecret(clientSecret), client.clientSecretHash)) {
      return {
        status: 400,
        body: { error: 'invalid_client', error_description: 'Invalid client credentials' },
      };
    }

    // Verify PKCE (mandatory in OAuth 2.1)
    if (!this.store.verifyS256Challenge(codeVerifier, authCode.codeChallenge)) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'PKCE verification failed' },
      };
    }

    // Mark code as used
    await this.store.markAuthorizationCodeUsed(code);

    // Issue token pair
    const { accessToken, refreshToken } = await this.store.issueTokenPair({
      clientId,
      scopes: authCode.scopes,
      agentId,
      dpopThumbprint: dpopHeader,
    });

    const response = this.formatTokenResponse(accessToken, refreshToken, dpopHeader);
    return {
      status: 200,
      body: response,
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    };
  }

  private async handleClientCredentialsGrant(
    body: Record<string, unknown>,
    dpopHeader?: string
  ): Promise<{ status: number; body: Record<string, unknown>; headers?: Record<string, string> }> {
    const clientId = body.client_id as string;
    const clientSecret = body.client_secret as string;
    const requestedScopes = ((body.scope as string) || '').split(' ').filter(Boolean);
    const agentId = body.agent_id as string | undefined;

    if (!clientId || !clientSecret) {
      return {
        status: 400,
        body: { error: 'invalid_request', error_description: 'Missing client_id or client_secret' },
      };
    }

    const client = await this.store.getClient(clientId);
    if (!client) {
      return {
        status: 400,
        body: { error: 'invalid_client', error_description: 'Unknown client_id' },
      };
    }
    if (client.clientType !== 'confidential') {
      return {
        status: 400,
        body: {
          error: 'unauthorized_client',
          error_description: 'Client credentials grant requires confidential client',
        },
      };
    }
    if (!this.store.safeCompare(this.store.hashSecret(clientSecret), client.clientSecretHash)) {
      return {
        status: 400,
        body: { error: 'invalid_client', error_description: 'Invalid client credentials' },
      };
    }

    const scopes = requestedScopes.length > 0 ? requestedScopes : client.scopes;
    const invalidScopes = scopes.filter(
      (s) => !client.scopes.includes(s) && !client.scopes.includes('admin')
    );
    if (invalidScopes.length > 0) {
      return {
        status: 400,
        body: {
          error: 'invalid_scope',
          error_description: `Scopes not authorized: ${invalidScopes.join(', ')}`,
        },
      };
    }

    const { accessToken, refreshToken } = await this.store.issueTokenPair({
      clientId,
      scopes,
      agentId,
      dpopThumbprint: dpopHeader,
    });

    const response = this.formatTokenResponse(accessToken, refreshToken, dpopHeader);
    return {
      status: 200,
      body: response,
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    };
  }

  private async handleRefreshTokenGrant(
    body: Record<string, unknown>,
    dpopHeader?: string
  ): Promise<{ status: number; body: Record<string, unknown>; headers?: Record<string, string> }> {
    const refreshTokenValue = body.refresh_token as string;
    const clientId = body.client_id as string;
    const clientSecret = body.client_secret as string;

    if (!refreshTokenValue || !clientId || !clientSecret) {
      return {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description: 'Missing refresh_token, client_id, or client_secret',
        },
      };
    }

    const storedRefresh = await this.store.getRefreshToken(refreshTokenValue);
    if (!storedRefresh) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Invalid refresh token' },
      };
    }

    if (storedRefresh.used) {
      // Token replay detected -- revoke entire chain
      await this.store.revokeRefreshChain(storedRefresh.chainId);
      return {
        status: 400,
        body: {
          error: 'invalid_grant',
          error_description: 'Refresh token replay detected. Token chain revoked.',
        },
      };
    }

    if (storedRefresh.expiresAt < Date.now()) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Refresh token expired' },
      };
    }

    if (storedRefresh.clientId !== clientId) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Client mismatch' },
      };
    }

    // Check if chain is revoked
    const chainRevoked = await this.store.isChainRevoked(storedRefresh.chainId);
    if (chainRevoked) {
      return {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Token chain has been revoked' },
      };
    }

    // Verify client
    const client = await this.store.getClient(clientId);
    if (!client) {
      return {
        status: 400,
        body: { error: 'invalid_client', error_description: 'Invalid client' },
      };
    }
    if (!this.store.safeCompare(this.store.hashSecret(clientSecret), client.clientSecretHash)) {
      return {
        status: 400,
        body: { error: 'invalid_client', error_description: 'Invalid client credentials' },
      };
    }

    // Mark old refresh token as used (rotation)
    await this.store.markRefreshTokenUsed(refreshTokenValue);

    // Issue new token pair with same chain
    const { accessToken, refreshToken } = await this.store.issueTokenPair({
      clientId,
      scopes: storedRefresh.scopes,
      dpopThumbprint: dpopHeader,
      chainId: storedRefresh.chainId,
    });

    const response = this.formatTokenResponse(accessToken, refreshToken, dpopHeader);
    return {
      status: 200,
      body: response,
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOKEN INTROSPECTION (POST /oauth/introspect) — RFC 7662
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Handle POST /oauth/introspect
   *
   * Returns token metadata per RFC 7662. The response always includes
   * `active` (boolean). When active=true, also includes client_id,
   * scope, agent_id, exp, and iat.
   */
  async handleIntrospect(body: Record<string, unknown>): Promise<{
    status: number;
    body: Record<string, unknown>;
  }> {
    const token = body.token as string;
    if (!token) {
      return {
        status: 400,
        body: { error: 'invalid_request', error_description: 'Missing required parameter: token' },
      };
    }

    const result = await this.introspect(token);

    return {
      status: 200,
      body: {
        active: result.active,
        client_id: result.clientId,
        scope: result.scopes?.join(' '),
        agent_id: result.agentId,
        token_type: 'Bearer',
        exp: result.expiresAt ? Math.floor(result.expiresAt / 1000) : undefined,
        iat: result.issuedAt ? Math.floor(result.issuedAt / 1000) : undefined,
        iss: this.config.issuer,
      },
    };
  }

  /**
   * Introspect a token (internal API).
   */
  async introspect(token: string): Promise<TokenIntrospectionResult> {
    const stored = await this.store.getAccessToken(token);
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

  // ══════════════════════════════════════════════════════════════════════════
  // TOKEN REVOCATION (POST /oauth/revoke) — RFC 7009
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Handle POST /oauth/revoke
   *
   * Per RFC 7009, always returns 200 even if the token was not found.
   */
  async handleRevoke(body: Record<string, unknown>): Promise<{
    status: number;
    body: Record<string, unknown>;
  }> {
    const token = body.token as string;
    if (!token) {
      return {
        status: 400,
        body: { error: 'invalid_request', error_description: 'Missing required parameter: token' },
      };
    }

    const revoked = await this.revokeToken(token);
    return {
      status: 200,
      body: { revoked },
    };
  }

  /**
   * Revoke a token (access or refresh).
   */
  async revokeToken(token: string): Promise<boolean> {
    // Try access token
    const deleted = await this.store.revokeAccessToken(token);
    if (deleted) return true;

    // Try refresh token -- revoke entire chain
    const refresh = await this.store.getRefreshToken(token);
    if (refresh) {
      await this.store.revokeRefreshChain(refresh.chainId);
      return true;
    }

    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HTTP REQUEST AUTHENTICATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Authenticate an HTTP request from headers.
   *
   * Supports:
   *   1. OAuth 2.1 Bearer token (Authorization: Bearer <token>)
   *   2. DPoP token (Authorization: DPoP <token>)
   *   3. Legacy API key (x-api-key header)
   *   4. Legacy Bearer API key (Authorization: Bearer <api-key>)
   *   5. Open dev mode (no auth, permissive mode, no API key configured)
   */
  async authenticateRequest(
    headers: Record<string, string | string[] | undefined>
  ): Promise<TokenIntrospectionResult> {
    const authHeader =
      (typeof headers['authorization'] === 'string' ? headers['authorization'] : '') || '';
    const apiKey = (typeof headers['x-api-key'] === 'string' ? headers['x-api-key'] : '') || '';
    const dpopHeader = (typeof headers['dpop'] === 'string' ? headers['dpop'] : '') || '';

    // Try OAuth 2.1 Bearer token
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const result = await this.introspect(token);

      if (result.active) {
        // Verify DPoP if required
        if (this.config.requireDPoP) {
          const stored = await this.store.getAccessToken(token);
          if (stored?.dpopThumbprint && !dpopHeader) {
            return { active: false };
          }
        }
        // Expand scopes for Gate 2 compatibility
        result.scopes = expandScopes(result.scopes || []);
        return result;
      }

      // Fall through to legacy check
    }

    // Try DPoP token
    if (authHeader.startsWith('DPoP ')) {
      const token = authHeader.slice(5);
      const result = await this.introspect(token);
      if (result.active) {
        result.scopes = expandScopes(result.scopes || []);
        return result;
      }
    }

    // Try legacy API key
    if (apiKey) {
      return this.validateLegacyKey(apiKey);
    }

    // Try legacy Bearer that's actually an API key
    if (authHeader.startsWith('Bearer ') && this.config.legacyApiKey) {
      const key = authHeader.slice(7);
      return this.validateLegacyKey(key);
    }

    // No auth provided - check if open dev mode
    if (!this.config.legacyApiKey && this.config.migrationMode === 'permissive') {
      return { active: true, scopes: ['admin:*'], agentId: 'open-dev-mode' };
    }

    return { active: false };
  }

  /**
   * Validate a legacy API key during the migration period.
   */
  private validateLegacyKey(key: string): TokenIntrospectionResult {
    if (this.config.migrationMode === 'strict') {
      return { active: false };
    }

    if (!this.config.legacyApiKey) {
      return { active: true, scopes: ['admin:*'], agentId: 'legacy-open-dev' };
    }

    if (this.safeCompare(key, this.config.legacyApiKey)) {
      return {
        active: true,
        scopes: ['admin:*'],
        agentId: 'legacy-api-key',
        clientId: 'legacy',
      };
    }

    return { active: false };
  }

  private safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OPENID CONFIGURATION (GET /.well-known/openid-configuration)
  // ══════════════════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════════════════
  // STATS & LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════════

  async getStats(): Promise<Record<string, number>> {
    const stats = await this.store.getStats();
    return {
      registeredClients: stats.registeredClients,
      activeAccessTokens: stats.activeAccessTokens,
      activeRefreshTokens: stats.activeRefreshTokens,
      pendingAuthCodes: stats.pendingAuthCodes,
      revokedChains: stats.revokedChains,
    };
  }

  /** Expose the underlying store for advanced usage */
  getStore(): TokenStore {
    return this.store;
  }

  /** Clean up resources */
  destroy(): void {
    this.store.destroy();
  }

  // ── Internal Helpers ───────────────────────────────────────────────────

  private formatTokenResponse(
    accessToken: StoredAccessToken,
    refreshToken: { token: string },
    dpopHeader?: string
  ): OAuth2TokenResponse {
    return {
      access_token: accessToken.token,
      token_type: dpopHeader ? 'DPoP' : 'Bearer',
      expires_in: this.config.ttl.accessTokenTTL,
      refresh_token: refreshToken.token,
      scope: accessToken.scopes.join(' '),
    };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _provider: OAuth2Provider | null = null;

/**
 * Get or create the singleton OAuth2Provider instance.
 */
export function getOAuth2Provider(config?: Partial<OAuth2ProviderConfig>): OAuth2Provider {
  if (!_provider) {
    _provider = new OAuth2Provider(config);
  }
  return _provider;
}

/**
 * Reset the singleton (for tests).
 */
export function resetOAuth2Provider(): void {
  _provider?.destroy();
  _provider = null;
}
