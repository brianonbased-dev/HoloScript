import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BehaviorTree } from '../BehaviorTree';
import { ActionNode, SequenceNode, SelectorNode, ConditionNode, WaitNode } from '../BTNodes';
import { Blackboard } from '../Blackboard';

describe('BehaviorTree', () => {
  let bt: BehaviorTree;

  beforeEach(() => {
    bt = new BehaviorTree();
  });

  // ---------------------------------------------------------------------------
  // Tree Management
  // ---------------------------------------------------------------------------

  it('createTree adds a named tree', () => {
    const root = new ActionNode('idle', () => 'success');
    const tree = bt.createTree('main', root, 'agent-1');
    expect(tree.id).toBe('main');
    expect(tree.status).toBe('ready');
    expect(bt.getTreeCount()).toBe(1);
  });

  it('createTree with custom blackboard', () => {
    const bb = new Blackboard();
    bb.set('hp', 100);
    const tree = bt.createTree('t', new ActionNode('a', () => 'success'), 'e', bb);
    expect(tree.context.blackboard.get('hp')).toBe(100);
  });

  it('removeTree removes tree and returns true', () => {
    bt.createTree('t', new ActionNode('a', () => 'success'), 'e');
    expect(bt.removeTree('t')).toBe(true);
    expect(bt.getTreeCount()).toBe(0);
  });

  it('removeTree returns false for unknown', () => {
    expect(bt.removeTree('nope')).toBe(false);
  });

  it('getTree returns tree definition', () => {
    bt.createTree('t', new ActionNode('a', () => 'success'), 'e');
    expect(bt.getTree('t')).toBeDefined();
    expect(bt.getTree('nope')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------

  it('tick executes tree root and returns status', () => {
    const action = vi.fn().mockReturnValue('success');
    bt.createTree('main', new ActionNode('act', action), 'e');
    const status = bt.tick('main', 0.016);
    expect(status).toBe('success');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('tick returns failure for missing tree', () => {
    expect(bt.tick('nope', 0.016)).toBe('failure');
  });

  it('tick passes deltaTime through context', () => {
    let receivedDt = 0;
    bt.createTree(
      'main',
      new ActionNode('act', (ctx) => {
        receivedDt = ctx.deltaTime;
        return 'success';
      }),
      'e'
    );
    bt.tick('main', 0.033);
    expect(receivedDt).toBeCloseTo(0.033);
  });

  it('tick increments tickCount', () => {
    bt.createTree('t', new ActionNode('a', () => 'success'), 'e');
    bt.tick('t', 0.016);
    bt.tick('t', 0.016);
    expect(bt.getTree('t')!.tickCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Sequence Node integration
  // ---------------------------------------------------------------------------

  it('sequence succeeds when all children succeed', () => {
    const root = new SequenceNode('seq', [
      new ActionNode('a', () => 'success'),
      new ActionNode('b', () => 'success'),
    ]);
    bt.createTree('main', root, 'e');
    expect(bt.tick('main', 0.016)).toBe('success');
  });

  it('sequence fails on first failing child', () => {
    const calls: string[] = [];
    const root = new SequenceNode('seq', [
      new ActionNode('a', () => {
        calls.push('a');
        return 'success';
      }),
      new ActionNode('b', () => {
        calls.push('b');
        return 'failure';
      }),
      new ActionNode('c', () => {
        calls.push('c');
        return 'success';
      }),
    ]);
    bt.createTree('main', root, 'e');
    expect(bt.tick('main', 0.016)).toBe('failure');
    expect(calls).toEqual(['a', 'b']);
  });

  // ---------------------------------------------------------------------------
  // Selector Node integration
  // ---------------------------------------------------------------------------

  it('selector succeeds on first successful child', () => {
    const root = new SelectorNode('sel', [
      new ActionNode('a', () => 'failure'),
      new ActionNode('b', () => 'success'),
    ]);
    bt.createTree('main', root, 'e');
    expect(bt.tick('main', 0.016)).toBe('success');
  });

  // ---------------------------------------------------------------------------
  // tickAll
  // ---------------------------------------------------------------------------

  it('tickAll executes all registered trees', () => {
    let calls = 0;
    bt.createTree(
      'a',
      new ActionNode('x', () => {
        calls++;
        return 'success';
      }),
      'e'
    );
    bt.createTree(
      'b',
      new ActionNode('y', () => {
        calls++;
        return 'success';
      }),
      'e'
    );
    bt.tickAll(0.016);
    expect(calls).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Abort
  // ---------------------------------------------------------------------------

  it('abort sets tree status to failure', () => {
    bt.createTree('t', new ActionNode('a', () => 'running'), 'e');
    bt.tick('t', 0.016);
    bt.abort('t');
    expect(bt.getTree('t')!.aborted).toBe(true);
    expect(bt.getTree('t')!.status).toBe('failure');
  });

  // ---------------------------------------------------------------------------
  // Subtrees
  // ---------------------------------------------------------------------------

  it('registerSubtree stores and retrieves subtree', () => {
    const node = new ActionNode('patrol', () => 'success');
    bt.registerSubtree('patrol_behavior', node);
    expect(bt.getSubtree('patrol_behavior')).toBe(node);
    expect(bt.getSubtree('nope')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Status Tracking
  // ---------------------------------------------------------------------------

  it('getStatus tracks per-tree status', () => {
    bt.createTree('t', new ActionNode('a', () => 'success'), 'e');
    bt.tick('t', 0.016);
    expect(bt.getStatus('t')).toBe('success');
  });

  it('getStatus returns failure for unknown tree', () => {
    expect(bt.getStatus('nope')).toBe('failure');
  });

  // ---------------------------------------------------------------------------
  // Debug Tracing
  // ---------------------------------------------------------------------------

  it('tracing captures node execution', () => {
    bt.enableTracing();
    bt.createTree('t', new ActionNode('act', () => 'success'), 'e');
    bt.tick('t', 0.016);
    const trace = bt.getTrace();
    expect(trace.length).toBeGreaterThan(0);
    expect(trace[0].node).toBe('act');
    expect(trace[0].status).toBe('success');
  });

  it('clearTrace empties trace', () => {
    bt.enableTracing();
    bt.createTree('t', new ActionNode('a', () => 'success'), 'e');
    bt.tick('t', 0.016);
    bt.clearTrace();
    expect(bt.getTrace()).toHaveLength(0);
  });
});
