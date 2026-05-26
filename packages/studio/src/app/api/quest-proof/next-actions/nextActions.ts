/**
 * NextActions aggregator (Anticipatory Actions, D.066 — pure half).
 *
 * The founder doctrine: anticipate the next 3-4 moves so the human TAPS instead
 * of typing. This maps the deployed team board's top open tasks into lightweight
 * `ProposedAction` views the Console renders as approve-on-tap chips.
 *
 * Honesty note: this is NOT a full agi-action-manifest (that schema requires
 * provenance/verification/safety/replay/closeout we can't truthfully fill from a
 * board task). It carries the schema's KEY discriminators — actionType, status,
 * intent, and a `reversible` flag for the one-tap safety gate (D.044). The full
 * manifest is materialized at approve-time (N3). No facade.
 *
 * No Next/runtime imports — unit-testable standalone.
 */

export type ProposedActionType = 'code' | 'spatial' | 'service_rental' | 'mobility_coordination';

export interface ProposedAction {
  id: string;
  /** Short verb-y label for the tap chip. */
  label: string;
  /** The human-readable intent (the task title / what tapping will do). */
  intent: string;
  actionType: ProposedActionType;
  status: 'proposed';
  /** Source board task id (artifact ref the approve step will act on). */
  taskId: string;
  priority: number;
  /**
   * One-tap eligible iff reversible. Irreversible / spend / custody actions show
   * the chip but route through the approval/safety-envelope gate (D.044) —
   * never one-tap-auto.
   */
  reversible: boolean;
  /** Where tapping the chip takes the founder (server-attached; needs TEAM_ID). */
  href?: string;
}

interface BoardTaskLike {
  id?: string;
  title?: string;
  status?: string;
  priority?: number;
}

const IRREVERSIBLE_RE =
  /\b(deploy|force[- ]?push|reset|delete|retire|spend|pay|purchase|rent|mainnet|treasury|trezor|custody|sign|broadcast|merge to main|publish (on-chain|edition))\b/i;

const SPATIAL_RE = /\b(world|scene|hololand|zone|render|hologram|quilt|avatar|reconstruct|holomap)\b/i;
const RENTAL_RE = /\b(rent|rental|gpu|fleet|vast|provision|compute)\b/i;
const MOBILITY_RE = /\b(mobility|trip|route|navigate|door-to-door)\b/i;

export function inferActionType(title: string): ProposedActionType {
  if (RENTAL_RE.test(title)) return 'service_rental';
  if (MOBILITY_RE.test(title)) return 'mobility_coordination';
  if (SPATIAL_RE.test(title)) return 'spatial';
  return 'code';
}

/** Strip the bracketed [scope][tag] prefixes board titles carry, for a clean chip label. */
export function chipLabel(title: string): string {
  const stripped = title.replace(/^(\s*\[[^\]]*\])+\s*/, '').trim();
  return (stripped || title).slice(0, 80);
}

/**
 * Map open board tasks → ranked ProposedAction views (newest-highest-priority
 * first), capped. Only `open` tasks are anticipatable next moves.
 */
export function buildProposedActions(tasks: unknown, limit = 4): ProposedAction[] {
  const arr = Array.isArray(tasks) ? (tasks as BoardTaskLike[]) : [];
  const out: ProposedAction[] = [];
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue;
    if (t.status !== 'open') continue; // claimed/blocked/done are not "next" taps
    const title = typeof t.title === 'string' ? t.title : '';
    const id = typeof t.id === 'string' ? t.id : '';
    if (!title || !id) continue;
    const actionType = inferActionType(title);
    const reversible = !IRREVERSIBLE_RE.test(title) && actionType !== 'service_rental' && actionType !== 'mobility_coordination';
    out.push({
      id: `proposed:${id}`,
      label: chipLabel(title),
      intent: title.slice(0, 200),
      actionType,
      status: 'proposed',
      taskId: id,
      priority: typeof t.priority === 'number' ? t.priority : 5,
      reversible,
    });
  }
  // priority ascending (1 = most urgent) is the rank
  out.sort((a, b) => a.priority - b.priority);
  return out.slice(0, Math.max(1, limit));
}
