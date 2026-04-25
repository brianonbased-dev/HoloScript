import type { ILLMProvider, LLMMessage, TokenUsage } from '@holoscript/llm-provider';
import type { CostGuard } from './cost-guard.js';
import type { HolomeshClient } from './holomesh-client.js';
import { pickClaimableTask } from './holomesh-client.js';
import type { AuditLog } from './audit-log.js';
import { buildCaelRecord } from './cael-builder.js';
import { MESH_TOOLS, runTool } from './tools.js';
import type {
  AgentIdentity,
  BoardTask,
  ExecutionResult,
  RuntimeBrainConfig,
  TickResult,
} from './types.js';

// Bumped when the CAEL record schema or layer-hash semantics change. Lives
// in the version_vector_fingerprint of every emitted record so consumers
// can partition the corpus by runtime version.
const RUNTIME_VERSION = '1.0.0';

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
  // CAEL audit hash chain — survives across ticks within a single runner
  // process. On process restart it resets to null; the first post-restart
  // record breaks the chain, which is honest (the runner has no memory of
  // its prior chain state and shouldn't fake continuity). prev_hash=null
  // is a valid value the audit-store accepts.
  private prevCaelChain: string | null = null;

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
    // Tool-use loop. The model gets MESH_TOOLS (read_file, list_dir,
    // write_file, bash) and can iterate read→reason→read→write until it
    // emits a final text response. Without this loop the model could only
    // reason from prompt+brain alone — no filesystem access, no kernel
    // checks, no inspection of inputs scp'd to the instance. With it,
    // lean-theorist can actually `cat MSC/Invariants.lean`, `lake build`,
    // and `write_file /root/agent-output/Invariants.lean` per its brain rules.
    const messages: LLMMessage[] = [
      { role: 'system', content: brain.systemPrompt },
      { role: 'user', content: buildTaskPrompt(target) },
    ];
    let aggUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finalText = '';
    let iters = 0;
    // 30-iter cap: lean-theorist on Paper 22 needed 13 iters to read MSC files
    // + run lake build + iterate kernel checks. 12 was too tight (cap fired
    // before write_file deliverable). 30 allows ~3x that depth — anything
    // hitting 30 iters is almost certainly stuck and should bail.
    const MAX_TOOL_ITERS = 30;
    let lastResponse;
    while (true) {
      iters++;
      if (iters > MAX_TOOL_ITERS) {
        log({ ev: 'tool-loop-cap', taskId: target.id, iters });
        finalText = finalText || `[tool-loop hit ${MAX_TOOL_ITERS}-iter cap before final text]`;
        break;
      }
      const resp = await provider.complete(
        {
          messages,
          maxTokens: 4096,
          temperature: 0.4,
          tools: MESH_TOOLS,
        },
        identity.llmModel
      );
      lastResponse = resp;
      aggUsage = {
        promptTokens: aggUsage.promptTokens + resp.usage.promptTokens,
        completionTokens: aggUsage.completionTokens + resp.usage.completionTokens,
        totalTokens: aggUsage.totalTokens + resp.usage.totalTokens,
      };
      // If model called tools, execute them and feed results back.
      if (resp.finishReason === 'tool_use' && resp.toolUses && resp.toolUses.length > 0) {
        log({ ev: 'tool-call', taskId: target.id, iter: iters, tools: resp.toolUses.map((t) => t.name) });
        // Append the assistant turn (text + tool_use blocks) so the model
        // sees its own request when we send tool_result back.
        messages.push({
          role: 'assistant',
          content: (resp.assistantBlocks ?? []) as never,
        });
        // Run each tool and collect results.
        const toolResults = await Promise.all(resp.toolUses.map((u) => runTool(u)));
        messages.push({
          role: 'user',
          content: toolResults as never,
        });
        continue;
      }
      // Final text response.
      finalText = resp.content;
      break;
    }
    const durationMs = Date.now() - start;

    const cost = costGuard.recordUsage(identity.llmModel, aggUsage);
    log({
      ev: 'executed',
      taskId: target.id,
      costUsd: cost.costUsd.toFixed(4),
      spentUsd: cost.spentUsd.toFixed(4),
      tokens: aggUsage.totalTokens,
      tool_iters: iters,
    });
    const response = { ...(lastResponse ?? { content: finalText, usage: aggUsage }), content: finalText, usage: aggUsage };

    const execResult: ExecutionResult = {
      taskId: target.id,
      responseText: response.content,
      usage: response.usage,
      costUsd: cost.costUsd,
      durationMs,
    };

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

    // Phase 1 CAEL audit: post to the HoloMesh audit store so the fleet
    // corpus collector at ai-ecosystem/scripts/fleet-corpus-collector.mjs
    // can read records via GET /api/holomesh/agent/{handle}/audit. Without
    // this POST, the local AuditLog above is the only durable record and
    // Paper 25's gate clock cannot start. See ai-ecosystem task
    // task_1777106535952_atug for the empty-audit investigation.
    try {
      const caelRecord = buildCaelRecord({
        identity,
        brain,
        task: target,
        messages,
        finalText,
        usage: aggUsage,
        costUsd: cost.costUsd,
        spentUsd: cost.spentUsd,
        prevChain: this.prevCaelChain,
        runtimeVersion: RUNTIME_VERSION,
      });
      const posted = await mesh.postAuditRecords(identity.handle, [caelRecord]);
      this.prevCaelChain = caelRecord.fnv1a_chain;
      log({ ev: 'cael-posted', taskId: target.id, appended: posted.appended, rejected: posted.rejected });
    } catch (err) {
      log({ ev: 'cael-post-error', message: err instanceof Error ? err.message : String(err) });
    }

    if (this.opts.onTaskExecuted) {
      await this.opts.onTaskExecuted(execResult, target);
    } else {
      await mesh.sendMessageOnTask(
        target.id,
        `[${identity.handle}] response (${response.usage.totalTokens} tok, $${cost.costUsd.toFixed(4)}):\n\n${response.content}`
      );
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
