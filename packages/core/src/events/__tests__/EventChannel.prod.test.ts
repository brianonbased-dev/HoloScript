/**
 * EventChannel + ChannelManager Production Tests
 *
 * subscribe/emit, filter, throttle, replay buffer, unsubscribe,
 * ChannelManager: create/get/remove/bridge.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventChannel, ChannelManager } from '../EventChannel';

describe('EventChannel — Production', () => {
  let ch: EventChannel<number>;

  beforeEach(() => {
    ch = new EventChannel<number>();
  });

  describe('subscribe / emit', () => {
    it('delivers to subscriber', () => {
      const cb = vi.fn();
      ch.subscribe(cb);
      ch.emit(42);
      expect(cb).toHaveBeenCalledWith(42);
    });

    it('delivers to multiple subscribers', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      ch.subscribe(cb1);
      ch.subscribe(cb2);
      ch.emit(1);
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });
  });

  describe('filter', () => {
    it('filters events', () => {
      const cb = vi.fn();
      ch.subscribe(cb, (n) => n > 5);
      ch.emit(3);
      ch.emit(10);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(10);
    });
  });

  describe('unsubscribe', () => {
    it('removes subscriber', () => {
      const cb = vi.fn();
      const id = ch.subscribe(cb);
      ch.unsubscribe(id);
      ch.emit(1);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('replay buffer', () => {
    it('replays buffered events to late subscriber', () => {
      const ch2 = new EventChannel<string>({ replayBufferSize: 3 });
      ch2.emit('a');
      ch2.emit('b');
      const cb = vi.fn();
      ch2.subscribe(cb);
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe('queries', () => {
    it('getSubscriberCount', () => {
      ch.subscribe(() => {});
      ch.subscribe(() => {});
      expect(ch.getSubscriberCount()).toBe(2);
    });

    it('getEmitCount', () => {
      ch.emit(1);
      ch.emit(2);
      expect(ch.getEmitCount()).toBe(2);
    });

    it('clear removes all', () => {
      ch.subscribe(() => {});
      ch.clear();
      expect(ch.getSubscriberCount()).toBe(0);
    });
  });
});

describe('ChannelManager — Production', () => {
  let mgr: ChannelManager;

  beforeEach(() => {
    mgr = new ChannelManager();
  });

  it('creates and retrieves channels', () => {
    mgr.createChannel('events');
    expect(mgr.getChannel('events')).toBeDefined();
  });

  it('removes channel', () => {
    mgr.createChannel('temp');
    mgr.removeChannel('temp');
    expect(mgr.getChannel('temp')).toBeUndefined();
  });

  it('getChannelNames', () => {
    mgr.createChannel('a');
    mgr.createChannel('b');
    expect(mgr.getChannelNames()).toEqual(['a', 'b']);
  });

  it('bridges channels', () => {
    const src = mgr.createChannel<number>('src');
    const tgt = mgr.createChannel<number>('tgt');
    const cb = vi.fn();
    tgt.subscribe(cb);
    mgr.bridge('src', 'tgt');
    src.emit(42);
    expect(cb).toHaveBeenCalledWith(42);
  });
});
