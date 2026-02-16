import { describe, it, expect, beforeEach } from 'vitest';
import {
  SequenceNode, SelectorNode, ParallelNode,
  InverterNode, RepeaterNode, GuardNode,
  ActionNode, ConditionNode, WaitNode,
  type BTContext,
} from '../ai/BTNodes';

// =============================================================================
// C288 — BT Nodes
// =============================================================================

function ctx(dt = 0.016): BTContext {
  const data: Record<string, unknown> = {};
  return {
    blackboard: { get: (k: string) => data[k], set: (k: string, v: unknown) => { data[k] = v; } },
    deltaTime: dt,
    entity: 'e1',
  };
}

describe('BTNodes', () => {
  it('ActionNode returns the status from its callback', () => {
    const node = new ActionNode('act', () => 'success');
    expect(node.tick(ctx())).toBe('success');
  });

  it('ConditionNode returns success when true, failure when false', () => {
    const yes = new ConditionNode('c', () => true);
    const no  = new ConditionNode('c', () => false);
    expect(yes.tick(ctx())).toBe('success');
    expect(no.tick(ctx())).toBe('failure');
  });

  it('SequenceNode succeeds only if all children succeed', () => {
    const seq = new SequenceNode('seq', [
      new ActionNode('a', () => 'success'),
      new ActionNode('b', () => 'success'),
    ]);
    expect(seq.tick(ctx())).toBe('success');
  });

  it('SequenceNode fails on first child failure', () => {
    const seq = new SequenceNode('seq', [
      new ActionNode('a', () => 'success'),
      new ActionNode('b', () => 'failure'),
      new ActionNode('c', () => 'success'),
    ]);
    expect(seq.tick(ctx())).toBe('failure');
  });

  it('SelectorNode succeeds on first child success', () => {
    const sel = new SelectorNode('sel', [
      new ActionNode('a', () => 'failure'),
      new ActionNode('b', () => 'success'),
    ]);
    expect(sel.tick(ctx())).toBe('success');
  });

  it('SelectorNode fails when all children fail', () => {
    const sel = new SelectorNode('sel', [
      new ActionNode('a', () => 'failure'),
      new ActionNode('b', () => 'failure'),
    ]);
    expect(sel.tick(ctx())).toBe('failure');
  });

  it('ParallelNode succeeds when required count met', () => {
    const par = new ParallelNode('par', [
      new ActionNode('a', () => 'success'),
      new ActionNode('b', () => 'failure'),
      new ActionNode('c', () => 'success'),
    ], 2);
    expect(par.tick(ctx())).toBe('success');
  });

  it('InverterNode flips success to failure', () => {
    const inv = new InverterNode('inv', new ActionNode('a', () => 'success'));
    expect(inv.tick(ctx())).toBe('failure');
  });

  it('InverterNode flips failure to success', () => {
    const inv = new InverterNode('inv', new ActionNode('a', () => 'failure'));
    expect(inv.tick(ctx())).toBe('success');
  });

  it('RepeaterNode repeats child N times', () => {
    let count = 0;
    const rep = new RepeaterNode('rep', new ActionNode('a', () => { count++; return 'success'; }), 3);
    rep.tick(ctx()); // first completion → count=1
    rep.tick(ctx()); // second → count=2
    rep.tick(ctx()); // third → count=3
    expect(count).toBe(3);
    expect(rep.tick(ctx())).toBe('success'); // already done
  });

  it('GuardNode blocks child when condition is false', () => {
    const guard = new GuardNode('g', () => false, new ActionNode('a', () => 'success'));
    expect(guard.tick(ctx())).toBe('failure');
  });

  it('WaitNode runs for duration then succeeds', () => {
    const wait = new WaitNode('w', 0.05);
    expect(wait.tick(ctx(0.02))).toBe('running');
    expect(wait.tick(ctx(0.02))).toBe('running');
    expect(wait.tick(ctx(0.02))).toBe('success');
  });

  it('reset clears node tree', () => {
    const seq = new SequenceNode('seq', [new ActionNode('a', () => 'running')]);
    seq.tick(ctx());
    expect(seq.status).toBe('running');
    seq.reset();
    expect(seq.status).toBe('ready');
  });
});
