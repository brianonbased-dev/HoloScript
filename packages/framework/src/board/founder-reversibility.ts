/**
 * Founder-approval reversibility policy — canonical shared module.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH for the four verb-classification regexes.
 *
 * Both consumers MUST import from here instead of defining their own copies:
 *   - packages/mcp-server/src/holomesh/routes/founder-approval-policy.ts  (server authority)
 *   - packages/studio/src/app/api/quest-proof/next-actions/nextActions.ts (client chip filter)
 *
 * Why one module: the founder sees a chip labelled "tap to approve" — that chip
 * is rendered by the Studio consumer. The server then re-derives reversibility
 * for the same intent before admitting the request. If the two regexes diverge,
 * the founder taps a chip the server rejects (silent UX failure). A single
 * canonical source makes that class of bug structurally impossible.
 *
 * No http/runtime imports — pure logic, unit-testable standalone.
 */

export type FounderActionType = 'code' | 'spatial' | 'service_rental' | 'mobility_coordination';

// ── Four classification regexes — edit HERE only, never in the consumers ─────

export const IRREVERSIBLE_RE =
  /\b(deploy|force[- ]?push|reset|delete|retire|spend|pay|purchase|rent|mainnet|treasury|trezor|custody|sign|broadcast|merge to main|publish (on-chain|edition))\b/i;

export const SPATIAL_RE =
  /\b(world|scene|hololand|zone|render|hologram|quilt|avatar|reconstruct|holomap)\b/i;

export const RENTAL_RE = /\b(rent|rental|gpu|fleet|vast|provision|compute)\b/i;

// "route" alone matches software routes (API routes, route handlers) — only gate
// when paired with mobility context (mobility, trip, navigate, door-to-door).
// Bare "route" in a task title like "Add the founder-approval route" is a code
// action, not a mobility coordination.
export const MOBILITY_RE = /\b(mobility|door-to-door)\b|(?:trip|navigate)\b/i;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a task title / intent string into one of the four action types.
 * Rental beats spatial (spend gate is stricter).
 */
export function inferFounderActionType(text: string): FounderActionType {
  if (RENTAL_RE.test(text)) return 'service_rental';
  if (MOBILITY_RE.test(text)) return 'mobility_coordination';
  if (SPATIAL_RE.test(text)) return 'spatial';
  return 'code';
}

export interface FounderReversibility {
  actionType: FounderActionType;
  /** One-tap eligible iff true. False means explicit review required. */
  reversible: boolean;
  /** Human-readable reason returned to the caller on a 403. */
  reason: string;
}

/**
 * Derive whether a founder-approval intent is reversible (one-tap eligible).
 * The server re-derives this on every request; the client uses it for chip
 * rendering. They share this function so they are always in sync.
 */
export function deriveFounderReversibility(text: string): FounderReversibility {
  const actionType = inferFounderActionType(text);
  if (IRREVERSIBLE_RE.test(text)) {
    return {
      actionType,
      reversible: false,
      reason:
        'intent matches an irreversible / spend / custody verb (D.044) — explicit review required',
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
