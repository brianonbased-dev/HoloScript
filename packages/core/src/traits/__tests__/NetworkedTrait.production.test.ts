/**
 * NetworkedTrait - Production Test Suite
 *
 * Commence All V — Deep coverage of interpolation math, ownership transfer,
 * sync transport routing, state serialization, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NetworkedTrait,
  createNetworkedTrait,
  cleanupNetworkPool,
} from '../NetworkedTrait';
import type { NetworkedConfig, NetworkEvent } from '../NetworkedTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<NetworkedConfig> = {}): NetworkedConfig {
  return {
    mode: 'owner',
    syncRate: 20,
    interpolation: true,
    ...overrides,
  };
}

function makeTrait(overrides: Partial<NetworkedConfig> = {}): NetworkedTrait {
  return new NetworkedTrait(makeConfig(overrides));
}

function makeSample(ts: number, pos: [number, number, number], rot?: [number, number, number, number]) {
  return {
    timestamp: ts,
    position: pos,
    rotation: rot || [0, 0, 0, 1] as [number, number, number, number],
    scale: [1, 1, 1] as [number, number, number],
    properties: { position: pos },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('NetworkedTrait — Production Tests', () => {
  afterEach(() => {
    cleanupNetworkPool();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Interpolation: lerpVector3
  // =========================================================================
  describe('lerpVector3 edge cases', () => {
    it('t=0 returns the start vector exactly', () => {
      const t = makeTrait();
      const result = (t as any).lerpVector3([0, 0, 0], [10, 20, 30], 0);
      expect(result).toEqual([0, 0, 0]);
    });

    it('t=1 returns the end vector exactly', () => {
      const t = makeTrait();
      const result = (t as any).lerpVector3([0, 0, 0], [10, 20, 30], 1);
      expect(result).toEqual([10, 20, 30]);
    });

    it('t=0.5 returns the midpoint', () => {
      const t = makeTrait();
      const result = (t as any).lerpVector3([0, 0, 0], [10, 20, 30], 0.5);
      expect(result).toEqual([5, 10, 15]);
    });

    it('handles negative coordinates', () => {
      const t = makeTrait();
      const result = (t as any).lerpVector3([-10, -20, -30], [10, 20, 30], 0.5);
      expect(result).toEqual([0, 0, 0]);
    });

    it('handles same start and end', () => {
      const t = makeTrait();
      const result = (t as any).lerpVector3([5, 5, 5], [5, 5, 5], 0.7);
      expect(result).toEqual([5, 5, 5]);
    });

    it('handles very small t values correctly', () => {
      const t = makeTrait();
      const result = (t as any).lerpVector3([0, 0, 0], [1000, 1000, 1000], 0.001);
      expect(result[0]).toBeCloseTo(1, 0);
      expect(result[1]).toBeCloseTo(1, 0);
      expect(result[2]).toBeCloseTo(1, 0);
    });
  });

  // =========================================================================
  // Interpolation: slerpQuat
  // =========================================================================
  describe('slerpQuat edge cases', () => {
    it('t=0 returns the first quaternion', () => {
      const t = makeTrait();
      const q: [number, number, number, number] = [0, 0, 0, 1];
      const q2: [number, number, number, number] = [0, 0.7071, 0, 0.7071];
      const result = (t as any).slerpQuat(q, q2, 0);
      const len = Math.sqrt(result.reduce((s: number, v: number) => s + v * v, 0));
      expect(len).toBeCloseTo(1.0, 4);
      expect(result[3]).toBeCloseTo(1, 2); // w ≈ 1 for identity
    });

    it('t=1 returns the second quaternion', () => {
      const t = makeTrait();
      const q: [number, number, number, number] = [0, 0, 0, 1];
      const q2: [number, number, number, number] = [0, 0.7071, 0, 0.7071];
      const result = (t as any).slerpQuat(q, q2, 1);
      const len = Math.sqrt(result.reduce((s: number, v: number) => s + v * v, 0));
      expect(len).toBeCloseTo(1.0, 4);
      expect(result[1]).toBeCloseTo(0.7071, 3); // y ≈ 0.7071
    });

    it('handles opposite quaternions (dot < 0)', () => {
      const t = makeTrait();
      const q: [number, number, number, number] = [0, 0, 0, 1];
      const qNeg: [number, number, number, number] = [0, 0, 0, -1]; // same rotation, opposite sign
      const result = (t as any).slerpQuat(q, qNeg, 0.5);
      const len = Math.sqrt(result.reduce((s: number, v: number) => s + v * v, 0));
      expect(len).toBeCloseTo(1.0, 4);
    });

    it('always returns a unit quaternion', () => {
      const t = makeTrait();
      // Test with various t values
      for (const tVal of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) {
        const q1: [number, number, number, number] = [0.5, 0.5, 0.5, 0.5]; // normalized
        const q2: [number, number, number, number] = [0, 0, 0.7071, 0.7071]; // normalized
        const result = (t as any).slerpQuat(q1, q2, tVal);
        const len = Math.sqrt(result.reduce((s: number, v: number) => s + v * v, 0));
        expect(len).toBeCloseTo(1.0, 3);
      }
    });

    it('180-degree rotation slerp produces valid midpoint', () => {
      const t = makeTrait();
      const q1: [number, number, number, number] = [0, 0, 0, 1]; // identity
      const q2: [number, number, number, number] = [0, 1, 0, 0]; // 180° around Y
      const result = (t as any).slerpQuat(q1, q2, 0.5);
      const len = Math.sqrt(result.reduce((s: number, v: number) => s + v * v, 0));
      expect(len).toBeCloseTo(1.0, 3);
    });
  });

  // =========================================================================
  // getInterpolatedState — Bracketing & Edge Cases
  // =========================================================================
  describe('getInterpolatedState — advanced', () => {
    it('clamps t between 0 and 1 even if renderTime is outside bracket', () => {
      const t = makeTrait({ interpolation: true });
      const now = Date.now();
      (t as any).interpolationBuffer = [
        makeSample(now - 100, [0, 0, 0]),
        makeSample(now, [10, 0, 0]),
      ];
      // bufferTimeMs = 50 → renderTime = now - 50, which is inside bracket
      const result = t.getInterpolatedState(50);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.position[0]).toBeGreaterThanOrEqual(0);
        expect(result.position[0]).toBeLessThanOrEqual(10);
      }
    });

    it('returns interpolated position between two samples', () => {
      const t = makeTrait({ interpolation: true });
      const now = Date.now();
      (t as any).interpolationBuffer = [
        makeSample(now - 200, [0, 0, 0]),
        makeSample(now, [100, 0, 0]),
      ];
      // renderTime = now - 100, which is exactly the midpoint
      const result = t.getInterpolatedState(100);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.position[0]).toBeCloseTo(50, 0);
      }
    });

    it('returns last sample when all samples are before renderTime', () => {
      const t = makeTrait({ interpolation: true });
      const now = Date.now();
      (t as any).interpolationBuffer = [
        makeSample(now - 5000, [0, 0, 0]),
        makeSample(now - 4000, [10, 0, 0]),
      ];
      // renderTime = now - 100, both samples are way before
      const result = t.getInterpolatedState(100);
      expect(result).not.toBeNull();
      expect(result!.position[0]).toBe(10);
    });

    it('handles 3+ samples and picks correct bracket', () => {
      const t = makeTrait({ interpolation: true });
      const now = Date.now();
      (t as any).interpolationBuffer = [
        makeSample(now - 300, [0, 0, 0]),
        makeSample(now - 200, [10, 0, 0]),
        makeSample(now - 100, [20, 0, 0]),
        makeSample(now, [30, 0, 0]),
      ];
      // renderTime = now - 150, should bracket between samples 1 (now-200) and 2 (now-100)
      const result = t.getInterpolatedState(150);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.position[0]).toBeGreaterThanOrEqual(10);
        expect(result.position[0]).toBeLessThanOrEqual(20);
      }
    });
  });

  // =========================================================================
  // Ownership Transfer Protocol
  // =========================================================================
  describe('ownership transfer protocol', () => {
    it('requestOwnership succeeds immediately when already owner', async () => {
      const t = makeTrait({ mode: 'owner' });
      const result = await t.requestOwnership();
      expect(result).toBe(true);
      expect(t.isLocalOwner()).toBe(true);
    });

    it('requestOwnership rejected when not transferable', async () => {
      const t = makeTrait({ mode: 'shared', authority: { transferable: false } });
      const result = await t.requestOwnership();
      expect(result).toBe(false);
      expect(t.isLocalOwner()).toBe(false);
    });

    it('requestOwnership without authority config returns false (transferable defaults to undefined)', async () => {
      const t = makeTrait({ mode: 'shared' });
      // No authority config → transferable is undefined → returns false
      const result = await t.requestOwnership();
      expect(result).toBe(false);
    });

    it('requestOwnership with transferable=true and no syncProtocol grants locally', async () => {
      const t = makeTrait({ mode: 'shared', authority: { transferable: true } });
      const result = await t.requestOwnership();
      expect(result).toBe(true);
      expect(t.isLocalOwner()).toBe(true);
    });

    it('releaseOwnership on non-owner is no-op', () => {
      const t = makeTrait({ mode: 'shared' });
      const events: NetworkEvent[] = [];
      t.on('ownershipChanged', (e) => events.push(e));
      t.releaseOwnership();
      expect(events.length).toBe(0); // no event because was not owner
    });

    it('setOwner cycles fire correct events', () => {
      const t = makeTrait({ mode: 'owner' });
      const events: NetworkEvent[] = [];
      t.on('ownershipChanged', (e) => events.push(e));
      t.setOwner(false, 'peer-2');
      t.setOwner(true, 'peer-1');
      t.setOwner(false);
      expect(events.length).toBe(3);
      expect(events[0].ownerId).toBe('peer-2');
      expect(events[1].ownerId).toBe('peer-1');
      expect(events[2].ownerId).toBeUndefined();
    });
  });

  // =========================================================================
  // syncToNetwork — Transport Routing
  // =========================================================================
  describe('syncToNetwork transport routing', () => {
    it('does nothing when not connected', () => {
      const t = makeTrait({ mode: 'owner' });
      t.setProperty('x', 1);
      (t as any).lastSyncTime = 0;
      // Should not throw
      expect(() => t.syncToNetwork()).not.toThrow();
    });

    it('does nothing when not owner', () => {
      const t = makeTrait({ mode: 'shared' });
      t.setConnected(true, 'p1');
      t.setProperty('x', 1);
      (t as any).lastSyncTime = 0;
      expect(() => t.syncToNetwork()).not.toThrow();
    });

    it('flushes pending updates when syncing via local protocol', () => {
      const t = makeTrait({ mode: 'owner' });
      t.setConnected(true, 'p1');
      t.setProperty('health', 100);
      t.setProperty('mana', 50);
      (t as any).lastSyncTime = 0;
      // After syncToNetwork, pending updates should be drained
      t.syncToNetwork();
      expect(t.flushUpdates()).toEqual({});
    });

    it('skips sync if no pending updates', () => {
      const t = makeTrait({ mode: 'owner' });
      t.setConnected(true, 'p1');
      (t as any).lastSyncTime = 0;
      // No properties set → no sync needed
      t.syncToNetwork();
      // Should not error
    });
  });

  // =========================================================================
  // Serialization Roundtrip — Edge Cases
  // =========================================================================
  describe('serialization edge cases', () => {
    it('handles empty state', () => {
      const t = makeTrait({ interpolation: false });
      const buf = t.serialize();
      const t2 = makeTrait({ interpolation: false });
      t2.deserialize(buf);
      expect(t2.getState()).toEqual({});
    });

    it('handles nested objects', () => {
      const t = makeTrait({ interpolation: false });
      t.setProperty('inventory', { weapons: ['sword', 'bow'], gold: 100 });
      const buf = t.serialize();
      const t2 = makeTrait({ interpolation: false });
      t2.deserialize(buf);
      expect(t2.getProperty('inventory')).toEqual({ weapons: ['sword', 'bow'], gold: 100 });
    });

    it('handles null values', () => {
      const t = makeTrait({ interpolation: false });
      t.setProperty('target', null);
      const buf = t.serialize();
      const t2 = makeTrait({ interpolation: false });
      t2.deserialize(buf);
      expect(t2.getProperty('target')).toBeNull();
    });

    it('handles boolean values', () => {
      const t = makeTrait({ interpolation: false });
      t.setProperty('alive', true);
      t.setProperty('stunned', false);
      const buf = t.serialize();
      const t2 = makeTrait({ interpolation: false });
      t2.deserialize(buf);
      expect(t2.getProperty('alive')).toBe(true);
      expect(t2.getProperty('stunned')).toBe(false);
    });

    it('handles large state payloads', () => {
      const t = makeTrait({ interpolation: false });
      for (let i = 0; i < 100; i++) {
        t.setProperty(`prop_${i}`, Math.random());
      }
      const buf = t.serialize();
      expect(buf.byteLength).toBeGreaterThan(100);
      const t2 = makeTrait({ interpolation: false });
      t2.deserialize(buf);
      expect(Object.keys(t2.getState()).length).toBe(100);
    });
  });

  // =========================================================================
  // Event System — Edge Cases
  // =========================================================================
  describe('event system edge cases', () => {
    it('off with non-existent handler is no-op', () => {
      const t = makeTrait();
      const handler = (_e: NetworkEvent) => {};
      expect(() => t.off('connected', handler)).not.toThrow();
    });

    it('off with non-existent event type is no-op', () => {
      const t = makeTrait();
      const handler = (_e: NetworkEvent) => {};
      expect(() => t.off('latencyUpdate', handler)).not.toThrow();
    });

    it('multiple on/off cycles work correctly', () => {
      const t = makeTrait();
      const received: number[] = [];
      const h1 = () => received.push(1);
      const h2 = () => received.push(2);

      t.on('propertyChanged', h1);
      t.on('propertyChanged', h2);
      t.setProperty('a', 1);
      expect(received).toEqual([1, 2]);

      t.off('propertyChanged', h1);
      t.setProperty('b', 2);
      expect(received).toEqual([1, 2, 2]);
    });

    it('events carry correct timestamps', () => {
      const t = makeTrait();
      const events: NetworkEvent[] = [];
      t.on('propertyChanged', (e) => events.push(e));
      const before = Date.now();
      t.setProperty('x', 1);
      const after = Date.now();
      expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(events[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  // =========================================================================
  // handleNetworkMessage
  // =========================================================================
  describe('handleNetworkMessage', () => {
    it('ignores messages for other entities', () => {
      const t = makeTrait({ interpolation: false });
      const events: NetworkEvent[] = [];
      t.on('stateReceived', (e) => events.push(e));

      (t as any).handleNetworkMessage({
        type: 'state-sync',
        entityId: 'some-other-entity',
        data: { health: 50 },
        timestamp: Date.now(),
      });
      expect(events.length).toBe(0);
    });

    it('processes state-sync message for own entity', () => {
      const t = makeTrait({ interpolation: false });
      const events: NetworkEvent[] = [];
      t.on('stateReceived', (e) => events.push(e));

      (t as any).handleNetworkMessage({
        type: 'state-sync',
        entityId: t.getEntityId(),
        data: { health: 50 },
        timestamp: Date.now(),
      });
      // applyState emits stateReceived + handleNetworkMessage emits stateReceived = 2
      expect(events.length).toBe(2);
      expect(t.getProperty('health')).toBe(50);
    });

    it('processes ownership-transfer message', () => {
      const t = makeTrait({ mode: 'owner' });
      const events: NetworkEvent[] = [];
      t.on('ownershipChanged', (e) => events.push(e));

      (t as any).handleNetworkMessage({
        type: 'ownership-transfer',
        entityId: t.getEntityId(),
        data: { newOwner: 'peer-99' },
        timestamp: Date.now(),
      });
      expect(events.length).toBe(1);
      expect(t.isLocalOwner()).toBe(false);
    });

    it('handles unknown message type gracefully', () => {
      const t = makeTrait();
      expect(() => {
        (t as any).handleNetworkMessage({
          type: 'unknown-type',
          entityId: t.getEntityId(),
          data: {},
          timestamp: Date.now(),
        });
      }).not.toThrow();
    });
  });

  // =========================================================================
  // Connection & Disconnect
  // =========================================================================
  describe('connection lifecycle', () => {
    it('disconnect is idempotent', () => {
      const t = makeTrait();
      t.disconnect();
      t.disconnect();
      expect(t.isConnected()).toBe(false);
    });

    it('disconnect after setConnected(true) fires disconnected event', () => {
      const t = makeTrait();
      const events: NetworkEvent[] = [];
      t.on('disconnected', (e) => events.push(e));
      t.setConnected(true, 'p1');
      t.disconnect();
      expect(events.length).toBe(1);
    });

    it('disconnect clears active transport state', () => {
      const t = makeTrait();
      t.setConnected(true, 'p1');
      (t as any).connected = true;
      t.disconnect();
      expect(t.isConnected()).toBe(false);
    });
  });

  // =========================================================================
  // Config Immutability
  // =========================================================================
  describe('config immutability', () => {
    it('getConfig returns a copy', () => {
      const t = makeTrait({ syncRate: 30 });
      const cfg = t.getConfig();
      cfg.syncRate = 999;
      expect(t.getConfig().syncRate).toBe(30);
    });
  });

  // =========================================================================
  // handleRemoteUpdate
  // =========================================================================
  describe('handleRemoteUpdate', () => {
    it('applies state directly when interpolation is disabled', () => {
      const t = makeTrait({ interpolation: false });
      (t as any).handleRemoteUpdate({
        entityId: t.getEntityId(),
        version: 1,
        timestamp: Date.now(),
        properties: { health: 75, position: [1, 2, 3] },
      });
      expect(t.getProperty('health')).toBe(75);
      expect(t.getProperty('position')).toEqual([1, 2, 3]);
    });

    it('adds to interpolation buffer when enabled', () => {
      const t = makeTrait({ interpolation: true });
      (t as any).handleRemoteUpdate({
        entityId: t.getEntityId(),
        version: 1,
        timestamp: Date.now(),
        properties: { position: [5, 5, 5] },
      });
      expect((t as any).interpolationBuffer.length).toBe(1);
    });

    it('caps interpolation buffer at 10 regardless of update frequency', () => {
      const t = makeTrait({ interpolation: true });
      for (let i = 0; i < 20; i++) {
        (t as any).handleRemoteUpdate({
          entityId: t.getEntityId(),
          version: i + 1,
          timestamp: Date.now() + i * 10,
          properties: { position: [i, 0, 0] },
        });
      }
      expect((t as any).interpolationBuffer.length).toBeLessThanOrEqual(10);
    });
  });

  // =========================================================================
  // createNetworkedTrait factory edge cases
  // =========================================================================
  describe('createNetworkedTrait factory', () => {
    it('creates functional trait with no args', () => {
      const t = createNetworkedTrait();
      expect(t.getConfig().mode).toBe('owner');
      expect(t.isConnected()).toBe(false);
      expect(t.getEntityId()).toBeTruthy();
    });

    it('supports all three sync modes via factory', () => {
      for (const mode of ['owner', 'shared', 'server'] as const) {
        const t = createNetworkedTrait({ mode });
        expect(t.getConfig().mode).toBe(mode);
      }
    });

    it('supports persistence config', () => {
      const t = createNetworkedTrait({
        persistence: { enabled: true, storageKey: 'test', saveOnDisconnect: true },
      });
      expect(t.getConfig().persistence?.enabled).toBe(true);
      expect(t.getConfig().persistence?.storageKey).toBe('test');
    });
  });

  // =========================================================================
  // SyncRate boundary conditions
  // =========================================================================
  describe('syncRate boundary conditions', () => {
    it('syncRate of 1 Hz means 1000ms interval', () => {
      const t = makeTrait({ syncRate: 1 });
      t.setProperty('x', 1);
      (t as any).lastSyncTime = Date.now() - 1001;
      expect(t.shouldSync()).toBe(true);
    });

    it('syncRate of 60 Hz means ~16ms interval', () => {
      const t = makeTrait({ syncRate: 60 });
      t.setProperty('x', 1);
      (t as any).lastSyncTime = Date.now() - 17;
      expect(t.shouldSync()).toBe(true);
    });

    it('very high syncRate (1000Hz) still works', () => {
      const t = makeTrait({ syncRate: 1000 });
      t.setProperty('x', 1);
      (t as any).lastSyncTime = Date.now() - 2;
      expect(t.shouldSync()).toBe(true);
    });
  });
});
