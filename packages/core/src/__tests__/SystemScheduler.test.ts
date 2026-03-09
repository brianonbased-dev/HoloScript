import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemScheduler } from '../ecs/SystemScheduler';

// =============================================================================
// C247 — System Scheduler
// =============================================================================

describe('SystemScheduler', () => {
  let sched: SystemScheduler;
  beforeEach(() => {
    sched = new SystemScheduler();
  });

  it('register and getSystemCount', () => {
    sched.register('physics', vi.fn(), 'update');
    expect(sched.getSystemCount()).toBe(1);
  });

  it('unregister removes system', () => {
    sched.register('physics', vi.fn());
    expect(sched.unregister('physics')).toBe(true);
    expect(sched.getSystemCount()).toBe(0);
  });

  it('enable/disable toggles system', () => {
    sched.register('render', vi.fn(), 'render');
    sched.disable('render');
    expect(sched.isEnabled('render')).toBe(false);
    sched.enable('render');
    expect(sched.isEnabled('render')).toBe(true);
  });

  it('update calls enabled systems', () => {
    const fn = vi.fn();
    sched.register('ai', fn, 'update');
    sched.update(1 / 60);
    expect(fn).toHaveBeenCalledWith(1 / 60);
  });

  it('update skips disabled systems', () => {
    const fn = vi.fn();
    sched.register('ai', fn, 'update');
    sched.disable('ai');
    sched.update(1 / 60);
    expect(fn).not.toHaveBeenCalled();
  });

  it('execution order respects phase ordering', () => {
    const order: string[] = [];
    sched.register('render', () => order.push('render'), 'render');
    sched.register('preUpdate', () => order.push('preUpdate'), 'preUpdate');
    sched.register('update', () => order.push('update'), 'update');
    sched.update(1 / 60);
    expect(order.indexOf('preUpdate')).toBeLessThan(order.indexOf('update'));
    expect(order.indexOf('update')).toBeLessThan(order.indexOf('render'));
  });

  it('priority within same phase determines order', () => {
    const order: string[] = [];
    sched.register('b', () => order.push('b'), 'update', 10);
    sched.register('a', () => order.push('a'), 'update', 1);
    sched.update(1 / 60);
    expect(order[0]).toBe('a');
    expect(order[1]).toBe('b');
  });

  it('dependencies are resolved before dependents', () => {
    const order: string[] = [];
    sched.register('dependent', () => order.push('dependent'), 'update', 0, ['dep']);
    sched.register('dep', () => order.push('dep'), 'update');
    sched.update(1 / 60);
    expect(order.indexOf('dep')).toBeLessThan(order.indexOf('dependent'));
  });

  it('fixedUpdate runs at fixed timestep', () => {
    const fn = vi.fn();
    sched.setFixedTimeStep(1 / 60);
    sched.register('physics', fn, 'fixedUpdate');
    // Feed 2 frames worth of time
    sched.update(2 / 60);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith(1 / 60);
  });

  it('getSystem returns system def', () => {
    sched.register('ai', vi.fn());
    const sys = sched.getSystem('ai');
    expect(sys).toBeDefined();
    expect(sys!.name).toBe('ai');
  });

  it('getSystemsByPhase filters correctly', () => {
    sched.register('a', vi.fn(), 'update');
    sched.register('b', vi.fn(), 'render');
    expect(sched.getSystemsByPhase('update')).toHaveLength(1);
    expect(sched.getSystemsByPhase('render')).toHaveLength(1);
  });

  it('getExecutionOrder returns sorted list', () => {
    sched.register('a', vi.fn(), 'update');
    sched.register('b', vi.fn(), 'preUpdate');
    const order = sched.getExecutionOrder();
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
  });

  it('setFixedTimeStep and getFixedTimeStep', () => {
    sched.setFixedTimeStep(1 / 30);
    expect(sched.getFixedTimeStep()).toBeCloseTo(1 / 30);
  });

  it('executionCount increments each update', () => {
    sched.register('ai', vi.fn());
    sched.update(1 / 60);
    sched.update(1 / 60);
    expect(sched.getSystem('ai')!.executionCount).toBe(2);
  });
});
