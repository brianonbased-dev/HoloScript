/**
 * FleetOrchestrator — the decision core for Brittney-driven fleet autonomy.
 *
 * This is the "brain" that closes the EXECUTE link in the autonomy chain:
 *
 *   schedule → file board task → CLAIM → **EXECUTE** → close
 *
 * Today schedulers file board tasks (HoloShell Team registry, cloud routines)
 * and agents *self-claim* in live sessions, but nothing autonomously assigns a
 * task to a capable agent and authorizes its execution. Brittney can see the
 * board but cannot dispatch. This module provides the pure decision logic
 * Brittney needs to dispatch:
 *
 *   1. selectNextTask        — pick the highest-priority claimable task
 *   2. matchAgentToTask      — capability-match a task to the best free agent
 *   3. SpendGovernor         — enforce a daily autonomous-spend cap
 *   4. planFleetDispatch     — combine the above into an ordered dispatch plan
 *
 * Design constraints (deliberate):
 *   - ZERO imports from the rest of the app or any framework. Pure TypeScript,
 *     pure functions + one small class. This keeps it unit-testable in isolation
 *     and gives it a near-zero build blast radius. The live wiring layer (the
 *     dispatch API route + the `dispatch_task_to_agent` Brittney tool) adapts
 *     real board/agent records into the minimal shapes below.
 *   - Spend is AUTHORIZED but CAPPED. The governor refuses to plan a dispatch
 *     that would exceed the daily cap. The cap default is conservative; the
 *     wiring layer overrides it from env (FLEET_DAILY_SPEND_CAP_USD).
 *
 * See research/2026-06-07_brittney-fleet-orchestrator-wiring.md for the full
 * integration plan (dispatch route, Brittney tool, scheduler tick, env, and the
 * desktop validation gate that must pass before this reaches a deploy path).
 */

// ─── Minimal domain shapes (adapted from real board/agent records) ───────────

/** Board priority as seen across the stack: P-levels, words, or numeric. */
export type RawPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'high' | 'medium' | 'low' | number | undefined;

export interface BoardTask {
  id: string;
  title: string;
  description?: string;
  /** 'P0'|'high' most urgent … 'P3'|'low' least. Numeric: lower = more urgent. */
  priority?: RawPriority;
  /** Team slot role hint, e.g. 'coder' | 'researcher' | 'reviewer' | 'tester'. */
  role?: string;
  /** Free-form tags; used as capability signals (e.g. 'security', 'docs'). */
  tags?: string[];
  status?: 'open' | 'claimed' | 'blocked' | 'done' | string;
  /** Agent id/handle currently holding the task, if any. */
  claimedBy?: string | null;
  /** ISO timestamp; used as a tie-breaker (older first). */
  createdAt?: string;
}

export interface FleetAgent {
  id: string;
  handle: string;
  /** Capability tokens, e.g. ['codebase','holoscript-dev','frontend','compile']. */
  skills: string[];
  status?: 'online' | 'offline' | 'busy' | string;
  /** Task id the agent is currently working, or null if idle. */
  currentTask?: string | null;
  /** Optional mission profile id (holoheal, builder, …) for provenance. */
  mission?: string;
}

export interface DispatchDecision {
  task: BoardTask;
  agent: FleetAgent;
  /** Capability match score (higher = better fit). */
  score: number;
  estimatedSpendUsd: number;
  /** Human-readable justification for logs/receipts. */
  reason: string;
}

// ─── Priority normalization ──────────────────────────────────────────────────

/**
 * Normalize any priority representation to a number where LOWER = MORE URGENT.
 * P0/high → 0, P1 → 1, P2/medium → 2, P3/low → 3, unknown → 2 (medium default).
 * Numeric inputs pass through (already "lower = more urgent" by convention).
 */
export function normalizePriority(p: RawPriority): number {
  if (typeof p === 'number' && Number.isFinite(p)) return p;
  switch (p) {
    case 'P0':
    case 'high':
      return 0;
    case 'P1':
      return 1;
    case 'P2':
    case 'medium':
      return 2;
    case 'P3':
    case 'low':
      return 3;
    default:
      return 2;
  }
}

// ─── Capability matching ─────────────────────────────────────────────────────

/** Role → the skills that role typically requires, for capability inference. */
const ROLE_SKILL_HINTS: Record<string, string[]> = {
  coder: ['codebase', 'holoscript-dev', 'frontend', 'compile'],
  researcher: ['research', 'codebase', 'documenter'],
  reviewer: ['critic', 'scan', 'codebase'],
  tester: ['holoscript-dev', 'scan'],
  architect: ['codebase', 'system-design'],
  docs: ['documenter'],
  security: ['critic', 'scan', 'security'],
};

/**
 * Keyword → skill signals scanned from a task title/description when explicit
 * tags/role are thin. Keep small and high-precision.
 */
const KEYWORD_SKILL_HINTS: Array<[RegExp, string]> = [
  [/\bsecurit|vuln|auth|secret\b/i, 'security'],
  [/\btest|coverage|vitest\b/i, 'holoscript-dev'],
  [/\bdoc|readme|changelog\b/i, 'documenter'],
  [/\brefactor|bug|fix|implement|trait|compiler\b/i, 'holoscript-dev'],
  [/\breview|audit|critique\b/i, 'critic'],
  [/\bresearch|paper|investigat\b/i, 'research'],
  [/\bdeploy|release|build\b/i, 'compile'],
];

/** Derive the set of capability signals a task implies. */
export function deriveTaskSkills(task: BoardTask): Set<string> {
  const skills = new Set<string>();
  for (const tag of task.tags ?? []) skills.add(tag.toLowerCase());
  if (task.role) for (const s of ROLE_SKILL_HINTS[task.role.toLowerCase()] ?? []) skills.add(s);
  const haystack = `${task.title} ${task.description ?? ''}`;
  for (const [re, skill] of KEYWORD_SKILL_HINTS) if (re.test(haystack)) skills.add(skill);
  return skills;
}

/**
 * Score how well an agent fits a task. Higher is better; -Infinity means the
 * agent is ineligible (offline or already busy).
 *
 * Score = (matched skill count) + availability bonus. An agent with no skill
 * overlap still scores 0 (eligible as a generalist) unless it's unavailable.
 */
export function scoreAgentForTask(task: BoardTask, agent: FleetAgent): number {
  const status = (agent.status ?? 'online').toLowerCase();
  if (status === 'offline') return Number.NEGATIVE_INFINITY;
  if (agent.currentTask) return Number.NEGATIVE_INFINITY; // one task at a time
  if (status === 'busy') return Number.NEGATIVE_INFINITY;

  const needed = deriveTaskSkills(task);
  const have = new Set(agent.skills.map((s) => s.toLowerCase()));
  let matched = 0;
  for (const skill of needed) if (have.has(skill)) matched += 1;

  // Idle + online agent gets a small availability bonus so a free generalist is
  // preferred over leaving a task unassigned, but a skilled match always wins.
  return matched + 0.1;
}

/** Pick the best eligible agent for a task, or null if none are eligible. */
export function matchAgentToTask(
  task: BoardTask,
  agents: FleetAgent[],
): { agent: FleetAgent; score: number } | null {
  let best: { agent: FleetAgent; score: number } | null = null;
  for (const agent of agents) {
    const score = scoreAgentForTask(task, agent);
    if (score === Number.NEGATIVE_INFINITY) continue;
    if (!best || score > best.score) best = { agent, score };
  }
  return best;
}

// ─── Task selection ──────────────────────────────────────────────────────────

/** Is a task available to be dispatched (open and unclaimed)? */
export function isClaimable(task: BoardTask): boolean {
  const status = (task.status ?? 'open').toLowerCase();
  if (status === 'done' || status === 'blocked' || status === 'claimed') return false;
  if (task.claimedBy) return false;
  return true;
}

/**
 * Order claimable tasks by urgency then age (oldest first as a stable
 * tie-breaker). Returns a new sorted array; does not mutate the input.
 */
export function rankTasks(tasks: BoardTask[]): BoardTask[] {
  return tasks
    .filter(isClaimable)
    .slice()
    .sort((a, b) => {
      const pa = normalizePriority(a.priority);
      const pb = normalizePriority(b.priority);
      if (pa !== pb) return pa - pb;
      const ta = a.createdAt ? Date.parse(a.createdAt) : Number.POSITIVE_INFINITY;
      const tb = b.createdAt ? Date.parse(b.createdAt) : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
}

/** The single highest-priority claimable task, or null if none. */
export function selectNextTask(tasks: BoardTask[]): BoardTask | null {
  return rankTasks(tasks)[0] ?? null;
}

// ─── Spend governance ────────────────────────────────────────────────────────

/** Conservative default daily cap for autonomous fleet execution (USD). */
export const DEFAULT_DAILY_SPEND_CAP_USD = 25;

export interface SpendSnapshot {
  dayKey: string;
  spentUsd: number;
  capUsd: number;
  remainingUsd: number;
}

/** UTC day key (YYYY-MM-DD) used to roll the spend window. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Tracks autonomous spend against a daily cap. Spend is AUTHORIZED but the
 * governor refuses anything that would push the day over the cap. The window
 * resets automatically at the UTC day boundary.
 *
 * Persistence is the wiring layer's concern: hydrate from a store via the
 * constructor, and persist `snapshot()` after each `record()`.
 */
export class SpendGovernor {
  private dayKey: string;
  private spentUsd: number;
  readonly capUsd: number;

  constructor(opts: { capUsd?: number; dayKey?: string; spentUsd?: number } = {}) {
    this.capUsd = opts.capUsd ?? DEFAULT_DAILY_SPEND_CAP_USD;
    this.dayKey = opts.dayKey ?? utcDayKey();
    this.spentUsd = opts.spentUsd ?? 0;
  }

  private roll(now: Date = new Date()): void {
    const today = utcDayKey(now);
    if (today !== this.dayKey) {
      this.dayKey = today;
      this.spentUsd = 0;
    }
  }

  remainingUsd(now: Date = new Date()): number {
    this.roll(now);
    return Math.max(0, this.capUsd - this.spentUsd);
  }

  /** Would spending `estUsd` stay within today's cap? */
  canAfford(estUsd: number, now: Date = new Date()): boolean {
    if (!Number.isFinite(estUsd) || estUsd < 0) return false;
    return estUsd <= this.remainingUsd(now);
  }

  /** Record actual spend after a dispatch executes. */
  record(actualUsd: number, now: Date = new Date()): void {
    this.roll(now);
    if (Number.isFinite(actualUsd) && actualUsd > 0) this.spentUsd += actualUsd;
  }

  snapshot(now: Date = new Date()): SpendSnapshot {
    this.roll(now);
    return {
      dayKey: this.dayKey,
      spentUsd: this.spentUsd,
      capUsd: this.capUsd,
      remainingUsd: this.remainingUsd(now),
    };
  }

  /** Restore state from a persisted snapshot (e.g. after a process restart). */
  hydrate(snap: SpendSnapshot): void {
    const today = utcDayKey();
    if (snap.dayKey === today) {
      this.dayKey = snap.dayKey;
      this.spentUsd = snap.spentUsd;
    }
    // Stale snapshot from a prior day is silently ignored — roll() will reset on next use.
  }
}

// ─── Spend estimation ────────────────────────────────────────────────────────

/**
 * Rough pre-execution cost estimate (USD) for a task, used to gate dispatch
 * against the cap. Heuristic by urgency — higher-priority work tends to be
 * larger/deeper. The wiring layer may replace this with a model-token estimate.
 */
export function estimateTaskSpendUsd(task: BoardTask): number {
  switch (normalizePriority(task.priority)) {
    case 0:
      return 3.0; // P0/high — likely deep
    case 1:
      return 2.0;
    case 2:
      return 1.0; // P2/medium
    default:
      return 0.5; // P3/low
  }
}

// ─── Orchestration ───────────────────────────────────────────────────────────

export interface PlanOptions {
  /** Max number of dispatches to plan in one tick. Default 1. */
  maxDispatches?: number;
  /** Override the per-task spend estimator (e.g. token-based). */
  estimateSpendUsd?: (task: BoardTask) => number;
}

export interface FleetDispatchPlan {
  decisions: DispatchDecision[];
  /** Tasks that were claimable but had no eligible agent. */
  unassigned: BoardTask[];
  /** True if planning stopped early because the daily spend cap was reached. */
  capReached: boolean;
  spend: SpendSnapshot;
}

/**
 * Produce an ordered dispatch plan: for the top claimable tasks, assign the best
 * free agent and reserve estimated spend against the cap. Pure — it does not
 * execute anything or mutate the governor's recorded spend (it reserves against
 * a working copy so callers stay in control of when real spend is recorded).
 *
 * The caller is responsible for: claiming each task, invoking the LLM agent,
 * recording ACTUAL spend via governor.record(), and closing the task with
 * evidence. This function only decides WHAT to dispatch and WHETHER the cap
 * allows it.
 */
export function planFleetDispatch(
  tasks: BoardTask[],
  agents: FleetAgent[],
  governor: SpendGovernor,
  options: PlanOptions = {},
): FleetDispatchPlan {
  const maxDispatches = Math.max(1, options.maxDispatches ?? 1);
  const estimate = options.estimateSpendUsd ?? estimateTaskSpendUsd;

  const ranked = rankTasks(tasks);
  const decisions: DispatchDecision[] = [];
  const unassigned: BoardTask[] = [];
  const assignedAgentIds = new Set<string>();
  let reservedUsd = 0;
  let capReached = false;

  for (const task of ranked) {
    if (decisions.length >= maxDispatches) break;

    // Eligible agents = free agents not already assigned in this plan.
    const free = agents.filter((a) => !assignedAgentIds.has(a.id));
    const match = matchAgentToTask(task, free);
    if (!match) {
      unassigned.push(task);
      continue;
    }

    const estUsd = estimate(task);
    if (reservedUsd + estUsd > governor.remainingUsd()) {
      capReached = true;
      break; // cap-bound; stop planning further spend
    }

    reservedUsd += estUsd;
    assignedAgentIds.add(match.agent.id);
    decisions.push({
      task,
      agent: match.agent,
      score: match.score,
      estimatedSpendUsd: estUsd,
      reason:
        match.score >= 1
          ? `capability match (${match.score.toFixed(1)}) — ${match.agent.handle}`
          : `available generalist — ${match.agent.handle}`,
    });
  }

  return { decisions, unassigned, capReached, spend: governor.snapshot() };
}
