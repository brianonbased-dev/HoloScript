import type { LLMProviderName } from '@holoscript/llm-provider';
import type { AgentIdentity } from './types.js';

const VALID_PROVIDERS: ReadonlySet<LLMProviderName> = new Set([
  'anthropic',
  'openai',
  'gemini',
  'mock',
  'bitnet',
  'local-llm',
]);

export function loadIdentity(env: NodeJS.ProcessEnv = process.env): AgentIdentity {
  const handle = required(env, 'HOLOSCRIPT_AGENT_HANDLE');
  const provider = required(env, 'HOLOSCRIPT_AGENT_PROVIDER');
  if (!VALID_PROVIDERS.has(provider as LLMProviderName)) {
    throw new Error(
      `HOLOSCRIPT_AGENT_PROVIDER=${provider} not in [${[...VALID_PROVIDERS].join(', ')}]`
    );
  }
  const x402Bearer = required(env, 'HOLOSCRIPT_AGENT_X402_BEARER');
  const wallet = required(env, 'HOLOSCRIPT_AGENT_WALLET');
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    throw new Error(`HOLOSCRIPT_AGENT_WALLET is not a 0x-prefixed 40-hex address: ${wallet}`);
  }
  const budgetRaw = env.HOLOSCRIPT_AGENT_BUDGET_USD_DAY ?? '5';
  const budget = Number(budgetRaw);
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error(`HOLOSCRIPT_AGENT_BUDGET_USD_DAY must be a positive number, got ${budgetRaw}`);
  }

  return {
    handle,
    surface: env.HOLOSCRIPT_AGENT_SURFACE ?? handle,
    wallet,
    x402Bearer,
    llmProvider: provider as LLMProviderName,
    llmModel: required(env, 'HOLOSCRIPT_AGENT_MODEL'),
    brainPath: required(env, 'HOLOSCRIPT_AGENT_BRAIN'),
    budgetUsdPerDay: budget,
    teamId: required(env, 'HOLOMESH_TEAM_ID'),
    meshApiBase: env.HOLOMESH_API_BASE ?? 'https://mcp.holoscript.net/api/holomesh',
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v.trim();
}

export function identityForLog(id: AgentIdentity): Record<string, string | number> {
  return {
    handle: id.handle,
    surface: id.surface,
    wallet: `${id.wallet.slice(0, 6)}…${id.wallet.slice(-4)}`,
    bearer: `${id.x402Bearer.slice(0, 6)}…`,
    provider: id.llmProvider,
    model: id.llmModel,
    brain: id.brainPath,
    budgetUsdPerDay: id.budgetUsdPerDay,
  };
}
