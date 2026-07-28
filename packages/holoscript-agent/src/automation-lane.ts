import type { BoardTask } from './types.js';

/**
 * Automation lane — board-compass Phase 3 (task_1783917146937_bt29).
 *
 * The HoloShell team-automations feeder (ai-ecosystem/scripts/
 * holoshell-team-automations.mjs) enqueues due registry rows as board PROMPT
 * tasks (source `holoshell-team-automations`, tag `holoshell-automation`) whose
 * description carries the execution contract. Observed starvation jam
 * (research/2026-07-12_board-starvation-prevention-and-ecosystem-compass.md §2
 * S1): those prompt tasks pile up unclaimed, and the feeder's title-dedup then
 * blocks ALL further refill (`due:38 enqueued:0`). This module lets the
 * always-on Jetson runner drain that lane — selection + safety-screen logic
 * only; execution reuses the runner's existing claim/execute/closeout
 * machinery so the post-W.824 server evidence gates stay the trust floor.
 *
 * a-058 template guarantees (mirrors ai-ecosystem/scripts/grok-dispatch-lane.mjs):
 *   - Explicit opt-in (HOLOSCRIPT_AGENT_AUTOMATION_LANE) — default OFF, so
 *     deploying a build with this module changes nothing until the flag flips.
 *   - Dry-run is the DEFAULT once enabled: the runner claims NOTHING and logs a
 *     selection receipt (what it WOULD claim and why). Live claiming requires a
 *     second explicit flag (HOLOSCRIPT_AGENT_AUTOMATION_LANE_APPLY).
 *   - ONE automation task per tick, and only on the idle path — automation work
 *     never pre-empts normal capability-matched claims.
 *   - Conservative safety screen: spend / lease / custody / fleet-destroy /
 *     secret / deploy shapes are refused and stay for human-session seats.
 */

/** Which selection path produced the claimed task this tick. */
export type TaskLane = 'capability' | 'automation';

/** Board `source` stamped by the holoshell-team-automations feeder. */
export const AUTOMATION_LANE_SOURCE = 'holoshell-team-automations';
/** Board tag stamped by the same feeder (accepted as an alternative marker). */
export const AUTOMATION_LANE_TAG = 'holoshell-automation';

export interface AutomationLaneConfig {
  /** Lane consulted at all (HOLOSCRIPT_AGENT_AUTOMATION_LANE=1|true). Default false. */
  enabled: boolean;
  /**
   * Live claiming enabled (HOLOSCRIPT_AGENT_AUTOMATION_LANE_APPLY=1|true).
   * false while enabled → dry-run: log the selection receipt, claim nothing.
   */
  apply: boolean;
}

/** Truthy convention shared with the package's other env toggles ('1' | 'true'). */
function envFlag(value: string | undefined): boolean {
  const v = (value ?? '').toLowerCase();
  return v === '1' || v === 'true';
}

/**
 * Resolve the lane config from the environment (the runner's existing config
 * idiom — cf. HOLOSCRIPT_AGENT_MIN_FREE_MB / HOLOSCRIPT_AGENT_EVOLVE_ACCRUAL:
 * env-read per tick, double default-OFF for anything that grows autonomy).
 */
export function resolveAutomationLaneConfig(env: NodeJS.ProcessEnv): AutomationLaneConfig {
  const enabled = envFlag(env.HOLOSCRIPT_AGENT_AUTOMATION_LANE);
  return {
    enabled,
    apply: enabled && envFlag(env.HOLOSCRIPT_AGENT_AUTOMATION_LANE_APPLY),
  };
}

/** True when the task is an automation-lane prompt task (by source, or by tag). */
export function isAutomationLaneTask(task: BoardTask): boolean {
  if (task.source === AUTOMATION_LANE_SOURCE) return true;
  return (task.tags ?? []).some((t) => t.toLowerCase() === AUTOMATION_LANE_TAG);
}

/**
 * Named refusal screens (category → pattern), mirroring the INTENT of
 * grok-dispatch-lane's EXCLUDE_PATTERNS (spend/lease/custody/fleet/secret/
 * deploy stay with human-session seats). Deliberately NOT a verbatim copy:
 * the feeder's routing boilerplate puts `x402=`, `HoloKey=`, `signed-board-task`,
 * `owned-metal`, and `jetson` custody-node names into EVERY automation task
 * (holoshell-team-automations.mjs descriptionForAutomation / buildBoardTask),
 * so screening those literal tokens would refuse 100% of the lane. Patterns
 * here name the dangerous OPERATIONS instead, with word boundaries.
 * Each hit is reported by name in the selection receipt so refusals are
 * auditable and tunable.
 */
export const AUTOMATION_SAFETY_SCREENS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  {
    name: 'spend',
    pattern: /\bspend\b|\btreasury\b|\bbudget\b|\bpayment\b|\bpurchase\b|\btop-?up\b|\bbilling\b/i,
  },
  { name: 'lease', pattern: /\blease\b|\bwithlease\b/i },
  {
    name: 'custody',
    pattern:
      /\bcustody\b|\bwallets?\b|\bprivate[- ]keys?\b|\bseed[- ]phrase\b|\btrezor\b|\bsigning[- ]keys?\b/i,
  },
  {
    name: 'fleet-destroy',
    pattern:
      /\bfleet\b|\bautoscal\w*\b|\bvast\b|\bgpu\b|\bdestroy\b|\bterminate\b|\bdeprovision\b/i,
  },
  {
    name: 'secret',
    pattern: /\bsecrets?\b|\bcredentials?\b|\bapi[-_ ]?keys?\b|\brotat(?:e|ion|ing)\b|\b\.env\b/i,
  },
  {
    name: 'deploy',
    pattern: /\bdeploys?\b|\bdeployment\b|\brailway\b|\bpublish\b|\bforce[- ]push\b/i,
  },
];

/** Description bounds — a claimable prompt task must be self-contained and bounded. */
const MIN_DESCRIPTION_CHARS = 40;
const MAX_DESCRIPTION_CHARS = 8000;

/**
 * All refusal reasons for one automation-lane task, or [] when it is eligible.
 * Reasons are stable machine-readable names (receipt vocabulary):
 *   screen:<name>            — matched a safety screen (title+tags+description)
 *   required-tags-unsatisfied — task.required_tags ⊄ this agent's capability tags
 *                               (the server would 403 capability_mismatch anyway;
 *                               refusing client-side keeps the receipt honest about
 *                               WHY the lane cannot drain — e.g. a Jetson presence
 *                               missing `owned-metal`)
 *   description-too-short / description-too-long — not a self-contained bounded prompt
 */
export function screenAutomationTask(task: BoardTask, agentCapabilityTags: string[]): string[] {
  const reasons: string[] = [];
  const surface = `${task.title ?? ''}\n${(task.tags ?? []).join(' ')}\n${task.description ?? ''}`;
  for (const screen of AUTOMATION_SAFETY_SCREENS) {
    if (screen.pattern.test(surface)) reasons.push(`screen:${screen.name}`);
  }
  const required = task.required_tags ?? [];
  if (required.length > 0) {
    const mine = new Set(agentCapabilityTags.map((t) => t.toLowerCase()));
    if (!required.every((t) => mine.has(t.toLowerCase()))) {
      reasons.push('required-tags-unsatisfied');
    }
  }
  const descLen = (task.description ?? '').trim().length;
  if (descLen < MIN_DESCRIPTION_CHARS) reasons.push('description-too-short');
  if (descLen > MAX_DESCRIPTION_CHARS) reasons.push('description-too-long');
  return reasons;
}

/**
 * Tolerant priority rank for ordering only (never a gate): numbers pass
 * through, "P3"/"p3" → 3, named levels map, anything unparseable sorts last.
 * Duplicated shape from grok-dispatch-lane.priorityRank — the board still
 * speaks priority babel (memo §2 S2) until the server-side canonicalization
 * (Phase 0) ships.
 */
export function priorityRank(priority: string | number | undefined): number {
  if (typeof priority === 'number') return Number.isFinite(priority) ? priority : 9;
  const named: Record<string, number> = { critical: 1, high: 2, medium: 4, normal: 4, low: 6 };
  const raw = String(priority ?? '')
    .trim()
    .toLowerCase();
  if (raw in named) return named[raw];
  const n = parseInt(raw.replace(/^p/i, ''), 10);
  return Number.isFinite(n) ? n : 9;
}

export interface AutomationLaneRefusal {
  id: string;
  title: string;
  reasons: string[];
}

/** Selection receipt — the auditable "which task and WHY" record for one tick. */
export interface AutomationLaneDecision {
  /** Open, unclaimed automation-lane tasks seen this tick. */
  scanned: number;
  /** How many passed every screen. */
  eligible: number;
  /** The single task this tick would claim (undefined → lane is a no-op). */
  selected: BoardTask | undefined;
  /** Human-readable why for `selected`. */
  selectionReason?: string;
  /** Tasks refused by the screens, with named reasons. */
  refused: AutomationLaneRefusal[];
}

/**
 * Pick AT MOST ONE automation-lane prompt task from the candidate pool.
 * `tasks` must already exclude claim-cooldown entries (the runner passes its
 * `claimable` set). Ordering: priority rank asc → createdAt asc (FIFO drain;
 * missing timestamps last) → id (stable). Pure and synchronous for testability.
 */
export function selectAutomationTask(
  tasks: BoardTask[],
  agentCapabilityTags: string[]
): AutomationLaneDecision {
  const candidates = tasks.filter(
    (t) => t.status === 'open' && !t.claimedBy && isAutomationLaneTask(t)
  );
  const refused: AutomationLaneRefusal[] = [];
  const eligible: BoardTask[] = [];
  for (const task of candidates) {
    const reasons = screenAutomationTask(task, agentCapabilityTags);
    if (reasons.length > 0) refused.push({ id: task.id, title: task.title, reasons });
    else eligible.push(task);
  }
  eligible.sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;
    const aCreated = a.createdAt ? Date.parse(a.createdAt) : Number.POSITIVE_INFINITY;
    const bCreated = b.createdAt ? Date.parse(b.createdAt) : Number.POSITIVE_INFINITY;
    const byAge =
      (Number.isFinite(aCreated) ? aCreated : Number.POSITIVE_INFINITY) -
      (Number.isFinite(bCreated) ? bCreated : Number.POSITIVE_INFINITY);
    if (byAge !== 0) return byAge;
    return a.id.localeCompare(b.id);
  });
  const selected = eligible[0];
  return {
    scanned: candidates.length,
    eligible: eligible.length,
    selected,
    selectionReason: selected
      ? `oldest open automation task at priority ${priorityRank(selected.priority)} ` +
        `(${eligible.length} eligible of ${candidates.length} scanned; ${refused.length} refused by screens)`
      : undefined,
    refused,
  };
}
