/**
 * Founder-approval reversibility policy (N3 signed-write path — pure half).
 *
 * The founder-approval route records low-stakes INTENT only; a signing agent
 * later executes the real mutation with its own x402 envelope. The one-tap
 * safety gate (D.044): only REVERSIBLE intents may be auto-approved. Irreversible
 * / spend / custody intents are 403'd by the route and stay on the explicit
 * navigate-to-review path.
 *
 * This derivation is the SERVER-SIDE authority. It MUST mirror the Studio
 * `nextActions.ts` `reversible` flag
 * (packages/studio/src/app/api/quest-proof/next-actions/nextActions.ts) so the
 * chip a founder sees as "tap to do" is exactly what the server admits. Never
 * trust a client-sent reversible flag — re-derive from the task title here.
 *
 * No http/runtime imports — unit-testable standalone.
 */

export type FounderApprovalActionType =
  | 'code'
  | 'spatial'
  | 'service_rental'
  | 'mobility_coordination';

// ── MIRRORS packages/studio/src/app/api/quest-proof/next-actions/nextActions.ts ──
// Keep these three regexes byte-identical to the Studio half. If you change one,
// change both — divergence means the founder taps a chip the server then rejects.
const IRREVERSIBLE_RE =
  /\b(deploy|force[- ]?push|reset|delete|retire|spend|pay|purchase|rent|mainnet|treasury|trezor|custody|sign|broadcast|merge to main|publish (on-chain|edition))\b/i;
const SPATIAL_RE =
  /\b(world|scene|hololand|zone|render|hologram|quilt|avatar|reconstruct|holomap)\b/i;
const RENTAL_RE = /\b(rent|rental|gpu|fleet|vast|provision|compute)\b/i;
const MOBILITY_RE = /\b(mobility|trip|route|navigate|door-to-door)\b/i;

export function inferApprovalActionType(text: string): FounderApprovalActionType {
  if (RENTAL_RE.test(text)) return 'service_rental';
  if (MOBILITY_RE.test(text)) return 'mobility_coordination';
  if (SPATIAL_RE.test(text)) return 'spatial';
  return 'code';
}

export interface ApprovalReversibility {
  actionType: FounderApprovalActionType;
  /** One-tap eligible iff true. False intents must route through explicit review. */
  reversible: boolean;
  /** Human-readable reason the route returns on a 403. */
  reason: string;
}

/**
 * Re-derive reversibility for a founder-approval intent from its text (the board
 * task title, or the intent string if no task is found). The route 403s when
 * `reversible` is false.
 */
export function deriveApprovalReversibility(text: string): ApprovalReversibility {
  const actionType = inferApprovalActionType(text);
  if (IRREVERSIBLE_RE.test(text)) {
    return {
      actionType,
      reversible: false,
      reason: 'intent matches an irreversible / spend / custody verb (D.044) — explicit review required',
    };
  }
  if (actionType === 'service_rental' || actionType === 'mobility_coordination') {
    return {
      actionType,
      reversible: false,
      reason: `actionType "${actionType}" is never one-tap auto-approved (D.044) — explicit review required`,
    };
  }
  return { actionType, reversible: true, reason: 'reversible' };
}
