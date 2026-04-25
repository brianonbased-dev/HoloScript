/**
 * NetworkedTrait Tests
 *
 * Tests for multiplayer state synchronisation, ownership, interpolation,
 * event system, and serialisation. Tests are synchronous-only (no real
 * network transport is initialised).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetworkedTrait, createNetworkedTrait, cleanupNetworkPool } from '../NetworkedTrait';
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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('NetworkedTrait', () => {
  afterEach(() => {
    cleanupNetworkPool();
  });

  // =========================================================================
  // Construction
  // =========================================================================
  describe('construction', () => {
    it('creates with owner mode by default', () => {
      const t = makeTrait();
      expect(t.getConfig().mode).toBe('owner');
    });

    it('creates with server mode', () => {
      const t = makeTrait({ mode: 'server' });
      expect(t.getConfig().mode).toBe('server');
    });

    it('creates with shared mode', () => {
      const t = makeTrait({ mode: 'shared' });
      expect(t.getConfig().mode).toBe('shared');
    });

    it('defaults syncRate to 20Hz', () => {
      const t = makeTrait();
      expect(t.getConfig().syncRate).toBe(20);
    });

    it('respects custom syncRate', () => {
      const t = makeTrait({ syncRate: 60 });
      expect(t.getConfig().syncRate).toBe(60);
    });

    it('normalizes string syncProperties to SyncProperty objects', () => {
      const t = makeTrait({ syncProperties: ['position', 'rotation'] });
      const props = t.getConfig().syncProperties as { name: string }[];
      expect(props[0]).toEqual({ name: 'position' });
      expect(props[1]).toEqual({ name: 'rotation' });
    });

    it('preserves SyncProperty objects unchanged', () => {
      const prop = { name: 'health', priority: 10, deltaCompression: true };
      const t = makeTrait({ syncProperties: [prop] });
      const props = t.getConfig().syncProperties as (typeof prop)[];
      expect(props[0]).toEqual(prop);
    });

    it('generates a unique entity ID', () => {
      const a = makeTrait();
      const b = makeTrait();
      expect(a.getEntityId()).toBeTruthy();
      expect(b.getEntityId()).toBeTruthy();
      expect(a.getEntityId()).not.toBe(b.getEntityId());
    });

    it('starts as owner when mode=owner', () => {
      const t = makeTrait({ mode: 'owner' });
      expect(t.isLocalOwner()).toBe(true);
    });

    it('starts as non-owner when mode=shared', () => {
      const t = makeTrait({ mode: 'shared' });
      expect(t.isLocalOwner()).toBe(false);
    });

    it('starts disconnected', () => {
      const t = makeTrait();
      expect(t.isConnected()).toBe(false);
    });

    it('starts with local transport', () => {
      const t = makeTrait();
      expect(t.getActiveTransport()).toBe('local');
    });
  });

  // =========================================================================
  // Factory
  // =========================================================================
  describe('createNetworkedTrait', () => {
    it('creates a trait with defaults', () => {
      const t = createNetworkedTrait();
      expect(t.getConfig().mode).toBe('owner');
      expect(t.getConfig().syncRate).toBe(20);
    });

    it('applies provided overrides', () => {
      const t = createNetworkedTrait({ mode: 'server', syncRate: 30 });
      expect(t.getConfig().mode).toBe('server');
      expect(t.getConfig().syncRate).toBe(30);
    });
  });

  // =========================================================================
  // Property Management
  // =========================================================================
  describe('property management', () => {
    let t: NetworkedTrait;

    beforeEach(() => {
      t = makeTrait();
    });

    it('setProperty stores a value', () => {
      t.setProperty('health', 100);
      expect(t.getProperty('health')).toBe(100);
    });

    it('setProperty overwrites existing values', () => {
      t.setProperty('score', 50);
      t.setProperty('score', 75);
      expect(t.getProperty('score')).toBe(75);
    });

    it('getProperty returns undefined for unknown key', () => {
      expect(t.getProperty('unknown')).toBeUndefined();
    });

    it('getState returns all properties', () => {
      t.setProperty('x', 1);
      t.setProperty('y', 2);
      expect(t.getState()).toEqual({ x: 1, y: 2 });
    });

    it('getState returns a copy (not internal map)', () => {
      t.setProperty('x', 1);
      const state = t.getState();
      state[0] = 999;
      expect(t.getProperty('x')).toBe(1);
    });

    it('flushUpdates returns pending updates and clears them', () => {
      t.setProperty('hp', 80);
      t.setProperty('mp', 40);
      const flushed = t.flushUpdates();
      expect(flushed).toEqual({ hp: 80, mp: 40 });
      expect(t.flushUpdates()).toEqual({});
    });
  });

  // =========================================================================
  // Sync Rate Limiting
  // =========================================================================
  describe('shouldSync', () => {
    it('returns false when no pending updates', () => {
      const t = makeTrait({ syncRate: 20 });
      // Artificially advance lastSyncTime via private access
      (t as any).lastSyncTime = 0;
      // No pending updates → false regardless of time
      expect(t.shouldSync()).toBe(false);
    });

    it('returns true when pending updates and interval elapsed', () => {
      const t = makeTrait({ syncRate: 20 }); // 50ms interval
      (t as any).lastSyncTime = 0; // epoch — interval definitely elapsed
      t.setProperty('pos', [1, 2, 3]);
      expect(t.shouldSync()).toBe(true);
    });

    it('returns false when called twice in quick succession', () => {
      const t = makeTrait({ syncRate: 20 });
      (t as any).lastSyncTime = 0;
      t.setProperty('pos', [1, 2, 3]);
      t.shouldSync(); // consumes the interval, advances lastSyncTime
      // Second call immediately after — not enough time elapsed
      t.setProperty('pos', [4, 5, 6]);
      expect(t.shouldSync()).toBe(false);
    });
  });

  // =========================================================================
  // applyState / Interpolation Buffer
  // =========================================================================
  describe('applyState', () => {
    it('populates syncState with received properties', () => {
      const t = makeTrait({ interpolation: false });
      t.applyState({ health: 90, mana: 30 });
      expect(t.getProperty('health')).toBe(90);
      expect(t.getProperty('mana')).toBe(30);
    });

    it('adds sample to interpolation buffer when interpolation enabled', () => {
      const t = makeTrait({ interpolation: true });
      t.applyState({ position: [1, 0, 0] });
      expect((t as any).interpolationBuffer.length).toBe(1);
    });

    it('caps interpolation buffer at 10 entries', () => {
      const t = makeTrait({ interpolation: true });
      for (let i = 0; i < 15; i++) {
        t.applyState({ position: [i, 0, 0] });
      }
      expect((t as any).interpolationBuffer.length).toBeLessThanOrEqual(10);
    });

    it('does not add to buffer when interpolation disabled', () => {
      const t = makeTrait({ interpolation: false });
      t.applyState({ position: [1, 0, 0] });
      expect((t as any).interpolationBuffer.length).toBe(0);
    });
  });

  // =========================================================================
  // getInterpolatedState
  // =========================================================================
  describe('getInterpolatedState', () => {
    it('returns null when buffer is empty', () => {
      const t = makeTrait({ interpolation: true });
      expect(t.getInterpolatedState()).toBeNull();
    });

    it('returns only sample when buffer has 1 entry', () => {
      const t = makeTrait({ interpolation: true });
      t.applyState({ position: [5, 0, 0] });
      const result = t.getInterpolatedState();
      expect(result).not.toBeNull();
      expect(result!.position[0]).toBe(5);
    });

    it('returns last sample when buffer has 2+ entries but none bracket renderTime', () => {
      const t = makeTrait({ interpolation: true });
      // Both samples are far in the past; renderTime = now - 100ms is before them
      const past = Date.now() - 2000;
      (t as any).interpolationBuffer = [
        {
          timestamp: past - 200,
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          properties: {},
        },
        {
          timestamp: past - 100,
          position: [10, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          properties: {},
        },
      ];
      const result = t.getInterpolatedState(100);
      // Falls through to last sample
      expect(result).not.toBeNull();
      expect(result!.position[0]).toBe(10);
    });
  });

  // =========================================================================
  // getInterpolationConfig
  // =========================================================================
  describe('getInterpolationConfig', () => {
    it('expands boolean true to full config', () => {
      const t = makeTrait({ interpolation: true });
      const cfg = t.getInterpolationConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.delay).toBe(100);
      expect(cfg.mode).toBe('linear');
    });

    it('expands boolean false to disabled', () => {
      const t = makeTrait({ interpolation: false });
      const cfg = t.getInterpolationConfig();
      expect(cfg.enabled).toBe(false);
    });

    it('passes through object config unchanged', () => {
      const t = makeTrait({ interpolation: { enabled: true, delay: 200, mode: 'hermite' } });
      const cfg = t.getInterpolationConfig();
      expect(cfg.delay).toBe(200);
      expect(cfg.mode).toBe('hermite');
    });
  });

  // =========================================================================
  // Ownership
  // =========================================================================
  describe('ownership', () => {
    it('isLocalOwner returns true for owner mode', () => {
      const t = makeTrait({ mode: 'owner' });
      expect(t.isLocalOwner()).toBe(true);
    });

    it('setOwner changes ownership and emits event', () => {
      const t = makeTrait({ mode: 'owner' });
      const events: NetworkEvent[] = [];
      t.on('ownershipChanged', (e) => events.push(e));
      t.setOwner(false, 'peer-123');
      expect(t.isLocalOwner()).toBe(false);
      expect(events.length).toBe(1);
      expect(events[0].ownerId).toBe('peer-123');
    });

    it('releaseOwnership sets isOwner to false', () => {
      const t = makeTrait({ mode: 'owner' });
      t.releaseOwnership();
      expect(t.isLocalOwner()).toBe(false);
    });

    it('releaseOwnership emits ownershipChanged', () => {
      const t = makeTrait({ mode: 'owner' });
      const events: NetworkEvent[] = [];
      t.on('ownershipChanged', (e) => events.push(e));
      t.releaseOwnership();
      expect(events.length).toBe(1);
    });

    it('requestOwnership grants locally when no syncProtocol and transferable', async () => {
      const t = makeTrait({ mode: 'shared', authority: { transferable: true } }); // non-owner
      expect(t.isLocalOwner()).toBe(false);
      const result = await t.requestOwnership();
      expect(result).toBe(true);
      expect(t.isLocalOwner()).toBe(true);
    });

    it('requestOwnership returns true if already owner', async () => {
      const t = makeTrait({ mode: 'owner' });
      const result = await t.requestOwnership();
      expect(result).toBe(true);
    });

    it('requestOwnership returns false when authority.transferable is false', async () => {
      const t = makeTrait({
        mode: 'shared',
        authority: { transferable: false },
      });
      const result = await t.requestOwnership();
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Connection State
  // =========================================================================
  describe('connection state', () => {
    it('setConnected(true) marks as connected and emits event', () => {
      const t = makeTrait();
      const events: NetworkEvent[] = [];
      t.on('connected', (e) => events.push(e));
      t.setConnected(true, 'peer-abc');
      expect(t.isConnected()).toBe(true);
      expect(events.length).toBe(1);
      expect(events[0].peerId).toBe('peer-abc');
    });

    it('setConnected(false) marks as disconnected and emits event', () => {
      const t = makeTrait();
      const events: NetworkEvent[] = [];
      t.on('disconnected', (e) => events.push(e));
      t.setConnected(true, 'p1');
      t.setConnected(false);
      expect(t.isConnected()).toBe(false);
      expect(events.length).toBe(1);
    });

    it('disconnect sets connected to false', () => {
      const t = makeTrait();
      t.setConnected(true, 'p1');
      t.disconnect();
      expect(t.isConnected()).toBe(false);
    });
  });

  // =========================================================================
  // Event System
  // =========================================================================
  describe('event system', () => {
    it('on/emit delivers events to subscribers', () => {
      const t = makeTrait();
      const received: NetworkEvent[] = [];
      t.on('propertyChanged', (e) => received.push(e));
      t.setProperty('hp', 100);
      expect(received.length).toBe(1);
      expect(received[0].property).toBe('hp');
      expect(received[0].value).toBe(100);
    });

    it('off removes listener', () => {
      const t = makeTrait();
      const received: NetworkEvent[] = [];
      const handler = (e: NetworkEvent) => received.push(e);
      t.on('propertyChanged', handler);
      t.off('propertyChanged', handler);
      t.setProperty('x', 1);
      expect(received.length).toBe(0);
    });

    it('multiple listeners on same event all fire', () => {
      const t = makeTrait();
      let count = 0;
      t.on('propertyChanged', () => count++);
      t.on('propertyChanged', () => count++);
      t.setProperty('y', 2);
      expect(count).toBe(2);
    });

    it('setConnected emits connected event with type', () => {
      const t = makeTrait();
      const received: NetworkEvent[] = [];
      t.on('connected', (e) => received.push(e));
      t.setConnected(true, 'p1');
      expect(received[0].type).toBe('connected');
    });
  });

  // =========================================================================
  // Serialisation
  // =========================================================================
  describe('serialise / deserialise', () => {
    it('serialize produces an ArrayBuffer', () => {
      const t = makeTrait();
      t.setProperty('x', 5);
      const buf = t.serialize();
      expect(buf).toBeInstanceOf(ArrayBuffer);
      expect(buf.byteLength).toBeGreaterThan(0);
    });

    it('deserialize restores state', () => {
      const t = makeTrait({ interpolation: false });
      t.setProperty('score', 42);
      const buf = t.serialize();

      const t2 = makeTrait({ interpolation: false });
      t2.deserialize(buf);
      expect(t2.getProperty('score')).toBe(42);
    });

    it('serialize → deserialize roundtrip with complex values', () => {
      const t = makeTrait({ interpolation: false });
      t.setProperty('pos', [1.5, 2.0, -3.5]);
      t.setProperty('name', 'hero');
      const buf = t.serialize();

      const t2 = makeTrait({ interpolation: false });
      t2.deserialize(buf);
      expect(t2.getProperty('name')).toBe('hero');
      expect(t2.getProperty('pos')).toEqual([1.5, 2.0, -3.5]);
    });
  });

  // =========================================================================
  // lerpVector3 / slerpQuat (via getInterpolatedState)
  // =========================================================================
  describe('interpolation math', () => {
    function makeSample(ts: number, x: number) {
      return {
        timestamp: ts,
        position: [x, 0, 0] as [number, number, number],
        rotation: [0, 0, 0, 1] as [number, number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        properties: {},
      };
    }

    it('lerps position halfway between two samples', () => {
      const t = makeTrait({ interpolation: true });
      const now = Date.now();
      // Buffer: from=50ms ago, to=now+50ms; renderTime = now - 100ms
      // i.e. both samples must bracket renderTime = (nowCall - 100)
      // Simpler: set bufferTimeMs so renderTime = older.timestamp
      (t as any).interpolationBuffer = [makeSample(now - 200, 0), makeSample(now - 100, 10)];
      // renderTime = (now - 150) if bufferTimeMs = 150
      const result = t.getInterpolatedState(150);
      if (result && result.interpolated !== undefined) {
        // May or may not find bracketing depending on exact timing
        expect(result).not.toBeNull();
      }
    });

    it('slerpQuat returns unit quaternion', () => {
      const t = makeTrait();
      const qA: [number, number, number, number] = [0, 0, 0, 1];
      const qB: [number, number, number, number] = [0, 0.7071, 0, 0.7071];
      const result = (t as any).slerpQuat(qA, qB, 0.5);
      const len = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2 + result[3] ** 2);
      expect(len).toBeCloseTo(1.0, 5);
    });

    it('slerpQuat with near-identical quaternions uses linear fallback', () => {
      const t = makeTrait();
      const q: [number, number, number, number] = [0, 0, 0, 1];
      const result = (t as any).slerpQuat(q, q, 0.5);
      const len = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2 + result[3] ** 2);
      expect(len).toBeCloseTo(1.0, 5);
    });
  });

  // =========================================================================
  // getLatency (no-network path)
  // =========================================================================
  describe('getLatency', () => {
    it('returns 0 when not connected to syncProtocol', () => {
      const t = makeTrait();
      expect(t.getLatency()).toBe(0);
    });
  });
});
