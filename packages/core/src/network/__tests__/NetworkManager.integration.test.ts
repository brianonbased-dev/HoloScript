/**
 * NetworkManager Integration Tests
 *
 * Tests for the transport bridge and BrainServerClient:
 * - attachTransport routes messages through real transport
 * - broadcastToAOI uses transport when attached
 * - BrainServerClient queues and flushes batched requests
 * - Backward compat: outbox works without transport
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetworkManager } from '../NetworkManager';
import { NetworkTransport } from '../NetworkTransport';
import { BrainServerClient } from '../BrainServerClient';

// =============================================================================
// TRANSPORT BRIDGE
// =============================================================================

describe('NetworkManager Transport Bridge', () => {
  let manager: NetworkManager;
  let transport: NetworkTransport;

  beforeEach(() => {
    manager = new NetworkManager('host');
    transport = new NetworkTransport('host');
    manager.connect();
    manager.addPeer('peer1', 'Player 1');
    manager.addPeer('peer2', 'Player 2');
  });

  it('broadcasts to outbox when no transport attached', () => {
    manager.broadcast('state_sync', { x: 1 });
    const messages = manager.flush();
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('state_sync');
  });

  it('routes broadcast through transport when attached', () => {
    manager.attachTransport(transport);
    const spy = vi.spyOn(transport, 'broadcast');

    manager.broadcast('state_sync', { x: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('state_sync', { x: 1 });
    // Should NOT go to outbox since transport handles it
    expect(manager.flush()).toHaveLength(0);
  });

  it('routes sendTo through transport when attached', () => {
    manager.attachTransport(transport);
    const spy = vi.spyOn(transport, 'send');

    manager.sendTo('peer1', 'event', { action: 'jump' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('peer1', 'event', { action: 'jump' });
  });

  it('attachTransport connects existing peers to transport', () => {
    manager.attachTransport(transport);
    const connected = transport.getConnectedPeers();
    expect(connected).toContain('peer1');
    expect(connected).toContain('peer2');
  });

  it('detachTransport reverts to outbox', () => {
    manager.attachTransport(transport);
    manager.detachTransport();

    manager.broadcast('heartbeat', {});
    expect(manager.flush()).toHaveLength(1);
  });

  it('getTransport returns the attached transport', () => {
    expect(manager.getTransport()).toBeNull();
    manager.attachTransport(transport);
    expect(manager.getTransport()).toBe(transport);
  });
});

// =============================================================================
// AOI + TRANSPORT
// =============================================================================

describe('NetworkManager broadcastToAOI with Transport', () => {
  let manager: NetworkManager;
  let transport: NetworkTransport;

  beforeEach(() => {
    manager = new NetworkManager('host');
    transport = new NetworkTransport('host');
    manager.connect();
    manager.addPeer('peer1', 'Player 1');
    manager.addPeer('peer2', 'Player 2');
    manager.attachTransport(transport);

    // Put entity and peer1 in same cell, peer2 far away
    manager.updateEntityPosition('entity_1', { x: 10, y: 0, z: 0 }, 'player');
    manager.updatePeerPosition('peer1', { x: 0, y: 0, z: 0 }, 60);
    manager.updatePeerPosition('peer2', { x: 999, y: 0, z: 0 }, 60);
  });

  it('broadcastToAOI sends through transport to interested peers only', () => {
    const spy = vi.spyOn(transport, 'send');

    manager.broadcastToAOI('entity_1', 'state_sync', { pos: [10, 0, 0] });

    // peer1 is nearby → should receive
    // peer2 is far → should NOT receive
    const sentToPeer1 = spy.mock.calls.filter(c => c[0] === 'peer1');
    const sentToPeer2 = spy.mock.calls.filter(c => c[0] === 'peer2');

    expect(sentToPeer1.length).toBeGreaterThanOrEqual(1);
    expect(sentToPeer2).toHaveLength(0);
  });
});

// =============================================================================
// UPDATE PUMP
// =============================================================================

describe('NetworkManager update()', () => {
  it('processes inbox on update', () => {
    const manager = new NetworkManager('host');
    manager.connect();

    const received: string[] = [];
    manager.onMessage('event', (msg) => received.push(msg.payload.data));
    manager.receive({ type: 'event', senderId: 'remote', timestamp: 0, payload: { data: 'hello' } });

    manager.update(0.016); // One frame
    expect(received).toEqual(['hello']);
  });

  it('pumps transport on update', () => {
    const manager = new NetworkManager('host');
    const transport = new NetworkTransport('host');
    manager.connect();
    manager.attachTransport(transport);

    const spy = vi.spyOn(transport, 'update');
    manager.update(0.016);

    expect(spy).toHaveBeenCalledWith(0.016);
  });
});

// =============================================================================
// BRAIN SERVER CLIENT
// =============================================================================

describe('BrainServerClient', () => {
  function createMockFetch(responseData: any = { results: [] }, status = 200): typeof globalThis.fetch {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(responseData),
    });
  }

  const defaultConfig = {
    url: 'http://brain-server:8000/v1/batch',
    maxConcurrent: 100,
    batchSize: 16,
    timeoutMs: 3000,
    model: 'tinyllama-1.1b',
  };

  it('starts with empty queue', () => {
    const client = new BrainServerClient(defaultConfig, createMockFetch());
    expect(client.getQueueSize()).toBe(0);
  });

  it('queues inference requests', () => {
    const client = new BrainServerClient(defaultConfig, createMockFetch());
    client.queueInference('agent_1', { goal: 'patrol' });
    client.queueInference('agent_2', { goal: 'attack' });
    expect(client.getQueueSize()).toBe(2);
  });

  it('flush sends batched POST and clears queue', async () => {
    const mockFetch = createMockFetch({
      results: [
        { agent_id: 'agent_1', output: { action: 'move_north' } },
        { agent_id: 'agent_2', output: { action: 'attack' } },
      ],
    });
    const client = new BrainServerClient(defaultConfig, mockFetch);

    client.queueInference('agent_1', { goal: 'patrol' });
    client.queueInference('agent_2', { goal: 'attack' });

    const result = await client.flush();

    expect(result.batchSize).toBe(2);
    expect(result.responses).toHaveLength(2);
    expect(result.responses[0].agentId).toBe('agent_1');
    expect(result.responses[0].success).toBe(true);
    expect(result.responses[1].agentId).toBe('agent_2');
    expect(client.getQueueSize()).toBe(0);

    // Verify the POST body
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = (mockFetch as any).mock.calls[0];
    expect(callArgs[0]).toBe('http://brain-server:8000/v1/batch');
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('tinyllama-1.1b');
    expect(body.requests).toHaveLength(2);
  });

  it('flush returns empty result for empty queue', async () => {
    const client = new BrainServerClient(defaultConfig, createMockFetch());
    const result = await client.flush();
    expect(result.batchSize).toBe(0);
    expect(result.responses).toHaveLength(0);
  });

  it('handles server errors gracefully', async () => {
    const mockFetch = createMockFetch({}, 500);
    const client = new BrainServerClient(defaultConfig, mockFetch);

    client.queueInference('agent_1', { goal: 'patrol' });
    const result = await client.flush();

    expect(result.responses).toHaveLength(1);
    expect(result.responses[0].success).toBe(false);
    expect(result.responses[0].error).toContain('500');
  });

  it('respects maxConcurrent limit', async () => {
    const config = { ...defaultConfig, maxConcurrent: 2 };
    const mockFetch = createMockFetch({
      results: [
        { agent_id: 'agent_1', output: {} },
        { agent_id: 'agent_2', output: {} },
      ],
    });
    const client = new BrainServerClient(config, mockFetch);

    // Queue 5, but maxConcurrent is 2
    for (let i = 0; i < 5; i++) {
      client.queueInference(`agent_${i}`, { goal: 'idle' });
    }

    await client.flush();
    // 3 should remain in queue (only 2 processed)
    expect(client.getQueueSize()).toBe(3);
  });

  it('isAvailable returns true on healthy server', async () => {
    const mockFetch = createMockFetch({}) as any;
    const client = new BrainServerClient(defaultConfig, mockFetch);
    const available = await client.isAvailable();
    expect(available).toBe(true);
  });

  it('isAvailable returns false when server is down', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new BrainServerClient(defaultConfig, mockFetch as any);
    const available = await client.isAvailable();
    expect(available).toBe(false);
  });
});
