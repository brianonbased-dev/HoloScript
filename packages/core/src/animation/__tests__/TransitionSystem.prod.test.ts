/**
 * TransitionSystem.prod.test.ts
 * Production tests for TransitionSystem — fade, scale, slide, popIn/popOut,
 * update() frame stepping, and underlying AnimationEngine integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TransitionSystem } from '../TransitionSystem';

describe('TransitionSystem', () => {
  let ts: TransitionSystem;

  beforeEach(() => {
    ts = new TransitionSystem();
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------
  describe('construction', () => {
    it('creates an internal AnimationEngine', () => {
      expect(ts.getEngine()).toBeDefined();
    });

    it('accepts a custom engine', () => {
      const ts2 = new TransitionSystem(ts.getEngine());
      expect(ts2.getEngine()).toBe(ts.getEngine());
    });
  });

  // -------------------------------------------------------------------------
  // fade()
  // -------------------------------------------------------------------------
  describe('fade()', () => {
    it('fade in: calls setter from near 0 toward 1 over time', () => {
      const values: number[] = [];
      ts.fade('menu', 'in', lv => values.push(lv));
      ts.update(0.15); // advance half-way through 0.3 default duration
      expect(values.length).toBeGreaterThan(0);
      // After half duration the latest value should be above 0
      expect(values[values.length - 1]).toBeGreaterThan(0);
    });

    it('fade out: calls setter from near 1 toward 0 over time', () => {
      const values: number[] = [];
      ts.fade('menu', 'out', lv => values.push(lv), { duration: 0.3 });
      // Multiple small steps to accumulate several setter values
      for (let i = 0; i < 10; i++) ts.update(0.015);
      expect(values.length).toBeGreaterThan(1);
      // Fade out goes 1 → 0; first recorded value should exceed last recorded value
      expect(values[0]).toBeGreaterThan(values[values.length - 1]);
    });


    it('fade in: reaches 1 after full duration', () => {
      let last = 0;
      ts.fade('menu', 'in', lv => { last = lv; }, { duration: 0.1 });
      ts.update(0.1);
      expect(last).toBeCloseTo(1, 3);
    });

    it('fade out: reaches 0 after full duration', () => {
      let last = 1;
      ts.fade('menu', 'out', lv => { last = lv; }, { duration: 0.1 });
      ts.update(0.1);
      expect(last).toBeCloseTo(0, 3);
    });

    it('onComplete fires after fade finishes', () => {
      let completed = false;
      ts.fade('menu', 'in', () => {}, { duration: 0.1, onComplete: () => { completed = true; } });
      ts.update(0.2);
      expect(completed).toBe(true);
    });

    it('delay postpones start', () => {
      const values: number[] = [];
      ts.fade('menu', 'in', lv => values.push(lv), { duration: 0.1, delay: 0.2 });
      ts.update(0.1); // within delay — nothing should call setter yet
      expect(values).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // scale()
  // -------------------------------------------------------------------------
  describe('scale()', () => {
    it('scale in: starts near 0', () => {
      const values: number[] = [];
      ts.scale('btn', 'in', lv => values.push(lv), { duration: 0.1 });
      ts.update(0.001); // very small step
      if (values.length > 0) {
        expect(values[0]).toBeLessThan(0.5);
      }
    });

    it('scale out: finishes near 0', () => {
      let last = 1;
      ts.scale('btn', 'out', lv => { last = lv; }, { duration: 0.1 });
      ts.update(0.1);
      expect(last).toBeLessThan(0.1);
    });

    it('scale in: finishes near 1 after full duration', () => {
      let last = 0;
      ts.scale('btn', 'in', lv => { last = lv; }, { duration: 0.1 });
      ts.update(0.1);
      expect(last).toBeCloseTo(1, 2);
    });

    it('onComplete fires', () => {
      let done = false;
      ts.scale('btn', 'in', () => {}, { duration: 0.05, onComplete: () => { done = true; } });
      ts.update(0.1);
      expect(done).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // slide()
  // -------------------------------------------------------------------------
  describe('slide()', () => {
    it('slide in on y: starts at distance, moves toward 0', () => {
      const values: number[] = [];
      ts.slide('panel', 'in', 'y', 200, lv => values.push(lv), { duration: 0.1 });
      ts.update(0.001);
      if (values.length > 0) {
        expect(values[0]).toBeGreaterThan(100); // starts near 200
      }
    });

    it('slide in: finishes near 0', () => {
      let last = 200;
      ts.slide('panel', 'in', 'y', 200, lv => { last = lv; }, { duration: 0.1 });
      ts.update(0.1);
      expect(last).toBeCloseTo(0, 1);
    });

    it('slide out on x: starts at 0, moves toward distance', () => {
      const values: number[] = [];
      ts.slide('panel', 'out', 'x', 100, lv => values.push(lv), { duration: 0.1 });
      ts.update(0.001);
      if (values.length > 0) {
        expect(values[0]).toBeLessThan(50); // starts near 0
      }
    });

    it('slide out: finishes near distance', () => {
      let last = 0;
      ts.slide('panel', 'out', 'z', 50, lv => { last = lv; }, { duration: 0.1 });
      ts.update(0.1);
      expect(last).toBeCloseTo(50, 1);
    });

    it('works for all axes', () => {
      for (const axis of ['x', 'y', 'z'] as const) {
        let last = 0;
        const localTs = new TransitionSystem();
        localTs.slide('p', 'in', axis, 10, lv => { last = lv; }, { duration: 0.1 });
        localTs.update(0.1);
        expect(last).toBeCloseTo(0, 1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // popIn / popOut
  // -------------------------------------------------------------------------
  describe('popIn()', () => {
    it('calls both scale and opacity setters', () => {
      let scaleVal = 0;
      let opacVal = 0;
      ts.popIn('dialog', s => { scaleVal = s; }, o => { opacVal = o; }, { duration: 0.1 });
      ts.update(0.05);
      expect(scaleVal).toBeGreaterThan(0);
      expect(opacVal).toBeGreaterThan(0);
    });

    it('scale reaches 1 after full duration', () => {
      let lastScale = 0;
      ts.popIn('dialog', s => { lastScale = s; }, () => {}, { duration: 0.1 });
      ts.update(0.15);
      expect(lastScale).toBeCloseTo(1, 2);
    });

    it('opacity reaches 1 after fade portion (60% of duration)', () => {
      let lastOp = 0;
      ts.popIn('dialog', () => {}, o => { lastOp = o; }, { duration: 0.1 });
      ts.update(0.15);
      expect(lastOp).toBeCloseTo(1, 2);
    });
  });

  describe('popOut()', () => {
    it('calls both scale and opacity setters', () => {
      let scaleVal = 1;
      let opacVal = 1;
      ts.popOut('dialog', s => { scaleVal = s; }, o => { opacVal = o; }, { duration: 0.1 });
      ts.update(0.05);
      // Both should have been called and moved from initial 1 toward 0
      expect(scaleVal).toBeLessThan(1);
      expect(opacVal).toBeLessThan(1);
    });

    it('scale finishes near 0', () => {
      let last = 1;
      ts.popOut('d', s => { last = s; }, () => {}, { duration: 0.1 });
      ts.update(0.15);
      expect(last).toBeCloseTo(0, 2);
    });
  });

  // -------------------------------------------------------------------------
  // update() engine integration
  // -------------------------------------------------------------------------
  describe('update()', () => {
    it('multiple update calls accumulate time correctly', () => {
      let last = 0;
      ts.fade('x', 'in', lv => { last = lv; }, { duration: 0.4 });
      ts.update(0.1);
      ts.update(0.1);
      ts.update(0.1);
      ts.update(0.1); // total = 0.4
      expect(last).toBeCloseTo(1, 2);
    });

    it('clips past duration without throwing', () => {
      expect(() => {
        ts.fade('x', 'in', () => {}, { duration: 0.1 });
        ts.update(10); // far past end
      }).not.toThrow();
    });

    it('multiple independent transitions run in parallel', () => {
      let scaleV = 0;
      let fadeV = 0;
      ts.scale('a', 'in', v => { scaleV = v; }, { duration: 0.1 });
      ts.fade('b', 'out', v => { fadeV = v; }, { duration: 0.1 });
      ts.update(0.05);
      expect(scaleV).toBeGreaterThan(0);
      expect(fadeV).toBeGreaterThan(0); // fade-out from 1 is > 0 at midpoint
    });
  });
});
