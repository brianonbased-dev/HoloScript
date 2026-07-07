import { describe, expect, it } from 'vitest';
import {
  benchmarkContainment,
  benchmarkTelos,
  benchmarkTheoryOfMind,
  enclosingChain,
  flagOnlyTelosGap,
  recoverFalseBelief,
  recoverOcclusion,
  recoverTelosGap,
} from '../semantic';
import type { UAALContainmentIR, UAALSemanticBenchmarkRow, UAALTelosIR, UAALTheoryOfMindIR } from '../semantic';

const theoryOfMindIR: UAALTheoryOfMindIR = {
  propositions: [
    { id: 'p_a', subject: 'marin', predicate: 'expects', object: 'left shelf', negates: 'p_b' },
    { id: 'p_b', subject: 'token', predicate: 'is_at', object: 'right shelf' },
  ],
  beliefs: [{ id: 'belief_a', agent: 'marin', prop: 'p_a' }],
  causal: [
    { from: 'ambiguous_glimpse', effect: 'belief_a', mechanism: 'ambiguous evidence' },
    { from: 'observer_model', effect: 'belief_a', mechanism: 'theory of mind nesting' },
  ],
};

function row<TCompletion, TMetadata extends Record<string, unknown>>(
  completion: TCompletion,
  metadata: TMetadata,
): UAALSemanticBenchmarkRow<TCompletion, TMetadata> {
  return { completion: JSON.stringify(completion), metadata };
}

describe('semantic theory-of-mind harness', () => {
  it('recovers false belief from proposition negation and beliefs', () => {
    expect(recoverFalseBelief(theoryOfMindIR)).toEqual({
      holder: 'marin',
      believedProp: 'p_a',
      truthProp: 'p_b',
      mechanism: 'ambiguous evidence',
    });

    const corrupt = JSON.parse(JSON.stringify(theoryOfMindIR)) as UAALTheoryOfMindIR;
    for (const proposition of corrupt.propositions || []) delete proposition.negates;
    expect(recoverFalseBelief(corrupt)).toBeNull();
  });

  it('passes the recoverability benchmark on a load-bearing fixture', () => {
    const result = benchmarkTheoryOfMind([row(theoryOfMindIR, { variant_id: 'ambiguous_evidence' })]);
    expect(result.pass).toBe(true);
    expect(result.tests.t1_false_belief_recall.rate).toBe(1);
    expect(result.tests.t4_falsification_flip.rate).toBe(1);
  });
});

const telosRows = [
  row<UAALTelosIR, { id: string; telos_gap: boolean; beneficiary: string | null }>(
    {
      entities: [
        { id: 'crew', kind: 'beneficiary' },
        { id: 'meal', kind: 'object' },
      ],
      events: [{ id: 'cook', object: 'meal', telos: { beneficiary: 'crew', goal: 'feed' } }],
      causal: [],
      perspectives: [{ stance: 'outward', telos_gap: false }],
    },
    { id: 'direct_served', telos_gap: false, beneficiary: 'crew' },
  ),
  row<UAALTelosIR, { id: string; telos_gap: boolean; beneficiary: string | null }>(
    {
      entities: [
        { id: 'resident', kind: 'beneficiary' },
        { id: 'pump', kind: 'object' },
      ],
      events: [{ id: 'repair', object: 'pump', telos: null }],
      causal: [
        { from: 'repair', to: 'pump' },
        { from: 'pump', to: 'resident' },
      ],
      perspectives: [{ stance: 'outward', telos_gap: false }],
    },
    { id: 'indirect_served', telos_gap: false, beneficiary: 'resident' },
  ),
  row<UAALTelosIR, { id: string; telos_gap: boolean; beneficiary: string | null }>(
    {
      entities: [{ id: 'scrap', kind: 'object' }],
      events: [{ id: 'sort', object: 'scrap', telos: null }],
      causal: [],
      perspectives: [{ stance: 'outward', telos_gap: true }],
    },
    { id: 'unserved_no_beneficiary', telos_gap: true, beneficiary: null },
  ),
  row<UAALTelosIR, { id: string; telos_gap: boolean; beneficiary: string | null }>(
    {
      entities: [
        { id: 'audience', kind: 'beneficiary' },
        { id: 'draft', kind: 'object' },
      ],
      events: [{ id: 'write', object: 'draft', telos: null }],
      causal: [],
      perspectives: [{ stance: 'outward', telos_gap: true }],
    },
    { id: 'busy_unserved', telos_gap: true, beneficiary: null },
  ),
];

describe('semantic telos harness', () => {
  it('recovers indirect beneficiary service that a flag-only read misses', () => {
    const indirect = JSON.parse(telosRows[1].completion as string) as UAALTelosIR;

    expect(recoverTelosGap(indirect)).toEqual({ gap: false, beneficiary: 'resident' });
    expect(flagOnlyTelosGap(indirect)).toEqual({ gap: true });
  });

  it('passes the telos benchmark and beats the flag baseline', () => {
    const result = benchmarkTelos(telosRows);
    expect(result.pass).toBe(true);
    expect(result.tests.tt1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_flag.edge).toBeGreaterThan(0);
  });
});

const containmentRows = [
  row<UAALContainmentIR, { id: string; occluded: boolean; occluder: string | null }>(
    {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'coin', kind: 'object' },
        { id: 'box', kind: 'container', opaque: true },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'coin', outer: 'box' },
        { inner: 'box', outer: 'room' },
        { inner: 'agent', outer: 'room' },
      ],
      perspectives: [{ claims_sees: ['coin'] }],
      query: { agent: 'agent', object: 'coin' },
    },
    { id: 'occluded_box', occluded: true, occluder: 'box' },
  ),
  row<UAALContainmentIR, { id: string; occluded: boolean; occluder: string | null }>(
    {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'coin', kind: 'object' },
        { id: 'case', kind: 'container', opaque: false },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'coin', outer: 'case' },
        { inner: 'case', outer: 'room' },
        { inner: 'agent', outer: 'room' },
      ],
      perspectives: [{ claims_sees: ['coin'] }],
      query: { agent: 'agent', object: 'coin' },
    },
    { id: 'transparent_case', occluded: false, occluder: null },
  ),
  row<UAALContainmentIR, { id: string; occluded: boolean; occluder: string | null }>(
    {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'coin', kind: 'object' },
        { id: 'box', kind: 'container', opaque: true },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'coin', outer: 'box' },
        { inner: 'agent', outer: 'box' },
        { inner: 'box', outer: 'room' },
      ],
      perspectives: [{ claims_sees: ['coin'] }],
      query: { agent: 'agent', object: 'coin' },
    },
    { id: 'agent_inside', occluded: false, occluder: null },
  ),
  row<UAALContainmentIR, { id: string; occluded: boolean; occluder: string | null }>(
    {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'gem', kind: 'object' },
        { id: 'chest', kind: 'container', opaque: true },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'gem', outer: 'chest' },
        { inner: 'chest', outer: 'room' },
        { inner: 'agent', outer: 'room' },
      ],
      perspectives: [{ claims_sees: ['gem'] }],
      query: { agent: 'agent', object: 'gem' },
    },
    { id: 'nested_occluded', occluded: true, occluder: 'chest' },
  ),
];

describe('semantic containment harness', () => {
  it('recovers agent-relative occlusion and containment chains', () => {
    const agentInside = JSON.parse(containmentRows[2].completion as string) as UAALContainmentIR;

    expect(enclosingChain(agentInside, 'coin')).toEqual(['box', 'room']);
    expect(recoverOcclusion(agentInside, 'agent', 'coin')).toEqual({ occluded: false, occluder: null });
  });

  it('passes the containment benchmark and beats shallow opacity', () => {
    const result = benchmarkContainment(containmentRows);
    expect(result.pass).toBe(true);
    expect(result.tests.st1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_naive.edge).toBeGreaterThan(0);
  });
});
