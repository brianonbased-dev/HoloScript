#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  createAnthropicProvider,
  createOpenAIProvider,
  createGeminiProvider,
  createMockProvider,
} from '@holoscript/llm-provider';
import type { ILLMProvider, LLMProviderName } from '@holoscript/llm-provider';
import { loadIdentity, identityForLog } from './identity.js';
import { loadBrain } from './brain.js';
import { CostGuard } from './cost-guard.js';
import { HolomeshClient } from './holomesh-client.js';
import { AgentRunner } from './runner.js';
import { makeCommitHook } from './commit-hook.js';
import type { AgentIdentity, BoardTask, ExecutionResult } from './types.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? 'help';

  switch (cmd) {
    case 'run':
      await cmdRun({ once: false });
      return;
    case 'tick':
      await cmdRun({ once: true });
      return;
    case 'whoami':
      await cmdWhoami();
      return;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(2);
  }
}

async function cmdRun(opts: { once: boolean }): Promise<void> {
  const identity = loadIdentity();
  const brain = await loadBrain(identity.brainPath, scopeTierFromEnv());
  const provider = await buildProvider(identity);
  const costGuard = new CostGuard({
    statePath: stateFilePath(identity),
    dailyBudgetUsd: identity.budgetUsdPerDay,
  });
  const mesh = new HolomeshClient({
    apiBase: identity.meshApiBase,
    bearer: identity.x402Bearer,
    teamId: identity.teamId,
  });

  const commitHook = buildCommitHook(identity, mesh);

  const runner = new AgentRunner({
    identity,
    brain,
    provider,
    costGuard,
    mesh,
    logger: (ev) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...ev })),
    onTaskExecuted: commitHook,
  });

  console.log(JSON.stringify({ ts: new Date().toISOString(), ev: 'boot', identity: identityForLog(identity), brain: { domain: brain.domain, tags: brain.capabilityTags, tier: brain.scopeTier } }));

  if (opts.once) {
    const result = await runner.tick();
    console.log(JSON.stringify({ ts: new Date().toISOString(), ev: 'tick-result', ...result }));
    return;
  }

  const interval = Number(process.env.HOLOSCRIPT_AGENT_TICK_MS ?? '60000');
  const onSig = () => {
    console.log(JSON.stringify({ ts: new Date().toISOString(), ev: 'shutdown' }));
    runner.stop();
    setTimeout(() => process.exit(0), 250);
  };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);
  await runner.runForever({ tickIntervalMs: interval });
}

async function cmdWhoami(): Promise<void> {
  const identity = loadIdentity();
  const mesh = new HolomeshClient({
    apiBase: identity.meshApiBase,
    bearer: identity.x402Bearer,
    teamId: identity.teamId,
  });
  const me = await mesh.whoAmI();
  console.log(JSON.stringify({ identity: identityForLog(identity), me }, null, 2));
}

async function buildProvider(identity: AgentIdentity): Promise<ILLMProvider> {
  const p: LLMProviderName = identity.llmProvider;
  switch (p) {
    case 'anthropic':
      return createAnthropicProvider({ defaultModel: identity.llmModel });
    case 'openai':
      return createOpenAIProvider({ defaultModel: identity.llmModel });
    case 'gemini':
      return createGeminiProvider({ defaultModel: identity.llmModel });
    case 'mock':
      return createMockProvider();
    default:
      throw new Error(
        `Provider "${p}" not yet wired in CLI — Phase 2 deliverable. Use anthropic | openai | gemini | mock for now.`
      );
  }
}

function buildCommitHook(
  identity: AgentIdentity,
  mesh: HolomeshClient
): ((result: ExecutionResult, task: BoardTask) => Promise<void>) | undefined {
  const enabled = (process.env.HOLOSCRIPT_AGENT_COMMIT_RESPONSES ?? '').toLowerCase();
  if (enabled !== '1' && enabled !== 'true') return undefined;

  const outputDir = process.env.HOLOSCRIPT_AGENT_OUTPUT_DIR ?? 'agent-out';
  const workingDir = process.env.HOLOSCRIPT_AGENT_WORKING_DIR ?? process.cwd();
  const scope = process.env.HOLOSCRIPT_AGENT_COMMIT_SCOPE ?? `agent(${identity.handle})`;
  const writer = makeCommitHook({ outputDir, workingDir, scope });

  return async (result, task) => {
    const out = await writer(result, task, identity);
    await mesh.sendMessageOnTask(
      task.id,
      `[${identity.handle}] response committed at ${out.commitHash?.slice(0, 12) ?? '(no-hash)'} -> ${out.filePath}`
    );
    if (out.commitHash) {
      await mesh.markDone(task.id, `auto: ${task.title}`, out.commitHash);
    }
  };
}

function scopeTierFromEnv(): 'cold' | 'warm' | 'hot' {
  const t = (process.env.HOLOSCRIPT_AGENT_SCOPE_TIER ?? 'warm').toLowerCase();
  if (t === 'cold' || t === 'warm' || t === 'hot') return t;
  throw new Error(`HOLOSCRIPT_AGENT_SCOPE_TIER must be cold|warm|hot, got: ${t}`);
}

function stateFilePath(identity: AgentIdentity): string {
  const dir = process.env.HOLOSCRIPT_AGENT_STATE_DIR
    ?? join(homedir(), '.holoscript-agent', 'cost-state');
  return join(dir, `${identity.handle}.json`);
}

function printHelp(): void {
  console.log(`holoscript-agent — headless agent runtime

USAGE
  holoscript-agent run         start the daemon (heartbeat + claim + execute loop)
  holoscript-agent tick        single tick, then exit (useful in CI / cron / smoke tests)
  holoscript-agent whoami      verify identity tuple resolves end-to-end (/me + env)
  holoscript-agent help        print this

REQUIRED ENV
  HOLOSCRIPT_AGENT_HANDLE            agent handle (e.g. "security-auditor")
  HOLOSCRIPT_AGENT_PROVIDER          anthropic | openai | gemini | mock
  HOLOSCRIPT_AGENT_MODEL             model id (e.g. "claude-opus-4-7")
  HOLOSCRIPT_AGENT_BRAIN             path to .hsplus brain composition
  HOLOSCRIPT_AGENT_WALLET            0x… wallet address
  HOLOSCRIPT_AGENT_X402_BEARER       per-surface mesh bearer (W.087 vertex B)
  HOLOMESH_TEAM_ID                   target team id
  ANTHROPIC_API_KEY | OPENAI_API_KEY | GEMINI_API_KEY  per provider

OPTIONAL ENV
  HOLOSCRIPT_AGENT_BUDGET_USD_DAY    default 5
  HOLOSCRIPT_AGENT_SCOPE_TIER        cold | warm | hot (default warm)
  HOLOSCRIPT_AGENT_TICK_MS           daemon tick interval, default 60000
  HOLOSCRIPT_AGENT_STATE_DIR         where to persist cost state (default ~/.holoscript-agent/cost-state)
  HOLOSCRIPT_AGENT_SURFACE           label for handoffs / presence (default = handle)
  HOLOMESH_API_BASE                  default https://mcp.holoscript.net/api/holomesh
  HOLOSCRIPT_AGENT_COMMIT_RESPONSES  "1" or "true" → write responses as memos and git-commit them
  HOLOSCRIPT_AGENT_OUTPUT_DIR        memo output dir (rel to working dir, default "agent-out")
  HOLOSCRIPT_AGENT_WORKING_DIR       git repo to commit into (default process.cwd())
  HOLOSCRIPT_AGENT_COMMIT_SCOPE      commit subject scope (default "agent(<handle>)")
`);
}

main().catch((err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), ev: 'fatal', message: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
