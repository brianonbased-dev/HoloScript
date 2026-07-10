import { describe, expect, it } from 'vitest';
import {
  resolveOcclusion,
  resolveNormStatus,
  resolveDischargeable,
  type UAALContainmentIR,
  type UAALDeonticIR,
  type UAALCompositionIR,
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
    expect([occ.status, norm.status, disc.status]).toEqual(['resolved', 'resolved', 'resolved']);
  });
});
