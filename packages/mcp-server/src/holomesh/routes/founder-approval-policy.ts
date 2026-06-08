/**
 * Founder-approval reversibility policy (N3 signed-write path — pure half).
 *
 * The founder-approval route records low-stakes INTENT only; a signing agent
 * later executes the real mutation with its own x402 envelope. The one-tap
 * safety gate (D.044): only REVERSIBLE intents may be auto-approved. Irreversible
 * / spend / custody intents are 403'd by the route and stay on the explicit
 * navigate-to-review path.
 *
 * This derivation is the SERVER-SIDE authority. It MUST stay in sync with the
 * Studio `nextActions.ts` `reversible` flag. Both now import from the shared
 * canonical module below — divergence is structurally prevented.
 *
 * No http/runtime imports — unit-testable standalone.
 */

import {
  type FounderActionType,
  type FounderReversibility,
  inferFounderActionType,
  deriveFounderReversibility,
} from '@holoscript/framework';

// Re-export under the local names the existing tests + routes already use.
export type FounderApprovalActionType = FounderActionType;
export type ApprovalReversibility = FounderReversibility;

export function inferApprovalActionType(text: string): FounderApprovalActionType {
  return inferFounderActionType(text);
}

/**
 * Re-derive reversibility for a founder-approval intent from its text (the board
 * task title, or the intent string if no task is found). The route 403s when
 * `reversible` is false.
 */
export function deriveApprovalReversibility(text: string): ApprovalReversibility {
  return deriveFounderReversibility(text);
}
