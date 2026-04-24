import { readFileSync } from 'node:fs';
import type { LLMProviderName } from '@holoscript/llm-provider';

export interface AgentSpec {
  handle: string;
  brainPath: string;
  provider: LLMProviderName;
  model: string;
  walletEnvKey: string;
  bearerEnvKey: string;
  budgetUsdPerDay?: number;
  scopeTier?: 'cold' | 'warm' | 'hot';
  enabled?: boolean;
  tickIntervalMs?: number;
  enableCommitHook?: boolean;
  outputDir?: string;
  workingDir?: string;
}

export interface SupervisorConfig {
  agents: AgentSpec[];
  globalBudgetUsdPerDay?: number;
  defaultTickIntervalMs?: number;
}

const VALID_PROVIDERS: ReadonlySet<LLMProviderName> = new Set([
  'anthropic',
  'openai',
  'gemini',
  'mock',
  'bitnet',
  'local-llm',
]);

const VALID_TIERS: ReadonlySet<string> = new Set(['cold', 'warm', 'hot']);
const HANDLE_PATTERN = /^[a-z0-9_-]{1,64}$/i;

export function loadSupervisorConfig(path: string): SupervisorConfig {
  return parseSupervisorConfig(readFileSync(path, 'utf8'));
}

export function parseSupervisorConfig(raw: string): SupervisorConfig {
  const data = JSON.parse(raw) as unknown;
  if (!isObject(data)) throw new Error('Supervisor config must be a JSON object');
  if (!Array.isArray(data.agents)) throw new Error('Supervisor config.agents must be an array');
  if (data.agents.length === 0) throw new Error('Supervisor config.agents must have at least one entry');

  const seenHandles = new Set<string>();
  const agents: AgentSpec[] = data.agents.map((entry, idx) => validateAgent(entry, idx, seenHandles));

  const globalBudgetUsdPerDay = optionalNumber(data, 'globalBudgetUsdPerDay');
  const defaultTickIntervalMs = optionalNumber(data, 'defaultTickIntervalMs');
  if (globalBudgetUsdPerDay != null && globalBudgetUsdPerDay <= 0) {
    throw new Error(`globalBudgetUsdPerDay must be positive, got ${globalBudgetUsdPerDay}`);
  }
  if (defaultTickIntervalMs != null && defaultTickIntervalMs < 5000) {
    throw new Error(`defaultTickIntervalMs must be >= 5000ms (mesh-friendly), got ${defaultTickIntervalMs}`);
  }

  return { agents, globalBudgetUsdPerDay, defaultTickIntervalMs };
}

function validateAgent(entry: unknown, idx: number, seen: Set<string>): AgentSpec {
  if (!isObject(entry)) throw new Error(`agents[${idx}] must be an object`);
  const handle = requiredString(entry, 'handle', `agents[${idx}].handle`);
  if (!HANDLE_PATTERN.test(handle)) {
    throw new Error(`agents[${idx}].handle "${handle}" must match ${HANDLE_PATTERN}`);
  }
  if (seen.has(handle)) throw new Error(`Duplicate agent handle: "${handle}"`);
  seen.add(handle);

  const provider = requiredString(entry, 'provider', `agents[${idx}].provider`);
  if (!VALID_PROVIDERS.has(provider as LLMProviderName)) {
    throw new Error(
      `agents[${idx}].provider "${provider}" not in [${[...VALID_PROVIDERS].join(', ')}]`
    );
  }

  const scopeTier = optionalString(entry, 'scopeTier');
  if (scopeTier && !VALID_TIERS.has(scopeTier)) {
    throw new Error(`agents[${idx}].scopeTier "${scopeTier}" must be cold | warm | hot`);
  }

  const budgetUsdPerDay = optionalNumber(entry, 'budgetUsdPerDay');
  if (budgetUsdPerDay != null && budgetUsdPerDay <= 0) {
    throw new Error(`agents[${idx}].budgetUsdPerDay must be positive, got ${budgetUsdPerDay}`);
  }
  const tickIntervalMs = optionalNumber(entry, 'tickIntervalMs');
  if (tickIntervalMs != null && tickIntervalMs < 5000) {
    throw new Error(`agents[${idx}].tickIntervalMs must be >= 5000ms, got ${tickIntervalMs}`);
  }

  return {
    handle,
    brainPath: requiredString(entry, 'brainPath', `agents[${idx}].brainPath`),
    provider: provider as LLMProviderName,
    model: requiredString(entry, 'model', `agents[${idx}].model`),
    walletEnvKey: requiredString(entry, 'walletEnvKey', `agents[${idx}].walletEnvKey`),
    bearerEnvKey: requiredString(entry, 'bearerEnvKey', `agents[${idx}].bearerEnvKey`),
    budgetUsdPerDay,
    scopeTier: scopeTier as 'cold' | 'warm' | 'hot' | undefined,
    enabled: optionalBoolean(entry, 'enabled'),
    tickIntervalMs,
    enableCommitHook: optionalBoolean(entry, 'enableCommitHook'),
    outputDir: optionalString(entry, 'outputDir'),
    workingDir: optionalString(entry, 'workingDir'),
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requiredString(obj: Record<string, unknown>, key: string, label: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`${label} is required and must be a non-empty string`);
  }
  return v.trim();
}

function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new Error(`${key} must be a string when present`);
  return v.trim();
}

function optionalNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${key} must be a finite number when present`);
  }
  return v;
}

function optionalBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw new Error(`${key} must be a boolean when present`);
  return v;
}
