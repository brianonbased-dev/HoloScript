/**
 * @holoscript/config — Server-Only Auth Helpers
 *
 * THESE FUNCTIONS THROW IF CALLED FROM THE BROWSER.
 * Keys never leave the server. Studio API routes proxy all
 * authenticated requests — the browser calls /api/compile,
 * the API route reads the key and forwards.
 *
 * Users set keys in their .env file. One file, all keys.
 *
 * OAuth 2.1 client_credentials flow:
 * Set HOLOSCRIPT_MCP_CLIENT_ID + HOLOSCRIPT_MCP_CLIENT_SECRET to use OAuth
 * bearer tokens instead of the legacy x-mcp-api-key header. Token TTL is
 * 3600 s; tokens are cached in-process and refreshed 5 min before expiry.
 * See getOAuthToken() and mcpAuthHeadersAsync().
 */

// =============================================================================
// SERVER GUARD
// =============================================================================

function assertServer(caller: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      `@holoscript/config: ${caller}() is server-only. ` +
        'Use Studio API routes to proxy requests — never expose keys to the browser.'
    );
  }
}

// =============================================================================
// KEY ACCESSORS
// =============================================================================

/** HoloScript platform API key (used for orchestrator tool calls and knowledge sync) */
export function getMcpApiKey(): string {
  assertServer('getMcpApiKey');
  return process.env.HOLOSCRIPT_API_KEY || process.env.MCP_API_KEY || '';
}

/** HoloMesh agent API key (holomesh_sk_* format) */
export function getHolomeshKey(): string {
  assertServer('getHolomeshKey');
  return process.env.HOLOMESH_API_KEY || '';
}

/** Absorb Service API key */
export function getAbsorbKey(): string {
  assertServer('getAbsorbKey');
  return process.env.ABSORB_API_KEY || '';
}

/** Moltbook agent API key (moltbook_sk_* format) */
export function getMoltbookKey(): string {
  assertServer('getMoltbookKey');
  return process.env.MOLTBOOK_API_KEY || '';
}

/** Anthropic API key for LLM calls */
export function getAnthropicKey(): string {
  assertServer('getAnthropicKey');
  return process.env.ANTHROPIC_API_KEY || '';
}

/** OpenAI API key for embeddings and fallback LLM */
export function getOpenAIKey(): string {
  assertServer('getOpenAIKey');
  return process.env.OPENAI_API_KEY || '';
}

/** Railway project token for deploy operations */
export function getRailwayToken(): string {
  assertServer('getRailwayToken');
  return process.env.RAILWAY_TOKEN || '';
}

/** HoloMesh team ID */
export function getTeamId(): string {
  assertServer('getTeamId');
  return process.env.HOLOMESH_TEAM_ID || '';
}

// =============================================================================
// OAUTH 2.1 CLIENT CREDENTIALS — in-process token cache
// =============================================================================

interface CachedToken {
  /** Bearer token value */
  accessToken: string;
  /** Unix ms timestamp when the token expires */
  expiresAt: number;
}

// Module-level cache — one token per process (server-side only).
let _oauthTokenCache: CachedToken | null = null;

/** Milliseconds before expiry at which we proactively refresh the token. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch a client_credentials OAuth 2.1 access token from the HoloScript MCP
 * server, caching it in-process until 5 minutes before expiry.
 *
 * Env vars required:
 *   HOLOSCRIPT_MCP_CLIENT_ID     — registered OAuth client id
 *   HOLOSCRIPT_MCP_CLIENT_SECRET — registered OAuth client secret
 *
 * Falls back to `undefined` (not throwing) when credentials are absent, so
 * callers can fall back to legacy key auth gracefully.
 *
 * Token endpoint: POST {HOLOSCRIPT_MCP_URL}/oauth/token
 * Grant: client_credentials
 */
export async function getOAuthToken(): Promise<string | undefined> {
  assertServer('getOAuthToken');

  const clientId = process.env.HOLOSCRIPT_MCP_CLIENT_ID;
  const clientSecret = process.env.HOLOSCRIPT_MCP_CLIENT_SECRET;

  // No client credentials configured — caller falls back to legacy key.
  if (!clientId || !clientSecret) return undefined;

  const now = Date.now();

  // Return cached token if still valid (with refresh buffer).
  if (_oauthTokenCache && _oauthTokenCache.expiresAt - now > REFRESH_BUFFER_MS) {
    return _oauthTokenCache.accessToken;
  }

  // Token missing or near-expiry — fetch a fresh one.
  const issuer = process.env.HOLOSCRIPT_MCP_URL || 'https://mcp.holoscript.net';
  const tokenUrl = `${issuer}/oauth/token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'tools:read tools:write tools:codebase tools:admin',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '(unreadable)');
    throw new Error(
      `@holoscript/config: OAuth token request failed — ${res.status} ${res.statusText}: ${text}`
    );
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!data.access_token) {
    throw new Error(
      '@holoscript/config: OAuth token response missing access_token field'
    );
  }

  const ttlMs = (data.expires_in ?? 3600) * 1000;
  _oauthTokenCache = {
    accessToken: data.access_token,
    expiresAt: now + ttlMs,
  };

  return _oauthTokenCache.accessToken;
}

/**
 * Invalidate the in-process OAuth token cache. Useful in tests and after
 * credential rotation to force a fresh token on the next call.
 */
export function invalidateOAuthTokenCache(): void {
  _oauthTokenCache = null;
}

// =============================================================================
// AUTH HEADERS
// =============================================================================

/**
 * Build Authorization headers for the MCP Orchestrator (legacy synchronous).
 *
 * Returns the legacy `x-mcp-api-key` + `x-holoscript-api-key` headers.
 * Prefer `mcpAuthHeadersAsync()` for new callers — it issues OAuth 2.1
 * bearer tokens when `HOLOSCRIPT_MCP_CLIENT_ID` and
 * `HOLOSCRIPT_MCP_CLIENT_SECRET` are configured.
 *
 * @deprecated Use mcpAuthHeadersAsync() in new code.
 */
export function mcpAuthHeaders(): Record<string, string> {
  return { 'x-holoscript-api-key': getMcpApiKey(), 'x-mcp-api-key': getMcpApiKey() };
}

/**
 * Build Authorization headers for the MCP Orchestrator (OAuth 2.1 preferred).
 *
 * When `HOLOSCRIPT_MCP_CLIENT_ID` + `HOLOSCRIPT_MCP_CLIENT_SECRET` are set,
 * fetches (or returns a cached) client_credentials bearer token and returns
 * `{ Authorization: 'Bearer <token>' }`.
 *
 * Falls back to the legacy `x-mcp-api-key` pair when OAuth credentials are
 * absent, so existing deployments keep working without configuration changes.
 */
export async function mcpAuthHeadersAsync(): Promise<Record<string, string>> {
  assertServer('mcpAuthHeadersAsync');
  const token = await getOAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  // Legacy fallback — no client credentials configured.
  return { 'x-holoscript-api-key': getMcpApiKey(), 'x-mcp-api-key': getMcpApiKey() };
}

/** Build Authorization header for HoloMesh API */
export function holomeshAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getHolomeshKey()}` };
}

/** Build Authorization header for Absorb Service */
export function absorbAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getAbsorbKey()}` };
}
