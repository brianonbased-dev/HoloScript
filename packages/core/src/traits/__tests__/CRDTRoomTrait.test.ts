/**
 * CRDTRoomTrait Tests
 *
 * Tests for CRDT-backed multiplayer room configuration parsing,
 * validation, normalization, and resolution from .hsplus scene files.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCRDTRoomTraitConfig,
  parseCRDTRoomTraitConfig,
  resolveCRDTRoomTraitConfig,
  createCRDTRoomTraitConfig,
  normalizeCenter,
  parseCRDTRoomEntityConfig,
  CRDT_ROOM_TRAIT_DEFAULTS,
  CRDTRoomTraitValidationError,
} from '../CRDTRoomTrait';
import type { CRDTRoomTraitConfig } from '../CRDTRoomTrait';

describe('CRDTRoomTrait', () => {
  // =========================================================================
  // Defaults
  // =========================================================================
  describe('defaults', () => {
    it('provides sensible defaults for all fields', () => {
      expect(CRDT_ROOM_TRAIT_DEFAULTS.roomName).toBe('Untitled Room');
      expect(CRDT_ROOM_TRAIT_DEFAULTS.maxPlayers).toBe(50);
      expect(CRDT_ROOM_TRAIT_DEFAULTS.baseSyncRateHz).toBe(20);
      expect(CRDT_ROOM_TRAIT_DEFAULTS.interestManagement).toBe(true);
      expect(CRDT_ROOM_TRAIT_DEFAULTS.viewDistance).toBe(100);
      expect(CRDT_ROOM_TRAIT_DEFAULTS.privacy).toBe('public');
      expect(CRDT_ROOM_TRAIT_DEFAULTS.heartbeatIntervalMs).toBe(5_000);
      expect(CRDT_ROOM_TRAIT_DEFAULTS.presenceTimeoutMs).toBe(15_000);
      expect(CRDT_ROOM_TRAIT_DEFAULTS.maxChatHistory).toBe(200);
    });

    it('default sharding is enabled with threshold 500', () => {
      expect(CRDT_ROOM_TRAIT_DEFAULTS.sharding.enabled).toBe(true);
      expect(CRDT_ROOM_TRAIT_DEFAULTS.sharding.entityThreshold).toBe(500);
      expect(CRDT_ROOM_TRAIT_DEFAULTS.sharding.minEntitiesPerShard).toBe(50);
    });

    it('default persistence is disabled', () => {
      expect(CRDT_ROOM_TRAIT_DEFAULTS.persistence.enabled).toBe(false);
    });
  });

  // =========================================================================
  // normalizeCenter
  // =========================================================================
  describe('normalizeCenter', () => {
    it('converts tuple [x, y, z] to {x, y, z} object', () => {
      const result = normalizeCenter([10, 20, 30]);
      expect(result).toEqual({ x: 10, y: 20, z: 30 });
    });

    it('passes through {x, y, z} object unchanged', () => {
      const input = { x: 5, y: 15, z: 25 };
      const result = normalizeCenter(input);
      expect(result).toEqual(input);
    });
  });

  // =========================================================================
  // parseCRDTRoomTraitConfig
  // =========================================================================
  describe('parseCRDTRoomTraitConfig', () => {
    it('parses simple string/number/boolean fields', () => {
      const config = parseCRDTRoomTraitConfig({
        roomName: 'Battle Arena',
        maxPlayers: 32,
        baseSyncRateHz: 40,
        interestManagement: true,
        viewDistance: 150,
      });
      expect(config.roomName).toBe('Battle Arena');
      expect(config.maxPlayers).toBe(32);
      expect(config.baseSyncRateHz).toBe(40);
      expect(config.interestManagement).toBe(true);
      expect(config.viewDistance).toBe(150);
    });

    it('parses privacy field', () => {
      expect(parseCRDTRoomTraitConfig({ privacy: 'private', password: 'secret' }).privacy).toBe(
        'private'
      );
      expect(parseCRDTRoomTraitConfig({ privacy: 'public' }).privacy).toBe('public');
    });

    it('ignores invalid privacy values', () => {
      const config = parseCRDTRoomTraitConfig({ privacy: 'invalid' });
      expect(config.privacy).toBeUndefined();
    });

    it('parses syncTiers object', () => {
      const config = parseCRDTRoomTraitConfig({
        syncTiers: { players: 'critical', projectiles: 'high', decorations: 'dormant' },
      });
      expect(config.syncTiers).toEqual({
        players: 'critical',
        projectiles: 'high',
        decorations: 'dormant',
      });
    });

    it('parses interestRegions array', () => {
      const config = parseCRDTRoomTraitConfig({
        interestRegions: [
          { id: 'spawn-a', center: [0, 0, 50], radius: 30, priority: 0, syncRateHz: 40 },
        ],
      });
      expect(config.interestRegions).toHaveLength(1);
      expect(config.interestRegions![0].id).toBe('spawn-a');
      expect(config.interestRegions![0].radius).toBe(30);
    });

    it('parses sharding configuration', () => {
      const config = parseCRDTRoomTraitConfig({
        sharding: { enabled: true, entityThreshold: 200, minEntitiesPerShard: 25 },
      });
      expect(config.sharding!.enabled).toBe(true);
      expect(config.sharding!.entityThreshold).toBe(200);
    });

    it('parses persistence configuration', () => {
      const config = parseCRDTRoomTraitConfig({
        persistence: { enabled: true, autoSaveIntervalMs: 60000 },
      });
      expect(config.persistence!.enabled).toBe(true);
      expect(config.persistence!.autoSaveIntervalMs).toBe(60000);
    });

    it('returns empty config for empty input', () => {
      const config = parseCRDTRoomTraitConfig({});
      expect(config.roomName).toBeUndefined();
      expect(config.maxPlayers).toBeUndefined();
    });
  });

  // =========================================================================
  // parseCRDTRoomEntityConfig
  // =========================================================================
  describe('parseCRDTRoomEntityConfig', () => {
    it('parses syncTier from raw config', () => {
      const result = parseCRDTRoomEntityConfig({ syncTier: 'critical' });
      expect(result.syncTier).toBe('critical');
    });

    it('defaults syncTier to normal', () => {
      const result = parseCRDTRoomEntityConfig({});
      expect(result.syncTier).toBe('normal');
    });

    it('parses optional region', () => {
      const result = parseCRDTRoomEntityConfig({ syncTier: 'high', region: 'spawn-a' });
      expect(result.region).toBe('spawn-a');
    });

    it('region is undefined when not provided', () => {
      const result = parseCRDTRoomEntityConfig({ syncTier: 'low' });
      expect(result.region).toBeUndefined();
    });
  });

  // =========================================================================
  // validateCRDTRoomTraitConfig
  // =========================================================================
  describe('validateCRDTRoomTraitConfig', () => {
    it('accepts valid config without throwing', () => {
      expect(() =>
        validateCRDTRoomTraitConfig({
          maxPlayers: 32,
          baseSyncRateHz: 20,
          viewDistance: 100,
          heartbeatIntervalMs: 5000,
          presenceTimeoutMs: 15000,
          maxChatHistory: 100,
        })
      ).not.toThrow();
    });

    it('rejects maxPlayers out of range', () => {
      expect(() => validateCRDTRoomTraitConfig({ maxPlayers: 0 })).toThrow(
        CRDTRoomTraitValidationError
      );
      expect(() => validateCRDTRoomTraitConfig({ maxPlayers: 10001 })).toThrow(
        CRDTRoomTraitValidationError
      );
      expect(() => validateCRDTRoomTraitConfig({ maxPlayers: 1.5 })).toThrow(
        CRDTRoomTraitValidationError
      );
    });

    it('rejects baseSyncRateHz out of range', () => {
      expect(() => validateCRDTRoomTraitConfig({ baseSyncRateHz: 0 })).toThrow(
        CRDTRoomTraitValidationError
      );
      expect(() => validateCRDTRoomTraitConfig({ baseSyncRateHz: 121 })).toThrow(
        CRDTRoomTraitValidationError
      );
    });

    it('rejects negative viewDistance', () => {
      expect(() => validateCRDTRoomTraitConfig({ viewDistance: -10 })).toThrow(
        CRDTRoomTraitValidationError
      );
      expect(() => validateCRDTRoomTraitConfig({ viewDistance: 0 })).toThrow(
        CRDTRoomTraitValidationError
      );
    });

    it('rejects heartbeatIntervalMs out of range', () => {
      expect(() => validateCRDTRoomTraitConfig({ heartbeatIntervalMs: 100 })).toThrow(
        CRDTRoomTraitValidationError
      );
      expect(() => validateCRDTRoomTraitConfig({ heartbeatIntervalMs: 70000 })).toThrow(
        CRDTRoomTraitValidationError
      );
    });

    it('rejects presenceTimeoutMs less than 1000', () => {
      expect(() => validateCRDTRoomTraitConfig({ presenceTimeoutMs: 500 })).toThrow(
        CRDTRoomTraitValidationError
      );
    });

    it('rejects presenceTimeoutMs less than 2x heartbeat', () => {
      expect(() =>
        validateCRDTRoomTraitConfig({ heartbeatIntervalMs: 5000, presenceTimeoutMs: 7000 })
      ).toThrow(CRDTRoomTraitValidationError);
    });

    it('rejects negative maxChatHistory', () => {
      expect(() => validateCRDTRoomTraitConfig({ maxChatHistory: -1 })).toThrow(
        CRDTRoomTraitValidationError
      );
    });

    it('rejects private without password', () => {
      expect(() => validateCRDTRoomTraitConfig({ privacy: 'private' })).toThrow(
        CRDTRoomTraitValidationError
      );
    });

    it('accepts private with password', () => {
      expect(() =>
        validateCRDTRoomTraitConfig({ privacy: 'private', password: 'secret123' })
      ).not.toThrow();
    });

    it('rejects invalid sync tier', () => {
      expect(() =>
        validateCRDTRoomTraitConfig({ syncTiers: { players: 'invalid' as any } })
      ).toThrow(CRDTRoomTraitValidationError);
    });

    it('accepts valid sync tiers', () => {
      expect(() =>
        validateCRDTRoomTraitConfig({
          syncTiers: { players: 'critical', trees: 'dormant' },
        })
      ).not.toThrow();
    });

    it('rejects duplicate interest region IDs', () => {
      expect(() =>
        validateCRDTRoomTraitConfig({
          interestRegions: [
            { id: 'spawn', center: [0, 0, 0], radius: 10, priority: 0, syncRateHz: 20 },
            { id: 'spawn', center: [1, 1, 1], radius: 10, priority: 0, syncRateHz: 20 },
          ],
        })
      ).toThrow(CRDTRoomTraitValidationError);
    });

    it('rejects interest region with non-positive radius', () => {
      expect(() =>
        validateCRDTRoomTraitConfig({
          interestRegions: [
            { id: 'r1', center: [0, 0, 0], radius: 0, priority: 0, syncRateHz: 20 },
          ],
        })
      ).toThrow(CRDTRoomTraitValidationError);
    });

    it('rejects interest region priority out of range', () => {
      expect(() =>
        validateCRDTRoomTraitConfig({
          interestRegions: [
            { id: 'r1', center: [0, 0, 0], radius: 10, priority: 5, syncRateHz: 20 },
          ],
        })
      ).toThrow(CRDTRoomTraitValidationError);
    });

    it('rejects sharding entityThreshold below 10', () => {
      expect(() =>
        validateCRDTRoomTraitConfig({ sharding: { enabled: true, entityThreshold: 5 } })
      ).toThrow(CRDTRoomTraitValidationError);
    });
  });

  // =========================================================================
  // resolveCRDTRoomTraitConfig
  // =========================================================================
  describe('resolveCRDTRoomTraitConfig', () => {
    it('fills in defaults for empty config', () => {
      const resolved = resolveCRDTRoomTraitConfig({});
      expect(resolved.roomName).toBe('Untitled Room');
      expect(resolved.maxPlayers).toBe(50);
      expect(resolved.baseSyncRateHz).toBe(20);
      expect(resolved.privacy).toBe('public');
    });

    it('preserves provided values', () => {
      const resolved = resolveCRDTRoomTraitConfig({ roomName: 'Arena', maxPlayers: 100 });
      expect(resolved.roomName).toBe('Arena');
      expect(resolved.maxPlayers).toBe(100);
    });

    it('all fields are defined after resolve', () => {
      const resolved = resolveCRDTRoomTraitConfig({});
      const keys = [
        'roomName',
        'maxPlayers',
        'baseSyncRateHz',
        'maxBatchSize',
        'flushIntervalMs',
        'interestManagement',
        'viewDistance',
        'interestRegions',
        'syncTiers',
        'sharding',
        'persistence',
        'privacy',
        'password',
        'heartbeatIntervalMs',
        'presenceTimeoutMs',
        'maxChatHistory',
        'merkleVerification',
        'metadata',
      ];
      for (const key of keys) {
        expect((resolved as any)[key]).toBeDefined();
      }
    });
  });

  // =========================================================================
  // createCRDTRoomTraitConfig (factory)
  // =========================================================================
  describe('createCRDTRoomTraitConfig', () => {
    it('parses, validates, and resolves in one call', () => {
      const config = createCRDTRoomTraitConfig({
        roomName: 'Test Room',
        maxPlayers: 16,
      });
      expect(config.roomName).toBe('Test Room');
      expect(config.maxPlayers).toBe(16);
      expect(config.baseSyncRateHz).toBe(20); // default filled in
    });

    it('throws on invalid input', () => {
      expect(() => createCRDTRoomTraitConfig({ maxPlayers: -1 })).toThrow();
    });
  });
});
