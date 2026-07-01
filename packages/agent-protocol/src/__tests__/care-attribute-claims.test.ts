import { describe, expect, it } from 'vitest';
import {
  AGENT_ATTRIBUTE_CLAIM_NULL_ASSUMPTION,
  normalizeAgentAttributeClaims,
  validateAgentAttributeClaims,
} from '../care-attribute-claims';

describe('agent attribute claim contract', () => {
  it('accepts a falsifiable care claim with behavior and evidence refs', () => {
    const claims = [
      {
        attribute: 'care',
        claim: 'The agent preserved task evidence and cost context for future review.',
        behaviorRefs: ['task:task_1:executed'],
        evidenceRefs: ['audit:task_1'],
        persistence: 'single_event',
        falsifier: 'No audit record or task evidence exists for this execution.',
        costOrPriority: 'spent bounded runtime to preserve durable evidence',
      },
    ];

    expect(validateAgentAttributeClaims(claims)).toEqual({ valid: true, errors: [] });
  });

  it('rejects care language without the extra evidence contract', () => {
    const result = validateAgentAttributeClaims([
      {
        attribute: 'care',
        claim: 'The agent cares.',
        behaviorRefs: [],
        evidenceRefs: ['audit:task_1'],
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('agentAttributeClaims[0].behaviorRefs must include observed behavior');
    expect(result.errors).toContain('agentAttributeClaims[0].persistence is required for human-like attributes');
    expect(result.errors).toContain('agentAttributeClaims[0].falsifier is required for human-like attributes');
    expect(result.errors).toContain('agentAttributeClaims[0].costOrPriority is required for care');
  });

  it('normalizes measurement boundary metadata onto claims', () => {
    const normalized = normalizeAgentAttributeClaims([
      {
        attribute: 'identity',
        claim: 'Agent identity was preserved through the signed seat handle.',
        behaviorRefs: ['identity:seat'],
        evidenceRefs: ['receipt:identity'],
      },
    ]);

    expect(normalized[0].measurementNullAssumption).toBe(AGENT_ATTRIBUTE_CLAIM_NULL_ASSUMPTION);
    expect(normalized[0].interpretationBoundary).toBe('behavioral_contract_not_hidden_state_proof');
  });
});
