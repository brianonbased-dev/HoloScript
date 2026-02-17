import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemScheduler } from '../SystemScheduler';

describe('SystemScheduler', () => {
  let scheduler: SystemScheduler;

  beforeEach(() => { scheduler = new SystemScheduler(); });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  it('registers and retrieves a system', () => {
    scheduler.register('physics', vi.fn(), 'update');
    expect(scheduler.getSystemCount()).toBe(1);
    expect(scheduler.getSystem('physics')).toBeDefined();
  });

  it('unregisters a system', () => {
    scheduler.register('ai', vi.fn());
    expect(scheduler.unregister('ai')).toBe(true);
    expect(scheduler.getSystemCount()).toBe(0);
  });

  it('unregister returns false for unknown system', () => {
    expect(scheduler.unregister('nope')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Enable / Disable
  // ---------------------------------------------------------------------------

  it('enables and disables systems', () => {
    scheduler.register('render', vi.fn(), 'render');
    expect(scheduler.isEnabled('render')).toBe(true);
    scheduler.disable('render');
    expect(scheduler.isEnabled('render')).toBe(false);
    scheduler.enable('render');
    expect(scheduler.isEnabled('render')).toBe(true);
  });

  it('disabled system is not called during update', () => {
    const fn = vi.fn();
    scheduler.register('s', fn, 'update');
    scheduler.disable('s');
    scheduler.update(0.016);
    expect(fn).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Execution Order & Phases
  // ---------------------------------------------------------------------------

  it('executes systems in phase order', () => {
    const order: string[] = [];
    scheduler.register('post', () => order.push('post'), 'postUpdate');
    scheduler.register('pre', () => order.push('pre'), 'preUpdate');
    scheduler.register('main', () => order.push('main'), 'update');
    scheduler.update(0.016);
    expect(order).toEqual(['pre', 'main', 'post']);
  });

  it('respects priority within a phase', () => {
    const order: string[] = [];
    scheduler.register('b', () => order.push('b'), 'update', 10);
    scheduler.register('a', () => order.push('a'), 'update', 1);
    scheduler.update(0.016);
    expect(order).toEqual(['a', 'b']);
  });

  it('getExecutionOrder returns resolved array', () => {
    scheduler.register('a', vi.fn(), 'update');
    scheduler.register('b', vi.fn(), 'preUpdate');
    const order = scheduler.getExecutionOrder();
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
  });

  it('handles dependencies in execution order', () => {
    const order: string[] = [];
    scheduler.register('b', () => order.push('b'), 'update', 0, ['a']);
    scheduler.register('a', () => order.push('a'), 'update');
    scheduler.update(0.016);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
  });

  // ---------------------------------------------------------------------------
  // Fixed Time Step
  // ---------------------------------------------------------------------------

  it('fixed update runs at fixed time step', () => {
    const fn = vi.fn();
    scheduler.setFixedTimeStep(1 / 60);
    scheduler.register('fixedPhys', fn, 'fixedUpdate');
    // Pass 2 frames worth of time
    scheduler.update(2 / 60);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('get/set fixed time step', () => {
    scheduler.setFixedTimeStep(0.02);
    expect(scheduler.getFixedTimeStep()).toBeCloseTo(0.02);
  });

  // ---------------------------------------------------------------------------
  // Phase Stats & Queries
  // ---------------------------------------------------------------------------

  it('tracks execution count', () => {
    scheduler.register('s', vi.fn(), 'update');
    scheduler.update(0.016);
    scheduler.update(0.016);
    expect(scheduler.getSystem('s')!.executionCount).toBe(2);
  });

  it('getPhaseStats returns stats after update', () => {
    scheduler.register('s', vi.fn(), 'update');
    scheduler.update(0.016);
    const stats = scheduler.getPhaseStats();
    expect(stats.has('update')).toBe(true);
    expect(stats.get('update')!.systemCount).toBe(1);
  });

  it('getSystemsByPhase filters correctly', () => {
    scheduler.register('a', vi.fn(), 'update');
    scheduler.register('b', vi.fn(), 'render');
    const renderSystems = scheduler.getSystemsByPhase('render');
    expect(renderSystems).toHaveLength(1);
    expect(renderSystems[0].name).toBe('b');
  });

  it('systemCount getter works', () => {
    scheduler.register('a', vi.fn());
    scheduler.register('b', vi.fn());
    expect(scheduler.systemCount).toBe(2);
  });
});
