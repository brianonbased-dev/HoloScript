/**
 * OAuth 2.1 Provider & Token Store Tests
 *
 * Comprehensive test coverage for:
 * 1. TokenStore — in-memory backend, pluggable interface, TTL, cleanup
 * 2. OAuth2Provider — registration, authorization_code + PKCE, client_credentials,
 *    refresh_token rotation, introspection (RFC 7662), revocation (RFC 7009)
 * 3. Scope bridging — new scopes map to legacy Gate 2 scopes
 * 4. GET /oauth/authorize — authorization request validation
 * 5. Legacy API key backwards compatibility
 * 6. Token TTL configuration (access: 1hr, refresh: 30d)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import {
  TokenStore,
  InMemoryTokenStore,
  DEFAULT_TTL,
  type TokenStoreBackend,
} from '../auth/token-store';
import {
  OAuth2Provider,
  resetOAuth2Provider,
  OAUTH2_SCOPES,
  SCOPE_BRIDGE,
  expandScopes,
} from '../auth/oauth2-provider';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Token Store — In-Memory Backend
// ═══════════════════════════════════════════════════════════════════════════════

describe('InMemoryTokenStore', () => {
  let backend: InMemoryTokenStore;

  beforeEach(() => {
    backend = new InMemoryTokenStore();
  });

  describe('Access Tokens', () => {
    it('should store and retrieve access tokens', async () => {
      const token = {
        token: 'test-access-token',
        clientId: 'client-1',
        scopes: ['tools:read'],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };

      await backend.setAccessToken(token);
      const retrieved = await backend.getAccessToken('test-access-token');
      expect(retrieved).toBeDefined();
      expect(retrieved!.clientId).toBe('client-1');
      expect(retrieved!.scopes).toEqual(['tools:read']);
    });

    it('should return undefined for expired tokens', async () => {
      const token = {
        token: 'expired-token',
        clientId: 'client-1',
        scopes: ['tools:read'],
        issuedAt: Date.now() - 7200000,
        expiresAt: Date.now() - 3600000, // Expired 1 hour ago
      };

      await backend.setAccessToken(token);
      const retrieved = await backend.getAccessToken('expired-token');
      expect(retrieved).toBeUndefined();
    });

    it('should delete access tokens', async () => {
      await backend.setAccessToken({
        token: 'to-delete',
        clientId: 'client-1',
        scopes: [],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const deleted = await backend.deleteAccessToken('to-delete');
      expect(deleted).toBe(true);
      expect(await backend.getAccessToken('to-delete')).toBeUndefined();
    });

    it('should delete all tokens for a client', async () => {
      for (let i = 0; i < 3; i++) {
        await backend.setAccessToken({
          token: `token-${i}`,
          clientId: 'client-x',
          scopes: [],
          issuedAt: Date.now(),
          expiresAt: Date.now() + 3600000,
        });
      }

      const count = await backend.deleteAccessTokensByClient('client-x');
      expect(count).toBe(3);
    });
  });

  describe('Refresh Tokens', () => {
    it('should store and retrieve refresh tokens', async () => {
      await backend.setRefreshToken({
        token: 'refresh-1',
        clientId: 'client-1',
        scopes: ['tools:read'],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 2592000000,
        chainId: 'chain-1',
        used: false,
      });

      const retrieved = await backend.getRefreshToken('refresh-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.chainId).toBe('chain-1');
      expect(retrieved!.used).toBe(false);
    });

    it('should mark refresh tokens as used', async () => {
      await backend.setRefreshToken({
        token: 'refresh-to-use',
        clientId: 'client-1',
        scopes: [],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 2592000000,
        chainId: 'chain-2',
        used: false,
      });

      await backend.markRefreshTokenUsed('refresh-to-use');
      const retrieved = await backend.getRefreshToken('refresh-to-use');
      expect(retrieved!.used).toBe(true);
    });
  });

  describe('Authorization Codes', () => {
    it('should store and retrieve auth codes', async () => {
      await backend.setAuthorizationCode({
        code: 'auth-code-1',
        clientId: 'client-1',
        redirectUri: 'https://example.com/cb',
        scopes: ['tools:read'],
        codeChallenge: 'challenge123',
        codeChallengeMethod: 'S256',
        expiresAt: Date.now() + 300000,
        used: false,
      });

      const retrieved = await backend.getAuthorizationCode('auth-code-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.codeChallenge).toBe('challenge123');
    });

    it('should return undefined for expired codes', async () => {
      await backend.setAuthorizationCode({
        code: 'expired-code',
        clientId: 'client-1',
        redirectUri: 'https://example.com/cb',
        scopes: [],
        codeChallenge: 'c',
        codeChallengeMethod: 'S256',
        expiresAt: Date.now() - 1000,
        used: false,
      });

      expect(await backend.getAuthorizationCode('expired-code')).toBeUndefined();
    });
  });

  describe('Clients', () => {
    it('should store and retrieve clients', async () => {
      await backend.setClient({
        clientId: 'hsc_test',
        clientSecretHash: 'hash123',
        clientName: 'test-client',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read', 'tools:execute'],
        createdAt: Date.now(),
        clientType: 'confidential',
        rateLimit: 60,
      });

      const client = await backend.getClient('hsc_test');
      expect(client).toBeDefined();
      expect(client!.clientName).toBe('test-client');
      expect(client!.clientType).toBe('confidential');
    });

    it('should count clients', async () => {
      await backend.setClient({
        clientId: 'c1', clientSecretHash: 'h', clientName: 'a',
        redirectUris: [], scopes: [], createdAt: Date.now(),
        clientType: 'confidential', rateLimit: 60,
      });
      await backend.setClient({
        clientId: 'c2', clientSecretHash: 'h', clientName: 'b',
        redirectUris: [], scopes: [], createdAt: Date.now(),
        clientType: 'confidential', rateLimit: 60,
      });

      expect(await backend.countClients()).toBe(2);
    });
  });

  describe('Revoked Chains', () => {
    it('should track revoked chains', async () => {
      expect(await backend.isChainRevoked('chain-1')).toBe(false);
      await backend.revokeChain('chain-1');
      expect(await backend.isChainRevoked('chain-1')).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should remove expired entries', async () => {
      // Add expired access token
      await backend.setAccessToken({
        token: 'expired-at',
        clientId: 'c',
        scopes: [],
        issuedAt: Date.now() - 7200000,
        expiresAt: Date.now() - 3600000,
      });

      // Add valid access token
      await backend.setAccessToken({
        token: 'valid-at',
        clientId: 'c',
        scopes: [],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Add used auth code
      await backend.setAuthorizationCode({
        code: 'used-code',
        clientId: 'c',
        redirectUri: 'https://example.com/cb',
        scopes: [],
        codeChallenge: 'c',
        codeChallengeMethod: 'S256',
        expiresAt: Date.now() + 300000,
        used: true,
      });

      const removed = await backend.cleanup();
      expect(removed).toBeGreaterThanOrEqual(2); // expired token + used code

      const stats = await backend.getStats();
      expect(stats.activeAccessTokens).toBe(1); // Only valid one remains
    });
  });

  describe('Clear', () => {
    it('should clear all data', async () => {
      await backend.setClient({
        clientId: 'c1', clientSecretHash: 'h', clientName: 'a',
        redirectUris: [], scopes: [], createdAt: Date.now(),
        clientType: 'confidential', rateLimit: 60,
      });
      await backend.setAccessToken({
        token: 'at', clientId: 'c1', scopes: [],
        issuedAt: Date.now(), expiresAt: Date.now() + 3600000,
      });

      backend.clear();

      const stats = await backend.getStats();
      expect(stats.registeredClients).toBe(0);
      expect(stats.activeAccessTokens).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. TokenStore — Wrapper with TTL and helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore({ cleanupIntervalMs: 0 }); // Disable auto cleanup in tests
  });

  afterEach(() => {
    store.destroy();
  });

  describe('TTL Configuration', () => {
    it('should use default TTL values', () => {
      expect(store.ttl.accessTokenTTL).toBe(3600);    // 1 hour
      expect(store.ttl.refreshTokenTTL).toBe(2592000); // 30 days
      expect(store.ttl.authCodeTTL).toBe(300);         // 5 minutes
    });

    it('should accept custom TTL values', () => {
      const custom = new TokenStore({
        ttl: { accessTokenTTL: 1800, refreshTokenTTL: 86400, authCodeTTL: 120 },
        cleanupIntervalMs: 0,
      });

      expect(custom.ttl.accessTokenTTL).toBe(1800);
      expect(custom.ttl.refreshTokenTTL).toBe(86400);
      expect(custom.ttl.authCodeTTL).toBe(120);

      custom.destroy();
    });
  });

  describe('Token Generation', () => {
    it('should generate tokens with hs_ prefix', () => {
      const token = store.generateToken();
      expect(token).toMatch(/^hs_[a-f0-9]{64}$/);
    });

    it('should generate client IDs with hsc_ prefix', () => {
      const clientId = store.generateClientId();
      expect(clientId).toMatch(/^hsc_[a-f0-9]{32}$/);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(store.generateToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('PKCE S256 Challenge', () => {
    it('should verify correct S256 challenge', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = createHash('sha256').update(verifier).digest('base64url');

      expect(store.verifyS256Challenge(verifier, challenge)).toBe(true);
    });

    it('should reject incorrect verifier', () => {
      const challenge = createHash('sha256').update('correct-verifier').digest('base64url');
      expect(store.verifyS256Challenge('wrong-verifier', challenge)).toBe(false);
    });
  });

  describe('Token Pair Issuance', () => {
    it('should issue access + refresh token pair', async () => {
      const { accessToken, refreshToken } = await store.issueTokenPair({
        clientId: 'client-1',
        scopes: ['tools:read', 'tools:execute'],
        agentId: 'my-agent',
      });

      expect(accessToken.token).toMatch(/^hs_/);
      expect(refreshToken.token).toMatch(/^hs_/);
      expect(accessToken.clientId).toBe('client-1');
      expect(accessToken.scopes).toEqual(['tools:read', 'tools:execute']);
      expect(accessToken.agentId).toBe('my-agent');
      expect(refreshToken.chainId).toBeTruthy();
      expect(refreshToken.used).toBe(false);
    });

    it('should set correct expiry based on TTL', async () => {
      const now = Date.now();
      const { accessToken, refreshToken } = await store.issueTokenPair({
        clientId: 'client-1',
        scopes: ['tools:read'],
      });

      // Access token: 1 hour (3600s)
      expect(accessToken.expiresAt).toBeGreaterThan(now + 3599000);
      expect(accessToken.expiresAt).toBeLessThan(now + 3601000);

      // Refresh token: 30 days (2592000s)
      expect(refreshToken.expiresAt).toBeGreaterThan(now + 2591999000);
      expect(refreshToken.expiresAt).toBeLessThan(now + 2592001000);
    });
  });

  describe('Client Registration', () => {
    it('should register a client and return credentials', async () => {
      const { clientId, clientSecret } = await store.registerClient({
        clientName: 'test-app',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read', 'tools:execute'],
      });

      expect(clientId).toMatch(/^hsc_/);
      expect(clientSecret).toMatch(/^hs_/);

      const client = await store.getClient(clientId);
      expect(client).toBeDefined();
      expect(client!.clientName).toBe('test-app');
      expect(client!.clientType).toBe('confidential');
    });

    it('should enforce max client limit', async () => {
      // Register up to limit
      for (let i = 0; i < 3; i++) {
        await store.registerClient({
          clientName: `client-${i}`,
          redirectUris: [],
          scopes: ['tools:read'],
          maxClients: 3,
        });
      }

      // Exceeding limit should throw
      await expect(
        store.registerClient({
          clientName: 'one-too-many',
          redirectUris: [],
          scopes: ['tools:read'],
          maxClients: 3,
        })
      ).rejects.toThrow('Maximum client registration limit reached');
    });
  });

  describe('Client Revocation', () => {
    it('should revoke client and all its tokens', async () => {
      const { clientId, clientSecret } = await store.registerClient({
        clientName: 'disposable',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      // Issue tokens
      const { accessToken } = await store.issueTokenPair({
        clientId,
        scopes: ['tools:read'],
      });

      // Verify token works
      const retrieved = await store.getAccessToken(accessToken.token);
      expect(retrieved).toBeDefined();

      // Revoke client
      const revoked = await store.revokeClient(clientId);
      expect(revoked).toBe(true);

      // Token should be gone
      expect(await store.getAccessToken(accessToken.token)).toBeUndefined();
      expect(await store.getClient(clientId)).toBeUndefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. OAuth2Provider — Full Flow Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('OAuth2Provider', () => {
  let provider: OAuth2Provider;

  beforeEach(() => {
    resetOAuth2Provider();
    provider = new OAuth2Provider({
      issuer: 'https://mcp.holoscript.net',
      migrationMode: 'permissive',
      legacyApiKey: 'test-legacy-key',
    });
  });

  afterEach(() => {
    provider.destroy();
    resetOAuth2Provider();
  });

  // ── Client Registration ─────────────────────────────────────────────────

  describe('Client Registration', () => {
    it('should register a confidential client', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'test-agent',
        redirectUris: ['https://example.com/callback'],
        scopes: ['tools:read', 'tools:execute'],
      });

      expect(clientId).toMatch(/^hsc_/);
      expect(clientSecret).toMatch(/^hs_/);

      const client = await provider.getClient(clientId);
      expect(client).toBeDefined();
      expect(client!.clientName).toBe('test-agent');
      expect(client!.clientType).toBe('confidential');
    });

    it('should register a public client', async () => {
      const { clientId } = await provider.registerClient({
        clientName: 'spa-app',
        redirectUris: ['https://app.holoscript.net/cb'],
        scopes: ['tools:read'],
        clientType: 'public',
      });

      const client = await provider.getClient(clientId);
      expect(client!.clientType).toBe('public');
    });
  });

  // ── Authorization Code Flow (PKCE) ─────────────────────────────────────

  describe('Authorization Code Flow (PKCE)', () => {
    it('should complete full PKCE authorization_code flow', async () => {
      // Register client
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'pkce-test',
        redirectUris: ['https://example.com/callback'],
        scopes: ['tools:read', 'tools:execute'],
      });

      // Generate PKCE challenge
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

      // Step 1: POST /oauth/authorize
      const authResult = await provider.handleAuthorizePost({
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'tools:read',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'random-state',
      });

      expect(authResult.status).toBe(200);
      expect(authResult.body.code).toBeTruthy();
      expect(authResult.body.state).toBe('random-state');

      // Step 2: POST /oauth/token (exchange code)
      const tokenResult = await provider.handleToken({
        grant_type: 'authorization_code',
        code: authResult.body.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://example.com/callback',
        code_verifier: codeVerifier,
        agent_id: 'my-test-agent',
      });

      expect(tokenResult.status).toBe(200);
      expect(tokenResult.body.access_token).toBeTruthy();
      expect(tokenResult.body.refresh_token).toBeTruthy();
      expect(tokenResult.body.token_type).toBe('Bearer');
      expect(tokenResult.body.expires_in).toBe(3600);
      expect(tokenResult.body.scope).toBe('tools:read');
    });

    it('should reject authorization code reuse', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'reuse-test',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read'],
      });

      const codeVerifier = 'test-verifier-string-long-enough-for-testing';
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

      const authResult = await provider.handleAuthorizePost({
        client_id: clientId,
        redirect_uri: 'https://example.com/cb',
        scope: 'tools:read',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      // First use: succeeds
      const firstToken = await provider.handleToken({
        grant_type: 'authorization_code',
        code: authResult.body.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://example.com/cb',
        code_verifier: codeVerifier,
      });
      expect(firstToken.status).toBe(200);

      // Second use: fails
      const secondToken = await provider.handleToken({
        grant_type: 'authorization_code',
        code: authResult.body.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://example.com/cb',
        code_verifier: codeVerifier,
      });
      expect(secondToken.status).toBe(400);
      expect(secondToken.body.error_description).toContain('already used');
    });

    it('should reject wrong PKCE verifier', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'pkce-fail',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read'],
      });

      const codeChallenge = createHash('sha256').update('correct-verifier').digest('base64url');

      const authResult = await provider.handleAuthorizePost({
        client_id: clientId,
        redirect_uri: 'https://example.com/cb',
        scope: 'tools:read',
        code_challenge: codeChallenge,
      });

      const tokenResult = await provider.handleToken({
        grant_type: 'authorization_code',
        code: authResult.body.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://example.com/cb',
        code_verifier: 'wrong-verifier',
      });

      expect(tokenResult.status).toBe(400);
      expect(tokenResult.body.error_description).toContain('PKCE verification failed');
    });

    it('should reject invalid redirect URI', async () => {
      const { clientId } = await provider.registerClient({
        clientName: 'redirect-test',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read'],
      });

      const codeChallenge = createHash('sha256').update('v').digest('base64url');

      const result = await provider.handleAuthorizePost({
        client_id: clientId,
        redirect_uri: 'https://evil.com/cb',
        scope: 'tools:read',
        code_challenge: codeChallenge,
      });

      expect(result.status).toBe(400);
      expect(result.body.error_description).toContain('Invalid redirect_uri');
    });
  });

  // ── Client Credentials Flow ─────────────────────────────────────────────

  describe('Client Credentials Flow', () => {
    it('should issue tokens with client_credentials grant', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'backend-service',
        redirectUris: [],
        scopes: ['tools:read', 'tools:execute', 'tasks:read'],
      });

      const result = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'tools:read tools:execute',
      });

      expect(result.status).toBe(200);
      expect(result.body.access_token).toBeTruthy();
      expect(result.body.refresh_token).toBeTruthy();
      expect(result.body.token_type).toBe('Bearer');
      expect(result.body.expires_in).toBe(3600);
      expect(result.body.scope).toBe('tools:read tools:execute');
    });

    it('should reject invalid client credentials', async () => {
      const { clientId } = await provider.registerClient({
        clientName: 'test',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const result = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: 'wrong-secret',
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toBe('invalid_client');
    });

    it('should reject unauthorized scopes', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'limited',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const result = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'admin',
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toBe('invalid_scope');
    });

    it('should reject public clients', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'public',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read'],
        clientType: 'public',
      });

      const result = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toBe('unauthorized_client');
    });

    it('should reject unsupported grant type', async () => {
      const result = await provider.handleToken({
        grant_type: 'implicit',
        client_id: 'whatever',
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toBe('unsupported_grant_type');
    });
  });

  // ── Refresh Token Flow (Rotation) ──────────────────────────────────────

  describe('Refresh Token Flow', () => {
    it('should rotate refresh tokens', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'rotation-test',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      // Get initial tokens
      const initial = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      expect(initial.status).toBe(200);

      // Refresh
      const refreshed = await provider.handleToken({
        grant_type: 'refresh_token',
        refresh_token: initial.body.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      });

      expect(refreshed.status).toBe(200);
      expect(refreshed.body.access_token).not.toBe(initial.body.access_token);
      expect(refreshed.body.refresh_token).not.toBe(initial.body.refresh_token);
    });

    it('should detect refresh token replay and revoke chain', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'replay-test',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const initial = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      const oldRefresh = initial.body.refresh_token as string;

      // Rotate once
      const rotated = await provider.handleToken({
        grant_type: 'refresh_token',
        refresh_token: oldRefresh,
        client_id: clientId,
        client_secret: clientSecret,
      });
      expect(rotated.status).toBe(200);

      // Replay old token
      const replayed = await provider.handleToken({
        grant_type: 'refresh_token',
        refresh_token: oldRefresh,
        client_id: clientId,
        client_secret: clientSecret,
      });

      expect(replayed.status).toBe(400);
      expect(replayed.body.error_description).toContain('replay detected');
    });

    it('should reject expired refresh tokens', async () => {
      // Create a provider with very short refresh TTL
      const shortProvider = new OAuth2Provider({
        ttl: { accessTokenTTL: 1, refreshTokenTTL: 0, authCodeTTL: 1 },
        migrationMode: 'permissive',
      });

      const { clientId, clientSecret } = await shortProvider.registerClient({
        clientName: 'expired-refresh',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const initial = await shortProvider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      // Wait for the 0s TTL token to actually expire (expiresAt = now + 0)
      await new Promise(resolve => setTimeout(resolve, 5));

      const result = await shortProvider.handleToken({
        grant_type: 'refresh_token',
        refresh_token: initial.body.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      });

      expect(result.status).toBe(400);
      // The in-memory backend auto-evicts expired tokens, so the error
      // may be either "expired" or "Invalid refresh token" depending on timing
      expect(result.body.error).toBe('invalid_grant');

      shortProvider.destroy();
    });
  });

  // ── Token Introspection (RFC 7662) ─────────────────────────────────────

  describe('Token Introspection (RFC 7662)', () => {
    it('should introspect active tokens', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'introspect-test',
        redirectUris: [],
        scopes: ['tools:read', 'tasks:read'],
      });

      const tokens = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        agent_id: 'agent-v1',
      });

      const result = await provider.handleIntrospect({
        token: tokens.body.access_token as string,
      });

      expect(result.status).toBe(200);
      expect(result.body.active).toBe(true);
      expect(result.body.client_id).toBe(clientId);
      expect(result.body.token_type).toBe('Bearer');
      expect(result.body.iss).toBe('https://mcp.holoscript.net');
      expect(result.body.exp).toBeDefined();
      expect(result.body.iat).toBeDefined();
    });

    it('should return active=false for unknown tokens', async () => {
      const result = await provider.handleIntrospect({
        token: 'hs_nonexistent_token',
      });

      expect(result.status).toBe(200);
      expect(result.body.active).toBe(false);
    });

    it('should return active=false for revoked tokens', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'revoke-introspect',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const tokens = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      const accessToken = tokens.body.access_token as string;

      // Revoke it
      await provider.revokeToken(accessToken);

      // Introspect
      const result = await provider.handleIntrospect({ token: accessToken });
      expect(result.body.active).toBe(false);
    });

    it('should reject missing token parameter', async () => {
      const result = await provider.handleIntrospect({});
      expect(result.status).toBe(400);
      expect(result.body.error).toBe('invalid_request');
    });
  });

  // ── Token Revocation (RFC 7009) ────────────────────────────────────────

  describe('Token Revocation (RFC 7009)', () => {
    it('should revoke access tokens', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'revoke-test',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const tokens = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      const result = await provider.handleRevoke({
        token: tokens.body.access_token as string,
      });

      expect(result.status).toBe(200);
      expect(result.body.revoked).toBe(true);

      // Verify it's gone
      const introspection = await provider.introspect(tokens.body.access_token as string);
      expect(introspection.active).toBe(false);
    });

    it('should revoke refresh token chains', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'chain-revoke',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const tokens = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      const result = await provider.handleRevoke({
        token: tokens.body.refresh_token as string,
      });

      expect(result.status).toBe(200);
      expect(result.body.revoked).toBe(true);
    });

    it('should return 200 even for unknown tokens (per RFC 7009)', async () => {
      const result = await provider.handleRevoke({
        token: 'hs_nonexistent_token_value',
      });

      expect(result.status).toBe(200);
      expect(result.body.revoked).toBe(false);
    });
  });

  // ── GET /oauth/authorize ───────────────────────────────────────────────

  describe('GET /oauth/authorize', () => {
    it('should return authorization request details', async () => {
      const { clientId } = await provider.registerClient({
        clientName: 'auth-get-test',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read', 'tools:execute'],
      });

      const challenge = createHash('sha256').update('verifier').digest('base64url');
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/cb',
        scope: 'tools:read',
        state: 'csrf-token',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });

      const result = await provider.handleAuthorizeGet(params);

      expect(result.status).toBe(200);
      expect(result.body.authorization_request).toBeDefined();
      const req = result.body.authorization_request as Record<string, unknown>;
      expect(req.client_id).toBe(clientId);
      expect(req.client_name).toBe('auth-get-test');
      expect(req.scope).toBe('tools:read');
      expect(req.state).toBe('csrf-token');
      expect(req.available_scopes).toBeDefined();
    });

    it('should reject non-code response types', async () => {
      const params = new URLSearchParams({
        response_type: 'token',
        client_id: 'whatever',
      });

      const result = await provider.handleAuthorizeGet(params);
      expect(result.status).toBe(400);
      expect(result.body.error).toBe('unsupported_response_type');
    });

    it('should reject missing PKCE challenge', async () => {
      const { clientId } = await provider.registerClient({
        clientName: 'no-pkce',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read'],
      });

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/cb',
      });

      const result = await provider.handleAuthorizeGet(params);
      expect(result.status).toBe(400);
      expect(result.body.error_description).toContain('PKCE is mandatory');
    });

    it('should reject unknown client_id', async () => {
      const challenge = createHash('sha256').update('v').digest('base64url');
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: 'unknown-client',
        redirect_uri: 'https://example.com/cb',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });

      const result = await provider.handleAuthorizeGet(params);
      expect(result.status).toBe(400);
      expect(result.body.error).toBe('invalid_client');
    });

    it('should reject unregistered redirect URI', async () => {
      const { clientId } = await provider.registerClient({
        clientName: 'redir-test',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read'],
      });

      const challenge = createHash('sha256').update('v').digest('base64url');
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://evil.com/steal',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });

      const result = await provider.handleAuthorizeGet(params);
      expect(result.status).toBe(400);
      expect(result.body.error_description).toContain('not registered');
    });
  });

  // ── Legacy API Key Compatibility ───────────────────────────────────────

  describe('Legacy API Key Compatibility', () => {
    it('should accept legacy Bearer token in permissive mode', async () => {
      const result = await provider.authenticateRequest({
        authorization: 'Bearer test-legacy-key',
      });
      expect(result.active).toBe(true);
      expect(result.agentId).toBe('legacy-api-key');
    });

    it('should accept legacy x-api-key header', async () => {
      const result = await provider.authenticateRequest({
        'x-api-key': 'test-legacy-key',
      });
      expect(result.active).toBe(true);
    });

    it('should reject invalid legacy key', async () => {
      const result = await provider.authenticateRequest({
        'x-api-key': 'wrong-key',
      });
      expect(result.active).toBe(false);
    });

    it('should reject legacy keys in strict mode', async () => {
      const strictProvider = new OAuth2Provider({
        migrationMode: 'strict',
        legacyApiKey: 'test-legacy-key',
      });

      const result = await strictProvider.authenticateRequest({
        'x-api-key': 'test-legacy-key',
      });
      expect(result.active).toBe(false);

      strictProvider.destroy();
    });
  });

  // ── OAuth 2.1 Bearer Token Authentication ─────────────────────────────

  describe('OAuth 2.1 Bearer Token Authentication', () => {
    it('should authenticate with OAuth Bearer token', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'bearer-test',
        redirectUris: [],
        scopes: ['tools:read', 'tools:execute'],
      });

      const tokens = await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'tools:read tools:execute',
      });

      const result = await provider.authenticateRequest({
        authorization: `Bearer ${tokens.body.access_token}`,
      });

      expect(result.active).toBe(true);
      expect(result.clientId).toBe(clientId);
      // Scopes should be expanded for Gate 2 compatibility
      expect(result.scopes).toBeDefined();
      expect(result.scopes!.length).toBeGreaterThan(0);
    });

    it('should reject unknown Bearer tokens', async () => {
      const result = await provider.authenticateRequest({
        authorization: 'Bearer hs_invalid_token_that_does_not_exist',
      });

      // Falls through to legacy check, which also fails
      expect(result.active).toBe(false);
    });
  });

  // ── OpenID Configuration ───────────────────────────────────────────────

  describe('OpenID Configuration', () => {
    it('should return valid discovery document', () => {
      const config = provider.getOpenIDConfiguration();

      expect(config.issuer).toBe('https://mcp.holoscript.net');
      expect(config.authorization_endpoint).toContain('/oauth/authorize');
      expect(config.token_endpoint).toContain('/oauth/token');
      expect(config.introspection_endpoint).toContain('/oauth/introspect');
      expect(config.revocation_endpoint).toContain('/oauth/revoke');
      expect(config.registration_endpoint).toContain('/oauth/register');
      expect(config.grant_types_supported).toContain('authorization_code');
      expect(config.grant_types_supported).toContain('client_credentials');
      expect(config.grant_types_supported).toContain('refresh_token');
      expect(config.code_challenge_methods_supported).toContain('S256');
      expect(config.scopes_supported).toContain('tools:read');
      expect(config.scopes_supported).toContain('tools:execute');
      expect(config.scopes_supported).toContain('tasks:read');
      expect(config.scopes_supported).toContain('tasks:write');
      expect(config.scopes_supported).toContain('admin');
    });
  });

  // ── Stats ──────────────────────────────────────────────────────────────

  describe('Stats', () => {
    it('should report accurate stats', async () => {
      const { clientId, clientSecret } = await provider.registerClient({
        clientName: 'stats-test',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      await provider.handleToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      const stats = await provider.getStats();
      expect(stats.registeredClients).toBe(1);
      expect(stats.activeAccessTokens).toBe(1);
      expect(stats.activeRefreshTokens).toBe(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Scope Bridging
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scope Bridging', () => {
  it('should define all required scopes', () => {
    const scopes = Object.keys(OAUTH2_SCOPES);
    expect(scopes).toContain('tools:read');
    expect(scopes).toContain('tools:execute');
    expect(scopes).toContain('tasks:read');
    expect(scopes).toContain('tasks:write');
    expect(scopes).toContain('admin');
  });

  it('should expand tools:read to internal scopes', () => {
    const expanded = expandScopes(['tools:read']);
    expect(expanded).toContain('tools:read');
  });

  it('should expand tools:execute to write, codebase, and browser scopes', () => {
    const expanded = expandScopes(['tools:execute']);
    expect(expanded).toContain('tools:write');
    expect(expanded).toContain('tools:codebase');
    expect(expanded).toContain('tools:browser');
  });

  it('should expand tasks:read to a2a:tasks and scenes:read', () => {
    const expanded = expandScopes(['tasks:read']);
    expect(expanded).toContain('a2a:tasks');
    expect(expanded).toContain('scenes:read');
  });

  it('should expand tasks:write to a2a:tasks and scenes:write', () => {
    const expanded = expandScopes(['tasks:write']);
    expect(expanded).toContain('a2a:tasks');
    expect(expanded).toContain('scenes:write');
  });

  it('should expand admin to admin:* and tools:admin', () => {
    const expanded = expandScopes(['admin']);
    expect(expanded).toContain('admin:*');
    expect(expanded).toContain('tools:admin');
  });

  it('should pass through unknown scopes', () => {
    const expanded = expandScopes(['custom:scope', 'tools:read']);
    expect(expanded).toContain('custom:scope');
    expect(expanded).toContain('tools:read');
  });

  it('should deduplicate expanded scopes', () => {
    // tasks:read and tasks:write both expand to a2a:tasks
    const expanded = expandScopes(['tasks:read', 'tasks:write']);
    const a2aCount = expanded.filter(s => s === 'a2a:tasks').length;
    expect(a2aCount).toBe(1);
  });

  it('should have bridge entries for all defined scopes', () => {
    for (const scope of Object.keys(OAUTH2_SCOPES)) {
      expect(SCOPE_BRIDGE).toHaveProperty(scope);
      expect(SCOPE_BRIDGE[scope].length).toBeGreaterThan(0);
    }
  });
});
