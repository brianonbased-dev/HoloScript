import type { ILLMProvider, LLMMessage, TokenUsage } from '@holoscript/llm-provider';
import type { CostGuard } from './cost-guard.js';
import type { HolomeshClient } from './holomesh-client.js';
import { pickClaimableTask } from './holomesh-client.js';
import type { AuditLog } from './audit-log.js';
import { buildCaelRecord } from './cael-builder.js';
import { MESH_TOOLS, runTool, isProductiveBashCommand } from './tools.js';
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
  // Self-recovery flag for the auto-rejoin path (task_1777112258989_eeyp).
  // When the heartbeat returns 403 "Not a member of this team" — typical of
  // a fresh Vast.ai worker whose provisioning didn't atomically /join, or of
  // a worker whose membership was reaped — the runner calls mesh.joinTeam()
  // ONCE per process and retries the heartbeat. After a successful rejoin
  // we set this flag so subsequent 403s on the same process don't loop back
  // into joinTeam (avoiding a retry storm if the team-cap is full or the
  // join itself is permanently rejected). On process restart the flag
  // resets, which is the correct semantics: a fresh process gets one fresh
  // chance to self-rejoin. Discovered 2026-04-25 SSH-probing 5 fleet
  // workers stuck in indefinite 403→tick-error→sleep→retry loops; without
  // this, a fresh-deploy of an unjoined agent stays silent forever.
  private joinedThisProcess = false;

  constructor(private readonly opts: AgentRunnerOptions) {}

  async tick(): Promise<TickResult> {
    const { identity, brain, mesh, costGuard, provider, logger } = this.opts;
    const log = logger ?? (() => undefined);

    await this.heartbeatWithAutoRejoin();

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
    // Track which tool names were called during this run so the artifact-grounding
    // gate below can refuse to mark "executed" on pure-text or read-only responses.
    // Discovered 2026-04-26 mesh-worker-02 audit: workers were posting CAEL records
    // with tool_iters:1 (zero tools called) declaring "100 scenes validated" with
    // no commit / no /room done — fabricated deliverables polluting trust. The
    // gate below short-circuits this class of hallucination at the runner edge.
    const toolsCalled = new Set<string>();
    // Tightened-gate counter (W.107.b 2026-04-26): track *productive* tool calls
    // separately from any tool call. A productive call is one of:
    //   - write_file with non-empty content
    //   - bash matching a productive prefix (lake build / pnpm --filter / vitest
    //     run / lean / pnpm vitest — see tools.ts BASH_PRODUCTIVE_PREFIXES)
    // Read-only bash (cat/grep/ls/echo/git status/etc.) does NOT count even
    // though it's whitelisted for execution. This catches the trivial-bash-bypass
    // class (e.g. `bash echo done`) that the original W.107 gate accepted.
    let productiveCallCount = 0;
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
        // Track tool names for the artifact-grounding gate.
        for (const u of resp.toolUses) {
          toolsCalled.add(u.name);
          // Productive-call accounting (W.107.b tighter gate).
          if (u.name === 'write_file') {
            const content = String((u.input as Record<string, unknown>)?.content ?? '');
            if (content.length > 0) productiveCallCount++;
          } else if (u.name === 'bash') {
            const cmd = String((u.input as Record<string, unknown>)?.cmd ?? '');
            if (isProductiveBashCommand(cmd)) productiveCallCount++;
          }
        }
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

    // Artifact-grounding gate (W.107 — fleet event-firing rate is not a productivity
    // metric; only side-effecting tool calls produce real artifacts; 2026-04-26
    // tightened to W.107.b which also closes the trivial-bash bypass: `bash echo
    // done` and `write_file /tmp/x ""` no longer pass the gate). The gate now
    // requires AT LEAST ONE productive call:
    //   - write_file with non-empty content, OR
    //   - bash matching a productive prefix (lake build / pnpm --filter /
    //     vitest run / lean / pnpm vitest)
    // Read-only inspection tools (read_file, list_dir) and read-only bash
    // (cat/grep/ls/echo/git status/git log/...) don't satisfy the gate.
    if (productiveCallCount === 0) {
      log({
        ev: 'no-artifact',
        taskId: target.id,
        tool_iters: iters,
        toolsCalled: [...toolsCalled],
        productiveCallCount,
        message:
          'task execution did not produce a real artifact — refusing to mark executed. ' +
          'Required: write_file with non-empty content OR bash with a productive prefix ' +
          '(lake build / pnpm --filter / vitest run / lean / pnpm vitest). ' +
          'Pure-text, read-only inspection, and trivial-bash-bypass (`echo`, `cat`, etc.) do not satisfy the gate.',
      });
      // Best-effort: leave the task in claimed state so the supervisor can either
      // re-tick or release it via heartbeat-rejoin. We deliberately do NOT post
      // a "fake-done" message on the board, do NOT post a CAEL record, and do NOT
      // call the cost guard's recordUsage — the run produced no artifact and
      // should not bill the budget for a hallucinated tick.
      return {
        action: 'no-artifact',
        taskId: target.id,
        spentUsd: costGuard.getState().spentUsd,
        remainingUsd: costGuard.getRemainingUsd(),
        message: `no productive tool call observed (toolsCalled=[${[...toolsCalled].join(',')}], productiveCallCount=${productiveCallCount}, iters=${iters})`,
      };
    }

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

  /**
   * Heartbeat with one-shot self-rejoin on 403 "Not a member of this team".
   *
   * Pairs with task_1777112258989_eeyp: fresh-deploy fleet workers whose
   * provisioning didn't atomically call /join (or whose membership was
   * reaped) hit 403 every tick and never recover. We detect the specific
   * server error string (see packages/mcp-server/src/holomesh/routes/
   * team-routes.ts:903 → `{ error: 'Not a member' }` for /presence), call
   * mesh.joinTeam() ONCE per runner process, and retry the heartbeat.
   *
   * Strict scope:
   *  - Only retries on 403 + "Not a member" body. Any other 403 (insufficient
   *    permissions, signing failure) re-throws unchanged.
   *  - Only retries ONCE per process. If we already rejoined this process and
   *    the heartbeat is *still* 403, the team is rejecting us for a reason
   *    /join can't fix (e.g. capacity, ban) — surface the error.
   *  - If joinTeam() itself throws, we DO mark joinedThisProcess=true before
   *    re-throwing so we don't slam the join endpoint on every subsequent
   *    tick. The next tick will surface the same heartbeat 403 and the
   *    runner-level catch in runForever logs tick-error and sleeps. Operator
   *    inspection (SSH/log) is the recovery path at that point.
   */
  private async heartbeatWithAutoRejoin(): Promise<void> {
    const { identity, mesh, logger } = this.opts;
    const log = logger ?? (() => undefined);
    try {
      await mesh.heartbeat({ agentName: identity.handle, surface: identity.surface });
    } catch (err) {
      if (!this.isNotAMemberError(err) || this.joinedThisProcess) {
        throw err;
      }
      log({ ev: 'auto-rejoin-attempt', reason: 'heartbeat-403-not-a-member' });
      // Mark BEFORE the join call so a thrown joinTeam() can't loop us.
      this.joinedThisProcess = true;
      try {
        const joinResult = await mesh.joinTeam();
        log({ ev: 'auto-rejoin-success', role: joinResult.role, members: joinResult.members });
      } catch (joinErr) {
        log({
          ev: 'auto-rejoin-failed',
          message: joinErr instanceof Error ? joinErr.message : String(joinErr),
        });
        throw joinErr;
      }
      // Retry the heartbeat exactly once. If it still fails (including with
      // another 403), the new error propagates — joinedThisProcess is now
      // true so we won't retry-loop on the next tick.
      await mesh.heartbeat({ agentName: identity.handle, surface: identity.surface });
      log({ ev: 'auto-rejoin-heartbeat-recovered' });
    }
  }

  /**
   * Detect the server's "Not a member" 403 error from HolomeshClient.req().
   * The error message format is: `HoloMesh POST /team/<id>/presence 403: <body>`
   * where body contains `{"error":"Not a member"}` (or "Not a member of this team").
   * Match conservatively: BOTH a "403" status marker AND the "Not a member"
   * substring must appear, so unrelated 403s (insufficient permissions,
   * signing failures) do NOT trigger a rejoin.
   */
  private isNotAMemberError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return / 403:/.test(msg) && /Not a member/i.test(msg);
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
