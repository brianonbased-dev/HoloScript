import { mkdirSync, appendFileSync, readFileSync, existsSync, statSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LLMProviderName } from '@holoscript/llm-provider';
import type { AgentIdentity, BoardTask, ExecutionResult } from './types.js';

export type AuditEventKind = 'task-executed' | 'ablation-cell' | 'budget-exhausted' | 'agent-crash';

export interface AuditEvent {
  ts: string;
  kind: AuditEventKind;
  agent: {
    handle: string;
    surface: string;
    wallet: string;
    walletShort: string;
    provider: LLMProviderName;
    model: string;
    brainPath: string;
  };
  task?: {
    id: string;
    title: string;
    tags: string[];
  };
  execution?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    durationMs: number;
    finishReason?: string;
    promptHash?: string;
  };
  result?: {
    commitHash?: string;
    filePath?: string;
    errorMessage?: string;
  };
  ablation?: {
    label: string;
    matrixId: string;
  };
}

export interface AuditQuery {
  agent?: string;
  task?: string;
  provider?: LLMProviderName;
  kind?: AuditEventKind;
  since?: string;
  until?: string;
  limit?: number;
}

export interface AuditLogOptions {
  logPath: string;
  maxBytes?: number;
}

export class AuditLog {
  private readonly logPath: string;
  private readonly maxBytes: number;

  constructor(opts: AuditLogOptions) {
    this.logPath = opts.logPath;
    this.maxBytes = opts.maxBytes ?? 50 * 1024 * 1024;
    mkdirSync(dirname(this.logPath), { recursive: true });
  }

  record(event: AuditEvent): void {
    this.rotateIfFull();
    appendFileSync(this.logPath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  recordTaskExecuted(opts: {
    identity: AgentIdentity;
    task: BoardTask;
    result: ExecutionResult;
    commitHash?: string;
    filePath?: string;
  }): void {
    this.record({
      ts: new Date().toISOString(),
      kind: 'task-executed',
      agent: agentFromIdentity(opts.identity),
      task: { id: opts.task.id, title: opts.task.title, tags: opts.task.tags ?? [] },
      execution: {
        promptTokens: opts.result.usage.promptTokens,
        completionTokens: opts.result.usage.completionTokens,
        totalTokens: opts.result.usage.totalTokens,
        costUsd: opts.result.costUsd,
        durationMs: opts.result.durationMs,
      },
      result: {
        commitHash: opts.commitHash,
        filePath: opts.filePath,
      },
    });
  }

  recordAblationCell(opts: {
    identity: AgentIdentity;
    matrixId: string;
    label: string;
    taskId: string;
    taskTitle: string;
    promptHash: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    durationMs: number;
    finishReason: string;
    errorMessage?: string;
  }): void {
    this.record({
      ts: new Date().toISOString(),
      kind: 'ablation-cell',
      agent: agentFromIdentity(opts.identity),
      task: { id: opts.taskId, title: opts.taskTitle, tags: ['ablation'] },
      execution: {
        promptTokens: opts.promptTokens,
        completionTokens: opts.completionTokens,
        totalTokens: opts.promptTokens + opts.completionTokens,
        costUsd: opts.costUsd,
        durationMs: opts.durationMs,
        finishReason: opts.finishReason,
        promptHash: opts.promptHash,
      },
      result: { errorMessage: opts.errorMessage },
      ablation: { label: opts.label, matrixId: opts.matrixId },
    });
  }

  query(filter: AuditQuery = {}): AuditEvent[] {
    if (!existsSync(this.logPath)) return [];
    const raw = readFileSync(this.logPath, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const events: AuditEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as AuditEvent);
      } catch {
        // Corrupt line — skip rather than fail the whole query.
        // Agents must keep flying even if one line got partially flushed.
      }
    }
    return applyFilter(events, filter);
  }

  rollup(filter: AuditQuery = {}): {
    totalEvents: number;
    byAgent: Record<string, { events: number; costUsd: number; tokens: number }>;
    byProvider: Record<string, { events: number; costUsd: number; tokens: number }>;
    totalCostUsd: number;
    totalTokens: number;
  } {
    const events = this.query(filter);
    const byAgent: Record<string, { events: number; costUsd: number; tokens: number }> = {};
    const byProvider: Record<string, { events: number; costUsd: number; tokens: number }> = {};
    let totalCostUsd = 0;
    let totalTokens = 0;
    for (const e of events) {
      const agent = e.agent.handle;
      const provider = e.agent.provider;
      const cost = e.execution?.costUsd ?? 0;
      const tokens = e.execution?.totalTokens ?? 0;
      byAgent[agent] = byAgent[agent] ?? { events: 0, costUsd: 0, tokens: 0 };
      byAgent[agent].events += 1;
      byAgent[agent].costUsd += cost;
      byAgent[agent].tokens += tokens;
      byProvider[provider] = byProvider[provider] ?? { events: 0, costUsd: 0, tokens: 0 };
      byProvider[provider].events += 1;
      byProvider[provider].costUsd += cost;
      byProvider[provider].tokens += tokens;
      totalCostUsd += cost;
      totalTokens += tokens;
    }
    return { totalEvents: events.length, byAgent, byProvider, totalCostUsd, totalTokens };
  }

  private rotateIfFull(): void {
    if (!existsSync(this.logPath)) return;
    const size = statSync(this.logPath).size;
    if (size < this.maxBytes) return;
    const archived = `${this.logPath}.${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    renameSync(this.logPath, archived);
  }
}

function agentFromIdentity(identity: AgentIdentity): AuditEvent['agent'] {
  return {
    handle: identity.handle,
    surface: identity.surface,
    wallet: identity.wallet,
    walletShort: `${identity.wallet.slice(0, 6)}…${identity.wallet.slice(-4)}`,
    provider: identity.llmProvider,
    model: identity.llmModel,
    brainPath: identity.brainPath,
  };
}

function applyFilter(events: AuditEvent[], filter: AuditQuery): AuditEvent[] {
  let result = events;
  if (filter.agent) result = result.filter((e) => e.agent.handle === filter.agent);
  if (filter.provider) result = result.filter((e) => e.agent.provider === filter.provider);
  if (filter.task) result = result.filter((e) => e.task?.id === filter.task);
  if (filter.kind) result = result.filter((e) => e.kind === filter.kind);
  if (filter.since) result = result.filter((e) => e.ts >= filter.since!);
  if (filter.until) result = result.filter((e) => e.ts <= filter.until!);
  if (filter.limit != null) result = result.slice(-filter.limit);
  return result;
}
