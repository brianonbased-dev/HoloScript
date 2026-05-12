import { describe, expect, it } from 'vitest';
import { allowOnly, denyAll, allowAgentForRef, fromHoloDoorPolicy } from '../policy';

describe('policy builders', () => {
  it('allowOnly creates a prefix-locked block policy', () => {
    const p = allowOnly(['secret://namespace/ns_foo/']);
    expect(p.secretGrants?.allowedSecretRefPrefixes).toEqual(['secret://namespace/ns_foo/']);
    expect(p.enforcement?.onViolation).toBe('block');
  });

  it('denyAll creates a policy that blocks every agent', () => {
    const p = denyAll();
    expect(p.secretGrants?.allowedSecretRefPrefixes).toEqual([]);
    expect(p.secretGrants?.blockedAgentIds).toContain('*');
  });

  it('allowAgentForRef creates a single-agent single-ref policy', () => {
    const p = allowAgentForRef('agent_1', 'secret://namespace/ns_bar/key');
    expect(p.secretGrants?.allowedAgentIds).toEqual(['agent_1']);
    expect(p.secretGrants?.allowedSecretRefPrefixes).toEqual(['secret://namespace/ns_bar/key']);
  });

  it('fromHoloDoorPolicy passes through shape without mutation', () => {
    const shape = {
      secretGrants: { maxTtlSeconds: 300, requirePurpose: true },
      enforcement: { onViolation: 'warn' as const },
    };
    const p = fromHoloDoorPolicy(shape);
    expect(p.secretGrants?.maxTtlSeconds).toBe(300);
    expect(p.enforcement?.onViolation).toBe('warn');
  });
});
