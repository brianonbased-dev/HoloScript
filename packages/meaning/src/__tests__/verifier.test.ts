import { describe, expect, it } from 'vitest';
import {
  gradeByResolver,
  hasResolver,
  UAAL_RESOLVED_FAMILIES,
  type UAALResolvedFamily,
} from '../verifier';
import { resolveBeneficiary, type UAALBeneficiaryIR } from '../beneficiary';
import type { UAALAffordanceIR } from '../semantic';

// The verifier of record: gradeByResolver must return EXACTLY what the shipped resolve* returns —
// the whole point is that the corpus/reward labeler IS the inference-time checker, byte for byte.

describe('gradeByResolver — the label IS the shipped resolver', () => {
  it('registers the gap-aware families', () => {
    expect(UAAL_RESOLVED_FAMILIES).toEqual(
      expect.arrayContaining([
        'occlusion',
        'norm_status',
        'dischargeable',
        'affordance',
        'beneficiary',
      ])
    );
    expect(hasResolver('beneficiary')).toBe(true);
    expect(hasResolver('nonexistent')).toBe(false);
  });

  it('beneficiary label == resolveBeneficiary output (no verifier skew)', () => {
    const harm: UAALBeneficiaryIR = { impacts: [{ beneficiary: 'humans', harmful: true }] };
    const direct = resolveBeneficiary(harm);
    const label = gradeByResolver('beneficiary', harm);
    expect(label.status).toBe(direct.status);
    expect(label.answer).toEqual(direct.answer);
    expect(label.status).toBe('resolved'); // stated harm resolves (floor breached)
  });

  it('carries the structured gap through for an abstention', () => {
    const unstated: UAALBeneficiaryIR = { impacts: [{ beneficiary: 'self', value: 1 }] };
    const label = gradeByResolver('beneficiary', unstated);
    expect(label.status).toBe('unresolvable');
    expect(label.reason).toBe('missing_precondition');
    expect(label.gap?.code).toBe('beneficiary.unstated_impact');
    expect(label.gap?.family).toBe('beneficiary');
  });

  it('dispatches affordance with agent/action/object query and returns its gap', () => {
    const affIr: UAALAffordanceIR = {
      entities: [
        { id: 'robot', kind: 'agent', body: {} },
        { id: 'handle', kind: 'object', offers: [{ action: 'grasp', preconditions: ['powered'] }] },
      ],
      propositions: [],
      query: { agent: 'robot', action: 'grasp', object: 'handle' },
    };
    const label = gradeByResolver('affordance', affIr, {
      agent: 'robot',
      action: 'grasp',
      object: 'handle',
    });
    expect(label.status).toBe('unresolvable');
    expect(label.gap?.code).toBe('affordance.unstated_precondition');
  });

  it('throws (fails loud) on an unregistered family rather than silently mislabeling', () => {
    // Deliberately force an off-list family (cast, not `any`) to exercise the runtime guard.
    expect(() => gradeByResolver('made_up_family' as UAALResolvedFamily, {})).toThrow();
  });
});
