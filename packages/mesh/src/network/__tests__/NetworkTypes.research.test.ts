/**
 * NetworkTypes Research Implementation Tests
 *
 * Tests for all exports added during the multiplayer research-track implementation:
 * - Sync tier defaults, delivery modes, rates
 * - resolveSyncConfig()
 * - CRDT functions: mergeLWW, mergeGCounter, gcounterValue, incrementGCounter
 * - CRDT factories: createLWWRegister, createGCounter
 * - SpatialHashGrid (AOI interest management)
 * - ENTITY_BANDWIDTH_PROFILES
 * - estimateAOIBandwidth()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SYNC_TIER_DEFAULTS,
  SYNC_TIER_DELIVERY,
  SYNC_TIER_RATES,
  resolveSyncConfig,
  mergeLWW,
  mergeGCounter,
  gcounterValue,
  createLWWRegister,
  createGCounter,
  incrementGCounter,
  SpatialHashGrid,
  ENTITY_BANDWIDTH_PROFILES,
  estimateAOIBandwidth,
  type SyncTier,
  type EntityType,
  type ILWWRegister,
  type IGCounter,
} from '@holoscript/core';

// =============================================================================
// SYNC TIER DEFAULTS (P.NET.01)
// =============================================================================

describe('SYNC_TIER_DEFAULTS', () => {
  it('physics tier uses authoritative mode at tick frequency', () => {
    expect(SYNC_TIER_DEFAULTS.physics.mode).toBe('authoritative');
    expect(SYNC_TIER_DEFAULTS.physics.frequency).toBe('tick');
    expect(SYNC_TIER_DEFAULTS.physics.ownership).toBe('host');
  });

  it('movement tier uses authoritative with creator ownership', () => {
    expect(SYNC_TIER_DEFAULTS.movement.mode).toBe('authoritative');
    expect(SYNC_TIER_DEFAULTS.movement.ownership).toBe('creator');
  });

  it('ai_agent tier uses CRDT mode with manual frequency', () => {
    expect(SYNC_TIER_DEFAULTS.ai_agent.mode).toBe('crdt');
    expect(SYNC_TIER_DEFAULTS.ai_agent.frequency).toBe('manual');
    expect(SYNC_TIER_DEFAULTS.ai_agent.interpolate).toBe(false);
  });

  it('cosmetic tier uses last-write-wins with anyone ownership', () => {
    expect(SYNC_TIER_DEFAULTS.cosmetic.mode).toBe('last-write-wins');
    expect(SYNC_TIER_DEFAULTS.cosmetic.ownership).toBe('anyone');
  });

  it('all 4 tiers are defined', () => {
    const tiers: SyncTier[] = ['physics', 'movement', 'ai_agent', 'cosmetic'];
    for (const tier of tiers) {
      expect(SYNC_TIER_DEFAULTS[tier]).toBeDefined();
    }
  });
});

// =============================================================================
// SYNC TIER DELIVERY & RATES
// =============================================================================

describe('SYNC_TIER_DELIVERY', () => {
  it('physics uses ordered delivery', () => {
    expect(SYNC_TIER_DELIVERY.physics).toBe('ordered');
  });

  it('ai_agent uses reliable delivery', () => {
    expect(SYNC_TIER_DELIVERY.ai_agent).toBe('reliable');
  });

  it('movement and cosmetic use unreliable delivery', () => {
    expect(SYNC_TIER_DELIVERY.movement).toBe('unreliable');
    expect(SYNC_TIER_DELIVERY.cosmetic).toBe('unreliable');
  });
});

describe('SYNC_TIER_RATES', () => {
  it('physics runs at 60Hz', () => {
    expect(SYNC_TIER_RATES.physics).toBe(60);
  });

  it('movement runs at 20Hz', () => {
    expect(SYNC_TIER_RATES.movement).toBe(20);
  });

  it('ai_agent runs at 5Hz', () => {
    expect(SYNC_TIER_RATES.ai_agent).toBe(5);
  });

  it('cosmetic runs at 1Hz', () => {
    expect(SYNC_TIER_RATES.cosmetic).toBe(1);
  });
});

// =============================================================================
// resolveSyncConfig()
// =============================================================================

describe('resolveSyncConfig', () => {
  it('resolves physics tier to authoritative defaults', () => {
    const resolved = resolveSyncConfig({ syncTier: 'physics' });
    expect(resolved.mode).toBe('authoritative');
    expect(resolved.frequency).toBe('tick');
    expect(resolved.interpolate).toBe(true);
  });

  it('resolves ai_agent tier to crdt mode', () => {
    const resolved = resolveSyncConfig({ syncTier: 'ai_agent' });
    expect(resolved.mode).toBe('crdt');
    expect(resolved.interpolate).toBe(false);
  });

  it('explicit config overrides tier defaults', () => {
    const resolved = resolveSyncConfig({
      syncTier: 'physics',
      mode: 'last-write-wins', // Override
    });
    expect(resolved.mode).toBe('last-write-wins');
    expect(resolved.frequency).toBe('tick'); // Still from tier
  });

  it('config without syncTier uses SYNC_DEFAULTS', () => {
    const resolved = resolveSyncConfig({});
    expect(resolved.mode).toBeDefined();
    expect(resolved.frequency).toBeDefined();
  });
});

// =============================================================================
// CRDT FUNCTIONS (P.NET.02)
// =============================================================================

describe('mergeLWW', () => {
  it('returns register with higher timestamp', () => {
    const a: ILWWRegister<string> = { value: 'old', timestamp: 100, peerId: 'p1' };
    const b: ILWWRegister<string> = { value: 'new', timestamp: 200, peerId: 'p2' };
    expect(mergeLWW(a, b)).toBe(b);
  });

  it('returns first register when timestamps are equal', () => {
    const a: ILWWRegister<number> = { value: 42, timestamp: 100, peerId: 'p1' };
    const b: ILWWRegister<number> = { value: 99, timestamp: 100, peerId: 'p2' };
    expect(mergeLWW(a, b)).toBe(a);
  });

  it('is commutative for different timestamps', () => {
    const a: ILWWRegister<string> = { value: 'a', timestamp: 100, peerId: 'p1' };
    const b: ILWWRegister<string> = { value: 'b', timestamp: 200, peerId: 'p2' };
    expect(mergeLWW(a, b).value).toBe(mergeLWW(b, a).value);
  });
});

describe('mergeGCounter', () => {
  it('takes max of each peer counter', () => {
    const a: IGCounter = { counts: { p1: 5, p2: 3 } };
    const b: IGCounter = { counts: { p1: 3, p2: 7 } };
    const merged = mergeGCounter(a, b);
    expect(merged.counts.p1).toBe(5);
    expect(merged.counts.p2).toBe(7);
  });

  it('includes peers only present in one counter', () => {
    const a: IGCounter = { counts: { p1: 5 } };
    const b: IGCounter = { counts: { p2: 3 } };
    const merged = mergeGCounter(a, b);
    expect(merged.counts.p1).toBe(5);
    expect(merged.counts.p2).toBe(3);
  });

  it('merge with empty counter is identity', () => {
    const a: IGCounter = { counts: { p1: 10 } };
    const b: IGCounter = { counts: {} };
    const merged = mergeGCounter(a, b);
    expect(merged.counts.p1).toBe(10);
  });

  it('is commutative', () => {
    const a: IGCounter = { counts: { p1: 5, p2: 3 } };
    const b: IGCounter = { counts: { p1: 7, p3: 1 } };
    const ab = mergeGCounter(a, b);
    const ba = mergeGCounter(b, a);
    expect(gcounterValue(ab)).toBe(gcounterValue(ba));
  });
});

describe('gcounterValue', () => {
  it('sums all peer counts', () => {
    expect(gcounterValue({ counts: { p1: 5, p2: 3, p3: 2 } })).toBe(10);
  });

  it('returns 0 for empty counter', () => {
    expect(gcounterValue({ counts: {} })).toBe(0);
  });
});

describe('incrementGCounter', () => {
  it('increments specified peer', () => {
    const counter = createGCounter();
    const updated = incrementGCounter(counter, 'p1', 5);
    expect(updated.counts.p1).toBe(5);
  });

  it('accumulates increments for same peer', () => {
    let counter = createGCounter();
    counter = incrementGCounter(counter, 'p1', 3);
    counter = incrementGCounter(counter, 'p1', 2);
    expect(counter.counts.p1).toBe(5);
  });

  it('defaults delta to 1', () => {
    const counter = createGCounter();
    const updated = incrementGCounter(counter, 'p1');
    expect(updated.counts.p1).toBe(1);
  });
});

describe('createLWWRegister', () => {
  it('creates register with correct value and peerId', () => {
    const reg = createLWWRegister('hello', 'peer-1');
    expect(reg.value).toBe('hello');
    expect(reg.peerId).toBe('peer-1');
    expect(reg.timestamp).toBeGreaterThan(0);
  });
});

describe('createGCounter', () => {
  it('creates empty counter', () => {
    const counter = createGCounter();
    expect(counter.counts).toEqual({});
    expect(gcounterValue(counter)).toBe(0);
  });
});

// =============================================================================
// SPATIAL HASH GRID (W.NET.02)
// =============================================================================

describe('SpatialHashGrid', () => {
  let grid: SpatialHashGrid;

  beforeEach(() => {
    grid = new SpatialHashGrid({ cellSize: 50 });
  });

  it('starts with 0 entities', () => {
    expect(grid.getEntityCount()).toBe(0);
  });

  it('tracks entity count after insertions', () => {
    grid.updateEntityPosition('e1', { x: 0, y: 0, z: 0 }, 'player');
    grid.updateEntityPosition('e2', { x: 100, y: 0, z: 0 }, 'agent');
    expect(grid.getEntityCount()).toBe(2);
  });

  it('removes an entity', () => {
    grid.updateEntityPosition('e1', { x: 0, y: 0, z: 0 }, 'player');
    grid.removeEntity('e1');
    expect(grid.getEntityCount()).toBe(0);
  });

  it('returns entities within peer AOI', () => {
    grid.updateEntityPosition('e1', { x: 10, y: 0, z: 0 }, 'player');
    grid.updateEntityPosition('e2', { x: 200, y: 0, z: 0 }, 'agent');
    grid.updatePeerPosition('peer1', { x: 0, y: 0, z: 0 }, 60);

    const inAOI = grid.getEntitiesInAOI('peer1');
    expect(inAOI).toContain('e1');
    // e2 at 200 should be outside 60-unit radius
  });

  it('returns peers interested in an entity', () => {
    grid.updateEntityPosition('e1', { x: 10, y: 0, z: 0 }, 'player');
    grid.updatePeerPosition('peer1', { x: 0, y: 0, z: 0 }, 60);

    const peers = grid.getPeersInterestedIn('e1');
    expect(peers).toContain('peer1');
  });

  it('removes peer observers', () => {
    grid.updateEntityPosition('e1', { x: 10, y: 0, z: 0 }, 'player');
    grid.updatePeerPosition('peer1', { x: 0, y: 0, z: 0 }, 60);
    grid.removePeer('peer1');

    const peers = grid.getPeersInterestedIn('e1');
    expect(peers).not.toContain('peer1');
  });

  it('gc cleans up empty cells', () => {
    grid.updateEntityPosition('e1', { x: 0, y: 0, z: 0 }, 'player');
    const cellsBefore = grid.getCellCount();
    grid.removeEntity('e1');
    grid.gc();
    expect(grid.getCellCount()).toBeLessThanOrEqual(cellsBefore);
  });

  it('handles entity position updates (moves between cells)', () => {
    grid.updateEntityPosition('e1', { x: 0, y: 0, z: 0 }, 'player');
    grid.updateEntityPosition('e1', { x: 200, y: 0, z: 0 }, 'player');
    grid.updatePeerPosition('peer1', { x: 200, y: 0, z: 0 }, 60);

    const inAOI = grid.getEntitiesInAOI('peer1');
    expect(inAOI).toContain('e1');
  });
});

// =============================================================================
// ENTITY BANDWIDTH PROFILES (W.NET.05)
// =============================================================================

describe('ENTITY_BANDWIDTH_PROFILES', () => {
  it('defines profiles for all 4 entity types', () => {
    const types: EntityType[] = ['player', 'agent', 'physics_object', 'cosmetic'];
    for (const type of types) {
      expect(ENTITY_BANDWIDTH_PROFILES[type]).toBeDefined();
      expect(ENTITY_BANDWIDTH_PROFILES[type].bytesPerUpdate).toBeGreaterThan(0);
    }
  });

  it('agent sends 150 bytes per update at 3Hz', () => {
    expect(ENTITY_BANDWIDTH_PROFILES.agent.bytesPerUpdate).toBe(150);
    expect(ENTITY_BANDWIDTH_PROFILES.agent.updatesPerSecond).toBe(3);
  });

  it('player sends 20 bytes per update at 20Hz', () => {
    expect(ENTITY_BANDWIDTH_PROFILES.player.bytesPerUpdate).toBe(20);
    expect(ENTITY_BANDWIDTH_PROFILES.player.updatesPerSecond).toBe(20);
  });

  it('cosmetic has lowest bandwidth at 8 bytes × 1Hz', () => {
    const bps =
      ENTITY_BANDWIDTH_PROFILES.cosmetic.bytesPerUpdate *
      ENTITY_BANDWIDTH_PROFILES.cosmetic.updatesPerSecond;
    expect(bps).toBe(8);
  });
});

// =============================================================================
// estimateAOIBandwidth()
// =============================================================================

describe('estimateAOIBandwidth', () => {
  it('estimates bandwidth for 100 players', () => {
    const types: EntityType[] = Array(100).fill('player');
    const result = estimateAOIBandwidth(types);
    // 100 players × 20 bytes × 20 Hz = 40,000 bytes/s
    expect(result.totalBytesPerSecond).toBe(40_000);
    expect(result.totalKbps).toBeCloseTo(320, 0); // 40000 * 8 / 1000
  });

  it('estimates bandwidth for mixed scenario (100 players + 100 agents)', () => {
    const types: EntityType[] = [...Array(100).fill('player'), ...Array(100).fill('agent')];
    const result = estimateAOIBandwidth(types);
    // Players: 100 × 20 × 20 = 40,000
    // Agents: 100 × 150 × 3 = 45,000
    expect(result.totalBytesPerSecond).toBe(85_000);
    expect(result.breakdown.player).toBe(40_000);
    expect(result.breakdown.agent).toBe(45_000);
  });

  it('returns zero for empty entity list', () => {
    const result = estimateAOIBandwidth([]);
    expect(result.totalBytesPerSecond).toBe(0);
    expect(result.totalKbps).toBe(0);
  });

  it('correctly breaks down by entity type', () => {
    const types: EntityType[] = ['player', 'agent', 'physics_object', 'cosmetic'];
    const result = estimateAOIBandwidth(types);
    expect(result.breakdown.player).toBeGreaterThan(0);
    expect(result.breakdown.agent).toBeGreaterThan(0);
    expect(result.breakdown.physics_object).toBeGreaterThan(0);
    expect(result.breakdown.cosmetic).toBeGreaterThan(0);
  });
});
