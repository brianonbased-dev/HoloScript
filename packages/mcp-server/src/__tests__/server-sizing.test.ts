import { describe, expect, it } from 'vitest';
import { getMcpServerSizing } from '../server-sizing';

describe('MCP server sizing', () => {
  it('keeps the previous HTTP server defaults in the standard profile', () => {
    expect(getMcpServerSizing({})).toEqual({
      profile: 'standard',
      requestBodyMaxBytes: 10 * 1024 * 1024,
      postgresPoolMax: 10,
      oauthRateLimit: 100,
      publicAnonRateLimit: 30,
      consumerGenRateLimit: 5,
      consumerGenDailyQuota: 20,
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
      })
    ).toEqual({
      profile: 'small',
      requestBodyMaxBytes: 12 * 1024 * 1024,
      postgresPoolMax: 12,
      oauthRateLimit: 111,
      publicAnonRateLimit: 44,
      consumerGenRateLimit: 9,
      consumerGenDailyQuota: 77,
    });
  });

  it('falls back from invalid profile and override values', () => {
    expect(
      getMcpServerSizing({
        MCP_SERVER_SIZE: 'planetary',
        MCP_REQUEST_BODY_MAX_BYTES: '4',
        MCP_POSTGRES_POOL_MAX: '-1',
        OAUTH_RATE_LIMIT: '10abc',
      })
    ).toMatchObject({
      profile: 'standard',
      requestBodyMaxBytes: 10 * 1024 * 1024,
      postgresPoolMax: 10,
      oauthRateLimit: 100,
    });
  });
});
