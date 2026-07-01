/**
 * PolicyInterceptor × handleSecretsBrokerTool integration — CG-098 tracer bullet.
 *
 * Proves the interceptor gates the REAL dispatch seam
 * (secrets-broker-handler.ts → handleSecretsBrokerTool → TOOL_DISPATCH_REGISTRY
 * → executeSingleTool in index.ts), not just the pure PolicyInterceptor unit.
 *
 * Acceptance criteria from the board task (task_1782916958215_b9ef):
 * - one allowed call succeeds
 * - one denied call is blocked before tool execution
 * - one audit-only call executes and records policy_id/decision/caller/action/resource/reason
 * - targeted tests prove the output behavior would fail if the interceptor were bypassed
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSecretsBrokerTool } from '../secrets-broker-handler';
import * as PolicyInterceptorModule from '../policy/PolicyInterceptor';
import { __resetPolicyPackCacheForTests } from '../policy/PolicyInterceptor';

const baseArgs = {
  namespaceId: 'ns_test',
  secretRef: 'secret://namespace/ns_test/holoscript/orchestrator/api-key',
  purpose: 'policy-interceptor-integration-test',
};

describe('PolicyInterceptor gate on holo_secrets_grant (real handler seam)', () => {
  beforeEach(() => __resetPolicyPackCacheForTests());

  it('DENY: denylisted agent is blocked before tool execution — no grant is created', async () => {
    const result = (await handleSecretsBrokerTool('holo_secrets_grant', {
      ...baseArgs,
      agentId: 'blocked-agent-x',
      capabilityRef: 'cap://daemon/secrets/broker-only',
    })) as { authError?: boolean; reason?: string; policyReceipt?: { decision?: string }; grant?: unknown };

    expect(result.authError).toBe(true);
    expect(result.reason).toBe('agent_denylisted');
    expect(result.grant).toBeUndefined(); // tool body never ran
    expect(result.policyReceipt?.decision).toBe('deny');
  });

  it('AUDIT: broker-only capability executes and the response carries a policy receipt with all required fields', async () => {
    const result = (await handleSecretsBrokerTool('holo_secrets_grant', {
      ...baseArgs,
      agentId: 'agent1',
      capabilityRef: 'cap://daemon/secrets/broker-only',
    })) as {
      status?: string;
      grant?: { grantId?: string };
      policyReceipt?: {
        policyId?: string;
        decision?: string;
        caller?: string;
        action?: string;
        resource?: string;
        reason?: string;
      };
    };

    expect(result.status).toBe('granted'); // audit does not block
    expect(result.grant?.grantId).toBeDefined();
    expect(result.policyReceipt).toBeDefined();
    expect(result.policyReceipt?.policyId).toBe('policy-pack-v1');
    expect(result.policyReceipt?.decision).toBe('audit');
    expect(result.policyReceipt?.caller).toBe('agent1');
    expect(result.policyReceipt?.action).toBe('holo_secrets_grant');
    expect(result.policyReceipt?.resource).toBe(baseArgs.secretRef);
    expect(result.policyReceipt?.reason).toBe('broker_only_capability_audited');
  });

  it('ALLOW: an unmatched capability ref falls through to the default decision and executes', async () => {
    const result = (await handleSecretsBrokerTool('holo_secrets_grant', {
      ...baseArgs,
      agentId: 'agent1',
      // Valid daemon-secret capability (passes grant.ts's assertCapability),
      // but NOT one of the prefixes any PolicyPack rule matches on — exercises
      // the default_decision fallback rather than a fixture rule.
      capabilityRef: 'cap://daemon/secrets/unmatched-by-any-rule',
    })) as { status?: string; policyReceipt?: { decision?: string } };

    expect(result.status).toBe('granted');
    expect(result.policyReceipt?.decision).toBe('allow');
  });

  it('APPROVAL_REQUIRED: financial capability prefix is blocked (no async approval path exists yet — fails closed)', async () => {
    const result = (await handleSecretsBrokerTool('holo_secrets_grant', {
      ...baseArgs,
      agentId: 'agent1',
      capabilityRef: 'cap://finance/payout',
    })) as { authError?: boolean; reason?: string; grant?: unknown };

    expect(result.authError).toBe(true);
    expect(result.reason).toBe('financial_capability_requires_approval');
    expect(result.grant).toBeUndefined();
  });

  it('BYPASS PROOF: stubbing interceptToolCall to force "allow" changes the deny case into a granted call', async () => {
    // This proves the deny behavior in the first test is genuinely produced by
    // the interceptor being called — not by some other unrelated gate. If the
    // interceptor were bypassed/removed, this stub demonstrates the exact
    // observable difference: the same denylisted-agent input that was BLOCKED
    // above now SUCCEEDS once the interceptor is forced to always allow.
    const spy = vi.spyOn(PolicyInterceptorModule, 'interceptToolCall').mockReturnValue({
      decision: { decision: 'allow', policyId: 'stub', ruleId: null, reason: 'stubbed_bypass' },
      receipt: {
        receiptId: 'policy_stub',
        schemaVersion: '1.0.0',
        recordedAt: new Date().toISOString(),
        policyId: 'stub',
        decision: 'allow',
        caller: 'blocked-agent-x',
        action: 'holo_secrets_grant',
        resource: baseArgs.secretRef,
        reason: 'stubbed_bypass',
        toolCallId: 'stub-call',
      },
    });

    try {
      const result = (await handleSecretsBrokerTool('holo_secrets_grant', {
        ...baseArgs,
        agentId: 'blocked-agent-x',
        capabilityRef: 'cap://daemon/secrets/broker-only',
      })) as { authError?: boolean; status?: string; grant?: { grantId?: string } };

      // With the interceptor bypassed, the SAME denylisted-agent call that was
      // blocked in the DENY test above now succeeds — proving the block was
      // genuinely enforced by the interceptor, not by some other code path.
      expect(result.authError).toBeUndefined();
      expect(result.status).toBe('granted');
      expect(result.grant?.grantId).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('FAIL-SAFE: a broken fixture path denies rather than silently allowing', async () => {
    const spy = vi.spyOn(PolicyInterceptorModule, 'interceptToolCall').mockImplementation(() => {
      throw new Error('simulated fixture parse failure');
    });

    try {
      // Re-implement the handler's own fail-safe wrapper behavior via the
      // exported gate function directly, since interceptToolCall itself is
      // stubbed to throw here (simulating a corrupted fixture at runtime).
      const { gatePolicyInterceptedTool } = await import('../secrets-broker-handler');
      const { authError } = gatePolicyInterceptedTool('holo_secrets_grant', baseArgs, 'agent1');
      expect(authError).not.toBeNull();
      expect(authError?.reason).toContain('policy_interceptor_failed');
      expect(authError?.policyReceipt.decision).toBe('deny');
    } finally {
      spy.mockRestore();
    }
  });
});
