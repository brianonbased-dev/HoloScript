import { describe, it, expect, vi } from 'vitest';
import { AnimationStateMachine } from '../AnimationStateMachine';

describe('AnimationStateMachine', () => {
  it('initializes with given initial state', () => {
    const asm = new AnimationStateMachine('idle');
    expect(asm.currentState).toBe('idle');
    expect(asm.previousState).toBeNull();
    expect(asm.isBlending).toBe(false);
  });

  it('addDefaultStates registers 6 states and transitions', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addDefaultStates();
    const names = asm.getStateNames();
    expect(names).toContain('idle');
    expect(names).toContain('walk');
    expect(names).toContain('run');
    expect(names).toContain('jump');
    expect(names).toContain('attack');
    expect(names).toContain('die');
    expect(names.length).toBe(6);
  });

  it('transitionTo changes state and triggers blending', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addDefaultStates();
    const ok = asm.transitionTo('walk');
    expect(ok).toBe(true);
    expect(asm.currentState).toBe('walk');
    expect(asm.previousState).toBe('idle');
    expect(asm.isBlending).toBe(true);
    expect(asm.blendProgress).toBe(0);
  });

  it('transitionTo same state returns false', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addDefaultStates();
    expect(asm.transitionTo('idle')).toBe(false);
  });

  it('blend progresses over time', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addDefaultStates();
    asm.transitionTo('run'); // blend = 0.2s
    asm.update(0.1);
    expect(asm.blendProgress).toBeCloseTo(0.5, 1);
    asm.update(0.1);
    expect(asm.blendProgress).toBeCloseTo(1.0, 1);
    expect(asm.isBlending).toBe(false);
  });

  it('lock prevents transitions, unlock re-enables', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addDefaultStates();
    asm.lock();
    expect(asm.isLocked).toBe(true);
    expect(asm.transitionTo('walk')).toBe(false);
    expect(asm.currentState).toBe('idle');
    asm.unlock();
    expect(asm.transitionTo('walk')).toBe(true);
  });

  it('forceState bypasses locks and transitions', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addDefaultStates();
    asm.lock();
    asm.forceState('die');
    expect(asm.currentState).toBe('die');
    expect(asm.isLocked).toBe(false);
    expect(asm.blendProgress).toBe(1); // instant, no blend
  });

  it('non-looping state auto-returns to idle after duration', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addDefaultStates();
    asm.transitionTo('attack'); // duration 0.6s
    asm.update(0.7); // past duration
    expect(asm.currentState).toBe('idle');
  });

  it('onEnter and onExit callbacks fire', () => {
    const asm = new AnimationStateMachine('idle');
    const enterFn = vi.fn();
    const exitFn = vi.fn();
    asm.addState({ name: 'idle', loop: true, onExit: exitFn });
    asm.addState({ name: 'walk', loop: true, onEnter: enterFn });
    asm.addTransition({ from: 'idle', to: 'walk', blendTime: 0.1 });
    asm.transitionTo('walk');
    expect(exitFn).toHaveBeenCalledOnce();
    expect(enterFn).toHaveBeenCalledOnce();
  });

  it('canTransitionTo checks existence and conditions', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addState({ name: 'idle', loop: true });
    asm.addState({ name: 'walk', loop: true });
    asm.addTransition({ from: 'idle', to: 'walk', blendTime: 0.2 });
    expect(asm.canTransitionTo('walk')).toBe(true);
    expect(asm.canTransitionTo('run')).toBe(false); // no transition registered
  });

  it('condition guard blocks transition', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addState({ name: 'idle', loop: true });
    asm.addState({ name: 'jump', loop: false, duration: 0.5 });
    let canJump = false;
    asm.addTransition({ from: 'idle', to: 'jump', blendTime: 0.1, condition: () => canJump });
    expect(asm.transitionTo('jump')).toBe(false);
    expect(asm.canTransitionTo('jump')).toBe(false);
    canJump = true;
    expect(asm.transitionTo('jump')).toBe(true);
    expect(asm.currentState).toBe('jump');
  });

  it('stateTime tracks time spent in current state', () => {
    const asm = new AnimationStateMachine('idle');
    asm.addDefaultStates();
    asm.update(0.5);
    expect(asm.stateTime).toBeCloseTo(0.5, 3);
    asm.transitionTo('walk');
    expect(asm.stateTime).toBe(0); // reset on transition
    asm.update(0.3);
    expect(asm.stateTime).toBeCloseTo(0.3, 3);
  });
});
