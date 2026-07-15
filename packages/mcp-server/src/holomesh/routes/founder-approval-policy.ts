/**
 * Founder-approval reversibility policy (N3 signed-write path — pure half).
 *
 * The founder-decision route records exact-four INTENT only; a signing agent
 * later executes the real mutation with its own x402 envelope and verifier.
 * Routine work is autonomous. Specialist review, platform controls, and
 * prohibited replanning never become generic Joseph approval requests.
 *
 * This derivation is the SERVER-SIDE authority. It MUST stay in sync with the
 * Studio `nextActions.ts` authority route. Both import from the shared
 * canonical module below — divergence is structurally prevented.
 *
 * No http/runtime imports — unit-testable standalone.
 */

import {
  type FounderActionType,
  type FounderAuthorityContext,
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
 * Re-derive typed authority routing from server-side intent. Only the
 * `joseph-exact-four` route belongs on the founder-decision path; autonomous,
 * specialist, platform-control, and prohibited routes remain separate.
 */
export function deriveApprovalReversibility(
  text: string,
  context: FounderAuthorityContext = {}
): ApprovalReversibility {
  return deriveFounderReversibility(text, context);
}
