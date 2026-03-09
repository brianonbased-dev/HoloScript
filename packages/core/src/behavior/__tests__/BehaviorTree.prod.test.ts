/**
 * BehaviorTree Production Tests
 *
 * Node types: Action, Condition, Wait, Sequence, Selector, Inverter, Repeater.
 * BehaviorTree: tick, context, reset.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ActionNode,
  ConditionNode,
  WaitNode,
  SequenceNode,
  SelectorNode,
  InverterNode,
  RepeaterNode,
  BehaviorTree,
} from '../BehaviorTree';

describe('BehaviorTree — Production', () => {
  describe('ActionNode', () => {
    it('returns action result', () => {
      const action = new ActionNode('attack', () => 'success');
      expect(action.tick({}, 0.016)).toBe('success');
    });
  });

  describe('ConditionNode', () => {
    it('success when true', () => {
      const cond = new ConditionNode('hasTarget', (ctx) => ctx.hasTarget);
      expect(cond.tick({ hasTarget: true }, 0)).toBe('success');
    });

    it('failure when false', () => {
      const cond = new ConditionNode('hasTarget', (ctx) => ctx.hasTarget);
      expect(cond.tick({ hasTarget: false }, 0)).toBe('failure');
    });
  });

  describe('WaitNode', () => {
    it('returns running until duration', () => {
      const wait = new WaitNode(1.0);
      expect(wait.tick({}, 0.5)).toBe('running');
      expect(wait.tick({}, 0.6)).toBe('success');
    });

    it('reset restarts timer', () => {
      const wait = new WaitNode(1.0);
      wait.tick({}, 0.8);
      wait.reset();
      expect(wait.tick({}, 0.1)).toBe('running');
    });
  });

  describe('SequenceNode', () => {
    it('runs all children in order → success', () => {
      const seq = new SequenceNode([
        new ActionNode('a', () => 'success'),
        new ActionNode('b', () => 'success'),
      ]);
      expect(seq.tick({}, 0.016)).toBe('success');
    });

    it('fails on first failure', () => {
      const seq = new SequenceNode([
        new ActionNode('a', () => 'success'),
        new ActionNode('b', () => 'failure'),
        new ActionNode('c', () => 'success'),
      ]);
      expect(seq.tick({}, 0.016)).toBe('failure');
    });

    it('returns running if child is running', () => {
      const seq = new SequenceNode([new ActionNode('a', () => 'success'), new WaitNode(1.0)]);
      expect(seq.tick({}, 0.016)).toBe('running');
    });
  });

  describe('SelectorNode', () => {
    it('succeeds on first success', () => {
      const sel = new SelectorNode([
        new ActionNode('a', () => 'failure'),
        new ActionNode('b', () => 'success'),
      ]);
      expect(sel.tick({}, 0.016)).toBe('success');
    });

    it('fails when all children fail', () => {
      const sel = new SelectorNode([
        new ActionNode('a', () => 'failure'),
        new ActionNode('b', () => 'failure'),
      ]);
      expect(sel.tick({}, 0.016)).toBe('failure');
    });
  });

  describe('InverterNode', () => {
    it('inverts success to failure', () => {
      const inv = new InverterNode(new ActionNode('a', () => 'success'));
      expect(inv.tick({}, 0.016)).toBe('failure');
    });

    it('inverts failure to success', () => {
      const inv = new InverterNode(new ActionNode('a', () => 'failure'));
      expect(inv.tick({}, 0.016)).toBe('success');
    });

    it('passes through running', () => {
      const inv = new InverterNode(new ActionNode('a', () => 'running'));
      expect(inv.tick({}, 0.016)).toBe('running');
    });
  });

  describe('RepeaterNode', () => {
    it('repeats N times', () => {
      let count = 0;
      const rep = new RepeaterNode(
        new ActionNode('inc', () => {
          count++;
          return 'success';
        }),
        3
      );
      // Each tick: child succeeds → count++, repeater increments, resets child, returns running
      rep.tick({}, 0.016); // count=1
      rep.tick({}, 0.016); // count=2
      const status = rep.tick({}, 0.016); // count=3, maxCount reached
      expect(count).toBe(3);
      expect(status).toBe('success');
    });
  });

  describe('BehaviorTree wrapper', () => {
    it('ticks root and exposes context', () => {
      const fn = vi.fn().mockReturnValue('success');
      const tree = new BehaviorTree(new ActionNode('root', fn), { hp: 100 });
      expect(tree.tick(0.016)).toBe('success');
      expect(tree.getContext().hp).toBe(100);
    });

    it('setContext updates context', () => {
      const tree = new BehaviorTree(new ActionNode('root', () => 'success'));
      tree.setContext('target', 'enemy');
      expect(tree.getContext().target).toBe('enemy');
    });
  });
});
