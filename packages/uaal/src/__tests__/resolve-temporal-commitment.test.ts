import { describe, expect, it } from 'vitest';
import {
  resolveTemporal,
  resolveCommitment,
  type UAALTemporalIR,
  type UAALCommitmentIR,
} from '../semantic';

// resolveTemporal — belief-staleness is honest only when time is known. resolveCommitment — you
// cannot call a deadline missed without a clock. Both abstain on the exact time gaps recover* coerces.

describe('resolveTemporal — stale vs error needs the formation time', () => {
  const raining = (opts: {
    initial: boolean;
    changeAt?: number;
    changeTo?: boolean;
    belief?: { prop: boolean; t_formed?: number };
    t_now?: number;
  }): UAALTemporalIR => ({
    facts: [{ id: 'raining', initial: opts.initial }],
    events: opts.changeAt !== undefined
      ? [{ id: 'e1', world_change: true, fact: 'raining', t: opts.changeAt, sets: opts.changeTo }]
      : [],
    beliefs: opts.belief ? [{ id: 'b1', prop: opts.belief.prop, t_formed: opts.belief.t_formed }] : [],
    ...(opts.t_now !== undefined ? { t_now: opts.t_now } : {}),
    query: { belief: 'b1', fact: 'raining' },
  });

  it('resolves fresh when the belief matches the current fact', () => {
    const res = resolveTemporal(raining({ initial: true, belief: { prop: true, t_formed: 0 }, t_now: 10 }), 'b1', 'raining');
    expect(res.status).toBe('resolved');
    expect(res.answer?.status).toBe('fresh');
  });

  it('resolves stale when the belief was right at formation and the fact later changed', () => {
    const res = resolveTemporal(
      raining({ initial: true, changeAt: 5, changeTo: false, belief: { prop: true, t_formed: 0 }, t_now: 10 }),
      'b1', 'raining',
    );
    expect(res.status).toBe('resolved');
    expect(res.answer?.status).toBe('stale');
  });

  it('ABSTAINS when current time t_now is unstated', () => {
    const res = resolveTemporal(raining({ initial: true, belief: { prop: true, t_formed: 0 } }), 'b1', 'raining');
    expect(res.status).toBe('unresolvable');
    expect(res.reason).toBe('missing_precondition');
    expect(res.gap?.code).toBe('temporal.unstated_now');
  });

  it('ABSTAINS on stale-vs-error when the belief disagrees but formation time is unstated', () => {
    const res = resolveTemporal(
      raining({ initial: true, changeAt: 5, changeTo: false, belief: { prop: true }, t_now: 10 }),
      'b1', 'raining',
    );
    expect(res.status).toBe('unresolvable');
    expect(res.reason).toBe('underdetermined');
    expect(res.gap?.code).toBe('temporal.unstated_formation_time');
  });

  it('resolves unknown (determinate) when the belief is not held', () => {
    const res = resolveTemporal({ facts: [{ id: 'raining', initial: true }], beliefs: [], t_now: 10, query: { belief: 'b1', fact: 'raining' } }, 'b1', 'raining');
    expect(res.status).toBe('resolved');
    expect(res.answer?.status).toBe('unknown');
  });
});

describe('resolveCommitment — open vs broken needs a clock', () => {
  const commit = (opts: { due_time?: number; now?: number; paid?: number }): UAALCommitmentIR => ({
    commitments: [{ id: 'c1', promisor: 'alice', promisee: 'bob', pledged_act: { type: 'pay', recipient: 'bob' }, ...(opts.due_time !== undefined ? { due_time: opts.due_time } : {}) }],
    events: opts.paid !== undefined ? [{ id: 'ev', predicate: 'pay', recipient: 'bob', t: opts.paid }] : [],
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    query: { commitment: 'c1' },
  });

  it('resolves discharged when a fulfilling event exists', () => {
    const res = resolveCommitment(commit({ due_time: 10, paid: 5, now: 20 }), 'c1');
    expect(res.status).toBe('resolved');
    expect(res.answer?.status).toBe('discharged');
  });

  it('resolves broken when past the deadline with no fulfilment and a known clock', () => {
    const res = resolveCommitment(commit({ due_time: 10, now: 20 }), 'c1');
    expect(res.status).toBe('resolved');
    expect(res.answer?.status).toBe('broken');
  });

  it('resolves open when the deadline has not passed', () => {
    const res = resolveCommitment(commit({ due_time: 10, now: 5 }), 'c1');
    expect(res.status).toBe('resolved');
    expect(res.answer?.status).toBe('open');
  });

  it('ABSTAINS on open-vs-broken when the deadline is stated but the current time is unstated', () => {
    const res = resolveCommitment(commit({ due_time: 10 }), 'c1');
    expect(res.status).toBe('unresolvable');
    expect(res.reason).toBe('missing_precondition');
    expect(res.gap?.code).toBe('commitment.unstated_now');
  });

  it('resolves open (determinate) for an open-ended commitment with no deadline', () => {
    const res = resolveCommitment(commit({}), 'c1');
    expect(res.status).toBe('resolved');
    expect(res.answer?.status).toBe('open');
  });

  it('resolves open (determinate) when the commitment is not found', () => {
    const res = resolveCommitment({ commitments: [], query: { commitment: 'nope' } }, 'nope');
    expect(res.status).toBe('resolved');
    expect(res.answer?.status).toBe('open');
  });
});
