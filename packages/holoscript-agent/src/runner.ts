import type { ILLMProvider, LLMMessage, TokenUsage, ToolUseBlock } from '@holoscript/llm-provider';
import { embedAcrossFleet, cosineSimilarity, createLocalLLMProvider } from '@holoscript/llm-provider';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { freemem } from 'node:os';
import { join as pathJoin } from 'node:path';
import { resolvePeer, parsePeerRegistry, type PeerEntry } from './peer-registry.js';
import type { CostGuard } from './cost-guard.js';
import type { HolomeshClient } from './holomesh-client.js';
import { pickClaimableTask } from './holomesh-client.js';
import type { AuditLog } from './audit-log.js';
import { buildCaelRecord } from './cael-builder.js';
import { createTaskExecutionAttributeClaims } from './care-claims.js';
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

/** Parse a base URL's host for an honest peer label; falls back to the raw string. */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Load the peer registry from HOLOSCRIPT_AGENT_PEER_REGISTRY — inline JSON first,
 * else treat the value as a file path. [] when unset/unreadable (→ the agent falls
 * back to HOLOSCRIPT_AGENT_PEER_BASE_URL, then self-consult).
 */
function loadPeerRegistry(): PeerEntry[] {
  const v = process.env.HOLOSCRIPT_AGENT_PEER_REGISTRY;
  if (!v) return [];
  const inline = parsePeerRegistry(v);
  if (inline.length) return inline;
  try {
    return parsePeerRegistry(readFileSync(v, 'utf8'));
  } catch {
    return [];
  }
}

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
  /**
   * Optional injected corpus-accrual capability (I.023 executor last mile). When present,
   * an idle tick (no claimable task) grows the agent's gated training corpus IN-PROCESS by
   * running ONE sovereign-local evolution step instead of falling through to LLM
   * self-direction. Injected from the composition root (idle-accrual.ts dynamic-imports
   * `@holoscript/core/evolution`) so the runner stays @holoscript/core-free — the clean
   * publish closure. Absent (default) → the idle path is exactly as before. $0 (local metal),
   * bounded (one proposal/tick), propose-not-ship. Returns a summary, or null when nothing ran.
   */
  idleAccrual?: (ctx: {
    tick: number;
    agentId: string;
  }) => Promise<{ target: string; written: number; deduped: number; outcome: string } | null>;
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
  // Idle-loop stall guard: tracks consecutive cycles the same self-task title was
  // derived without producing a real write. After IDLE_STALL_LIMIT consecutive
  // same-title cycles, suppress that title for IDLE_SUPPRESS_CYCLES ticks.
  private idleTitleCounts = new Map<string, number>();
  private idleTitleSuppressed = new Map<string, number>();
  private idleTick = 0;

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

    // Memory-headroom guard (founder 2026-06-23, after the Jetson two-model swap-thrash
    // freeze): on a memory-constrained box, claiming a task or running idle work loads the
    // model + grows the KV cache — if the box is already starved, that OOMs/freezes it. When
    // HOLOSCRIPT_AGENT_MIN_FREE_MB is set and available memory is below it, SKIP this tick's
    // work (heartbeat already ran) so the agent degrades gracefully instead of crashing the
    // box. Opt-in (default 0 = off → existing fleet agents are unaffected); the Jetson sets it
    // (e.g. 800). Fails OPEN: if memory can't be read, work proceeds.
    const minFreeMb = Number(process.env.HOLOSCRIPT_AGENT_MIN_FREE_MB || 0);
    if (minFreeMb > 0) {
      const availMb = availableMemoryMb();
      if (availMb != null && availMb < minFreeMb) {
        log({ ev: 'low-memory-skip', availableMb: availMb, minFreeMb });
        return {
          action: 'low-memory-skip',
          spentUsd: costGuard.getState().spentUsd,
          remainingUsd: costGuard.getRemainingUsd(),
          message: `paused: ${availMb}MB available < ${minFreeMb}MB floor (avoiding OOM)`,
        };
      }
    }

    const tasks = await mesh.getOpenTasks();
    const target = pickClaimableTask(tasks, brain.capabilityTags);
    if (!target) {
      log({ ev: 'no-claimable-task', open: tasks.length });
      // Corpus accrual (I.023 executor): when an accrual capability is injected, grow the
      // gated training corpus with ONE sovereign-local evolution step in-process — $0,
      // bounded, propose-not-ship. Takes precedence over LLM self-direction so a dedicated
      // accrual seat does deterministic corpus growth rather than free-form self-tasks. The
      // runner stays @holoscript/core-free; the capability is injected from the composition root.
      if (this.opts.idleAccrual) {
        return await this.runIdleAccrual({ identity, costGuard, log });
      }
      // Self-heal instead of idling (founder 2026-06-23): a brain that authors
      // `behavior on_idle` derives + executes one small language-advancing improvement
      // through the same tool primitives + W.107.b artifact gate as a real task. Opt-in —
      // brains without an idle block keep the exact no-claimable-task return below.
      if (brain.idle) {
        return await this.runIdleSelfDirection({ identity, brain, mesh, costGuard, provider, log });
      }
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
    //
    // Dynamic peer resolution for `ask_peer` / `council` (D.100 Axis-2). The peer
    // registry (HOLOSCRIPT_AGENT_PEER_REGISTRY — inline JSON or file path) maps
    // capabilities → sovereign nodes, so a brain authors the CAPABILITY it needs and
    // the agent resolves WHICH node per call. Fallback chain: registry-by-capability
    // → single HOLOSCRIPT_AGENT_PEER_BASE_URL → self-consult. Providers are cached
    // per (endpoint,model) so a multi-seat council doesn't rebuild clients each call.
    // The CITE-by-ID grounding gate makes the answer trustworthy regardless of node.
    const peerRegistry = loadPeerRegistry();
    const fallbackPeerBaseUrl = process.env.HOLOSCRIPT_AGENT_PEER_BASE_URL;
    const fallbackPeerModel = process.env.HOLOSCRIPT_AGENT_PEER_MODEL || identity.llmModel;
    const peerTimeoutMs = process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS
      ? Number(process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS)
      : 300000;
    const peerProviderCache = new Map<string, ILLMProvider>();
    const peerProviderFor = (baseUrl: string, model: string): ILLMProvider => {
      const key = `${baseUrl}|${model}`;
      let p = peerProviderCache.get(key);
      if (!p) {
        p = createLocalLLMProvider({ baseURL: baseUrl, model, timeoutMs: peerTimeoutMs });
        peerProviderCache.set(key, p);
      }
      return p;
    };
    const systemContent = await augmentWithOnTaskCognition({
      systemPrompt: brain.systemPrompt,
      onTaskActions: brain.onTaskActions ?? [],
      task: { id: target.id, title: target.title },
      queryPrivateKnowledge: () => mesh.queryPrivateKnowledge(),
      // Stage 1: grep exact keyword match against local JSONL (no-op when path unset).
      queryGrep: (q, limit) => mesh.queryGrep(q, limit),
      // Stage 2: Absorb GraphRAG semantic search (W.754 — no-op when env vars absent).
      queryAbsorb: (q, limit) => mesh.queryAbsorb(q, limit),
      plan: async (prompt) => {
        const resp = await provider.complete(
          { messages: [{ role: 'user', content: prompt }], maxTokens: 512, temperature: 0.3 },
          identity.llmModel
        );
        return resp.content;
      },
      // `ask_peer` / `council` — agent-to-agent questioning, the reasoning substrate
      // (D.100 keystone). Routes to peerProvider (a different sovereign node when
      // HOLOSCRIPT_AGENT_PEER_BASE_URL is set, else self-consult). `lens` gives a
      // council seat its angle (correctness/skeptic/…). The CITE-by-ID grounding gate
      // (citation-grounding.ts) makes the answer trustworthy regardless of who answered.
      askPeer: async (question, opts) => {
        // Resolve WHICH node answers: registry by capability+seat → PEER_BASE_URL → self.
        const resolved = resolvePeer(peerRegistry, { capability: opts.capability, seat: opts.seat });
        const baseUrl = resolved?.baseUrl ?? fallbackPeerBaseUrl;
        const model = resolved?.model ?? fallbackPeerModel;
        const peerProvider = baseUrl ? peerProviderFor(baseUrl, model) : provider;
        const peerLabel =
          opts.peer || resolved?.handle || (baseUrl ? safeHost(baseUrl) : model);
        const sys =
          (opts.capability
            ? `You are a peer agent consulted for your ${opts.capability} expertise. `
            : 'You are a peer agent being consulted by another agent. ') +
          (opts.lens ? `Take the ${opts.lens} lens. ` : '') +
          'Answer concisely and concretely. When you cite supporting knowledge, cite ONLY by its real ID ' +
          '(e.g. W.123, F.045, D.101); NEVER invent an ID — an unsupported claim is better than a fabricated citation.';
        const resp = await peerProvider.complete(
          { messages: [{ role: 'system', content: sys }, { role: 'user', content: question }], maxTokens: 512, temperature: 0.3 },
          model
        );
        return { answer: resp.content, peer: peerLabel };
      },
      // Knowledge corpus the grounding gate resolves peer citations against — the
      // agent's private workspace (real entry IDs + content). Empty → fail-closed.
      groundingCorpus: () => mesh.queryPrivateKnowledge(),
      // `discover` — enumerate live teammates by capability_tags before llm_call so
      // the model can make informed delegate_task routing decisions (D.100 Axis-3).
      discoverPeers: async (filterTags) => {
        const all = await mesh.queryPresence();
        if (!filterTags || filterTags.length === 0) return all;
        return all.filter((p) => filterTags.every((t) => p.capabilityTags?.includes(t)));
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
    let lastVisionCaption: string | undefined;
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
              // mcp_call → core MCP tool surface (compile/validate/generate/solve/query),
              // so the edge agent can ACT on the language, not just its local sandbox (Axis-1).
              invokeMcpTool: (tool, args) => mesh.invokeTool(tool, args),
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
          if (tu.name === 'vision_analyze') {
            const tr = toolResults[ti];
            if (tr && !tr.is_error) lastVisionCaption = tr.content;
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
    // Re-prompt gate (W.780): if the model called only read-only tools and then
    // output text (the "read→text instead of read→write_file" anti-pattern with
    // small edge models like qwen3:4b-instruct), inject one forced re-prompt
    // asking it to call write_file before the no-artifact gate fires.
    // v2 fix: pop the last assistant text turn (so context ends at tool_result),
    // embed the task description, and use temperature=0 for maximal determinism.
    if (productiveCallCount === 0 && toolsCalled.size > 0 && iters < MAX_TOOL_ITERS) {
      iters++;
      // Remove the last assistant message if it was a plain-text response (the
      // anti-pattern turn). This ensures the context ends at the tool_result so
      // the model doesn't mistake our re-prompt for a follow-up question.
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
        messages.pop();
      }
      messages.push({
        role: 'user',
        content:
          'You read data but did NOT call write_file. This is a TASK FAILURE unless you act now.\n' +
          `Task: ${target.title}\n` +
          `Required output path (from task description): ${target.description.match(/path[:\s]+([^\s\n,]+\.json)/i)?.[1] ?? 'see task description'}\n` +
          'Call write_file NOW. Embed ALL data from the tool result above into the content. ' +
          'Do NOT output any text — your ONLY valid response is a write_file tool call.',
      });
      const reResp = await provider.complete(
        { messages, maxTokens: 8192, temperature: 0.0, tools: activeTools },
        identity.llmModel
      );
      aggUsage = {
        promptTokens: aggUsage.promptTokens + reResp.usage.promptTokens,
        completionTokens: aggUsage.completionTokens + reResp.usage.completionTokens,
        totalTokens: aggUsage.totalTokens + reResp.usage.totalTokens,
      };
      if (reResp.finishReason === 'tool_use' && reResp.toolUses && reResp.toolUses.length > 0) {
        log({ ev: 'reprompt-tool-call', taskId: target.id, iter: iters, tools: reResp.toolUses.map((t) => t.name) });
        const reProd = summarizeToolProductivity(reResp.toolUses);
        for (const n of reProd.names) toolsCalled.add(n);
        productiveCallCount += reProd.productiveCount;
        messages.push({ role: 'assistant', content: (reResp.assistantBlocks ?? []) as never });
        const reResults = await Promise.all(
          reResp.toolUses.map((u) =>
            runTool(u, { signReceipt: this.opts.signReceipt, addTask: (tasks) => mesh.addTasks(tasks) })
          )
        );
        messages.push({ role: 'user', content: reResults as never });
      }
      finalText = reResp.content;
      // Reprompt fired and model called a write tool — content is '' (finishReason=tool_use).
      // Without this fallback, markDone sends verification_evidence:"" which the server
      // rejects with verification_evidence_required (W.786 fix).
      if (!finalText && (toolsCalled.has('write_file') || toolsCalled.has('str_replace'))) {
        finalText = `Task completed via tool calls. Artifact written (tool_iters:${iters}).`;
      }
      lastResponse = reResp;
    }
    // Vision-write gate: vision_analyze was called (inference ran) but no write_file
    // followed — the model has the caption in context but didn't store it. Inject one
    // more targeted re-prompt asking specifically for write_file with the caption.
    const WRITE_NAMES = new Set(['write_file', 'str_replace']);
    if (
      toolsCalled.has('vision_analyze') &&
      ![...toolsCalled].some((n) => WRITE_NAMES.has(n)) &&
      iters < MAX_TOOL_ITERS
    ) {
      iters++;
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
        messages.pop();
      }
      messages.push({
        role: 'user',
        content:
          'vision_analyze returned a caption but you did NOT call write_file.\n' +
          `Task: ${target.title}\n` +
          `Output path: ${target.description.match(/path[:\s]+([^\s\n,]+\.json)/i)?.[1] ?? 'see task description'}\n` +
          'Call write_file NOW. Put the caption from vision_analyze into the JSON content field. ' +
          'Do NOT output text — your ONLY valid response is a write_file tool call.',
      });
      const vwResp = await provider.complete(
        { messages, maxTokens: 8192, temperature: 0.0, tools: activeTools },
        identity.llmModel
      );
      aggUsage = {
        promptTokens: aggUsage.promptTokens + vwResp.usage.promptTokens,
        completionTokens: aggUsage.completionTokens + vwResp.usage.completionTokens,
        totalTokens: aggUsage.totalTokens + vwResp.usage.totalTokens,
      };
      if (vwResp.finishReason === 'tool_use' && vwResp.toolUses && vwResp.toolUses.length > 0) {
        log({ ev: 'vision-write-call', taskId: target.id, iter: iters, tools: vwResp.toolUses.map((t) => t.name) });
        const vwProd = summarizeToolProductivity(vwResp.toolUses);
        for (const n of vwProd.names) toolsCalled.add(n);
        productiveCallCount += vwProd.productiveCount;
        messages.push({ role: 'assistant', content: (vwResp.assistantBlocks ?? []) as never });
        const vwResults = await Promise.all(
          vwResp.toolUses.map((u) =>
            runTool(u, { signReceipt: this.opts.signReceipt, addTask: (tasks) => mesh.addTasks(tasks) })
          )
        );
        messages.push({ role: 'user', content: vwResults as never });
      } else if (lastVisionCaption && ![...toolsCalled].some((n) => WRITE_NAMES.has(n))) {
        // Auto-commit (W.780/W.781): qwen3:4b cannot chain vision_analyze → write_file even
        // with two targeted re-prompts. Write the Fara-7B caption directly from the runner
        // rather than leaving the task with a CAEL record but no file artifact.
        const outPath =
          target.description.match(/path[:\s]+([^\s\n,]+\.json)/i)?.[1] ??
          target.description.match(/(\/[/\w./-]+\.json)/i)?.[1] ??
          `/mnt/nvme/holo/agent/shared/vision-${target.id}.json`;
        const syntheticWrite: ToolUseBlock = {
          type: 'tool_use',
          id: 'auto-vision-write',
          name: 'write_file',
          input: {
            path: outPath,
            content: JSON.stringify(
              {
                caption: lastVisionCaption,
                task: target.title,
                source: 'vision_analyze',
                model: process.env.HOLOSCRIPT_AGENT_VISION_MODEL ?? 'fara:7b',
              },
              null,
              2,
            ),
          },
        };
        const writeResult = await runTool(syntheticWrite, {
          signReceipt: this.opts.signReceipt,
          addTask: (tasks) => mesh.addTasks(tasks),
        });
        log({ ev: 'vision-auto-write', taskId: target.id, path: outPath, ok: !writeResult.is_error });
        if (!writeResult.is_error) {
          toolsCalled.add('write_file');
          productiveCallCount++;
        }
      }
      // vwResp.content is '' when finishReason==='tool_use'; mark-done requires
      // non-empty verification_evidence. Fall back to a summary string so the
      // task closes cleanly.
      finalText =
        vwResp.content ||
        (toolsCalled.has('write_file') || toolsCalled.has('str_replace')
          ? `Vision analysis complete. Fara-7B caption written to output file (tool_iters:${iters}).`
          : finalText);
      lastResponse = vwResp;
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
      // Capture the no-artifact failure as a graded NEGATIVE training row — the W.107.b
      // artifact-grounding verdict is the richest negative-supervision signal in the system and
      // was previously discarded. Opt-in via HOLOSCRIPT_AGENT_TRACE_DIR; passed:false → kept for
      // DPO/contrast, dropped from the SFT split by the harvest grader-gate.
      this.recordTrace({
        user: buildTaskPrompt(target),
        target: finalText || `[no artifact — inspected/replied but produced nothing; toolsCalled=${[...toolsCalled].join(',')}]`,
        grader: { passed: false, kind: 'no-artifact', toolsCalled: [...toolsCalled], productiveCallCount },
        source: 'agent-runner-negative',
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
          commitHash: lastCommitHash,
          agentAttributeClaims: createTaskExecutionAttributeClaims({
            agentHandle: identity.handle,
            taskId: target.id,
            taskTitle: target.title,
            costUsd: cost.costUsd,
            durationMs,
            totalTokens: aggUsage.totalTokens,
            commitHash: lastCommitHash,
          }),
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

  /**
   * Corpus-accrual idle path (I.023 executor last mile). Invokes the injected accrual
   * capability for ONE gated, sovereign-local evolution step and maps its summary to a
   * TickResult. The runner stays @holoscript/core-free — all evolution + fs work lives in
   * the injected function (idle-accrual.ts dynamic-imports @holoscript/core/evolution). $0:
   * the proposer is local metal and there is no cloud spend to record (costGuard already
   * short-circuited over-budget before this branch). Failures degrade to idle-skipped so a
   * proposer outage can never crash the tick loop.
   */
  private async runIdleAccrual(ctx: {
    identity: AgentIdentity;
    costGuard: CostGuard;
    log: (event: Record<string, unknown>) => void;
  }): Promise<TickResult> {
    const { identity, costGuard, log } = ctx;
    this.idleTick++;
    const spent = () => costGuard.getState().spentUsd;
    const remaining = () => costGuard.getRemainingUsd();
    try {
      const r = await this.opts.idleAccrual!({ tick: this.idleTick, agentId: identity.handle });
      if (!r || r.written === 0) {
        log({ ev: 'idle-accrual-skipped', ...(r ?? {}) });
        return {
          action: 'idle-skipped',
          spentUsd: spent(),
          remainingUsd: remaining(),
          message: r
            ? `accrual produced no new rows (target=${r.target}, deduped=${r.deduped}, ${r.outcome})`
            : 'accrual capability returned no result',
        };
      }
      log({
        ev: 'idle-accrual-worked',
        target: r.target,
        written: r.written,
        deduped: r.deduped,
        outcome: r.outcome,
      });
      return {
        action: 'idle-worked',
        spentUsd: spent(),
        remainingUsd: remaining(),
        message: `accrued ${r.written} gated row(s) for ${r.target} (deduped ${r.deduped})`,
      };
    } catch (err) {
      log({ ev: 'idle-accrual-error', message: err instanceof Error ? err.message : String(err) });
      return {
        action: 'idle-skipped',
        spentUsd: spent(),
        remainingUsd: remaining(),
        message: `accrual error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Self-directed idle work (founder 2026-06-23: local metal must SELF-HEAL, not sit in a
   * no-claimable-task poll loop). Fires only when the board has no capability-matched task
   * AND the brain authors `behavior on_idle`. Derives ONE small, language-advancing
   * improvement and executes it through the SAME tool primitives (resolveActiveTools/runTool)
   * + the SAME W.107.b artifact-grounding gate (summarizeToolProductivity) as a real task —
   * so an idle action cannot fabricate work (0 productive calls ⇒ idle-skipped, no receipt,
   * no board task). $0: the provider is the Jetson's local Ollama; mesh calls are free REST.
   *
   * Safety bounds (founder-ruled): idle work uses resolveActiveTools(brain) — the same
   * MESH_TOOLS subset whose productive bash prefixes EXCLUDE `git push`/`git commit`
   * (W.107.b), so it can inspect/write/build/validate locally but NEVER push, mutate
   * governance, or spend. costGuard.isOverBudget() already short-circuited before this
   * branch, so an idle worker is guaranteed under-budget. Vast escalation is NOT in v1:
   * a self-task needing GPU the Jetson lacks is filed as a board task tagged `gpu` for the
   * autoscaler path, never rented from the idle loop.
   */
  private async runIdleSelfDirection(ctx: {
    identity: AgentIdentity;
    brain: RuntimeBrainConfig;
    mesh: HolomeshClient;
    costGuard: CostGuard;
    provider: ILLMProvider;
    log: (event: Record<string, unknown>) => void;
  }): Promise<TickResult> {
    const { identity, brain, mesh, costGuard, provider, log } = ctx;
    const idle = brain.idle!;
    const spent = () => costGuard.getState().spentUsd;
    const remaining = () => costGuard.getRemainingUsd();

    // 1. DISCOVER-WORK — derive ONE small self-task, grounded in the agent's own backlog
    //    + capability tags so the work is capability-matched by construction. Local, $0.
    let recentSummary = '';
    try {
      const recent = await mesh.queryPrivateKnowledge();
      recentSummary = recent
        .slice(-5)
        .map((e) => `- ${(e.content ?? '').slice(0, 80)}`)
        .join('\n');
    } catch {
      /* private knowledge optional */
    }

    const planResp = await provider.complete(
      {
        messages: [
          { role: 'system', content: brain.systemPrompt },
          {
            role: 'user',
            content:
              `${idle.directive}\n\n` +
              `Your capability tags: ${brain.capabilityTags.join(', ') || '(none)'}.\n` +
              (recentSummary ? `Your recent work:\n${recentSummary}\n\n` : '') +
              'The team board has NO task matching your capabilities right now. Pick ONE small, ' +
              'concrete improvement you can complete in a few tool calls that ADVANCES THE HOLOSCRIPT ' +
              'LANGUAGE (grammar/.hs/.hsplus/.holo, compilers/targets, traits, native authoring, or a ' +
              'real fix/validation) — NOT net-new infrastructure (D.101). Reply with ONLY one line: ' +
              'TASK: <one concrete, actionable title>',
          },
        ],
        maxTokens: 400,
        temperature: 0.3,
      },
      identity.llmModel
    );
    const selfTitle = (
      planResp.content.match(/TASK:\s*(.+)/i)?.[1] ??
      planResp.content.split('\n').find((l) => l.trim())?.trim() ??
      ''
    )
      .slice(0, 160)
      .trim();
    if (!selfTitle) {
      log({ ev: 'idle-skipped', reason: 'no-self-task-derived' });
      return {
        action: 'idle-skipped',
        spentUsd: spent(),
        remainingUsd: remaining(),
        message: 'idle director derived no actionable self-task',
      };
    }
    this.idleTick++;

    // Stall guard: if the model keeps deriving the same (or near-same) title without ever
    // producing a real write artifact, suppress it for IDLE_SUPPRESS_CYCLES ticks.
    // Use the first 60 chars as the stall key so suffix variants ("edge-native authoring"
    // vs "edge-native parsing") map to the same bucket and don't reset the counter.
    const IDLE_STALL_LIMIT = 3;
    const IDLE_SUPPRESS_CYCLES = 10;
    const stallKey = selfTitle.slice(0, 60).toLowerCase().replace(/\s+/g, ' ').trim();
    const suppressedUntil = this.idleTitleSuppressed.get(stallKey);
    if (suppressedUntil !== undefined && this.idleTick <= suppressedUntil) {
      log({ ev: 'idle-skipped', reason: 'title-suppressed', title: selfTitle, stallKey, suppressedUntil });
      return {
        action: 'idle-skipped',
        spentUsd: spent(),
        remainingUsd: remaining(),
        message: `idle title suppressed for ${suppressedUntil - this.idleTick} more ticks: ${selfTitle}`,
      };
    } else if (suppressedUntil !== undefined) {
      this.idleTitleSuppressed.delete(stallKey);
      this.idleTitleCounts.delete(stallKey);
    }

    log({ ev: 'idle-derived', title: selfTitle });

    // 2. EXECUTE — bounded tool loop reusing the SAME resolveActiveTools + runTool primitives.
    const { tools: activeTools } = resolveActiveTools(brain);
    const messages: LLMMessage[] = [
      { role: 'system', content: brain.systemPrompt },
      {
        role: 'user',
        content:
          `Self-directed idle work. Complete this concrete improvement now using your tools:\n${selfTitle}\n\n` +
          'Inspect what you need, then PRODUCE A REAL ARTIFACT: call write_file with non-empty content, ' +
          'OR run a productive bash build/validate (e.g. pnpm vitest run, lake build), OR mcp_call ' +
          'compile_holoscript / validate_holoscript. Do NOT just describe — act. End with a one-line summary.',
      },
    ];
    let finalText = '';
    let iters = 0;
    let productiveCallCount = 0;
    const toolsCalled = new Set<string>();
    const maxIters = Math.min(idle.maxTools, 12);
    while (iters < maxIters) {
      iters++;
      const resp = await provider.complete(
        { messages, maxTokens: 8192, temperature: 0.4, tools: activeTools },
        identity.llmModel
      );
      if (resp.finishReason === 'tool_use' && resp.toolUses && resp.toolUses.length > 0) {
        // Same artifact-grounding classifier as the task path (tools.ts SSOT) — the gate
        // that makes idle work un-fabricatable can never drift from the real-task gate.
        const productivity = summarizeToolProductivity(resp.toolUses);
        for (const n of productivity.names) toolsCalled.add(n);
        productiveCallCount += productivity.productiveCount;
        messages.push({ role: 'assistant', content: (resp.assistantBlocks ?? []) as never });
        const toolResults = await Promise.all(
          resp.toolUses.map((u) =>
            runTool(u, {
              signReceipt: this.opts.signReceipt,
              addTask: (t) => mesh.addTasks(t),
              invokeMcpTool: (tool, args) => mesh.invokeTool(tool, args),
            })
          )
        );
        messages.push({ role: 'user', content: toolResults as never });
        continue;
      }
      finalText = resp.content;
      break;
    }
    log({ ev: 'idle-loop-done', iters, toolsCalled: [...toolsCalled], productiveCallCount });

    // 2b. READ→WRITE re-prompt (W.780 applied to idle work). The 4B edge model often inspects
    //     files then stops without writing (read→skip). If it called tools but produced nothing,
    //     nudge it ONCE to ACT — turning "consumed a file" into "improved a file." Same
    //     summarizeToolProductivity classifier as the task path, so the gate cannot drift.
    if (productiveCallCount === 0 && toolsCalled.size > 0 && iters < maxIters) {
      iters++;
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') messages.pop();
      messages.push({
        role: 'user',
        content:
          'You inspected files but produced NO artifact. To advance the work you must ACT, not just read.\n' +
          `Self-task: ${selfTitle}\n` +
          'Call write_file NOW with a concrete improvement, OR run a productive build/validate ' +
          '(pnpm vitest run / lake build) or mcp_call validate_holoscript. Your ONLY valid response ' +
          'is a productive tool call — do NOT output plain text.',
      });
      const reResp = await provider.complete(
        { messages, maxTokens: 8192, temperature: 0.0, tools: activeTools },
        identity.llmModel
      );
      if (reResp.finishReason === 'tool_use' && reResp.toolUses && reResp.toolUses.length > 0) {
        const reProd = summarizeToolProductivity(reResp.toolUses);
        for (const n of reProd.names) toolsCalled.add(n);
        productiveCallCount += reProd.productiveCount;
        messages.push({ role: 'assistant', content: (reResp.assistantBlocks ?? []) as never });
        const reResults = await Promise.all(
          reResp.toolUses.map((u) =>
            runTool(u, {
              signReceipt: this.opts.signReceipt,
              addTask: (t) => mesh.addTasks(t),
              invokeMcpTool: (tool, args) => mesh.invokeTool(tool, args),
            })
          )
        );
        messages.push({ role: 'user', content: reResults as never });
      }
      finalText = reResp.content || finalText;
      log({ ev: 'idle-reprompt-done', productiveCallCount });
    }

    // 3. ARTIFACT GATE (W.107.b) — no productive tool call ⇒ no real work happened. Refuse
    //    to record/file anything; idle work must never fabricate a deliverable.
    const wroteFile = toolsCalled.has('write_file') || toolsCalled.has('str_replace');
    if (productiveCallCount === 0) {
      // Stall tracking: count consecutive no-artifact cycles for this stallKey prefix.
      const stallCount = (this.idleTitleCounts.get(stallKey) ?? 0) + 1;
      this.idleTitleCounts.set(stallKey, stallCount);
      if (stallCount >= IDLE_STALL_LIMIT) {
        this.idleTitleSuppressed.set(stallKey, this.idleTick + IDLE_SUPPRESS_CYCLES);
        log({ ev: 'idle-title-suppressed', title: selfTitle, stallKey, stallCount, suppressedUntilTick: this.idleTick + IDLE_SUPPRESS_CYCLES });
      }
      log({ ev: 'idle-skipped', reason: 'no-artifact', title: selfTitle, toolsCalled: [...toolsCalled] });
      this.recordTrace({
        user: `Self-directed idle improvement: ${selfTitle}`,
        target: finalText || `[no artifact — inspected but produced nothing; toolsCalled=${[...toolsCalled].join(',')}]`,
        grader: { passed: false, kind: 'idle-no-artifact', toolsCalled: [...toolsCalled] },
        source: 'agent-runner-idle-negative',
      });
      return {
        action: 'idle-skipped',
        spentUsd: spent(),
        remainingUsd: remaining(),
        message: `idle work produced no artifact (toolsCalled=[${[...toolsCalled].join(',')}])`,
      };
    }

    // Stall tracking: mcp_call alone (validate, etc.) without a file write still
    // means no lasting artifact was produced — count toward suppression using the
    // prefix stallKey so variants of the same stuck topic accumulate together.
    if (!wroteFile) {
      const stallCount = (this.idleTitleCounts.get(stallKey) ?? 0) + 1;
      this.idleTitleCounts.set(stallKey, stallCount);
      if (stallCount >= IDLE_STALL_LIMIT) {
        this.idleTitleSuppressed.set(stallKey, this.idleTick + IDLE_SUPPRESS_CYCLES);
        log({ ev: 'idle-title-suppressed', title: selfTitle, stallKey, stallCount, suppressedUntilTick: this.idleTick + IDLE_SUPPRESS_CYCLES });
      }
    } else {
      // Real file write — clear stall state for this key.
      this.idleTitleCounts.delete(stallKey);
      this.idleTitleSuppressed.delete(stallKey);
    }

    // 4. CONTINUITY — record the outcome to the agent's private knowledge (free, best-effort).
    try {
      await mesh.writePrivateKnowledge([
        {
          content: `Idle self-directed work: ${selfTitle}\n${finalText.slice(0, 600)}`,
          type: 'idle-outcome',
          tags: ['idle-outcome', identity.handle],
          title: selfTitle,
        },
      ]);
    } catch {
      /* continuity best-effort */
    }

    // 5. FILE BOARD TASK — surface the work for capability-matched peers / review (opt-in).
    if (idle.fileBoard) {
      try {
        await mesh.addTasks([
          {
            title: `[idle:${identity.handle}] ${selfTitle}`,
            description:
              `Self-directed idle work by ${identity.handle} (no claimable board task). ` +
              `Produced a real artifact (productiveCalls=${productiveCallCount}, tools=[${[...toolsCalled].join(',')}]).\n\n` +
              `Outcome: ${finalText.slice(0, 1000)}\n\nReview / continue / verify.`,
            source: `idle-director:${identity.handle}`,
            tags: brain.capabilityTags,
          },
        ]);
      } catch (err) {
        log({ ev: 'idle-file-board-error', message: err instanceof Error ? err.message : String(err) });
      }
    }

    log({ ev: 'idle-worked', title: selfTitle, productiveCallCount });
    // Capture the productive idle outcome as a graded POSITIVE training row (self-directed work
    // that produced a real artifact — not captured by any other emitter; flows into the SFT corpus).
    this.recordTrace({
      user: `Self-directed idle improvement: ${selfTitle}`,
      target: finalText || `[artifact produced; productiveCalls=${productiveCallCount}]`,
      grader: { passed: true, kind: 'idle-worked', productiveCallCount },
      source: 'agent-runner-idle',
    });
    return {
      action: 'idle-worked',
      spentUsd: spent(),
      remainingUsd: remaining(),
      taskId: undefined,
      message: `idle self-direction completed: ${selfTitle}`,
    };
  }

  /**
   * Emit a graded REC-SHAPE training row to the per-identity trace store (D.086) — the same shape
   * scripts/trace-writer.mjs writes and harvest_real.py reads {system,user,target,grader,family,
   * modality,source,agentId,ts}. Opt-in via HOLOSCRIPT_AGENT_TRACE_DIR (unset → no-op, zero
   * regression for unconfigured agents). Captures the NEGATIVE / outcome signal the runner computes
   * every tick (no-artifact, idle-skipped/worked) that was previously only log()'d and DISCARDED —
   * the highest-value training signal in the ecosystem (founder 2026-06-24). Negatives carry
   * grader.passed:false and are dropped from the SFT split by the harvest grader-gate (de632431)
   * but stay captured for DPO/contrast; positives (passed:true) flow into the corpus.
   */
  private recordTrace(row: {
    user: string;
    target: string;
    grader: Record<string, unknown>;
    source: string;
    system?: string;
    family?: string;
    modality?: string;
  }): void {
    const dir = process.env.HOLOSCRIPT_AGENT_TRACE_DIR;
    if (!dir || !row.user || !row.target) return;
    try {
      const agentId = process.env.HOLOSCRIPT_AGENT_TRACE_IDENTITY || this.opts.identity.handle;
      const traceDir = pathJoin(dir, agentId);
      mkdirSync(traceDir, { recursive: true });
      const rec = {
        system: row.system ?? 'HoloScript autonomous agent task execution.',
        user: row.user,
        target: row.target,
        grader: row.grader,
        family: row.family ?? 'agentic-execution',
        modality: row.modality ?? 'agentic',
        source: row.source,
        agentId,
        ts: new Date().toISOString(),
      };
      appendFileSync(pathJoin(traceDir, 'trace.jsonl'), `${JSON.stringify(rec)}\n`, 'utf8');
    } catch (err) {
      (this.opts.logger ?? (() => undefined))({
        ev: 'trace-emit-error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
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
      // Presence signing failures are non-fatal: the bearer token is the primary
      // identity proof for task claim/execute; presence signing is secondary.
      // Log a warning so the misconfiguration is visible, but let the tick proceed.
      if (this.isUnsignedPresenceError(err)) {
        log({ ev: 'heartbeat-unsigned-warn', message: err instanceof Error ? err.message : String(err) });
        return;
      }
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

  private isUnsignedPresenceError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return / 403:/.test(msg) && /unsigned/i.test(msg);
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

/**
 * Available system memory in MB, or null if it can't be read (→ the memory guard
 * fails OPEN: never block work just because we couldn't measure). On Linux we read
 * /proc/meminfo MemAvailable (free + reclaimable cache) — the MEANINGFUL headroom on a
 * unified-memory Jetson, where os.freemem() (MemFree) reads misleadingly low (e.g. 350MB
 * free but 1.6GB available). Elsewhere we fall back to os.freemem().
 */
function availableMemoryMb(): number | null {
  if (process.platform === 'linux') {
    try {
      const m = readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)\s+kB/);
      if (m) return Math.floor(Number(m[1]) / 1024);
    } catch {
      /* fall through to os.freemem */
    }
  }
  try {
    return Math.floor(freemem() / (1024 * 1024));
  } catch {
    return null;
  }
}

function jitter(base: number): number {
  return Math.floor((Math.random() - 0.5) * base * 0.2);
}
