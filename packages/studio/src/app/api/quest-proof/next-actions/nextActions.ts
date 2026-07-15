/**
 * NextActions aggregator (Anticipatory Actions, D.066 — pure half).
 *
 * This maps exact-four open tasks into lightweight `ProposedAction` views the
 * Console renders as Joseph-decision chips. Routine tasks are deliberately not
 * approval work; agents decide, execute, verify, and announce them.
 *
 * Honesty note: this is NOT a full agi-action-manifest (that schema requires
 * provenance/verification/safety/replay/closeout we can't truthfully fill from a
 * board task). It carries the key discriminators — actionType, authorityRoute,
 * protected class, status, and intent. The full verifier-bound manifest is
 * materialized at Joseph-decision time (N3). No facade.
 *
 * No Next/runtime imports — unit-testable standalone.
 */

import {
  type FounderActionType,
  type JosephReviewClass,
  deriveFounderReversibility,
  inferFounderActionType,
} from '@holoscript/framework';

export type ProposedActionType = FounderActionType;

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
  authorityRoute: 'joseph-exact-four';
  josephReviewClass: JosephReviewClass;
  /**
   * Legacy ActionChip projection. Exact-four decisions are never routine
   * reversible work, so this is always false.
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

export function inferActionType(title: string): ProposedActionType {
  return inferFounderActionType(title);
}

/** Strip the bracketed [scope][tag] prefixes board titles carry, for a clean chip label. */
export function chipLabel(title: string): string {
  const stripped = title.replace(/^(\s*\[[^\]]*\])+\s*/, '').trim();
  return (stripped || title).slice(0, 80);
}

/**
 * Map exact-four open board tasks to ranked Joseph-decision views. Autonomous,
 * specialist, platform-control, and prohibited routes are excluded so the
 * founder inbox cannot become the default workflow.
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
    const authority = deriveFounderReversibility(title);
    if (
      authority.authorityRoute !== 'joseph-exact-four' ||
      authority.josephReviewClass === undefined
    ) {
      continue;
    }
    const actionType = authority.actionType;
    out.push({
      id: `proposed:${id}`,
      label: chipLabel(title),
      intent: title.slice(0, 200),
      actionType,
      status: 'proposed',
      taskId: id,
      priority: typeof t.priority === 'number' ? t.priority : 5,
      authorityRoute: 'joseph-exact-four',
      josephReviewClass: authority.josephReviewClass,
      reversible: false,
    });
  }
  // priority ascending (1 = most urgent) is the rank
  out.sort((a, b) => a.priority - b.priority);
  return out.slice(0, Math.max(1, limit));
}
