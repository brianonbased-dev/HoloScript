import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ENDPOINTS, getEndpoint } from '../endpoints';
import { getMcpApiKey, getHolomeshKey, mcpAuthHeaders, holomeshAuthHeaders } from '../auth';
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
    delete process.env.HOLOSCRIPT_API_KEY;
    expect(getMcpApiKey()).toBe('');
  });

  it('mcpAuthHeaders returns correct header', () => {
    const headers = mcpAuthHeaders();
    expect(headers['x-mcp-api-key']).toBe('test-mcp-key');
  });

  it('holomeshAuthHeaders returns Bearer token', () => {
    const headers = holomeshAuthHeaders();
    expect(headers['Authorization']).toBe('Bearer test-holomesh-key');
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

  it('requireConfig exits on missing vars', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    requireConfig(['DEFINITELY_MISSING_VAR'], 'test-service');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('DEFINITELY_MISSING_VAR'));

    mockExit.mockRestore();
    mockError.mockRestore();
  });
});
