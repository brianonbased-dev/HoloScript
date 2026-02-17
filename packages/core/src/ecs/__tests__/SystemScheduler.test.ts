import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemScheduler } from '../SystemScheduler';

describe('SystemScheduler', () => {
  let scheduler: SystemScheduler;

  beforeEach(() => {
    scheduler = new SystemScheduler();
  });

  it('registers and counts systems', () => {
    scheduler.register('physics', vi.fn());
    scheduler.register('render', vi.fn(), 'render');
    expect(scheduler.getSystemCount()).toBe(2);
  });

  it('unregisters a system', () => {
    scheduler.register('a', vi.fn());
    expect(scheduler.unregister('a')).toBe(true);
    expect(scheduler.getSystemCount()).toBe(0);
  });

  it('enable/disable toggles', () => {
    scheduler.register('sys', vi.fn());
    expect(scheduler.isEnabled('sys')).toBe(true);
    scheduler.disable('sys');
    expect(scheduler.isEnabled('sys')).toBe(false);
    scheduler.enable('sys');
    expect(scheduler.isEnabled('sys')).toBe(true);
  });

  it('disabled systems are not executed', () => {
    const fn = vi.fn();
    scheduler.register('skipped', fn);
    scheduler.disable('skipped');
    scheduler.update(1 / 60);
    expect(fn).not.toHaveBeenCalled();
  });

  it('executes systems in phase order', () => {
    const order: string[] = [];
    scheduler.register('post', () => order.push('post'), 'postUpdate');
    scheduler.register('pre', () => order.push('pre'), 'preUpdate');
    scheduler.register('main', () => order.push('main'), 'update');
    scheduler.update(1 / 60);
    expect(order).toEqual(['pre', 'main', 'post']);
  });

  it('executes systems by priority within phase', () => {
    const order: string[] = [];
    scheduler.register('low', () => order.push('low'), 'update', 10);
    scheduler.register('high', () => order.push('high'), 'update', 0);
    scheduler.update(1 / 60);
    expect(order).toEqual(['high', 'low']);
  });

  it('getExecutionOrder returns ordered system names', () => {
    scheduler.register('a', vi.fn(), 'update');
    scheduler.register('b', vi.fn(), 'preUpdate');
    const order = scheduler.getExecutionOrder();
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
  });

  it('getSystemsByPhase filters correctly', () => {
    scheduler.register('x', vi.fn(), 'render');
    scheduler.register('y', vi.fn(), 'update');
    const renderSystems = scheduler.getSystemsByPhase('render');
    expect(renderSystems.length).toBe(1);
    expect(renderSystems[0].name).toBe('x');
  });

  it('tracks execution count', () => {
    const fn = vi.fn();
    scheduler.register('counted', fn, 'update');
    scheduler.update(1 / 60);
    scheduler.update(1 / 60);
    const sys = scheduler.getSystem('counted');
    expect(sys!.executionCount).toBe(2);
  });

  it('sets and gets fixed time step', () => {
    scheduler.setFixedTimeStep(1 / 30);
    expect(scheduler.getFixedTimeStep()).toBeCloseTo(1 / 30);
  });

  it('getPhaseStats returns phase timing data', () => {
    scheduler.register('s', vi.fn(), 'update');
    scheduler.update(1 / 60);
    const stats = scheduler.getPhaseStats();
    expect(stats.has('update')).toBe(true);
  });
});
