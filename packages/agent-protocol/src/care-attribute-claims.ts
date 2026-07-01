/**
 * Portable agent attribute claim contract.
 *
 * Human-like language is allowed only as a behavior-and-receipt contract. This
 * schema does not prove hidden state; it records the evidence required to make a
 * bounded claim falsifiable across laptop, Jetson, and cloud agents.
 */

export const AGENT_ATTRIBUTE_CLAIM_SCHEMA_VERSION = 'holoscript.agent-attribute-claims.v1' as const;
export const AGENT_ATTRIBUTE_CLAIM_NULL_ASSUMPTION = 'llm_non_uniqueness' as const;
export const AGENT_ATTRIBUTE_CLAIM_INTERPRETATION_BOUNDARY =
  'behavioral_contract_not_hidden_state_proof' as const;

export const AGENT_ATTRIBUTE_CLAIM_ATTRIBUTES = [
  'agency',
  'belief',
  'care',
  'identity',
  'intention',
  'preference',
  'understanding',
] as const;

export const HUMAN_LIKE_AGENT_ATTRIBUTE_CLAIMS = [
  'agency',
  'belief',
  'care',
  'intention',
  'preference',
  'understanding',
] as const;

export type AgentAttributeClaimAttribute = (typeof AGENT_ATTRIBUTE_CLAIM_ATTRIBUTES)[number];
export type HumanLikeAgentAttributeClaim = (typeof HUMAN_LIKE_AGENT_ATTRIBUTE_CLAIMS)[number];
export type AgentAttributeClaimPersistence = 'single_event' | 'session' | 'cross_session' | 'durable';

export interface AgentAttributeClaim {
  attribute: AgentAttributeClaimAttribute;
  claim: string;
  behaviorRefs: string[];
  evidenceRefs: string[];
  persistence?: AgentAttributeClaimPersistence;
  falsifier?: string;
  goalRef?: string;
  actionRef?: string;
  costOrPriority?: string;
  measurementNullAssumption?: typeof AGENT_ATTRIBUTE_CLAIM_NULL_ASSUMPTION;
  interpretationBoundary?: typeof AGENT_ATTRIBUTE_CLAIM_INTERPRETATION_BOUNDARY;
}

export interface AgentAttributeClaimValidation {
  valid: boolean;
  errors: string[];
}

const ATTRIBUTE_SET = new Set<string>(AGENT_ATTRIBUTE_CLAIM_ATTRIBUTES);
const HUMAN_LIKE_ATTRIBUTE_SET = new Set<string>(HUMAN_LIKE_AGENT_ATTRIBUTE_CLAIMS);
const PERSISTENCE_SET = new Set<string>(['single_event', 'session', 'cross_session', 'durable']);

export function validateAgentAttributeClaims(claims: unknown): AgentAttributeClaimValidation {
  const errors: string[] = [];
  if (claims === undefined || claims === null) return { valid: true, errors };
  if (!Array.isArray(claims)) {
    return { valid: false, errors: ['agentAttributeClaims must be an array'] };
  }

  claims.forEach((claim, index) => {
    const prefix = `agentAttributeClaims[${index}]`;
    if (!isRecord(claim)) {
      errors.push(`${prefix} must be an object`);
      return;
    }

    const attribute = String(claim.attribute || '').trim().toLowerCase();
    if (!ATTRIBUTE_SET.has(attribute)) {
      errors.push(`${prefix}.attribute must be canonical`);
    }
    if (!hasText(claim.claim)) errors.push(`${prefix}.claim is required`);
    if (!hasNonEmptyStringArray(claim.behaviorRefs)) {
      errors.push(`${prefix}.behaviorRefs must include observed behavior`);
    }
    if (!hasNonEmptyStringArray(claim.evidenceRefs)) {
      errors.push(`${prefix}.evidenceRefs must include receipt or verifier evidence`);
    }

    if (HUMAN_LIKE_ATTRIBUTE_SET.has(attribute)) {
      if (!hasText(claim.persistence)) {
        errors.push(`${prefix}.persistence is required for human-like attributes`);
      } else if (!PERSISTENCE_SET.has(claim.persistence)) {
        errors.push(`${prefix}.persistence must be single_event, session, cross_session, or durable`);
      }
      if (!hasText(claim.falsifier)) {
        errors.push(`${prefix}.falsifier is required for human-like attributes`);
      }
    }

    if (attribute === 'intention') {
      if (!hasText(claim.goalRef)) errors.push(`${prefix}.goalRef is required for intention`);
      if (!hasText(claim.actionRef)) errors.push(`${prefix}.actionRef is required for intention`);
    }

    if (attribute === 'care' && !hasText(claim.costOrPriority)) {
      errors.push(`${prefix}.costOrPriority is required for care`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function normalizeAgentAttributeClaims(claims: AgentAttributeClaim[]): AgentAttributeClaim[] {
  return claims.map((claim) => ({
    attribute: claim.attribute,
    claim: claim.claim.trim(),
    behaviorRefs: cleanStringList(claim.behaviorRefs),
    evidenceRefs: cleanStringList(claim.evidenceRefs),
    persistence: claim.persistence,
    falsifier: claim.falsifier?.trim(),
    goalRef: claim.goalRef?.trim(),
    actionRef: claim.actionRef?.trim(),
    costOrPriority: claim.costOrPriority?.trim(),
    measurementNullAssumption: AGENT_ATTRIBUTE_CLAIM_NULL_ASSUMPTION,
    interpretationBoundary: AGENT_ATTRIBUTE_CLAIM_INTERPRETATION_BOUNDARY,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((item) => hasText(item));
}

function cleanStringList(value: string[]): string[] {
  return value.map((item) => item.trim()).filter(Boolean);
}
