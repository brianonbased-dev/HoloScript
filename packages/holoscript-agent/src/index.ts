#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  createAnthropicProvider,
  createOpenAIProvider,
  createGeminiProvider,
  createMockProvider,
  createLocalLLMProvider,
} from '@holoscript/llm-provider';
import type { ILLMProvider, LLMProviderName } from '@holoscript/llm-provider';
import { loadIdentity, identityForLog } from './identity.js';
import { loadBrain } from './brain.js';
import { CostGuard } from './cost-guard.js';
import { HolomeshClient } from './holomesh-client.js';
import { AgentRunner } from './runner.js';
import { makeCommitHook } from './commit-hook.js';
import { runAblation, renderAblationMarkdown } from './ablation.js';
import type { AblationProviderSpec, AblationTaskSpec } from './ablation.js';
import { Supervisor } from './supervisor.js';
import type { ProviderFactory } from './supervisor.js';
import { loadSupervisorConfig } from './supervisor-config.js';
import type { AgentSpec } from './supervisor-config.js';
import { provisionAgent } from './provision.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
    case 'ablate':
      await cmdAblate(args.slice(1));
      return;
    case 'supervise':
      await cmdSupervise(args.slice(1));
      return;
    case 'status':
      await cmdStatus(args.slice(1));
      return;
    case 'provision':
      await cmdProvision(args.slice(1));
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

function supervisorProviderFactory(): ProviderFactory {
  return (spec: AgentSpec) => {
    switch (spec.provider) {
      case 'anthropic':
        return createAnthropicProvider({ defaultModel: spec.model });
      case 'openai':
        return createOpenAIProvider({ defaultModel: spec.model });
      case 'gemini':
        return createGeminiProvider({ defaultModel: spec.model });
      case 'local-llm':
        return createLocalLLMProvider({
          baseURL: process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL,
          model: spec.model,
        });
      case 'mock':
        return createMockProvider();
      default:
        throw new Error(`Provider "${spec.provider}" not yet wired in supervisor — Phase 2.5 deliverable.`);
    }
  };
}

async function cmdSupervise(rest: string[]): Promise<void> {
  const cfgPath = rest.find((a) => a.startsWith('--config='))?.split('=')[1];
  if (!cfgPath) {
    throw new Error('Usage: holoscript-agent supervise --config=<path-to-agents.json>');
  }
  const teamId = process.env.HOLOMESH_TEAM_ID;
  if (!teamId) throw new Error('HOLOMESH_TEAM_ID env var required for supervise command');

  const config = loadSupervisorConfig(cfgPath);
  const sup = new Supervisor({
    config,
    providerFactory: supervisorProviderFactory(),
    teamId,
    meshApiBase: process.env.HOLOMESH_API_BASE,
    logger: (ev) => console.log(JSON.stringify(ev)),
  });

  const onSig = async () => {
    await sup.stop();
    setTimeout(() => process.exit(0), 250);
  };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);

  await sup.start();
  console.log(JSON.stringify({ ts: new Date().toISOString(), ev: 'supervise-running', config: cfgPath }));

  const reportEvery = Number(process.env.HOLOSCRIPT_AGENT_STATUS_REPORT_MS ?? '300000');
  if (reportEvery > 0) {
    setInterval(() => {
      console.log(JSON.stringify({ ts: new Date().toISOString(), ev: 'supervisor-status', ...sup.status() }));
    }, reportEvery);
  }
}

async function cmdProvision(rest: string[]): Promise<void> {
  const handle = rest.find((a) => a.startsWith('--handle='))?.split('=')[1];
  if (!handle) {
    throw new Error('Usage: holoscript-agent provision --handle=<name> [--execute] [--force]');
  }
  const execute = rest.includes('--execute');
  const force = rest.includes('--force');
  const founderBearer = process.env.HOLOMESH_API_KEY;
  if (!founderBearer) {
    throw new Error('HOLOMESH_API_KEY env var required for provisioning (founder-tier bearer for /register endpoints)');
  }
  const result = await provisionAgent(
    {
      handle,
      founderBearer,
      meshApiBase: process.env.HOLOMESH_API_BASE,
      seatsRoot: process.env.HOLOSCRIPT_AGENT_SEATS_ROOT,
    },
    { execute, force }
  );
  console.log(JSON.stringify({ ts: new Date().toISOString(), ev: 'provision-result', ...result }, null, 2));
  if (result.status === 'executed' || result.status === 'reused') {
    console.log('\n# Add these lines to your .env to use this seat:');
    for (const line of result.envVarLines) console.log(line);
  }
}

async function cmdStatus(rest: string[]): Promise<void> {
  const cfgPath = rest.find((a) => a.startsWith('--config='))?.split('=')[1];
  if (!cfgPath) {
    throw new Error('Usage: holoscript-agent status --config=<path-to-agents.json>');
  }
  const config = loadSupervisorConfig(cfgPath);
  console.log(JSON.stringify({
    config: cfgPath,
    agentCount: config.agents.length,
    enabled: config.agents.filter((a) => a.enabled !== false).map((a) => a.handle),
    disabled: config.agents.filter((a) => a.enabled === false).map((a) => a.handle),
    globalBudgetUsdPerDay: config.globalBudgetUsdPerDay ?? null,
    defaultTickIntervalMs: config.defaultTickIntervalMs ?? null,
  }, null, 2));
}

async function cmdAblate(rest: string[]): Promise<void> {
  const specPath = rest.find((a) => a.startsWith('--spec='))?.split('=')[1];
  if (!specPath) {
    throw new Error('Usage: holoscript-agent ablate --spec=<path-to-ablation.json> [--out-md=<path>] [--out-json=<path>]');
  }
  const outMd = rest.find((a) => a.startsWith('--out-md='))?.split('=')[1];
  const outJson = rest.find((a) => a.startsWith('--out-json='))?.split('=')[1];
  if (!existsSync(specPath)) throw new Error(`Spec file not found: ${specPath}`);

  const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
    task: AblationTaskSpec;
    providers: Array<{
      label: string;
      provider: 'anthropic' | 'openai' | 'gemini' | 'local-llm' | 'mock';
      model: string;
      pricePerMtokInput?: number;
      pricePerMtokOutput?: number;
      pricePerCallUsd?: number;
    }>;
    timeoutPerCellMs?: number;
  };

  const providers: AblationProviderSpec[] = spec.providers.map((p) => ({
    label: p.label,
    provider: p.provider,
    model: p.model,
    build: () => {
      switch (p.provider) {
        case 'anthropic':
          return createAnthropicProvider({ defaultModel: p.model });
        case 'openai':
          return createOpenAIProvider({ defaultModel: p.model });
        case 'gemini':
          return createGeminiProvider({ defaultModel: p.model });
        case 'local-llm':
          return createLocalLLMProvider({
            baseURL: process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL,
            model: p.model,
          });
        case 'mock':
          return createMockProvider();
      }
    },
    pricer: p.pricePerCallUsd != null
      ? () => p.pricePerCallUsd!
      : p.pricePerMtokInput != null && p.pricePerMtokOutput != null
        ? (u) => (u.promptTokens * p.pricePerMtokInput! + u.completionTokens * p.pricePerMtokOutput!) / 1_000_000
        : undefined,
  }));

  const startMsg = JSON.stringify({ ts: new Date().toISOString(), ev: 'ablation-start', task: spec.task.taskId, cells: providers.length });
  console.log(startMsg);

  const matrix = await runAblation({
    task: spec.task,
    providers,
    timeoutPerCellMs: spec.timeoutPerCellMs,
  });

  if (outJson) {
    mkdirSync(dirname(resolve(outJson)), { recursive: true });
    writeFileSync(outJson, JSON.stringify(matrix, null, 2), 'utf8');
  }
  if (outMd) {
    mkdirSync(dirname(resolve(outMd)), { recursive: true });
    writeFileSync(outMd, renderAblationMarkdown(matrix), 'utf8');
  }
  if (!outMd && !outJson) {
    console.log(renderAblationMarkdown(matrix));
  }

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    ev: 'ablation-done',
    task: matrix.taskId,
    cells: matrix.cells.length,
    errors: matrix.cells.filter((c) => c.errorMessage).length,
    totalCostUsd: matrix.totalCostUsd,
    promptHash: matrix.promptHash,
    outMd: outMd ?? null,
    outJson: outJson ?? null,
  }));
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
    case 'local-llm':
      return createLocalLLMProvider({
        baseURL: process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL,
        model: identity.llmModel,
      });
    default:
      throw new Error(
        `Provider "${p}" not yet wired in CLI — Phase 2 deliverable. Use anthropic | openai | gemini | local-llm | mock for now.`
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
  holoscript-agent run                              start the daemon (heartbeat + claim + execute loop)
  holoscript-agent tick                             single tick, then exit (useful in CI / cron / smoke tests)
  holoscript-agent whoami                           verify identity tuple resolves end-to-end (/me + env)
  holoscript-agent ablate --spec=<path>             run a cross-LLM ablation; spec = JSON with task + providers
                          [--out-md=<path>]         optional: write markdown ablation table
                          [--out-json=<path>]       optional: write structured JSON matrix
  holoscript-agent supervise --config=<path>        run N agents from agents.json (multi-agent daemon)
  holoscript-agent status --config=<path>           print parsed config summary (validates schema)
  holoscript-agent provision --handle=<name>        provision a fresh x402 seat for a brain (dry-run by default)
                             [--execute]            actually generate wallet + register against production
                             [--force]              re-register a handle whose seat already exists (dangerous)
  holoscript-agent help                             print this

REQUIRED ENV
  HOLOSCRIPT_AGENT_HANDLE            agent handle (e.g. "security-auditor")
  HOLOSCRIPT_AGENT_PROVIDER          anthropic | openai | gemini | local-llm | mock
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
  HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL  local-llm provider base URL (default http://localhost:8080)
`);
}

main().catch((err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), ev: 'fatal', message: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
