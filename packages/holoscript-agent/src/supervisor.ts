import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ILLMProvider } from '@holoscript/llm-provider';
import { AgentRunner } from './runner.js';
import { CostGuard } from './cost-guard.js';
import { HolomeshClient } from './holomesh-client.js';
import { loadBrain } from './brain.js';
import { makeCommitHook } from './commit-hook.js';
import { AuditLog } from './audit-log.js';
import type { AgentSpec, SupervisorConfig } from './supervisor-config.js';
import type { AgentIdentity, BoardTask, ExecutionResult, RuntimeBrainConfig } from './types.js';

export interface ProviderFactory {
  (spec: AgentSpec, identity: AgentIdentity): Promise<ILLMProvider> | ILLMProvider;
}

export interface SupervisorAgentStatus {
  handle: string;
  state: 'starting' | 'running' | 'crashed' | 'over-budget' | 'stopped';
  spentUsd: number;
  remainingUsd: number;
  lastTickAt?: string;
  lastError?: string;
  restarts: number;
}

export interface SupervisorStatus {
  globalSpentUsd: number;
  globalRemainingUsd: number;
  globalBudgetExhausted: boolean;
  agents: SupervisorAgentStatus[];
}

export interface SupervisorOptions {
  config: SupervisorConfig;
  providerFactory: ProviderFactory;
  meshApiBase?: string;
  teamId: string;
  stateDir?: string;
  auditLogPath?: string;
  logger?: (event: Record<string, unknown>) => void;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class Supervisor {
  private readonly opts: SupervisorOptions;
  private readonly agents = new Map<string, ManagedAgent>();
  private stopped = false;
  private globalBudgetUsdPerDay?: number;
  private readonly auditLog?: AuditLog;

  constructor(opts: SupervisorOptions) {
    this.opts = opts;
    this.globalBudgetUsdPerDay = opts.config.globalBudgetUsdPerDay;
    this.auditLog = opts.auditLogPath ? new AuditLog({ logPath: opts.auditLogPath }) : undefined;
  }

  async start(): Promise<void> {
    const enabledAgents = this.opts.config.agents.filter((a) => a.enabled !== false);
    for (const spec of enabledAgents) {
      const managed = await this.bootAgent(spec);
      this.agents.set(spec.handle, managed);
    }
    this.log({ ev: 'supervisor-started', count: enabledAgents.length });
    for (const managed of this.agents.values()) {
      this.spawnLoop(managed);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const managed of this.agents.values()) {
      managed.runner.stop();
      managed.status.state = 'stopped';
    }
    this.log({ ev: 'supervisor-stopped', count: this.agents.size });
  }

  status(): SupervisorStatus {
    const agents = [...this.agents.values()].map((m) => ({ ...m.status }));
    const globalSpentUsd = agents.reduce((s, a) => s + a.spentUsd, 0);
    const globalBudgetExhausted = this.globalBudgetUsdPerDay != null
      ? globalSpentUsd >= this.globalBudgetUsdPerDay
      : false;
    const globalRemainingUsd = this.globalBudgetUsdPerDay != null
      ? Math.max(0, this.globalBudgetUsdPerDay - globalSpentUsd)
      : Infinity;
    return { globalSpentUsd, globalRemainingUsd, globalBudgetExhausted, agents };
  }

  async tickOnce(handle: string): Promise<SupervisorAgentStatus> {
    const managed = this.agents.get(handle);
    if (!managed) throw new Error(`No agent: ${handle}`);
    await this.runOneTick(managed);
    return { ...managed.status };
  }

  private async bootAgent(spec: AgentSpec): Promise<ManagedAgent> {
    const identity = this.identityFromSpec(spec);
    const brain = await loadBrain(spec.brainPath, spec.scopeTier ?? 'warm');
    const provider = await this.opts.providerFactory(spec, identity);
    const stateDir = this.opts.stateDir ?? join(homedir(), '.holoscript-agent', 'cost-state');
    const isFree = spec.provider === 'mock' || spec.provider === 'local-llm' || spec.provider === 'bitnet';
    const costGuard = new CostGuard({
      statePath: join(stateDir, `${spec.handle}.json`),
      dailyBudgetUsd: identity.budgetUsdPerDay,
      pricer: isFree ? () => 0 : undefined,
    });
    const mesh = new HolomeshClient({
      apiBase: identity.meshApiBase,
      bearer: identity.x402Bearer,
      teamId: identity.teamId,
      fetchImpl: this.opts.fetchImpl,
    });
    const onTaskExecuted = spec.enableCommitHook ? this.buildCommitHook(spec, identity, mesh) : undefined;
    const runner = new AgentRunner({
      identity,
      brain,
      provider,
      costGuard,
      mesh,
      onTaskExecuted,
      auditLog: this.auditLog,
      logger: (ev) => this.log({ agent: spec.handle, ...ev }),
    });
    const status: SupervisorAgentStatus = {
      handle: spec.handle,
      state: 'starting',
      spentUsd: 0,
      remainingUsd: identity.budgetUsdPerDay,
      restarts: 0,
    };
    return { spec, identity, brain, runner, costGuard, status };
  }

  private buildCommitHook(
    spec: AgentSpec,
    identity: AgentIdentity,
    mesh: HolomeshClient
  ): (result: ExecutionResult, task: BoardTask) => Promise<void> {
    const writer = makeCommitHook({
      outputDir: spec.outputDir ?? 'agent-out',
      workingDir: spec.workingDir,
      scope: `agent(${spec.handle})`,
    });
    return async (result, task) => {
      const out = await writer(result, task, identity);
      if (out.commitHash) {
        await mesh.markDone(task.id, `auto: ${task.title}`, out.commitHash);
      }
    };
  }

  private identityFromSpec(spec: AgentSpec): AgentIdentity {
    const bearer = process.env[spec.bearerEnvKey];
    if (!bearer || bearer.trim().length === 0) {
      throw new Error(`Missing bearer env var "${spec.bearerEnvKey}" for agent "${spec.handle}"`);
    }
    const wallet = process.env[spec.walletEnvKey];
    if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      throw new Error(`Missing or malformed wallet env var "${spec.walletEnvKey}" for agent "${spec.handle}"`);
    }
    return {
      handle: spec.handle,
      surface: spec.handle,
      wallet,
      x402Bearer: bearer,
      llmProvider: spec.provider,
      llmModel: spec.model,
      brainPath: spec.brainPath,
      budgetUsdPerDay: spec.budgetUsdPerDay ?? 5,
      teamId: this.opts.teamId,
      meshApiBase: this.opts.meshApiBase ?? 'https://mcp.holoscript.net/api/holomesh',
    };
  }

  private async spawnLoop(managed: ManagedAgent): Promise<void> {
    const interval = managed.spec.tickIntervalMs
      ?? this.opts.config.defaultTickIntervalMs
      ?? 60_000;
    while (!this.stopped) {
      try {
        await this.runOneTick(managed);
      } catch (err) {
        managed.status.state = 'crashed';
        managed.status.lastError = err instanceof Error ? err.message : String(err);
        managed.status.restarts += 1;
        const backoffMs = Math.min(60_000, 2 ** Math.min(managed.status.restarts, 6) * 1000);
        this.log({
          ev: 'agent-crashed-restarting',
          agent: managed.spec.handle,
          backoffMs,
          restarts: managed.status.restarts,
          message: managed.status.lastError,
        });
        await sleep(backoffMs);
        continue;
      }
      await sleep(interval + jitter(interval));
    }
  }

  private async runOneTick(managed: ManagedAgent): Promise<void> {
    if (this.globalBudgetUsdPerDay != null) {
      const totalSpent = [...this.agents.values()].reduce((s, a) => s + a.status.spentUsd, 0);
      if (totalSpent >= this.globalBudgetUsdPerDay) {
        managed.status.state = 'over-budget';
        this.log({ ev: 'global-budget-exhausted', agent: managed.spec.handle, totalSpent });
        return;
      }
    }
    const result = await managed.runner.tick();
    const cs = managed.costGuard.getState();
    managed.status.spentUsd = cs.spentUsd;
    managed.status.remainingUsd = managed.costGuard.getRemainingUsd();
    managed.status.lastTickAt = (this.opts.now ?? (() => new Date()))().toISOString();
    managed.status.state = result.action === 'over-budget' ? 'over-budget' : 'running';
    if (result.action === 'errored') {
      managed.status.lastError = result.message;
    }
  }

  private log(event: Record<string, unknown>): void {
    if (this.opts.logger) {
      this.opts.logger({ ts: new Date().toISOString(), ...event });
    }
  }
}

interface ManagedAgent {
  spec: AgentSpec;
  identity: AgentIdentity;
  brain: RuntimeBrainConfig;
  runner: AgentRunner;
  costGuard: CostGuard;
  status: SupervisorAgentStatus;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base: number): number {
  return Math.floor((Math.random() - 0.5) * base * 0.2);
}
