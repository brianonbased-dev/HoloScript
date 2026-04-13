import { describe, it, expect, vi, afterEach } from 'vitest';
import { NetworkTransport } from '@holoscript/mesh/network/NetworkTransport';
import { StateReplicator } from '@holoscript/mesh/network/StateReplicator';
import { RPCManager } from '@holoscript/mesh/network/RPCManager';

describe('Cycle 121: Networking & Replication', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // NetworkTransport
  // -------------------------------------------------------------------------

  it('should manage connections and send messages', () => {
    const transport = new NetworkTransport('server', { simulatedLatency: 0 });
    expect(transport.connect('client1')).toBe(true);
    expect(transport.connect('client2')).toBe(true);
    expect(transport.getConnectionCount()).toBe(2);

    const received: string[] = [];
    transport.onMessage('chat', (msg) => received.push(msg.payload.text as string));

    transport.send('client1', 'chat', { text: 'hello' });
    expect(received).toContain('hello');
  });

  it('should simulate packet loss', () => {
    const transport = new NetworkTransport('server', {
      simulatedLatency: 0,
      simulatedPacketLoss: 1,
    });
    transport.connect('client1');

    const received: unknown[] = [];
    transport.onMessage('test', (msg) => received.push(msg));

    // All packets should be dropped
    for (let i = 0; i < 10; i++) transport.send('client1', 'test', { i });
    expect(received).toHaveLength(0);
  });

  it('should broadcast to all peers', () => {
    const transport = new NetworkTransport('server', { simulatedLatency: 0 });
    transport.connect('c1');
    transport.connect('c2');
    transport.connect('c3');

    let count = 0;
    transport.onMessage('ping', () => count++);
    transport.broadcast('ping', {});
    expect(count).toBe(3);
  });

  // -------------------------------------------------------------------------
  // StateReplicator
  // -------------------------------------------------------------------------

  it('should replicate entity state with snapshots', () => {
    const rep = new StateReplicator('server');
    rep.registerEntity('player1', { x: 0, y: 0, health: 100 });

    rep.setProperty('player1', 'x', 10);
    rep.setProperty('player1', 'health', 80);

    expect(rep.getProperty('player1', 'x')).toBe(10);
    expect(rep.getProperty('player1', 'health')).toBe(80);

    const snap = rep.takeSnapshot('player1');
    expect(snap).not.toBeNull();
    expect(snap!.tick).toBe(1);
  });

  it('should compute and apply deltas', () => {
    const rep = new StateReplicator('server');
    rep.registerEntity('npc', { x: 0, y: 0 });
    rep.takeSnapshot('npc'); // tick 1

    rep.setProperty('npc', 'x', 5);
    rep.setProperty('npc', 'y', 10);

    const delta = rep.computeDelta('npc', 1);
    expect(delta).not.toBeNull();
    expect(delta!.changes.length).toBe(2);

    // Apply to another replicator
    const rep2 = new StateReplicator('client');
    rep2.registerEntity('npc', { x: 0, y: 0 });
    rep2.applyDelta(delta!);
    expect(rep2.getProperty('npc', 'x')).toBe(5);
    expect(rep2.getProperty('npc', 'y')).toBe(10);
  });

  it('should enforce owner authority', () => {
    const rep = new StateReplicator('server', 'owner');
    rep.registerEntity('obj', { val: 1 });

    // Server is the authority (registered it)
    expect(rep.setProperty('obj', 'val', 2, 'server')).toBe(true);
    // Another peer should be blocked
    expect(rep.setProperty('obj', 'val', 99, 'hacker')).toBe(false);
    expect(rep.getProperty('obj', 'val')).toBe(2);
  });

  // -------------------------------------------------------------------------
  // RPCManager
  // -------------------------------------------------------------------------

  it('should register and execute RPCs', () => {
    const rpc = new RPCManager('server');
    rpc.register('add', (a: unknown, b: unknown) => (a as number) + (b as number));

    const result = rpc.execute(1, 'add', [3, 4], 'client1');
    expect(result.result).toBe(7);
    expect(result.error).toBeUndefined();
  });

  it('should track pending calls and responses', () => {
    const rpc = new RPCManager('client1');
    rpc.register('ping', () => 'pong');

    const call = rpc.call('ping', [], 'server');
    expect(call).not.toBeNull();
    expect(rpc.getPendingCount()).toBe(1);

    rpc.respond(call!.id, 'pong');
    expect(rpc.getPendingCount()).toBe(0);
    expect(rpc.getStats().totalResponses).toBe(1);
  });

  it('should process timeouts', () => {
    const rpc = new RPCManager('client1');
    rpc.register('slow', () => 'ok');
    rpc.setTimeout(0); // Immediate timeout

    // Mock time to ensure deterministic timeout
    const now = 1000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const call = rpc.call('slow', []);
    expect(call).not.toBeNull();

    // Advance time
    vi.spyOn(Date, 'now').mockReturnValue(now + 1);

    const timedOut = rpc.processTimeouts(0);
    expect(timedOut.length).toBe(1);
    expect(timedOut[0].error).toBe('RPC timed out');
  });
});
