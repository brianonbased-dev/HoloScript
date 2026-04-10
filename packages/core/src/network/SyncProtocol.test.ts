/**
 * SyncProtocol Tests
 *
 * Tests for the HoloScript Real-time Sync Protocol.
 * Covers delta encoding, interest management, transport abstraction, and conflict resolution.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DeltaEncoder,
  InterestManager,
  LocalBroadcastTransport,
  SyncProtocol,
  createSyncProtocol,
  createLocalSync,
  type SyncState,
  type SyncDelta,
  type InterestArea,
  type SyncMessage,
  type PresenceInfo,
} from './SyncProtocol';

// Mock BroadcastChannel for Node.js environment
class MockBroadcastChannel {
  private static channels: Map<string, Set<MockBroadcastChannel>> = new Map();
  private name: string;
  public onmessage: ((event: { data: any }) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(data: any): void {
    const channels = MockBroadcastChannel.channels.get(this.name);
    if (channels) {
      for (const channel of channels) {
        if (channel !== this && channel.onmessage) {
          channel.onmessage({ data });
        }
      }
    }
  }

  close(): void {
    MockBroadcastChannel.channels.get(this.name)?.delete(this);
  }

  static reset(): void {
    MockBroadcastChannel.channels.clear();
  }
}

// Setup global mocks
if (typeof globalThis.BroadcastChannel === 'undefined') {
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;
}

describe('DeltaEncoder', () => {
  let encoder: DeltaEncoder;

  beforeEach(() => {
    encoder = new DeltaEncoder();
  });

  describe('encode', () => {
    it('should return null for first state (cache miss)', () => {
      const result = encoder.encode('entity1', { x: 1, y: 2 });
      expect(result).toBeNull();
    });

    it('should cache state after first encode', () => {
      encoder.encode('entity1', { x: 1, y: 2 });
      const cached = encoder.getCachedState('entity1');

      expect(cached).toBeDefined();
      expect(cached?.properties.x).toBe(1);
      expect(cached?.properties.y).toBe(2);
    });

    it('should return delta for subsequent changes', () => {
      encoder.encode('entity1', { x: 1, y: 2 });
      const delta = encoder.encode('entity1', { x: 2, y: 2 });

      expect(delta).not.toBeNull();
      expect(delta?.changes).toHaveLength(1);
      expect(delta?.changes[0]).toMatchObject({
        path: 'x',
        op: 'set',
        value: 2,
        previousValue: 1,
      });
    });

    it('should detect multiple changes', () => {
      encoder.encode('entity1', { x: 1, y: 2, z: 3 });
      const delta = encoder.encode('entity1', { x: 10, y: 20, z: 3 });

      expect(delta?.changes).toHaveLength(2);
    });

    it('should detect property deletions', () => {
      encoder.encode('entity1', { x: 1, y: 2 });
      const delta = encoder.encode('entity1', { x: 1 });

      expect(delta?.changes.some((c) => c.op === 'delete' && c.path === 'y')).toBe(true);
    });

    it('should return null when no changes', () => {
      encoder.encode('entity1', { x: 1, y: 2 });
      const delta = encoder.encode('entity1', { x: 1, y: 2 });

      expect(delta).toBeNull();
    });

    it('should increment version on each delta', () => {
      encoder.encode('entity1', { x: 1 });
      const delta1 = encoder.encode('entity1', { x: 2 });
      const delta2 = encoder.encode('entity1', { x: 3 });

      expect(delta1?.baseVersion).toBe(1);
      expect(delta1?.targetVersion).toBe(2);
      expect(delta2?.baseVersion).toBe(2);
      expect(delta2?.targetVersion).toBe(3);
    });

    it('should handle arrays', () => {
      encoder.encode('entity1', { items: [1, 2, 3] });
      const delta = encoder.encode('entity1', { items: [1, 2, 3, 4] });

      expect(delta?.changes).toHaveLength(1);
      expect(delta?.changes[0].value).toEqual([1, 2, 3, 4]);
    });

    it('should handle nested objects', () => {
      encoder.encode('entity1', { config: { nested: { value: 1 } } });
      const delta = encoder.encode('entity1', { config: { nested: { value: 2 } } });

      expect(delta?.changes).toHaveLength(1);
    });
  });

  describe('decode', () => {
    it('should reconstruct state from delta', () => {
      encoder.encode('entity1', { x: 1, y: 2 });
      const delta = encoder.encode('entity1', { x: 5, y: 2 });

      // Simulate receiving delta on another client
      const otherEncoder = new DeltaEncoder();
      otherEncoder.setFullState('entity1', {
        entityId: 'entity1',
        version: 1,
        timestamp: Date.now(),
        properties: { x: 1, y: 2 },
      });

      const reconstructed = otherEncoder.decode(delta!);

      expect(reconstructed.properties.x).toBe(5);
      expect(reconstructed.properties.y).toBe(2);
    });

    it('should handle delete operations', () => {
      const delta: SyncDelta = {
        entityId: 'entity1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'deleted', op: 'delete', previousValue: 'old' }],
        timestamp: Date.now(),
      };

      encoder.setFullState('entity1', {
        entityId: 'entity1',
        version: 1,
        timestamp: Date.now(),
        properties: { kept: 1, deleted: 'old' },
      });

      const result = encoder.decode(delta);

      expect(result.properties.kept).toBe(1);
      expect('deleted' in result.properties).toBe(false);
    });

    it('should handle increment operations', () => {
      encoder.setFullState('entity1', {
        entityId: 'entity1',
        version: 1,
        timestamp: Date.now(),
        properties: { counter: 10 },
      });

      const delta: SyncDelta = {
        entityId: 'entity1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'counter', op: 'increment', value: 5 }],
        timestamp: Date.now(),
      };

      const result = encoder.decode(delta);
      expect(result.properties.counter).toBe(15);
    });

    it('should handle append operations', () => {
      encoder.setFullState('entity1', {
        entityId: 'entity1',
        version: 1,
        timestamp: Date.now(),
        properties: { items: [1, 2] },
      });

      const delta: SyncDelta = {
        entityId: 'entity1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'items', op: 'append', value: [3, 4] }],
        timestamp: Date.now(),
      };

      const result = encoder.decode(delta);
      expect(result.properties.items).toEqual([1, 2, 3, 4]);
    });
  });

  describe('change threshold', () => {
    it('should ignore changes below threshold', () => {
      const thresholdEncoder = new DeltaEncoder(0.01);
      thresholdEncoder.encode('entity1', { x: 1.0 });
      const delta = thresholdEncoder.encode('entity1', { x: 1.005 }); // Change of 0.005

      expect(delta).toBeNull();
    });

    it('should detect changes above threshold', () => {
      const thresholdEncoder = new DeltaEncoder(0.01);
      thresholdEncoder.encode('entity1', { x: 1.0 });
      const delta = thresholdEncoder.encode('entity1', { x: 1.02 }); // Change of 0.02

      expect(delta).not.toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cached states', () => {
      encoder.encode('entity1', { x: 1 });
      encoder.encode('entity2', { y: 2 });

      encoder.clear();

      expect(encoder.getCachedState('entity1')).toBeUndefined();
      expect(encoder.getCachedState('entity2')).toBeUndefined();
    });
  });
});

describe('InterestManager', () => {
  let manager: InterestManager;

  beforeEach(() => {
    manager = new InterestManager();
  });

  describe('interest areas', () => {
    it('should set and check interest areas', () => {
      const area: InterestArea = {
        center: [0, 0, 0],
        radius: 10,
      };
      manager.setInterest('client1', area);
      manager.updateEntityPosition('entity1', [5, 0, 0]);

      expect(manager.isInInterest('client1', 'entity1')).toBe(true);
    });

    it('should return false for entities outside interest', () => {
      const area: InterestArea = {
        center: [0, 0, 0],
        radius: 10,
      };
      manager.setInterest('client1', area);
      manager.updateEntityPosition('entity1', [50, 0, 0]);

      expect(manager.isInInterest('client1', 'entity1')).toBe(false);
    });

    it('should return true when no interest filter set', () => {
      manager.updateEntityPosition('entity1', [100, 100, 100]);

      expect(manager.isInInterest('client1', 'entity1')).toBe(true);
    });

    it('should return true for unknown entity positions', () => {
      manager.setInterest('client1', { center: [0, 0, 0], radius: 10 });

      expect(manager.isInInterest('client1', 'unknown-entity')).toBe(true);
    });
  });

  describe('getEntitiesInInterest', () => {
    it('should return entities within interest area', () => {
      manager.setInterest('client1', { center: [0, 0, 0], radius: 10 });
      manager.updateEntityPosition('near', [5, 0, 0]);
      manager.updateEntityPosition('far', [50, 0, 0]);

      const inInterest = manager.getEntitiesInInterest('client1');

      expect(inInterest).toContain('near');
      expect(inInterest).not.toContain('far');
    });

    it('should return all entities when no interest set', () => {
      manager.updateEntityPosition('entity1', [0, 0, 0]);
      manager.updateEntityPosition('entity2', [100, 100, 100]);

      const entities = manager.getEntitiesInInterest('client1');

      expect(entities).toContain('entity1');
      expect(entities).toContain('entity2');
    });
  });

  describe('priority', () => {
    it('should return 1 when no interest set', () => {
      manager.updateEntityPosition('entity1', [0, 0, 0]);

      expect(manager.getPriority('client1', 'entity1')).toBe(1);
    });

    it('should return explicit priority when set', () => {
      manager.setInterest('client1', {
        center: [0, 0, 0],
        radius: 100,
        priorities: new Map([['entity1', 0.5]]),
      });

      expect(manager.getPriority('client1', 'entity1')).toBe(0.5);
    });

    it('should calculate distance-based priority', () => {
      manager.setInterest('client1', { center: [0, 0, 0], radius: 100 });
      manager.updateEntityPosition('center', [0, 0, 0]);
      manager.updateEntityPosition('edge', [100, 0, 0]);

      const centerPriority = manager.getPriority('client1', 'center');
      const edgePriority = manager.getPriority('client1', 'edge');

      expect(centerPriority).toBe(1);
      expect(edgePriority).toBe(0.5);
    });
  });

  describe('removeInterest', () => {
    it('should remove interest filter', () => {
      manager.setInterest('client1', { center: [0, 0, 0], radius: 1 });
      manager.updateEntityPosition('entity1', [100, 0, 0]);

      // Should be outside interest
      expect(manager.isInInterest('client1', 'entity1')).toBe(false);

      manager.removeInterest('client1');

      // Should now be in interest (no filter)
      expect(manager.isInInterest('client1', 'entity1')).toBe(true);
    });
  });
});

describe('LocalBroadcastTransport', () => {
  let transport: LocalBroadcastTransport;

  beforeEach(() => {
    MockBroadcastChannel.reset();
    transport = new LocalBroadcastTransport('test-channel');
  });

  afterEach(() => {
    transport.disconnect();
    MockBroadcastChannel.reset();
  });

  it('should connect successfully', async () => {
    await transport.connect();
    expect(transport.isConnected()).toBe(true);
  });

  it('should disconnect', async () => {
    await transport.connect();
    transport.disconnect();
    expect(transport.isConnected()).toBe(false);
  });

  it('should fire connect callback', async () => {
    const callback = vi.fn();
    transport.onConnect(callback);
    await transport.connect();

    expect(callback).toHaveBeenCalled();
  });

  it('should fire disconnect callback', async () => {
    const callback = vi.fn();
    transport.onDisconnect(callback);
    await transport.connect();
    transport.disconnect();

    expect(callback).toHaveBeenCalled();
  });

  it('should return low latency for local transport', async () => {
    await transport.connect();
    expect(transport.getLatency()).toBe(1);
  });

  it('should broadcast messages between transports', async () => {
    const transport1 = new LocalBroadcastTransport('shared');
    const transport2 = new LocalBroadcastTransport('shared');

    const receivedMessages: SyncMessage[] = [];
    transport2.onMessage((msg) => receivedMessages.push(msg));

    await transport1.connect();
    await transport2.connect();

    const message: SyncMessage = {
      type: 'full-state',
      senderId: 'client1',
      roomId: 'room1',
      sequence: 1,
      payload: { test: true },
      timestamp: Date.now(),
    };

    transport1.send(message);

    // Wait for message propagation
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].payload.test).toBe(true);

    transport1.disconnect();
    transport2.disconnect();
  });
});

describe('SyncProtocol', () => {
  let sync: SyncProtocol;

  beforeEach(() => {
    MockBroadcastChannel.reset();
    sync = createLocalSync('test-room');
  });

  afterEach(() => {
    sync.disconnect();
    MockBroadcastChannel.reset();
  });

  describe('configuration', () => {
    it('should create with default config', () => {
      const protocol = createSyncProtocol({ roomId: 'test' });
      expect(protocol).toBeDefined();
    });

    it('should accept custom conflict strategy', () => {
      const protocol = createSyncProtocol({
        roomId: 'test',
        conflictStrategy: 'server-authority',
      });
      expect(protocol).toBeDefined();
    });

    it('should accept custom optimizations', () => {
      const protocol = createSyncProtocol(
        { roomId: 'test' },
        { interestManagement: true, distanceCulling: 50 }
      );
      expect(protocol).toBeDefined();
    });
  });

  describe('state management', () => {
    it('should return undefined for unknown entity', () => {
      expect(sync.getState('unknown')).toBeUndefined();
    });

    it('should store synced state', async () => {
      await sync.connect();
      sync.syncState('entity1', { x: 1, y: 2 });

      // State is cached on first sync (null delta returned)
      const state = sync.getState('entity1');
      expect(state).toBeDefined();
      expect(state?.properties.x).toBe(1);
    });
  });

  describe('presence', () => {
    it('should track local presence', async () => {
      await sync.connect();
      sync.updatePresence({
        position: [1, 2, 3],
        metadata: { name: 'Test User' },
      });

      const presence = sync.getPresence();
      expect(presence.size).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should track message stats', async () => {
      await sync.connect();

      const initialStats = sync.getStats();
      expect(initialStats.messagesSent).toBe(1); // request-state on connect

      sync.syncState('entity1', { x: 1 });
      // First sync caches state, doesn't send delta
    });

    it('should return default stats', () => {
      const stats = sync.getStats();

      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesReceived).toBe(0);
      expect(stats.avgLatency).toBe(0);
    });
  });

  describe('connection state', () => {
    it('should report not connected initially', () => {
      expect(sync.isConnected()).toBe(false);
    });

    it('should report connected after connect', async () => {
      await sync.connect();
      expect(sync.isConnected()).toBe(true);
    });

    it('should report not connected after disconnect', async () => {
      await sync.connect();
      sync.disconnect();
      expect(sync.isConnected()).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit connected event', async () => {
      const callback = vi.fn();
      sync.on('connected', callback);
      await sync.connect();

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ type: 'connected' }));
    });

    it('should emit disconnected event', async () => {
      const callback = vi.fn();
      sync.on('disconnected', callback);
      await sync.connect();
      sync.disconnect();

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ type: 'disconnected' }));
    });

    it('should return unsubscribe function', async () => {
      const callback = vi.fn();
      const unsubscribe = sync.on('connected', callback);

      unsubscribe();
      await sync.connect();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('latency', () => {
    it('should return 0 when not connected', () => {
      expect(sync.getLatency()).toBe(0);
    });

    it('should return transport latency when connected', async () => {
      await sync.connect();
      // LocalBroadcast returns 1
      expect(sync.getLatency()).toBe(1);
    });
  });
});

describe('Factory Functions', () => {
  afterEach(() => {
    MockBroadcastChannel.reset();
  });

  it('createSyncProtocol should create protocol with config', () => {
    const protocol = createSyncProtocol({
      roomId: 'test-room',
      transport: 'websocket',
      serverUrl: 'ws://localhost:8080',
    });

    expect(protocol).toBeInstanceOf(SyncProtocol);
  });

  it('createLocalSync should create local protocol', () => {
    const protocol = createLocalSync('test-room');

    expect(protocol).toBeInstanceOf(SyncProtocol);
  });
});

describe('Integration', () => {
  afterEach(() => {
    MockBroadcastChannel.reset();
  });

  it('should sync state between two clients', async () => {
    const client1 = createLocalSync('shared-room');
    const client2 = createLocalSync('shared-room');

    const stateUpdates: any[] = [];
    client2.on('state-updated', (event) => {
      stateUpdates.push(event.data);
    });

    await client1.connect();
    await client2.connect();

    // Client1 syncs initial state
    client1.syncState('shared-entity', { x: 10, y: 20 });

    // Wait for propagation
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Client1 sends delta
    client1.syncState('shared-entity', { x: 15, y: 20 });

    // Wait for propagation
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check if client2 received the update
    expect(stateUpdates.length).toBeGreaterThan(0);

    client1.disconnect();
    client2.disconnect();
  });

  it('should sync presence between clients', async () => {
    const client1 = createLocalSync('presence-room');
    const client2 = createLocalSync('presence-room');

    const presenceUpdates: PresenceInfo[] = [];
    client2.on('presence-updated', (event) => {
      presenceUpdates.push(event.data.presence);
    });

    await client1.connect();
    await client2.connect();

    client1.updatePresence({
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      metadata: { name: 'Player1' },
    });

    // Wait for propagation
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(presenceUpdates.length).toBeGreaterThan(0);
    expect(presenceUpdates[0].position).toEqual([1, 2, 3]);
    expect(presenceUpdates[0].metadata?.name).toBe('Player1');

    client1.disconnect();
    client2.disconnect();
  });
});
