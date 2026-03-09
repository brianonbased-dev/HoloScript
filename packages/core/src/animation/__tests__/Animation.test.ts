import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnimationEngine, Easing, ActiveAnimation } from '../AnimationEngine';
import { SpringAnimator } from '../SpringAnimator';
import { Timeline } from '../Timeline';
import { TransitionSystem } from '../TransitionSystem';

describe('AnimationEngine', () => {
  let engine: AnimationEngine;

  beforeEach(() => {
    engine = new AnimationEngine();
  });

  it('interpolates linearly', () => {
    let value = 0;
    engine.play(
      {
        id: 'test',
        property: 'x',
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 100 },
        ],
        duration: 1,
        loop: false,
        pingPong: false,
        delay: 0,
      },
      (v) => (value = v)
    );

    engine.update(0.5); // Halfway
    expect(value).toBe(50);

    engine.update(0.5); // Done
    expect(value).toBe(100);
    expect(engine.isActive('test')).toBe(false);
  });

  it('handles delay', () => {
    let value = 0;
    engine.play(
      {
        id: 'test',
        property: 'x',
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 100 },
        ],
        duration: 1,
        loop: false,
        pingPong: false,
        delay: 0.5,
      },
      (v) => (value = v)
    );

    engine.update(0.4); // Still invalid
    expect(value).toBe(0);

    engine.update(0.2); // 0.1 elapsed
    expect(value).toBeCloseTo(10);
  });

  it('handles looping', () => {
    let value = 0;
    let complete = false;
    engine.play(
      {
        id: 'test',
        property: 'x',
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 100 },
        ],
        duration: 1,
        loop: true,
        pingPong: false,
        delay: 0,
        onComplete: () => (complete = true),
      },
      (v) => (value = v)
    );

    engine.update(1.5); // 1.5 loops
    expect(value).toBe(50);
    expect(engine.isActive('test')).toBe(true);
    expect(complete).toBe(false);
  });
});

describe('SpringAnimator', () => {
  it('settles at target', () => {
    const spring = new SpringAnimator(0);
    spring.setTarget(100);

    // Simulate a few seconds
    for (let i = 0; i < 120; i++) {
      spring.update(0.016); // 60fps
    }

    expect(spring.getValue()).toBeCloseTo(100, 1);
    expect(spring.isAtRest()).toBe(true);
  });

  it('reacts to impulse', () => {
    const spring = new SpringAnimator(0);
    spring.impulse(100);
    spring.update(0.016);
    expect(spring.getValue()).toBeGreaterThan(0);
    expect(spring.isAtRest()).toBe(false);
  });
});

describe('TransitionSystem', () => {
  let engine: AnimationEngine;
  let transitions: TransitionSystem;

  beforeEach(() => {
    engine = new AnimationEngine();
    transitions = new TransitionSystem(engine);
  });

  it('fades in', () => {
    let opacity = 0;
    transitions.fade('test', 'in', (val) => (opacity = val), {
      duration: 1,
      easing: Easing.linear,
    });

    engine.update(0.5);
    expect(opacity).toBe(0.5);

    engine.update(0.5);
    expect(opacity).toBe(1);
  });

  it('scales out', () => {
    let scale = 1;
    transitions.scale('test', 'out', (val) => (scale = val), {
      duration: 1,
      easing: Easing.linear,
    });

    engine.update(0.5);
    expect(scale).toBeCloseTo(0.5);

    engine.update(0.5);
    expect(scale).toBe(0);
  });
});

/*
describe('Timeline', () => {
    // ... (tests hidden)
});
*/
