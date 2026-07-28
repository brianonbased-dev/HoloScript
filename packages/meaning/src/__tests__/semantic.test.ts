import { describe, expect, it } from 'vitest';
import {
  benchmarkAccess,
  benchmarkAffordance,
  benchmarkCommitment,
  benchmarkComposition,
  benchmarkContainment,
  benchmarkCounterfactual,
  benchmarkDeontic,
  benchmarkAnalogy,
  benchmarkMereology,
  benchmarkMotif,
  benchmarkPresupposition,
  benchmarkTension,
  branchCountTension,
  canonicalForm,
  essentialismPersistence,
  lexicalRecurrence,
  benchmarkTelos,
  benchmarkTemporal,
  benchmarkTheoryOfMind,
  containmentAccessBaseline,
  enclosingChain,
  flagOnlyTelosGap,
  naiveParentNecessity,
  recoverAtomStatus,
  recoverFalseBelief,
  recoverAffords,
  recoverBeliefStatus,
  recoverCommitmentStatus,
  recoverDischargeable,
  recoverNecessity,
  recoverNormStatus,
  recoverMotif,
  recoverPersistence,
  recoverOcclusion,
  recoverAccess,
  recoverTelosGap,
  recoverTension,
  recoverValidity,
  surfaceSimilarityValidity,
} from '../semantic';
import type {
  UAALAccessMetadata,
  UAALAffordanceIR,
  UAALAffordanceMetadata,
  UAALAnalogyIR,
  UAALAnalogyMetadata,
  UAALCommitmentIR,
  UAALCommitmentMetadata,
  UAALCompositionIR,
  UAALCompositionMetadata,
  UAALContainmentIR,
  UAALCounterfactualIR,
  UAALCounterfactualMetadata,
  UAALDeonticIR,
  UAALDeonticMetadata,
  UAALMereologyIR,
  UAALMereologyMetadata,
  UAALMotifComponent,
  UAALMotifIR,
  UAALMotifMetadata,
  UAALPresuppositionIR,
  UAALPresuppositionMetadata,
  UAALSemanticBenchmarkRow,
  UAALTelosIR,
  UAALTemporalIR,
  UAALTemporalMetadata,
  UAALTheoryOfMindIR,
  UAALTensionIR,
  UAALTensionMetadata,
} from '../semantic';

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
  metadata: TMetadata
): UAALSemanticBenchmarkRow<TCompletion, TMetadata> {
  return { completion: JSON.stringify(completion), metadata };
}

function cloneFixture<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
    const result = benchmarkTheoryOfMind([
      row(theoryOfMindIR, { variant_id: 'ambiguous_evidence' }),
    ]);
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
    { id: 'direct_served', telos_gap: false, beneficiary: 'crew' }
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
    { id: 'indirect_served', telos_gap: false, beneficiary: 'resident' }
  ),
  row<UAALTelosIR, { id: string; telos_gap: boolean; beneficiary: string | null }>(
    {
      entities: [{ id: 'scrap', kind: 'object' }],
      events: [{ id: 'sort', object: 'scrap', telos: null }],
      causal: [],
      perspectives: [{ stance: 'outward', telos_gap: true }],
    },
    { id: 'unserved_no_beneficiary', telos_gap: true, beneficiary: null }
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
    { id: 'busy_unserved', telos_gap: true, beneficiary: null }
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
    { id: 'occluded_box', occluded: true, occluder: 'box' }
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
    { id: 'transparent_case', occluded: false, occluder: null }
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
    { id: 'agent_inside', occluded: false, occluder: null }
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
    { id: 'nested_occluded', occluded: true, occluder: 'chest' }
  ),
];

describe('semantic containment harness', () => {
  it('recovers agent-relative occlusion and containment chains', () => {
    const agentInside = JSON.parse(containmentRows[2].completion as string) as UAALContainmentIR;

    expect(enclosingChain(agentInside, 'coin')).toEqual(['box', 'room']);
    expect(recoverOcclusion(agentInside, 'agent', 'coin')).toEqual({
      occluded: false,
      occluder: null,
    });
  });

  it('passes the containment benchmark and beats shallow opacity', () => {
    const result = benchmarkContainment(containmentRows);
    expect(result.pass).toBe(true);
    expect(result.tests.st1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_naive.edge).toBeGreaterThan(0);
  });
});

const affordanceRows = [
  row<UAALAffordanceIR, UAALAffordanceMetadata>(
    {
      entities: [
        { id: 'bot', kind: 'agent', body: { width: 0.4, lift: 20 } },
        {
          id: 'hatch',
          kind: 'object',
          offers: [{ action: 'pass', requires: { aperture: 0.6 }, preconditions: ['p_clear'] }],
        },
      ],
      propositions: [{ id: 'p_clear', holds: true }],
      query: { agent: 'bot', action: 'pass', object: 'hatch' },
    },
    { id: 'fits_hatch', affords: true, block_reason: null }
  ),
  row<UAALAffordanceIR, UAALAffordanceMetadata>(
    {
      entities: [
        { id: 'bot', kind: 'agent', body: { width: 0.9, lift: 20 } },
        {
          id: 'hatch',
          kind: 'object',
          offers: [{ action: 'pass', requires: { aperture: 0.6 }, preconditions: ['p_clear'] }],
        },
      ],
      propositions: [{ id: 'p_clear', holds: true }],
      query: { agent: 'bot', action: 'pass', object: 'hatch' },
    },
    { id: 'too_wide', affords: false, block_reason: 'aperture' }
  ),
  row<UAALAffordanceIR, UAALAffordanceMetadata>(
    {
      entities: [
        { id: 'bot', kind: 'agent', body: { width: 0.4, lift: 20 } },
        { id: 'wall', kind: 'object', offers: [] },
      ],
      propositions: [],
      query: { agent: 'bot', action: 'pass', object: 'wall' },
    },
    { id: 'no_offer', affords: false, block_reason: 'no_offer' }
  ),
  row<UAALAffordanceIR, UAALAffordanceMetadata>(
    {
      entities: [
        { id: 'bot', kind: 'agent', body: { width: 0.4, lift: 20 } },
        {
          id: 'hatch',
          kind: 'object',
          offers: [{ action: 'pass', requires: { aperture: 0.6 }, preconditions: ['p_clear'] }],
        },
      ],
      propositions: [{ id: 'p_clear', holds: false }],
      query: { agent: 'bot', action: 'pass', object: 'hatch' },
    },
    { id: 'blocked_precondition', affords: false, block_reason: 'precondition' }
  ),
];

describe('semantic affordance harness', () => {
  it('recovers body-relative affordance instead of object offers alone', () => {
    const tooWide = JSON.parse(affordanceRows[1].completion as string) as UAALAffordanceIR;

    expect(recoverAffords(tooWide, 'bot', 'pass', 'hatch')).toEqual({
      affords: false,
      reason: 'aperture',
    });
  });

  it('passes the affordance benchmark and beats object-offer baseline', () => {
    const result = benchmarkAffordance(affordanceRows);
    expect(result.pass).toBe(true);
    expect(result.tests.at1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_baseline.edge).toBeGreaterThan(0);
  });
});

const temporalRows = [
  row<UAALTemporalIR, UAALTemporalMetadata>(
    {
      facts: [{ id: 'lamp_on', initial: true }],
      events: [],
      beliefs: [{ id: 'b_fresh', prop: true, t_formed: 1 }],
      temporal_order: [],
      t_now: 5,
      query: { belief: 'b_fresh', fact: 'lamp_on' },
    },
    { id: 'fresh', belief_status: 'fresh', change_event: null }
  ),
  row<UAALTemporalIR, UAALTemporalMetadata>(
    {
      facts: [{ id: 'lamp_on', initial: true }],
      events: [{ id: 'e_off', world_change: true, fact: 'lamp_on', sets: false, t: 5 }],
      beliefs: [{ id: 'b_stale', prop: true, t_formed: 1 }],
      temporal_order: ['e_off'],
      t_now: 10,
      query: { belief: 'b_stale', fact: 'lamp_on' },
    },
    { id: 'stale_after_flip', belief_status: 'stale', change_event: 'e_off' }
  ),
  row<UAALTemporalIR, UAALTemporalMetadata>(
    {
      facts: [{ id: 'lamp_on', initial: false }],
      events: [],
      beliefs: [{ id: 'b_error', prop: true, t_formed: 1 }],
      temporal_order: [],
      t_now: 5,
      query: { belief: 'b_error', fact: 'lamp_on' },
    },
    { id: 'wrong_from_start', belief_status: 'error', change_event: null }
  ),
];

describe('semantic temporal harness', () => {
  it('splits stale belief from original error', () => {
    const stale = JSON.parse(temporalRows[1].completion as string) as UAALTemporalIR;

    expect(recoverBeliefStatus(stale, 'b_stale', 'lamp_on')).toEqual({
      status: 'stale',
      change_event: 'e_off',
    });
  });

  it('passes the temporal benchmark and beats the time-blind baseline', () => {
    const result = benchmarkTemporal(temporalRows);
    expect(result.pass).toBe(true);
    expect(result.tests.tt1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_naive.edge).toBeGreaterThan(0);
  });
});

const deonticRows = [
  row<UAALDeonticIR, UAALDeonticMetadata>(
    {
      norms: [
        {
          id: 'n_delivery',
          force: 'O',
          authority: 'charter',
          addressee: 'jan',
          required_act: 'deliver',
        },
      ],
      events: [{ id: 'e_direct', actor: 'jan', act: 'deliver', on_behalf_of: 'jan' }],
      beliefs: [{ confidence: 1 }],
      desires: [{ satisfied: true }],
      query: { norm: 'n_delivery' },
    },
    { id: 'direct_complied', class: 'direct', norm_status: 'complied' }
  ),
  row<UAALDeonticIR, UAALDeonticMetadata>(
    {
      norms: [
        {
          id: 'n_delivery',
          force: 'O',
          authority: 'charter',
          addressee: 'jan',
          required_act: 'deliver',
        },
      ],
      events: [{ id: 'e_proxy', actor: 'kai', act: 'deliver', on_behalf_of: 'jan' }],
      beliefs: [{ confidence: 1 }],
      desires: [{ satisfied: true }],
      query: { norm: 'n_delivery' },
    },
    { id: 'proxy_complied', class: 'complied_by_proxy', norm_status: 'complied' }
  ),
  row<UAALDeonticIR, UAALDeonticMetadata>(
    {
      norms: [
        {
          id: 'n_delivery',
          force: 'O',
          authority: 'charter',
          addressee: 'jan',
          required_act: 'deliver',
        },
      ],
      events: [],
      beliefs: [{ confidence: 1 }],
      desires: [{ satisfied: true }],
      query: { norm: 'n_delivery' },
    },
    { id: 'violated', class: 'violated', norm_status: 'violated' }
  ),
  row<UAALDeonticIR, UAALDeonticMetadata>(
    {
      norms: [
        {
          id: 'n_delivery',
          force: 'P',
          authority: 'charter',
          addressee: 'jan',
          required_act: 'deliver',
        },
      ],
      events: [],
      beliefs: [{ confidence: 1 }],
      desires: [{ satisfied: true }],
      query: { norm: 'n_delivery' },
    },
    { id: 'permission_not_exercised', class: 'permission', norm_status: 'complied' }
  ),
];

describe('semantic deontic harness', () => {
  it('counts proxy discharge while preserving force semantics', () => {
    const proxy = JSON.parse(deonticRows[1].completion as string) as UAALDeonticIR;

    expect(recoverNormStatus(proxy, 'n_delivery')).toEqual({
      status: 'complied',
      force: 'O',
      fulfilledBy: 'e_proxy',
    });
  });

  it('passes the deontic benchmark and beats personal-performance baseline', () => {
    const result = benchmarkDeontic(deonticRows);
    expect(result.pass).toBe(true);
    expect(result.tests.dt1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_naive.edge).toBeGreaterThan(0);
  });
});

const commitmentRows = [
  row<UAALCommitmentIR, UAALCommitmentMetadata>(
    {
      commitments: [
        {
          id: 'c_delivery',
          promisor: 'sol',
          pledged_act: { type: 'deliver', recipient: 'mara', magnitude: 10 },
          due_time: 5,
        },
      ],
      events: [
        {
          id: 'e_deliver',
          predicate: 'deliver',
          actor: 'sol',
          recipient: 'mara',
          magnitude: 10,
          t: 4,
        },
      ],
      claims: [{ commitment: 'c_delivery', asserts_status: 'discharged' }],
      now: 10,
      query: { commitment: 'c_delivery' },
    },
    { id: 'discharged', commitment_status: 'discharged', fulfilling_recipient: 'mara' }
  ),
  row<UAALCommitmentIR, UAALCommitmentMetadata>(
    {
      commitments: [
        {
          id: 'c_delivery',
          promisor: 'sol',
          pledged_act: { type: 'deliver', recipient: 'mara', magnitude: 10 },
          due_time: 5,
        },
      ],
      events: [
        {
          id: 'e_wrong_party',
          predicate: 'deliver',
          actor: 'sol',
          recipient: 'nox',
          magnitude: 10,
          t: 4,
        },
      ],
      claims: [{ commitment: 'c_delivery', asserts_status: 'discharged' }],
      now: 10,
      query: { commitment: 'c_delivery' },
    },
    { id: 'wrong_counterparty', commitment_status: 'broken', fulfilling_recipient: null }
  ),
  row<UAALCommitmentIR, UAALCommitmentMetadata>(
    {
      commitments: [
        {
          id: 'c_delivery',
          promisor: 'sol',
          pledged_act: { type: 'deliver', recipient: 'mara', magnitude: 10 },
          due_time: 5,
        },
      ],
      events: [
        {
          id: 'e_late',
          predicate: 'deliver',
          actor: 'sol',
          recipient: 'mara',
          magnitude: 10,
          t: 7,
        },
      ],
      claims: [{ commitment: 'c_delivery', asserts_status: 'discharged' }],
      now: 10,
      query: { commitment: 'c_delivery' },
    },
    { id: 'late', commitment_status: 'broken', fulfilling_recipient: null }
  ),
  row<UAALCommitmentIR, UAALCommitmentMetadata>(
    {
      commitments: [
        {
          id: 'c_delivery',
          promisor: 'sol',
          pledged_act: { type: 'deliver', recipient: 'mara', magnitude: 10 },
          due_time: 5,
        },
      ],
      events: [],
      claims: [{ commitment: 'c_delivery', asserts_status: 'discharged' }],
      now: 3,
      query: { commitment: 'c_delivery' },
    },
    { id: 'open', commitment_status: 'open', fulfilling_recipient: null }
  ),
];

describe('semantic commitment harness', () => {
  it('requires the pledged act to reach the named promisee on time', () => {
    const wrongParty = JSON.parse(commitmentRows[1].completion as string) as UAALCommitmentIR;

    expect(recoverCommitmentStatus(wrongParty, 'c_delivery').status).toBe('broken');
  });

  it('passes the commitment benchmark and beats occurrence flags', () => {
    const result = benchmarkCommitment(commitmentRows);
    expect(result.pass).toBe(true);
    expect(result.tests.cm1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_flag.edge).toBeGreaterThan(0);
  });
});

const counterfactualRows = [
  row<UAALCounterfactualIR, UAALCounterfactualMetadata>(
    {
      occurs: ['a'],
      effects: [{ id: 'e', sufficientSets: [['a']] }],
      causal: [{ from: 'a', to: 'e' }],
      query: { effect: 'e' },
    },
    { id: 'single', class: 'single_producer', necessary: { e: { a: true } } }
  ),
  row<UAALCounterfactualIR, UAALCounterfactualMetadata>(
    {
      occurs: ['a', 'b'],
      effects: [{ id: 'e', sufficientSets: [['a'], ['b']] }],
      causal: [
        { from: 'a', to: 'e' },
        { from: 'b', to: 'e' },
      ],
      query: { effect: 'e' },
    },
    { id: 'overdetermined', class: 'overdetermination', necessary: { e: { a: false, b: false } } }
  ),
  row<UAALCounterfactualIR, UAALCounterfactualMetadata>(
    {
      occurs: ['a'],
      standby: [{ id: 'b', preemptedBy: 'a' }],
      effects: [{ id: 'e', sufficientSets: [['a'], ['b']] }],
      causal: [{ from: 'a', to: 'e' }],
      query: { effect: 'e' },
    },
    { id: 'preempted_backup', class: 'preemption', necessary: { e: { a: false, b: false } } }
  ),
  row<UAALCounterfactualIR, UAALCounterfactualMetadata>(
    {
      occurs: ['a'],
      effects: [
        { id: 'b', sufficientSets: [['a']] },
        { id: 'e', sufficientSets: [['b']] },
      ],
      causal: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'e' },
      ],
      query: { effect: 'e' },
    },
    { id: 'chain', class: 'chain', necessary: { e: { a: true, b: true } } }
  ),
];

describe('semantic counterfactual harness', () => {
  it('separates actual parenthood from counterfactual necessity', () => {
    const overdetermined = JSON.parse(
      counterfactualRows[1].completion as string
    ) as UAALCounterfactualIR;

    expect(recoverNecessity(overdetermined)).toEqual({ e: { a: false, b: false } });
    expect(naiveParentNecessity(overdetermined)).toEqual({ e: { a: true, b: true } });
  });

  it('passes the counterfactual benchmark and beats actual-DAG parenthood', () => {
    const result = benchmarkCounterfactual(counterfactualRows);
    expect(result.pass).toBe(true);
    expect(result.tests.ct1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_naive.edge).toBeGreaterThan(0);
  });
});

const accessRows = [
  row<UAALContainmentIR, UAALAccessMetadata>(
    {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'bell', kind: 'object' },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'bell', outer: 'room' },
        { inner: 'agent', outer: 'room' },
      ],
      query: { agent: 'agent', object: 'bell' },
    },
    {
      id: 'visible_audible',
      access: { visual: true, audible: true },
      blocker: { visual: null, audible: null },
    }
  ),
  row<UAALContainmentIR, UAALAccessMetadata>(
    {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'bell', kind: 'object' },
        { id: 'box', kind: 'container', blocks: ['visual', 'audible'] },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'bell', outer: 'box' },
        { inner: 'box', outer: 'room' },
        { inner: 'agent', outer: 'room' },
      ],
      query: { agent: 'agent', object: 'bell' },
    },
    {
      id: 'blocked_all',
      access: { visual: false, audible: false },
      blocker: { visual: 'box', audible: 'box' },
    }
  ),
  row<UAALContainmentIR, UAALAccessMetadata>(
    {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'bell', kind: 'object' },
        { id: 'box', kind: 'container', blocks: ['visual'] },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'bell', outer: 'box' },
        { inner: 'box', outer: 'room' },
        { inner: 'agent', outer: 'room' },
      ],
      query: { agent: 'agent', object: 'bell' },
    },
    {
      id: 'heard_not_seen',
      access: { visual: false, audible: true },
      blocker: { visual: 'box', audible: null },
    }
  ),
  row<UAALContainmentIR, UAALAccessMetadata>(
    {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'coin', kind: 'object' },
        { id: 'box', kind: 'container' },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'coin', outer: 'box' },
        { inner: 'agent', outer: 'box' },
        { inner: 'box', outer: 'room' },
      ],
      query: { agent: 'agent', object: 'coin' },
    },
    {
      id: 'shared_box',
      access: { visual: true, audible: true },
      blocker: { visual: null, audible: null },
    }
  ),
];

describe('semantic access harness', () => {
  it('recovers per-modality access over the containment chain', () => {
    const heardNotSeen = JSON.parse(accessRows[2].completion as string) as UAALContainmentIR;

    expect(recoverAccess(heardNotSeen, 'agent', 'bell').access).toEqual({
      visual: false,
      audible: true,
    });
    expect(containmentAccessBaseline(heardNotSeen, 'agent', 'bell').access).toEqual({
      visual: false,
      audible: false,
    });
  });

  it('passes the access benchmark and beats all-or-nothing containment', () => {
    const result = benchmarkAccess(accessRows);
    expect(result.pass).toBe(true);
    expect(result.tests.ot1_access_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_containment.edge).toBeGreaterThan(0);
  });
});

const baseComposition: UAALCompositionIR = {
  entities: [
    { id: 'agent', kind: 'agent', body: { lift: 20 } },
    {
      id: 'parcel',
      kind: 'object',
      offers: [{ action: 'deliver', requires: { mass: 10 }, preconditions: ['p_ready'] }],
    },
    { id: 'zone', kind: 'container', opaque: false },
    { id: 'room', kind: 'region' },
  ],
  containment: [
    { inner: 'parcel', outer: 'zone' },
    { inner: 'zone', outer: 'room' },
    { inner: 'agent', outer: 'room' },
  ],
  propositions: [{ id: 'p_ready', holds: true }],
  norm: { force: 'O' },
  commitment: { promisee: 'mara' },
  time: { now: 2, deadline: 5 },
  query: { agent: 'agent', action: 'deliver', object: 'parcel', intended_recipient: 'mara' },
};

function compositionVariant(mutator: (ir: UAALCompositionIR) => void): UAALCompositionIR {
  const next = cloneFixture(baseComposition);
  mutator(next);
  return next;
}

const compositionRows = [
  row<UAALCompositionIR, UAALCompositionMetadata>(cloneFixture(baseComposition), {
    id: 'dischargeable',
    dischargeable: true,
  }),
  row<UAALCompositionIR, UAALCompositionMetadata>(
    compositionVariant((ir) => {
      ir.norm = { force: 'P' };
    }),
    { id: 'blocked_norm', dischargeable: false, block_reason: 'norm' }
  ),
  row<UAALCompositionIR, UAALCompositionMetadata>(
    compositionVariant((ir) => {
      ir.query = { ...(ir.query || {}), intended_recipient: 'nox' };
    }),
    { id: 'blocked_counterparty', dischargeable: false, block_reason: 'counterparty' }
  ),
  row<UAALCompositionIR, UAALCompositionMetadata>(
    compositionVariant((ir) => {
      const agent = ir.entities?.find((entity) => entity.id === 'agent');
      if (agent?.body) agent.body.lift = 5;
    }),
    { id: 'blocked_affordance', dischargeable: false, block_reason: 'affordance' }
  ),
  row<UAALCompositionIR, UAALCompositionMetadata>(
    compositionVariant((ir) => {
      const zone = ir.entities?.find((entity) => entity.id === 'zone');
      if (zone) zone.opaque = true;
    }),
    { id: 'blocked_occlusion', dischargeable: false, block_reason: 'occlusion' }
  ),
  row<UAALCompositionIR, UAALCompositionMetadata>(
    compositionVariant((ir) => {
      ir.time = { now: 8, deadline: 5 };
    }),
    { id: 'blocked_deadline', dischargeable: false, block_reason: 'deadline' }
  ),
];

describe('semantic composition harness', () => {
  it('recovers one dischargeability verdict from multiple primitives', () => {
    expect(recoverDischargeable(baseComposition)).toEqual({ dischargeable: true, reasons: [] });
    expect(
      recoverDischargeable(JSON.parse(compositionRows[4].completion as string) as UAALCompositionIR)
    ).toEqual({
      dischargeable: false,
      reasons: ['occlusion'],
    });
  });

  it('passes the composition capstone and beats every single vertical', () => {
    const result = benchmarkComposition(compositionRows);
    expect(result.pass).toBe(true);
    expect(result.tests.it1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_best_single.edge).toBeGreaterThan(0);
  });
});

const baseMereologyParts = [
  { id: 'hull_a', role: 'hull', essential: true },
  { id: 'mast_a', role: 'mast', essential: true },
  { id: 'flag_a', role: 'flag', essential: false },
];

const baseMereologyPartOf = [
  { inner: 'hull_a', outer: 'ship' },
  { inner: 'mast_a', outer: 'ship' },
  { inner: 'flag_a', outer: 'ship' },
];

const mereologyRows = [
  row<UAALMereologyIR, UAALMereologyMetadata>(
    {
      parts: baseMereologyParts,
      part_of: baseMereologyPartOf,
      changes: [
        { op: 'remove', part: 'hull_a', role: 'hull', essential: true },
        { op: 'add', part: 'hull_b', role: 'hull', essential: true },
      ],
      query: { whole: 'ship' },
    },
    { id: 'theseus_swap', persists: true, dissolving_role: null }
  ),
  row<UAALMereologyIR, UAALMereologyMetadata>(
    {
      parts: baseMereologyParts,
      part_of: baseMereologyPartOf,
      changes: [{ op: 'remove', part: 'flag_a', role: 'flag', essential: false }],
      query: { whole: 'ship' },
    },
    { id: 'nonessential_removed', persists: true, dissolving_role: null }
  ),
  row<UAALMereologyIR, UAALMereologyMetadata>(
    {
      parts: baseMereologyParts,
      part_of: baseMereologyPartOf,
      changes: [{ op: 'remove', part: 'mast_a', role: 'mast', essential: true }],
      query: { whole: 'ship' },
    },
    { id: 'essential_unreplaced', persists: false, dissolving_role: 'mast' }
  ),
];

describe('semantic mereology harness', () => {
  it('recovers persistence through same-role replacement', () => {
    const theseus = JSON.parse(mereologyRows[0].completion as string) as UAALMereologyIR;

    expect(recoverPersistence(theseus)).toEqual({ persists: true, dissolving_role: null });
    expect(essentialismPersistence(theseus)).toEqual({ persists: false });
  });

  it('passes the mereology benchmark and beats essentialism', () => {
    const result = benchmarkMereology(mereologyRows);
    expect(result.pass).toBe(true);
    expect(result.tests.mp1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_essentialism.edge).toBeGreaterThan(0);
  });
});

const tensionRows = [
  row<UAALTensionIR, UAALTensionMetadata>(
    {
      nodes: [{ id: 'frontier' }, { id: 'win' }, { id: 'loss' }],
      terminals: [
        { id: 'win', outcome: 'goal' },
        { id: 'loss', outcome: 'antigoal' },
      ],
      unfired: [
        { from: 'frontier', to: 'win' },
        { from: 'frontier', to: 'loss' },
      ],
      query: { frontier: 'frontier' },
    },
    {
      id: 'open_tension',
      class: 'open_tension',
      tension: true,
      contradiction: { goal: 'win', antigoal: 'loss' },
    }
  ),
  row<UAALTensionIR, UAALTensionMetadata>(
    {
      nodes: [{ id: 'frontier' }, { id: 'win' }],
      terminals: [{ id: 'win', outcome: 'goal' }],
      unfired: [{ from: 'frontier', to: 'win' }],
      query: { frontier: 'frontier' },
    },
    { id: 'resolved_goal', class: 'resolved', tension: false, contradiction: null }
  ),
  row<UAALTensionIR, UAALTensionMetadata>(
    {
      nodes: [{ id: 'frontier' }, { id: 'win_a' }, { id: 'win_b' }],
      terminals: [
        { id: 'win_a', outcome: 'goal' },
        { id: 'win_b', outcome: 'goal' },
      ],
      unfired: [
        { from: 'frontier', to: 'win_a' },
        { from: 'frontier', to: 'win_b' },
      ],
      query: { frontier: 'frontier' },
    },
    { id: 'foregone_many_branches', class: 'foregone', tension: false, contradiction: null }
  ),
];

describe('semantic tension harness', () => {
  it('reads contradictory reachable terminals instead of branch count', () => {
    const foregone = JSON.parse(tensionRows[2].completion as string) as UAALTensionIR;

    expect(recoverTension(foregone).tension).toBe(false);
    expect(branchCountTension(foregone).tension).toBe(true);
  });

  it('passes the tension benchmark and beats branch count', () => {
    const result = benchmarkTension(tensionRows);
    expect(result.pass).toBe(true);
    expect(result.tests.nt1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_branchcount.edge).toBeGreaterThan(0);
  });
});

function analogyIR(
  mapping: Array<{ from: string; to: string }>,
  targetRelations: Array<{ pred: string; from: string; to: string }>,
  attrs = true
): UAALAnalogyIR {
  return {
    source: {
      entities: [
        { id: 'src_center', attrs: attrs ? ['shared_center'] : [] },
        { id: 'src_orbiter', attrs: attrs ? ['shared_orbiter'] : [] },
      ],
      relations: [
        { pred: 'attracts', from: 'src_center', to: 'src_orbiter' },
        { pred: 'orbits', from: 'src_orbiter', to: 'src_center' },
      ],
    },
    target: {
      entities: [
        { id: 'tgt_center', attrs: attrs ? ['shared_center'] : [] },
        { id: 'tgt_orbiter', attrs: attrs ? ['shared_orbiter'] : [] },
      ],
      relations: targetRelations,
    },
    mapping,
  };
}

const analogyValidRelations = [
  { pred: 'attracts', from: 'tgt_center', to: 'tgt_orbiter' },
  { pred: 'orbits', from: 'tgt_orbiter', to: 'tgt_center' },
];

const analogyRows = [
  row<UAALAnalogyIR, UAALAnalogyMetadata>(
    analogyIR(
      [
        { from: 'src_center', to: 'tgt_center' },
        { from: 'src_orbiter', to: 'tgt_orbiter' },
      ],
      analogyValidRelations
    ),
    {
      id: 'relational_valid',
      class: 'relational_valid',
      valid: true,
      preserved_relations: 2,
      required_relations: 2,
    }
  ),
  row<UAALAnalogyIR, UAALAnalogyMetadata>(
    {
      ...analogyIR(
        [
          { from: 'src_center', to: 'tgt_orbiter' },
          { from: 'src_orbiter', to: 'tgt_center' },
        ],
        analogyValidRelations,
        true
      ),
      target: {
        entities: [
          { id: 'tgt_center', attrs: ['shared_orbiter'] },
          { id: 'tgt_orbiter', attrs: ['shared_center'] },
        ],
        relations: analogyValidRelations,
      },
    },
    {
      id: 'attribute_only',
      class: 'attribute_only',
      valid: false,
      preserved_relations: 0,
      required_relations: 2,
    }
  ),
  row<UAALAnalogyIR, UAALAnalogyMetadata>(
    analogyIR(
      [
        { from: 'src_center', to: 'tgt_center' },
        { from: 'src_orbiter', to: 'tgt_orbiter' },
      ],
      [{ pred: 'attracts', from: 'tgt_center', to: 'tgt_orbiter' }]
    ),
    {
      id: 'partial_break',
      class: 'partial_break',
      valid: false,
      preserved_relations: 1,
      required_relations: 2,
    }
  ),
  row<UAALAnalogyIR, UAALAnalogyMetadata>(
    analogyIR(
      [
        { from: 'src_center', to: 'tgt_center' },
        { from: 'src_orbiter', to: 'tgt_orbiter' },
      ],
      analogyValidRelations,
      false
    ),
    {
      id: 'systematic_valid',
      class: 'systematic_valid',
      valid: true,
      preserved_relations: 2,
      required_relations: 2,
    }
  ),
];

describe('semantic analogy harness', () => {
  it('validates relation preservation instead of surface similarity', () => {
    const attributeOnly = JSON.parse(analogyRows[1].completion as string) as UAALAnalogyIR;

    expect(recoverValidity(attributeOnly).valid).toBe(false);
    expect(surfaceSimilarityValidity(attributeOnly).valid).toBe(true);
  });

  it('passes the analogy benchmark and beats surface similarity', () => {
    const result = benchmarkAnalogy(analogyRows);
    expect(result.pass).toBe(true);
    expect(result.tests.an1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_surface.edge).toBeGreaterThan(0);
  });
});

const presuppositionRows = [
  row<UAALPresuppositionIR, UAALPresuppositionMetadata>(
    {
      forms: [
        { form: 'asserted', atoms: ['has_king', 'is_bald'] },
        { form: 'negated', atoms: ['has_king'] },
        { form: 'modal', atoms: ['has_king'] },
        { form: 'question', atoms: ['has_king'] },
      ],
      query: { atoms: ['has_king', 'is_bald'] },
    },
    { id: 'king_projection', atom_status: { has_king: 'presupposed', is_bald: 'at_issue' } }
  ),
];

describe('semantic presupposition harness', () => {
  it('splits presupposed content from at-issue content by projection', () => {
    const projection = JSON.parse(
      presuppositionRows[0].completion as string
    ) as UAALPresuppositionIR;

    expect(recoverAtomStatus(projection, 'has_king')).toEqual({ status: 'presupposed' });
    expect(recoverAtomStatus(projection, 'is_bald')).toEqual({ status: 'at_issue' });
  });

  it('passes the presupposition benchmark and beats surface presence', () => {
    const result = benchmarkPresupposition(presuppositionRows);
    expect(result.pass).toBe(true);
    expect(result.tests.pt1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_surface.edge).toBeGreaterThan(0);
  });
});

function motifComponent(id: string, noun: string, edgeType = 'guards'): UAALMotifComponent {
  return {
    id,
    nodes: [
      { id: `${id}_actor`, role: 'actor', label: noun },
      { id: `${id}_object`, role: 'object', label: `${noun}-object` },
    ],
    edges: [{ from: `${id}_actor`, to: `${id}_object`, type: edgeType }],
  };
}

const motifRows = [
  row<UAALMotifIR, UAALMotifMetadata>(
    {
      components: [motifComponent('a', 'key'), motifComponent('b', 'key')],
    },
    { id: 'motif_present', has_motif: true, recurrence_count: 2 }
  ),
  row<UAALMotifIR, UAALMotifMetadata>(
    {
      components: [motifComponent('a', 'crown', 'guards'), motifComponent('b', 'crown', 'feeds')],
    },
    { id: 'lexical_only', has_motif: false, recurrence_count: 0 }
  ),
  row<UAALMotifIR, UAALMotifMetadata>(
    {
      components: [motifComponent('a', 'river'), motifComponent('b', 'mirror')],
    },
    { id: 'relabelled_isomorphs', has_motif: true, recurrence_count: 2 }
  ),
  row<UAALMotifIR, UAALMotifMetadata>(
    {
      components: [motifComponent('a', 'stone', 'guards'), motifComponent('b', 'moon', 'feeds')],
    },
    { id: 'no_motif', has_motif: false, recurrence_count: 0 }
  ),
];

describe('semantic motif harness', () => {
  it('recovers typed skeleton recurrence instead of repeated words', () => {
    const lexicalOnly = JSON.parse(motifRows[1].completion as string) as UAALMotifIR;

    expect(recoverMotif(lexicalOnly).has_motif).toBe(false);
    expect(lexicalRecurrence(lexicalOnly).has_motif).toBe(true);
    expect(canonicalForm(motifComponent('x', 'word'))).toBe('actor--guards-->object');
  });

  it('passes the motif benchmark and beats lexical recurrence', () => {
    const result = benchmarkMotif(motifRows);
    expect(result.pass).toBe(true);
    expect(result.tests.tm1_discrimination.rate).toBe(1);
    expect(result.tests.emergent_beats_lexical.edge).toBeGreaterThan(0);
  });
});
