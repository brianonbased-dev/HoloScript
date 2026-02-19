/**
 * StateMachine — Production Test Suite
 *
 * Covers: state management, transitions, guards, enter/exit hooks,
 * update cycle, context, history, hierarchy (child states).
 */
import { describe, it, expect, vi } from 'vitest';
import { StateMachine } from '../StateMachine';

describe('StateMachine — Production', () => {
  // ─── State Management ─────────────────────────────────────────────
  it('addState + getCurrentState', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'idle' });
    sm.setInitialState('idle');
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('no initial state → null', () => {
    const sm = new StateMachine();
    expect(sm.getCurrentState()).toBeNull();
  });

  it('getStateCount tracks states', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'a' });
    sm.addState({ id: 'b' });
    expect(sm.getStateCount()).toBe(2);
  });

  it('removeState removes state', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'temp' });
    sm.removeState('temp');
    expect(sm.getStateCount()).toBe(0);
  });

  // ─── Transitions ──────────────────────────────────────────────────
  it('send transitions between states', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'walking' });
    sm.addTransition({ from: 'idle', to: 'walking', event: 'MOVE' });
    sm.setInitialState('idle');
    const result = sm.send('MOVE');
    expect(result).toBe(true);
    expect(sm.getCurrentState()).toBe('walking');
  });

  it('send returns false for invalid event', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'idle' });
    sm.setInitialState('idle');
    expect(sm.send('NONEXISTENT')).toBe(false);
  });

  it('send returns false when no current state', () => {
    const sm = new StateMachine();
    expect(sm.send('X')).toBe(false);
  });

  // ─── Guards ───────────────────────────────────────────────────────
  it('guard blocks transition when false', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'attack' });
    sm.addTransition({ from: 'idle', to: 'attack', event: 'FIGHT', guard: () => false });
    sm.setInitialState('idle');
    expect(sm.send('FIGHT')).toBe(false);
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('guard allows transition when true', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'attack' });
    sm.addTransition({ from: 'idle', to: 'attack', event: 'FIGHT', guard: () => true });
    sm.setInitialState('idle');
    expect(sm.send('FIGHT')).toBe(true);
    expect(sm.getCurrentState()).toBe('attack');
  });

  // ─── Enter / Exit Hooks ───────────────────────────────────────────
  it('onEnter fires when entering state', () => {
    const spy = vi.fn();
    const sm = new StateMachine();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'active', onEnter: spy });
    sm.addTransition({ from: 'idle', to: 'active', event: 'GO' });
    sm.setInitialState('idle');
    sm.send('GO');
    expect(spy).toHaveBeenCalled();
  });

  it('onExit fires when leaving state', () => {
    const spy = vi.fn();
    const sm = new StateMachine();
    sm.addState({ id: 'idle', onExit: spy });
    sm.addState({ id: 'active' });
    sm.addTransition({ from: 'idle', to: 'active', event: 'GO' });
    sm.setInitialState('idle');
    sm.send('GO');
    expect(spy).toHaveBeenCalled();
  });

  it('setInitialState fires onEnter', () => {
    const spy = vi.fn();
    const sm = new StateMachine();
    sm.addState({ id: 'boot', onEnter: spy });
    sm.setInitialState('boot');
    expect(spy).toHaveBeenCalled();
  });

  // ─── Update ───────────────────────────────────────────────────────
  it('update calls onUpdate for current state', () => {
    const spy = vi.fn();
    const sm = new StateMachine();
    sm.addState({ id: 'idle', onUpdate: spy });
    sm.setInitialState('idle');
    sm.update();
    expect(spy).toHaveBeenCalled();
  });

  // ─── Context ──────────────────────────────────────────────────────
  it('setContext + getContext', () => {
    const sm = new StateMachine();
    sm.setContext('speed', 5);
    expect(sm.getContext('speed')).toBe(5);
  });

  // ─── History ──────────────────────────────────────────────────────
  it('getHistory tracks state transitions', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'a' });
    sm.addState({ id: 'b' });
    sm.addTransition({ from: 'a', to: 'b', event: 'GO' });
    sm.setInitialState('a');
    sm.send('GO');
    const history = sm.getHistory();
    expect(history).toEqual(['a', 'b']);
  });

  // ─── isInState ────────────────────────────────────────────────────
  it('isInState returns correct boolean', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'idle' });
    sm.setInitialState('idle');
    expect(sm.isInState('idle')).toBe(true);
    expect(sm.isInState('other')).toBe(false);
  });

  // ─── Hierarchy (Child States) ─────────────────────────────────────
  it('getChildStates returns children', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'combat' });
    sm.addState({ id: 'melee', parent: 'combat' });
    sm.addState({ id: 'ranged', parent: 'combat' });
    sm.addState({ id: 'idle' });
    const children = sm.getChildStates('combat');
    expect(children.sort()).toEqual(['melee', 'ranged']);
  });
});
