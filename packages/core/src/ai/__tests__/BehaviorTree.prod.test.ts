/**
 * BehaviorTree + BTNodes — Production Test Suite
 *
 * Covers: BTNodes (Sequence, Selector, Parallel, Inverter, Repeater,
 * Guard, Action, Condition, Wait), BehaviorTree runner (create, tick,
 * tickAll, abort, subtrees, tracing).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ActionNode,
  ConditionNode,
  WaitNode,
  SequenceNode,
  SelectorNode,
  ParallelNode,
  InverterNode,
  RepeaterNode,
  GuardNode,
  type BTContext,
  type BTStatus,
} from '../BTNodes';
import { BehaviorTree } from '../BehaviorTree';
import { Blackboard } from '../Blackboard';

// ─── Helpers ────────────────────────────────────────────────────────
function ctx(dt = 0.016): BTContext {
  const bb = new Blackboard();
  return { blackboard: bb, deltaTime: dt, entity: 'npc1' };
}

function actionOf(status: BTStatus): ActionNode {
  return new ActionNode('act', () => status);
}

describe('BTNodes — Production', () => {
  // ─── ActionNode ───────────────────────────────────────────────────
  it('ActionNode returns action result', () => {
    const node = new ActionNode('heal', () => 'success');
    expect(node.tick(ctx())).toBe('success');
  });

  // ─── ConditionNode ────────────────────────────────────────────────
  it('ConditionNode returns success when true', () => {
    const node = new ConditionNode('hasHP', () => true);
    expect(node.tick(ctx())).toBe('success');
  });

  it('ConditionNode returns failure when false', () => {
    const node = new ConditionNode('hasHP', () => false);
    expect(node.tick(ctx())).toBe('failure');
  });

  // ─── WaitNode ─────────────────────────────────────────────────────
  it('WaitNode runs until duration elapsed', () => {
    const node = new WaitNode('pause', 1.0);
    expect(node.tick(ctx(0.5))).toBe('running');
    expect(node.tick(ctx(0.6))).toBe('success'); // 0.5 + 0.6 > 1.0
  });

  it('WaitNode reset clears elapsed', () => {
    const node = new WaitNode('pause', 1.0);
    node.tick(ctx(0.5));
    node.reset();
    expect(node.tick(ctx(0.3))).toBe('running'); // restarted
  });

  // ─── SequenceNode ─────────────────────────────────────────────────
  it('Sequence succeeds when all children succeed', () => {
    const seq = new SequenceNode('seq', [actionOf('success'), actionOf('success')]);
    expect(seq.tick(ctx())).toBe('success');
  });

  it('Sequence fails on first failure', () => {
    const seq = new SequenceNode('seq', [actionOf('success'), actionOf('failure')]);
    expect(seq.tick(ctx())).toBe('failure');
  });

  it('Sequence returns running when child runs', () => {
    const seq = new SequenceNode('seq', [actionOf('running')]);
    expect(seq.tick(ctx())).toBe('running');
  });

  // ─── SelectorNode ─────────────────────────────────────────────────
  it('Selector succeeds on first success', () => {
    const sel = new SelectorNode('sel', [actionOf('failure'), actionOf('success')]);
    expect(sel.tick(ctx())).toBe('success');
  });

  it('Selector fails when all children fail', () => {
    const sel = new SelectorNode('sel', [actionOf('failure'), actionOf('failure')]);
    expect(sel.tick(ctx())).toBe('failure');
  });

  // ─── ParallelNode ─────────────────────────────────────────────────
  it('Parallel succeeds when required successes met', () => {
    const par = new ParallelNode('par', [actionOf('success'), actionOf('success')], 2);
    expect(par.tick(ctx())).toBe('success');
  });

  it('Parallel fails when too many failures', () => {
    const par = new ParallelNode('par', [actionOf('failure'), actionOf('failure')], 2);
    expect(par.tick(ctx())).toBe('failure');
  });

  it('Parallel running when not enough data', () => {
    const par = new ParallelNode('par', [actionOf('success'), actionOf('running')], 2);
    expect(par.tick(ctx())).toBe('running');
  });

  // ─── InverterNode ─────────────────────────────────────────────────
  it('Inverter flips success to failure', () => {
    const inv = new InverterNode('inv', actionOf('success'));
    expect(inv.tick(ctx())).toBe('failure');
  });

  it('Inverter flips failure to success', () => {
    const inv = new InverterNode('inv', actionOf('failure'));
    expect(inv.tick(ctx())).toBe('success');
  });

  it('Inverter preserves running', () => {
    const inv = new InverterNode('inv', actionOf('running'));
    expect(inv.tick(ctx())).toBe('running');
  });

  // ─── GuardNode ────────────────────────────────────────────────────
  it('Guard passes through when condition true', () => {
    const guard = new GuardNode('g', () => true, actionOf('success'));
    expect(guard.tick(ctx())).toBe('success');
  });

  it('Guard blocks when condition false', () => {
    const guard = new GuardNode('g', () => false, actionOf('success'));
    expect(guard.tick(ctx())).toBe('failure');
  });

  // ─── RepeaterNode ─────────────────────────────────────────────────
  it('Repeater runs child multiple times', () => {
    const rep = new RepeaterNode('rep', actionOf('success'), 3);
    expect(rep.tick(ctx())).toBe('running'); // count 1
    expect(rep.tick(ctx())).toBe('running'); // count 2
    expect(rep.tick(ctx())).toBe('success'); // count 3
  });
});

describe('BehaviorTree — Production', () => {
  // ─── Tree Management ──────────────────────────────────────────────
  it('createTree + getTree', () => {
    const bt = new BehaviorTree();
    const tree = bt.createTree('patrol', actionOf('success'), 'npc1');
    expect(bt.getTree('patrol')).toBe(tree);
    expect(bt.getTreeCount()).toBe(1);
  });

  it('removeTree removes tree', () => {
    const bt = new BehaviorTree();
    bt.createTree('patrol', actionOf('success'), 'npc1');
    expect(bt.removeTree('patrol')).toBe(true);
    expect(bt.getTreeCount()).toBe(0);
  });

  // ─── Tick ─────────────────────────────────────────────────────────
  it('tick evaluates tree root', () => {
    const bt = new BehaviorTree();
    bt.createTree('t', actionOf('success'), 'e1');
    expect(bt.tick('t', 0.016)).toBe('success');
  });

  it('tick returns failure for unknown tree', () => {
    const bt = new BehaviorTree();
    expect(bt.tick('unknown', 0.016)).toBe('failure');
  });

  it('tick increments tickCount', () => {
    const bt = new BehaviorTree();
    bt.createTree('t', actionOf('success'), 'e1');
    bt.tick('t', 0.016);
    bt.tick('t', 0.016);
    expect(bt.getTree('t')!.tickCount).toBe(2);
  });

  it('tickAll ticks all trees', () => {
    const bt = new BehaviorTree();
    bt.createTree('a', actionOf('success'), 'e1');
    bt.createTree('b', actionOf('success'), 'e2');
    bt.tickAll(0.016);
    expect(bt.getTree('a')!.tickCount).toBe(1);
    expect(bt.getTree('b')!.tickCount).toBe(1);
  });

  // ─── Abort ────────────────────────────────────────────────────────
  it('abort sets tree status to failure', () => {
    const bt = new BehaviorTree();
    bt.createTree('t', actionOf('running'), 'e1');
    bt.tick('t', 0.016);
    bt.abort('t');
    expect(bt.getStatus('t')).toBe('failure');
    expect(bt.getTree('t')!.aborted).toBe(true);
  });

  // ─── Subtrees ─────────────────────────────────────────────────────
  it('registerSubtree + getSubtree', () => {
    const bt = new BehaviorTree();
    const sub = actionOf('success');
    bt.registerSubtree('attack', sub);
    expect(bt.getSubtree('attack')).toBe(sub);
  });

  // ─── Tracing ──────────────────────────────────────────────────────
  it('enableTracing records trace entries', () => {
    const bt = new BehaviorTree();
    bt.enableTracing();
    bt.createTree('t', actionOf('success'), 'e1');
    bt.tick('t', 0.016);
    const trace = bt.getTrace();
    expect(trace.length).toBeGreaterThan(0);
    expect(trace[0].tree).toBe('t');
  });

  it('clearTrace empties trace', () => {
    const bt = new BehaviorTree();
    bt.enableTracing();
    bt.createTree('t', actionOf('success'), 'e1');
    bt.tick('t', 0.016);
    bt.clearTrace();
    expect(bt.getTrace().length).toBe(0);
  });

  it('disableTracing stops recording', () => {
    const bt = new BehaviorTree();
    bt.enableTracing();
    bt.createTree('t', actionOf('success'), 'e1');
    bt.tick('t', 0.016);
    bt.disableTracing();
    bt.clearTrace();
    bt.tick('t', 0.016);
    expect(bt.getTrace().length).toBe(0);
  });

  // ─── getStatus ────────────────────────────────────────────────────
  it('getStatus returns failure for unknown tree', () => {
    const bt = new BehaviorTree();
    expect(bt.getStatus('nope')).toBe('failure');
  });
});
