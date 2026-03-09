import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RPCManager } from '../network/RPCManager';

// =============================================================================
// C256 — RPC Manager
// =============================================================================

describe('RPCManager', () => {
  let rpc: RPCManager;
  beforeEach(() => {
    rpc = new RPCManager('peer1');
  });

  it('register and hasHandler', () => {
    rpc.register('greet', () => 'hello');
    expect(rpc.hasHandler('greet')).toBe(true);
  });

  it('unregister removes handler', () => {
    rpc.register('greet', () => 'hello');
    expect(rpc.unregister('greet')).toBe(true);
    expect(rpc.hasHandler('greet')).toBe(false);
  });

  it('getRegisteredMethods lists all', () => {
    rpc.register('a', vi.fn());
    rpc.register('b', vi.fn());
    expect(rpc.getRegisteredMethods()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('call creates pending RPC', () => {
    rpc.register('add', (a: number, b: number) => a + b);
    const c = rpc.call('add', [1, 2]);
    expect(c).not.toBeNull();
    expect(c!.method).toBe('add');
    expect(rpc.getPendingCount()).toBe(1);
  });

  it('execute invokes handler', () => {
    rpc.register('greet', (name: string) => `hi ${name}`);
    const result = rpc.execute(0, 'greet', ['world'], 'peer2');
    expect(result.result).toBe('hi world');
  });

  it('execute returns error for unknown method', () => {
    const result = rpc.execute(0, 'nope', [], 'peer2');
    expect(result.error).toContain('Unknown RPC');
  });

  it('execute catches thrown errors', () => {
    rpc.register('fail', () => {
      throw new Error('boom');
    });
    const result = rpc.execute(0, 'fail', [], 'peer2');
    expect(result.error).toBe('boom');
  });

  it('respond marks call as responded', () => {
    rpc.register('add', vi.fn());
    const c = rpc.call('add', [1])!;
    expect(rpc.respond(c.id, 42)).toBe(true);
    expect(rpc.getPendingCount()).toBe(0);
  });

  it('respond returns false for unknown id', () => {
    expect(rpc.respond(9999)).toBe(false);
  });

  it('stats track calls and responses', () => {
    rpc.register('fn', vi.fn());
    rpc.call('fn', []);
    expect(rpc.getStats().totalCalls).toBe(1);
  });

  it('getCallsByMethod filters history', () => {
    rpc.register('a', vi.fn());
    rpc.register('b', vi.fn());
    rpc.call('a', []);
    rpc.call('b', []);
    rpc.call('a', []);
    expect(rpc.getCallsByMethod('a')).toHaveLength(2);
  });

  it('clear resets state', () => {
    rpc.register('fn', vi.fn());
    rpc.call('fn', []);
    rpc.clear();
    expect(rpc.getPendingCount()).toBe(0);
    expect(rpc.getCallHistory()).toHaveLength(0);
    expect(rpc.getStats().totalCalls).toBe(0);
  });

  it('setTimeout configures default timeout', () => {
    rpc.setTimeout(1000);
    rpc.register('fn', vi.fn());
    // Just verify no error
    expect(rpc.getStats().totalCalls).toBe(0);
  });
});
