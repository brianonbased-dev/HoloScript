import { describe, it, expect, vi } from 'vitest';
import { StateMachine } from '@holoscript/framework/behavior';
import {
  BehaviorTree,
  ActionNode,
  ConditionNode,
  WaitNode,
  SequenceNode,
  SelectorNode,
  InverterNode,
  RepeaterNode,
} from '@holoscript/framework/behavior';
import { createPatrolBehavior, createIdleBehavior } from '@holoscript/framework/behavior';

describe('State Machine & Behavior System', () => {
  describe('StateMachine', () => {
    function makeTrafficLight() {
      const onEnter = vi.fn();
      return {
        onEnter,
        sm: new StateMachine({
          initialState: 'red',
          states: [
            { name: 'red', onEnter },
            { name: 'yellow', onEnter },
            { name: 'green', onEnter },
          ],
          transitions: [
            { from: 'red', to: 'green', event: 'next' },
            { from: 'green', to: 'yellow', event: 'next' },
            { from: 'yellow', to: 'red', event: 'next' },
          ],
        }),
      };
    }

    it('Starts in the initial state', () => {
      const { sm } = makeTrafficLight();
      expect(sm.getCurrentState()).toBe('red');
    });

    it('Transitions on events', () => {
      const { sm } = makeTrafficLight();
      sm.send('next');
      expect(sm.getCurrentState()).toBe('green');
      sm.send('next');
      expect(sm.getCurrentState()).toBe('yellow');
      sm.send('next');
      expect(sm.getCurrentState()).toBe('red');
    });

    it('Calls onEnter callbacks', () => {
      const { sm, onEnter } = makeTrafficLight();
      // Called once for initial state
      expect(onEnter).toHaveBeenCalledTimes(1);
      sm.send('next');
      expect(onEnter).toHaveBeenCalledTimes(2);
    });

    it('Respects transition guards', () => {
      const sm = new StateMachine({
        initialState: 'locked',
        context: { hasKey: false },
        states: [{ name: 'locked' }, { name: 'unlocked' }],
        transitions: [
          { from: 'locked', to: 'unlocked', event: 'unlock', guard: (ctx) => ctx.hasKey },
        ],
      });

      expect(sm.send('unlock')).toBe(false); // No key
      expect(sm.getCurrentState()).toBe('locked');

      sm.getContext().hasKey = true;
      expect(sm.send('unlock')).toBe(true);
      expect(sm.getCurrentState()).toBe('unlocked');
    });

    it('Tracks history', () => {
      const { sm } = makeTrafficLight();
      sm.send('next');
      sm.send('next');
      const history = sm.getHistory();
      expect(history).toEqual(['red', 'green', 'yellow']);
    });

    it('Auto-evaluates guard transitions on update', () => {
      const sm = new StateMachine({
        initialState: 'idle',
        context: { health: 100 },
        states: [{ name: 'idle' }, { name: 'dead' }],
        transitions: [{ from: 'idle', to: 'dead', guard: (ctx) => ctx.health <= 0 }],
      });

      sm.update(0.016); // health=100, stays idle
      expect(sm.getCurrentState()).toBe('idle');

      sm.getContext().health = 0;
      sm.update(0.016); // auto-evaluates guard
      expect(sm.getCurrentState()).toBe('dead');
    });
  });

  describe('BehaviorTree', () => {
    it('Action node executes and returns status', () => {
      const action = new ActionNode('test', () => 'success');
      expect(action.tick({}, 0.016)).toBe('success');
    });

    it('Condition node returns success/failure', () => {
      const yes = new ConditionNode('check', (ctx) => ctx.value > 5);
      expect(yes.tick({ value: 10 }, 0)).toBe('success');
      expect(yes.tick({ value: 2 }, 0)).toBe('failure');
    });

    it('Sequence succeeds when all children succeed', () => {
      const seq = new SequenceNode([
        new ActionNode('a', () => 'success'),
        new ActionNode('b', () => 'success'),
      ]);
      expect(seq.tick({}, 0.016)).toBe('success');
    });

    it('Sequence fails on first failure', () => {
      const seq = new SequenceNode([
        new ActionNode('a', () => 'success'),
        new ActionNode('b', () => 'failure'),
        new ActionNode('c', () => 'success'),
      ]);
      expect(seq.tick({}, 0.016)).toBe('failure');
    });

    it('Selector succeeds on first success', () => {
      const sel = new SelectorNode([
        new ActionNode('a', () => 'failure'),
        new ActionNode('b', () => 'success'),
        new ActionNode('c', () => 'failure'),
      ]);
      expect(sel.tick({}, 0.016)).toBe('success');
    });

    it('Inverter flips success/failure', () => {
      const inv = new InverterNode(new ActionNode('a', () => 'success'));
      expect(inv.tick({}, 0.016)).toBe('failure');
    });

    it('Wait node returns running then success', () => {
      const wait = new WaitNode(1.0);
      expect(wait.tick({}, 0.5)).toBe('running');
      expect(wait.tick({}, 0.6)).toBe('success');
    });

    it('BehaviorTree ticks root and manages context', () => {
      const tree = new BehaviorTree(
        new ActionNode('inc', (ctx) => {
          ctx.count = (ctx.count || 0) + 1;
          return 'success';
        }),
        { count: 0 }
      );

      tree.tick(0.016);
      tree.tick(0.016);
      expect(tree.getContext().count).toBe(2);
    });

    it('Patrol preset runs through waypoints', () => {
      const patrol = createPatrolBehavior(3, 0.1);
      const ctx: any = {};

      // Tick enough to move through a waypoint
      for (let i = 0; i < 200; i++) {
        patrol.tick(ctx, 0.016);
      }
      expect(ctx.waypointIndex).toBeDefined();
    });
  });
});
