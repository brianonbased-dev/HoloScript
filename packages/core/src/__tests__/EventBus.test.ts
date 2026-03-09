import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events/EventBus';

describe('EventBus', () => {
  it('Emits and receives events', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.on('click', cb);
    bus.emit('click', { x: 10 });
    expect(cb).toHaveBeenCalledWith({ x: 10 });
  });

  it('Supports multiple listeners', () => {
    const bus = new EventBus();
    const cb1 = vi.fn(),
      cb2 = vi.fn();
    bus.on('tick', cb1);
    bus.on('tick', cb2);
    bus.emit('tick');
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it('Respects priority ordering', () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.on('e', () => order.push(1), 1);
    bus.on('e', () => order.push(3), 3);
    bus.on('e', () => order.push(2), 2);
    bus.emit('e');
    expect(order).toEqual([3, 2, 1]);
  });

  it('Once listener auto-removes', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.once('flash', cb);
    bus.emit('flash');
    bus.emit('flash');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('Unsubscribes by ID', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    const id = bus.on('e', cb);
    bus.off(id);
    bus.emit('e');
    expect(cb).not.toHaveBeenCalled();
  });

  it('Wildcard listener receives all events', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.on('*', cb);
    bus.emit('foo', 1);
    bus.emit('bar', 2);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenCalledWith({ event: 'foo', data: 1 });
  });

  it('Tracks event history', () => {
    const bus = new EventBus();
    bus.emit('a', 1);
    bus.emit('b', 2);
    const history = bus.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].event).toBe('a');
  });

  it('Pausing suppresses events', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.on('e', cb);
    bus.setPaused(true);
    bus.emit('e');
    expect(cb).not.toHaveBeenCalled();
    bus.setPaused(false);
    bus.emit('e');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('offAll removes all listeners for an event', () => {
    const bus = new EventBus();
    bus.on('e', vi.fn());
    bus.on('e', vi.fn());
    expect(bus.listenerCount('e')).toBe(2);
    bus.offAll('e');
    expect(bus.listenerCount('e')).toBe(0);
  });
});
