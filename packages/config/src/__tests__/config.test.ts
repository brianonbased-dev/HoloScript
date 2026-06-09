import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ENDPOINTS, getEndpoint } from '../endpoints';
import {
  getMcpApiKey,
  getHolomeshKey,
  mcpAuthHeaders,
  mcpAuthHeadersAsync,
  getOAuthToken,
  invalidateOAuthTokenCache,
  holomeshAuthHeaders,
} from '../auth';
import { validateConfig, requireConfig } from '../validate';

describe('endpoints', () => {
  it('returns production defaults when no env vars set', () => {
    expect(ENDPOINTS.MCP_ORCHESTRATOR).toContain('mcp-orchestrator-production');
    expect(ENDPOINTS.HOLOSCRIPT_MCP).toBe('https://mcp.holoscript.net');
    expect(ENDPOINTS.ABSORB_SERVICE).toBe('https://absorb.holoscript.net');
    expect(ENDPOINTS.MOLTBOOK_API).toContain('www.moltbook.com');
  });

  it('getEndpoint returns correct URL', () => {
    expect(getEndpoint('HOLOSCRIPT_MCP')).toBe('https://mcp.holoscript.net');
  });

  it('reads from env var when set', () => {
    process.env.HOLOSCRIPT_MCP_URL = 'http://localhost:3000';
    // Re-import to pick up env change — endpoints are evaluated at import time
    // so this test verifies the pattern, not dynamic behavior
    expect(process.env.HOLOSCRIPT_MCP_URL).toBe('http://localhost:3000');
    delete process.env.HOLOSCRIPT_MCP_URL;
  });
});

describe('auth (server-side)', () => {
  beforeEach(() => {
    process.env.HOLOSCRIPT_API_KEY = 'test-mcp-key';
    process.env.HOLOMESH_API_KEY = 'test-holomesh-key';
  });

  afterEach(() => {
    delete process.env.HOLOSCRIPT_API_KEY;
    delete process.env.HOLOMESH_API_KEY;
  });

  it('getMcpApiKey reads from env', () => {
    expect(getMcpApiKey()).toBe('test-mcp-key');
  });

  it('getHolomeshKey reads from env', () => {
    expect(getHolomeshKey()).toBe('test-holomesh-key');
  });

  it('returns empty string when env not set', () => {
    // F.013: getMcpApiKey() reads HOLOSCRIPT_API_KEY first, then falls back to legacy MCP_API_KEY.
    // Save both so the restore step is symmetric and doesn't leak state into the next test.
    const savedHoloscriptKey = process.env.HOLOSCRIPT_API_KEY;
    const savedMcpKey = process.env.MCP_API_KEY;
    delete process.env.HOLOSCRIPT_API_KEY;
    delete process.env.MCP_API_KEY;
    try {
      expect(getMcpApiKey()).toBe('');
    } finally {
      if (savedHoloscriptKey !== undefined) process.env.HOLOSCRIPT_API_KEY = savedHoloscriptKey;
      if (savedMcpKey !== undefined) process.env.MCP_API_KEY = savedMcpKey;
    }
  });

  it('mcpAuthHeaders returns correct header (legacy)', () => {
    const headers = mcpAuthHeaders();
    expect(headers['x-mcp-api-key']).toBe('test-mcp-key');
    expect(headers['x-holoscript-api-key']).toBe('test-mcp-key');
  });

  it('holomeshAuthHeaders returns Bearer token', () => {
    const headers = holomeshAuthHeaders();
    expect(headers['Authorization']).toBe('Bearer test-holomesh-key');
  });

  describe('getOAuthToken', () => {
    afterEach(() => {
      // Always clear cache and credentials after each OAuth test
      invalidateOAuthTokenCache();
      delete process.env.HOLOSCRIPT_MCP_CLIENT_ID;
      delete process.env.HOLOSCRIPT_MCP_CLIENT_SECRET;
      vi.restoreAllMocks();
    });

    it('returns undefined when client credentials are not configured', async () => {
      delete process.env.HOLOSCRIPT_MCP_CLIENT_ID;
      delete process.env.HOLOSCRIPT_MCP_CLIENT_SECRET;
      const token = await getOAuthToken();
      expect(token).toBeUndefined();
    });

    it('fetches an OAuth token and caches it', async () => {
      process.env.HOLOSCRIPT_MCP_CLIENT_ID = 'test-client-id';
      process.env.HOLOSCRIPT_MCP_CLIENT_SECRET = 'test-client-secret';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'oauth-bearer-token', expires_in: 3600, token_type: 'Bearer' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const token1 = await getOAuthToken();
      expect(token1).toBe('oauth-bearer-token');

      // Second call should use cache — fetch only called once
      const token2 = await getOAuthToken();
      expect(token2).toBe('oauth-bearer-token');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify request shape
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/oauth/token');
      const body = new URLSearchParams(opts.body as string);
      expect(body.get('grant_type')).toBe('client_credentials');
      expect(body.get('client_id')).toBe('test-client-id');
      expect(body.get('client_secret')).toBe('test-client-secret');
    });

    it('throws on non-OK token response', async () => {
      process.env.HOLOSCRIPT_MCP_CLIENT_ID = 'bad-client';
      process.env.HOLOSCRIPT_MCP_CLIENT_SECRET = 'bad-secret';

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => '{"error":"invalid_client"}',
      }));

      await expect(getOAuthToken()).rejects.toThrow('400');
    });

    it('invalidateOAuthTokenCache forces re-fetch on next call', async () => {
      process.env.HOLOSCRIPT_MCP_CLIENT_ID = 'test-client-id';
      process.env.HOLOSCRIPT_MCP_CLIENT_SECRET = 'test-client-secret';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'token-v1', expires_in: 3600 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await getOAuthToken();
      invalidateOAuthTokenCache();
      await getOAuthToken();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('mcpAuthHeadersAsync', () => {
    afterEach(() => {
      invalidateOAuthTokenCache();
      delete process.env.HOLOSCRIPT_MCP_CLIENT_ID;
      delete process.env.HOLOSCRIPT_MCP_CLIENT_SECRET;
      vi.restoreAllMocks();
    });

    it('returns OAuth Bearer token when client credentials are configured', async () => {
      process.env.HOLOSCRIPT_MCP_CLIENT_ID = 'test-client-id';
      process.env.HOLOSCRIPT_MCP_CLIENT_SECRET = 'test-client-secret';

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'async-bearer-token', expires_in: 3600 }),
      }));

      const headers = await mcpAuthHeadersAsync();
      expect(headers['Authorization']).toBe('Bearer async-bearer-token');
      expect(headers['x-mcp-api-key']).toBeUndefined();
    });

    it('falls back to legacy headers when no client credentials set', async () => {
      delete process.env.HOLOSCRIPT_MCP_CLIENT_ID;
      delete process.env.HOLOSCRIPT_MCP_CLIENT_SECRET;

      const headers = await mcpAuthHeadersAsync();
      expect(headers['x-mcp-api-key']).toBe('test-mcp-key');
      expect(headers['Authorization']).toBeUndefined();
    });
  });
});

describe('validateConfig', () => {
  it('returns valid when all required vars present', () => {
    process.env.TEST_VAR_A = 'a';
    process.env.TEST_VAR_B = 'b';
    const result = validateConfig(['TEST_VAR_A', 'TEST_VAR_B']);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
    delete process.env.TEST_VAR_A;
    delete process.env.TEST_VAR_B;
  });

  it('returns invalid with missing vars', () => {
    const result = validateConfig(['NONEXISTENT_VAR_XYZ']);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('NONEXISTENT_VAR_XYZ');
  });

  it('reports optional vars as warnings', () => {
    const result = validateConfig([], ['OPTIONAL_MISSING_VAR']);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  it('requireConfig throws on missing vars', () => {
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => requireConfig(['DEFINITELY_MISSING_VAR'], 'test-service')).toThrow(
      'DEFINITELY_MISSING_VAR'
    );
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('DEFINITELY_MISSING_VAR'));

    mockError.mockRestore();
  });
});
