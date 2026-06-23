#!/usr/bin/env node
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { createHash, createDecipheriv, randomBytes, type DecipherGCM } from 'node:crypto';
import { Wallet } from 'ethers';
import {
  createAnthropicProvider,
  createOpenAIProvider,
  createGeminiProvider,
  createMockProvider,
  createLocalLLMProvider,
  createXAIProvider,
  createOpenRouterProvider,
  resolveSovereignProviderAsync,
} from '@holoscript/llm-provider';
import type { ILLMProvider, LLMProviderName } from '@holoscript/llm-provider';
import { loadIdentity, identityForLog } from './identity.js';
import { loadBrain } from './brain.js';
import { CostGuard, defaultPricerForProvider } from './cost-guard.js';
import { pickProvider, BUILT_IN_CANDIDATES } from './capability-router.js';
import { HolomeshClient } from './holomesh-client.js';
import { resolveBearerViaBroker } from './bearer-broker.js';
import { decideWalletCoherence } from './wallet-coherence.js';
import { withVaultSecrets, resolveVaultSecret } from './vault-secrets.js';
import { AgentRunner } from './runner.js';
import { makeCommitHook } from './commit-hook.js';
import { runAblation, renderAblationMarkdown } from './ablation.js';
import type { AblationProviderSpec, AblationTaskSpec } from './ablation.js';
import { Supervisor } from './supervisor.js';
import type { ProviderFactory } from './supervisor.js';
import { loadSupervisorConfig } from './supervisor-config.js';
import type { AgentSpec } from './supervisor-config.js';
import { provisionAgent } from './provision.js';
import { AuditLog } from './audit-log.js';
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
    case 'audit':
      await cmdAudit(args.slice(1));
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
  // Sovereign-node consumers (HOLOKEY_VAULT_BIN set) resolve the mesh bearer from the encrypted
  // HoloKey vault (owner = handle); every other surface gets the same env unchanged (vault-secrets.ts).
  const identity = loadIdentity(withVaultSecrets(process.env));
  const brain = await loadBrain(identity.brainPath, scopeTierFromEnv());

  // Capability-aware routing (Lane 3 Phase 4 — founder ruling 2026-05-06):
  // brain.requires/prefers/avoids drives provider selection at session start;
  // HOLOSCRIPT_AGENT_PROVIDER env becomes OVERRIDE, not source-of-truth.
  // Brains with empty requires (today's default) preserve current behavior.
  const decision = pickProvider({
    brain,
    envOverride: identity.llmProvider,
    candidates: BUILT_IN_CANDIDATES,
  });
  const effectiveIdentity =
    decision.picked === identity.llmProvider
      ? identity
      : { ...identity, llmProvider: decision.picked };
  if (decision.reason === 'env-override-mismatch') {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        ev: 'capability-router-mismatch',
        envOverride: identity.llmProvider,
        unsatisfiedRequires: decision.unsatisfiedRequires,
        excludedByAvoids: decision.excludedByAvoids,
      })
    );
  }

  const provider = await buildProvider(effectiveIdentity);
  const costGuard = new CostGuard({
    statePath: stateFilePath(identity),
    dailyBudgetUsd: identity.budgetUsdPerDay,
    pricer: defaultPricerForProvider(effectiveIdentity.llmProvider),
  });
  // Load the seat wallet ONCE: it both signs strict-mode requests AND (when no
  // explicit bearer is set) proves ownership to the HoloKey broker to fetch the
  // mesh bearer — so the edge holds only its wallet, not a plaintext bearer.
  let seat = loadSeatWallet(identity.handle);
  // Wallet coherence self-heal (W.820): the seat key MUST derive the declared identity wallet.
  // A mismatch means the key is not this agent's identity key (a mis-pasted / shared-.env stray —
  // the holojetson incident). We never sign as the wrong wallet: emit a loud canary and either
  // drop the stray key to operate bearer-only as the true identity, or halt. Coherent agents are
  // unaffected.
  const coherence = decideWalletCoherence({
    derivedAddress: seat?.address,
    declaredWallet: identity.wallet,
    hasBearer: !!identity.x402Bearer,
    halt: process.env.HOLOSCRIPT_AGENT_WALLET_COHERENCE_HALT === '1',
  });
  if (!coherence.coherent) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        ev: 'wallet-coherence-fail',
        declared: identity.wallet,
        derived: seat?.address ?? null,
        action: coherence.action,
        reason: coherence.reason,
      })
    );
    if (coherence.action === 'halt') {
      throw new Error(`wallet-coherence-fail: ${coherence.reason}`);
    }
    // degrade-to-bearer-only: drop the stray key so nothing (broker proof, request signer, receipt
    // signing) uses it. The explicit bearer carries the true declared identity.
    seat = undefined;
  }
  let bearer = identity.x402Bearer;
  if (!bearer) {
    if (!seat) {
      throw new Error(
        'No HOLOSCRIPT_AGENT_X402_BEARER set and no seat wallet found to resolve it from the ' +
          'HoloKey broker. Provide a bearer, or point at the seat wallet via ' +
          'HOLOSCRIPT_AGENT_SEATS_ROOT + HOLOSCRIPT_AGENT_SEAT_ID (+ HOLOSCRIPT_AGENT_SEAT_MASTER_KEY).'
      );
    }
    bearer = await resolveBearerViaBroker({
      privateKey: seat.wallet.privateKey,
      meshApiBase: identity.meshApiBase,
    });
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        ev: 'bearer-resolved-via-broker',
        wallet: `${seat.address.slice(0, 6)}…${seat.address.slice(-4)}`,
      })
    );
  }
  const mesh = new HolomeshClient({
    apiBase: identity.meshApiBase,
    bearer,
    teamId: identity.teamId,
    signer: buildRequestSigner(seat),
    localKnowledgePath: process.env.HOLOSCRIPT_AGENT_LOCAL_KNOWLEDGE_PATH,
  });

  const commitHook = buildCommitHook(identity, mesh);
  const auditLog = buildAuditLog();

  // Wallet-signed hardware receipts (F.123 — make the provenance artifact
  // verifiable, not plain JSON). With a seat wallet present, sign the receipt's
  // canonical body (EIP-191 personal_sign); otherwise receipts are content-hashed
  // but self-report `signed:false`.
  const signReceipt = seat
    ? async (canonical: string) => {
        const wallet = new Wallet(seat.wallet.privateKey);
        return {
          alg: 'eip191-personal-sign',
          signer: wallet.address,
          signature: await wallet.signMessage(canonical),
        };
      }
    : undefined;

  const runner = new AgentRunner({
    identity,
    brain,
    provider,
    costGuard,
    mesh,
    logger: (ev) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...ev })),
    onTaskExecuted: commitHook,
    auditLog,
    signReceipt,
  });

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      ev: 'boot',
      identity: identityForLog(identity),
      brain: { domain: brain.domain, tags: brain.capabilityTags, tier: brain.scopeTier },
    })
  );

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
      case 'xai':
        return createXAIProvider({ defaultModel: spec.model });
      case 'openrouter':
        return createOpenRouterProvider({ defaultModel: spec.model });
      case 'local-llm':
        return createLocalLLMProvider({
          baseURL: process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL,
          model: spec.model,
          timeoutMs: process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS
            ? Number(process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS)
            : 300000,
        });
      case 'sovereign':
        // Universal sovereign-first resolution (founder 2026-06-10): serving
        // fleet → cloud → local Ollama → BYOK frontier keys — the same policy
        // HoloClaw's daemon and Brittney use. spec.model (when set) overrides.
        return resolveSovereignProviderAsync(spec.model ? { model: spec.model } : {}).then(
          (r) => r.provider
        );
      case 'mock':
        return createMockProvider();
      default:
        throw new Error(
          `Provider "${spec.provider}" not yet wired in supervisor — add a case here.`
        );
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
    auditLogPath: auditLogPath(),
    logger: (ev) => console.log(JSON.stringify(ev)),
  });

  const onSig = async () => {
    await sup.stop();
    setTimeout(() => process.exit(0), 250);
  };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);

  await sup.start();
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), ev: 'supervise-running', config: cfgPath })
  );

  const reportEvery = Number(process.env.HOLOSCRIPT_AGENT_STATUS_REPORT_MS ?? '300000');
  if (reportEvery > 0) {
    setInterval(() => {
      console.log(
        JSON.stringify({ ts: new Date().toISOString(), ev: 'supervisor-status', ...sup.status() })
      );
    }, reportEvery);
  }
}

async function cmdAudit(rest: string[]): Promise<void> {
  const logPath =
    rest.find((a) => a.startsWith('--log='))?.split('=')[1] ??
    process.env.HOLOSCRIPT_AGENT_AUDIT_LOG ??
    join(homedir(), '.holoscript-agent', 'audit', 'audit.jsonl');
  const sub = rest.find((a) => !a.startsWith('--')) ?? 'rollup';
  const filter: {
    agent?: string;
    provider?: string;
    task?: string;
    kind?: string;
    limit?: number;
  } = {};
  for (const arg of rest) {
    if (arg.startsWith('--agent=')) filter.agent = arg.split('=')[1];
    if (arg.startsWith('--provider=')) filter.provider = arg.split('=')[1];
    if (arg.startsWith('--task=')) filter.task = arg.split('=')[1];
    if (arg.startsWith('--kind=')) filter.kind = arg.split('=')[1];
    if (arg.startsWith('--limit=')) filter.limit = Number(arg.split('=')[1]);
  }
  const log = new AuditLog({ logPath });
  if (sub === 'rollup') {
    console.log(JSON.stringify(log.rollup(filter as never), null, 2));
  } else if (sub === 'tail' || sub === 'query') {
    const events = log.query(filter as never);
    for (const e of events) console.log(JSON.stringify(e));
  } else {
    throw new Error(
      'Usage: holoscript-agent audit [rollup|query|tail] [--agent=<h>] [--provider=<p>] [--task=<id>] [--kind=<k>] [--limit=<n>] [--log=<path>]'
    );
  }
}

async function cmdProvision(rest: string[]): Promise<void> {
  const handle = rest.find((a) => a.startsWith('--handle='))?.split('=')[1];
  if (!handle) {
    throw new Error('Usage: holoscript-agent provision --handle=<name> [--execute] [--force]');
  }
  const execute = rest.includes('--execute');
  const force = rest.includes('--force');
  // Founder-tier bearer: vault-first (owner=infra) on sovereign nodes, env-fallback everywhere else.
  const founderBearer = resolveVaultSecret(
    { name: 'HOLOMESH_API_KEY', owner: process.env.HOLOKEY_INFRA_OWNER ?? 'infra' },
    process.env
  );
  if (!founderBearer) {
    throw new Error(
      'HOLOMESH_API_KEY env var required for provisioning (founder-tier bearer for /register endpoints)'
    );
  }
  const result = await provisionAgent(
    {
      handle,
      founderBearer,
      meshApiBase: process.env.HOLOMESH_API_BASE,
      seatsRoot: process.env.HOLOSCRIPT_AGENT_SEATS_ROOT,
      autoJoinTeamId: rest.includes('--no-join') ? undefined : process.env.HOLOMESH_TEAM_ID,
    },
    { execute, force }
  );
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), ev: 'provision-result', ...result }, null, 2)
  );
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
  console.log(
    JSON.stringify(
      {
        config: cfgPath,
        agentCount: config.agents.length,
        enabled: config.agents.filter((a) => a.enabled !== false).map((a) => a.handle),
        disabled: config.agents.filter((a) => a.enabled === false).map((a) => a.handle),
        globalBudgetUsdPerDay: config.globalBudgetUsdPerDay ?? null,
        defaultTickIntervalMs: config.defaultTickIntervalMs ?? null,
      },
      null,
      2
    )
  );
}

async function cmdAblate(rest: string[]): Promise<void> {
  const specPath = rest.find((a) => a.startsWith('--spec='))?.split('=')[1];
  if (!specPath) {
    throw new Error(
      'Usage: holoscript-agent ablate --spec=<path-to-ablation.json> [--out-md=<path>] [--out-json=<path>]'
    );
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
    pricer:
      p.pricePerCallUsd != null
        ? () => p.pricePerCallUsd!
        : p.pricePerMtokInput != null && p.pricePerMtokOutput != null
          ? (u) =>
              (u.promptTokens * p.pricePerMtokInput! + u.completionTokens * p.pricePerMtokOutput!) /
              1_000_000
          : undefined,
  }));

  const startMsg = JSON.stringify({
    ts: new Date().toISOString(),
    ev: 'ablation-start',
    task: spec.task.taskId,
    cells: providers.length,
  });
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

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      ev: 'ablation-done',
      task: matrix.taskId,
      cells: matrix.cells.length,
      errors: matrix.cells.filter((c) => c.errorMessage).length,
      totalCostUsd: matrix.totalCostUsd,
      promptHash: matrix.promptHash,
      outMd: outMd ?? null,
      outJson: outJson ?? null,
    })
  );
}

async function cmdWhoami(): Promise<void> {
  const identity = loadIdentity();
  const seat = loadSeatWallet(identity.handle);
  let bearer = identity.x402Bearer;
  if (!bearer && seat) {
    bearer = await resolveBearerViaBroker({
      privateKey: seat.wallet.privateKey,
      meshApiBase: identity.meshApiBase,
    });
  }
  const mesh = new HolomeshClient({
    apiBase: identity.meshApiBase,
    bearer,
    teamId: identity.teamId,
    signer: buildRequestSigner(seat),
    localKnowledgePath: process.env.HOLOSCRIPT_AGENT_LOCAL_KNOWLEDGE_PATH,
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
    case 'xai':
      return createXAIProvider({ defaultModel: identity.llmModel });
    case 'openrouter':
      return createOpenRouterProvider({ defaultModel: identity.llmModel });
    case 'mock':
      return createMockProvider();
    case 'local-llm':
      return createLocalLLMProvider({
        baseURL: process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL,
        model: process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_MODEL ?? identity.llmModel,
        // Edge devices (Jetson ~15 tok/s) need more than the 120s default.
        // HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS overrides; default 300s.
        timeoutMs: process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS
          ? Number(process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS)
          : 300000,
      });
    case 'sovereign':
      // Match the supervisor (D.089 sovereign-first): serving fleet → cloud →
      // local Ollama → BYOK frontier keys. identity.llmModel (when set) overrides.
      return (
        await resolveSovereignProviderAsync(identity.llmModel ? { model: identity.llmModel } : {})
      ).provider;
    default:
      throw new Error(`Provider "${p}" not yet wired in CLI — add a case in buildProvider.`);
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

// ── Request signing (EIP-191) for strict-mode endpoints like /team/:id/join ──────────────────

function canonicalizeSigning(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${(value as unknown[]).map(canonicalizeSigning).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalizeSigning(obj[k])}`)
    .join(',')}}`;
}

interface SeatWallet {
  wallet: Wallet;
  address: string;
}

/**
 * Load + decrypt the seat wallet for the given handle. This is the agent's ROOT
 * credential (F.119): it both signs strict-mode requests (/join etc.) AND proves
 * ownership to the HoloKey broker to fetch the mesh bearer (bearer-broker.ts), so
 * the bearer never has to live in plaintext .env.
 *
 * `HOLOSCRIPT_AGENT_SEAT_ID` overrides the computed seat-dir name — needed when a
 * seat was provisioned under a non-default layout (e.g. the sovereign x402 seats at
 * `~/.ai-ecosystem/seats/sovereign-<surface>-<fp>-default-x402`). `HOLOSCRIPT_AGENT_SEAT_MASTER_KEY`
 * overrides the master-key path. Returns undefined when the files are absent.
 */
function loadSeatWallet(handle: string): SeatWallet | undefined {
  // Fast path: raw private key in env (edge/sovereign devices that provision via
  // wallet key directly rather than encrypted seat files, e.g. Jetson).
  const rawKey = process.env.HOLOSCRIPT_AGENT_WALLET_PRIVATE_KEY;
  if (rawKey) {
    try {
      const wallet = new Wallet(rawKey);
      // Deprecation nudge: a plaintext wallet key in .env is the leak-prone path (W.721/F.106) and
      // the exact shape behind the holojetson stray-key incident (W.820 — a single shared .env key
      // belonging to neither agent). Prefer an encrypted seat file (wallet.enc + master-key, the
      // SEATS_ROOT path below). One line at boot; the wallet still loads.
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          ev: 'wallet-key-plaintext-deprecated',
          handle,
          wallet: `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`,
          advice:
            'HOLOSCRIPT_AGENT_WALLET_PRIVATE_KEY is a plaintext .env key; migrate to an encrypted ' +
            'seat (HOLOSCRIPT_AGENT_SEATS_ROOT + HOLOSCRIPT_AGENT_SEAT_ID) — wallet-coherence still guards it.',
        })
      );
      return { wallet, address: wallet.address };
    } catch {
      // Fall through to seat-file path if key is malformed.
    }
  }
  const seatsRoot =
    process.env.HOLOSCRIPT_AGENT_SEATS_ROOT ?? join(homedir(), '.holoscript-agent', 'seats');
  const fp = createHash('sha256').update(hostname() + homedir()).digest('hex').slice(0, 8);
  const seatId = process.env.HOLOSCRIPT_AGENT_SEAT_ID ?? `holoscript-${handle}-${fp}-x402`;
  const walletPath = join(seatsRoot, seatId, 'wallet.enc');
  const masterKeyPath =
    process.env.HOLOSCRIPT_AGENT_SEAT_MASTER_KEY ?? join(seatsRoot, '.master-key');
  if (!existsSync(walletPath) || !existsSync(masterKeyPath)) return undefined;
  try {
    const blob = JSON.parse(readFileSync(walletPath, 'utf8')) as {
      address: string;
      encrypted_privkey: { iv: string; ct: string; tag: string; alg?: string };
    };
    const masterKey = readFileSync(masterKeyPath);
    const iv = Buffer.from(blob.encrypted_privkey.iv, 'base64');
    const ct = Buffer.from(blob.encrypted_privkey.ct, 'base64');
    const tag = Buffer.from(blob.encrypted_privkey.tag, 'base64');
    const decipher = createDecipheriv(
      blob.encrypted_privkey.alg ?? 'aes-256-gcm',
      masterKey,
      iv
    ) as DecipherGCM;
    decipher.setAuthTag(tag);
    const privateKey = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    return { wallet: new Wallet(privateKey), address: blob.address };
  } catch {
    return undefined;
  }
}

/**
 * Build an EIP-191 RequestSigner from an already-loaded seat wallet (signs
 * strict-mode endpoints like /team/:id/join). Returns undefined when no seat.
 */
function buildRequestSigner(
  seat: SeatWallet | undefined
): ((body: Record<string, unknown>) => Promise<Record<string, unknown>>) | undefined {
  if (!seat) return undefined;
  return async (body: Record<string, unknown>) => {
    const nonce = randomBytes(16).toString('hex');
    const timestamp = new Date().toISOString();
    const payload = canonicalizeSigning({ body, nonce, timestamp });
    const signature = await seat.wallet.signMessage(payload);
    return { body, signature, signer_address: seat.address, nonce, timestamp };
  };
}

function scopeTierFromEnv(): 'cold' | 'warm' | 'hot' {
  const t = (process.env.HOLOSCRIPT_AGENT_SCOPE_TIER ?? 'warm').toLowerCase();
  if (t === 'cold' || t === 'warm' || t === 'hot') return t;
  throw new Error(`HOLOSCRIPT_AGENT_SCOPE_TIER must be cold|warm|hot, got: ${t}`);
}

function stateFilePath(identity: AgentIdentity): string {
  const dir =
    process.env.HOLOSCRIPT_AGENT_STATE_DIR ?? join(homedir(), '.holoscript-agent', 'cost-state');
  return join(dir, `${identity.handle}.json`);
}

function auditLogPath(): string {
  return (
    process.env.HOLOSCRIPT_AGENT_AUDIT_LOG ??
    join(homedir(), '.holoscript-agent', 'audit', 'audit.jsonl')
  );
}

function buildAuditLog(): AuditLog | undefined {
  const enabled = (process.env.HOLOSCRIPT_AGENT_AUDIT_ENABLED ?? '1').toLowerCase();
  if (enabled === '0' || enabled === 'false') return undefined;
  return new AuditLog({ logPath: auditLogPath() });
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
  holoscript-agent audit [rollup|query|tail]        query the per-agent audit log (default sub: rollup)
                         [--agent=<h>]              filter by agent handle
                         [--provider=<p>]           filter by LLM provider
                         [--task=<id>]              filter by task id
                         [--kind=<k>]               filter by kind (task-executed | ablation-cell | ...)
                         [--limit=<n>]              keep last N events
                         [--log=<path>]             override log path (default ~/.holoscript-agent/audit/audit.jsonl)
  holoscript-agent help                             print this

REQUIRED ENV
  HOLOSCRIPT_AGENT_HANDLE            agent handle (e.g. "security-auditor")
  HOLOSCRIPT_AGENT_PROVIDER          anthropic | openai | gemini | xai | openrouter | local-llm | sovereign | mock
  HOLOSCRIPT_AGENT_MODEL             model id (e.g. "claude-opus-4-8")
  HOLOSCRIPT_AGENT_BRAIN             path to .hsplus brain composition
  HOLOSCRIPT_AGENT_WALLET            0x… wallet address
  HOLOMESH_TEAM_ID                   target team id
  ANTHROPIC_API_KEY | OPENAI_API_KEY | GEMINI_API_KEY  per provider

OPTIONAL ENV
  HOLOSCRIPT_AGENT_X402_BEARER       per-surface mesh bearer. OPTIONAL: when absent, the runner
                                     resolves it from the HoloKey broker by proving wallet
                                     ownership (POST /key/challenge → sign → /key/recover), so the
                                     bearer is never stored in plaintext .env. Requires a seat wallet.
  HOLOSCRIPT_AGENT_WALLET_PRIVATE_KEY raw 0x… private key (edge/sovereign devices without encrypted seat
                                     files — skips seat-wallet discovery entirely; bearer still required)
  HOLOSCRIPT_AGENT_SEAT_ID           override the computed seat-dir name (e.g. a sovereign x402 seat
                                     "sovereign-<surface>-<fp>-default-x402"); pairs with SEATS_ROOT
  HOLOSCRIPT_AGENT_SEAT_MASTER_KEY   override the master-key path used to decrypt the seat wallet.enc
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
  HOLOSCRIPT_AGENT_LOCAL_LLM_MODEL     local-llm model id (e.g. "qwen3:4b-instruct"); overrides HOLOSCRIPT_AGENT_MODEL for the local provider
  HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS  local-llm request timeout in ms (default 300000 — edge devices like Jetson need >120s)
  HOLOSCRIPT_AGENT_LOCAL_KNOWLEDGE_PATH  local JSONL path for sovereign private knowledge store (bypasses mcp-orchestrator /knowledge/sync)
  HOLOSCRIPT_AGENT_PEER_REGISTRY     peer registry for ask_peer/council capability→node resolution: inline JSON or a file path,
                                     e.g. '[{"handle":"laptop","baseUrl":"http://192.168.0.23:11434","model":"qwen3:4b-instruct","capabilities":["hardware"]}]'
  HOLOSCRIPT_AGENT_PEER_BASE_URL     single fallback peer endpoint for ask_peer/council when the registry has no match (else self-consult)
  HOLOSCRIPT_AGENT_PEER_MODEL        model id to request on the peer node (default: the agent's own model)
`);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      ev: 'fatal',
      message: err instanceof Error ? err.message : String(err),
    })
  );
  process.exit(1);
});
