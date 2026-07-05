import { describe, expect, it } from 'vitest';
import { MCP_SERVER_SIZING_PROFILES, getMcpServerSizing } from '../server-sizing';

describe('MCP server sizing', () => {
  it('keeps the previous HTTP server defaults in the standard profile', () => {
    expect(getMcpServerSizing({})).toMatchObject({
      profile: 'standard',
      requestBodyMaxBytes: 10 * 1024 * 1024,
      postgresPoolMax: 10,
      oauthRateLimit: 100,
      publicAnonRateLimit: 30,
      consumerGenRateLimit: 5,
      consumerGenDailyQuota: 20,
      maxConcurrentToolCalls: 4,
      toolTimeoutMs: 45_000,
    });
  });

  it('selects a named profile from MCP_SERVER_SIZE', () => {
    expect(getMcpServerSizing({ MCP_SERVER_SIZE: 'large' })).toMatchObject({
      profile: 'large',
      requestBodyMaxBytes: 20 * 1024 * 1024,
      postgresPoolMax: 20,
      oauthRateLimit: 250,
      publicAnonRateLimit: 90,
      consumerGenRateLimit: 15,
      consumerGenDailyQuota: 100,
      maxConcurrentToolCalls: 8,
    });
  });

  it('selects fleet use-case profiles for laptop, Jetson, Vast, and coordinator nodes', () => {
    expect(getMcpServerSizing({ MCP_SERVER_SIZE: 'laptop' })).toMatchObject({
      profile: 'laptop',
      recommendedConsumer: 'laptop-windows',
      transport: 'streamable-http+sse',
    });
    expect(getMcpServerSizing({ MCP_SERVER_SIZE: 'jetson' })).toMatchObject({
      profile: 'jetson',
      recommendedConsumer: 'jetson-orin',
      postgresPoolMax: 4,
      maxConcurrentToolCalls: 2,
    });
    expect(getMcpServerSizing({ MCP_SERVER_SIZE: 'vast' })).toMatchObject({
      profile: 'vast',
      recommendedConsumer: 'vast-linux-gpu',
      memoryBudgetMb: 8192,
    });
    expect(getMcpServerSizing({ MCP_SERVER_SIZE: 'fleet' })).toMatchObject({
      profile: 'fleet',
      recommendedConsumer: 'hosted-service',
      maxConcurrentToolCalls: 16,
    });
  });

  it('accepts the legacy-prefixed profile variable', () => {
    expect(getMcpServerSizing({ HOLOSCRIPT_MCP_SERVER_SIZE: 'tiny' })).toMatchObject({
      profile: 'tiny',
      postgresPoolMax: 2,
    });
  });

  it('lets explicit environment overrides win over the selected profile', () => {
    expect(
      getMcpServerSizing({
        MCP_SERVER_SIZE: 'small',
        MCP_REQUEST_BODY_MAX_BYTES: String(12 * 1024 * 1024),
        MCP_POSTGRES_POOL_MAX: '12',
        OAUTH_RATE_LIMIT: '111',
        PUBLIC_ANON_RATE_LIMIT: '44',
        HOLOSCRIPT_CONSUMER_GEN_RATE_LIMIT: '9',
        HOLOSCRIPT_CONSUMER_GEN_DAILY_QUOTA: '77',
        MCP_MAX_CONCURRENT_TOOL_CALLS: '7',
        MCP_TOOL_TIMEOUT_MS: '12345',
        MCP_CACHE_MAX_ENTRIES: '222',
        MCP_MEMORY_BUDGET_MB: '333',
      })
    ).toMatchObject({
      profile: 'small',
      requestBodyMaxBytes: 12 * 1024 * 1024,
      postgresPoolMax: 12,
      oauthRateLimit: 111,
      publicAnonRateLimit: 44,
      consumerGenRateLimit: 9,
      consumerGenDailyQuota: 77,
      maxConcurrentToolCalls: 7,
      toolTimeoutMs: 12345,
      cacheMaxEntries: 222,
      memoryBudgetMb: 333,
    });
  });

  it('falls back from invalid profile and override values', () => {
    expect(
      getMcpServerSizing({
        MCP_SERVER_SIZE: 'planetary',
        MCP_REQUEST_BODY_MAX_BYTES: '4',
        MCP_POSTGRES_POOL_MAX: '-1',
        OAUTH_RATE_LIMIT: '10abc',
        MCP_TOOL_TIMEOUT_MS: '999999999',
      })
    ).toMatchObject({
      profile: 'standard',
      requestBodyMaxBytes: 10 * 1024 * 1024,
      postgresPoolMax: 10,
      oauthRateLimit: 100,
      toolTimeoutMs: 45_000,
    });
  });

  it('keeps profile metadata complete for every selectable size', () => {
    for (const [profile, sizing] of Object.entries(MCP_SERVER_SIZING_PROFILES)) {
      expect(profile).toBeTruthy();
      expect(sizing.useCase).toBeTruthy();
      expect(sizing.recommendedConsumer).toBeTruthy();
      expect(sizing.requestBodyMaxBytes).toBeGreaterThan(0);
      expect(sizing.maxConcurrentToolCalls).toBeGreaterThan(0);
      expect(sizing.toolTimeoutMs).toBeGreaterThanOrEqual(1000);
      expect(sizing.cacheMaxEntries).toBeGreaterThan(0);
      expect(sizing.memoryBudgetMb).toBeGreaterThanOrEqual(128);
    }
  });
});
