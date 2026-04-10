/**
 * StateMachine Production Tests
 *
 * FSM: states (enter/update/exit), transitions (event/guard/action),
 * forceTransition, history, evaluate, isInState.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateMachine } from '../StateMachine';

describe('StateMachine — Production', () => {
  const makeSimpleFSM = () =>
    new StateMachine({
      initialState: 'idle',
      states: [{ name: 'idle' }, { name: 'walking' }, { name: 'running' }],
      transitions: [
        { from: 'idle', to: 'walking', event: 'walk' },
        { from: 'walking', to: 'running', event: 'run' },
        { from: 'running', to: 'idle', event: 'stop' },
      ],
    });

  it('starts in initial state', () => {
    const fsm = makeSimpleFSM();
    expect(fsm.getCurrentState()).toBe('idle');
    expect(fsm.isInState('idle')).toBe(true);
  });

  it('transitions on event', () => {
    const fsm = makeSimpleFSM();
    expect(fsm.send('walk')).toBe(true);
    expect(fsm.getCurrentState()).toBe('walking');
  });

  it('rejects invalid event', () => {
    const fsm = makeSimpleFSM();
    expect(fsm.send('run')).toBe(false); // can't run from idle
  });

  it('tracks previous state', () => {
    const fsm = makeSimpleFSM();
    fsm.send('walk');
    expect(fsm.getPreviousState()).toBe('idle');
  });

  it('tracks history', () => {
    const fsm = makeSimpleFSM();
    fsm.send('walk');
    fsm.send('run');
    expect(fsm.getHistory()).toEqual(['idle', 'walking', 'running']);
  });

  it('calls onEnter/onExit callbacks', () => {
    const onEnter = vi.fn();
    const onExit = vi.fn();
    const fsm = new StateMachine({
      initialState: 'a',
      states: [
        { name: 'a', onExit },
        { name: 'b', onEnter },
      ],
      transitions: [{ from: 'a', to: 'b', event: 'go' }],
    });
    fsm.send('go');
    expect(onExit).toHaveBeenCalled();
    expect(onEnter).toHaveBeenCalled();
  });

  it('guard blocks transition', () => {
    const fsm = new StateMachine({
      initialState: 'idle',
      states: [{ name: 'idle' }, { name: 'combat' }],
      transitions: [{ from: 'idle', to: 'combat', event: 'fight', guard: (ctx) => ctx.hasWeapon }],
      context: { hasWeapon: false },
    });
    expect(fsm.send('fight')).toBe(false);
  });

  it('guard allows transition', () => {
    const fsm = new StateMachine({
      initialState: 'idle',
      states: [{ name: 'idle' }, { name: 'combat' }],
      transitions: [{ from: 'idle', to: 'combat', event: 'fight', guard: (ctx) => ctx.hasWeapon }],
      context: { hasWeapon: true },
    });
    expect(fsm.send('fight')).toBe(true);
    expect(fsm.getCurrentState()).toBe('combat');
  });

  it('forceTransition bypasses guards', () => {
    const fsm = makeSimpleFSM();
    fsm.forceTransition('running');
    expect(fsm.getCurrentState()).toBe('running');
  });

  it('update calls onUpdate', () => {
    const onUpdate = vi.fn();
    const fsm = new StateMachine({
      initialState: 'active',
      states: [{ name: 'active', onUpdate }],
      transitions: [],
    });
    fsm.update(0.016);
    expect(onUpdate).toHaveBeenCalledWith(expect.anything(), 0.016);
  });

  it('evaluate auto-transitions on guard', () => {
    const fsm = new StateMachine({
      initialState: 'patrol',
      states: [{ name: 'patrol' }, { name: 'chase' }],
      transitions: [{ from: 'patrol', to: 'chase', guard: (ctx) => ctx.enemyNearby }],
      context: { enemyNearby: true },
    });
    expect(fsm.evaluate()).toBe(true);
    expect(fsm.getCurrentState()).toBe('chase');
  });
});
