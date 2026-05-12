import { describe, expect, it } from 'vitest';
import {
  SecretGrantPolicyError,
  checkSecretGrantPolicy,
  createPolicyGatedSecretGrant,
  createSecretGrant,
} from '../grant';

describe('createSecretGrant', () => {
  it('issues a deterministic brokered handle receipt without plaintext', () => {
    const grant = createSecretGrant({
      namespaceId: 'ns_octocat',
      agentId: 'agent_secret_custodian',
      secretRef: 'secret://namespace/ns_octocat/holoscript/orchestrator/api-key',
      capabilityRef: 'cap://daemon/secrets/broker-only',
      purpose: 'Run HoloScript MCP tool through broker',
      ttlSeconds: 300,
      now: new Date('2026-05-10T10:00:00.000Z'),
    });

    expect(grant).toMatchObject({
      event: 'secret.granted',
      namespaceId: 'ns_octocat',
      agentId: 'agent_secret_custodian',
      agent: 'agent_secret_custodian',
      ref: 'secret://namespace/ns_octocat/holoscript/orchestrator/api-key',
      accessMode: 'brokered-handle',
      plaintextReturned: false,
      policyDecisionId: null,
      policyOutcome: null,
      issuedAt: '2026-05-10T10:00:00.000Z',
      expiresAt: '2026-05-10T10:05:00.000Z',
    });
    expect(grant.grantId).toMatch(/^sgrant_[a-f0-9]{24}$/);
    expect(grant.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(grant)).not.toContain('sk-');
    expect(JSON.stringify(grant)).not.toContain('gho_');
  });

  it('rejects secret refs outside the namespace', () => {
    expect(() =>
      createSecretGrant({
        namespaceId: 'ns_octocat',
        agentId: 'agent_builder',
        secretRef: 'secret://namespace/ns_other/github/oauth/access-token',
        capabilityRef: 'cap://daemon/secrets/broker-only',
        purpose: 'Use GitHub API',
      })
    ).toThrow(/scoped to the namespace/);
  });

  it('rejects non-secret daemon capabilities', () => {
    expect(() =>
      createSecretGrant({
        namespaceId: 'ns_octocat',
        agentId: 'agent_builder',
        secretRef: 'secret://namespace/ns_octocat/github/oauth/access-token',
        capabilityRef: 'cap://daemon/code/write-scoped',
        purpose: 'Use GitHub API',
      })
    ).toThrow(/daemon secret capability/);
  });

  it('checks policy before issuing a brokered secret grant', () => {
    const result = createPolicyGatedSecretGrant(
      {
        namespaceId: 'ns_octocat',
        agentId: 'agent_secret_custodian',
        secretRef: 'secret://namespace/ns_octocat/github/oauth/access-token',
        capabilityRef: 'cap://daemon/secrets/broker-only',
        purpose: 'Use GitHub API through broker',
        ttlSeconds: 300,
        now: new Date('2026-05-10T10:00:00.000Z'),
      },
      {
        secretGrants: {
          allowedSecretRefPrefixes: ['secret://namespace/ns_octocat/'],
          allowedCapabilityRefs: ['cap://daemon/secrets/broker-only'],
          maxTtlSeconds: 900,
          requirePurpose: true,
        },
        enforcement: { onViolation: 'block' },
      }
    );

    expect(result.policyDecision).toMatchObject({
      event: 'holodoor.policy.checked',
      outcome: 'allow',
      reasons: [],
      plaintextReturned: false,
      checkedAt: '2026-05-10T10:00:00.000Z',
    });
    expect(result.policyDecision.decisionId).toMatch(/^hdoor_[a-f0-9]{24}$/);
    expect(result.policyDecision.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.grant).toMatchObject({
      event: 'secret.granted',
      policyDecisionId: result.policyDecision.decisionId,
      policyOutcome: 'allow',
      issuedAt: result.policyDecision.checkedAt,
      expiresAt: '2026-05-10T10:05:00.000Z',
    });
    expect(result.grant.auditTags).toContain('holodoor-policy-checked');
  });

  it('blocks a secret grant when policy denies the handle', () => {
    expect.assertions(4);
    try {
      createPolicyGatedSecretGrant(
        {
          namespaceId: 'ns_octocat',
          agentId: 'agent_builder',
          secretRef: 'secret://namespace/ns_octocat/github/oauth/access-token',
          capabilityRef: 'cap://daemon/secrets/broker-only',
          purpose: 'Use GitHub API through broker',
          ttlSeconds: 300,
          now: new Date('2026-05-10T10:00:00.000Z'),
        },
        {
          secretGrants: {
            allowedSecretRefPrefixes: ['secret://namespace/ns_octocat/holoscript/'],
            allowedCapabilityRefs: ['cap://daemon/secrets/broker-only'],
          },
          enforcement: { onViolation: 'block' },
        }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(SecretGrantPolicyError);
      const decision = (err as SecretGrantPolicyError).decision;
      expect(decision.outcome).toBe('block');
      expect(decision.reasons).toContain('secret_ref_not_allowed');
      expect(decision.event).toBe('holodoor.policy.checked');
    }
  });

  it('warns and clamps TTL when policy allows a shorter grant', () => {
    const decision = checkSecretGrantPolicy(
      {
        namespaceId: 'ns_octocat',
        agentId: 'agent_builder',
        secretRef: 'secret://namespace/ns_octocat/github/oauth/access-token',
        capabilityRef: 'cap://daemon/secrets/broker-only',
        purpose: 'Use GitHub API through broker',
        ttlSeconds: 3600,
        now: new Date('2026-05-10T10:00:00.000Z'),
      },
      { secretGrants: { maxTtlSeconds: 120 } }
    );

    expect(decision.outcome).toBe('warn');
    expect(decision.reasons).toContain('ttl_clamped_to_policy');
    expect(decision.effectiveTtlSeconds).toBe(120);
  });
});
