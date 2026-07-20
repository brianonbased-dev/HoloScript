import { describe, expect, it } from 'vitest';
import { honestyGate } from '../honesty-gate';
import { aleatoricGap, structuredGap, type MeaningResolution } from '../contract';
import { fromResolution, known, unknown } from '../uncertain';
import { lowerUnknownField } from '../lower-unknown';

describe('honestyGate — abstain instead of acting on values nobody established', () => {
  it('proceeds with extracted values when every prerequisite is known', () => {
    const decision = honestyGate({
      target: known('door-7'),
      distance: known(2.5),
    });
    expect(decision.decision).toBe('proceed');
    if (decision.decision === 'proceed') {
      expect(decision.values).toEqual({ target: 'door-7', distance: 2.5 });
    }
  });

  it('abstains when any prerequisite is unknown, reporting ALL blockers not just the first', () => {
    const decision = honestyGate({
      target: known('door-7'),
      occupancy: unknown('underdetermined'),
      clearance: unknown('missing_precondition'),
    });
    expect(decision.decision).toBe('abstain');
    if (decision.decision === 'abstain') {
      expect(decision.blocking.map((b) => b.key).sort()).toEqual(['clearance', 'occupancy']);
      expect(decision.blocking.every((b) => !b.aleatoric)).toBe(true);
    }
  });

  it('separates epistemic from aleatoric blockers — investigate vs decide-under-uncertainty', () => {
    const decision = honestyGate({
      barrier_opacity: unknown(
        'underdetermined',
        structuredGap('occlusion', 'occlusion.opacity_unstated', 'underdetermined')
      ),
      coin: unknown('irreducible_stochastic', aleatoricGap('counterfactual', 'counterfactual.irreducible_chance')),
    });
    expect(decision.decision).toBe('abstain');
    if (decision.decision === 'abstain') {
      const byKey = Object.fromEntries(decision.blocking.map((b) => [b.key, b]));
      expect(byKey.barrier_opacity.aleatoric).toBe(false);
      expect(byKey.barrier_opacity.gap?.code).toBe('occlusion.opacity_unstated');
      expect(byKey.coin.aleatoric).toBe(true);
      expect(byKey.coin.reason).toBe('irreducible_stochastic');
    }
  });

  it('an action with no epistemic prerequisites proceeds trivially', () => {
    const decision = honestyGate({});
    expect(decision.decision).toBe('proceed');
    if (decision.decision === 'proceed') expect(decision.values).toEqual({});
  });

  it('consumes a lowered @unknown field — the surface-annotation flavor', () => {
    const lowered = lowerUnknownField({ key: 'reading', annotations: ['unknown'] })!;
    const decision = honestyGate({ reading: lowered.initial });
    expect(decision.decision).toBe('abstain');
    if (decision.decision === 'abstain') {
      expect(decision.blocking[0].key).toBe('reading');
      expect(decision.blocking[0].reason).toBe('underdetermined');
    }
  });

  it('consumes a resolver verdict via fromResolution — the Wave 5.1 floor flavor, no translation', () => {
    const unresolvable: MeaningResolution<string> = {
      query: 'beneficiary',
      status: 'unresolvable',
      reason: 'underdetermined',
      gap: structuredGap('beneficiary', 'beneficiary.unstated_impact', 'underdetermined'),
    };
    const decision = honestyGate({ served: fromResolution(unresolvable) });
    expect(decision.decision).toBe('abstain');
    if (decision.decision === 'abstain') {
      expect(decision.blocking[0].gap?.code).toBe('beneficiary.unstated_impact');
    }
    // ...and the same resolver coming back resolved lets the action proceed.
    const resolved: MeaningResolution<string> = { query: 'beneficiary', status: 'resolved', answer: 'humans' };
    const go = honestyGate({ served: fromResolution(resolved) });
    expect(go.decision).toBe('proceed');
    if (go.decision === 'proceed') expect(go.values.served).toBe('humans');
  });

  it('the decision is JSON-serializable — it IS the receipt payload', () => {
    const decision = honestyGate({ x: unknown('cyclic_dependency') });
    const roundTripped = JSON.parse(JSON.stringify(decision));
    expect(roundTripped).toEqual(decision);
  });
});
