import type { ILLMProvider } from '@holoscript/llm-provider';
import type { CostGuard } from './cost-guard.js';
import type { HolomeshClient } from './holomesh-client.js';
import { pickClaimableTask } from './holomesh-client.js';
import type { AuditLog } from './audit-log.js';
import type {
  AgentIdentity,
  BoardTask,
  ExecutionResult,
  RuntimeBrainConfig,
  TickResult,
} from './types.js';

export interface AgentRunnerOptions {
  identity: AgentIdentity;
  brain: RuntimeBrainConfig;
  provider: ILLMProvider;
  costGuard: CostGuard;
  mesh: HolomeshClient;
  logger?: (event: Record<string, unknown>) => void;
  onTaskExecuted?: (result: ExecutionResult, task: BoardTask) => Promise<void>;
  auditLog?: AuditLog;
}

export class AgentRunner {
  private stopped = false;
  constructor(private readonly opts: AgentRunnerOptions) {}

  async tick(): Promise<TickResult> {
    const { identity, brain, mesh, costGuard, provider, logger } = this.opts;
    const log = logger ?? (() => undefined);

    await mesh.heartbeat({ agentName: identity.handle, surface: identity.surface });

    if (costGuard.isOverBudget()) {
      const state = costGuard.getState();
      log({ ev: 'over-budget', spentUsd: state.spentUsd, budget: identity.budgetUsdPerDay });
      return {
        action: 'over-budget',
        spentUsd: state.spentUsd,
        remainingUsd: 0,
        message: `daily budget $${identity.budgetUsdPerDay} exhausted`,
      };
    }

    const tasks = await mesh.getOpenTasks();
    const target = pickClaimableTask(tasks, brain.capabilityTags);
    if (!target) {
      log({ ev: 'no-claimable-task', open: tasks.length });
      return {
        action: 'no-claimable-task',
        spentUsd: costGuard.getState().spentUsd,
        remainingUsd: costGuard.getRemainingUsd(),
      };
    }

    log({ ev: 'claim', taskId: target.id, title: target.title });
    await mesh.claim(target.id);

    const start = Date.now();
    const response = await provider.complete(
      {
        messages: [
          { role: 'system', content: brain.systemPrompt },
          { role: 'user', content: buildTaskPrompt(target) },
        ],
        maxTokens: 4096,
        temperature: 0.4,
      },
      identity.llmModel
    );
    const durationMs = Date.now() - start;

    const cost = costGuard.recordUsage(identity.llmModel, response.usage);
    log({
      ev: 'executed',
      taskId: target.id,
      costUsd: cost.costUsd.toFixed(4),
      spentUsd: cost.spentUsd.toFixed(4),
      tokens: response.usage.totalTokens,
    });

    const execResult: ExecutionResult = {
      taskId: target.id,
      responseText: response.content,
      usage: response.usage,
      costUsd: cost.costUsd,
      durationMs,
    };

    if (this.opts.onTaskExecuted) {
      await this.opts.onTaskExecuted(execResult, target);
    } else {
      await mesh.sendMessageOnTask(
        target.id,
        `[${identity.handle}] response (${response.usage.totalTokens} tok, $${cost.costUsd.toFixed(4)}):\n\n${response.content}`
      );
    }

    if (this.opts.auditLog) {
      try {
        this.opts.auditLog.recordTaskExecuted({
          identity,
          task: target,
          result: execResult,
        });
      } catch (err) {
        log({ ev: 'audit-log-error', message: err instanceof Error ? err.message : String(err) });
      }
    }

    return {
      action: 'executed',
      taskId: target.id,
      spentUsd: cost.spentUsd,
      remainingUsd: cost.remainingUsd,
    };
  }

  async runForever(opts: { tickIntervalMs?: number } = {}): Promise<void> {
    const interval = opts.tickIntervalMs ?? 60_000;
    while (!this.stopped) {
      try {
        await this.tick();
      } catch (err) {
        const log = this.opts.logger ?? (() => undefined);
        log({ ev: 'tick-error', message: err instanceof Error ? err.message : String(err) });
      }
      await sleep(interval + jitter(interval));
    }
  }

  stop(): void {
    this.stopped = true;
  }
}

function buildTaskPrompt(task: BoardTask): string {
  return [
    `Board task to execute: ${task.id}`,
    `Title: ${task.title}`,
    `Priority: ${task.priority}`,
    `Tags: ${(task.tags ?? []).join(', ')}`,
    '',
    'Description:',
    task.description ?? '(no description)',
    '',
    'Produce the deliverable described in the task. Apply your brain composition rules — anti-patterns, decision loop, and scope tier all bind. Return the response as plain text suitable for posting to /room as a message on this task.',
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base: number): number {
  return Math.floor((Math.random() - 0.5) * base * 0.2);
}
