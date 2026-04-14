/**
 * CRDTRoomTraitHandler Tests
 *
 * Tests the handler that bridges @crdt-room trait config to CRDTRoom runtime.
 * Covers: construction, config conversion, interest regions, entity sync tiers,
 * entity overrides, factory function, and accessors.
 */

import { describe, it, expect } from 'vitest';
import { CRDTRoomTraitHandler, createCRDTRoomTraitHandler } from '../CRDTRoomTraitHandler';
import type { CRDTRoomConfigOutput } from '../CRDTRoomTraitHandler';
import {
  resolveCRDTRoomTraitConfig,
  parseCRDTRoomTraitConfig,
  validateCRDTRoomTraitConfig,
  CRDT_ROOM_TRAIT_DEFAULTS,
} from '../CRDTRoomTrait';
import type { CRDTRoomTraitConfig } from '../CRDTRoomTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolvedConfig(
  overrides: Partial<CRDTRoomTraitConfig> = {}
): Required<CRDTRoomTraitConfig> {
  const parsed = parseCRDTRoomTraitConfig({ ...overrides });
  validateCRDTRoomTraitConfig(parsed);
  return resolveCRDTRoomTraitConfig(parsed);
}

function makeHandler(overrides: Partial<CRDTRoomTraitConfig> = {}): CRDTRoomTraitHandler {
  return new CRDTRoomTraitHandler(makeResolvedConfig(overrides));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CRDTRoomTraitHandler', () => {
  describe('construction', () => {
    it('constructs with default resolved config', () => {
      const handler = makeHandler();
      expect(handler).toBeInstanceOf(CRDTRoomTraitHandler);
      expect(handler.getRoomName()).toBe('Untitled Room');
      expect(handler.getMaxPlayers()).toBe(50);
    });

    it('constructs with custom room name and max players', () => {
      const handler = makeHandler({ roomName: 'Battle Arena', maxPlayers: 32 });
      expect(handler.getRoomName()).toBe('Battle Arena');
      expect(handler.getMaxPlayers()).toBe(32);
    });
  });

  describe('toCRDTRoomConfig', () => {
    it('produces a valid CRDTRoomConfigOutput with roomId', () => {
      const handler = makeHandler({ roomName: 'Test Room', maxPlayers: 16 });
      const config: CRDTRoomConfigOutput = handler.toCRDTRoomConfig('room-123');

      expect(config.roomId).toBe('room-123');
      expect(config.roomName).toBe('Test Room');
      expect(config.maxPlayers).toBe(16);
      expect(config.baseSyncRateHz).toBe(20);
      expect(config.isPrivate).toBe(false);
      expect(config.password).toBeUndefined();
      expect(config.metadata).toBeDefined();
      expect(config.metadata!.traitSource).toBe('@crdt-room');
    });

    it('sets isPrivate and password for private rooms', () => {
      const handler = makeHandler({ privacy: 'private', password: 'secret123' });
      const config = handler.toCRDTRoomConfig('room-private');

      expect(config.isPrivate).toBe(true);
      expect(config.password).toBe('secret123');
    });

    it('does not include password for public rooms', () => {
      const handler = makeHandler({ privacy: 'public' });
      const config = handler.toCRDTRoomConfig('room-public');

      expect(config.isPrivate).toBe(false);
      expect(config.password).toBeUndefined();
    });
  });

  describe('toCRDTRoomManagerConfig', () => {
    it('returns default sharding config', () => {
      const handler = makeHandler();
      const managerConfig = handler.toCRDTRoomManagerConfig();

      expect(managerConfig.autoShard).toBe(true);
      expect(managerConfig.shardThreshold).toBe(500);
      expect(managerConfig.minEntitiesPerShard).toBe(50);
    });

    it('reflects custom sharding settings', () => {
      const handler = makeHandler({
        sharding: { enabled: false, entityThreshold: 1000, minEntitiesPerShard: 100 },
      });
      const managerConfig = handler.toCRDTRoomManagerConfig();

      expect(managerConfig.autoShard).toBe(false);
      expect(managerConfig.shardThreshold).toBe(1000);
      expect(managerConfig.minEntitiesPerShard).toBe(100);
    });
  });

  describe('toInterestRegions', () => {
    it('returns empty array when no regions are configured', () => {
      const handler = makeHandler();
      expect(handler.toInterestRegions()).toEqual([]);
    });

    it('converts interest region declarations with array centers', () => {
      const handler = makeHandler({
        interestRegions: [
          { id: 'spawn-a', center: [10, 0, 20], radius: 30, priority: 0, syncRateHz: 40 },
        ],
      });
      const regions = handler.toInterestRegions();

      expect(regions).toHaveLength(1);
      expect(regions[0].id).toBe('spawn-a');
      expect(regions[0].center).toEqual([10, 0, 20 ]);
      expect(regions[0].radius).toBe(30);
      expect(regions[0].priority).toBe(0);
      expect(regions[0].syncRateHz).toBe(40);
    });

    it('converts interest region declarations with object centers', () => {
      const handler = makeHandler({
        interestRegions: [
          { id: 'mid', center: [5, 1, -3 ], radius: 50, priority: 1, syncRateHz: 20 },
        ],
      });
      const regions = handler.toInterestRegions();

      expect(regions[0].center).toEqual([5, 1, -3 ]);
    });
  });

  describe('toOutput', () => {
    it('produces a complete CRDTRoomTraitOutput', () => {
      const handler = makeHandler({
        roomName: 'Arena',
        maxPlayers: 32,
        syncTiers: { players: 'critical', environment: 'low' },
        persistence: { enabled: true, autoSaveIntervalMs: 10_000 },
      });
      const output = handler.toOutput('arena-001');

      expect(output.roomConfig.roomId).toBe('arena-001');
      expect(output.roomConfig.roomName).toBe('Arena');
      expect(output.managerConfig.autoShard).toBe(true);
      expect(output.interestRegions).toEqual([]);
      expect(output.syncTierMap).toEqual({ players: 'critical', environment: 'low' });
      expect(output.persistence.enabled).toBe(true);
      expect(output.persistence.autoSaveIntervalMs).toBe(10_000);
    });
  });

  describe('entity sync tiers', () => {
    it('returns default tier "normal" for unknown entity types', () => {
      const handler = makeHandler();
      expect(handler.getEntitySyncTier('entity-1', 'unknown_type')).toBe('normal');
    });

    it('returns configured tier for known entity types', () => {
      const handler = makeHandler({
        syncTiers: { players: 'critical', projectiles: 'high', decorations: 'dormant' },
      });
      expect(handler.getEntitySyncTier('any-id', 'players')).toBe('critical');
      expect(handler.getEntitySyncTier('any-id', 'projectiles')).toBe('high');
      expect(handler.getEntitySyncTier('any-id', 'decorations')).toBe('dormant');
    });

    it('per-entity override takes priority over type-based tier', () => {
      const handler = makeHandler({
        syncTiers: { players: 'normal' },
      });

      handler.registerEntityOverride('player-vip', { syncTier: 'critical' });
      expect(handler.getEntitySyncTier('player-vip', 'players')).toBe('critical');
      // Non-overridden entity still uses type-based tier
      expect(handler.getEntitySyncTier('player-regular', 'players')).toBe('normal');
    });
  });

  describe('entity overrides', () => {
    it('starts with empty overrides', () => {
      const handler = makeHandler();
      expect(handler.getEntityOverrides().size).toBe(0);
    });

    it('registers and retrieves entity overrides', () => {
      const handler = makeHandler();
      handler.registerEntityOverride('e1', { syncTier: 'high' });
      handler.registerEntityOverride('e2', { syncTier: 'dormant', region: 'spawn-a' });

      const overrides = handler.getEntityOverrides();
      expect(overrides.size).toBe(2);
      expect(overrides.get('e1')!.syncTier).toBe('high');
      expect(overrides.get('e2')!.region).toBe('spawn-a');
    });

    it('returns a copy of overrides (not the internal map)', () => {
      const handler = makeHandler();
      handler.registerEntityOverride('e1', { syncTier: 'high' });

      const copy = handler.getEntityOverrides();
      copy.delete('e1');

      // Original should be unaffected
      expect(handler.getEntityOverrides().size).toBe(1);
    });
  });

  describe('applyInterestRegions', () => {
    it('calls addInterestRegion on the room for each region', () => {
      const handler = makeHandler({
        interestRegions: [
          { id: 'r1', center: [0, 0, 0], radius: 10, priority: 0, syncRateHz: 30 },
          { id: 'r2', center: [50, 0, 50], radius: 20, priority: 1, syncRateHz: 20 },
        ],
      });

      const addedRegions: any[] = [];
      const mockRoom = {
        addInterestRegion(region: any) {
          addedRegions.push(region);
        },
      };

      handler.applyInterestRegions(mockRoom);

      expect(addedRegions).toHaveLength(2);
      expect(addedRegions[0].id).toBe('r1');
      expect(addedRegions[1].id).toBe('r2');
    });
  });

  describe('accessors', () => {
    it('isPersistenceEnabled reflects config', () => {
      expect(makeHandler({ persistence: { enabled: true } }).isPersistenceEnabled()).toBe(true);
      expect(makeHandler({ persistence: { enabled: false } }).isPersistenceEnabled()).toBe(false);
    });

    it('isShardingEnabled reflects config', () => {
      expect(makeHandler({ sharding: { enabled: true } }).isShardingEnabled()).toBe(true);
      expect(makeHandler({ sharding: { enabled: false } }).isShardingEnabled()).toBe(false);
    });

    it('getSyncTierMap returns copy of tiers', () => {
      const handler = makeHandler({ syncTiers: { a: 'high', b: 'low' } });
      const map = handler.getSyncTierMap();

      expect(map).toEqual({ a: 'high', b: 'low' });

      // Mutating returned map should not affect handler
      map.a = 'dormant';
      expect(handler.getSyncTierMap().a).toBe('high');
    });

    it('getInterestRegionDecls returns copy of declarations', () => {
      const handler = makeHandler({
        interestRegions: [{ id: 'r1', center: [0, 0, 0], radius: 10, priority: 0, syncRateHz: 30 }],
      });
      const decls = handler.getInterestRegionDecls();
      expect(decls).toHaveLength(1);
      expect(decls[0].id).toBe('r1');
    });

    it('getConfig returns a copy of the resolved config', () => {
      const handler = makeHandler({ roomName: 'CopyTest' });
      const config = handler.getConfig();
      expect(config.roomName).toBe('CopyTest');
    });
  });

  describe('createCRDTRoomTraitHandler factory', () => {
    it('creates handler from raw config', () => {
      const handler = createCRDTRoomTraitHandler({
        roomName: 'Factory Room',
        maxPlayers: 8,
      });
      expect(handler).toBeInstanceOf(CRDTRoomTraitHandler);
      expect(handler.getRoomName()).toBe('Factory Room');
      expect(handler.getMaxPlayers()).toBe(8);
    });

    it('throws on invalid raw config', () => {
      expect(() => createCRDTRoomTraitHandler({ maxPlayers: -5 })).toThrow();
    });

    it('applies defaults for missing fields', () => {
      const handler = createCRDTRoomTraitHandler({});
      expect(handler.getRoomName()).toBe('Untitled Room');
      expect(handler.getMaxPlayers()).toBe(50);
    });
  });
});
