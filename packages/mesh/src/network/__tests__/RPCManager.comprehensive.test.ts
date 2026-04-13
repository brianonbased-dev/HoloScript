/**
 * RPCManager — comprehensive edge-case test suite
 *
 * Covers: rate limiting with window reset, handler re-registration,
 * call history limits, execute with non-Error throws, respond with
 * both result and error, avgResponseTime calculation, multi-pending
 * timeout processing, and additional boundary conditions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RPCManager } from '@holoscript/core';

describe('RPCManager: comprehensive edge cases', () => {
  let rpc: RPCManager;

  beforeEach(() => {
    vi.useFakeTimers();
    rpc = new RPCManager('node-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Handler registration edge cases
  // ===========================================================================

  describe('handler registration edge cases', () => {
    it('re-registering a method overwrites the handler', () => {
      rpc.register('greet', () => 'hello');
      rpc.register('greet', () => 'goodbye');
      const { result } = rpc.execute(0, 'greet', [], 'peer');
      expect(result).toBe('goodbye');
    });

    it('unregistering a method that was never registered returns false', () => {
      expect(rpc.unregister('never-existed')).toBe(false);
    });

    it('hasHandler returns false after unregister', () => {
      rpc.register('test', () => {});
      rpc.unregister('test');
      expect(rpc.hasHandler('test')).toBe(false);
    });

    it('getRegisteredMethods returns empty array initially', () => {
      expect(rpc.getRegisteredMethods()).toEqual([]);
    });

    it('register with custom reliability and channel', () => {
      rpc.register('move', () => {}, 'unreliable', 3, 0);
      const call = rpc.call('move', [1, 2]);
      expect(call).not.toBeNull();
      expect(call!.reliability).toBe('unreliable');
      expect(call!.channel).toBe(3);
    });

    it('register with reliableOrdered mode', () => {
      rpc.register('chat', () => {}, 'reliableOrdered', 1, 0);
      const call = rpc.call('chat', ['hello']);
      expect(call!.reliability).toBe('reliableOrdered');
    });
  });

  // ===========================================================================
  // Call edge cases
  // ===========================================================================

  describe('call edge cases', () => {
    it('call to unregistered method uses default reliability and channel', () => {
      const call = rpc.call('unknown', [1, 2, 3]);
      expect(call).not.toBeNull();
      expect(call!.reliability).toBe('reliable'); // default
      expect(call!.channel).toBe(0); // default
    });

    it('each call gets a unique incrementing ID', () => {
      const call1 = rpc.call('a', []);
      const call2 = rpc.call('b', []);
      expect(call2!.id).toBeGreaterThan(call1!.id);
    });

    it('call stores correct args', () => {
      const call = rpc.call('test', [1, 'hello', { x: 42 }]);
      expect(call!.args).toEqual([1, 'hello', { x: 42 }]);
    });

    it('call stores correct senderId from constructor', () => {
      const call = rpc.call('test', []);
      expect(call!.senderId).toBe('node-1');
    });

    it('call stores correct target', () => {
      const call = rpc.call('test', [], 'others');
      expect(call!.target).toBe('others');
    });

    it('call defaults target to server', () => {
      const call = rpc.call('test', []);
      expect(call!.target).toBe('server');
    });

    it('call with empty args array', () => {
      const call = rpc.call('test', []);
      expect(call!.args).toEqual([]);
    });

    it('call history trims to maxHistory (200)', () => {
      for (let i = 0; i < 210; i++) {
        rpc.call('method', [i]);
      }
      expect(rpc.getCallHistory().length).toBe(200);
    });

    it('call increments totalCalls stat', () => {
      rpc.call('a', []);
      rpc.call('b', []);
      rpc.call('c', []);
      expect(rpc.getStats().totalCalls).toBe(3);
    });
  });

  // ===========================================================================
  // Rate limiting edge cases
  // ===========================================================================

  describe('rate limiting edge cases', () => {
    it('rate limit blocks after count reached', () => {
      rpc.register('limited', () => 'ok', 'reliable', 0, 3);
      expect(rpc.call('limited', [])).not.toBeNull();
      expect(rpc.call('limited', [])).not.toBeNull();
      expect(rpc.call('limited', [])).not.toBeNull();
      expect(rpc.call('limited', [])).toBeNull(); // 4th blocked
    });

    it('rate limit resets after 1 second window', () => {
      rpc.register('limited', () => 'ok', 'reliable', 0, 2);
      rpc.call('limited', []);
      rpc.call('limited', []);
      expect(rpc.call('limited', [])).toBeNull(); // blocked

      vi.advanceTimersByTime(1100); // past 1-second window
      expect(rpc.call('limited', [])).not.toBeNull(); // allowed again
    });

    it('rate limit of 0 means unlimited', () => {
      rpc.register('unlimited', () => 'ok', 'reliable', 0, 0);
      for (let i = 0; i < 100; i++) {
        expect(rpc.call('unlimited', [])).not.toBeNull();
      }
    });

    it('unregistered method has no rate limit', () => {
      // Calling a method without a handler — no rate limit check
      for (let i = 0; i < 50; i++) {
        expect(rpc.call('no-handler', [])).not.toBeNull();
      }
    });
  });

  // ===========================================================================
  // Execute edge cases
  // ===========================================================================

  describe('execute edge cases', () => {
    it('execute with no args', () => {
      rpc.register('noop', () => 'done');
      const { result } = rpc.execute(0, 'noop', [], 'peer');
      expect(result).toBe('done');
    });

    it('execute handler receives correct arguments', () => {
      const spy = vi.fn((...args: unknown[]) => args.join('-'));
      rpc.register('join', spy);
      rpc.execute(0, 'join', ['a', 'b', 'c'], 'peer');
      expect(spy).toHaveBeenCalledWith('a', 'b', 'c');
    });

    it('execute catches non-Error throws (string)', () => {
      rpc.register('throw-string', () => {
        throw 'raw string error';
      });
      const { error } = rpc.execute(0, 'throw-string', [], 'peer');
      expect(error).toBe('raw string error');
    });

    it('execute catches non-Error throws (number)', () => {
      rpc.register('throw-num', () => {
        throw 42;
      });
      const { error } = rpc.execute(0, 'throw-num', [], 'peer');
      expect(error).toBe('42');
    });

    it('execute increments totalErrors on handler error', () => {
      rpc.register('crash', () => {
        throw new Error('boom');
      });
      const before = rpc.getStats().totalErrors;
      rpc.execute(0, 'crash', [], 'peer');
      expect(rpc.getStats().totalErrors).toBe(before + 1);
    });

    it('execute returns undefined result for unknown method', () => {
      const { result } = rpc.execute(0, 'missing', [], 'peer');
      expect(result).toBeUndefined();
    });

    it('handler returning undefined is valid', () => {
      rpc.register('void-fn', () => undefined);
      const { result, error } = rpc.execute(0, 'void-fn', [], 'peer');
      expect(result).toBeUndefined();
      expect(error).toBeUndefined();
    });

    it('handler returning null is valid', () => {
      rpc.register('null-fn', () => null);
      const { result, error } = rpc.execute(0, 'null-fn', [], 'peer');
      expect(result).toBeNull();
      expect(error).toBeUndefined();
    });
  });

  // ===========================================================================
  // Respond edge cases
  // ===========================================================================

  describe('respond edge cases', () => {
    it('respond updates avgResponseTime', () => {
      const call = rpc.call('a', [])!;
      vi.advanceTimersByTime(100);
      rpc.respond(call.id, 'ok');
      const stats = rpc.getStats();
      expect(stats.avgResponseTime).toBeGreaterThanOrEqual(100);
    });

    it('multiple responds average correctly', () => {
      const c1 = rpc.call('a', [])!;
      vi.advanceTimersByTime(100);
      rpc.respond(c1.id, 'ok');

      const c2 = rpc.call('b', [])!;
      vi.advanceTimersByTime(200);
      rpc.respond(c2.id, 'ok');

      const stats = rpc.getStats();
      // Average of ~100 and ~200 should be ~150
      expect(stats.avgResponseTime).toBeGreaterThanOrEqual(100);
      expect(stats.totalResponses).toBe(2);
    });

    it('respond with error sets error on call and increments error stat', () => {
      const call = rpc.call('test', [])!;
      rpc.respond(call.id, undefined, 'network failure');
      const stats = rpc.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);
    });

    it('respond removes call from pending', () => {
      const call = rpc.call('test', [])!;
      expect(rpc.getPendingCount()).toBe(1);
      rpc.respond(call.id, 'result');
      expect(rpc.getPendingCount()).toBe(0);
    });

    it('respond to already-responded call returns false', () => {
      const call = rpc.call('test', [])!;
      rpc.respond(call.id, 'first');
      // Call is removed from pending, so second respond fails
      expect(rpc.respond(call.id, 'second')).toBe(false);
    });
  });

  // ===========================================================================
  // Timeout processing edge cases
  // ===========================================================================

  describe('timeout processing edge cases', () => {
    it('processTimeouts returns empty when no calls pending', () => {
      expect(rpc.processTimeouts()).toEqual([]);
    });

    it('processTimeouts does not time out recent calls', () => {
      rpc.call('fresh', []);
      expect(rpc.processTimeouts(5000)).toEqual([]);
    });

    it('processTimeouts handles multiple timed-out calls', () => {
      const c1 = rpc.call('a', [])!;
      const c2 = rpc.call('b', [])!;
      // Backdate both
      (c1 as any).timestamp = Date.now() - 10000;
      (c2 as any).timestamp = Date.now() - 10000;
      const timedOut = rpc.processTimeouts(5000);
      expect(timedOut.length).toBe(2);
    });

    it('processTimeouts only removes timed-out calls from pending', () => {
      const old = rpc.call('old', [])!;
      (old as any).timestamp = Date.now() - 10000;
      rpc.call('fresh', []); // still recent
      rpc.processTimeouts(5000);
      expect(rpc.getPendingCount()).toBe(1); // only fresh remains
    });

    it('processTimeouts marks calls with error and responded', () => {
      const call = rpc.call('slow', [])!;
      (call as any).timestamp = Date.now() - 10000;
      const timedOut = rpc.processTimeouts(5000);
      expect(timedOut[0].error).toBe('RPC timed out');
      expect(timedOut[0].responded).toBe(true);
    });

    it('processTimeouts increments totalErrors', () => {
      const call = rpc.call('slow', [])!;
      (call as any).timestamp = Date.now() - 10000;
      const before = rpc.getStats().totalErrors;
      rpc.processTimeouts(5000);
      expect(rpc.getStats().totalErrors).toBe(before + 1);
    });

    it('setTimeout changes the default timeout for processTimeouts', () => {
      rpc.setTimeout(500);
      const call = rpc.call('test', [])!;
      (call as any).timestamp = Date.now() - 600;
      const timedOut = rpc.processTimeouts(); // uses default 500ms
      expect(timedOut.length).toBe(1);
    });
  });

  // ===========================================================================
  // Query methods
  // ===========================================================================

  describe('query methods', () => {
    it('getCallsByMethod returns empty for nonexistent method', () => {
      expect(rpc.getCallsByMethod('nothing')).toEqual([]);
    });

    it('getCallsByMethod returns correct subset', () => {
      rpc.call('ping', []);
      rpc.call('pong', []);
      rpc.call('ping', [1]);
      rpc.call('pong', [2]);
      expect(rpc.getCallsByMethod('ping').length).toBe(2);
      expect(rpc.getCallsByMethod('pong').length).toBe(2);
    });

    it('getCallHistory returns a copy', () => {
      rpc.call('test', []);
      const h1 = rpc.getCallHistory();
      const h2 = rpc.getCallHistory();
      expect(h1).toEqual(h2);
      expect(h1).not.toBe(h2);
    });

    it('getStats returns a copy', () => {
      const s1 = rpc.getStats();
      const s2 = rpc.getStats();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });

    it('getPendingCount reflects current pending calls', () => {
      expect(rpc.getPendingCount()).toBe(0);
      rpc.call('a', []);
      rpc.call('b', []);
      expect(rpc.getPendingCount()).toBe(2);
    });
  });

  // ===========================================================================
  // Clear
  // ===========================================================================

  describe('clear', () => {
    it('clear resets all internal state', () => {
      rpc.call('a', []);
      rpc.call('b', []);
      const call = rpc.call('c', [])!;
      rpc.respond(call.id, 'ok');
      rpc.clear();

      expect(rpc.getPendingCount()).toBe(0);
      expect(rpc.getCallHistory()).toEqual([]);
      const stats = rpc.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalResponses).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.avgResponseTime).toBe(0);
    });

    it('handlers are preserved after clear', () => {
      rpc.register('persist', () => 'still here');
      rpc.clear();
      expect(rpc.hasHandler('persist')).toBe(true);
      const { result } = rpc.execute(0, 'persist', [], 'peer');
      expect(result).toBe('still here');
    });
  });
});
