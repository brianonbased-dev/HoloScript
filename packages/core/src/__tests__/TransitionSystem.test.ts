import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransitionSystem } from '@holoscript/engine/animation/TransitionSystem';

// =============================================================================
// C265 — Transition System
// =============================================================================

describe('TransitionSystem', () => {
  let trans: TransitionSystem;
  beforeEach(() => {
    trans = new TransitionSystem();
  });

  it('getEngine returns the internal AnimationEngine', () => {
    expect(trans.getEngine()).toBeDefined();
  });

  it('fade in calls setter progressing toward 1', () => {
    let lastValue = 0;
    trans.fade(
      'n1',
      'in',
      (v) => {
        lastValue = v;
      },
      { duration: 0.5 }
    );
    trans.update(0.5);
    expect(lastValue).toBeGreaterThan(0);
  });

  it('fade out calls setter progressing toward 0', () => {
    let lastValue = 1;
    trans.fade(
      'n1',
      'out',
      (v) => {
        lastValue = v;
      },
      { duration: 0.5 }
    );
    trans.update(0.5);
    expect(lastValue).toBeLessThan(1);
  });

  it('scale in calls setter progressing toward 1', () => {
    let lastValue = 0;
    trans.scale(
      'n1',
      'in',
      (v) => {
        lastValue = v;
      },
      { duration: 0.5 }
    );
    trans.update(0.5);
    expect(lastValue).toBeGreaterThan(0);
  });

  it('slide in changes offset toward 0', () => {
    let lastValue = 100;
    trans.slide(
      'n1',
      'in',
      'y',
      100,
      (v) => {
        lastValue = v;
      },
      { duration: 0.5 }
    );
    trans.update(0.5);
    expect(lastValue).toBeLessThan(100);
  });

  it('popIn triggers both scale and fade setters', () => {
    let scaleVal = 0;
    let opacityVal = 0;
    trans.popIn(
      'n1',
      (v) => {
        scaleVal = v;
      },
      (v) => {
        opacityVal = v;
      },
      { duration: 0.5 }
    );
    trans.update(0.5);
    expect(scaleVal).toBeGreaterThan(0);
    expect(opacityVal).toBeGreaterThan(0);
  });

  it('popOut triggers both scale and fade to 0', () => {
    let scaleVal = 1;
    let opacityVal = 1;
    trans.popOut(
      'n1',
      (v) => {
        scaleVal = v;
      },
      (v) => {
        opacityVal = v;
      },
      { duration: 0.5 }
    );
    trans.update(0.5);
    expect(scaleVal).toBeLessThan(1);
    expect(opacityVal).toBeLessThan(1);
  });

  it('onComplete callback fires after duration', () => {
    const cb = vi.fn();
    trans.fade('n1', 'in', () => {}, { duration: 0.3, onComplete: cb });
    trans.update(0.35);
    expect(cb).toHaveBeenCalled();
  });

  it('delay postpones animation start', () => {
    let lastValue = -1;
    trans.fade(
      'n1',
      'in',
      (v) => {
        lastValue = v;
      },
      { duration: 0.5, delay: 1 }
    );
    trans.update(0.1);
    // During delay, the setter may be called with the start value (0)
    expect(lastValue).toBeLessThanOrEqual(0);
  });

  it('multiple transitions can coexist', () => {
    let scaleVal = 0;
    let fadeVal = 0;
    trans.scale(
      'a',
      'in',
      (v) => {
        scaleVal = v;
      },
      { duration: 0.5 }
    );
    trans.fade(
      'b',
      'in',
      (v) => {
        fadeVal = v;
      },
      { duration: 0.5 }
    );
    trans.update(0.5);
    expect(scaleVal).toBeGreaterThan(0);
    expect(fadeVal).toBeGreaterThan(0);
  });
});
