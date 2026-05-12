/**
 * Policy gate helpers for the secrets broker.
 *
 * The canonical policy check lives in `grant.ts` (`checkSecretGrantPolicy`).
 * This module exports convenience builders for common policy shapes.
 *
 * @module secrets-broker/policy
 */

import { type SecretBrokerPolicy, type SecretGrantPolicyConfig } from './types';

/** Build a policy that only allows a specific set of secret refs. */
export function allowOnly(refs: string[]): SecretBrokerPolicy {
  return {
    secretGrants: {
      allowedSecretRefPrefixes: refs,
      allowedCapabilityRefs: ['cap://daemon/secrets/broker-only'],
      requirePurpose: true,
    },
    enforcement: { onViolation: 'block' },
  };
}

/** Build a policy that blocks everything (deny-by-default). */
export function denyAll(): SecretBrokerPolicy {
  return {
    secretGrants: {
      allowedSecretRefPrefixes: [],
      allowedCapabilityRefs: [],
      blockedAgentIds: ['*'],
    },
    enforcement: { onViolation: 'block' },
  };
}

/** Build a policy that allows a single agent and a single secret ref. */
export function allowAgentForRef(agentId: string, ref: string): SecretBrokerPolicy {
  return {
    secretGrants: {
      allowedAgentIds: [agentId],
      allowedSecretRefPrefixes: [ref],
      allowedCapabilityRefs: ['cap://daemon/secrets/broker-only'],
      requirePurpose: true,
    },
    enforcement: { onViolation: 'block' },
  };
}

/** Build a policy from a workspace-like HoloDoor policy JSON shape. */
export function fromHoloDoorPolicy(shape: {
  secretGrants?: SecretGrantPolicyConfig;
  enforcement?: { onViolation?: 'warn' | 'block' };
}): SecretBrokerPolicy {
  return {
    secretGrants: shape.secretGrants,
    enforcement: shape.enforcement,
  };
}
