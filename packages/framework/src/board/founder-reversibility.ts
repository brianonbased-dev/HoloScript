/**
 * Exact-four authority routing — canonical shared module.
 *
 * Joseph review is an exception, not the workflow. This classifier separates
 * the four protected Joseph-decision classes from specialist review, missing
 * platform controls, and prohibited operations. Routine deploys, publishes,
 * rentals, commits, wallet sign/broadcast operations within an active rail,
 * and other agent-decidable work remain autonomous.
 *
 * No HTTP/runtime imports: both the MCP authority and Studio projection consume
 * this pure module so their classifications cannot drift.
 */

export type FounderActionType = 'code' | 'spatial' | 'service_rental' | 'mobility_coordination';

export type FounderAuthorityRoute =
  | 'autonomous'
  | 'joseph-exact-four'
  | 'specialist-review'
  | 'platform-control'
  | 'prohibited-replan';

export type JosephReviewClass =
  | 'spend-or-custody'
  | 'physical-presence'
  | 'public-identity'
  | 'governance';

export interface FounderAuthorityContext {
  projectedSpendUsd?: number;
  activeRailCapUsd?: number;
  exceedsActiveRailCap?: boolean;
  touchesTreasuryOrCustody?: boolean;
  requiresJosephBodySignaturePresence?: boolean;
  publicCommitmentUnderJosephNameFaceVoice?: boolean;
  governanceTierMutation?: boolean;
}

export const SPATIAL_RE =
  /\b(world|scene|hololand|zone|render|hologram|quilt|avatar|reconstruct|holomap)\b/i;
export const RENTAL_RE = /\b(rent|rental|gpu|fleet|vast|provision|compute)\b/i;
export const MOBILITY_RE = /\b(mobility|door-to-door)\b|(?:trip|navigate)\b/i;

/** These operations are blocked and replanned; Joseph cannot approve them. */
export const PROHIBITED_OPERATION_RE = /\b(force[- ]?push|hard[- ]?reset)\b/i;
/** @deprecated Use PROHIBITED_OPERATION_RE. Kept for source compatibility. */
export const IRREVERSIBLE_RE = PROHIBITED_OPERATION_RE;

export const SPECIALIST_RE =
  /\b(legal|export[- ]control|sanctions?|compliance|irb|institutional review board|privacy)\b/i;
export const PLATFORM_CONTROL_RE =
  /\b(missing|unavailable|expired|denied|blocked)\b.{0,40}\b(tool|credential|api key|permission|platform|account access)\b|\b(tool|credential|api key|permission|platform|account access)\b.{0,40}\b(missing|unavailable|expired|denied|blocked)\b/i;

export const ACTIVE_RAIL_CAP_RE =
  /\b(exceed(?:s|ed|ing)?|over|beyond)\b.{0,40}\bactive\b.{0,24}\b(cap|rail)\b|\bactive\b.{0,24}\b(cap|rail)\b.{0,40}\b(exceed(?:s|ed|ing)?|over|beyond)\b/i;
export const CUSTODY_AUTHORITY_RE =
  /\b(treasury master wallet|trezor (?:seed|recovery)|(?:create|creating|creation of) (?:a )?new wallet|new[- ]wallet creation|custody authority|mint(?:ing)? authority|permanent seat[- ]wallet identity)\b/i;
export const JOSEPH_PHYSICAL_RE =
  /\bjoseph(?:'s)?\b.{0,40}\b(body|physical signature|presence|must sign|must attend|must be present)\b|\b(body|physical signature|presence)\b.{0,40}\bjoseph(?:'s)?\b/i;
export const JOSEPH_PUBLIC_RE =
  /\b(public|publish|announce|statement|press|post|broadcast)\b.{0,80}\bjoseph(?:'s)?\b.{0,24}\b(name|face|voice)\b|\bunder joseph(?:'s)? (?:name|face|voice)\b/i;
export const GOVERNANCE_MUTATION_RE =
  /\b(change|mutate|modify|rewrite|alter|remove|weaken|expand)\b.{0,80}\b(founder authority|escalation criteria|governance[- ]tier|diamond|lotus|vault posture)\b/i;

export function inferFounderActionType(text: string): FounderActionType {
  if (RENTAL_RE.test(text)) return 'service_rental';
  if (MOBILITY_RE.test(text)) return 'mobility_coordination';
  if (SPATIAL_RE.test(text)) return 'spatial';
  return 'code';
}

export interface FounderReversibility {
  actionType: FounderActionType;
  authorityRoute: FounderAuthorityRoute;
  josephReviewClass?: JosephReviewClass;
  /** Legacy projection: true only for the autonomous route. */
  reversible: boolean;
  reason: string;
}

export function deriveFounderReversibility(
  text: string,
  context: FounderAuthorityContext = {}
): FounderReversibility {
  const actionType = inferFounderActionType(text);

  if (PROHIBITED_OPERATION_RE.test(text)) {
    return {
      actionType,
      authorityRoute: 'prohibited-replan',
      reversible: false,
      reason: 'force-push and hard-reset are prohibited; replan instead of seeking approval',
    };
  }

  const josephReviewClass = deriveJosephReviewClass(text, context);
  if (josephReviewClass) {
    return {
      actionType,
      authorityRoute: 'joseph-exact-four',
      josephReviewClass,
      reversible: false,
      reason: `exact-four Joseph review required: ${josephReviewClass}`,
    };
  }

  if (SPECIALIST_RE.test(text)) {
    return {
      actionType,
      authorityRoute: 'specialist-review',
      reversible: false,
      reason: 'specialist review required; this is not Joseph approval',
    };
  }

  if (PLATFORM_CONTROL_RE.test(text)) {
    return {
      actionType,
      authorityRoute: 'platform-control',
      reversible: false,
      reason:
        'missing tool, credential, permission, or platform control must be repaired or routed',
    };
  }

  return {
    actionType,
    authorityRoute: 'autonomous',
    reversible: true,
    reason: 'agent-decidable: decide, execute, verify, and announce',
  };
}

export function deriveJosephReviewClass(
  text: string,
  context: FounderAuthorityContext = {}
): JosephReviewClass | undefined {
  const structuredOverCap =
    isFiniteNumber(context.projectedSpendUsd) &&
    isFiniteNumber(context.activeRailCapUsd) &&
    context.projectedSpendUsd > context.activeRailCapUsd;
  if (
    structuredOverCap ||
    context.exceedsActiveRailCap === true ||
    context.touchesTreasuryOrCustody === true ||
    ACTIVE_RAIL_CAP_RE.test(text) ||
    CUSTODY_AUTHORITY_RE.test(text)
  ) {
    return 'spend-or-custody';
  }
  if (context.requiresJosephBodySignaturePresence === true || JOSEPH_PHYSICAL_RE.test(text)) {
    return 'physical-presence';
  }
  if (context.publicCommitmentUnderJosephNameFaceVoice === true || JOSEPH_PUBLIC_RE.test(text)) {
    return 'public-identity';
  }
  if (context.governanceTierMutation === true || GOVERNANCE_MUTATION_RE.test(text)) {
    return 'governance';
  }
  return undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
