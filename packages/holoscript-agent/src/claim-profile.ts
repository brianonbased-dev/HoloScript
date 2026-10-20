/**
 * Claim profiles (small-jobs rule, 2026-10-12).
 *
 * The hand-off fix stopped the stall, but keyword scoring over the Jetson brain's
 * 18 broad capability tags (research, paper, multi-step, ...) still steered a
 * 4096-token edge seat toward big tasks. A claim profile replaces that with an
 * explicit, config-driven opt-in:
 *
 *  - `edge-small` (Jetson): claim ONLY tasks tagged `edge-small` AND whose static
 *    prompt fits 40% of n_ctx. Both, because the size estimate alone proved a weak
 *    predictor (every task in the Oct 7 board snapshot passed a 60% size check, yet
 *    the tool loop overflowed), while a tag alone can be put on a task that has
 *    since grown. Tasks carrying hand-off or big-context tags are excluded.
 *    Presence advertises only narrow edge tags.
 *  - `big-context` (the 16k seat): the opposite. Claim only tasks routed for a
 *    larger window (`ctx-16k+`, `laptop-or-fleet`, `large-context`, `repo-wide`,
 *    `multi-file`), skip the route-tag refusals, 60% budget of its own n_ctx.
 *  - unset: legacy behaviour (brain capability tags, no tag gate).
 *
 * Env overrides (comma lists): HOLOSCRIPT_AGENT_CLAIM_REQUIRE_TAGS (any-of),
 * HOLOSCRIPT_AGENT_CLAIM_EXCLUDE_TAGS, HOLOSCRIPT_AGENT_CAPABILITY_TAGS, and
 * HOLOSCRIPT_AGENT_CLAIM_BUDGET_FRACTION.
 */
import type { BoardTask } from './types.js';
import { BIG_CONTEXT_TAGS, HANDOFF_TAGS } from './handoff.js';

export type ClaimProfileName = 'edge-small' | 'big-context' | 'legacy';

export interface ClaimProfile {
  name: ClaimProfileName;
  /** Task must carry at least one of these (tags or required_tags). Empty = no gate. */
  requireAnyTags: string[];
  /** Task must carry none of these. */
  excludeTags: string[];
  /** Fraction of n_ctx the static prompt may use at claim time. */
  budgetFraction: number;
  /** Replaces the brain's capability tags for presence + scoring; null = keep brain's. */
  capabilityTags: string[] | null;
  /** Skip assessTaskFit's route-tag refusals (true for the hand-off target). */
  skipRouteTags: boolean;
}

export const EDGE_SMALL_TAG = 'edge-small';
export const EDGE_SMALL_CAPABILITY_TAGS = [
  'jetson',
  'edge',
  'edge-small',
  'edge-node',
  'local-inference',
  'holoscript-authoring',
  'tool-call',
];
export const BIG_CONTEXT_REQUIRE_TAGS = [
  'ctx-16k+',
  'laptop-or-fleet',
  'large-context',
  'repo-wide',
  'multi-file',
];
export const BIG_CONTEXT_CAPABILITY_TAGS = [
  'ctx-16k+',
  'laptop-or-fleet',
  'large-context',
  'repo-wide',
  'multi-file',
  'local-inference',
  'tool-call',
];

function list(v: string | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return v
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveClaimProfile(env: NodeJS.ProcessEnv = process.env): ClaimProfile {
  const raw = (env.HOLOSCRIPT_AGENT_CLAIM_PROFILE ?? '').trim().toLowerCase();
  let p: ClaimProfile;
  if (raw === 'edge-small') {
    p = {
      name: 'edge-small',
      requireAnyTags: [EDGE_SMALL_TAG],
      excludeTags: [...BIG_CONTEXT_TAGS, ...HANDOFF_TAGS],
      budgetFraction: 0.4,
      capabilityTags: [...EDGE_SMALL_CAPABILITY_TAGS],
      skipRouteTags: false,
    };
  } else if (raw === 'big-context') {
    p = {
      name: 'big-context',
      requireAnyTags: [...BIG_CONTEXT_REQUIRE_TAGS],
      excludeTags: [],
      budgetFraction: 0.6,
      capabilityTags: [...BIG_CONTEXT_CAPABILITY_TAGS],
      skipRouteTags: true,
    };
  } else {
    p = {
      name: 'legacy',
      requireAnyTags: [],
      excludeTags: [],
      budgetFraction: 0.6,
      capabilityTags: null,
      skipRouteTags: false,
    };
  }
  const req = list(env.HOLOSCRIPT_AGENT_CLAIM_REQUIRE_TAGS);
  if (req) p.requireAnyTags = req;
  const exc = list(env.HOLOSCRIPT_AGENT_CLAIM_EXCLUDE_TAGS);
  if (exc) p.excludeTags = exc;
  const caps = list(env.HOLOSCRIPT_AGENT_CAPABILITY_TAGS);
  if (caps && caps.length) p.capabilityTags = caps;
  const frac = Number(env.HOLOSCRIPT_AGENT_CLAIM_BUDGET_FRACTION);
  if (Number.isFinite(frac) && frac > 0 && frac <= 1) p.budgetFraction = frac;
  return p;
}

export interface ProfileScreen {
  ok: boolean;
  reason?: 'profile-missing-tag' | 'profile-excluded-tag';
  detail?: string;
}

/** Tag gate of a claim profile. Size is checked separately by assessTaskFit. */
export function screenTaskForProfile(task: BoardTask, profile: ClaimProfile): ProfileScreen {
  const tags = new Set(
    [...(task.tags ?? []), ...(task.required_tags ?? [])].map((t) => t.toLowerCase())
  );
  const excluded = profile.excludeTags.find((t) => tags.has(t));
  if (excluded) return { ok: false, reason: 'profile-excluded-tag', detail: excluded };
  if (profile.requireAnyTags.length && !profile.requireAnyTags.some((t) => tags.has(t))) {
    return {
      ok: false,
      reason: 'profile-missing-tag',
      detail: `needs one of: ${profile.requireAnyTags.join(',')}`,
    };
  }
  return { ok: true };
}
