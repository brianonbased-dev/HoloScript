import { describe, expect, it } from 'vitest';
import {
  resolveOcclusion,
  resolveNormStatus,
  resolveDischargeable,
  resolveCounterfactual,
  recoverNecessity,
  naiveParentNecessity,
  resolveMereology,
  resolveTension,
  resolveAtomStatus,
  resolveAccess,
  type UAALContainmentIR,
  type UAALDeonticIR,
  type UAALCompositionIR,
  type UAALCounterfactualIR,
  type UAALMereologyIR,
  type UAALTensionIR,
  type UAALPresuppositionIR,
} from '../semantic';

// The gap-aware layer (the "three-body disposition" verifier): resolve* must DERIVE unresolvability from the
// IR structure — distinguishing "unstated" from "false", a genuine dilemma from a single norm, and a discharge
// cycle from an ordinary block — while never flipping a determinate IR to a false gap.

describe('resolveOcclusion — underdetermined opacity', () => {
  const base = (opaqueBox: boolean | undefined): UAALContainmentIR => ({
    entities: [
      { id: 'agent', kind: 'agent' },
      { id: 'coin', kind: 'object' },
      // opaque field is included only when defined — undefined means the KEY is absent (unstated)
      { id: 'box', kind: 'container', ...(opaqueBox === undefined ? {} : { opaque: opaqueBox }) },
      { id: 'room', kind: 'region' },
    ],
    containment: [
      { inner: 'coin', outer: 'box' },
      { inner: 'box', outer: 'room' },
      { inner: 'agent', outer: 'room' },
    ],
    query: { agent: 'agent', object: 'coin' },
  });

  it('resolves occluded:true when a stated-opaque container lies between', () => {
    const r = resolveOcclusion(base(true), 'agent', 'coin');
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ occluded: true, occluder: 'box' });
  });

  it('resolves occluded:false when the container is EXPLICITLY transparent', () => {
    const r = resolveOcclusion(base(false), 'agent', 'coin');
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ occluded: false, occluder: null });
  });

  it('flags UNDETERMINED when the container opacity is UNSTATED (the key blindness recoverOcclusion cannot see)', () => {
    const r = resolveOcclusion(base(undefined), 'agent', 'coin');
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('underdetermined');
    expect(r.obstruction).toContain('box');
  });

  it('resolves occluded:false when the agent shares the enclosure (no boundary between)', () => {
    const ir: UAALContainmentIR = {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'coin', kind: 'object' },
        { id: 'box', kind: 'container' }, // opacity unstated, but agent is INSIDE the box so it never matters
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'coin', outer: 'box' },
        { inner: 'agent', outer: 'box' },
        { inner: 'box', outer: 'room' },
      ],
      query: { agent: 'agent', object: 'coin' },
    };
    const r = resolveOcclusion(ir, 'agent', 'coin');
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ occluded: false, occluder: null });
  });
});

describe('resolveNormStatus — unprioritized conflict', () => {
  it('flags a dilemma: opposing force (O vs F) on the same act, no precedence', () => {
    const ir: UAALDeonticIR = {
      norms: [
        { id: 'must_administer', force: 'O', required_act: 'administer', active: true },
        { id: 'must_not_administer', force: 'F', required_act: 'administer', active: true },
      ],
    };
    const r = resolveNormStatus(ir, 'must_administer');
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('unprioritized_conflict');
  });

  it('resolves when a precedence field breaks the same conflict', () => {
    const ir = {
      precedence: ['must_administer'],
      norms: [
        { id: 'must_administer', force: 'O', required_act: 'administer', active: true },
        { id: 'must_not_administer', force: 'F', required_act: 'administer', active: true },
      ],
    } as UAALDeonticIR;
    const r = resolveNormStatus(ir, 'must_administer');
    expect(r.status).toBe('resolved');
  });

  it('does NOT flag opposing norms on DIFFERENT acts (no genuine conflict)', () => {
    const ir: UAALDeonticIR = {
      norms: [
        { id: 'must_file', force: 'O', required_act: 'file', active: true },
        { id: 'must_not_shred', force: 'F', required_act: 'shred', active: true },
      ],
    };
    expect(resolveNormStatus(ir, 'must_file').status).toBe('resolved');
  });

  it('resolves a single obligation with no fulfilling event to violated', () => {
    const ir: UAALDeonticIR = { norms: [{ id: 'must_file', force: 'O', required_act: 'file', active: true }] };
    const r = resolveNormStatus(ir, 'must_file');
    expect(r.status).toBe('resolved');
    expect(r.answer?.status).toBe('violated');
  });

  it('flags a resource-contention dilemma: two obligations for one scarce resource, no precedence', () => {
    // One ambulance owed to two emergencies — both obligations (force O), distinct acts, one shared resource.
    // The O/F same-act detector cannot see this; the resource-contention detector must.
    const ir: UAALDeonticIR = {
      norms: [
        { id: 'owe_scene_a', force: 'O', required_act: 'respond_to_scene_a', resource: 'ambulance_7', active: true },
        { id: 'owe_scene_b', force: 'O', required_act: 'respond_to_scene_b', resource: 'ambulance_7', active: true },
      ],
    };
    const r = resolveNormStatus(ir, 'owe_scene_a');
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('unprioritized_conflict');
    expect(r.obstruction).toContain('ambulance_7');
  });

  it('resolves resource contention when a precedence field ranks the obligations', () => {
    const ir = {
      precedence: ['owe_scene_a'],
      norms: [
        { id: 'owe_scene_a', force: 'O', required_act: 'respond_to_scene_a', resource: 'ambulance_7', active: true },
        { id: 'owe_scene_b', force: 'O', required_act: 'respond_to_scene_b', resource: 'ambulance_7', active: true },
      ],
    } as UAALDeonticIR;
    expect(resolveNormStatus(ir, 'owe_scene_a').status).toBe('resolved');
  });

  it('does NOT flag two obligations on DIFFERENT resources (no contention, no false gap)', () => {
    const ir: UAALDeonticIR = {
      norms: [
        { id: 'owe_scene_a', force: 'O', required_act: 'respond_to_scene_a', resource: 'ambulance_7', active: true },
        { id: 'owe_scene_b', force: 'O', required_act: 'respond_to_scene_b', resource: 'ambulance_9', active: true },
      ],
    };
    expect(resolveNormStatus(ir, 'owe_scene_a').status).toBe('resolved');
  });
});

describe('resolveDischargeable — cyclic dependency and missing precondition', () => {
  it('flags a discharge CYCLE (the three-body case)', () => {
    const ir: UAALCompositionIR = {
      dependencies: [
        { before: 'B', after: 'A' },
        { before: 'C', after: 'B' },
        { before: 'A', after: 'C' },
      ],
    };
    const r = resolveDischargeable(ir);
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('cyclic_dependency');
    expect(r.obstruction).toContain('cycle');
  });

  it('resolves an ACYCLIC dependency chain (the two-body sub-case)', () => {
    const ir: UAALCompositionIR = {
      dependencies: [
        { before: 'A', after: 'B' },
        { before: 'B', after: 'C' },
      ],
      time: { now: 1, deadline: 10 },
    };
    expect(resolveDischargeable(ir).status).toBe('resolved');
  });

  it('flags MISSING precondition when a time constraint is present but empty', () => {
    const ir: UAALCompositionIR = { time: {} };
    const r = resolveDischargeable(ir);
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('missing_precondition');
  });

  it('resolves an ordinary composition IR with stated time and no dependencies', () => {
    const ir: UAALCompositionIR = {
      query: { agent: 'robot', action: 'deliver', object: 'box' },
      time: { now: 1, deadline: 10 },
    };
    expect(resolveDischargeable(ir).status).toBe('resolved');
  });

  it('flags MISSING precondition when an affordance requires a magnitude absent from the IR', () => {
    // The offer requires reach=2, but the agent body never states a `reach` — the capability check can only
    // DEFAULT to false, it cannot be evaluated. That is a gap, not a determinate block.
    const ir: UAALCompositionIR = {
      entities: [
        { id: 'robot', kind: 'agent', body: {} },
        { id: 'box', kind: 'object', offers: [{ action: 'deliver', requires: { reach: 2 } }] },
      ],
      query: { agent: 'robot', action: 'deliver', object: 'box' },
      time: { now: 1, deadline: 10 },
    };
    const r = resolveDischargeable(ir);
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('missing_precondition');
    expect(r.obstruction).toContain('reach');
  });

  it('resolves when the required affordance magnitude IS supplied (determinate, even if insufficient)', () => {
    // reach is stated (1.5) but below the required 2 — a genuine capability block, fully determinate, so the
    // query resolves (dischargeable=false) rather than flipping to a false gap.
    const ir: UAALCompositionIR = {
      entities: [
        { id: 'robot', kind: 'agent', body: { reach: 1.5 } },
        { id: 'box', kind: 'object', offers: [{ action: 'deliver', requires: { reach: 2 } }] },
      ],
      query: { agent: 'robot', action: 'deliver', object: 'box' },
      time: { now: 1, deadline: 10 },
    };
    expect(resolveDischargeable(ir).status).toBe('resolved');
  });
});

describe('resolveCounterfactual — non-identifiable causal cycle', () => {
  it('resolves necessity for a determinate single producer (acyclic)', () => {
    const ir: UAALCounterfactualIR = {
      effects: [{ id: 'E', sufficientSets: [['A']] }],
      occurs: ['A'],
      query: { effect: 'E' },
    };
    const r = resolveCounterfactual(ir);
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ E: { A: true } });
  });

  it('resolves overdetermination (neither cause necessary) without a false gap', () => {
    const ir: UAALCounterfactualIR = {
      effects: [{ id: 'E', sufficientSets: [['A'], ['B']] }],
      occurs: ['A', 'B'],
      query: { effect: 'E' },
    };
    const r = resolveCounterfactual(ir);
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ E: { A: false, B: false } });
  });

  it('resolves an acyclic production CHAIN (both links necessary)', () => {
    const ir: UAALCounterfactualIR = {
      effects: [
        { id: 'E', sufficientSets: [['M']] },
        { id: 'M', sufficientSets: [['A']] },
      ],
      occurs: ['A'],
      query: { effect: 'E' },
    };
    expect(resolveCounterfactual(ir).status).toBe('resolved');
  });

  it('flags an UNGROUNDED production cycle (necessity has no consistent grounding order)', () => {
    // E is produced by A, A is produced by E, and neither independently occurs. holds() breaks this with
    // an arbitrary guard and recoverNecessity would emit a definite verdict for an ungrounded fixpoint.
    // The honest answer is abstain.
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
    expect(r.gap?.code).toBe('counterfactual.non_identifiable_cycle');
    expect(r.obstruction).toContain('E');
  });

  it('recoverNecessity / naiveParentNecessity TERMINATE on cyclic input (visited-guard regression)', () => {
    // Direct-recognizer calls, bypassing resolveCounterfactual's abstention. Before the visited guard,
    // collectCounterfactualProducers recursed E→A→E→… and stack-overflowed — any DIRECT caller crashed on
    // cyclic specs. This pins termination only; the verdict on cyclic input stays ungrounded, which is
    // exactly why resolveCounterfactual (the honest layer) abstains instead of answering.
    const ir: UAALCounterfactualIR = {
      effects: [
        { id: 'E', sufficientSets: [['A']] },
        { id: 'A', sufficientSets: [['E']] },
      ],
      occurs: [],
      query: { effect: 'E' },
    };
    const necessity = recoverNecessity(ir);
    expect(new Set(Object.keys(necessity.E))).toEqual(new Set(['A', 'E']));
    const naive = naiveParentNecessity(ir);
    expect(new Set(Object.keys(naive.E))).toEqual(new Set(['A', 'E']));
  });

  it('does NOT flag an acyclic effect-to-effect DAG (a diamond) as a cycle (no false gap)', () => {
    // E ← (P or Q), P ← A, Q ← A. Effects reference other effects, but the graph is an acyclic DAG with a
    // shared sub-cause — no directed cycle, so it must resolve, not flip to a spurious gap.
    const ir: UAALCounterfactualIR = {
      effects: [
        { id: 'E', sufficientSets: [['P'], ['Q']] },
        { id: 'P', sufficientSets: [['A']] },
        { id: 'Q', sufficientSets: [['A']] },
      ],
      occurs: ['A'],
      query: { effect: 'E' },
    };
    expect(resolveCounterfactual(ir).status).toBe('resolved');
  });
});

describe('resolveMereology — unstated essentiality', () => {
  it('resolves persists:false for a stated-essential, unreplaced removal', () => {
    const ir: UAALMereologyIR = {
      changes: [{ op: 'remove', part: 'mast_a', role: 'mast', essential: true }],
      query: { whole: 'ship' },
    };
    const r = resolveMereology(ir);
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ persists: false, dissolving_role: 'mast' });
  });

  it('resolves persists:true for a stated-NON-essential removal', () => {
    const ir: UAALMereologyIR = {
      changes: [{ op: 'remove', part: 'flag_a', role: 'flag', essential: false }],
      query: { whole: 'ship' },
    };
    const r = resolveMereology(ir);
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ persists: true, dissolving_role: null });
  });

  it('resolves persists:true when an essential part is removed AND replaced (Ship of Theseus)', () => {
    const ir: UAALMereologyIR = {
      changes: [
        { op: 'remove', part: 'hull_a', role: 'hull', essential: true },
        { op: 'add', part: 'hull_b', role: 'hull', essential: true },
      ],
      query: { whole: 'ship' },
    };
    expect(resolveMereology(ir).status).toBe('resolved');
  });

  it('flags UNRESOLVABLE when an unreplaced removal has UNSTATED essentiality', () => {
    // essential is absent — recoverPersistence coerces it to false (persists), but the whole actually
    // survives iff the part is inessential and dissolves iff it is essential. The IR does not say which.
    const ir: UAALMereologyIR = {
      changes: [{ op: 'remove', part: 'keel_a', role: 'keel' }],
      query: { whole: 'ship' },
    };
    const r = resolveMereology(ir);
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('missing_precondition');
    expect(r.gap?.code).toBe('mereology.unstated_essentiality');
    expect(r.obstruction).toContain('keel_a');
  });

  it('does NOT flag an unstated-essentiality removal that IS replaced (no false gap)', () => {
    const ir: UAALMereologyIR = {
      changes: [
        { op: 'remove', part: 'keel_a', role: 'keel' },
        { op: 'add', part: 'keel_b', role: 'keel' },
      ],
      query: { whole: 'ship' },
    };
    expect(resolveMereology(ir).status).toBe('resolved');
  });

  it('does NOT flag when another removal already definitively dissolves the whole (determinate)', () => {
    // rope essentiality is unstated, but mast is stated-essential and unreplaced — the whole dissolves
    // regardless of the rope, so the query is determinate (persists:false), not a gap.
    const ir: UAALMereologyIR = {
      changes: [
        { op: 'remove', part: 'mast_a', role: 'mast', essential: true },
        { op: 'remove', part: 'rope_a', role: 'rope' },
      ],
      query: { whole: 'ship' },
    };
    const r = resolveMereology(ir);
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ persists: false, dissolving_role: 'mast' });
  });
});

describe('resolveTension — unstated terminal outcome', () => {
  const tie = (terminals: Array<{ id: string; outcome?: string }>): UAALTensionIR => ({
    terminals,
    unfired: terminals.map((t) => ({ from: 'F', to: t.id })),
    frontier: 'F',
    query: { frontier: 'F' },
  });

  it('resolves tension:true when both a goal and an antigoal terminal are reached', () => {
    const r = resolveTension(tie([{ id: 'T1', outcome: 'goal' }, { id: 'T2', outcome: 'antigoal' }]));
    expect(r.status).toBe('resolved');
    expect(r.answer).toMatchObject({ tension: true, contradiction: { goal: 'T1', antigoal: 'T2' } });
  });

  it('resolves tension:false when the reached outcomes are stated and lack a pole', () => {
    const r = resolveTension(tie([{ id: 'T1', outcome: 'goal' }, { id: 'T2', outcome: 'neutral' }]));
    expect(r.status).toBe('resolved');
    expect(r.answer).toMatchObject({ tension: false });
  });

  it('flags UNRESOLVABLE when a stated goal is reached alongside an UNSTATED-outcome terminal', () => {
    const r = resolveTension(tie([{ id: 'T1', outcome: 'goal' }, { id: 'T2' }]));
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('missing_precondition');
    expect(r.gap?.code).toBe('tension.unstated_outcome');
    expect(r.obstruction).toContain('T2');
  });

  it('flags UNRESOLVABLE when neither pole is stated but two unstated terminals could supply both', () => {
    const r = resolveTension(tie([{ id: 'T1' }, { id: 'T2' }]));
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('missing_precondition');
  });

  it('does NOT flag a single unstated terminal with neither pole (cannot supply both — no false gap)', () => {
    expect(resolveTension(tie([{ id: 'T1' }])).status).toBe('resolved');
  });

  it('does NOT flag when both poles are already reached even with an extra unstated terminal', () => {
    const r = resolveTension(tie([{ id: 'T1', outcome: 'goal' }, { id: 'T2', outcome: 'antigoal' }, { id: 'T3' }]));
    expect(r.status).toBe('resolved');
    expect(r.answer).toMatchObject({ tension: true });
  });
});

describe('resolveAtomStatus — missing embedded forms', () => {
  const projected: UAALPresuppositionIR = {
    forms: [
      { form: 'asserted', atoms: ['has_king', 'is_bald'] },
      { form: 'negated', atoms: ['has_king'] },
      { form: 'modal', atoms: ['has_king'] },
      { form: 'question', atoms: ['has_king'] },
    ],
    query: { atoms: ['has_king', 'is_bald'] },
  };

  it('resolves presupposed for an atom that survives every embedded form', () => {
    const r = resolveAtomStatus(projected, 'has_king');
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ status: 'presupposed' });
  });

  it('resolves at_issue for an atom dropped by a stated embedded form (closed-world per form — no false gap)', () => {
    // is_bald is asserted but absent from the stated negated/modal/question forms: the forms EXIST
    // and omit it, which is definite non-survival (the pt4 falsification flip is built on exactly
    // this semantics) — determinate at_issue, never a gap.
    const r = resolveAtomStatus(projected, 'is_bald');
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ status: 'at_issue' });
  });

  it('abstains when an asserted atom has NO embedded forms to project through', () => {
    const assertedOnly: UAALPresuppositionIR = {
      forms: [{ form: 'asserted', atoms: ['has_king'] }],
      query: { atoms: ['has_king'] },
    };
    const r = resolveAtomStatus(assertedOnly, 'has_king');
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('underdetermined');
    expect(r.gap?.code).toBe('presupposition.no_embedded_forms');
    expect(r.obstruction).toContain('has_king');
  });

  it('resolves at_issue for an UNASSERTED atom even with zero embedded forms (no false gap)', () => {
    // Unasserted content is never presupposed content — determinate regardless of embedding data,
    // so the zero-embedded trigger must not fire.
    const assertedOnly: UAALPresuppositionIR = {
      forms: [{ form: 'asserted', atoms: ['other_atom'] }],
      query: { atoms: ['has_king'] },
    };
    const r = resolveAtomStatus(assertedOnly, 'has_king');
    expect(r.status).toBe('resolved');
    expect(r.answer).toEqual({ status: 'at_issue' });
  });
});

describe('resolveAccess — per-modality unstated blocking (A6 blocks_unknown IR extension)', () => {
  // agent and object share `room`; `barrier` sits between object and agent.
  const scene = (barrier: Record<string, unknown>): UAALContainmentIR => ({
    entities: [
      { id: 'agent', kind: 'agent' },
      { id: 'bell', kind: 'object' },
      { id: 'barrier', kind: 'container', ...barrier },
      { id: 'room', kind: 'region' },
    ],
    containment: [
      { inner: 'bell', outer: 'barrier' },
      { inner: 'barrier', outer: 'room' },
      { inner: 'agent', outer: 'room' },
    ],
    query: { agent: 'agent', object: 'bell' },
  });

  it('resolves definite per-modality blocking (stated blocks; opaque:false clears visual)', () => {
    const r = resolveAccess(scene({ blocks: ['audible'], opaque: false }), 'agent', 'bell');
    expect(r.status).toBe('resolved');
    expect(r.answer?.access).toEqual({ visual: true, audible: false });
  });

  it('resolves all-clear when the barrier states full transparency', () => {
    const r = resolveAccess(scene({ blocks: [], opaque: false }), 'agent', 'bell');
    expect(r.status).toBe('resolved');
    expect(r.answer?.access).toEqual({ visual: true, audible: true });
  });

  it('abstains when the barrier declares blocks_unknown for audible', () => {
    const r = resolveAccess(scene({ blocks: [], opaque: false, blocks_unknown: ['audible'] }), 'agent', 'bell');
    expect(r.status).toBe('unresolvable');
    expect(r.reason).toBe('underdetermined');
    expect(r.gap?.code).toBe('access.underdetermined_modality');
    expect(r.gap?.evidence).toBe('audible@barrier');
    expect(r.obstruction).toContain('audible');
  });

  it('abstains on visual when opacity is unstated (mirrors resolveOcclusion — never contradicts it)', () => {
    const ir = scene({ blocks: [] }); // opaque absent, audible definitely clear
    const acc = resolveAccess(ir, 'agent', 'bell');
    const occ = resolveOcclusion(ir, 'agent', 'bell');
    expect(acc.status).toBe('unresolvable');
    expect(acc.gap?.evidence).toBe('visual@barrier');
    expect(occ.status).toBe('unresolvable'); // same IR, same verdict class on the visual axis
  });

  it('no false gap: a definite blocker settles the modality even with a farther unknown container', () => {
    // barrier definitely blocks audible; the outer wrap's audible behavior is unstated — irrelevant,
    // audible is already settled blocked before the unknown is reached.
    const ir: UAALContainmentIR = {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'bell', kind: 'object' },
        { id: 'barrier', kind: 'container', blocks: ['audible', 'visual'] },
        { id: 'wrap', kind: 'container', opaque: false, blocks_unknown: ['audible'] },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'bell', outer: 'barrier' },
        { inner: 'barrier', outer: 'wrap' },
        { inner: 'wrap', outer: 'room' },
        { inner: 'agent', outer: 'room' },
      ],
      query: { agent: 'agent', object: 'bell' },
    };
    const r = resolveAccess(ir, 'agent', 'bell');
    expect(r.status).toBe('resolved');
    expect(r.answer?.access).toEqual({ visual: false, audible: false });
  });

  it('no false gap: an unknown container OUTSIDE the agent→object segment is never examined', () => {
    // The unknown-audible box wraps BOTH agent and object — the walk breaks at the shared
    // enclosure before reaching it, so the query stays determinate.
    const ir: UAALContainmentIR = {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'bell', kind: 'object' },
        { id: 'shared', kind: 'container', blocks_unknown: ['audible'] },
      ],
      containment: [
        { inner: 'bell', outer: 'shared' },
        { inner: 'agent', outer: 'shared' },
      ],
      query: { agent: 'agent', object: 'bell' },
    };
    const r = resolveAccess(ir, 'agent', 'bell');
    expect(r.status).toBe('resolved');
    expect(r.answer?.access).toEqual({ visual: true, audible: true });
  });

  it('no false gap: opaque:true is a definite VISUAL blocker even without blocks (occlusion parity)', () => {
    const r = resolveAccess(scene({ opaque: true, blocks: [] }), 'agent', 'bell');
    expect(r.status).toBe('resolved');
    expect(r.answer?.access.visual).toBe(false);
  });
});

describe('no false gaps', () => {
  it('every determinate query resolves (never a spurious unresolvable)', () => {
    const occ = resolveOcclusion(
      {
        entities: [
          { id: 'a', kind: 'agent' },
          { id: 'o', kind: 'object' },
          { id: 'c', kind: 'container', opaque: false },
        ],
        containment: [{ inner: 'o', outer: 'c' }, { inner: 'a', outer: 'c' }],
        query: { agent: 'a', object: 'o' },
      },
      'a',
      'o',
    );
    const norm = resolveNormStatus({ norms: [{ id: 'n', force: 'O', required_act: 'act', active: true }] }, 'n');
    const disc = resolveDischargeable({ time: { now: 0, deadline: 5 } });
    const cf = resolveCounterfactual({
      effects: [{ id: 'E', sufficientSets: [['A']] }],
      occurs: ['A'],
      query: { effect: 'E' },
    });
    const mer = resolveMereology({
      changes: [{ op: 'remove', part: 'flag_a', role: 'flag', essential: false }],
      query: { whole: 'ship' },
    });
    const ten = resolveTension({
      terminals: [{ id: 'T1', outcome: 'goal' }, { id: 'T2', outcome: 'antigoal' }],
      unfired: [{ from: 'F', to: 'T1' }, { from: 'F', to: 'T2' }],
      frontier: 'F',
      query: { frontier: 'F' },
    });
    const pre = resolveAtomStatus(
      {
        forms: [
          { form: 'asserted', atoms: ['p'] },
          { form: 'negated', atoms: ['p'] },
        ],
        query: { atoms: ['p'] },
      },
      'p',
    );
    const acc = resolveAccess(
      {
        entities: [
          { id: 'a', kind: 'agent' },
          { id: 'o', kind: 'object' },
          { id: 'c', kind: 'container', opaque: false, blocks: [] },
        ],
        containment: [{ inner: 'o', outer: 'c' }, { inner: 'a', outer: 'c' }],
        query: { agent: 'a', object: 'o' },
      },
      'a',
      'o',
    );
    expect([occ.status, norm.status, disc.status, cf.status, mer.status, ten.status, pre.status, acc.status]).toEqual([
      'resolved',
      'resolved',
      'resolved',
      'resolved',
      'resolved',
      'resolved',
      'resolved',
      'resolved',
    ]);
  });
});
