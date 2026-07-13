import type { LLMProviderName, TokenUsage } from '@holoscript/llm-provider';

export interface AgentIdentity {
  handle: string;
  surface: string;
  wallet: string;
  x402Bearer: string;
  llmProvider: LLMProviderName;
  llmModel: string;
  brainPath: string;
  budgetUsdPerDay: number;
  teamId: string;
  meshApiBase: string;
}

export interface RuntimeBrainConfig {
  brainPath: string;
  systemPrompt: string;
  capabilityTags: string[];
  domain: string;
  scopeTier: 'cold' | 'warm' | 'hot';
  /**
   * Capability keys (from `Capabilities` in @holoscript/llm-provider) that
   * this brain MUST have. Router refuses to assign the brain to a provider
   * whose manifest doesn't satisfy every entry. Empty array (default) =
   * open routing — matches today's behavior, backward-compatible.
   *
   * Per founder ruling 2026-05-06 (universal+segregated foundation): brains
   * declare needs as data; router does set arithmetic at session start.
   * `HOLOSCRIPT_AGENT_PROVIDER` env becomes override, not source-of-truth.
   */
  requires: string[];
  /**
   * Capability keys this brain prefers but doesn't require. Router uses
   * to break ties between candidates that all satisfy `requires`.
   * Empty array (default) = no preference.
   */
  prefers: string[];
  /**
   * Capability keys this brain explicitly avoids. Router excludes any
   * provider whose manifest declares any of these capabilities (e.g.
   * a privacy-sensitive brain may avoid `liveWebSearch`).
   * Empty array (default) = no exclusions.
   */
  avoids: string[];
  /**
   * Optional cognitive self-evaluation gate — the brain's `reflect` verb (W.736).
   * When the brain declares a `reflect { criteria, escalate_on_fail }` block, the
   * runner runs one self-evaluation pass over the produced artifact before
   * accepting it. With `escalateOnFail: true` a failed self-evaluation escalates
   * to the fleet (the `local_first` directive) instead of marking the task done;
   * otherwise the verdict is advisory (logged + recorded, never blocks).
   * Absent (default) = no reflect pass — existing brains are unaffected.
   */
  reflect?: { criteria: string; escalateOnFail: boolean };
  /**
   * Parsed `behavior on_task { … }` cognitive verb sequence (Phase 2.1).
   * Extracted by brain.ts from the brain's authored behavior block; consumed by
   * the runner to augment the task execution loop with domain-specific context.
   * Currently wired verbs: `llm_call` (prompt → system context injection).
   * Future verbs (`recall`, `rag_query`, `plan`) require trait-backed stores
   * and are logged as declared but deferred to Phase 2.2.
   * Absent (default) = hardcoded MESH_TOOLS loop only — backward-compatible.
   */
  onTaskActions?: OnTaskAction[];
  /**
   * Optional self-directed idle behavior (founder 2026-06-23 — local metal must
   * SELF-HEAL, not sit in a no-claimable-task poll loop). When the brain authors a
   * `behavior on_idle { directive: "…" }` block AND the board has no capability-matched
   * task, the runner derives ONE small, language-advancing improvement and executes it
   * through the SAME tool primitives + the SAME W.107.b artifact-grounding gate as a real
   * task — so an idle action can never fabricate work. $0 (local Ollama provider + free
   * mesh REST). Absent (default) = the runner returns `no-claimable-task` and sleeps,
   * exactly as before — non-idle brains are completely unaffected (opt-in).
   *   - directive: the brain-authored instruction for what idle work to pursue.
   *   - fileBoard: file the produced work as a board task for capability-matched peers.
   *   - maxTools: cap on the idle tool-loop iterations (bounded autonomy).
   */
  idle?: { directive: string; fileBoard: boolean; maxTools: number };
}

/** A single cognitive verb call parsed from `behavior on_task { … }`. */
export interface OnTaskAction {
  verb: 'recall' | 'rag_query' | 'llm_call' | 'plan' | 'reflect' | 'ask_peer' | 'council' | 'discover';
  config: Record<string, unknown>;
}

export interface CostState {
  date: string;
  spentUsd: number;
  promptTokens: number;
  completionTokens: number;
  callCount: number;
}

export interface ModelPricer {
  (model: string, usage: TokenUsage): number;
}

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  priority: string | number;
  tags: string[];
  status: 'open' | 'claimed' | 'done';
  source?: string;
  claimedBy?: string;
  /** Server-stamped creation time (ISO). Used by the automation lane for FIFO drain ordering. */
  createdAt?: string;
  /**
   * Server-enforced claim gate (board-routes claim path 403s capability_mismatch
   * when the claimant's presence tags don't carry these). The automation lane
   * reads it client-side only to explain refusals in its selection receipt —
   * the server remains the enforcing side.
   */
  required_tags?: string[];
}

export interface TickResult {
  action:
    | 'heartbeat-only'
    | 'over-budget'
    | 'no-claimable-task'
    | 'claimed'
    | 'executed'
    | 'errored'
    | 'no-artifact'
    | 'failure-artifact'
    | 'reflect-escalate'
    | 'messages-processed'
    | 'idle-worked'
    | 'idle-skipped'
    | 'low-memory-skip'
    | 'automation-dry-run';
  taskId?: string;
  spentUsd: number;
  remainingUsd: number;
  message?: string;
  receipts?: Array<{ status: string; action: string; reason: string }>;
}

export interface ExecutionResult {
  taskId: string;
  responseText: string;
  usage: TokenUsage;
  costUsd: number;
  durationMs: number;
}
