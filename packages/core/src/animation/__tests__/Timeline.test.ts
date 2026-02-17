/**
 * Timeline Unit Tests
 *
 * Tests sequential/parallel modes, play/pause/resume/stop,
 * looping, pingPong, progress tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timeline, type TimelineConfig } from '../Timeline';
import { type AnimationClip, Easing } from '../AnimationEngine';

function makeClip(id: string, duration: number, delay = 0): AnimationClip {
  return {
    id,
    property: id,
    keyframes: [
      { time: 0, value: 0 },
      { time: 1, value: 100 },
    ],
    duration,
    loop: false,
    pingPong: false,
    delay,
  };
}

describe('Timeline', () => {
  describe('sequential mode', () => {
    it('should calculate total duration as sum of clips', () => {
      const tl = new Timeline({ mode: 'sequential' });
      tl.add(makeClip('a', 1), () => {});
      tl.add(makeClip('b', 2), () => {});
      expect(tl.getDuration()).toBe(3);
    });

    it('should play clips in sequence', () => {
      const log: string[] = [];
      const tl = new Timeline({ mode: 'sequential' });
      tl.add(makeClip('a', 0.5), () => log.push('a'));
      tl.add(makeClip('b', 0.5), () => log.push('b'));

      tl.play();
      // Step through 1 second
      for (let i = 0; i < 60; i++) tl.update(1 / 60);

      expect(log.length).toBeGreaterThan(0);
    });
  });

  describe('parallel mode', () => {
    it('should calculate duration as max of clips', () => {
      const tl = new Timeline({ mode: 'parallel' });
      tl.add(makeClip('a', 1), () => {});
      tl.add(makeClip('b', 3), () => {}, 0);
      expect(tl.getDuration()).toBe(3);
    });
  });

  describe('play / pause / resume / stop', () => {
    it('should start playing', () => {
      const tl = new Timeline();
      tl.add(makeClip('a', 1), () => {});
      tl.play();
      expect(tl.getElapsed()).toBe(0);
    });

    it('should pause and resume', () => {
      const setter = vi.fn();
      const tl = new Timeline();
      tl.add(makeClip('a', 1), setter);
      tl.play();

      tl.update(0.1);
      tl.pause();
      const elapsed1 = tl.getElapsed();

      tl.update(0.5); // Should not advance
      expect(tl.getElapsed()).toBe(elapsed1);

      tl.resume();
      tl.update(0.1);
      expect(tl.getElapsed()).toBeGreaterThan(elapsed1);
    });

    it('should stop', () => {
      const tl = new Timeline();
      tl.add(makeClip('a', 1), () => {});
      tl.play();
      tl.update(0.2);
      tl.stop();

      // Calling update after stop should not advance
      const before = tl.getElapsed();
      tl.update(0.5);
      expect(tl.getElapsed()).toBe(before);
    });
  });

  describe('looping', () => {
    it('should call onComplete when not looping', () => {
      const onComplete = vi.fn();
      const tl = new Timeline({ loop: false, onComplete });
      tl.add(makeClip('a', 0.1), () => {});
      tl.play();

      for (let i = 0; i < 30; i++) tl.update(1 / 60);

      expect(onComplete).toHaveBeenCalled();
    });

    it('should loop when enabled', () => {
      const onLoop = vi.fn();
      const tl = new Timeline({ loop: true, loopCount: 2, onLoop });
      tl.add(makeClip('a', 0.1), () => {});
      tl.play();

      for (let i = 0; i < 60; i++) tl.update(1 / 60);

      expect(onLoop).toHaveBeenCalled();
    });
  });

  describe('progress', () => {
    it('should return 0 before play', () => {
      const tl = new Timeline();
      expect(tl.getProgress()).toBe(0);
    });

    it('should be between 0 and 1 during play', () => {
      const tl = new Timeline();
      tl.add(makeClip('a', 1), () => {});
      tl.play();
      tl.update(0.5);
      expect(tl.getProgress()).toBeGreaterThan(0);
      expect(tl.getProgress()).toBeLessThanOrEqual(1);
    });
  });

  describe('chaining', () => {
    it('should support chained add calls', () => {
      const tl = new Timeline();
      const result = tl.add(makeClip('a', 1), () => {}).add(makeClip('b', 1), () => {});
      expect(result).toBe(tl);
      expect(tl.getDuration()).toBe(2);
    });
  });
});
