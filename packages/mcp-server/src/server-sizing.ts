export type McpServerSize = 'tiny' | 'small' | 'standard' | 'large' | 'xlarge';

export interface McpServerSizing {
  profile: McpServerSize;
  requestBodyMaxBytes: number;
  postgresPoolMax: number;
  oauthRateLimit: number;
  publicAnonRateLimit: number;
  consumerGenRateLimit: number;
  consumerGenDailyQuota: number;
}

export type McpServerSizingInput = Record<string, string | undefined>;

type McpServerSizingProfile = Omit<McpServerSizing, 'profile'>;

const MIB = 1024 * 1024;
const MIN_REQUEST_BODY_BYTES = 16 * 1024;
const MAX_REQUEST_BODY_BYTES = 100 * MIB;

export const MCP_SERVER_SIZING_PROFILES: Record<McpServerSize, McpServerSizingProfile> = {
  tiny: {
    requestBodyMaxBytes: 1 * MIB,
    postgresPoolMax: 2,
    oauthRateLimit: 30,
    publicAnonRateLimit: 10,
    consumerGenRateLimit: 2,
    consumerGenDailyQuota: 5,
  },
  small: {
    requestBodyMaxBytes: 5 * MIB,
    postgresPoolMax: 5,
    oauthRateLimit: 60,
    publicAnonRateLimit: 20,
    consumerGenRateLimit: 3,
    consumerGenDailyQuota: 10,
  },
  standard: {
    requestBodyMaxBytes: 10 * MIB,
    postgresPoolMax: 10,
    oauthRateLimit: 100,
    publicAnonRateLimit: 30,
    consumerGenRateLimit: 5,
    consumerGenDailyQuota: 20,
  },
  large: {
    requestBodyMaxBytes: 20 * MIB,
    postgresPoolMax: 20,
    oauthRateLimit: 250,
    publicAnonRateLimit: 90,
    consumerGenRateLimit: 15,
    consumerGenDailyQuota: 100,
  },
  xlarge: {
    requestBodyMaxBytes: 50 * MIB,
    postgresPoolMax: 40,
    oauthRateLimit: 500,
    publicAnonRateLimit: 180,
    consumerGenRateLimit: 30,
    consumerGenDailyQuota: 250,
  },
};

const PROFILE_NAMES = new Set(Object.keys(MCP_SERVER_SIZING_PROFILES));

function parseServerSize(env: McpServerSizingInput): McpServerSize {
  const raw = (env.MCP_SERVER_SIZE || env.HOLOSCRIPT_MCP_SERVER_SIZE || 'standard')
    .trim()
    .toLowerCase();
  if (PROFILE_NAMES.has(raw)) return raw as McpServerSize;
  return 'standard';
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  options: { min?: number; max?: number } = {}
): number {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return fallback;
  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

export function getMcpServerSizing(env: McpServerSizingInput = process.env): McpServerSizing {
  const profile = parseServerSize(env);
  const base = MCP_SERVER_SIZING_PROFILES[profile];

  return {
    profile,
    requestBodyMaxBytes: parsePositiveInt(
      env.MCP_REQUEST_BODY_MAX_BYTES || env.MCP_MAX_REQUEST_BODY_BYTES,
      base.requestBodyMaxBytes,
      { min: MIN_REQUEST_BODY_BYTES, max: MAX_REQUEST_BODY_BYTES }
    ),
    postgresPoolMax: parsePositiveInt(
      env.MCP_POSTGRES_POOL_MAX || env.PGPOOL_MAX,
      base.postgresPoolMax,
      { min: 1, max: 100 }
    ),
    oauthRateLimit: parsePositiveInt(env.OAUTH_RATE_LIMIT, base.oauthRateLimit),
    publicAnonRateLimit: parsePositiveInt(env.PUBLIC_ANON_RATE_LIMIT, base.publicAnonRateLimit),
    consumerGenRateLimit: parsePositiveInt(
      env.HOLOSCRIPT_CONSUMER_GEN_RATE_LIMIT,
      base.consumerGenRateLimit
    ),
    consumerGenDailyQuota: parsePositiveInt(
      env.HOLOSCRIPT_CONSUMER_GEN_DAILY_QUOTA,
      base.consumerGenDailyQuota
    ),
  };
}
