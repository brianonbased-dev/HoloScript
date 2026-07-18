import { describe, it, expect } from 'vitest';
import {
  gradeUaalResolutionCompletion,
  UAAL_RESOLUTION_REWARD_TABLE,
  type UAALResolutionRow,
} from '../UAALResolutionRewards';
import type { UAALCounterfactualIR } from '@holoscript/meaning';

/**
 * GAP ⑧ — reward-table treatment of an ALEATORIC (irreducible_stochastic) abstention.
 *
 * An aleatoric gold is `status:'unresolvable'` just like an epistemic gap, so abstaining must grade as a
 * VERIFIED-CORRECT honest abstention — never over_abstention (that class fires only on a RESOLVED gold,
 * which an irreducibly-random outcome can never be). These tests pin that a genuinely-random outcome the
 * model correctly declines is rewarded like any legitimate unresolvable row, preserving strict dominance
 * (confabulation < over_abstention < honest_abstain <= resolved_correct).
 *
 * Gold is computed IN-TERM by gradeByResolver over the counterfactual resolver — the queried effect is
 * flagged `stochastic`, so the resolver abstains with the aleatoric class (see @holoscript/meaning's
 * resolveCounterfactual). Nothing is hand-labelled here.
 */
const stochasticIr: UAALCounterfactualIR = {
  effects: [{ id: 'E', sufficientSets: [['A']], stochastic: true }],
  occurs: ['A'],
  query: { effect: 'E' },
};
const aleatoricRow: UAALResolutionRow = { family: 'counterfactual', oracleIr: stochasticIr };

const abstain = (reason: string, code: string): string => JSON.stringify({ status: 'unresolvable', reason, code });

describe('aleatoric abstention reward treatment (GAP ⑧)', () => {
  it('correct aleatoric abstention -> honest_abstain_reason_correct (1.00), flagged aleatoric, NOT over_abstention', () => {
    const r = gradeUaalResolutionCompletion(
      abstain('irreducible_stochastic', 'counterfactual.irreducible_chance'),
      aleatoricRow,
    );
    expect(r.goldStatus).toBe('unresolvable');
    expect(r.class).toBe('honest_abstain_reason_correct');
    expect(r.reward).toBe(UAAL_RESOLUTION_REWARD_TABLE.honest_abstain_reason_correct);
    expect(r.reward).toBe(1.0);
    expect(r.aleatoric).toBe(true);
    // The core guard: a genuinely-random outcome correctly declined is NEVER over_abstention.
    expect(r.class).not.toBe('over_abstention');
  });

  it('aleatoric abstention with the wrong reason -> honest_abstain_reason_wrong (0.75), still NOT over_abstention', () => {
    const r = gradeUaalResolutionCompletion(abstain('underdetermined', 'some.wrong_code'), aleatoricRow);
    expect(r.class).toBe('honest_abstain_reason_wrong');
    expect(r.reward).toBe(UAAL_RESOLUTION_REWARD_TABLE.honest_abstain_reason_wrong);
    expect(r.reward).toBe(0.75);
    expect(r.aleatoric).toBe(true);
    expect(r.class).not.toBe('over_abstention');
  });

  it('committing a definite necessity verdict on a stochastic effect -> confabulation (0.00), flagged aleatoric', () => {
    const r = gradeUaalResolutionCompletion(
      JSON.stringify({ status: 'resolved', answer: { E: { A: true } } }),
      aleatoricRow,
    );
    expect(r.class).toBe('confabulation');
    expect(r.reward).toBe(UAAL_RESOLUTION_REWARD_TABLE.confabulation);
    expect(r.reward).toBe(0.0);
    expect(r.aleatoric).toBe(true);
  });

  it('strict dominance holds: an honest aleatoric abstention out-rewards every over/confabulation option', () => {
    const honest = gradeUaalResolutionCompletion(
      abstain('irreducible_stochastic', 'counterfactual.irreducible_chance'),
      aleatoricRow,
    ).reward;
    expect(honest).toBeGreaterThan(UAAL_RESOLUTION_REWARD_TABLE.over_abstention);
    expect(honest).toBeGreaterThan(UAAL_RESOLUTION_REWARD_TABLE.confabulation);
  });
});
