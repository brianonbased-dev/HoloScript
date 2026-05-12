/**
 * Secret grant issuance — handles-only, deterministic, audit-heavy.
 *
 * Extracted from `@holoscript/studio/src/lib/workspace/secretBroker.ts`
 * and generalized into a sovereign primitive so any package or service
 * can issue brokered grants without depending on Studio internals.
 *
 * @module secrets-broker/grant
 */

import { createHash } from 'crypto';
import {
  type SecretGrantInput,
  type SecretGrantReceipt,
  type SecretBrokerPolicy,
  type PolicyDecision,
  type PolicyGatedGrant,
  SecretGrantPolicyError,
} from './types';

export { SecretGrantPolicyError };

const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 60 * 60;

function normalizeRequired(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (/[\r\n]/.test(normalized)) throw new Error(`${field} must be single-line`);
  return normalized;
}

function ttlSeconds(value: number | undefined): number {
  if (value === undefined) return 15 * 60;
  if (!Number.isFinite(value)) return 15 * 60;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(value)));
}

function assertNamespaceSecret(namespaceId: string, secretRef: string): void {
  const prefix = `secret://namespace/${namespaceId}/`;
  if (!secretRef.startsWith(prefix)) {
    throw new Error('secretRef must be a secret:// handle scoped to the namespace');
  }
}

function assertCapability(capabilityRef: string): void {
  if (!capabilityRef.startsWith('cap://daemon/secrets/')) {
    throw new Error('capabilityRef must be a daemon secret capability');
  }
}

function hashReceipt(value: Omit<SecretGrantReceipt, 'receiptHash'>): string {
  const canonical = JSON.stringify(value);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function hashPolicyDecision(value: Omit<PolicyDecision, 'receiptHash'>): string {
  const canonical = JSON.stringify(value);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function list(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): boolean => typeof item === 'string' && item.length > 0) : [];
}

function hasPrefix(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function includes(value: string, entries: string[]): boolean {
  return entries.includes(value);
}

function policyMaxTtl(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return MAX_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(value)));
}

/**
 * Check a grant request against a policy gate without issuing the grant.
 * Returns a `PolicyDecision` that can be stored, audited, and later passed
 * to `createSecretGrant` via `policyDecisionId` / `policyOutcome`.
 */
export function checkSecretGrantPolicy(
  input: SecretGrantInput,
  policy: SecretBrokerPolicy = {}
): PolicyDecision {
  const namespaceId = normalizeRequired(input.namespaceId, 'namespaceId');
  const agentId = normalizeRequired(input.agentId, 'agentId');
  const secretRef = normalizeRequired(input.secretRef, 'secretRef');
  const capabilityRef = normalizeRequired(input.capabilityRef, 'capabilityRef');
  normalizeRequired(input.purpose, 'purpose');

  const secretPolicy = policy.secretGrants ?? {};
  const onViolation = policy.enforcement?.onViolation === 'block' ? 'block' : 'warn';
  const reasons: string[] = [];
  let outcome: 'allow' | 'warn' | 'block' = 'allow';

  const requestedTtlSeconds = ttlSeconds(input.ttlSeconds);
  const maxTtlSeconds = policyMaxTtl(secretPolicy.maxTtlSeconds);
  const effectiveTtlSeconds = Math.min(requestedTtlSeconds, maxTtlSeconds);

  const allowedSecretRefPrefixes = list(secretPolicy.allowedSecretRefPrefixes);
  const blockedSecretRefPrefixes = list(secretPolicy.blockedSecretRefPrefixes);
  const allowedCapabilityRefs = list(secretPolicy.allowedCapabilityRefs);
  const blockedCapabilityRefs = list(secretPolicy.blockedCapabilityRefs);
  const allowedAgentIds = list(secretPolicy.allowedAgentIds);
  const blockedAgentIds = list(secretPolicy.blockedAgentIds);

  function registerViolation(reason: string, hardBlock = false): void {
    reasons.push(reason);
    if (hardBlock || onViolation === 'block') {
      outcome = 'block';
    } else if (outcome === 'allow') {
      outcome = 'warn';
    }
  }

  if (includes(agentId, blockedAgentIds)) registerViolation('agent_blocked', true);
  if (blockedSecretRefPrefixes.length > 0 && hasPrefix(secretRef, blockedSecretRefPrefixes)) {
    registerViolation('secret_ref_blocked', true);
  }
  if (includes(capabilityRef, blockedCapabilityRefs)) registerViolation('capability_blocked', true);

  const defaultSecretPrefix = `secret://namespace/${namespaceId}/`;
  const effectiveAllowedPrefixes =
    allowedSecretRefPrefixes.length > 0 ? allowedSecretRefPrefixes : [defaultSecretPrefix];
  if (!hasPrefix(secretRef, effectiveAllowedPrefixes)) registerViolation('secret_ref_not_allowed');
  if (allowedCapabilityRefs.length > 0 && !includes(capabilityRef, allowedCapabilityRefs)) {
    registerViolation('capability_not_allowed');
  }
  if (allowedAgentIds.length > 0 && !includes(agentId, allowedAgentIds)) {
    registerViolation('agent_not_allowed');
  }
  if (requestedTtlSeconds > effectiveTtlSeconds) {
    reasons.push('ttl_clamped_to_policy');
    if (outcome === 'allow') outcome = 'warn';
  }

  const checkedAtDate = input.now ?? new Date();
  const checkedAt = checkedAtDate.toISOString();
  const decisionSeed = [
    namespaceId,
    agentId,
    secretRef,
    capabilityRef,
    requestedTtlSeconds,
    effectiveTtlSeconds,
    checkedAt,
    outcome,
  ].join('|');

  const unsigned: Omit<PolicyDecision, 'receiptHash'> = {
    version: 1,
    event: 'holodoor.policy.checked',
    decisionId: `hdoor_${createHash('sha256').update(decisionSeed).digest('hex').slice(0, 24)}`,
    outcome,
    reasons,
    namespaceId,
    agentId,
    secretRef,
    capabilityRef,
    requestedTtlSeconds,
    effectiveTtlSeconds,
    checkedAt,
    plaintextReturned: false,
    auditTags: ['holodoor', 'policy-checked', 'secret-grant'],
  };

  return {
    ...unsigned,
    receiptHash: hashPolicyDecision(unsigned),
  };
}

/**
 * Issue a brokered secret grant receipt. NEVER returns the plaintext value.
 * The receipt is deterministic and self-hashing — any party can verify it
 * was issued by a broker that checked the namespace scope and capability.
 */
export function createSecretGrant(input: SecretGrantInput): SecretGrantReceipt {
  const namespaceId = normalizeRequired(input.namespaceId, 'namespaceId');
  const agentId = normalizeRequired(input.agentId, 'agentId');
  const secretRef = normalizeRequired(input.secretRef, 'secretRef');
  const capabilityRef = normalizeRequired(input.capabilityRef, 'capabilityRef');
  const purpose = normalizeRequired(input.purpose, 'purpose');
  assertNamespaceSecret(namespaceId, secretRef);
  assertCapability(capabilityRef);

  const issuedAtDate = input.now ?? new Date();
  const expiresAtDate = new Date(issuedAtDate.getTime() + ttlSeconds(input.ttlSeconds) * 1000);
  const issuedAt = issuedAtDate.toISOString();
  const expiresAt = expiresAtDate.toISOString();
  const grantSeed = [namespaceId, agentId, secretRef, capabilityRef, purpose, issuedAt].join('|');
  const grantId = `sgrant_${createHash('sha256').update(grantSeed).digest('hex').slice(0, 24)}`;

  const unsigned: Omit<SecretGrantReceipt, 'receiptHash'> = {
    version: 1,
    event: 'secret.granted',
    grantId,
    namespaceId,
    agentId,
    agent: agentId,
    secretRef,
    ref: secretRef,
    capabilityRef,
    purpose,
    issuedAt,
    expiresAt,
    accessMode: 'brokered-handle',
    plaintextReturned: false,
    policyDecisionId: input.policyDecisionId ?? null,
    policyOutcome:
      input.policyOutcome === 'allow' || input.policyOutcome === 'warn' ? input.policyOutcome : null,
    auditTags: [
      'agent-secret-grant',
      'handles-only',
      'no-plaintext',
      ...(input.policyDecisionId ? ['holodoor-policy-checked'] : []),
    ],
  };

  return {
    ...unsigned,
    receiptHash: hashReceipt(unsigned),
  };
}

/**
 * Policy-gated convenience wrapper: check policy, then issue grant.
 * Throws `SecretGrantPolicyError` when the policy outcome is `block`.
 */
export function createPolicyGatedSecretGrant(
  input: SecretGrantInput,
  policy: SecretBrokerPolicy = {}
): PolicyGatedGrant {
  const policyDecision = checkSecretGrantPolicy(input, policy);
  if (policyDecision.outcome === 'block') {
    throw new SecretGrantPolicyError(policyDecision);
  }

  const grant = createSecretGrant({
    ...input,
    ttlSeconds: policyDecision.effectiveTtlSeconds,
    now: new Date(policyDecision.checkedAt),
    policyDecisionId: policyDecision.decisionId,
    policyOutcome: policyDecision.outcome,
  });

  return { policyDecision, grant };
}
