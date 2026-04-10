import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../events.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('on', () => {
    it('should subscribe to events', () => {
      const callback = vi.fn();
      bus.on('test', callback);
      bus.emit('test', { data: 'value' });
      expect(callback).toHaveBeenCalledWith({ data: 'value' });
    });

    it('should call callback multiple times on multiple emits', () => {
      const callback = vi.fn();
      bus.on('test', callback);
      bus.emit('test', 1);
      bus.emit('test', 2);
      bus.emit('test', 3);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should support multiple listeners for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      bus.on('test', callback1);
      bus.on('test', callback2);
      bus.emit('test', 'data');
      expect(callback1).toHaveBeenCalledWith('data');
      expect(callback2).toHaveBeenCalledWith('data');
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = bus.on('test', callback);
      bus.emit('test', 1);
      expect(callback).toHaveBeenCalledTimes(1);

      unsub();
      bus.emit('test', 2);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('once', () => {
    it('should only fire callback once', () => {
      const callback = vi.fn();
      bus.once('test', callback);
      bus.emit('test', 1);
      bus.emit('test', 2);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(1);
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = bus.once('test', callback);
      unsub();
      bus.emit('test', 1);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('should emit without data', () => {
      const callback = vi.fn();
      bus.on('test', callback);
      bus.emit('test');
      expect(callback).toHaveBeenCalledWith(undefined);
    });

    it('should not throw for events with no listeners', () => {
      expect(() => bus.emit('nonexistent')).not.toThrow();
    });

    it('should catch and log errors in handlers', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badCallback = vi.fn(() => {
        throw new Error('Handler error');
      });
      const goodCallback = vi.fn();

      bus.on('test', badCallback);
      bus.on('test', goodCallback);

      bus.emit('test', 'data');

      expect(badCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled(); // Should still be called
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('off', () => {
    it('should unsubscribe specific callback', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      bus.on('test', callback1);
      bus.on('test', callback2);

      bus.off('test', callback1);
      bus.emit('test', 'data');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should unsubscribe all callbacks when no callback specified', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      bus.on('test', callback1);
      bus.on('test', callback2);

      bus.off('test');
      bus.emit('test', 'data');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all listeners for all events', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      bus.on('event1', callback1);
      bus.on('event2', callback2);

      bus.clear();
      bus.emit('event1', 'data');
      bus.emit('event2', 'data');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should clear once listeners too', () => {
      const callback = vi.fn();
      bus.once('test', callback);
      bus.clear();
      bus.emit('test', 'data');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('typed events', () => {
    it('should support typed event data', () => {
      interface UserEvent {
        id: string;
        name: string;
      }

      // @ts-expect-error - TS2558 structural type mismatch
      const callback = vi.fn<[UserEvent], void>();
      // @ts-expect-error - TS2345 structural type mismatch
      bus.on<UserEvent>('userCreated', callback);
      bus.emit<UserEvent>('userCreated', { id: '123', name: 'Test' });

      expect(callback).toHaveBeenCalledWith({ id: '123', name: 'Test' });
    });
  });
});
