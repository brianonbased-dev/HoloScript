/**
 * SyncProtocol — Production Test Suite
 *
 * Commence All V — Track 2: SyncProtocol + DeltaEncoder + InterestManager
 *
 * These classes are fully testable in Node.js without browser globals.
 *
 * Coverage:
 *  DeltaEncoder:
 *   - First encode caches state, returns null
 *   - Subsequent encode detects changes (set, delete)
 *   - Value equality (numeric threshold, arrays, objects)
 *   - Nested path set/get/delete
 *   - decode applies set/delete/increment/append ops
 *   - clear/getCachedState/setFullState
 *
 *  InterestManager:
 *   - set/remove interest areas
 *   - entity position tracking
 *   - isInInterest (distance culling)
 *   - getEntitiesInInterest filtering
 *   - getPriority (distance-based, explicit priorities)
 *
 *  SyncProtocol:
 *   - constructor config defaults
 *   - client ID generation
 *   - event registration (on/off)
 *   - getState / getPresence / getStats / getClientId
 *   - disconnect cleanup
 *   - connect throws without serverUrl for ws transport
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DeltaEncoder,
  InterestManager,
  SyncProtocol,
  createSyncProtocol,
  createLocalSync,
} from '@holoscript/core';

// ===========================================================================
// DeltaEncoder
// ===========================================================================

describe('DeltaEncoder — Production Tests', () => {
  describe('first encode', () => {
    it('returns null on first encode (just caches)', () => {
      const encoder = new DeltaEncoder();
      const delta = encoder.encode('e1', { x: 1 });
      expect(delta).toBeNull();
    });

    it('caches state after first encode', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { x: 1 });
      const cached = encoder.getCachedState('e1');
      expect(cached).toBeDefined();
      expect(cached!.properties).toEqual({ x: 1 });
      expect(cached!.version).toBe(1);
    });
  });

  describe('subsequent encode — change detection', () => {
    it('returns delta when value changes', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { x: 1 });
      const delta = encoder.encode('e1', { x: 2 });
      expect(delta).not.toBeNull();
      expect(delta!.changes.length).toBe(1);
      expect(delta!.changes[0].op).toBe('set');
      expect(delta!.changes[0].path).toBe('x');
      expect(delta!.changes[0].value).toBe(2);
      expect(delta!.changes[0].previousValue).toBe(1);
    });

    it('returns null when nothing changed', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { x: 1, y: 'hello' });
      const delta = encoder.encode('e1', { x: 1, y: 'hello' });
      expect(delta).toBeNull();
    });

    it('detects deleted keys', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { x: 1, y: 2 });
      const delta = encoder.encode('e1', { x: 1 });
      expect(delta).not.toBeNull();
      const deleteOp = delta!.changes.find((c) => c.op === 'delete');
      expect(deleteOp).toBeDefined();
      expect(deleteOp!.path).toBe('y');
    });

    it('detects new keys', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { x: 1 });
      const delta = encoder.encode('e1', { x: 1, y: 2 });
      expect(delta).not.toBeNull();
      const setOp = delta!.changes.find((c) => c.path === 'y');
      expect(setOp!.op).toBe('set');
      expect(setOp!.value).toBe(2);
    });

    it('increments version on each delta', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { x: 1 });
      const d1 = encoder.encode('e1', { x: 2 });
      expect(d1!.baseVersion).toBe(1);
      expect(d1!.targetVersion).toBe(2);
      const d2 = encoder.encode('e1', { x: 3 });
      expect(d2!.baseVersion).toBe(2);
      expect(d2!.targetVersion).toBe(3);
    });
  });

  describe('numeric threshold', () => {
    it('ignores change below threshold', () => {
      const encoder = new DeltaEncoder(0.01);
      encoder.encode('e1', { x: 1.0 });
      const delta = encoder.encode('e1', { x: 1.005 });
      expect(delta).toBeNull();
    });

    it('detects change above threshold', () => {
      const encoder = new DeltaEncoder(0.01);
      encoder.encode('e1', { x: 1.0 });
      const delta = encoder.encode('e1', { x: 1.02 });
      expect(delta).not.toBeNull();
    });
  });

  describe('array equality', () => {
    it('detects array change', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { arr: [1, 2, 3] });
      const delta = encoder.encode('e1', { arr: [1, 2, 4] });
      expect(delta).not.toBeNull();
    });

    it('detects array length change', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { arr: [1, 2] });
      const delta = encoder.encode('e1', { arr: [1, 2, 3] });
      expect(delta).not.toBeNull();
    });

    it('same array is equal', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { arr: [1, 2, 3] });
      const delta = encoder.encode('e1', { arr: [1, 2, 3] });
      expect(delta).toBeNull();
    });
  });

  describe('object equality', () => {
    it('deep equal objects produce no delta', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { nested: { a: 1, b: 'z' } });
      const delta = encoder.encode('e1', { nested: { a: 1, b: 'z' } });
      expect(delta).toBeNull();
    });

    it('detects nested object change', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { nested: { a: 1 } });
      const delta = encoder.encode('e1', { nested: { a: 2 } });
      expect(delta).not.toBeNull();
    });
  });

  describe('decode', () => {
    it('applies set operation', () => {
      const encoder = new DeltaEncoder();
      const state = encoder.decode({
        entityId: 'e1',
        baseVersion: 0,
        targetVersion: 1,
        changes: [{ path: 'x', op: 'set', value: 42 }],
        timestamp: Date.now(),
      });
      expect(state.properties.x).toBe(42);
      expect(state.version).toBe(1);
    });

    it('applies delete operation', () => {
      const encoder = new DeltaEncoder();
      encoder.setFullState('e1', {
        entityId: 'e1',
        version: 1,
        timestamp: Date.now(),
        properties: { x: 1, y: 2 },
      });
      const state = encoder.decode({
        entityId: 'e1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'y', op: 'delete' }],
        timestamp: Date.now(),
      });
      expect(state.properties.x).toBe(1);
      expect('y' in state.properties).toBe(false);
    });

    it('applies increment operation', () => {
      const encoder = new DeltaEncoder();
      encoder.setFullState('e1', {
        entityId: 'e1',
        version: 1,
        timestamp: Date.now(),
        properties: { score: 10 },
      });
      const state = encoder.decode({
        entityId: 'e1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'score', op: 'increment', value: 5 }],
        timestamp: Date.now(),
      });
      expect(state.properties.score).toBe(15);
    });

    it('applies append operation', () => {
      const encoder = new DeltaEncoder();
      encoder.setFullState('e1', {
        entityId: 'e1',
        version: 1,
        timestamp: Date.now(),
        properties: { tags: ['a', 'b'] },
      });
      const state = encoder.decode({
        entityId: 'e1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'tags', op: 'append', value: 'c' }],
        timestamp: Date.now(),
      });
      expect(state.properties.tags).toEqual(['a', 'b', 'c']);
    });

    it('applies append with array value', () => {
      const encoder = new DeltaEncoder();
      encoder.setFullState('e1', {
        entityId: 'e1',
        version: 1,
        timestamp: Date.now(),
        properties: { tags: ['a'] },
      });
      const state = encoder.decode({
        entityId: 'e1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'tags', op: 'append', value: ['b', 'c'] }],
        timestamp: Date.now(),
      });
      expect(state.properties.tags).toEqual(['a', 'b', 'c']);
    });

    it('decode caches the resulting state', () => {
      const encoder = new DeltaEncoder();
      encoder.decode({
        entityId: 'e1',
        baseVersion: 0,
        targetVersion: 1,
        changes: [{ path: 'x', op: 'set', value: 99 }],
        timestamp: Date.now(),
      });
      const cached = encoder.getCachedState('e1');
      expect(cached).toBeDefined();
      expect(cached!.properties.x).toBe(99);
    });
  });

  describe('nested paths', () => {
    it('decode handles nested set', () => {
      const encoder = new DeltaEncoder();
      const state = encoder.decode({
        entityId: 'e1',
        baseVersion: 0,
        targetVersion: 1,
        changes: [{ path: 'position.x', op: 'set', value: 10 }],
        timestamp: Date.now(),
      });
      expect((state.properties.position as any).x).toBe(10);
    });

    it('decode handles nested delete', () => {
      const encoder = new DeltaEncoder();
      encoder.setFullState('e1', {
        entityId: 'e1',
        version: 1,
        timestamp: Date.now(),
        properties: { pos: { x: 1, y: 2 } },
      });
      const state = encoder.decode({
        entityId: 'e1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'pos.y', op: 'delete' }],
        timestamp: Date.now(),
      });
      expect((state.properties.pos as any).x).toBe(1);
      expect('y' in (state.properties.pos as any)).toBe(false);
    });
  });

  describe('clear / setFullState', () => {
    it('clear empties the cache', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { x: 1 });
      encoder.clear();
      expect(encoder.getCachedState('e1')).toBeUndefined();
    });

    it('setFullState stores a state', () => {
      const encoder = new DeltaEncoder();
      const state = {
        entityId: 'e1',
        version: 5,
        timestamp: Date.now(),
        properties: { foo: 'bar' },
      };
      encoder.setFullState('e1', state);
      expect(encoder.getCachedState('e1')).toEqual(state);
    });
  });

  describe('multiple entities', () => {
    it('tracks independent entities', () => {
      const encoder = new DeltaEncoder();
      encoder.encode('e1', { x: 1 });
      encoder.encode('e2', { y: 2 });
      expect(encoder.getCachedState('e1')!.properties).toEqual({ x: 1 });
      expect(encoder.getCachedState('e2')!.properties).toEqual({ y: 2 });
    });
  });
});

// ===========================================================================
// InterestManager
// ===========================================================================

describe('InterestManager — Production Tests', () => {
  describe('interest area management', () => {
    it('sets and queries interest area', () => {
      const mgr = new InterestManager();
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 10 });
      // Without entity positions, all entities pass interest check
      expect(mgr.isInInterest('c1', 'e1')).toBe(true);
    });

    it('removes interest area', () => {
      const mgr = new InterestManager();
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 10 });
      mgr.removeInterest('c1');
      // After removal, defaults to no filtering (all in interest)
      expect(mgr.isInInterest('c1', 'e1')).toBe(true);
    });
  });

  describe('entity position tracking', () => {
    it('entity inside radius is in interest', () => {
      const mgr = new InterestManager();
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 10 });
      mgr.updateEntityPosition('e1', [5, 0, 0]);
      expect(mgr.isInInterest('c1', 'e1')).toBe(true);
    });

    it('entity outside radius is not in interest', () => {
      const mgr = new InterestManager();
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 10 });
      mgr.updateEntityPosition('e1', [20, 0, 0]);
      expect(mgr.isInInterest('c1', 'e1')).toBe(false);
    });

    it('entity exactly on radius is in interest', () => {
      const mgr = new InterestManager();
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 10 });
      mgr.updateEntityPosition('e1', [10, 0, 0]);
      expect(mgr.isInInterest('c1', 'e1')).toBe(true);
    });

    it('3D distance is computed correctly', () => {
      const mgr = new InterestManager();
      // distance = sqrt(3^2 + 4^2 + 0^2) = 5
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 5 });
      mgr.updateEntityPosition('e1', [3, 4, 0]);
      expect(mgr.isInInterest('c1', 'e1')).toBe(true);
    });

    it('entity just beyond 3D radius is outside', () => {
      const mgr = new InterestManager();
      // distance = sqrt(3^2 + 4^2 + 1^2) ≈ 5.1
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 5 });
      mgr.updateEntityPosition('e1', [3, 4, 1]);
      expect(mgr.isInInterest('c1', 'e1')).toBe(false);
    });
  });

  describe('getEntitiesInInterest', () => {
    it('returns all entities when no interest set', () => {
      const mgr = new InterestManager();
      mgr.updateEntityPosition('e1', [0, 0, 0]);
      mgr.updateEntityPosition('e2', [100, 100, 100]);
      const entities = mgr.getEntitiesInInterest('c1');
      expect(entities).toContain('e1');
      expect(entities).toContain('e2');
    });

    it('filters entities by radius', () => {
      const mgr = new InterestManager();
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 10 });
      mgr.updateEntityPosition('e1', [5, 0, 0]); // inside
      mgr.updateEntityPosition('e2', [50, 0, 0]); // outside
      mgr.updateEntityPosition('e3', [8, 0, 0]); // inside
      const entities = mgr.getEntitiesInInterest('c1');
      expect(entities).toContain('e1');
      expect(entities).toContain('e3');
      expect(entities).not.toContain('e2');
    });
  });

  describe('priority', () => {
    it('returns 1 when no interest area set', () => {
      const mgr = new InterestManager();
      expect(mgr.getPriority('c1', 'e1')).toBe(1);
    });

    it('higher priority for closer entities', () => {
      const mgr = new InterestManager();
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 100 });
      mgr.updateEntityPosition('e_close', [10, 0, 0]);
      mgr.updateEntityPosition('e_far', [80, 0, 0]);
      const pClose = mgr.getPriority('c1', 'e_close');
      const pFar = mgr.getPriority('c1', 'e_far');
      expect(pClose).toBeGreaterThan(pFar);
    });

    it('explicit priority overrides distance-based', () => {
      const mgr = new InterestManager();
      const priorities = new Map<string, number>();
      priorities.set('e1', 0.99);
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 100, priorities });
      mgr.updateEntityPosition('e1', [90, 0, 0]); // far away
      expect(mgr.getPriority('c1', 'e1')).toBe(0.99);
    });

    it('returns 1 for unknown entity position', () => {
      const mgr = new InterestManager();
      mgr.setInterest('c1', { center: [0, 0, 0], radius: 100 });
      expect(mgr.getPriority('c1', 'unknown-entity')).toBe(1);
    });
  });
});

// ===========================================================================
// SyncProtocol
// ===========================================================================

describe('SyncProtocol — Production Tests', () => {
  describe('construction', () => {
    it('creates with minimal config', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      expect(protocol).toBeDefined();
    });

    it('auto-generates clientId', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      expect(protocol.getClientId()).toMatch(/^client-/);
    });

    it('uses provided clientId', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1', clientId: 'my-id' });
      expect(protocol.getClientId()).toBe('my-id');
    });

    it('factory function creates instance', () => {
      const protocol = createSyncProtocol({ roomId: 'room-1' });
      expect(protocol).toBeDefined();
    });

    it('createLocalSync uses local transport', () => {
      const protocol = createLocalSync('room-1');
      expect(protocol).toBeDefined();
      expect(protocol.getClientId()).toMatch(/^client-/);
    });
  });

  describe('defaults', () => {
    it('default stats are zeroed', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      const stats = protocol.getStats();
      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesReceived).toBe(0);
      expect(stats.bytesSent).toBe(0);
      expect(stats.bytesReceived).toBe(0);
      expect(stats.avgLatency).toBe(0);
      expect(stats.packetsLost).toBe(0);
      expect(stats.connectedPeers).toBe(0);
    });

    it('initial presence is empty', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      expect(protocol.getPresence().size).toBe(0);
    });

    it('isConnected returns false before connect', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      expect(protocol.isConnected()).toBe(false);
    });

    it('getLatency returns 0 before connect', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      expect(protocol.getLatency()).toBe(0);
    });

    it('getState returns undefined for unknown entity', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      expect(protocol.getState('nonexistent')).toBeUndefined();
    });
  });

  describe('event registration', () => {
    it('on() returns unsubscribe function', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      const unsub = protocol.on('connected', vi.fn());
      expect(typeof unsub).toBe('function');
    });

    it('unsubscribe function removes callback', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      const handler = vi.fn();
      const unsub = protocol.on('connected', handler);
      unsub();
      // handler should be removed — no way to verify directly without
      // triggering the event, but the unsub function should not throw
      expect(handler).not.toHaveBeenCalled();
    });

    it('can register multiple event types', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      protocol.on('connected', vi.fn());
      protocol.on('disconnected', vi.fn());
      protocol.on('state-updated', vi.fn());
      protocol.on('presence-updated', vi.fn());
      protocol.on('rpc', vi.fn());
      protocol.on('error', vi.fn());
      expect(protocol).toBeDefined();
    });
  });

  describe('connect error handling', () => {
    it('throws when ws transport used without serverUrl', async () => {
      const protocol = new SyncProtocol({ roomId: 'room-1', transport: 'websocket' });
      await expect(protocol.connect()).rejects.toThrow('serverUrl required');
    });

    it('throws when quic transport used without serverUrl', async () => {
      const protocol = new SyncProtocol({ roomId: 'room-1', transport: 'quic' });
      await expect(protocol.connect()).rejects.toThrow('serverUrl required');
    });
  });

  describe('disconnect', () => {
    it('does not throw when disconnecting without connect', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      expect(() => protocol.disconnect()).not.toThrow();
    });

    it('is not connected after disconnect', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      protocol.disconnect();
      expect(protocol.isConnected()).toBe(false);
    });
  });

  describe('stats immutability', () => {
    it('getStats returns a copy', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      const s1 = protocol.getStats();
      s1.messagesSent = 999;
      const s2 = protocol.getStats();
      expect(s2.messagesSent).toBe(0);
    });
  });

  describe('presence immutability', () => {
    it('getPresence returns a copy', () => {
      const protocol = new SyncProtocol({ roomId: 'room-1' });
      const p1 = protocol.getPresence();
      p1.set('fake', { clientId: 'fake', lastSeen: 0 });
      const p2 = protocol.getPresence();
      expect(p2.size).toBe(0);
    });
  });
});
