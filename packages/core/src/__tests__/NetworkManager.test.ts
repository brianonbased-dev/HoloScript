import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkManager, NetworkMessage } from '@holoscript/mesh';

describe('NetworkManager', () => {
  let mgr: NetworkManager;

  beforeEach(() => {
    mgr = new NetworkManager('player-1');
  });

  // ---------- Connection ----------
  it('starts disconnected', () => {
    expect(mgr.isConnected()).toBe(false);
  });

  it('connects and disconnects', () => {
    mgr.connect();
    expect(mgr.isConnected()).toBe(true);
    mgr.disconnect();
    expect(mgr.isConnected()).toBe(false);
  });

  it('returns peerId', () => {
    expect(mgr.getPeerId()).toBe('player-1');
  });

  // ---------- Peer Management ----------
  it('adds and removes peers', () => {
    mgr.addPeer('p2', 'Alice');
    expect(mgr.getPeerCount()).toBe(1);
    expect(mgr.getPeers()[0].displayName).toBe('Alice');
    mgr.removePeer('p2');
    expect(mgr.getPeerCount()).toBe(0);
  });

  it('clears peers on disconnect', () => {
    mgr.connect();
    mgr.addPeer('p2', 'Bob');
    mgr.disconnect();
    expect(mgr.getPeerCount()).toBe(0);
  });

  // ---------- Broadcasting ----------
  it('broadcasts messages when connected', () => {
    mgr.connect();
    mgr.broadcast('state_sync', { x: 1 });
    const msgs = mgr.flush();
    expect(msgs.length).toBe(1);
    expect(msgs[0].type).toBe('state_sync');
    expect(msgs[0].senderId).toBe('player-1');
    expect(msgs[0].payload.x).toBe(1);
  });

  it('does not broadcast when disconnected', () => {
    mgr.broadcast('event', { data: 1 });
    expect(mgr.flush().length).toBe(0);
  });

  // ---------- Send to specific peer ----------
  it('sends to a specific peer', () => {
    mgr.connect();
    mgr.addPeer('p3', 'Charlie');
    mgr.sendTo('p3', 'rpc', { call: 'ping' });
    const msgs = mgr.flush();
    expect(msgs.length).toBe(1);
    expect(msgs[0].payload._targetPeer).toBe('p3');
  });

  it('does not send to non-existent peer', () => {
    mgr.connect();
    mgr.sendTo('ghost', 'rpc', {});
    expect(mgr.flush().length).toBe(0);
  });

  // ---------- Receive + Process ----------
  it('receives and processes messages via handler', () => {
    const handler = vi.fn();
    mgr.onMessage('event', handler);

    const msg: NetworkMessage = {
      type: 'event',
      senderId: 'p2',
      timestamp: Date.now(),
      payload: { action: 'jump' },
    };
    mgr.receive(msg);
    mgr.processInbox();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it('clears inbox after processing', () => {
    const handler = vi.fn();
    mgr.onMessage('heartbeat', handler);
    mgr.receive({ type: 'heartbeat', senderId: 'x', timestamp: 0, payload: {} });
    mgr.processInbox();
    mgr.processInbox(); // second call should not re-dispatch
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ---------- Flush ----------
  it('flush clears outbox', () => {
    mgr.connect();
    mgr.broadcast('heartbeat', {});
    mgr.flush();
    expect(mgr.flush().length).toBe(0);
  });

  // ---------- Latency ----------
  it('sets and gets simulated latency', () => {
    mgr.setSimulatedLatency(100);
    expect(mgr.getSimulatedLatency()).toBe(100);
  });
});
