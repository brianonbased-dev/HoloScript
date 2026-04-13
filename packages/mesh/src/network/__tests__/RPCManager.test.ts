import { describe, it, expect, beforeEach } from 'vitest';
import { RPCManager } from '@holoscript/core';

describe('RPCManager', () => {
  let rpc: RPCManager;

  beforeEach(() => {
    rpc = new RPCManager('client1');
  });

  // Handler registration
  it('register and hasHandler', () => {
    rpc.register('spawn', () => 42);
    expect(rpc.hasHandler('spawn')).toBe(true);
  });

  it('unregister removes handler', () => {
    rpc.register('spawn', () => 42);
    expect(rpc.unregister('spawn')).toBe(true);
    expect(rpc.hasHandler('spawn')).toBe(false);
  });

  it('getRegisteredMethods lists methods', () => {
    rpc.register('a', () => {});
    rpc.register('b', () => {});
    expect(rpc.getRegisteredMethods()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  // Calling
  it('call creates pending RPC', () => {
    rpc.register('spawn', () => {});
    const call = rpc.call('spawn', [1, 2]);
    expect(call).not.toBeNull();
    expect(call!.method).toBe('spawn');
    expect(call!.senderId).toBe('client1');
    expect(rpc.getPendingCount()).toBe(1);
  });

  it('call to unregistered method still works', () => {
    const call = rpc.call('unknown', []);
    expect(call).not.toBeNull();
  });

  it('call tracks in history', () => {
    rpc.call('a', []);
    expect(rpc.getCallHistory().length).toBe(1);
  });

  // Execute
  it('execute calls handler and returns result', () => {
    rpc.register('add', (...args: any[]) => (args[0] as number) + (args[1] as number));
    const result = rpc.execute(1, 'add', [3, 4], 'peer');
    expect(result.result).toBe(7);
    expect(result.error).toBeUndefined();
  });

  it('execute returns error for unknown method', () => {
    const result = rpc.execute(1, 'unknown', [], 'peer');
    expect(result.error).toContain('Unknown RPC method');
  });

  it('execute catches handler errors', () => {
    rpc.register('boom', () => {
      throw new Error('fail');
    });
    const result = rpc.execute(1, 'boom', [], 'peer');
    expect(result.error).toBe('fail');
  });

  // Respond
  it('respond resolves pending call', () => {
    const call = rpc.call('a', []);
    expect(rpc.respond(call!.id, 'ok')).toBe(true);
    expect(rpc.getPendingCount()).toBe(0);
  });

  it('respond returns false for unknown id', () => {
    expect(rpc.respond(99999)).toBe(false);
  });

  it('respond tracks errors', () => {
    const call = rpc.call('a', []);
    rpc.respond(call!.id, undefined, 'network error');
    const stats = rpc.getStats();
    expect(stats.totalErrors).toBeGreaterThan(0);
  });

  // Timeouts
  it('processTimeouts catches old calls', () => {
    const call = rpc.call('slow', []);
    // Manually backdate the timestamp
    (call as any).timestamp = Date.now() - 10000;
    const timedOut = rpc.processTimeouts(5000);
    expect(timedOut.length).toBe(1);
    expect(timedOut[0].error).toBe('RPC timed out');
  });

  it('setTimeout changes default timeout', () => {
    rpc.setTimeout(1000);
    const call = rpc.call('x', []);
    (call as any).timestamp = Date.now() - 2000;
    const timedOut = rpc.processTimeouts();
    expect(timedOut.length).toBe(1);
  });

  // Stats
  it('getStats returns summary', () => {
    rpc.call('a', []);
    rpc.call('b', []);
    const stats = rpc.getStats();
    expect(stats.totalCalls).toBe(2);
  });

  it('getCallsByMethod filters', () => {
    rpc.call('a', []);
    rpc.call('b', []);
    rpc.call('a', [1]);
    expect(rpc.getCallsByMethod('a').length).toBe(2);
  });

  // Clear
  it('clear resets everything', () => {
    rpc.call('a', []);
    rpc.clear();
    expect(rpc.getPendingCount()).toBe(0);
    expect(rpc.getCallHistory().length).toBe(0);
    expect(rpc.getStats().totalCalls).toBe(0);
  });
});
