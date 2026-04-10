import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, getSharedEventBus, setSharedEventBus } from '../EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('on + emit delivers data to subscriber', () => {
    const handler = vi.fn();
    bus.on('click', handler);
    bus.emit('click', { x: 10 });
    expect(handler).toHaveBeenCalledWith({ x: 10 });
  });

  it('once auto-removes after first fire', () => {
    const handler = vi.fn();
    bus.once('ping', handler);
    bus.emit('ping', 1);
    bus.emit('ping', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('off removes listener by id', () => {
    const handler = vi.fn();
    const id = bus.on('evt', handler);
    bus.off(id);
    bus.emit('evt');
    expect(handler).not.toHaveBeenCalled();
  });

  it('offAll removes all listeners for event', () => {
    bus.on('evt', vi.fn());
    bus.on('evt', vi.fn());
    bus.offAll('evt');
    expect(bus.listenerCount('evt')).toBe(0);
  });

  it('priority ordering: higher priority fires first', () => {
    const order: number[] = [];
    bus.on('evt', () => order.push(1), 1);
    bus.on('evt', () => order.push(10), 10);
    bus.on('evt', () => order.push(5), 5);
    bus.emit('evt');
    expect(order).toEqual([10, 5, 1]);
  });

  it('wildcard * receives all events', () => {
    const handler = vi.fn();
    bus.on('*', handler);
    bus.emit('foo', 'data1');
    bus.emit('bar', 'data2');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({ event: 'foo', data: 'data1' });
  });

  it('getHistory records emitted events', () => {
    bus.emit('a', 1);
    bus.emit('b', 2);
    const history = bus.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].event).toBe('a');
  });

  it('history caps at maxHistory', () => {
    for (let i = 0; i < 150; i++) bus.emit('spam', i);
    expect(bus.getHistory().length).toBe(100);
  });

  it('setPaused blocks emission', () => {
    const handler = vi.fn();
    bus.on('evt', handler);
    bus.setPaused(true);
    bus.emit('evt');
    expect(handler).not.toHaveBeenCalled();
    bus.setPaused(false);
    bus.emit('evt');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('clear removes all listeners and history', () => {
    bus.on('evt', vi.fn());
    bus.emit('evt');
    bus.clear();
    expect(bus.listenerCount('evt')).toBe(0);
    expect(bus.getHistory().length).toBe(0);
  });

  it('listenerCount returns correct count', () => {
    expect(bus.listenerCount('evt')).toBe(0);
    bus.on('evt', vi.fn());
    bus.on('evt', vi.fn());
    expect(bus.listenerCount('evt')).toBe(2);
  });

  it('shared event bus singleton', () => {
    const custom = new EventBus();
    setSharedEventBus(custom);
    expect(getSharedEventBus()).toBe(custom);
  });
});
