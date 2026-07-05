export type McpServerSize =
  | 'tiny'
  | 'small'
  | 'standard'
  | 'large'
  | 'xlarge'
  | 'laptop'
  | 'jetson'
  | 'vast'
  | 'fleet';

export type McpServerTransportHint = 'stdio' | 'streamable-http' | 'streamable-http+sse';

export interface McpServerSizing {
  profile: McpServerSize;
  useCase: string;
  recommendedConsumer: string;
  transport: McpServerTransportHint;
  requestBodyMaxBytes: number;
  postgresPoolMax: number;
  oauthRateLimit: number;
  publicAnonRateLimit: number;
  consumerGenRateLimit: number;
  consumerGenDailyQuota: number;
  maxConcurrentToolCalls: number;
  toolTimeoutMs: number;
  cacheMaxEntries: number;
  memoryBudgetMb: number;
}

export type McpServerSizingInput = Record<string, string | undefined>;

type McpServerSizingProfile = Omit<McpServerSizing, 'profile'>;

const MIB = 1024 * 1024;
const MIN_REQUEST_BODY_BYTES = 16 * 1024;
const MAX_REQUEST_BODY_BYTES = 100 * MIB;
const MIN_TOOL_TIMEOUT_MS = 1_000;
const MAX_TOOL_TIMEOUT_MS = 10 * 60_000;

export const MCP_SERVER_SIZING_PROFILES: Record<McpServerSize, McpServerSizingProfile> = {
  tiny: {
    useCase: 'constrained local smoke tests and throwaway stdio probes',
    recommendedConsumer: 'laptop-windows',
    transport: 'stdio',
    requestBodyMaxBytes: 1 * MIB,
    postgresPoolMax: 2,
    oauthRateLimit: 30,
    publicAnonRateLimit: 10,
    consumerGenRateLimit: 2,
    consumerGenDailyQuota: 5,
    maxConcurrentToolCalls: 1,
    toolTimeoutMs: 15_000,
    cacheMaxEntries: 128,
    memoryBudgetMb: 384,
  },
  small: {
    useCase: 'legacy low-traffic local HTTP deployment',
    recommendedConsumer: 'laptop-windows',
    transport: 'streamable-http',
    requestBodyMaxBytes: 5 * MIB,
    postgresPoolMax: 5,
    oauthRateLimit: 60,
    publicAnonRateLimit: 20,
    consumerGenRateLimit: 3,
    consumerGenDailyQuota: 10,
    maxConcurrentToolCalls: 2,
    toolTimeoutMs: 30_000,
    cacheMaxEntries: 512,
    memoryBudgetMb: 768,
  },
  standard: {
    useCase: 'backward-compatible hosted default',
    recommendedConsumer: 'hosted-service',
    transport: 'streamable-http',
    requestBodyMaxBytes: 10 * MIB,
    postgresPoolMax: 10,
    oauthRateLimit: 100,
    publicAnonRateLimit: 30,
    consumerGenRateLimit: 5,
    consumerGenDailyQuota: 20,
    maxConcurrentToolCalls: 4,
    toolTimeoutMs: 45_000,
    cacheMaxEntries: 1024,
    memoryBudgetMb: 1536,
  },
  large: {
    useCase: 'legacy high-traffic HTTP deployment',
    recommendedConsumer: 'hosted-service',
    transport: 'streamable-http',
    requestBodyMaxBytes: 20 * MIB,
    postgresPoolMax: 20,
    oauthRateLimit: 250,
    publicAnonRateLimit: 90,
    consumerGenRateLimit: 15,
    consumerGenDailyQuota: 100,
    maxConcurrentToolCalls: 8,
    toolTimeoutMs: 90_000,
    cacheMaxEntries: 4096,
    memoryBudgetMb: 4096,
  },
  xlarge: {
    useCase: 'legacy maximum HTTP deployment',
    recommendedConsumer: 'hosted-service',
    transport: 'streamable-http+sse',
    requestBodyMaxBytes: 50 * MIB,
    postgresPoolMax: 40,
    oauthRateLimit: 500,
    publicAnonRateLimit: 180,
    consumerGenRateLimit: 30,
    consumerGenDailyQuota: 250,
    maxConcurrentToolCalls: 16,
    toolTimeoutMs: 120_000,
    cacheMaxEntries: 8192,
    memoryBudgetMb: 8192,
  },
  laptop: {
    useCase: 'founder laptop and HoloShell local agent tooling',
    recommendedConsumer: 'laptop-windows',
    transport: 'streamable-http+sse',
    requestBodyMaxBytes: 10 * MIB,
    postgresPoolMax: 6,
    oauthRateLimit: 120,
    publicAnonRateLimit: 40,
    consumerGenRateLimit: 6,
    consumerGenDailyQuota: 30,
    maxConcurrentToolCalls: 4,
    toolTimeoutMs: 60_000,
    cacheMaxEntries: 2048,
    memoryBudgetMb: 2048,
  },
  jetson: {
    useCase: 'owned-metal Jetson edge node with tighter memory and fewer DB connections',
    recommendedConsumer: 'jetson-orin',
    transport: 'streamable-http',
    requestBodyMaxBytes: 8 * MIB,
    postgresPoolMax: 4,
    oauthRateLimit: 80,
    publicAnonRateLimit: 20,
    consumerGenRateLimit: 3,
    consumerGenDailyQuota: 15,
    maxConcurrentToolCalls: 2,
    toolTimeoutMs: 60_000,
    cacheMaxEntries: 768,
    memoryBudgetMb: 2048,
  },
  vast: {
    useCase: 'single Vast.ai GPU worker or render/inference utility node',
    recommendedConsumer: 'vast-linux-gpu',
    transport: 'streamable-http',
    requestBodyMaxBytes: 25 * MIB,
    postgresPoolMax: 16,
    oauthRateLimit: 300,
    publicAnonRateLimit: 90,
    consumerGenRateLimit: 20,
    consumerGenDailyQuota: 150,
    maxConcurrentToolCalls: 8,
    toolTimeoutMs: 120_000,
    cacheMaxEntries: 4096,
    memoryBudgetMb: 8192,
  },
  fleet: {
    useCase: 'public coordinator or multi-worker fleet gateway',
    recommendedConsumer: 'hosted-service',
    transport: 'streamable-http+sse',
    requestBodyMaxBytes: 50 * MIB,
    postgresPoolMax: 40,
    oauthRateLimit: 500,
    publicAnonRateLimit: 180,
    consumerGenRateLimit: 30,
    consumerGenDailyQuota: 250,
    maxConcurrentToolCalls: 16,
    toolTimeoutMs: 180_000,
    cacheMaxEntries: 8192,
    memoryBudgetMb: 16384,
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
    useCase: base.useCase,
    recommendedConsumer: base.recommendedConsumer,
    transport: base.transport,
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
    maxConcurrentToolCalls: parsePositiveInt(
      env.MCP_MAX_CONCURRENT_TOOL_CALLS,
      base.maxConcurrentToolCalls,
      { min: 1, max: 256 }
    ),
    toolTimeoutMs: parsePositiveInt(env.MCP_TOOL_TIMEOUT_MS, base.toolTimeoutMs, {
      min: MIN_TOOL_TIMEOUT_MS,
      max: MAX_TOOL_TIMEOUT_MS,
    }),
    cacheMaxEntries: parsePositiveInt(env.MCP_CACHE_MAX_ENTRIES, base.cacheMaxEntries, {
      min: 1,
      max: 1_000_000,
    }),
    memoryBudgetMb: parsePositiveInt(env.MCP_MEMORY_BUDGET_MB, base.memoryBudgetMb, {
      min: 128,
      max: 1_048_576,
    }),
  };
}
