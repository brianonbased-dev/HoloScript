/**
 * Minimal client for the MCP orchestrator's /tools/call endpoint.
 *
 * v0.3 adds OAuth 2.1 client_credentials flow:
 *   1. On first callTool, register a confidential service client via POST /oauth/register
 *      on the MCP server (mcp.holoscript.net by default).
 *   2. Exchange client credentials for a Bearer token via POST /oauth/token.
 *   3. Cache the token in memory; proactively refresh when within 60 s of expiry.
 *   4. Retry once with a fresh token on any 401 response.
 *
 * The legacy x-mcp-api-key header is removed. When OAUTH_MIGRATION_MODE=strict is
 * set on the server, only Bearer tokens are accepted — this client handles that
 * transparently.
 */

export interface CallToolArgs {
  server: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface CallToolResult {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

export interface McpClientConfig {
  endpoint: string;
  apiKey: string;
  timeoutMs: number;
  /**
   * Base URL of the OAuth 2.1 authorization server.
   * Defaults to https://mcp.holoscript.net (the MCP server that owns /oauth/*).
   * Set this when the orchestrator endpoint differs from the OAuth server.
   */
  oauthEndpoint?: string;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_ENDPOINT = 'https://mcp-orchestrator-production-45f9.up.railway.app';
export const DEFAULT_OAUTH_ENDPOINT = 'https://mcp.holoscript.net';

export function defaultMcpConfig(overrides: Partial<McpClientConfig> = {}): McpClientConfig {
  const endpoint = overrides.endpoint ?? process.env.MCP_ORCHESTRATOR_URL ?? DEFAULT_ENDPOINT;
  const apiKey =
    overrides.apiKey ?? process.env.HOLOSCRIPT_API_KEY ?? process.env.MCP_API_KEY ?? '';
  return {
    endpoint,
    apiKey,
    timeoutMs: overrides.timeoutMs ?? 60_000,
    oauthEndpoint: overrides.oauthEndpoint ?? process.env.MCP_OAUTH_ENDPOINT ?? DEFAULT_OAUTH_ENDPOINT,
    fetchImpl: overrides.fetchImpl,
  };
}

// ── OAuth 2.1 token cache ─────────────────────────────────────────────────────

interface CachedToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // ms since epoch
  clientId: string;
  clientSecret: string;
}

/** Seconds before expiry at which we proactively refresh. */
const REFRESH_BUFFER_SECS = 60;

// ── McpClient ────────────────────────────────────────────────────────────────

export class McpClient {
  private _tokenCache: CachedToken | null = null;
  private _tokenInflight: Promise<CachedToken> | null = null;

  constructor(readonly config: McpClientConfig) {}

  async callTool({ server, tool, args }: CallToolArgs): Promise<CallToolResult> {
    if (!this.config.apiKey) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: 'mcp-client: missing HOLOSCRIPT_API_KEY (or MCP_API_KEY) — tool calls disabled',
      };
    }

    const url = `${this.config.endpoint.replace(/\/$/, '')}/tools/call`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.config.timeoutMs);
    const fetchFn = this.config.fetchImpl ?? fetch;

    try {
      const token = await this._getToken();
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token.accessToken}`,
        },
        body: JSON.stringify({ server, tool, args }),
        signal: ac.signal,
      });

      // On 401, invalidate cache and retry once with a fresh token.
      if (res.status === 401) {
        this._tokenCache = null;
        const freshToken = await this._getToken();
        const retryRes = await fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken.accessToken}`,
          },
          body: JSON.stringify({ server, tool, args }),
          signal: ac.signal,
        });
        return await this._parseResponse(retryRes);
      }

      return await this._parseResponse(res);
    } catch (err) {
      const e = err as Error & { name?: string };
      return {
        ok: false,
        status: 0,
        data: null,
        error:
          e.name === 'AbortError'
            ? `tool call timed out after ${this.config.timeoutMs}ms`
            : e.message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Token management ───────────────────────────────────────────────────────

  /**
   * Returns a valid cached token, or acquires a new one.
   * Concurrent callers share a single inflight promise to avoid duplicate registrations.
   */
  private async _getToken(): Promise<CachedToken> {
    const now = Date.now();
    if (
      this._tokenCache &&
      this._tokenCache.expiresAt - now > REFRESH_BUFFER_SECS * 1000
    ) {
      return this._tokenCache;
    }

    if (this._tokenInflight) {
      return this._tokenInflight;
    }

    this._tokenInflight = this._acquireToken().finally(() => {
      this._tokenInflight = null;
    });
    return this._tokenInflight;
  }

  /**
   * Try to refresh an existing token first; fall back to full registration + issue.
   */
  private async _acquireToken(): Promise<CachedToken> {
    // Attempt refresh if we have a cached refresh token.
    if (this._tokenCache?.refreshToken) {
      try {
        const refreshed = await this._refreshToken(
          this._tokenCache.clientId,
          this._tokenCache.clientSecret,
          this._tokenCache.refreshToken
        );
        this._tokenCache = refreshed;
        return refreshed;
      } catch {
        // Refresh failed; fall through to full re-registration.
        this._tokenCache = null;
      }
    }

    // Register a new service client and issue credentials.
    const { clientId, clientSecret } = await this._registerClient();
    const token = await this._issueToken(clientId, clientSecret);
    this._tokenCache = token;
    return token;
  }

  /**
   * Register a confidential service client via POST /oauth/register.
   * Uses the raw API key in the Authorization header so the server can identify
   * this as a trusted service registration (legacy header accepted during migration).
   */
  private async _registerClient(): Promise<{ clientId: string; clientSecret: string }> {
    const oauthBase = (this.config.oauthEndpoint ?? DEFAULT_OAUTH_ENDPOINT).replace(/\/$/, '');
    const fetchFn = this.config.fetchImpl ?? fetch;

    const res = await fetchFn(`${oauthBase}/oauth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': this.config.apiKey,
      },
      body: JSON.stringify({
        client_name: 'aibrittney-service',
        redirect_uris: ['https://mcp.holoscript.net/oauth/callback'],
        grant_types: ['client_credentials'],
        token_endpoint_auth_method: 'client_secret_post',
        scope: 'tools:read tools:write tools:codebase',
        client_type: 'confidential',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`oauth/register failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    const body = await res.json() as Record<string, unknown>;
    const clientId = body.client_id as string | undefined;
    const clientSecret = body.client_secret as string | undefined;

    if (!clientId || !clientSecret) {
      throw new Error(`oauth/register: unexpected response shape — ${JSON.stringify(body).slice(0, 200)}`);
    }

    return { clientId, clientSecret };
  }

  /**
   * Exchange client_id + client_secret for a Bearer token via POST /oauth/token
   * using the client_credentials grant.
   */
  private async _issueToken(clientId: string, clientSecret: string): Promise<CachedToken> {
    const oauthBase = (this.config.oauthEndpoint ?? DEFAULT_OAUTH_ENDPOINT).replace(/\/$/, '');
    const fetchFn = this.config.fetchImpl ?? fetch;

    const res = await fetchFn(`${oauthBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'tools:read tools:write tools:codebase',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`oauth/token failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    const body = await res.json() as Record<string, unknown>;
    return this._parseCachedToken(body, clientId, clientSecret);
  }

  /**
   * Refresh an existing token via the refresh_token grant.
   */
  private async _refreshToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string
  ): Promise<CachedToken> {
    const oauthBase = (this.config.oauthEndpoint ?? DEFAULT_OAUTH_ENDPOINT).replace(/\/$/, '');
    const fetchFn = this.config.fetchImpl ?? fetch;

    const res = await fetchFn(`${oauthBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`oauth/token refresh failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    const body = await res.json() as Record<string, unknown>;
    return this._parseCachedToken(body, clientId, clientSecret);
  }

  private _parseCachedToken(
    body: Record<string, unknown>,
    clientId: string,
    clientSecret: string
  ): CachedToken {
    const accessToken = body.access_token as string | undefined;
    if (!accessToken) {
      throw new Error(`oauth/token: no access_token in response — ${JSON.stringify(body).slice(0, 200)}`);
    }
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    return {
      accessToken,
      refreshToken: body.refresh_token as string | undefined,
      expiresAt: Date.now() + expiresIn * 1000,
      clientId,
      clientSecret,
    };
  }

  // ── Response parsing ───────────────────────────────────────────────────────

  private async _parseResponse(res: Response): Promise<CallToolResult> {
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // leave as text
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    return { ok: true, status: res.status, data };
  }

  // ── Visible for testing ────────────────────────────────────────────────────

  /** Inject a pre-issued token (for tests that stub out the OAuth endpoints). */
  _setTokenForTest(token: CachedToken): void {
    this._tokenCache = token;
  }

  /** Flush the cached token (forces re-authentication on the next call). */
  _clearTokenForTest(): void {
    this._tokenCache = null;
  }
}
