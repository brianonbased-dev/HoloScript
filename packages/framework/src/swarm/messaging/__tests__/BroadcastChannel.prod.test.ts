/**
 * BroadcastChannel + ChannelManager — Production Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { BroadcastChannel, ChannelManager } from '../BroadcastChannel';

function makeCh(cfg = {}) {
  return new BroadcastChannel('ch1', 'TestChannel', cfg);
}
function makeMgr() {
  return new ChannelManager();
}

// ─── BroadcastChannel ───────────────────────────────────

describe('BroadcastChannel — construction', () => {
  it('id and name stored', () => {
    const c = makeCh();
    expect(c.id).toBe('ch1');
    expect(c.name).toBe('TestChannel');
  });
  it('createdAt is recent', () => {
    expect(Date.now() - makeCh().createdAt).toBeLessThan(100);
  });
  it('default maxSubscribers=1000', () => {
    expect(makeCh().getConfig().maxSubscribers).toBe(1000);
  });
  it('default historySize=100', () => {
    expect(makeCh().getConfig().historySize).toBe(100);
  });
  it('default allowReplay=true', () => {
    expect(makeCh().getConfig().allowReplay).toBe(true);
  });
});

describe('BroadcastChannel — subscribe / unsubscribe', () => {
  it('subscribe returns subId', () => {
    const c = makeCh();
    const id = c.subscribe('a1', () => {});
    expect(id.startsWith('sub-a1')).toBe(true);
  });
  it('isSubscribed=true after subscribe', () => {
    const c = makeCh();
    c.subscribe('a1', () => {});
    expect(c.isSubscribed('a1')).toBe(true);
  });
  it('isSubscribed=false for unknown', () => {
    expect(makeCh().isSubscribed('ghost')).toBe(false);
  });
  it('getSubscriberCount increments', () => {
    const c = makeCh();
    c.subscribe('a1', () => {});
    c.subscribe('a2', () => {});
    expect(c.getSubscriberCount()).toBe(2);
  });
  it('unsubscribe returns true', () => {
    const c = makeCh();
    const id = c.subscribe('a1', () => {});
    expect(c.unsubscribe(id)).toBe(true);
  });
  it('unsubscribe decrements count', () => {
    const c = makeCh();
    const id = c.subscribe('a1', () => {});
    c.unsubscribe(id);
    expect(c.getSubscriberCount()).toBe(0);
  });
  it('unsubscribe unknown returns false', () => {
    expect(makeCh().unsubscribe('ghost')).toBe(false);
  });
  it('throws when maxSubscribers reached', () => {
    const c = makeCh({ maxSubscribers: 1 });
    c.subscribe('a1', () => {});
    expect(() => c.subscribe('a2', () => {})).toThrow();
  });
});

describe('BroadcastChannel — broadcast', () => {
  it('delivers to subscriber', async () => {
    const received: unknown[] = [];
    const c = makeCh();
    c.subscribe('a1', (m) => { received.push((m as any).content); });
    await c.broadcast('sender', 'hello');
    expect(received).toHaveLength(1);
    expect(received[0]).toBe('hello');
  });
  it('delivered to all subscribers', async () => {
    const received: unknown[] = [];
    const c = makeCh();
    c.subscribe('a1', (m) => { received.push(m); });
    c.subscribe('a2', (m) => { received.push(m); });
    await c.broadcast('sender', 'hi');
    expect(received).toHaveLength(2);
  });
  it('publisher-role subscriber does not receive', async () => {
    const received: unknown[] = [];
    const c = makeCh();
    c.subscribe('a1', (m) => { received.push('a1', m); }, { role: 'publisher' });
    await c.broadcast('sender', 'hi');
    expect(received).toHaveLength(0);
  });
  it('returns message id string', async () => {
    const c = makeCh();
    const id = await c.broadcast('sender', 'x');
    expect(id.startsWith('msg-')).toBe(true);
  });
  it('adds to history', async () => {
    const c = makeCh();
    await c.broadcast('s', 'a');
    await c.broadcast('s', 'b');
    expect(c.getStats().historySize).toBe(2);
  });
  it('historySize cap enforced', async () => {
    const c = makeCh({ historySize: 2 });
    await c.broadcast('s', 'a');
    await c.broadcast('s', 'b');
    await c.broadcast('s', 'c');
    expect(c.getStats().historySize).toBe(2);
  });
});

describe('BroadcastChannel — sendDirect', () => {
  it('delivers only to target', async () => {
    const received: string[] = [];
    const c = makeCh();
    c.subscribe('a1', () => { received.push('a1'); });
    c.subscribe('a2', () => { received.push('a2'); });
    await c.sendDirect('sender', 'a1', 'dm');
    expect(received).toHaveLength(1);
    expect(received[0]).toBe('a1');
  });
  it('returns messageId on delivery', async () => {
    const c = makeCh();
    c.subscribe('a1', () => {});
    const id = await c.sendDirect('s', 'a1', 'hi');
    expect(id).not.toBeNull();
  });
  it('returns null for unknown target', async () => {
    const c = makeCh();
    expect(await c.sendDirect('s', 'nobody', 'hi')).toBeNull();
  });
});

describe('BroadcastChannel — ACK', () => {
  it('requireAck tracks pending', async () => {
    const c = makeCh({ requireAck: true });
    c.subscribe('a1', () => {});
    c.subscribe('a2', () => {});
    const id = await c.broadcast('sender', 'hi');
    expect(c.getPendingAcks(id)).toHaveLength(2);
  });
  it('acknowledge reduces pending', async () => {
    const c = makeCh({ requireAck: true });
    c.subscribe('a1', () => {});
    c.subscribe('a2', () => {});
    const id = await c.broadcast('sender', 'hi');
    c.acknowledge(id, 'a1');
    expect(c.getPendingAcks(id)).toHaveLength(1);
  });
  it('isFullyAcknowledged after all ack', async () => {
    const c = makeCh({ requireAck: true });
    c.subscribe('a1', () => {});
    const id = await c.broadcast('sender', 'hi');
    c.acknowledge(id, 'a1');
    expect(c.isFullyAcknowledged(id)).toBe(true);
  });
  it('acknowledge unknown returns false', () => {
    expect(makeCh().acknowledge('ghost', 'a1')).toBe(false);
  });
  it('isFullyAcknowledged true for no-requireAck', async () => {
    const c = makeCh({ requireAck: false });
    c.subscribe('a1', () => {});
    const id = await c.broadcast('sender', 'hi');
    expect(c.isFullyAcknowledged(id)).toBe(true);
  });
});

describe('BroadcastChannel — getHistory', () => {
  it('returns empty when allowReplay=false', async () => {
    const c = makeCh({ allowReplay: false });
    await c.broadcast('s', 'hi');
    expect(c.getHistory()).toHaveLength(0);
  });
  it('returns messages when allowReplay=true', async () => {
    const c = makeCh();
    await c.broadcast('s', 'a');
    await c.broadcast('s', 'b');
    expect(c.getHistory()).toHaveLength(2);
  });
  it('limit option returns last N', async () => {
    const c = makeCh();
    await c.broadcast('s', '1');
    await c.broadcast('s', '2');
    await c.broadcast('s', '3');
    expect(c.getHistory({ limit: 2 })).toHaveLength(2);
  });
  it('senderId filter', async () => {
    const c = makeCh();
    await c.broadcast('alice', 'hi');
    await c.broadcast('bob', 'there');
    expect(c.getHistory({ senderId: 'alice' })).toHaveLength(1);
  });
  it('clearHistory empties history', async () => {
    const c = makeCh();
    await c.broadcast('s', 'x');
    c.clearHistory();
    expect(c.getStats().historySize).toBe(0);
  });
});

describe('BroadcastChannel — replayHistory', () => {
  it('replays all history to subscriber', async () => {
    const received: unknown[] = [];
    const c = makeCh();
    await c.broadcast('s', '1');
    await c.broadcast('s', '2');
    const subId = c.subscribe('a1', (m) => { received.push(m); });
    const count = await c.replayHistory(subId);
    expect(count).toBe(2);
    expect(received).toHaveLength(2);
  });
  it('replayHistory=0 for unknown subscriber', async () => {
    const c = makeCh();
    await c.broadcast('s', 'x');
    expect(await c.replayHistory('ghost')).toBe(0);
  });
  it('replay disabled when allowReplay=false', async () => {
    const c = makeCh({ allowReplay: false });
    await c.broadcast('s', 'x');
    const id = c.subscribe('a1', () => {});
    expect(await c.replayHistory(id)).toBe(0);
  });
});

describe('BroadcastChannel — getStats', () => {
  it('all fields present', async () => {
    const c = makeCh();
    await c.broadcast('s', 'hi');
    const stats = c.getStats();
    expect(stats).toHaveProperty('subscriberCount');
    expect(stats).toHaveProperty('historySize');
    expect(stats).toHaveProperty('pendingAckCount');
    expect(stats).toHaveProperty('oldestMessage');
    expect(stats).toHaveProperty('newestMessage');
  });
  it('oldestMessage=null when no history', () => {
    expect(makeCh().getStats().oldestMessage).toBeNull();
  });
});

// ─── ChannelManager ───────────────────────────────────

describe('ChannelManager — createChannel / getChannel', () => {
  it('createChannel returns BroadcastChannel', () => {
    const m = makeMgr();
    const c = m.createChannel('general');
    expect(c).toBeInstanceOf(BroadcastChannel);
    expect(c.name).toBe('general');
  });
  it('getChannel by id', () => {
    const m = makeMgr();
    const c = m.createChannel('news');
    expect(m.getChannel(c.id)).toBe(c);
  });
  it('getChannelByName', () => {
    const m = makeMgr();
    const c = m.createChannel('sport');
    expect(m.getChannelByName('sport')).toBe(c);
  });
  it('getChannelByName unknown=undefined', () => {
    expect(makeMgr().getChannelByName('ghost')).toBeUndefined();
  });
  it('getAllChannels returns all', () => {
    const m = makeMgr();
    m.createChannel('a');
    m.createChannel('b');
    expect(m.getAllChannels()).toHaveLength(2);
  });
  it('getChannelCount', () => {
    const m = makeMgr();
    m.createChannel('x');
    m.createChannel('y');
    expect(m.getChannelCount()).toBe(2);
  });
  it('deleteChannel removes channel', () => {
    const m = makeMgr();
    const c = m.createChannel('temp');
    m.deleteChannel(c.id);
    expect(m.getChannel(c.id)).toBeUndefined();
  });
  it('deleteChannel unknown returns false', () => {
    expect(makeMgr().deleteChannel('ghost')).toBe(false);
  });
});

describe('ChannelManager — subscribeAgent', () => {
  it('subscribeAgent returns subscriberId', () => {
    const m = makeMgr();
    const c = m.createChannel('ch');
    expect(m.subscribeAgent('a1', c.id, () => {})).toBeTruthy();
  });
  it('getAgentChannels returns subscribed', () => {
    const m = makeMgr();
    const c = m.createChannel('ch');
    m.subscribeAgent('a1', c.id, () => {});
    expect(m.getAgentChannels('a1')).toHaveLength(1);
  });
  it('subscribeAgent unknown channel throws', () => {
    const m = makeMgr();
    expect(() => m.subscribeAgent('a1', 'ghost', () => {})).toThrow();
  });
});

describe('ChannelManager — multicast', () => {
  it('delivers to all target channels', async () => {
    const m = makeMgr();
    const c1 = m.createChannel('c1');
    const c2 = m.createChannel('c2');
    const received: string[] = [];
    m.subscribeAgent('a1', c1.id, () => { received.push('c1'); });
    m.subscribeAgent('a2', c2.id, () => { received.push('c2'); });
    const results = await m.multicast([c1.id, c2.id], 'sender', 'msg');
    expect(results.size).toBe(2);
    expect(received).toHaveLength(2);
  });
  it('skips unknown channel ids silently', async () => {
    const m = makeMgr();
    const c = m.createChannel('c1');
    const results = await m.multicast([c.id, 'ghost'], 'sender', 'hi');
    expect(results.size).toBe(1);
  });
});
