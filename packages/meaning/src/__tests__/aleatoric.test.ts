import { describe, expect, it } from 'vitest';
import { resolveCounterfactual } from '../semantic';
import type { UAALCounterfactualIR } from '../semantic';
import {
  aleatoricGap,
  structuredGap,
  type MeaningAleatoricGap,
  type MeaningStructuredGap,
} from '../contract';

/**
 * GAP ⑧ — epistemic-vs-aleatoric distinction in the gap-object IR.
 *
 * Every founding gap reason is EPISTEMIC (each implies a resolvable_if: some stated fact collapses the
 * gap to a definite answer). A genuinely stochastic outcome has no such fact — abstaining is the
 * calibrated terminal verdict, not a placeholder for missing info. These tests pin the new ALEATORIC
 * class: it carries the `aleatoric` discriminant and the single `irreducible_stochastic` reason, and
 * structurally NO epistemic `base` bucket, so a random outcome can never be mis-typed as reducible.
 */
describe('aleatoric (irreducible_stochastic) gap class', () => {
  it('aleatoricGap carries the discriminant + reason and structurally omits a base bucket', () => {
    const gap = aleatoricGap('counterfactual', 'counterfactual.irreducible_chance', 'E');
    expect(gap).toEqual({
      code: 'counterfactual.irreducible_chance',
      family: 'counterfactual',
      aleatoric: true,
      reason: 'irreducible_stochastic',
      evidence: 'E',
    });
    // No epistemic base bucket exists on the aleatoric class.
    expect('base' in gap).toBe(false);
  });

  it('aleatoricGap omits evidence rather than inventing an undefined key', () => {
    const gap = aleatoricGap('counterfactual', 'counterfactual.irreducible_chance');
    expect('evidence' in gap).toBe(false);
  });

  it('the discriminant separates aleatoric from epistemic gaps on the shared union', () => {
    const epistemic: MeaningStructuredGap = structuredGap(
      'affordance',
      'affordance.unstated_precondition',
      'missing_precondition'
    );
    const aleatoric: MeaningStructuredGap = aleatoricGap(
      'counterfactual',
      'counterfactual.irreducible_chance'
    );

    // Epistemic gap: reducible, carries a base bucket, aleatoric flag absent/false.
    expect(epistemic.base).toBe('missing_precondition');
    expect(epistemic.aleatoric ?? false).toBe(false);

    // Aleatoric gap: the flag narrows the union; base is structurally undefined.
    expect(aleatoric.aleatoric).toBe(true);
    expect(aleatoric.base).toBeUndefined();
    if (aleatoric.aleatoric) {
      const narrowed: MeaningAleatoricGap = aleatoric;
      expect(narrowed.reason).toBe('irreducible_stochastic');
    }
  });

  it('resolveCounterfactual abstains ALEATORIC on a genuinely stochastic queried effect', () => {
    const ir: UAALCounterfactualIR = {
      effects: [{ id: 'E', sufficientSets: [['A']], stochastic: true }],
      occurs: ['A'],
      query: { effect: 'E' },
    };
    const r = resolveCounterfactual(ir);
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('irreducible_stochastic');
    expect(r.gap?.aleatoric).toBe(true);
    expect(r.gap?.code).toBe('counterfactual.irreducible_chance');
    // The aleatoric class carries NO reducible base bucket — this is the miscalibration guard.
    expect(r.gap?.base).toBeUndefined();
  });

  it('does NOT reclassify an epistemic cycle gap as aleatoric', () => {
    // A production cycle is an EPISTEMIC (cyclic_dependency) gap, not aleatoric — the distinction holds.
    const ir: UAALCounterfactualIR = {
      effects: [
        { id: 'E', sufficientSets: [['A']] },
        { id: 'A', sufficientSets: [['E']] },
      ],
      occurs: [],
      query: { effect: 'E' },
    };
    const r = resolveCounterfactual(ir);
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('cyclic_dependency');
    expect(r.gap?.aleatoric ?? false).toBe(false);
    expect(r.gap?.base).toBe('cyclic_dependency');
  });

  it('a deterministic counterfactual IR still resolves — no spurious aleatoric gap', () => {
    const ir: UAALCounterfactualIR = {
      effects: [{ id: 'E', sufficientSets: [['A']] }],
      occurs: ['A'],
      query: { effect: 'E' },
    };
    const r = resolveCounterfactual(ir);
    expect(r.status).toBe('resolved');
  });
});
