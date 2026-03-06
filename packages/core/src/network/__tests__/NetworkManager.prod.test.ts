/**
 * NetworkManager — Production Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkManager } from '../NetworkManager';

function makeManager(id = 'peer-1') { return new NetworkManager(id); }

describe('NetworkManager — construction', () => {
  it('stores peerId', () => {
    expect(makeManager('abc').getPeerId()).toBe('abc');
  });
  it('starts disconnected', () => {
    expect(makeManager().isConnected()).toBe(false);
  });
  it('starts with 0 peers', () => {
    expect(makeManager().getPeerCount()).toBe(0);
  });
});

describe('NetworkManager — connect / disconnect', () => {
  it('connect sets isConnected=true', () => {
    const m = makeManager();
    m.connect();
    expect(m.isConnected()).toBe(true);
  });
  it('disconnect sets isConnected=false', () => {
    const m = makeManager();
    m.connect();
    m.disconnect();
    expect(m.isConnected()).toBe(false);
  });
  it('disconnect clears peers', () => {
    const m = makeManager();
    m.connect();
    m.addPeer('p2', 'Alice');
    m.disconnect();
    expect(m.getPeerCount()).toBe(0);
  });
});

describe('NetworkManager — peers', () => {
  it('addPeer stores peer info', () => {
    const m = makeManager();
    m.addPeer('p2', 'Alice');
    const peers = m.getPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].id).toBe('p2');
    expect(peers[0].displayName).toBe('Alice');
    expect(peers[0].connected).toBe(true);
  });
  it('removePeer removes the peer', () => {
    const m = makeManager();
    m.addPeer('p2', 'Alice');
    m.removePeer('p2');
    expect(m.getPeerCount()).toBe(0);
  });
  it('removePeer on unknown id does not throw', () => {
    expect(() => makeManager().removePeer('nope')).not.toThrow();
  });
  it('getPeerCount reflects cumulative adds/removes', () => {
    const m = makeManager();
    m.addPeer('a', 'A'); m.addPeer('b', 'B'); m.addPeer('c', 'C');
    m.removePeer('b');
    expect(m.getPeerCount()).toBe(2);
  });
  it('peer has joinedAt timestamp', () => {
    const m = makeManager();
    const before = Date.now();
    m.addPeer('p', 'P');
    expect(m.getPeers()[0].joinedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('NetworkManager — broadcast', () => {
  it('does not enqueue when disconnected', () => {
    const m = makeManager();
    m.broadcast('event', { x: 1 });
    expect(m.flush()).toHaveLength(0);
  });
  it('enqueues message when connected', () => {
    const m = makeManager();
    m.connect();
    m.broadcast('state_sync', { pos: [0, 0, 0] });
    expect(m.flush()).toHaveLength(1);
  });
  it('broadcast message has correct type and senderId', () => {
    const m = makeManager('host');
    m.connect();
    m.broadcast('heartbeat', {});
    const [msg] = m.flush();
    expect(msg.type).toBe('heartbeat');
    expect(msg.senderId).toBe('host');
  });
  it('flush clears outbox', () => {
    const m = makeManager();
    m.connect();
    m.broadcast('rpc', {});
    m.flush();
    expect(m.flush()).toHaveLength(0);
  });
});

describe('NetworkManager — sendTo', () => {
  it('does not enqueue when disconnected', () => {
    const m = makeManager();
    m.addPeer('p2', 'Alice');
    m.sendTo('p2', 'event', {});
    expect(m.flush()).toHaveLength(0);
  });
  it('does not enqueue when peer not registered', () => {
    const m = makeManager();
    m.connect();
    m.sendTo('unknown', 'event', {});
    expect(m.flush()).toHaveLength(0);
  });
  it('enqueues when connected and peer known', () => {
    const m = makeManager();
    m.connect();
    m.addPeer('p2', 'Alice');
    m.sendTo('p2', 'rpc', { fn: 'jump' });
    expect(m.flush()).toHaveLength(1);
  });
  it('payload includes _targetPeer', () => {
    const m = makeManager();
    m.connect();
    m.addPeer('p2', 'Alice');
    m.sendTo('p2', 'rpc', { fn: 'jump' });
    const [msg] = m.flush();
    expect((msg.payload as any)._targetPeer).toBe('p2');
  });
});

describe('NetworkManager — receive / processInbox', () => {
  it('receive enqueues to inbox; processInbox dispatches and clears', () => {
    const m = makeManager();
    const results: unknown[] = [];
    m.onMessage('event', (msg) => results.push(msg.payload));
    m.receive({ type: 'event', senderId: 'other', timestamp: Date.now(), payload: { x: 7 } });
    m.processInbox();
    expect(results).toHaveLength(1);
    expect((results[0] as any).x).toBe(7);
  });
  it('processInbox clears inbox', () => {
    const m = makeManager();
    m.receive({ type: 'heartbeat', senderId: 'x', timestamp: 0, payload: {} });
    m.processInbox();
    // After processing, a second processInbox should not re-dispatch
    const count = { n: 0 };
    m.onMessage('heartbeat', () => count.n++);
    m.processInbox();
    expect(count.n).toBe(0);
  });
  it('multiple handlers for same type are all called', () => {
    const m = makeManager();
    const calls: number[] = [];
    m.onMessage('rpc', () => calls.push(1));
    m.onMessage('rpc', () => calls.push(2));
    m.receive({ type: 'rpc', senderId: 'x', timestamp: 0, payload: {} });
    m.processInbox();
    expect(calls).toEqual([1, 2]);
  });
  it('unknown message type does not throw', () => {
    const m = makeManager();
    m.receive({ type: 'handshake', senderId: 'x', timestamp: 0, payload: {} });
    expect(() => m.processInbox()).not.toThrow();
  });
});

describe('NetworkManager — latency simulation', () => {
  it('defaults to 0ms latency', () => {
    expect(makeManager().getSimulatedLatency()).toBe(0);
  });
  it('setSimulatedLatency stores value', () => {
    const m = makeManager();
    m.setSimulatedLatency(100);
    expect(m.getSimulatedLatency()).toBe(100);
  });
  it('can be updated multiple times', () => {
    const m = makeManager();
    m.setSimulatedLatency(50);
    m.setSimulatedLatency(200);
    expect(m.getSimulatedLatency()).toBe(200);
  });
});
