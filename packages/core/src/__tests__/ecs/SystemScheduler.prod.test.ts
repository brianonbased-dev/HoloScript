/**
 * SystemScheduler Production Tests
 *
 * Covers: register, unregister, enable/disable/isEnabled, getSystem,
 * getSystemCount, getExecutionOrder (phase ordering + dependency sort),
 * update (calls execute with dt, respects disabled, handles fixedUpdate,
 * records executionCount), getPhaseStats, getSystemsByPhase,
 * setFixedTimeStep/getFixedTimeStep.
 */

import { describe, it, expect, vi } from 'vitest';
import { SystemScheduler } from '@holoscript/engine/ecs/SystemScheduler';
import type { SystemPhase } from '@holoscript/engine/ecs/SystemScheduler';

function makeSS() {
  return new SystemScheduler();
}

// ── register / unregister ─────────────────────────────────────────────────────

describe('SystemScheduler — register', () => {
  it('registered system is returned by getSystem', () => {
    const s = makeSS();
    s.register('physics', () => {});
    const sys = s.getSystem('physics');
    expect(sys?.name).toBe('physics');
    expect(sys?.enabled).toBe(true);
  });

  it('getSystemCount increases after register', () => {
    const s = makeSS();
    s.register('A', () => {});
    s.register('B', () => {});
    expect(s.getSystemCount()).toBe(2);
    expect(s.systemCount).toBe(2);
  });

  it('unregister removes system and returns true', () => {
    const s = makeSS();
    s.register('X', () => {});
    expect(s.unregister('X')).toBe(true);
    expect(s.getSystem('X')).toBeUndefined();
  });

  it('unregister returns false for unknown system', () => {
    const s = makeSS();
    expect(s.unregister('ghost')).toBe(false);
  });

  it('re-registering same name replaces system', () => {
    const s = makeSS();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    s.register('sys', fn1);
    s.register('sys', fn2);
    s.update(0.016);
    expect(fn2).toHaveBeenCalled();
    expect(fn1).not.toHaveBeenCalled();
  });
});

// ── enable / disable ──────────────────────────────────────────────────────────

describe('SystemScheduler — enable / disable', () => {
  it('isEnabled returns true for newly registered system', () => {
    const s = makeSS();
    s.register('sys', () => {});
    expect(s.isEnabled('sys')).toBe(true);
  });

  it('disable prevents system from being called in update', () => {
    const s = makeSS();
    const fn = vi.fn();
    s.register('sys', fn);
    s.disable('sys');
    s.update(0.016);
    expect(fn).not.toHaveBeenCalled();
  });

  it('enable re-allows system to run', () => {
    const s = makeSS();
    const fn = vi.fn();
    s.register('sys', fn);
    s.disable('sys');
    s.enable('sys');
    s.update(0.016);
    expect(fn).toHaveBeenCalled();
  });

  it('isEnabled returns false after disable', () => {
    const s = makeSS();
    s.register('sys', () => {});
    s.disable('sys');
    expect(s.isEnabled('sys')).toBe(false);
  });

  it('isEnabled returns false for unknown system', () => {
    const s = makeSS();
    expect(s.isEnabled('ghost')).toBe(false);
  });
});

// ── execution order ───────────────────────────────────────────────────────────

describe('SystemScheduler — getExecutionOrder', () => {
  it('returns names of registered systems', () => {
    const s = makeSS();
    s.register('input', () => {}, 'preUpdate');
    s.register('render', () => {}, 'render');
    const order = s.getExecutionOrder();
    expect(order).toContain('input');
    expect(order).toContain('render');
  });

  it('preUpdate systems appear before render systems in order', () => {
    const s = makeSS();
    s.register('renderSys', () => {}, 'render');
    s.register('inputSys', () => {}, 'preUpdate');
    const order = s.getExecutionOrder();
    expect(order.indexOf('inputSys')).toBeLessThan(order.indexOf('renderSys'));
  });

  it('within same phase, lower priority runs first', () => {
    const s = makeSS();
    s.register('highPriority', () => {}, 'update', 0);
    s.register('lowPriority', () => {}, 'update', 10);
    const order = s.getExecutionOrder();
    expect(order.indexOf('highPriority')).toBeLessThan(order.indexOf('lowPriority'));
  });

  it('dependency ordering: dep runs before dependent', () => {
    const s = makeSS();
    s.register('A', () => {}, 'update', 0, []);
    s.register('B', () => {}, 'update', 0, ['A']); // B depends on A
    const order = s.getExecutionOrder();
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
  });

  it('circular dependencies do not throw', () => {
    const s = makeSS();
    s.register('X', () => {}, 'update', 0, ['Y']);
    s.register('Y', () => {}, 'update', 0, ['X']);
    expect(() => s.getExecutionOrder()).not.toThrow();
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('SystemScheduler — update', () => {
  it('calls registered system execute with dt', () => {
    const s = makeSS();
    const fn = vi.fn();
    s.register('sys', fn);
    s.update(0.016);
    expect(fn).toHaveBeenCalledWith(0.016);
  });

  it('executionCount increments on each update', () => {
    const s = makeSS();
    s.register('sys', () => {});
    s.update(0.016);
    s.update(0.016);
    expect(s.getSystem('sys')!.executionCount).toBe(2);
  });

  it('fixedUpdate system runs when accumulator exceeds timestep', () => {
    const s = makeSS();
    const fn = vi.fn();
    s.register('fixed', fn, 'fixedUpdate');
    s.setFixedTimeStep(0.016);
    s.update(0.02); // slightly above one step
    expect(fn).toHaveBeenCalled();
  });

  it('fixedUpdate system is NOT called if dt is too small', () => {
    const s = makeSS();
    const fn = vi.fn();
    s.register('fixed', fn, 'fixedUpdate');
    s.setFixedTimeStep(1.0); // 1 second step
    s.update(0.001); // tiny dt — not enough to accumulate
    expect(fn).not.toHaveBeenCalled();
  });

  it('non-fixed systems still run when fixed systems do not', () => {
    const s = makeSS();
    const normalFn = vi.fn();
    s.register('normal', normalFn, 'update');
    s.register('fixed', () => {}, 'fixedUpdate');
    s.setFixedTimeStep(1.0);
    s.update(0.016); // too small for fixed
    expect(normalFn).toHaveBeenCalled();
  });
});

// ── phase stats ───────────────────────────────────────────────────────────────

describe('SystemScheduler — getPhaseStats', () => {
  it('stats are empty before first update', () => {
    const s = makeSS();
    s.register('sys', () => {});
    expect(s.getPhaseStats().size).toBe(0);
  });

  it('stats populated after update', () => {
    const s = makeSS();
    s.register('sys', () => {}, 'update');
    s.update(0.016);
    const stats = s.getPhaseStats();
    expect(stats.has('update')).toBe(true);
    const updateStats = stats.get('update')!;
    expect(updateStats.systemCount).toBe(1);
  });
});

// ── getSystemsByPhase ─────────────────────────────────────────────────────────

describe('SystemScheduler — getSystemsByPhase', () => {
  it('returns only systems in the given phase', () => {
    const s = makeSS();
    s.register('preA', () => {}, 'preUpdate');
    s.register('renderA', () => {}, 'render');
    const renderSystems = s.getSystemsByPhase('render');
    expect(renderSystems.some((x) => x.name === 'renderA')).toBe(true);
    expect(renderSystems.some((x) => x.name === 'preA')).toBe(false);
  });

  it('returns empty array for phase with no systems', () => {
    const s = makeSS();
    expect(s.getSystemsByPhase('postUpdate')).toHaveLength(0);
  });
});

// ── fixed timestep ────────────────────────────────────────────────────────────

describe('SystemScheduler — fixedTimeStep', () => {
  it('getFixedTimeStep returns default ~1/60', () => {
    const s = makeSS();
    expect(s.getFixedTimeStep()).toBeCloseTo(1 / 60, 5);
  });

  it('setFixedTimeStep updates the value', () => {
    const s = makeSS();
    s.setFixedTimeStep(0.02);
    expect(s.getFixedTimeStep()).toBeCloseTo(0.02, 5);
  });
});
