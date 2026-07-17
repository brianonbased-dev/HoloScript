import { describe, expect, it } from 'vitest';
import { resolveAffords, type UAALAffordanceIR } from '../semantic';

// resolveAffords — the embodiment-critical gap-aware resolver. It must distinguish an explicitly
// unsatisfied precondition/capability (resolved: does-not-afford) from an UNSTATED one (unresolvable),
// mirroring resolveOcclusion's opaque true/false/absent three-state.

const ir = (opts: {
  body?: Record<string, number>;
  offers: UAALAffordanceIR['entities'][number]['offers'];
  propositions?: Array<{ id: string; holds?: boolean }>;
  action?: string;
}): UAALAffordanceIR => ({
  entities: [
    { id: 'robot', kind: 'agent', body: opts.body },
    { id: 'handle', kind: 'object', offers: opts.offers },
  ],
  propositions: opts.propositions || [],
  query: { agent: 'robot', action: opts.action || 'grasp', object: 'handle' },
});

describe('resolveAffords — three-state preconditions & capabilities', () => {
  it('resolves affords when capability and precondition are explicitly satisfied', () => {
    const res = resolveAffords(
      ir({ body: { reach: 10 }, offers: [{ action: 'grasp', requires: { reach: 5 }, preconditions: ['powered'] }], propositions: [{ id: 'powered', holds: true }] }),
      'robot', 'grasp', 'handle',
    );
    expect(res.status).toBe('resolved');
    expect(res.answer?.affords).toBe(true);
  });

  it('resolves does-not-afford when a precondition is explicitly false', () => {
    const res = resolveAffords(
      ir({ offers: [{ action: 'grasp', preconditions: ['powered'] }], propositions: [{ id: 'powered', holds: false }] }),
      'robot', 'grasp', 'handle',
    );
    expect(res.status).toBe('resolved');
    expect(res.answer?.affords).toBe(false);
  });

  it('ABSTAINS when a required precondition is UNSTATED (not a silent block)', () => {
    const res = resolveAffords(
      ir({ offers: [{ action: 'grasp', preconditions: ['powered'] }], propositions: [] }),
      'robot', 'grasp', 'handle',
    );
    expect(res.status).toBe('unresolvable');
    expect(res.reason).toBe('missing_precondition');
    expect(res.gap?.code).toBe('affordance.unstated_precondition');
    expect(res.gap?.family).toBe('affordance');
    expect(res.gap?.evidence).toBe('powered');
  });

  it('ABSTAINS when a required capability is UNSTATED on the agent body', () => {
    const res = resolveAffords(
      ir({ body: {}, offers: [{ action: 'grasp', requires: { reach: 5 }, preconditions: [] }] }),
      'robot', 'grasp', 'handle',
    );
    expect(res.status).toBe('unresolvable');
    expect(res.gap?.code).toBe('affordance.unstated_capability');
    expect(res.gap?.evidence).toBe('reach');
  });

  it('resolves does-not-afford when a stated capability is insufficient', () => {
    const res = resolveAffords(
      ir({ body: { reach: 3 }, offers: [{ action: 'grasp', requires: { reach: 5 }, preconditions: ['powered'] }], propositions: [{ id: 'powered', holds: true }] }),
      'robot', 'grasp', 'handle',
    );
    expect(res.status).toBe('resolved');
    expect(res.answer?.affords).toBe(false);
  });

  it('resolves does-not-afford (no_offer) when the object offers no such action', () => {
    const res = resolveAffords(ir({ offers: [{ action: 'push' }] }), 'robot', 'grasp', 'handle');
    expect(res.status).toBe('resolved');
    expect(res.answer?.affords).toBe(false);
    expect(res.answer?.reason).toBe('no_offer');
  });

  it('ABSTAINS (conflict) when two offers for the action disagree with no precedence', () => {
    const res = resolveAffords(
      ir({
        offers: [
          { action: 'grasp', preconditions: ['p1'] },
          { action: 'grasp', preconditions: ['p2'] },
        ],
        propositions: [{ id: 'p1', holds: true }, { id: 'p2', holds: false }],
      }),
      'robot', 'grasp', 'handle',
    );
    expect(res.status).toBe('unresolvable');
    expect(res.reason).toBe('unprioritized_conflict');
    expect(res.gap?.code).toBe('affordance.conflicting_offers');
  });

  it('no false gaps: a fully-stated determinate scene resolves', () => {
    const res = resolveAffords(
      ir({ offers: [{ action: 'grasp', preconditions: ['powered'] }], propositions: [{ id: 'powered', holds: true }] }),
      'robot', 'grasp', 'handle',
    );
    expect(res.status).toBe('resolved');
    expect(res.gap).toBeUndefined();
  });
});
