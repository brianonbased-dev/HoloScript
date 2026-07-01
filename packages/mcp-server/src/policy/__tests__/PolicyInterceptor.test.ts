/**
 * Tests for PolicyInterceptor — CG-098 tracer bullet.
 *
 * Coverage:
 * - loadPolicyPack parses the real .hsplus fixture with HoloScriptPlusParser
 *   (not a hand-rolled JSON reader) and extracts the `@policy_pack` trait.
 * - evaluatePolicy is a pure decision function: deny/approval_required/audit/
 *   allow, first-matching-rule-wins, default-decision fallback.
 * - buildPolicyReceipt produces a receipt linked to the tool-call id.
 * - interceptToolCall composes load + evaluate + receipt in one call.
 *
 * Discipline: G.GOLD.013 paired FALSE+TRUE for every decision kind.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPolicyPack,
  evaluatePolicy,
  buildPolicyReceipt,
  interceptToolCall,
  __resetPolicyPackCacheForTests,
  type PolicyPack,
} from '../PolicyInterceptor';

describe('loadPolicyPack — real .hsplus fixture parsing', () => {
  beforeEach(() => __resetPolicyPackCacheForTests());

  it('TRUE: parses the fixture via HoloScriptPlusParser with 0 errors and extracts policy_id/rules', () => {
    const pack = loadPolicyPack();
    expect(pack.policy_id).toBe('policy-pack-v1');
    expect(pack.schema_version).toBe('1.0.0');
    expect(pack.default_decision).toBe('allow');
    expect(pack.rules.length).toBeGreaterThanOrEqual(3);
    expect(pack.rules.every((r) => typeof r.rule_id === 'string')).toBe(true);
  });

  it('FALSE: missing fixture path throws (fail loud, not silent allow-all)', () => {
    expect(() => loadPolicyPack('/nonexistent/path/policy-pack.holo.hsplus')).toThrow();
  });

  it('TRUE: caches the parsed pack across calls with the same fixture path', () => {
    const a = loadPolicyPack();
    const b = loadPolicyPack();
    expect(a).toBe(b); // same object reference — cache hit, no re-parse
  });
});

describe('evaluatePolicy — pure decision function', () => {
  const pack: PolicyPack = {
    policy_id: 'test-pack',
    schema_version: '1.0.0',
    default_decision: 'allow',
    rules: [
      {
        rule_id: 'r-deny',
        tool: 'holo_secrets_grant',
        when_agent_in: ['blocked-agent-x'],
        decision: 'deny',
        reason: 'agent_denylisted',
      },
      {
        rule_id: 'r-approval',
        tool: 'holo_secrets_grant',
        when_capability_ref_prefix: 'cap://finance/',
        decision: 'approval_required',
        reason: 'financial_capability_requires_approval',
      },
      {
        rule_id: 'r-audit',
        tool: 'holo_secrets_grant',
        when_capability_ref_prefix: 'cap://daemon/secrets/broker-only',
        decision: 'audit',
        reason: 'broker_only_capability_audited',
      },
    ],
  };

  it('FALSE→blocked: denylisted agent → deny', () => {
    const d = evaluatePolicy(pack, {
      callerId: 'blocked-agent-x',
      tool: 'holo_secrets_grant',
      resource: 'secret://x',
      toolCallId: 'call-1',
    });
    expect(d.decision).toBe('deny');
    expect(d.ruleId).toBe('r-deny');
    expect(d.reason).toBe('agent_denylisted');
  });

  it('TRUE→blocked-but-not-denied: financial capability prefix → approval_required', () => {
    const d = evaluatePolicy(pack, {
      callerId: 'agent1',
      tool: 'holo_secrets_grant',
      resource: 'secret://x',
      args: { capabilityRef: 'cap://finance/payout' },
      toolCallId: 'call-2',
    });
    expect(d.decision).toBe('approval_required');
    expect(d.ruleId).toBe('r-approval');
  });

  it('TRUE→proceeds: broker-only capability prefix → audit (does not block)', () => {
    const d = evaluatePolicy(pack, {
      callerId: 'agent1',
      tool: 'holo_secrets_grant',
      resource: 'secret://x',
      args: { capabilityRef: 'cap://daemon/secrets/broker-only' },
      toolCallId: 'call-3',
    });
    expect(d.decision).toBe('audit');
    expect(d.ruleId).toBe('r-audit');
  });

  it('TRUE→proceeds: no rule matches → falls back to default_decision (allow)', () => {
    const d = evaluatePolicy(pack, {
      callerId: 'agent1',
      tool: 'holo_secrets_grant',
      resource: 'secret://x',
      args: { capabilityRef: 'cap://unrelated/thing' },
      toolCallId: 'call-4',
    });
    expect(d.decision).toBe('allow');
    expect(d.ruleId).toBeNull();
    expect(d.reason).toBe('no_rule_matched_default_decision');
  });

  it('TRUE→proceeds: tool with zero rules always falls to default_decision', () => {
    const d = evaluatePolicy(pack, {
      callerId: 'agent1',
      tool: 'holo_secrets_resolve',
      resource: 'lease://x',
      toolCallId: 'call-5',
    });
    expect(d.decision).toBe('allow');
  });

  it('FALSE: denylisted agent wins over an audit-only capability match (deny listed first)', () => {
    const d = evaluatePolicy(pack, {
      callerId: 'blocked-agent-x',
      tool: 'holo_secrets_grant',
      resource: 'secret://x',
      args: { capabilityRef: 'cap://daemon/secrets/broker-only' },
      toolCallId: 'call-6',
    });
    expect(d.decision).toBe('deny');
  });
});

describe('buildPolicyReceipt — compact receipt linked to tool-call id', () => {
  it('TRUE: receipt carries policyId, decision, caller, action, resource, reason, toolCallId', () => {
    const receipt = buildPolicyReceipt(
      { callerId: 'agent1', tool: 'holo_secrets_grant', resource: 'secret://x', toolCallId: 'call-abc' },
      { decision: 'deny', policyId: 'test-pack', ruleId: 'r-deny', reason: 'agent_denylisted' }
    );
    expect(receipt.policyId).toBe('test-pack');
    expect(receipt.decision).toBe('deny');
    expect(receipt.caller).toBe('agent1');
    expect(receipt.action).toBe('holo_secrets_grant');
    expect(receipt.resource).toBe('secret://x');
    expect(receipt.reason).toBe('agent_denylisted');
    expect(receipt.toolCallId).toBe('call-abc');
    expect(receipt.receiptId).toMatch(/^policy_/);
  });

  it('FALSE: two receipts for different decisions on the same call get different receiptIds', () => {
    const req = { callerId: 'agent1', tool: 'holo_secrets_grant', resource: 'secret://x', toolCallId: 'call-xyz' };
    const r1 = buildPolicyReceipt(req, { decision: 'allow', policyId: 'p', ruleId: null, reason: 'a' });
    const r2 = buildPolicyReceipt(req, { decision: 'deny', policyId: 'p', ruleId: null, reason: 'b' });
    expect(r1.receiptId).not.toBe(r2.receiptId);
  });
});

describe('interceptToolCall — full composition (load + evaluate + receipt)', () => {
  beforeEach(() => __resetPolicyPackCacheForTests());

  it('TRUE: denylisted agent against the real fixture → deny + linked receipt', () => {
    const { decision, receipt } = interceptToolCall({
      callerId: 'blocked-agent-x',
      tool: 'holo_secrets_grant',
      resource: 'secret://ns/test',
      toolCallId: 'real-call-1',
    });
    expect(decision.decision).toBe('deny');
    expect(receipt.toolCallId).toBe('real-call-1');
    expect(receipt.decision).toBe('deny');
  });

  it('FALSE: an unrelated tool never gated by this fixture → allow', () => {
    const { decision } = interceptToolCall({
      callerId: 'agent1',
      tool: 'some_other_tool',
      resource: 'n/a',
      toolCallId: 'real-call-2',
    });
    expect(decision.decision).toBe('allow');
  });
});
