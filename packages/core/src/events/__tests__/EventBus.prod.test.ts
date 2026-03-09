/**
 * EventBus — Production Test Suite
 *
 * Covers: on, once, off, offAll, emit, priority ordering,
 * wildcard, history, pause, clear.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus, getSharedEventBus } from '../EventBus';

describe('EventBus — Production', () => {
  // ─── Basic Pub/Sub ────────────────────────────────────────────────
  it('on + emit works', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.on('test', cb);
    bus.emit('test', { x: 1 });
    expect(cb).toHaveBeenCalledWith({ x: 1 });
  });

  // ─── Once ─────────────────────────────────────────────────────────
  it('once listener auto-removes after first fire', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.once('test', cb);
    bus.emit('test');
    bus.emit('test');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // ─── Off ──────────────────────────────────────────────────────────
  it('off removes specific listener', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    const id = bus.on('test', cb);
    bus.off(id);
    bus.emit('test');
    expect(cb).not.toHaveBeenCalled();
  });

  it('offAll removes all listeners for event', () => {
    const bus = new EventBus();
    const cb1 = vi.fn(),
      cb2 = vi.fn();
    bus.on('test', cb1);
    bus.on('test', cb2);
    bus.offAll('test');
    bus.emit('test');
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  // ─── Priority ─────────────────────────────────────────────────────
  it('higher priority fires first', () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.on('test', () => order.push(1), 1);
    bus.on('test', () => order.push(10), 10);
    bus.on('test', () => order.push(5), 5);
    bus.emit('test');
    expect(order).toEqual([10, 5, 1]);
  });

  // ─── Wildcard ─────────────────────────────────────────────────────
  it('wildcard * catches all events', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.on('*', cb);
    bus.emit('foo', 42);
    expect(cb).toHaveBeenCalledWith({ event: 'foo', data: 42 });
  });

  // ─── History ──────────────────────────────────────────────────────
  it('history records emitted events', () => {
    const bus = new EventBus();
    bus.emit('a');
    bus.emit('b');
    const h = bus.getHistory();
    expect(h.length).toBe(2);
    expect(h[0].event).toBe('a');
  });

  // ─── Pause ────────────────────────────────────────────────────────
  it('paused bus does not emit', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.on('test', cb);
    bus.setPaused(true);
    bus.emit('test');
    expect(cb).not.toHaveBeenCalled();
    bus.setPaused(false);
    bus.emit('test');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // ─── Clear ────────────────────────────────────────────────────────
  it('clear removes all listeners and history', () => {
    const bus = new EventBus();
    bus.on('test', vi.fn());
    bus.emit('test');
    bus.clear();
    expect(bus.listenerCount('test')).toBe(0);
    expect(bus.getHistory().length).toBe(0);
  });

  // ─── Listener Count ───────────────────────────────────────────────
  it('listenerCount tracks listeners per event', () => {
    const bus = new EventBus();
    bus.on('a', vi.fn());
    bus.on('a', vi.fn());
    bus.on('b', vi.fn());
    expect(bus.listenerCount('a')).toBe(2);
    expect(bus.listenerCount('b')).toBe(1);
  });

  // ─── Singleton ────────────────────────────────────────────────────
  it('getSharedEventBus returns same instance', () => {
    const a = getSharedEventBus();
    const b = getSharedEventBus();
    expect(a).toBe(b);
  });
});
