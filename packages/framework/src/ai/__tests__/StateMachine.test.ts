import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateMachine, type StateConfig, type TransitionConfig } from '../StateMachine';

describe('StateMachine', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = new StateMachine();
  });

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  it('addState registers a state', () => {
    sm.addState({ id: 'idle' });
    expect(sm.getStateCount()).toBe(1);
  });

  it('removeState unregisters a state', () => {
    sm.addState({ id: 'idle' });
    sm.removeState('idle');
    expect(sm.getStateCount()).toBe(0);
  });

  it('setInitialState sets current state and calls onEnter', () => {
    const onEnter = vi.fn();
    sm.addState({ id: 'idle', onEnter });
    sm.setInitialState('idle');
    expect(sm.getCurrentState()).toBe('idle');
    expect(onEnter).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  it('send transitions to new state', () => {
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'walk' });
    sm.addTransition({ from: 'idle', to: 'walk', event: 'move' });
    sm.setInitialState('idle');
    expect(sm.send('move')).toBe(true);
    expect(sm.getCurrentState()).toBe('walk');
  });

  it('send returns false for unmatched event', () => {
    sm.addState({ id: 'idle' });
    sm.setInitialState('idle');
    expect(sm.send('nonexistent')).toBe(false);
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('send calls onExit and onEnter', () => {
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

  it('send respects guard condition', () => {
    sm.addState({ id: 'locked' });
    sm.addState({ id: 'open' });
    sm.addTransition({
      from: 'locked',
      to: 'open',
      event: 'unlock',
      guard: (ctx) => ctx['hasKey'] === true,
    });
    sm.setInitialState('locked');

    expect(sm.send('unlock')).toBe(false); // no key
    sm.setContext('hasKey', true);
    expect(sm.send('unlock')).toBe(true);
    expect(sm.getCurrentState()).toBe('open');
  });

  it('transition action is called', () => {
    const action = vi.fn();
    sm.addState({ id: 'a' });
    sm.addState({ id: 'b' });
    sm.addTransition({ from: 'a', to: 'b', event: 'go', action });
    sm.setInitialState('a');
    sm.send('go');
    expect(action).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  it('update calls onUpdate of current state', () => {
    const onUpdate = vi.fn();
    sm.addState({ id: 'idle', onUpdate });
    sm.setInitialState('idle');
    sm.update();
    expect(onUpdate).toHaveBeenCalled();
  });

  it('update does nothing with no current state', () => {
    // Should not throw
    sm.update();
  });

  // ---------------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------------

  it('setContext / getContext stores values', () => {
    sm.setContext('hp', 100);
    expect(sm.getContext('hp')).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('isInState checks current state', () => {
    sm.addState({ id: 'idle' });
    sm.setInitialState('idle');
    expect(sm.isInState('idle')).toBe(true);
    expect(sm.isInState('walk')).toBe(false);
  });

  it('getHistory returns state transition history', () => {
    sm.addState({ id: 'a' });
    sm.addState({ id: 'b' });
    sm.addTransition({ from: 'a', to: 'b', event: 'go' });
    sm.setInitialState('a');
    sm.send('go');
    expect(sm.getHistory()).toEqual(['a', 'b']);
  });

  // ---------------------------------------------------------------------------
  // Hierarchy
  // ---------------------------------------------------------------------------

  it('getChildStates returns child states', () => {
    sm.addState({ id: 'combat' });
    sm.addState({ id: 'attack', parent: 'combat' });
    sm.addState({ id: 'defend', parent: 'combat' });
    const children = sm.getChildStates('combat');
    expect(children).toContain('attack');
    expect(children).toContain('defend');
    expect(children).toHaveLength(2);
  });

  it('parent transitions bubble up', () => {
    sm.addState({ id: 'combat' });
    sm.addState({ id: 'attack', parent: 'combat' });
    sm.addState({ id: 'idle' });
    sm.addTransition({ from: 'combat', to: 'idle', event: 'disengage' });
    sm.setInitialState('attack');
    // Should find transition from parent 'combat'
    expect(sm.send('disengage')).toBe(true);
    expect(sm.getCurrentState()).toBe('idle');
  });
});
