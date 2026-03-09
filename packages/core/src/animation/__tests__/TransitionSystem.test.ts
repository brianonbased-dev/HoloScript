/**
 * TransitionSystem Unit Tests
 *
 * Tests fade, scale, slide transitions and combined pop effects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransitionSystem } from '../TransitionSystem';

describe('TransitionSystem', () => {
  let ts: TransitionSystem;

  beforeEach(() => {
    ts = new TransitionSystem();
  });

  describe('fade', () => {
    it('should animate opacity from 0 to 1 on fade-in', () => {
      let opacity = -1;
      ts.fade('node1', 'in', (v) => {
        opacity = v;
      });

      // Step through animation
      for (let i = 0; i < 30; i++) ts.update(1 / 60);

      expect(opacity).toBeCloseTo(1, 0);
    });

    it('should animate opacity from 1 to 0 on fade-out', () => {
      let opacity = -1;
      ts.fade('node1', 'out', (v) => {
        opacity = v;
      });

      for (let i = 0; i < 30; i++) ts.update(1 / 60);

      expect(opacity).toBeCloseTo(0, 0);
    });

    it('should call onComplete', () => {
      const onComplete = vi.fn();
      ts.fade('node1', 'in', () => {}, { duration: 0.1, onComplete });

      for (let i = 0; i < 60; i++) ts.update(1 / 60);

      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('scale', () => {
    it('should animate scale from 0 to 1 on scale-in', () => {
      let scale = -1;
      ts.scale('node1', 'in', (v) => {
        scale = v;
      });

      for (let i = 0; i < 60; i++) ts.update(1 / 60);

      expect(scale).toBeCloseTo(1, 0);
    });

    it('should animate scale to 0 on scale-out', () => {
      let scale = -1;
      ts.scale('node1', 'out', (v) => {
        scale = v;
      });

      for (let i = 0; i < 60; i++) ts.update(1 / 60);

      expect(scale).toBeCloseTo(0, 0);
    });
  });

  describe('slide', () => {
    it('should animate slide on y axis', () => {
      let offset = -999;
      ts.slide(
        'node1',
        'in',
        'y',
        100,
        (v) => {
          offset = v;
        },
        { duration: 0.2 }
      );

      for (let i = 0; i < 30; i++) ts.update(1 / 60);

      expect(offset).toBeCloseTo(0, 0);
    });
  });

  describe('popIn / popOut', () => {
    it('should animate both scale and opacity for popIn', () => {
      let scale = -1,
        opacity = -1;
      ts.popIn(
        'dialog',
        (s) => {
          scale = s;
        },
        (o) => {
          opacity = o;
        },
        { duration: 0.2 }
      );

      for (let i = 0; i < 30; i++) ts.update(1 / 60);

      expect(scale).toBeCloseTo(1, 0);
      expect(opacity).toBeCloseTo(1, 0);
    });

    it('should animate popOut to zero', () => {
      let scale = -1,
        opacity = -1;
      ts.popOut(
        'dialog',
        (s) => {
          scale = s;
        },
        (o) => {
          opacity = o;
        },
        { duration: 0.15 }
      );

      for (let i = 0; i < 30; i++) ts.update(1 / 60);

      expect(scale).toBeCloseTo(0, 0);
      expect(opacity).toBeCloseTo(0, 0);
    });
  });

  describe('getEngine', () => {
    it('should expose the internal engine', () => {
      expect(ts.getEngine()).toBeDefined();
    });
  });
});
