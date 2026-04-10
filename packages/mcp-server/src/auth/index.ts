/**
 * HoloScript MCP Auth Module
 *
 * OAuth 2.1 authentication and token management with pluggable backends.
 *
 * Architecture:
 *   OAuth2Provider  — High-level endpoint handlers for /oauth/* routes
 *   TokenStore      — Pluggable storage layer (in-memory, Redis, PostgreSQL)
 *
 * Usage:
 * ```typescript
 * import { getOAuth2Provider, OAuth2Provider } from './auth';
 *
 * // Get singleton
 * const provider = getOAuth2Provider({ legacyApiKey: 'my-key' });
 *
 * // Or create instance with custom backend
 * const provider = new OAuth2Provider({
 *   backend: new RedisTokenStore(redis),
 *   ttl: { accessTokenTTL: 3600, refreshTokenTTL: 2592000, authCodeTTL: 300 },
 * });
 * ```
 */

// OAuth 2.1 Provider
export {
  OAuth2Provider,
  getOAuth2Provider,
  resetOAuth2Provider,
  OAUTH2_SCOPES,
  SCOPE_BRIDGE,
  expandScopes,
  DEFAULT_PROVIDER_CONFIG,
  type OAuth2ProviderConfig,
  type OAuth2Scope,
  type OAuth2TokenResponse,
  type TokenIntrospectionResult,
} from './oauth2-provider';

// Token Store
export {
  TokenStore,
  InMemoryTokenStore,
  DEFAULT_TTL,
  type TokenStoreBackend,
  type TokenStoreTTL,
  type TokenStoreStats,
  type StoredAccessToken,
  type StoredRefreshToken,
  type StoredAuthorizationCode,
  type StoredClient,
} from './token-store';
