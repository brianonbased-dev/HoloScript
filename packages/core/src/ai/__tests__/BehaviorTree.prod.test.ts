/**
 * BehaviorTree.prod.test.ts — Sprint CLXX
 *
 * Production tests for the BehaviorTree runner.
 * API: new BehaviorTree()
 *   .createTree(id, root, entity, blackboard?) → BTTreeDef
 *   .removeTree(id)                            → boolean
 *   .getTree(id)                               → BTTreeDef | undefined
 *   .registerSubtree(name, root)               → void
 *   .getSubtree(name)                          → BTNode | undefined
 *   .tick(id, dt)                              → BTStatus
 *   .tickAll(dt)                               → void
 *   .abort(id)                                 → void
 *   .enableTracing() / disableTracing()
 *   .getTrace()                                → TraceEntry[]
 *   .clearTrace()
 *   .getTreeCount()                            → number
 *   .getStatus(id)                             → BTStatus
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BehaviorTree } from '@holoscript/framework/ai';
import { ActionNode, SequenceNode } from '@holoscript/framework/ai';
import type { BTStatus } from '@holoscript/framework/ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function always(status: BTStatus) {
  return new ActionNode(`always-${status}`, () => status);
}

let bt: BehaviorTree;

beforeEach(() => {
  bt = new BehaviorTree();
});

// ---------------------------------------------------------------------------
// createTree / getTree / removeTree
// ---------------------------------------------------------------------------

describe('BehaviorTree', () => {
  describe('createTree() / getTree() / removeTree()', () => {
    it('createTree() registers and returns the tree', () => {
      const tree = bt.createTree('t1', always('success'), 'agent-1');
      expect(tree.id).toBe('t1');
    });

    it('getTree() retrieves the created tree', () => {
      bt.createTree('t1', always('success'), 'agent-1');
      expect(bt.getTree('t1')?.id).toBe('t1');
    });

    it('getTree() returns undefined for unknown id', () => {
      expect(bt.getTree('nope')).toBeUndefined();
    });

    it('removeTree() deletes the tree', () => {
      bt.createTree('t1', always('success'), 'agent-1');
      expect(bt.removeTree('t1')).toBe(true);
      expect(bt.getTree('t1')).toBeUndefined();
    });

    it('removeTree() returns false for unknown id', () => {
      expect(bt.removeTree('no')).toBe(false);
    });

    it('createTree() initialises tickCount = 0 and status = ready', () => {
      const tree = bt.createTree('t1', always('success'), 'agent-1');
      expect(tree.tickCount).toBe(0);
      expect(tree.status).toBe('ready');
    });
  });

  // -------------------------------------------------------------------------
  // subtrees
  // -------------------------------------------------------------------------

  describe('registerSubtree() / getSubtree()', () => {
    it('registers and retrieves a subtree', () => {
      const root = always('success');
      bt.registerSubtree('patrol', root);
      expect(bt.getSubtree('patrol')).toBe(root);
    });

    it('returns undefined for unknown subtree', () => {
      expect(bt.getSubtree('nope')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // tick()
  // -------------------------------------------------------------------------

  describe('tick()', () => {
    it('returns the root node status', () => {
      bt.createTree('t1', always('success'), 'agent');
      expect(bt.tick('t1', 0.016)).toBe('success');
    });

    it('returns failure for unknown tree id', () => {
      expect(bt.tick('nope', 0.016)).toBe('failure');
    });

    it('increments tickCount on each tick', () => {
      bt.createTree('t1', always('success'), 'a');
      bt.tick('t1', 0.016);
      bt.tick('t1', 0.016);
      expect(bt.getTree('t1')?.tickCount).toBe(2);
    });

    it('updates tree.status after tick', () => {
      bt.createTree('t1', always('running'), 'a');
      bt.tick('t1', 0.016);
      expect(bt.getStatus('t1')).toBe('running');
    });

    it('passes deltaTime in context to nodes', () => {
      let receivedDt = -1;
      const node = new ActionNode('dt-spy', (ctx) => {
        receivedDt = ctx.deltaTime;
        return 'success';
      });
      bt.createTree('t1', node, 'a');
      bt.tick('t1', 0.033);
      expect(receivedDt).toBe(0.033);
    });

    it('ticks a composite tree correctly (Sequence of successes)', () => {
      const seq = new SequenceNode('seq', [always('success'), always('success')]);
      bt.createTree('t1', seq, 'a');
      expect(bt.tick('t1', 0.016)).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // tickAll()
  // -------------------------------------------------------------------------

  describe('tickAll()', () => {
    it('ticks all registered trees', () => {
      let count = 0;
      const spy = new ActionNode('spy', () => {
        count++;
        return 'success';
      });
      bt.createTree('t1', spy, 'a');
      bt.createTree('t2', spy, 'b');
      bt.tickAll(0.016);
      expect(count).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // abort()
  // -------------------------------------------------------------------------

  describe('abort()', () => {
    it('marks the tree as aborted and sets status to failure', () => {
      bt.createTree('t1', always('running'), 'a');
      bt.abort('t1');
      expect(bt.getTree('t1')?.aborted).toBe(true);
      expect(bt.getStatus('t1')).toBe('failure');
    });

    it('abort() sets the tree status to failure (persists until next tick resolves it)', () => {
      bt.createTree('t1', always('success'), 'a');
      bt.abort('t1');
      // abort sets status=failure immediately; getStatus reflects that
      expect(bt.getStatus('t1')).toBe('failure');
      // Next tick resets aborted=false and runs normally again
      expect(bt.tick('t1', 0.016)).toBe('success');
    });

    it('abort() is a no-op for unknown id', () => {
      expect(() => bt.abort('no-such-tree')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // tracing
  // -------------------------------------------------------------------------

  describe('enableTracing() / disableTracing() / getTrace() / clearTrace()', () => {
    it('getTrace() returns empty array by default', () => {
      expect(bt.getTrace()).toEqual([]);
    });

    it('tracing off: tick does not append entries', () => {
      bt.createTree('t1', always('success'), 'a');
      bt.tick('t1', 0.016);
      expect(bt.getTrace().length).toBe(0);
    });

    it('tracing on: tick appends a trace entry', () => {
      bt.enableTracing();
      bt.createTree('t1', always('success'), 'a');
      bt.tick('t1', 0.016);
      expect(bt.getTrace().length).toBeGreaterThan(0);
    });

    it('trace entry has tree, node, status, tick fields', () => {
      bt.enableTracing();
      bt.createTree('t1', always('success'), 'a');
      bt.tick('t1', 0.016);
      const entry = bt.getTrace()[0];
      expect(entry.tree).toBe('t1');
      expect(entry.node).toBe('always-success');
      expect(entry.status).toBe('success');
      expect(typeof entry.tick).toBe('number');
    });

    it('disableTracing() stops accumulation', () => {
      bt.enableTracing();
      bt.createTree('t1', always('success'), 'a');
      bt.tick('t1', 0.016);
      bt.disableTracing();
      bt.tick('t1', 0.016);
      expect(bt.getTrace().length).toBe(1); // only first tick logged
    });

    it('clearTrace() empties the trace array', () => {
      bt.enableTracing();
      bt.createTree('t1', always('success'), 'a');
      bt.tick('t1', 0.016);
      bt.clearTrace();
      expect(bt.getTrace().length).toBe(0);
    });

    it('getTrace() returns a copy', () => {
      bt.enableTracing();
      bt.createTree('t1', always('success'), 'a');
      bt.tick('t1', 0.016);
      const trace = bt.getTrace();
      trace.pop();
      expect(bt.getTrace().length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getTreeCount() / getStatus()
  // -------------------------------------------------------------------------

  describe('getTreeCount() / getStatus()', () => {
    it('getTreeCount() is 0 initially', () => {
      expect(bt.getTreeCount()).toBe(0);
    });

    it('getTreeCount() increments with each createTree()', () => {
      bt.createTree('t1', always('success'), 'a');
      bt.createTree('t2', always('success'), 'b');
      expect(bt.getTreeCount()).toBe(2);
    });

    it('getStatus() returns ready before any tick', () => {
      bt.createTree('t1', always('success'), 'a');
      expect(bt.getStatus('t1')).toBe('ready');
    });

    it('getStatus() returns failure for unknown id', () => {
      expect(bt.getStatus('no')).toBe('failure');
    });
  });
});
