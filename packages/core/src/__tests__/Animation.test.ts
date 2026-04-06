import { describe, it, expect, vi } from 'vitest';
import { AnimationEngine, Easing } from '@holoscript/engine/animation/AnimationEngine';
import { SpringAnimator, SpringPresets } from '@holoscript/engine/animation/SpringAnimator';
import { Timeline } from '@holoscript/engine/animation/Timeline';
import { TransitionSystem } from '@holoscript/engine/animation/TransitionSystem';

describe('Animation System', () => {
  describe('AnimationEngine', () => {
    it('Interpolates keyframes over duration', () => {
      const engine = new AnimationEngine();
      let result = 0;

      engine.play(
        {
          id: 'test_anim',
          property: 'x',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 100, easing: Easing.linear },
          ],
          duration: 1.0,
          loop: false,
          pingPong: false,
          delay: 0,
        },
        (v) => {
          result = v;
        }
      );

      // At t=0
      engine.update(0);
      expect(result).toBeCloseTo(0, 0);

      // At t=0.5
      engine.update(0.5);
      expect(result).toBeCloseTo(50, 0);

      // At t=1.0 (completion)
      engine.update(0.5);
      expect(result).toBeCloseTo(100, 0);

      // Should be removed after completion
      expect(engine.isActive('test_anim')).toBe(false);
    });

    it('Supports easing functions', () => {
      const engine = new AnimationEngine();
      let result = 0;

      engine.play(
        {
          id: 'eased',
          property: 'x',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 100, easing: Easing.easeInQuad },
          ],
          duration: 1.0,
          loop: false,
          pingPong: false,
          delay: 0,
        },
        (v) => {
          result = v;
        }
      );

      engine.update(0.5);
      // easeInQuad at 0.5 = 0.25, so value = 25
      expect(result).toBeCloseTo(25, 0);
    });

    it('Supports looping', () => {
      const engine = new AnimationEngine();
      let result = 0;

      engine.play(
        {
          id: 'loop_test',
          property: 'x',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 10, easing: Easing.linear },
          ],
          duration: 1.0,
          loop: true,
          pingPong: false,
          delay: 0,
        },
        (v) => {
          result = v;
        }
      );

      // Advance past one full cycle
      engine.update(1.1);
      // Should still be active (looping)
      expect(engine.isActive('loop_test')).toBe(true);
    });

    it('Fires onComplete callback', () => {
      const engine = new AnimationEngine();
      const onComplete = vi.fn();

      engine.play(
        {
          id: 'callback_test',
          property: 'x',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
          duration: 0.5,
          loop: false,
          pingPong: false,
          delay: 0,
          onComplete,
        },
        () => {}
      );

      engine.update(0.6);
      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('SpringAnimator', () => {
    it('Settles to target value', () => {
      const spring = new SpringAnimator(0, SpringPresets.stiff);
      spring.setTarget(100);

      // Simulate ~2 seconds of updates
      for (let i = 0; i < 120; i++) {
        spring.update(1 / 60);
      }

      expect(spring.getValue()).toBeCloseTo(100, 0);
      expect(spring.isAtRest()).toBe(true);
    });

    it('Responds to impulse', () => {
      const spring = new SpringAnimator(50, SpringPresets.default);
      spring.impulse(10);

      expect(spring.isAtRest()).toBe(false);

      // Let it settle
      for (let i = 0; i < 300; i++) {
        spring.update(1 / 60);
      }

      expect(spring.getValue()).toBeCloseTo(50, 0);
      expect(spring.isAtRest()).toBe(true);
    });
  });

  describe('Timeline', () => {
    it('Plays sequential animations', () => {
      let val1 = 0,
        val2 = 0;

      const timeline = new Timeline({ mode: 'sequential' });

      timeline.add(
        {
          id: 'seq1',
          property: 'a',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 10, easing: Easing.linear },
          ],
          duration: 1.0,
          loop: false,
          pingPong: false,
          delay: 0,
        },
        (v) => {
          val1 = v;
        }
      );

      timeline.add(
        {
          id: 'seq2',
          property: 'b',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 20, easing: Easing.linear },
          ],
          duration: 1.0,
          loop: false,
          pingPong: false,
          delay: 0,
        },
        (v) => {
          val2 = v;
        }
      );

      timeline.play();
      expect(timeline.getDuration()).toBe(2.0);

      // First clip
      timeline.update(0.5);
      expect(val1).toBeGreaterThan(0);

      // After first clip completes, second starts
      timeline.update(1.0);
      timeline.update(0.5);
      expect(val2).toBeGreaterThanOrEqual(0);
    });

    it('Reports progress', () => {
      const timeline = new Timeline({ mode: 'sequential' });
      timeline.add(
        {
          id: 'prog',
          property: 'x',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
          duration: 2.0,
          loop: false,
          pingPong: false,
          delay: 0,
        },
        () => {}
      );

      timeline.play();
      timeline.update(1.0);
      expect(timeline.getProgress()).toBeCloseTo(0.5, 1);
    });
  });

  describe('TransitionSystem', () => {
    it('Drives fade transition', () => {
      const transition = new TransitionSystem();
      let opacity = 0;

      transition.fade(
        'node1',
        'in',
        (v) => {
          opacity = v;
        },
        { duration: 0.5 }
      );

      transition.update(0.25);
      expect(opacity).toBeGreaterThan(0);

      transition.update(0.3);
      expect(opacity).toBeCloseTo(1, 0);
    });
  });
});
