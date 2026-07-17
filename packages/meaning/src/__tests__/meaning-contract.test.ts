import { describe, expect, it } from 'vitest';
import {
  structuredGap,
  type MeaningGapReason,
  type MeaningResolution,
  type MeaningStructuredGap,
  type UAALResolution,
} from '../index';

describe('@holoscript/meaning — the stratum-② contract', () => {
  it('structuredGap keeps the family-scoped code and the coarse base bucket consistent', () => {
    const gap = structuredGap('affordance', 'affordance.unstated_precondition', 'missing_precondition');
    expect(gap).toEqual({
      code: 'affordance.unstated_precondition',
      family: 'affordance',
      base: 'missing_precondition',
    });
  });

  it('structuredGap carries optional evidence without inventing an undefined key', () => {
    const withEvidence = structuredGap('beneficiary', 'beneficiary.unstated_impact', 'underdetermined', 'atom-42');
    expect(withEvidence.evidence).toBe('atom-42');
    const without = structuredGap('beneficiary', 'beneficiary.unstated_impact', 'underdetermined');
    expect('evidence' in without).toBe(false);
  });

  it('a resolution is exactly resolved-or-unresolvable; a gap is a status plus reason, never a third enum', () => {
    const resolved: MeaningResolution<boolean> = { query: 'occluded', status: 'resolved', answer: false };
    const gap: MeaningStructuredGap = structuredGap('containment', 'containment.opacity_unstated', 'underdetermined');
    const abstained: MeaningResolution = {
      query: 'occluded',
      status: 'unresolvable',
      reason: 'underdetermined',
      gap,
    };
    expect(resolved.status).toBe('resolved');
    expect(abstained.status).toBe('unresolvable');
    expect(abstained.gap?.base).toBe(abstained.reason);
  });

  it('grandfathered UAAL* aliases are the same types (one definition, two names — HOLON P7)', () => {
    const viaAlias: UAALResolution<string> = { query: 'q', status: 'resolved', answer: 'a' };
    const viaNative: MeaningResolution<string> = viaAlias;
    expect(viaNative.answer).toBe('a');
    const reasons: MeaningGapReason[] = [
      'underdetermined',
      'unprioritized_conflict',
      'cyclic_dependency',
      'missing_precondition',
    ];
    expect(reasons).toHaveLength(4);
  });
});
