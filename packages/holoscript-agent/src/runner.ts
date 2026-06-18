import type { ILLMProvider, LLMMessage, TokenUsage } from '@holoscript/llm-provider';
import { embedAcrossFleet, cosineSimilarity } from '@holoscript/llm-provider';
import type { CostGuard } from './cost-guard.js';
import type { HolomeshClient } from './holomesh-client.js';
import { pickClaimableTask } from './holomesh-client.js';
import type { AuditLog } from './audit-log.js';
import { buildCaelRecord } from './cael-builder.js';
import { resolveActiveTools, runTool, summarizeToolProductivity } from './tools.js';
import { augmentWithOnTaskCognition } from './cognitive-verbs.js';
import { DelegatedAuthorityHandler } from './delegated-authority.js';
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
  /** Optional delegated-authority handler for governance message processing (E4). */
  messageHandler?: DelegatedAuthorityHandler;
  /**
   * Optional hardware-receipt signer (index.ts wires the seat wallet). When
   * present, emit_hardware_receipt seals its content hash with a wallet signature
   * so the hardware-provenance artifact is verifiable, not plain JSON. Absent →
   * the receipt is content-hashed but self-reports `signed:false` (honest).
   */
  signReceipt?: (canonical: string) => Promise<{ alg: string; signer: string; signature: string }>;
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

    // ── Delegated-authority message processing (E4) ──────────────────────────
    // Run before budget/task claiming so governance requests are handled
    // even when the agent is over-budget or has no claimable tasks.
    if (this.opts.messageHandler) {
      try {
        const receipts = await this.opts.messageHandler.processMessages();
        if (receipts.length > 0) {
          log({
            ev: 'messages-processed',
            count: receipts.length,
            statuses: receipts.map((r) => r.status),
          });
          // If this agent has no board-task capability tags (Brittney is
          // governance-only), return early so the tick result reflects message
          // work rather than falling through to no-claimable-task.
          if (
            brain.capabilityTags.length === 0 ||
            brain.capabilityTags.every((t) => t.startsWith('delegated'))
          ) {
            return {
              action: 'messages-processed',
              spentUsd: costGuard.getState().spentUsd,
              remainingUsd: costGuard.getRemainingUsd(),
              receipts: receipts.map((r) => ({
                status: r.status,
                action: r.action,
                reason: r.reason,
              })),
            };
          }
        }
      } catch (err) {
        log({
          ev: 'message-handler-error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

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
    // ── On-task cognition (Phase 2.2 — cognitive-verbs.ts) ───────────────────
    // Execute the brain's authored `behavior on_task` verbs (llm_call / rag_query
    // / recall / plan) and accumulate their outputs onto the system prompt before
    // the tool loop. Provider + mesh only (no engine/@holoscript/core dep) so the
    // edge package keeps its clean publish closure. `reflect` runs post-artifact.
    const systemContent = await augmentWithOnTaskCognition({
      systemPrompt: brain.systemPrompt,
      onTaskActions: brain.onTaskActions ?? [],
      task: { id: target.id, title: target.title },
      queryTeamKnowledge: (q, limit) => mesh.queryTeamKnowledge(q, limit),
      queryPrivateKnowledge: () => mesh.queryPrivateKnowledge(),
      // Phase 2.3 (W.753): codebase GraphRAG via the bearer-gated mesh route.
      // Best-effort: returns [] when the in-process graph isn't loaded → cognitive-verbs
      // falls back to team-knowledge search. No prod impact when graph is cold.
      queryCodebase: (q, topK) => mesh.queryCodebase(q, topK),
      plan: async (prompt) => {
        const resp = await provider.complete(
          { messages: [{ role: 'user', content: prompt }], maxTokens: 512, temperature: 0.3 },
          identity.llmModel
        );
        return resp.content;
      },
      // Semantic `recall` over the private workspace via the fleet nomic (W.753).
      // brainPath from HOLO_LLM_FLEET_BRAIN; if unset/unreachable embedAcrossFleet
      // returns null and cognitive-verbs falls back to the substring filter.
      embed: (text) => embedAcrossFleet(text, { brainPath: process.env.HOLO_LLM_FLEET_BRAIN }),
      similarity: cosineSimilarity,
      log,
    });

    const messages: LLMMessage[] = [
      { role: 'system', content: systemContent },
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
    // Last git commit SHA emitted during the tool-loop; forwarded to markDone
    // so the board task records a verifiable commit reference.
    let lastCommitHash: string | undefined;
    // F.126 #1 — the model's tools come from the BRAIN'S DECLARATION (the on_task
    // `llm_call { tools: [...] }` array), not a hardcoded list. resolveActiveTools
    // resolves the declared names against MESH_TOOLS, falls back safely when a brain
    // declares none, and SLIM-trims an oversized set for small local models (W.710
    // num_ctx guard). "Add a tool" is now "declare it in the brain," not edit this file.
    const { tools: activeTools, declared: declaredTools, dropped: droppedTools } = resolveActiveTools(brain);
    log({
      ev: 'active-tools',
      taskId: target.id,
      tools: activeTools.map((t) => t.name),
      declared: declaredTools,
      ...(droppedTools.length ? { droppedUnknown: droppedTools } : {}),
    });
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
          // 8192 for local thinking models (qwen3:4b uses ~3800 tokens on thinking
          // before the tool-call JSON; 4096 cuts off mid-generation). Frontier
          // models ignore this ceiling and stop naturally earlier.
          maxTokens: 8192,
          temperature: 0.4,
          tools: activeTools,
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
        log({
          ev: 'tool-call',
          taskId: target.id,
          iter: iters,
          tools: resp.toolUses.map((t) => t.name),
        });
        // Artifact-grounding accounting (W.107.b) via the shared classifier in
        // tools.ts — the SAME function the ablation harness measures, so the gate
        // and its evaluation can never drift (single source of truth).
        const productivity = summarizeToolProductivity(resp.toolUses);
        for (const n of productivity.names) toolsCalled.add(n);
        productiveCallCount += productivity.productiveCount;
        // Append the assistant turn (text + tool_use blocks) so the model
        // sees its own request when we send tool_result back.
        messages.push({
          role: 'assistant',
          content: (resp.assistantBlocks ?? []) as never,
        });
        // Run each tool and collect results.
        const toolResults = await Promise.all(
          resp.toolUses.map((u) =>
            runTool(u, {
              signReceipt: this.opts.signReceipt,
              addTask: (tasks) => mesh.addTasks(tasks),
            })
          )
        );
        // Extract the latest git commit SHA from bash stdout so markDone can
        // record a verifiable reference on the board task. Pattern matches both
        // `git commit -m` output ('[branch abc1234]') and `git rev-parse HEAD`.
        for (let ti = 0; ti < resp.toolUses.length; ti++) {
          const tu = resp.toolUses[ti];
          if (tu.name === 'bash') {
            const tr = toolResults[ti];
            if (tr && !tr.is_error) {
              const shaMatch = tr.content.match(/\b([0-9a-f]{7,40})\b/);
              if (shaMatch) lastCommitHash = shaMatch[1];
            }
          }
        }
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

    // ── Reflect: cognitive self-evaluation gate (W.736) ──────────────────────
    // If the brain declares a `reflect` verb, run ONE self-evaluation pass over
    // the produced artifact before accepting it — the brain's local_first
    // confidence gate. Uses the same provider (no engine/trait dependency) and
    // mirrors the CognitiveActions reflect prompt shape. The verdict is acted on
    // at the markDone gate below; its tokens fold into aggUsage so cost is honest.
    let reflectVerdict: { pass: boolean; reason: string } | undefined;
    if (brain.reflect) {
      try {
        const reflectResp = await provider.complete(
          {
            messages: [
              {
                role: 'system',
                content:
                  'You are a strict reviewer. Evaluate the work against the criteria; do not rewrite it.',
              },
              {
                role: 'user',
                content:
                  `Reflect on the artifact produced for this task. Evaluate it for: ${brain.reflect.criteria}.\n\n` +
                  `--- artifact / final response ---\n${finalText.slice(0, 4000)}\n--- end ---\n\n` +
                  `Give a one-line reason, then end with exactly "VERDICT: PASS" or "VERDICT: FAIL".`,
              },
            ],
            maxTokens: 512,
            temperature: 0.1,
          },
          identity.llmModel
        );
        aggUsage = {
          promptTokens: aggUsage.promptTokens + reflectResp.usage.promptTokens,
          completionTokens: aggUsage.completionTokens + reflectResp.usage.completionTokens,
          totalTokens: aggUsage.totalTokens + reflectResp.usage.totalTokens,
        };
        const verdictMatch = /VERDICT:\s*(PASS|FAIL)/i.exec(reflectResp.content);
        // Unparseable verdict = PASS — reflect is a gate, not a tripwire; never
        // block a real artifact on a parser miss (small local models phrase loosely).
        const pass = verdictMatch ? verdictMatch[1].toUpperCase() === 'PASS' : true;
        reflectVerdict = {
          pass,
          reason: reflectResp.content.replace(/VERDICT:\s*(PASS|FAIL)/i, '').trim().slice(0, 300),
        };
        log({
          ev: 'reflect',
          taskId: target.id,
          pass,
          escalateOnFail: brain.reflect.escalateOnFail,
          reason: reflectVerdict.reason.slice(0, 120),
        });
      } catch (err) {
        log({
          ev: 'reflect-error',
          taskId: target.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
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
    const response = {
      ...(lastResponse ?? { content: finalText, usage: aggUsage }),
      content: finalText,
      usage: aggUsage,
    };

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
      log({
        ev: 'cael-posted',
        taskId: target.id,
        appended: posted.appended,
        rejected: posted.rejected,
      });
    } catch (err) {
      log({ ev: 'cael-post-error', message: err instanceof Error ? err.message : String(err) });
    }

    // Reflect escalation gate: a brain with `reflect { escalate_on_fail: true }`
    // does NOT mark done on a failed self-evaluation — it escalates to the fleet
    // (the local_first directive). Cost + CAEL are already recorded above (the work
    // happened and the self-eval is a verifiable trace); only acceptance/markDone is
    // withheld. Brains without reflect, or with an advisory reflect, fall through.
    if (reflectVerdict && !reflectVerdict.pass && brain.reflect?.escalateOnFail) {
      try {
        await mesh.sendMessageOnTask(
          target.id,
          `[${identity.handle}] reflect gate FAILED — escalating to the fleet instead of marking done. Reason: ${reflectVerdict.reason}`
        );
      } catch {
        /* best-effort escalation notice; the return value is the source of truth */
      }
      log({ ev: 'reflect-escalate', taskId: target.id, reason: reflectVerdict.reason.slice(0, 120) });
      return {
        action: 'reflect-escalate',
        taskId: target.id,
        spentUsd: costGuard.getState().spentUsd,
        remainingUsd: costGuard.getRemainingUsd(),
        message: `reflect self-evaluation failed; escalated to fleet (reason: ${reflectVerdict.reason.slice(0, 120)})`,
      };
    }

    if (this.opts.onTaskExecuted) {
      await this.opts.onTaskExecuted(execResult, target);
    } else {
      await mesh.sendMessageOnTask(
        target.id,
        `[${identity.handle}] response (${response.usage.totalTokens} tok, $${cost.costUsd.toFixed(4)}):\n\n${response.content}`
      );
    }

    // Mark the task done so it doesn't linger in 'claimed' forever.
    // Wrapped in try/catch: a markDone failure (e.g. task already closed by
    // a supervisor, or transient network error) must not prevent the tick
    // return value from reaching the caller.
    try {
      await mesh.markDone(target.id, finalText.slice(0, 500), lastCommitHash);
      log({ ev: 'mark-done', taskId: target.id, commitHash: lastCommitHash });
    } catch (err) {
      log({
        ev: 'mark-done-error',
        taskId: target.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // Continuity write-loop: persist this task's outcome to the agent's PRIVATE
    // knowledge so a future `recall` verb has real memory to draw on. This closes
    // the W.752 loop-gap — the edge `recall` verb read /knowledge/private but it
    // was always empty because nothing ever wrote to it. Now markDone feeds it.
    // Best-effort (writePrivateKnowledge swallows its own errors); the task is
    // already done, so a write miss is logged and ignored.
    if (finalText.trim()) {
      const fact =
        `Task "${target.title}" (${target.id}) completed. ` +
        `Outcome: ${finalText.trim().slice(0, 600)}` +
        (lastCommitHash ? ` [commit ${lastCommitHash}]` : '');
      const wrote = await mesh.writePrivateKnowledge([
        { content: fact, type: 'task-outcome', tags: ['task-outcome', identity.handle] },
      ]);
      log({ ev: wrote ? 'knowledge-write' : 'knowledge-write-skip', taskId: target.id });
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
    const { identity, brain, mesh, logger } = this.opts;
    const log = logger ?? (() => undefined);
    const capabilityTags = brain.capabilityTags.length > 0 ? brain.capabilityTags : undefined;
    try {
      await mesh.heartbeat({ agentName: identity.handle, surface: identity.surface, capabilityTags });
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
      await mesh.heartbeat({ agentName: identity.handle, surface: identity.surface, capabilityTags });
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
    'Produce the deliverable: call write_file (or bash with a build command) to create all required output files FIRST. Apply your brain composition rules — anti-patterns, decision loop, and scope tier all bind. After calling the tool(s), return a short plain-text summary of what you did for posting to /room.',
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base: number): number {
  return Math.floor((Math.random() - 0.5) * base * 0.2);
}
