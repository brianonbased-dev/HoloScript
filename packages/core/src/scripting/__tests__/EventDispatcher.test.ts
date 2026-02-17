import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventDispatcher } from '../EventDispatcher';

describe('EventDispatcher', () => {
  let dispatcher: EventDispatcher;

  beforeEach(() => { dispatcher = new EventDispatcher(); });

  it('on and emit triggers callback', () => {
    const cb = vi.fn();
    dispatcher.on('hit', cb);
    dispatcher.emit('hit', { damage: 10 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].data.damage).toBe(10);
  });

  it('off removes listener', () => {
    const cb = vi.fn();
    const id = dispatcher.on('hit', cb);
    dispatcher.off(id);
    dispatcher.emit('hit');
    expect(cb).not.toHaveBeenCalled();
  });

  it('off returns false for unknown id', () => {
    expect(dispatcher.off('nonexistent')).toBe(false);
  });

  it('once fires only once', () => {
    const cb = vi.fn();
    dispatcher.once('spawn', cb);
    dispatcher.emit('spawn');
    dispatcher.emit('spawn');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('priority controls call order', () => {
    const order: number[] = [];
    dispatcher.on('tick', () => order.push(1), 1);
    dispatcher.on('tick', () => order.push(10), 10); // higher = called first
    dispatcher.emit('tick');
    expect(order).toEqual([10, 1]);
  });

  it('offAll removes all listeners for type', () => {
    dispatcher.on('a', vi.fn());
    dispatcher.on('a', vi.fn());
    dispatcher.offAll('a');
    expect(dispatcher.getListenerCount('a')).toBe(0);
  });

  it('emit returns GameEvent with timestamp', () => {
    const event = dispatcher.emit('test', { x: 1 }, 'player');
    expect(event.type).toBe('test');
    expect(event.source).toBe('player');
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('stopping propagation stops later listeners', () => {
    const cb1 = vi.fn((e) => { e.propagate = false; });
    const cb2 = vi.fn();
    dispatcher.on('stop', cb1, 10);
    dispatcher.on('stop', cb2, 1);
    dispatcher.emit('stop');
    expect(cb1).toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  // Deferred
  it('emitDeferred queues events', () => {
    const cb = vi.fn();
    dispatcher.on('later', cb);
    dispatcher.emitDeferred('later');
    expect(cb).not.toHaveBeenCalled();
    expect(dispatcher.getQueuedCount()).toBe(1);
  });

  it('flushDeferred dispatches queued events', () => {
    const cb = vi.fn();
    dispatcher.on('later', cb);
    dispatcher.emitDeferred('later');
    const flushed = dispatcher.flushDeferred();
    expect(flushed).toBe(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // Pause / Resume
  it('pause queues emit calls', () => {
    const cb = vi.fn();
    dispatcher.on('x', cb);
    dispatcher.pause();
    expect(dispatcher.isPaused()).toBe(true);
    dispatcher.emit('x');
    expect(cb).not.toHaveBeenCalled();
    dispatcher.resume();
    dispatcher.flushDeferred();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // History
  it('getEventHistory tracks dispatched events', () => {
    dispatcher.emit('a');
    dispatcher.emit('b');
    expect(dispatcher.getEventHistory()).toHaveLength(2);
  });

  // Counts
  it('getListenerCount', () => {
    dispatcher.on('a', vi.fn());
    dispatcher.on('b', vi.fn());
    expect(dispatcher.getListenerCount()).toBe(2);
    expect(dispatcher.getListenerCount('a')).toBe(1);
  });

  // Clear
  it('clear removes everything', () => {
    dispatcher.on('a', vi.fn());
    dispatcher.emitDeferred('a');
    dispatcher.emit('a');
    dispatcher.clear();
    expect(dispatcher.getListenerCount()).toBe(0);
    expect(dispatcher.getQueuedCount()).toBe(0);
    expect(dispatcher.getEventHistory()).toHaveLength(0);
  });
});
