import { describe, expect, it } from 'vitest';
import { resolveOcclusion, resolveNormStatus, resolveDischargeable } from '../semantic';
import type { UAALContainmentIR, UAALDeonticIR, UAALCompositionIR } from '../semantic';

/**
 * §4.2 regression guard (language-architecture.md §6.5, check:family-admission): the three
 * grandfathered families (occlusion / norm_status / dischargeable) must abstain with a
 * FAMILY-SCOPED gap code, not just a coarse base bucket. Added 2026-07-17 to enrich the
 * EXISTING abstention returns (the abstention CONDITION is unchanged — no false-gap). If any of
 * these gap codes disappears, check:family-admission --strict goes red; this pins them.
 */
describe('family-scoped gap codes — the §4.2 backlog, closed', () => {
  it('occlusion → occlusion.opacity_unstated on unstated container opacity', () => {
    const ir: UAALContainmentIR = {
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'coin', kind: 'object' },
        { id: 'box', kind: 'container' }, // opacity unstated
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'coin', outer: 'box' },
        { inner: 'box', outer: 'room' },
        { inner: 'agent', outer: 'room' },
      ],
      query: { agent: 'agent', object: 'coin' },
    };
    const r = resolveOcclusion(ir, 'agent', 'coin');
    expect(r.status).toBe('unresolvable');
    expect(r.gap?.code).toBe('occlusion.opacity_unstated');
    expect(r.gap?.family).toBe('occlusion');
    expect(r.gap?.base).toBe(r.reason);
  });

  it('norm_status → norm_status.opposing_force on an unprioritized O/F dilemma', () => {
    const ir: UAALDeonticIR = {
      norms: [
        { id: 'must_administer', force: 'O', required_act: 'administer', active: true },
        { id: 'must_not_administer', force: 'F', required_act: 'administer', active: true },
      ],
    };
    const r = resolveNormStatus(ir, 'must_administer');
    expect(r.status).toBe('unresolvable');
    expect(r.gap?.code).toBe('norm_status.opposing_force');
  });

  it('norm_status → norm_status.resource_contention on a scarce shared resource', () => {
    const ir: UAALDeonticIR = {
      norms: [
        { id: 'owe_scene_a', force: 'O', required_act: 'respond_to_scene_a', resource: 'ambulance_7', active: true },
        { id: 'owe_scene_b', force: 'O', required_act: 'respond_to_scene_b', resource: 'ambulance_7', active: true },
      ],
    };
    const r = resolveNormStatus(ir, 'owe_scene_a');
    expect(r.status).toBe('unresolvable');
    expect(r.gap?.code).toBe('norm_status.resource_contention');
  });

  it('dischargeable → dischargeable.cyclic_order on a discharge cycle', () => {
    const ir: UAALCompositionIR = {
      dependencies: [
        { before: 'B', after: 'A' },
        { before: 'C', after: 'B' },
        { before: 'A', after: 'C' },
      ],
    };
    const r = resolveDischargeable(ir);
    expect(r.status).toBe('unresolvable');
    expect(r.gap?.code).toBe('dischargeable.cyclic_order');
  });

  it('dischargeable → dischargeable.unstated_deadline when a deadline constrains but no time is stated', () => {
    const ir: UAALCompositionIR = { time: {} };
    const r = resolveDischargeable(ir);
    expect(r.status).toBe('unresolvable');
    expect(r.gap?.code).toBe('dischargeable.unstated_deadline');
  });
});
