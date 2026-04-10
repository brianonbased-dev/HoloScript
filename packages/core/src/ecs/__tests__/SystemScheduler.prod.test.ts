/**
 * SystemScheduler — Production Test Suite
 *
 * Covers: register, unregister, phase ordering, priority, dependencies,
 * enable/disable, fixedUpdate, execution count, phase stats.
 */
import { describe, it, expect, vi } from 'vitest';
import { SystemScheduler } from '../SystemScheduler';

describe('SystemScheduler — Production', () => {
  // ─── Registration ─────────────────────────────────────────────────
  it('register adds system', () => {
    const s = new SystemScheduler();
    s.register('physics', vi.fn(), 'update');
    expect(s.getSystemCount()).toBe(1);
    expect(s.getSystem('physics')).toBeDefined();
  });

  it('unregister removes system', () => {
    const s = new SystemScheduler();
    s.register('physics', vi.fn());
    s.unregister('physics');
    expect(s.getSystemCount()).toBe(0);
  });

  // ─── Phase Ordering ───────────────────────────────────────────────
  it('systems execute in phase order: preUpdate → fixedUpdate → update → postUpdate → render', () => {
    const s = new SystemScheduler();
    const order: string[] = [];
    s.register('render', () => order.push('render'), 'render');
    s.register('pre', () => order.push('pre'), 'preUpdate');
    s.register('post', () => order.push('post'), 'postUpdate');
    s.register('upd', () => order.push('upd'), 'update');
    s.setFixedTimeStep(1 / 60);
    s.update(1 / 60);
    expect(order).toEqual(['pre', 'upd', 'post', 'render']);
  });

  // ─── Priority ─────────────────────────────────────────────────────
  it('lower priority runs first within same phase', () => {
    const s = new SystemScheduler();
    const order: string[] = [];
    s.register('b', () => order.push('b'), 'update', 10);
    s.register('a', () => order.push('a'), 'update', 1);
    s.update(1 / 60);
    expect(order).toEqual(['a', 'b']);
  });

  // ─── Dependencies ─────────────────────────────────────────────────
  it('dependency ordering is respected', () => {
    const s = new SystemScheduler();
    const order: string[] = [];
    s.register('render_sys', () => order.push('render'), 'update', 0, ['physics_sys']);
    s.register('physics_sys', () => order.push('physics'), 'update');
    s.update(1 / 60);
    expect(order.indexOf('physics')).toBeLessThan(order.indexOf('render'));
  });

  // ─── Enable / Disable ─────────────────────────────────────────────
  it('disabled system does not execute', () => {
    const s = new SystemScheduler();
    const fn = vi.fn();
    s.register('sys', fn);
    s.disable('sys');
    s.update(1 / 60);
    expect(fn).not.toHaveBeenCalled();
    expect(s.isEnabled('sys')).toBe(false);
  });

  it('re-enabled system executes again', () => {
    const s = new SystemScheduler();
    const fn = vi.fn();
    s.register('sys', fn);
    s.disable('sys');
    s.enable('sys');
    s.update(1 / 60);
    expect(fn).toHaveBeenCalled();
  });

  // ─── Fixed Update ─────────────────────────────────────────────────
  it('fixedUpdate runs at fixed timestep', () => {
    const s = new SystemScheduler();
    const fn = vi.fn();
    s.setFixedTimeStep(1 / 60);
    s.register('phys', fn, 'fixedUpdate');
    s.update(2 / 60); // Should run fixedUpdate twice
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ─── Execution Count ──────────────────────────────────────────────
  it('tracks execution count per system', () => {
    const s = new SystemScheduler();
    s.register('sys', vi.fn());
    s.update(1 / 60);
    s.update(1 / 60);
    expect(s.getSystem('sys')!.executionCount).toBe(2);
  });

  // ─── Phase Stats ──────────────────────────────────────────────────
  it('getPhaseStats records timing', () => {
    const s = new SystemScheduler();
    s.register(
      'sys',
      () => {
        for (let i = 0; i < 1000; i++) {}
      },
      'update'
    );
    s.update(1 / 60);
    const stats = s.getPhaseStats();
    const uStats = stats.get('update');
    expect(uStats).toBeDefined();
    expect(uStats!.systemCount).toBe(1);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getSystemsByPhase filters correctly', () => {
    const s = new SystemScheduler();
    s.register('a', vi.fn(), 'update');
    s.register('b', vi.fn(), 'render');
    s.register('c', vi.fn(), 'update');
    expect(s.getSystemsByPhase('update').length).toBe(2);
    expect(s.getSystemsByPhase('render').length).toBe(1);
  });

  it('getExecutionOrder returns resolved order', () => {
    const s = new SystemScheduler();
    s.register('a', vi.fn(), 'update');
    s.register('b', vi.fn(), 'preUpdate');
    const order = s.getExecutionOrder();
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
  });
});
