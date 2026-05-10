import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface AIBrittneyChannel {
  id: string;
  type: string;
  target: string;
  enabled: boolean;
  createdAt: string;
}

export interface GatewayState {
  status: 'starting' | 'running' | 'stopped';
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  configPath: string;
  channelCount: number;
}

export interface AIBrittneyLocalConfig {
  model?: string;
  ollamaHost?: string;
  apiKeyEnv?: string;
  toolsEnabled?: boolean;
  channels: AIBrittneyChannel[];
  gateway?: GatewayState;
}

export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.AIBRITTNEY_CONFIG) return env.AIBRITTNEY_CONFIG;

  const base =
    env.XDG_CONFIG_HOME ??
    (process.platform === 'win32'
      ? join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'aibrittney')
      : join(homedir(), '.config', 'aibrittney'));
  return join(base, 'config.json');
}

export function emptyLocalConfig(): AIBrittneyLocalConfig {
  return { channels: [] };
}

export function readLocalConfig(path = defaultConfigPath()): AIBrittneyLocalConfig {
  if (!existsSync(path)) return emptyLocalConfig();

  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return normalizeLocalConfig(raw, path);
}

export function writeLocalConfig(config: AIBrittneyLocalConfig, path = defaultConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const normalized = normalizeLocalConfig(config, path);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

export function resolveApiKey(config: AIBrittneyLocalConfig, env: NodeJS.ProcessEnv = process.env): string {
  const envName = config.apiKeyEnv ?? 'OLLAMA_API_KEY';
  return env[envName] ?? '';
}

export function upsertChannel(
  config: AIBrittneyLocalConfig,
  channel: Omit<AIBrittneyChannel, 'createdAt'> & { createdAt?: string },
): AIBrittneyLocalConfig {
  const next = { ...config, channels: config.channels.slice() };
  const normalized: AIBrittneyChannel = {
    ...channel,
    createdAt: channel.createdAt ?? new Date().toISOString(),
  };
  const idx = next.channels.findIndex((c) => c.id === normalized.id);
  if (idx >= 0) next.channels[idx] = normalized;
  else next.channels.push(normalized);
  return next;
}

export function removeChannel(config: AIBrittneyLocalConfig, id: string): AIBrittneyLocalConfig {
  return {
    ...config,
    channels: config.channels.filter((channel) => channel.id !== id),
  };
}

export function setChannelEnabled(
  config: AIBrittneyLocalConfig,
  id: string,
  enabled: boolean,
): AIBrittneyLocalConfig {
  return {
    ...config,
    channels: config.channels.map((channel) =>
      channel.id === id ? { ...channel, enabled } : channel,
    ),
  };
}

export function setGatewayState(
  config: AIBrittneyLocalConfig,
  gateway: GatewayState,
): AIBrittneyLocalConfig {
  return { ...config, gateway };
}

function normalizeLocalConfig(raw: unknown, configPath: string): AIBrittneyLocalConfig {
  if (!isRecord(raw)) return emptyLocalConfig();

  const channels = Array.isArray(raw.channels)
    ? raw.channels.flatMap((item) => normalizeChannel(item))
    : [];
  const gateway = normalizeGateway(raw.gateway, configPath, channels.length);

  return {
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model : undefined,
    ollamaHost: typeof raw.ollamaHost === 'string' && raw.ollamaHost.trim() ? raw.ollamaHost : undefined,
    apiKeyEnv: typeof raw.apiKeyEnv === 'string' && raw.apiKeyEnv.trim() ? raw.apiKeyEnv : undefined,
    toolsEnabled: typeof raw.toolsEnabled === 'boolean' ? raw.toolsEnabled : undefined,
    channels,
    gateway,
  };
}

function normalizeChannel(raw: unknown): AIBrittneyChannel[] {
  if (!isRecord(raw)) return [];
  if (typeof raw.id !== 'string' || !raw.id.trim()) return [];
  if (typeof raw.type !== 'string' || !raw.type.trim()) return [];
  if (typeof raw.target !== 'string' || !raw.target.trim()) return [];

  return [
    {
      id: raw.id.trim(),
      type: raw.type.trim(),
      target: raw.target.trim(),
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      createdAt:
        typeof raw.createdAt === 'string' && raw.createdAt.trim()
          ? raw.createdAt
          : new Date().toISOString(),
    },
  ];
}

function normalizeGateway(
  raw: unknown,
  configPath: string,
  channelCount: number,
): GatewayState | undefined {
  if (!isRecord(raw)) return undefined;
  const status =
    raw.status === 'starting' || raw.status === 'running' || raw.status === 'stopped'
      ? raw.status
      : 'stopped';

  return {
    status,
    pid: typeof raw.pid === 'number' && Number.isInteger(raw.pid) ? raw.pid : undefined,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : undefined,
    stoppedAt: typeof raw.stoppedAt === 'string' ? raw.stoppedAt : undefined,
    lastHeartbeatAt:
      typeof raw.lastHeartbeatAt === 'string' ? raw.lastHeartbeatAt : undefined,
    configPath:
      typeof raw.configPath === 'string' && raw.configPath.trim() ? raw.configPath : configPath,
    channelCount:
      typeof raw.channelCount === 'number' && Number.isFinite(raw.channelCount)
        ? raw.channelCount
        : channelCount,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
