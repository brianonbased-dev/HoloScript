/**
 * CRDTRoomTrait Tests
 *
 * Tests for @crdt-room trait parsing, validation, resolution, and handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  parseCRDTRoomTraitConfig,
  parseCRDTRoomEntityConfig,
  validateCRDTRoomTraitConfig,
  resolveCRDTRoomTraitConfig,
  createCRDTRoomTraitConfig,
  normalizeCenter,
  CRDTRoomTraitValidationError,
  CRDT_ROOM_TRAIT_DEFAULTS,
} from './CRDTRoomTrait';
import type { CRDTRoomTraitConfig } from './CRDTRoomTrait';

import { CRDTRoomTraitHandler, createCRDTRoomTraitHandler } from './CRDTRoomTraitHandler';

// =============================================================================
// parseCRDTRoomTraitConfig
// =============================================================================

describe('parseCRDTRoomTraitConfig', () => {
  it('should parse empty config', () => {
    const config = parseCRDTRoomTraitConfig({});
    expect(config).toBeDefined();
    // All fields should be undefined (not yet resolved with defaults)
    expect(config.roomName).toBeUndefined();
    expect(config.maxPlayers).toBeUndefined();
  });

  it('should parse basic fields', () => {
    const config = parseCRDTRoomTraitConfig({
      roomName: 'Battle Arena',
      maxPlayers: 32,
      baseSyncRateHz: 30,
      viewDistance: 200,
    });

    expect(config.roomName).toBe('Battle Arena');
    expect(config.maxPlayers).toBe(32);
    expect(config.baseSyncRateHz).toBe(30);
    expect(config.viewDistance).toBe(200);
  });

  it('should parse privacy settings', () => {
    const config = parseCRDTRoomTraitConfig({
      privacy: 'private',
      password: 'secret123',
    });

    expect(config.privacy).toBe('private');
    expect(config.password).toBe('secret123');
  });

  it('should parse sync tiers', () => {
    const config = parseCRDTRoomTraitConfig({
      syncTiers: {
        players: 'critical',
        projectiles: 'high',
        environment: 'low',
        decorations: 'dormant',
      },
    });

    expect(config.syncTiers).toBeDefined();
    expect(config.syncTiers!.players).toBe('critical');
    expect(config.syncTiers!.projectiles).toBe('high');
    expect(config.syncTiers!.environment).toBe('low');
    expect(config.syncTiers!.decorations).toBe('dormant');
  });

  it('should parse interest regions with tuple centers', () => {
    const config = parseCRDTRoomTraitConfig({
      interestRegions: [
        { id: 'spawn-a', center: [0, 0, 50], radius: 30, priority: 0, syncRateHz: 40 },
        { id: 'mid-field', center: [0, 0, 0], radius: 60, priority: 2, syncRateHz: 20 },
      ],
    });

    expect(config.interestRegions).toHaveLength(2);
    expect(config.interestRegions![0].id).toBe('spawn-a');
    expect(config.interestRegions![0].center).toEqual([0, 0, 50]);
    expect(config.interestRegions![0].radius).toBe(30);
    expect(config.interestRegions![0].priority).toBe(0);
    expect(config.interestRegions![0].syncRateHz).toBe(40);
  });

  it('should parse sharding config', () => {
    const config = parseCRDTRoomTraitConfig({
      sharding: {
        enabled: true,
        entityThreshold: 1000,
        minEntitiesPerShard: 100,
      },
    });

    expect(config.sharding).toBeDefined();
    expect(config.sharding!.enabled).toBe(true);
    expect(config.sharding!.entityThreshold).toBe(1000);
    expect(config.sharding!.minEntitiesPerShard).toBe(100);
  });

  it('should parse persistence config', () => {
    const config = parseCRDTRoomTraitConfig({
      persistence: {
        enabled: true,
        autoSaveIntervalMs: 60000,
      },
    });

    expect(config.persistence).toBeDefined();
    expect(config.persistence!.enabled).toBe(true);
    expect(config.persistence!.autoSaveIntervalMs).toBe(60000);
  });

  it('should parse metadata', () => {
    const config = parseCRDTRoomTraitConfig({
      metadata: { gameMode: 'capture-the-flag', difficulty: 'hard' },
    });

    expect(config.metadata).toBeDefined();
    expect(config.metadata!.gameMode).toBe('capture-the-flag');
    expect(config.metadata!.difficulty).toBe('hard');
  });

  it('should coerce numeric string values', () => {
    const config = parseCRDTRoomTraitConfig({
      maxPlayers: '16' as unknown,
      viewDistance: '250' as unknown,
    });

    expect(config.maxPlayers).toBe(16);
    expect(config.viewDistance).toBe(250);
  });
});

// =============================================================================
// parseCRDTRoomEntityConfig
// =============================================================================

describe('parseCRDTRoomEntityConfig', () => {
  it('should parse entity sync tier', () => {
    const decl = parseCRDTRoomEntityConfig({ syncTier: 'critical' });
    expect(decl.syncTier).toBe('critical');
    expect(decl.region).toBeUndefined();
  });

  it('should parse entity with region assignment', () => {
    const decl = parseCRDTRoomEntityConfig({
      syncTier: 'high',
      region: 'spawn-a',
    });
    expect(decl.syncTier).toBe('high');
    expect(decl.region).toBe('spawn-a');
  });

  it('should default to normal sync tier', () => {
    const decl = parseCRDTRoomEntityConfig({});
    expect(decl.syncTier).toBe('normal');
  });
});

// =============================================================================
// normalizeCenter
// =============================================================================

describe('normalizeCenter', () => {
  it('should convert tuple to object', () => {
    const result = normalizeCenter([10, 20, 30]);
    expect(result).toEqual([10, 20, 30 ]);
  });

  it('should pass through object format', () => {
    const result = normalizeCenter([5, 10, 15 ]);
    expect(result).toEqual([5, 10, 15 ]);
  });
});

// =============================================================================
// validateCRDTRoomTraitConfig
// =============================================================================

describe('validateCRDTRoomTraitConfig', () => {
  it('should accept valid config', () => {
    expect(() =>
      validateCRDTRoomTraitConfig({
        roomName: 'Test Room',
        maxPlayers: 32,
        baseSyncRateHz: 20,
        viewDistance: 100,
      })
    ).not.toThrow();
  });

  it('should accept empty config', () => {
    expect(() => validateCRDTRoomTraitConfig({})).not.toThrow();
  });

  it('should reject maxPlayers < 1', () => {
    expect(() => validateCRDTRoomTraitConfig({ maxPlayers: 0 })).toThrow(
      CRDTRoomTraitValidationError
    );
  });

  it('should reject maxPlayers > 10000', () => {
    expect(() => validateCRDTRoomTraitConfig({ maxPlayers: 20000 })).toThrow(
      CRDTRoomTraitValidationError
    );
  });

  it('should reject baseSyncRateHz > 120', () => {
    expect(() => validateCRDTRoomTraitConfig({ baseSyncRateHz: 200 })).toThrow(
      CRDTRoomTraitValidationError
    );
  });

  it('should reject negative viewDistance', () => {
    expect(() => validateCRDTRoomTraitConfig({ viewDistance: -10 })).toThrow(
      CRDTRoomTraitValidationError
    );
  });

  it('should reject private without password', () => {
    expect(() => validateCRDTRoomTraitConfig({ privacy: 'private' })).toThrow(
      CRDTRoomTraitValidationError
    );
  });

  it('should accept private with password', () => {
    expect(() =>
      validateCRDTRoomTraitConfig({ privacy: 'private', password: 'test' })
    ).not.toThrow();
  });

  it('should reject invalid sync tier', () => {
    expect(() =>
      validateCRDTRoomTraitConfig({
        syncTiers: { player: 'ultra' as any },
      })
    ).toThrow(CRDTRoomTraitValidationError);
  });

  it('should reject duplicate region IDs', () => {
    expect(() =>
      validateCRDTRoomTraitConfig({
        interestRegions: [
          { id: 'spawn', center: [0, 0, 0], radius: 10, priority: 0, syncRateHz: 20 },
          { id: 'spawn', center: [10, 0, 0], radius: 10, priority: 1, syncRateHz: 20 },
        ],
      })
    ).toThrow(CRDTRoomTraitValidationError);
  });

  it('should reject region with zero radius', () => {
    expect(() =>
      validateCRDTRoomTraitConfig({
        interestRegions: [
          { id: 'invalid', center: [0, 0, 0], radius: 0, priority: 0, syncRateHz: 20 },
        ],
      })
    ).toThrow(CRDTRoomTraitValidationError);
  });

  it('should reject region with invalid priority', () => {
    expect(() =>
      validateCRDTRoomTraitConfig({
        interestRegions: [
          { id: 'zone', center: [0, 0, 0], radius: 10, priority: 5, syncRateHz: 20 },
        ],
      })
    ).toThrow(CRDTRoomTraitValidationError);
  });

  it('should reject presenceTimeoutMs less than 2x heartbeat', () => {
    expect(() =>
      validateCRDTRoomTraitConfig({
        heartbeatIntervalMs: 5000,
        presenceTimeoutMs: 6000,
      })
    ).toThrow(CRDTRoomTraitValidationError);
  });

  it('should reject shardThreshold < 10', () => {
    expect(() =>
      validateCRDTRoomTraitConfig({
        sharding: { enabled: true, entityThreshold: 5 },
      })
    ).toThrow(CRDTRoomTraitValidationError);
  });
});

// =============================================================================
// resolveCRDTRoomTraitConfig
// =============================================================================

describe('resolveCRDTRoomTraitConfig', () => {
  it('should apply all defaults to empty config', () => {
    const resolved = resolveCRDTRoomTraitConfig({});

    expect(resolved.roomName).toBe(CRDT_ROOM_TRAIT_DEFAULTS.roomName);
    expect(resolved.maxPlayers).toBe(CRDT_ROOM_TRAIT_DEFAULTS.maxPlayers);
    expect(resolved.baseSyncRateHz).toBe(CRDT_ROOM_TRAIT_DEFAULTS.baseSyncRateHz);
    expect(resolved.viewDistance).toBe(CRDT_ROOM_TRAIT_DEFAULTS.viewDistance);
    expect(resolved.interestManagement).toBe(CRDT_ROOM_TRAIT_DEFAULTS.interestManagement);
    expect(resolved.privacy).toBe(CRDT_ROOM_TRAIT_DEFAULTS.privacy);
    expect(resolved.heartbeatIntervalMs).toBe(CRDT_ROOM_TRAIT_DEFAULTS.heartbeatIntervalMs);
  });

  it('should preserve user-specified values', () => {
    const resolved = resolveCRDTRoomTraitConfig({
      roomName: 'Custom Room',
      maxPlayers: 16,
      baseSyncRateHz: 60,
    });

    expect(resolved.roomName).toBe('Custom Room');
    expect(resolved.maxPlayers).toBe(16);
    expect(resolved.baseSyncRateHz).toBe(60);
    // Defaults still applied for unspecified fields
    expect(resolved.viewDistance).toBe(CRDT_ROOM_TRAIT_DEFAULTS.viewDistance);
  });
});

// =============================================================================
// createCRDTRoomTraitConfig (end-to-end factory)
// =============================================================================

describe('createCRDTRoomTraitConfig', () => {
  it('should parse, validate, and resolve in one call', () => {
    const config = createCRDTRoomTraitConfig({
      roomName: 'Arena',
      maxPlayers: 32,
      syncTiers: { player: 'critical', npc: 'high' },
      interestRegions: [
        { id: 'center', center: [0, 0, 0], radius: 50, priority: 0, syncRateHz: 30 },
      ],
    });

    expect(config.roomName).toBe('Arena');
    expect(config.maxPlayers).toBe(32);
    expect(config.syncTiers.player).toBe('critical');
    expect(config.interestRegions).toHaveLength(1);
    // Defaults applied
    expect(config.baseSyncRateHz).toBe(20);
    expect(config.viewDistance).toBe(100);
  });

  it('should throw on invalid config', () => {
    expect(() => createCRDTRoomTraitConfig({ maxPlayers: -5 })).toThrow(
      CRDTRoomTraitValidationError
    );
  });
});

// =============================================================================
// CRDTRoomTraitHandler
// =============================================================================

describe('CRDTRoomTraitHandler', () => {
  let handler: CRDTRoomTraitHandler;

  beforeEach(() => {
    const config = createCRDTRoomTraitConfig({
      roomName: 'Test Arena',
      maxPlayers: 32,
      baseSyncRateHz: 20,
      viewDistance: 150,
      syncTiers: {
        player: 'critical',
        projectile: 'high',
        npc: 'normal',
        tree: 'low',
        particle: 'dormant',
      },
      interestRegions: [
        { id: 'spawn-a', center: [0, 0, 50], radius: 30, priority: 0, syncRateHz: 40 },
        { id: 'mid', center: [0, 0, 0], radius: 60, priority: 2, syncRateHz: 20 },
      ],
      sharding: {
        enabled: true,
        entityThreshold: 1000,
        minEntitiesPerShard: 100,
      },
      persistence: {
        enabled: true,
        autoSaveIntervalMs: 60000,
      },
    });

    handler = new CRDTRoomTraitHandler(config);
  });

  describe('toCRDTRoomConfig', () => {
    it('should generate valid CRDTRoomConfig', () => {
      const roomConfig = handler.toCRDTRoomConfig('arena-001');

      expect(roomConfig.roomId).toBe('arena-001');
      expect(roomConfig.roomName).toBe('Test Arena');
      expect(roomConfig.maxPlayers).toBe(32);
      expect(roomConfig.baseSyncRateHz).toBe(20);
      expect(roomConfig.viewDistance).toBe(150);
      expect(roomConfig.interestManagement).toBe(true);
      expect(roomConfig.entityThreshold).toBe(1000);
      expect(roomConfig.isPrivate).toBe(false);
    });

    it('should set isPrivate from privacy field', () => {
      const privateConfig = createCRDTRoomTraitConfig({
        privacy: 'private',
        password: 'secret',
      });
      const privateHandler = new CRDTRoomTraitHandler(privateConfig);
      const roomConfig = privateHandler.toCRDTRoomConfig('private-room');

      expect(roomConfig.isPrivate).toBe(true);
      expect(roomConfig.password).toBe('secret');
    });

    it('should include sync tiers in metadata', () => {
      const roomConfig = handler.toCRDTRoomConfig('arena-001');

      expect(roomConfig.metadata).toBeDefined();
      expect(roomConfig.metadata!.traitSource).toBe('@crdt-room');
      expect(roomConfig.metadata!.syncTiers).toBeDefined();
    });
  });

  describe('toCRDTRoomManagerConfig', () => {
    it('should generate valid manager config', () => {
      const managerConfig = handler.toCRDTRoomManagerConfig();

      expect(managerConfig.autoShard).toBe(true);
      expect(managerConfig.shardThreshold).toBe(1000);
      expect(managerConfig.minEntitiesPerShard).toBe(100);
    });
  });

  describe('toInterestRegions', () => {
    it('should convert interest regions with normalized centers', () => {
      const regions = handler.toInterestRegions();

      expect(regions).toHaveLength(2);

      expect(regions[0].id).toBe('spawn-a');
      expect(regions[0].center).toEqual([0, 0, 50 ]);
      expect(regions[0].radius).toBe(30);
      expect(regions[0].priority).toBe(0);
      expect(regions[0].syncRateHz).toBe(40);

      expect(regions[1].id).toBe('mid');
      expect(regions[1].center).toEqual([0, 0, 0 ]);
    });
  });

  describe('toOutput', () => {
    it('should return complete output', () => {
      const output = handler.toOutput('arena-001');

      expect(output.roomConfig).toBeDefined();
      expect(output.roomConfig.roomId).toBe('arena-001');

      expect(output.managerConfig).toBeDefined();
      expect(output.managerConfig.autoShard).toBe(true);

      expect(output.interestRegions).toHaveLength(2);

      expect(output.syncTierMap).toBeDefined();
      expect(output.syncTierMap.player).toBe('critical');

      expect(output.persistence.enabled).toBe(true);
      expect(output.persistence.autoSaveIntervalMs).toBe(60000);
    });
  });

  describe('getEntitySyncTier', () => {
    it('should return type-based tier', () => {
      expect(handler.getEntitySyncTier('entity-1', 'player')).toBe('critical');
      expect(handler.getEntitySyncTier('entity-2', 'projectile')).toBe('high');
      expect(handler.getEntitySyncTier('entity-3', 'npc')).toBe('normal');
      expect(handler.getEntitySyncTier('entity-4', 'tree')).toBe('low');
      expect(handler.getEntitySyncTier('entity-5', 'particle')).toBe('dormant');
    });

    it('should return "normal" for unknown entity types', () => {
      expect(handler.getEntitySyncTier('entity-x', 'unknown_type')).toBe('normal');
    });

    it('should prefer per-entity override over type-based tier', () => {
      handler.registerEntityOverride('special-tree', { syncTier: 'critical' });
      // Even though type "tree" maps to "low", the override wins
      expect(handler.getEntitySyncTier('special-tree', 'tree')).toBe('critical');
    });
  });

  describe('registerEntityOverride', () => {
    it('should store and retrieve entity overrides', () => {
      handler.registerEntityOverride('boss-npc', {
        syncTier: 'critical',
        region: 'spawn-a',
      });

      const overrides = handler.getEntityOverrides();
      expect(overrides.has('boss-npc')).toBe(true);
      expect(overrides.get('boss-npc')!.syncTier).toBe('critical');
      expect(overrides.get('boss-npc')!.region).toBe('spawn-a');
    });
  });

  describe('applyInterestRegions', () => {
    it('should call addInterestRegion for each declared region', () => {
      const added: Array<{ id: string; center: any; radius: number }> = [];
      const mockRoom = {
        addInterestRegion(region: any) {
          added.push(region);
        },
      };

      handler.applyInterestRegions(mockRoom);

      expect(added).toHaveLength(2);
      expect(added[0].id).toBe('spawn-a');
      expect(added[1].id).toBe('mid');
    });
  });

  describe('accessors', () => {
    it('should return config', () => {
      expect(handler.getConfig().roomName).toBe('Test Arena');
    });

    it('should check persistence status', () => {
      expect(handler.isPersistenceEnabled()).toBe(true);
    });

    it('should check sharding status', () => {
      expect(handler.isShardingEnabled()).toBe(true);
    });

    it('should return room name', () => {
      expect(handler.getRoomName()).toBe('Test Arena');
    });

    it('should return max players', () => {
      expect(handler.getMaxPlayers()).toBe(32);
    });

    it('should return sync tier map', () => {
      const tiers = handler.getSyncTierMap();
      expect(tiers.player).toBe('critical');
      expect(Object.keys(tiers)).toHaveLength(5);
    });

    it('should return interest region declarations', () => {
      const regions = handler.getInterestRegionDecls();
      expect(regions).toHaveLength(2);
    });
  });
});

// =============================================================================
// createCRDTRoomTraitHandler (factory)
// =============================================================================

describe('createCRDTRoomTraitHandler', () => {
  it('should create handler from raw config', () => {
    const handler = createCRDTRoomTraitHandler({
      roomName: 'Factory Test',
      maxPlayers: 8,
    });

    expect(handler).toBeInstanceOf(CRDTRoomTraitHandler);
    expect(handler.getRoomName()).toBe('Factory Test');
    expect(handler.getMaxPlayers()).toBe(8);
  });

  it('should throw on invalid raw config', () => {
    expect(() => createCRDTRoomTraitHandler({ maxPlayers: -1 })).toThrow();
  });
});

// =============================================================================
// Integration: Full trait pipeline
// =============================================================================

describe('CRDTRoomTrait integration', () => {
  it('should handle a complete .hsplus-like trait config end-to-end', () => {
    // Simulate what a .hsplus parser would produce
    const rawTraitProps = {
      roomName: 'Battle Arena Alpha',
      maxPlayers: 32,
      baseSyncRateHz: 20,
      interestManagement: true,
      viewDistance: 150,
      syncTiers: {
        players: 'critical',
        projectiles: 'high',
        environment: 'low',
        decorations: 'dormant',
      },
      interestRegions: [
        { id: 'spawn-a', center: [0, 0, 50], radius: 30, priority: 0, syncRateHz: 40 },
        { id: 'spawn-b', center: [0, 0, -50], radius: 30, priority: 0, syncRateHz: 40 },
        { id: 'mid-field', center: [0, 0, 0], radius: 60, priority: 1, syncRateHz: 20 },
      ],
      sharding: {
        enabled: true,
        entityThreshold: 500,
        minEntitiesPerShard: 50,
      },
      persistence: {
        enabled: true,
        autoSaveIntervalMs: 30000,
      },
      privacy: 'public',
      heartbeatIntervalMs: 5000,
      presenceTimeoutMs: 15000,
      maxChatHistory: 200,
    };

    // Step 1: Parse
    const parsed = parseCRDTRoomTraitConfig(rawTraitProps);
    expect(parsed.roomName).toBe('Battle Arena Alpha');

    // Step 2: Validate
    expect(() => validateCRDTRoomTraitConfig(parsed)).not.toThrow();

    // Step 3: Resolve
    const resolved = resolveCRDTRoomTraitConfig(parsed);
    expect(resolved.roomName).toBe('Battle Arena Alpha');
    expect(resolved.maxPlayers).toBe(32);

    // Step 4: Create handler
    const handler = new CRDTRoomTraitHandler(resolved);

    // Step 5: Generate output
    const output = handler.toOutput('battle-arena-001');

    // Verify room config
    expect(output.roomConfig.roomId).toBe('battle-arena-001');
    expect(output.roomConfig.roomName).toBe('Battle Arena Alpha');
    expect(output.roomConfig.maxPlayers).toBe(32);
    expect(output.roomConfig.baseSyncRateHz).toBe(20);
    expect(output.roomConfig.viewDistance).toBe(150);
    expect(output.roomConfig.isPrivate).toBe(false);

    // Verify manager config
    expect(output.managerConfig.autoShard).toBe(true);
    expect(output.managerConfig.shardThreshold).toBe(500);

    // Verify interest regions
    expect(output.interestRegions).toHaveLength(3);
    expect(output.interestRegions[0].center).toEqual([0, 0, 50 ]);
    expect(output.interestRegions[2].id).toBe('mid-field');

    // Verify sync tiers
    expect(output.syncTierMap.players).toBe('critical');
    expect(output.syncTierMap.projectiles).toBe('high');
    expect(output.syncTierMap.decorations).toBe('dormant');

    // Verify persistence
    expect(output.persistence.enabled).toBe(true);
    expect(output.persistence.autoSaveIntervalMs).toBe(30000);
  });

  it('should handle minimal config with all defaults', () => {
    const handler = createCRDTRoomTraitHandler({});
    const output = handler.toOutput('default-room');

    expect(output.roomConfig.roomName).toBe('Untitled Room');
    expect(output.roomConfig.maxPlayers).toBe(50);
    expect(output.roomConfig.baseSyncRateHz).toBe(20);
    expect(output.interestRegions).toHaveLength(0);
    expect(Object.keys(output.syncTierMap)).toHaveLength(0);
    expect(output.persistence.enabled).toBe(false);
  });
});
