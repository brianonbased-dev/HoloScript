/**
 * StateMachine Unit Tests
 *
 * Tests state registration, transitions with guards/actions,
 * hierarchical states, context, update hooks, and history.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateMachine } from '../StateMachine';

describe('StateMachine', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = new StateMachine();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'walking' });
    sm.addState({ id: 'running' });
  });

  describe('state management', () => {
    it('should start with no current state', () => {
      expect(sm.getCurrentState()).toBeNull();
    });

    it('should set initial state and call onEnter', () => {
      const onEnter = vi.fn();
      sm.addState({ id: 'start', onEnter });
      sm.setInitialState('start');
      expect(sm.getCurrentState()).toBe('start');
      expect(onEnter).toHaveBeenCalled();
    });

    it('should count states', () => {
      expect(sm.getStateCount()).toBe(3);
    });

    it('should remove states', () => {
      sm.removeState('running');
      expect(sm.getStateCount()).toBe(2);
    });
  });

  describe('transitions', () => {
    it('should transition on event', () => {
      sm.addTransition({ from: 'idle', to: 'walking', event: 'move' });
      sm.setInitialState('idle');
      expect(sm.send('move')).toBe(true);
      expect(sm.getCurrentState()).toBe('walking');
    });

    it('should return false for unknown event', () => {
      sm.setInitialState('idle');
      expect(sm.send('fly')).toBe(false);
    });

    it('should return false with no current state', () => {
      expect(sm.send('move')).toBe(false);
    });

    it('should call onExit and onEnter during transition', () => {
      const onExit = vi.fn();
      const onEnter = vi.fn();
      sm.addState({ id: 'a', onExit });
      sm.addState({ id: 'b', onEnter });
      sm.addTransition({ from: 'a', to: 'b', event: 'go' });
      sm.setInitialState('a');

      sm.send('go');
      expect(onExit).toHaveBeenCalled();
      expect(onEnter).toHaveBeenCalled();
    });

    it('should call transition action', () => {
      const action = vi.fn();
      sm.addTransition({ from: 'idle', to: 'walking', event: 'move', action });
      sm.setInitialState('idle');
      sm.send('move');
      expect(action).toHaveBeenCalled();
    });
  });

  describe('guards', () => {
    it('should block transition when guard returns false', () => {
      sm.addTransition({ from: 'idle', to: 'running', event: 'sprint', guard: () => false });
      sm.setInitialState('idle');
      expect(sm.send('sprint')).toBe(false);
      expect(sm.getCurrentState()).toBe('idle');
    });

    it('should allow transition when guard returns true', () => {
      sm.addTransition({ from: 'idle', to: 'running', event: 'sprint', guard: () => true });
      sm.setInitialState('idle');
      expect(sm.send('sprint')).toBe(true);
      expect(sm.getCurrentState()).toBe('running');
    });

    it('should use context in guards', () => {
      sm.setContext('stamina', 100);
      sm.addTransition({
        from: 'idle', to: 'running', event: 'sprint',
        guard: (ctx) => (ctx.stamina as number) > 50,
      });
      sm.setInitialState('idle');
      expect(sm.send('sprint')).toBe(true);
    });
  });

  describe('hierarchy', () => {
    it('should find child states', () => {
      sm.addState({ id: 'combat', parent: undefined });
      sm.addState({ id: 'melee', parent: 'combat' });
      sm.addState({ id: 'ranged', parent: 'combat' });
      expect(sm.getChildStates('combat')).toEqual(['melee', 'ranged']);
    });

    it('should inherit parent transitions', () => {
      sm.addState({ id: 'combat' });
      sm.addState({ id: 'melee', parent: 'combat' });
      sm.addTransition({ from: 'combat', to: 'idle', event: 'disengage' });
      sm.setInitialState('melee');

      expect(sm.send('disengage')).toBe(true);
      expect(sm.getCurrentState()).toBe('idle');
    });
  });

  describe('context', () => {
    it('should set and get context values', () => {
      sm.setContext('health', 100);
      expect(sm.getContext('health')).toBe(100);
    });
  });

  describe('update', () => {
    it('should call onUpdate for current state', () => {
      const onUpdate = vi.fn();
      sm.addState({ id: 'active', onUpdate });
      sm.setInitialState('active');
      sm.update();
      sm.update();
      expect(onUpdate).toHaveBeenCalledTimes(2);
    });

    it('should not throw when no current state', () => {
      expect(() => sm.update()).not.toThrow();
    });
  });

  describe('history', () => {
    it('should track state history', () => {
      sm.addTransition({ from: 'idle', to: 'walking', event: 'move' });
      sm.addTransition({ from: 'walking', to: 'running', event: 'sprint' });
      sm.setInitialState('idle');
      sm.send('move');
      sm.send('sprint');

      expect(sm.getHistory()).toEqual(['idle', 'walking', 'running']);
    });
  });

  describe('isInState', () => {
    it('should return true for current state', () => {
      sm.setInitialState('idle');
      expect(sm.isInState('idle')).toBe(true);
      expect(sm.isInState('walking')).toBe(false);
    });
  });
});
