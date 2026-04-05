import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GossipProtocol, AntiEntropySync, type IGossipMessage } from '../GossipProtocol';

// ─── helpers ────────────────────────────────────────────────────────────────

function mkNode(id = 'node1', cfg?: ConstructorParameters<typeof GossipProtocol>[1]) {
  return new GossipProtocol(id, cfg);
}

function mkMsg(overrides: Partial<IGossipMessage> = {}): IGossipMessage {
  return {
    id: `msg-${Math.random()}`,
    originId: 'origin',
    content: { test: true },
    type: 'data',
    version: 1,
    createdAt: Date.now(),
    ttl: 30000,
    hops: 0,
    path: ['origin'],
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('GossipProtocol — construction', () => {
  it('nodeId is stored', () => expect(mkNode('alpha').nodeId).toBe('alpha'));
  it('default fanout = 3', () => expect(mkNode().getConfig().fanout).toBe(3));
  it('default maxTTL = 30000', () => expect(mkNode().getConfig().maxTTL).toBe(30000));
  it('default maxHops = 10', () => expect(mkNode().getConfig().maxHops).toBe(10));
  it('default deduplicate = true', () => expect(mkNode().getConfig().deduplicate).toBe(true));
  it('custom config overrides', () => {
    expect(mkNode('n', { fanout: 5 }).getConfig().fanout).toBe(5);
  });
});

describe('GossipProtocol — start / stop', () => {
  it('isRunning() = false before start', () => expect(mkNode().isRunning()).toBe(false));
  it('isRunning() = true after start', () => {
    const n = mkNode('s', { gossipInterval: 99999 });
    n.start();
    expect(n.isRunning()).toBe(true);
    n.stop();
  });
  it('isRunning() = false after stop', () => {
    const n = mkNode('s2', { gossipInterval: 99999 });
    n.start();
    n.stop();
    expect(n.isRunning()).toBe(false);
  });
  it('start() is idempotent', () => {
    const n = mkNode('s3', { gossipInterval: 99999 });
    n.start();
    n.start();
    expect(n.isRunning()).toBe(true);
    n.stop();
  });
});

describe('GossipProtocol — peer management', () => {
  it('addPeer stores peer', () => {
    const n = mkNode();
    n.addPeer('p1', '127.0.0.1:5000');
    expect(n.getPeer('p1')).toBeDefined();
  });
  it('addPeer ignores self', () => {
    const n = mkNode('me');
    n.addPeer('me', '127.0.0.1:5000');
    expect(n.getPeer('me')).toBeUndefined();
  });
  it('new peer is active by default', () => {
    const n = mkNode();
    n.addPeer('p', 'addr');
    expect(n.getPeer('p')!.isActive).toBe(true);
  });
  it('new peer starts with failureCount = 0', () => {
    const n = mkNode();
    n.addPeer('p', 'addr');
    expect(n.getPeer('p')!.failureCount).toBe(0);
  });
  it('addPeer stores metadata', () => {
    const n = mkNode();
    n.addPeer('p', 'addr', { role: 'leader' });
    expect(n.getPeer('p')!.metadata?.role).toBe('leader');
  });
  it('removePeer returns true', () => {
    const n = mkNode();
    n.addPeer('p', 'addr');
    expect(n.removePeer('p')).toBe(true);
  });
  it('removePeer deletes peer', () => {
    const n = mkNode();
    n.addPeer('p', 'addr');
    n.removePeer('p');
    expect(n.getPeer('p')).toBeUndefined();
  });
  it('removePeer on missing returns false', () => {
    expect(mkNode().removePeer('none')).toBe(false);
  });
  it('getActivePeers filters inactive', () => {
    const n = mkNode();
    n.addPeer('p1', 'a1');
    n.addPeer('p2', 'a2');
    n.getPeer('p1')!.isActive = false;
    expect(n.getActivePeers()).toHaveLength(1);
  });
  it('getAllPeers includes all', () => {
    const n = mkNode();
    n.addPeer('p1', 'a1');
    n.addPeer('p2', 'a2');
    n.getPeer('p1')!.isActive = false;
    expect(n.getAllPeers()).toHaveLength(2);
  });
});

describe('GossipProtocol — publish', () => {
  it('publish returns a message id string', () => {
    const id = mkNode().publish({ hello: 'world' });
    expect(typeof id).toBe('string');
  });
  it('publish increments messagesSent stat', () => {
    const n = mkNode();
    n.publish({ x: 1 });
    expect(n.getStats().messagesSent).toBe(1);
  });
  it('publish calls type-specific handler synchronously', () => {
    const n = mkNode();
    const received: IGossipMessage[] = [];
    n.subscribe('data', (msg) => { received.push(msg); });
    n.publish({ v: 42 }, 'data');
    expect(received).toHaveLength(1);
    expect((received[0].content as any).v).toBe(42);
  });
  it('publish calls wildcard handler', () => {
    const n = mkNode();
    const received: IGossipMessage[] = [];
    n.subscribe('*', (msg) => { received.push(msg); });
    n.publish({ v: 1 }, 'heartbeat');
    expect(received).toHaveLength(1);
  });
  it('publishHeartbeat uses type=heartbeat', () => {
    const n = mkNode();
    const received: IGossipMessage[] = [];
    n.subscribe('heartbeat', (msg) => { received.push(msg); });
    n.publishHeartbeat();
    expect(received).toHaveLength(1);
  });
  it('publishMembership uses type=membership', () => {
    const n = mkNode();
    const received: IGossipMessage[] = [];
    n.subscribe('membership', (msg) => { received.push(msg); });
    n.publishMembership('join');
    expect(received).toHaveLength(1);
  });
});

describe('GossipProtocol — receive', () => {
  it('receive returns true for new message', async () => {
    const n = mkNode();
    expect(await n.receive(mkMsg(), 'peer1')).toBe(true);
  });
  it('receive increments messagesReceived', async () => {
    const n = mkNode();
    await n.receive(mkMsg(), 'p1');
    expect(n.getStats().messagesReceived).toBe(1);
  });
  it('receive deduplicates repeated message', async () => {
    const n = mkNode();
    const msg = mkMsg();
    await n.receive(msg, 'p1');
    const result = await n.receive(msg, 'p2');
    expect(result).toBe(false);
    expect(n.getStats().duplicatesIgnored).toBe(1);
  });
  it('receive drops expired TTL message', async () => {
    const n = mkNode();
    const msg = mkMsg({ createdAt: Date.now() - 99999, ttl: 100 });
    const result = await n.receive(msg, 'p1');
    expect(result).toBe(false);
    expect(n.getStats().messagesDropped).toBeGreaterThan(0);
  });
  it('receive drops message at maxHops', async () => {
    const n = mkNode('n', { maxHops: 5 });
    const msg = mkMsg({ hops: 5 });
    const result = await n.receive(msg, 'p1');
    expect(result).toBe(false);
  });
  it('receive calls handler', async () => {
    const n = mkNode();
    const received: any[] = [];
    n.subscribe('data', (msg) => { received.push(msg); });
    await n.receive(mkMsg({ type: 'data' }), 'peer');
    expect(received).toHaveLength(1);
  });
  it('receive updates peer lastSeen', async () => {
    const n = mkNode();
    n.addPeer('peer', 'addr');
    const before = n.getPeer('peer')!.lastSeen;
    await new Promise((r) => setTimeout(r, 5));
    await n.receive(mkMsg(), 'peer');
    expect(n.getPeer('peer')!.lastSeen).toBeGreaterThanOrEqual(before);
  });
  it('receive without deduplicate allows duplicate', async () => {
    const n = mkNode('nd', { deduplicate: false });
    const msg = mkMsg();
    await n.receive(msg, 'p1');
    const second = await n.receive(msg, 'p2');
    expect(second).toBe(true);
  });
});

describe('GossipProtocol — subscribe / unsubscribe', () => {
  it('subscribe returns unsubscribe fn', () => {
    const unsub = mkNode().subscribe('data', () => {});
    expect(typeof unsub).toBe('function');
  });
  it('unsubscribe stops future deliveries', () => {
    const n = mkNode();
    const calls: number[] = [];
    const unsub = n.subscribe('data', () => { calls.push(1); });
    n.publish({ x: 1 }, 'data');
    unsub();
    n.publish({ x: 2 }, 'data');
    expect(calls).toHaveLength(1);
  });
  it('wildcard receives all message types', async () => {
    const n = mkNode();
    const types: string[] = [];
    n.subscribe('*', (msg) => { types.push(msg.type); });
    n.publish({}, 'data');
    n.publish({}, 'heartbeat');
    n.publish({}, 'membership');
    expect(types).toHaveLength(3);
  });
});

describe('GossipProtocol — stats', () => {
  it('initial stats all zero', () => {
    const s = mkNode().getStats();
    expect(s.messagesSent).toBe(0);
    expect(s.messagesReceived).toBe(0);
    expect(s.messagesDropped).toBe(0);
    expect(s.duplicatesIgnored).toBe(0);
    expect(s.gossipRounds).toBe(0);
  });
  it('getStats includes peerCount', () => {
    const n = mkNode();
    n.addPeer('a', 'addr');
    n.addPeer('b', 'addr2');
    expect(n.getStats().peerCount).toBe(2);
  });
  it('getStats includes queueSize after publish', () => {
    const n = mkNode();
    n.publish({ x: 1 });
    expect(n.getStats().queueSize).toBe(1);
  });
  it('resetStats zeroes all counters', () => {
    const n = mkNode();
    n.publish({});
    n.resetStats();
    expect(n.getStats().messagesSent).toBe(0);
  });
});

describe('GossipProtocol — setPeerSelector', () => {
  it('custom selector is called on gossipRound with messages', async () => {
    const n = mkNode('n', { fanout: 2 });
    n.addPeer('a', 'addr1');
    n.addPeer('b', 'addr2');
    n.start();
    let selectorCalled = false;
    n.setPeerSelector((peers, count) => {
      selectorCalled = true;
      return peers.slice(0, count);
    });
    n.publish({ data: 1 });
    await n.gossipRound();
    expect(selectorCalled).toBe(true);
    n.stop();
  });
});

// ─── AntiEntropySync ─────────────────────────────────────────────────────────

describe('AntiEntropySync — basic', () => {
  it('set and get round-trip', () => {
    const proto = mkNode();
    const sync = new AntiEntropySync('node', proto);
    sync.set('color', 'blue');
    expect(sync.get('color')).toBe('blue');
  });
  it('get returns undefined for unknown key', () => {
    const sync = new AntiEntropySync('n', mkNode());
    expect(sync.get('missing')).toBeUndefined();
  });
  it('keys() returns stored keys', () => {
    const sync = new AntiEntropySync('n', mkNode());
    sync.set('a', 1);
    sync.set('b', 2);
    expect(sync.keys()).toContain('a');
    expect(sync.keys()).toContain('b');
  });
  it('getSnapshot returns map of all values', () => {
    const sync = new AntiEntropySync('n', mkNode());
    sync.set('x', 10);
    const snap = sync.getSnapshot();
    expect(snap.get('x')).toBe(10);
  });
  it('set gossips via protocol (increments messagesSent)', () => {
    const proto = mkNode();
    const sync = new AntiEntropySync('n', proto);
    sync.set('key', 'val');
    expect(proto.getStats().messagesSent).toBeGreaterThan(0);
  });
  it('LWW: higher version wins on sync', async () => {
    const proto = mkNode();
    const sync = new AntiEntropySync('n', proto);
    sync.set('k', 'v1'); // version 1
    // Simulate receiving a newer version via gossip message
    const newerMsg: IGossipMessage = {
      id: `ext-${Math.random()}`,
      originId: 'remote',
      content: { key: 'k', value: 'v2', version: 99 },
      type: 'data',
      version: 1,
      createdAt: Date.now(),
      ttl: 30000,
      hops: 0,
      path: ['remote'],
    };
    await proto.receive(newerMsg, 'remote');
    expect(sync.get('k')).toBe('v2');
  });
  it('LWW: lower version does NOT overwrite', async () => {
    const proto = mkNode('n', { deduplicate: false });
    const sync = new AntiEntropySync('n', proto);
    sync.set('k', 'original'); // version 1
    sync.set('k', 'updated'); // version 2
    // Simulate receiving version 1 again
    const oldMsg: IGossipMessage = {
      id: `old-${Math.random()}`,
      originId: 'remote',
      content: { key: 'k', value: 'stale', version: 1 },
      type: 'data',
      version: 1,
      createdAt: Date.now(),
      ttl: 30000,
      hops: 0,
      path: ['remote'],
    };
    await proto.receive(oldMsg, 'remote');
    // Version 2 (updated) should still win
    expect(sync.get('k')).toBe('updated');
  });
});
