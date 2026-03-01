/**
 * RPCManager — production test suite
 *
 * Tests: handler registration/unregistration, call creation, execute,
 * respond, timeout processing, rate limiting, stats, history, and clear.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RPCManager } from '../RPCManager';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('RPCManager: production', () => {
  let rpc: RPCManager;

  beforeEach(() => {
    rpc = new RPCManager('local-server');
  });

  // ─── Registration ─────────────────────────────────────────────────────────
  describe('register / unregister / hasHandler', () => {
    it('registers a handler', () => {
      rpc.register('greet', () => 'hello');
      expect(rpc.hasHandler('greet')).toBe(true);
    });

    it('unregisters a handler', () => {
      rpc.register('greet', () => 'hello');
      rpc.unregister('greet');
      expect(rpc.hasHandler('greet')).toBe(false);
    });

    it('returns false unregistering an unknown method', () => {
      expect(rpc.unregister('nonexistent')).toBe(false);
    });

    it('getRegisteredMethods returns all methods', () => {
      rpc.register('a', vi.fn());
      rpc.register('b', vi.fn());
      expect(rpc.getRegisteredMethods()).toContain('a');
      expect(rpc.getRegisteredMethods()).toContain('b');
    });
  });

  // ─── Call ─────────────────────────────────────────────────────────────────
  describe('call', () => {
    it('creates a pending RPC call', () => {
      rpc.register('ping', () => 'pong');
      const call = rpc.call('ping', []);
      expect(call).not.toBeNull();
      expect(call!.method).toBe('ping');
      expect(call!.responded).toBe(false);
    });

    it('increments totalCalls stat', () => {
      rpc.register('ping', () => 'pong');
      rpc.call('ping', []);
      expect(rpc.getStats().totalCalls).toBe(1);
    });

    it('adds call to history', () => {
      rpc.register('ping', () => 'pong');
      rpc.call('ping', []);
      expect(rpc.getCallHistory().length).toBe(1);
    });

    it('call for unregistered method still creates RPC (uses default reliability)', () => {
      const call = rpc.call('unknown', []);
      expect(call).not.toBeNull();
    });

    it('assigns target from argument', () => {
      const call = rpc.call('x', [], 'all');
      expect(call!.target).toBe('all');
    });
  });

  // ─── Execute ──────────────────────────────────────────────────────────────
  describe('execute', () => {
    it('executes a registered handler and returns result', () => {
      rpc.register('add', (a, b) => (a as number) + (b as number));
      const { result, error } = rpc.execute(0, 'add', [3, 4], 'client-1');
      expect(result).toBe(7);
      expect(error).toBeUndefined();
    });

    it('returns error for unknown method', () => {
      const { result, error } = rpc.execute(0, 'missing', [], 'client-1');
      expect(result).toBeUndefined();
      expect(error).toContain('Unknown RPC method');
    });

    it('returns error when handler throws', () => {
      rpc.register('crasher', () => { throw new Error('oops'); });
      const { error } = rpc.execute(0, 'crasher', [], 'client-1');
      expect(error).toBe('oops');
    });

    it('increments totalErrors stat on handler throw', () => {
      rpc.register('crasher', () => { throw new Error('fail'); });
      rpc.execute(0, 'crasher', [], 'client-1');
      expect(rpc.getStats().totalErrors).toBeGreaterThan(0);
    });
  });

  // ─── Respond ──────────────────────────────────────────────────────────────
  describe('respond', () => {
    it('marks a pending call as responded', () => {
      rpc.register('ping', () => 'pong');
      const call = rpc.call('ping', [])!;
      const ok = rpc.respond(call.id, 'pong');
      expect(ok).toBe(true);
      expect(rpc.getPendingCount()).toBe(0);
    });

    it('returns false for unknown rpcId', () => {
      expect(rpc.respond(99999, 'data')).toBe(false);
    });

    it('stores result on the call', () => {
      rpc.register('ping', () => 'pong');
      const call = rpc.call('ping', [])!;
      rpc.respond(call.id, 'my-result');
      // Call is moved out of pending — check history
      const hist = rpc.getCallHistory();
      const recorded = hist.find(c => c.id === call.id);
      expect(recorded?.result).toBe('my-result');
    });

    it('increments totalResponses', () => {
      rpc.register('ping', () => '');
      const call = rpc.call('ping', [])!;
      rpc.respond(call.id, 'ok');
      expect(rpc.getStats().totalResponses).toBe(1);
    });

    it('error respond increments totalErrors', () => {
      rpc.register('ping', () => '');
      const call = rpc.call('ping', [])!;
      rpc.respond(call.id, undefined, 'timeout');
      expect(rpc.getStats().totalErrors).toBeGreaterThan(0);
    });
  });

  // ─── Timeout processing ───────────────────────────────────────────────────
  describe('processTimeouts', () => {
    it('returns empty array when no calls are pending', () => {
      expect(rpc.processTimeouts(0)).toEqual([]);
    });

    it('times out a call older than the threshold', () => {
      rpc.register('slow', () => 'val');
      const call = rpc.call('slow', [])!;
      // Force old timestamp
      (call as any).timestamp = Date.now() - 10000;
      const timedOut = rpc.processTimeouts(1000);
      expect(timedOut.length).toBe(1);
      expect(timedOut[0].error).toBe('RPC timed out');
    });

    it('does not time out a recent call', () => {
      rpc.register('fast', () => 'val');
      rpc.call('fast', []);
      const timedOut = rpc.processTimeouts(60000);
      expect(timedOut.length).toBe(0);
    });
  });

  // ─── Rate limiting ────────────────────────────────────────────────────────
  describe('rate limiting', () => {
    it('returns null when rate limit is exceeded', () => {
      rpc.register('limited', () => 'ok', 'reliable', 0, 2);
      rpc.call('limited', []);
      rpc.call('limited', []);
      const blocked = rpc.call('limited', []); // 3rd call within 1s
      expect(blocked).toBeNull();
    });
  });

  // ─── Queries ──────────────────────────────────────────────────────────────
  describe('getCallsByMethod', () => {
    it('filters history by method name', () => {
      rpc.register('ping', () => '');
      rpc.register('update', () => '');
      rpc.call('ping', []);
      rpc.call('ping', []);
      rpc.call('update', []);
      expect(rpc.getCallsByMethod('ping').length).toBe(2);
      expect(rpc.getCallsByMethod('update').length).toBe(1);
    });
  });

  // ─── Clear ────────────────────────────────────────────────────────────────
  describe('clear', () => {
    it('clears pending calls, history, and stats', () => {
      rpc.register('ping', () => '');
      rpc.call('ping', []);
      rpc.clear();
      expect(rpc.getPendingCount()).toBe(0);
      expect(rpc.getCallHistory().length).toBe(0);
      expect(rpc.getStats().totalCalls).toBe(0);
    });
  });
});
