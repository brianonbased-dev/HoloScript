import { describe, expect, it } from 'vitest';
import { benchmarkGapIR, encodeGapIR, gradeByResolver, type UAALGapIRFixture } from '../verifier';

const fixtures: UAALGapIRFixture[] = [
  {
    id: 'affordance-gap',
    vertical: 'affordance',
    oracle_ir: {
      entities: [
        { id: 'agent', body: {} },
        { id: 'crate', offers: [{ action: 'lift', requires: { mass: 4 } }] },
      ],
    },
    verifier_query: { agent: 'agent', action: 'lift', object: 'crate' },
    intended: {
      status: 'unresolvable',
      reason: 'missing_precondition',
      code: 'affordance.unstated_capability',
      obstruction: 'the agent carrying capacity is unstated',
    },
  },
  {
    id: 'affordance-resolved',
    vertical: 'affordance',
    oracle_ir: {
      entities: [
        { id: 'agent', body: { reach: 2 } },
        { id: 'crate', offers: [{ action: 'lift', requires: { reach: 1 } }] },
      ],
    },
    verifier_query: { agent: 'agent', action: 'lift', object: 'crate' },
    intended: {
      status: 'resolved',
      answer: { affords: true, reason: null },
    },
  },
];

describe('benchmarkGapIR', () => {
  it('binds both gap branches to the verifier of record and a T4 semantic flip', () => {
    const result = benchmarkGapIR(fixtures);

    expect(result.pass).toBe(true);
    expect(result.n).toBe(2);
    expect(result.tests.gap1_verifier_fidelity.rate).toBe(1);
    expect(result.tests.gap2_schema_structure.rate).toBe(1);
    expect(result.tests.gap3_branch_exclusivity.rate).toBe(1);
    expect(result.tests.gap4_structural_falsification.rate).toBe(1);
  });

  it('fails when a declared answer diverges from the shipped resolver', () => {
    const corrupted: UAALGapIRFixture[] = [
      fixtures[0],
      {
        ...fixtures[1],
        intended: { status: 'resolved', answer: { affords: false, reason: 'no_offer' } },
      },
    ];

    const result = benchmarkGapIR(corrupted);

    expect(result.pass).toBe(false);
    expect(result.tests.gap1_verifier_fidelity.hits).toBe(1);
    expect(result.misses.fidelity[0]).toContain('affordance-resolved');
  });

  it('accepts the intentional legacy beneficiary answer projection', () => {
    const beneficiaryFixtures: UAALGapIRFixture[] = [
      {
        id: 'beneficiary-gap',
        vertical: 'beneficiary',
        oracle_ir: {
          impacts: [
            { beneficiary: 'self', value: 0.8 },
            { beneficiary: 'agents', value: 0.6 },
          ],
        },
        intended: {
          status: 'unresolvable',
          reason: 'missing_precondition',
          code: 'beneficiary.unstated_impact',
          obstruction: 'the effect on humans is unstated',
        },
      },
      {
        id: 'beneficiary-resolved',
        vertical: 'beneficiary',
        oracle_ir: { impacts: [{ beneficiary: 'humans', value: 0.9 }] },
        intended: {
          status: 'resolved',
          answer: { served: 'humans', human_floor: 'held' },
        },
      },
    ];

    expect(benchmarkGapIR(beneficiaryFixtures).pass).toBe(true);
  });

  it('encodes exactly one legal public emission branch', () => {
    const gapLabel = gradeByResolver(
      fixtures[0].vertical,
      fixtures[0].oracle_ir,
      fixtures[0].verifier_query
    );
    const resolvedLabel = gradeByResolver(
      fixtures[1].vertical,
      fixtures[1].oracle_ir,
      fixtures[1].verifier_query
    );

    expect(encodeGapIR(fixtures[0], gapLabel)).toMatchObject({
      schema: 'uaal.gap-ir.v0',
      status: 'unresolvable',
      reason: 'missing_precondition',
      code: 'affordance.unstated_capability',
    });
    expect(encodeGapIR(fixtures[1], resolvedLabel)).toEqual({
      schema: 'uaal.gap-ir.v0',
      scenarioId: 'affordance-resolved',
      query: 'affordance',
      status: 'resolved',
      answer: { affords: true, reason: null },
    });
  });
});
