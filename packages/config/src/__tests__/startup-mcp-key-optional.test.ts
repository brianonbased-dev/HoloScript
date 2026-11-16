import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REQUIRED_VARS,
  validateConfig,
  requireMcpApiKey,
  getMcpApiKey,
  getMcpApiKeyAsync,
  mcpAuthHeaders,
  mcpAuthHeadersAsync,
  MISSING_MCP_API_KEY_ERROR,
  configureConfigSecretResolver,
  resetConfigSecretResolver,
  invalidateOAuthTokenCache,
} from '../index';

const SENTINEL_LEGACY = 'SENTINEL_HOLOSCRIPT_API_KEY_VALUE';
const SENTINEL_MCP = 'SENTINEL_MCP_API_KEY_VALUE';

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  resetConfigSecretResolver();
  invalidateOAuthTokenCache();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('REQUIRED_VARS: studio/absorb start without HOLOSCRIPT_MCP_API_KEY', () => {
  it('STUDIO validation passes when HOLOSCRIPT_MCP_API_KEY is unset', () => {
    delete process.env.HOLOSCRIPT_MCP_API_KEY;
    expect(REQUIRED_VARS.STUDIO).not.toContain('HOLOSCRIPT_MCP_API_KEY');
    const result = validateConfig([...REQUIRED_VARS.STUDIO]);
    expect(result.valid).toBe(true);
    expect(result.missing).not.toContain('HOLOSCRIPT_MCP_API_KEY');
  });

  it('ABSORB_SERVICE validation passes when HOLOSCRIPT_MCP_API_KEY is unset if DATABASE_URL is set', () => {
    delete process.env.HOLOSCRIPT_MCP_API_KEY;
    process.env.DATABASE_URL = 'postgres://example.invalid/db';
    expect(REQUIRED_VARS.ABSORB_SERVICE).not.toContain('HOLOSCRIPT_MCP_API_KEY');
    expect(REQUIRED_VARS.ABSORB_SERVICE).toContain('DATABASE_URL');
    const result = validateConfig([...REQUIRED_VARS.ABSORB_SERVICE]);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('MCP_SERVER validation still fails without HOLOSCRIPT_MCP_API_KEY', () => {
    delete process.env.HOLOSCRIPT_MCP_API_KEY;
    expect(REQUIRED_VARS.MCP_SERVER).toContain('HOLOSCRIPT_MCP_API_KEY');
    const result = validateConfig([...REQUIRED_VARS.MCP_SERVER]);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('HOLOSCRIPT_MCP_API_KEY');
  });
});

describe('MCP features fail closed when HOLOSCRIPT_MCP_API_KEY is missing', () => {
  it('require/outbound helpers ignore legacy sentinels and never emit them', async () => {
    delete process.env.HOLOSCRIPT_MCP_API_KEY;
    vi.stubEnv('HOLOSCRIPT_API_KEY', SENTINEL_LEGACY);
    vi.stubEnv('MCP_API_KEY', SENTINEL_MCP);
    process.env.HOLOSCRIPT_API_KEY = SENTINEL_LEGACY;
    process.env.MCP_API_KEY = SENTINEL_MCP;

    configureConfigSecretResolver({
      async resolve(nameOrRef: string) {
        return process.env[nameOrRef];
      },
    });

    expect(getMcpApiKey()).toBe('');
    expect(() => requireMcpApiKey()).toThrow(MISSING_MCP_API_KEY_ERROR);
    expect(await getMcpApiKeyAsync()).toBe('');

    const syncHeaders = mcpAuthHeaders();
    expect(syncHeaders).toEqual({});
    expect(JSON.stringify(syncHeaders)).not.toContain(SENTINEL_LEGACY);
    expect(JSON.stringify(syncHeaders)).not.toContain(SENTINEL_MCP);

    const asyncHeaders = await mcpAuthHeadersAsync();
    expect(asyncHeaders).toEqual({});
    expect(JSON.stringify(asyncHeaders)).not.toContain(SENTINEL_LEGACY);
    expect(JSON.stringify(asyncHeaders)).not.toContain(SENTINEL_MCP);
    expect(JSON.stringify(asyncHeaders)).not.toMatch(/Bearer\s+/);
  });

  it('treats blank or whitespace HOLOSCRIPT_MCP_API_KEY as missing (trim supported)', async () => {
    process.env.HOLOSCRIPT_MCP_API_KEY = '   ';
    process.env.HOLOSCRIPT_API_KEY = SENTINEL_LEGACY;
    process.env.MCP_API_KEY = SENTINEL_MCP;
    configureConfigSecretResolver({
      async resolve(nameOrRef: string) {
        return process.env[nameOrRef];
      },
    });

    expect(getMcpApiKey()).toBe('');
    expect(() => requireMcpApiKey()).toThrow(MISSING_MCP_API_KEY_ERROR);
    expect(await getMcpApiKeyAsync()).toBe('');
    expect(mcpAuthHeaders()).toEqual({});
    expect(await mcpAuthHeadersAsync()).toEqual({});
  });
});
