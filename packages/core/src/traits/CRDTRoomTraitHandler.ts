import type { Vector3 } from '../types';
/**
 * CRDTRoomTraitHandler — Bridges @crdt-room trait config to CRDTRoom runtime
 *
 * Converts the declarative CRDTRoomTraitConfig (parsed from .hsplus scene files)
 * into:
 *   1. CRDTRoomConfig — passed to new CRDTRoom(client, nodeId, config)
 *   2. CRDTRoomManagerConfig — passed to CRDTRoomManager for sharding/persistence
 *   3. InterestRegion[] — registered on the CRDTRoom after creation
 *   4. Entity sync tier assignments — applied per-entity as they are added
 *
 * Usage:
 *   // In scene loader / compiler output:
 *   const traitConfig = createCRDTRoomTraitConfig(rawTraitProps);
 *   const handler = new CRDTRoomTraitHandler(traitConfig);
 *
 *   // Create the room via manager:
 *   const room = manager.createRoom(handler.toCRDTRoomConfig(sceneId));
 *
 *   // Apply interest regions:
 *   handler.applyInterestRegions(room);
 *
 *   // On entity creation, apply sync tier:
 *   handler.applyEntitySyncTier(room, entityId, entityType);
 *
 * @module CRDTRoomTraitHandler
 * @version 1.0.0
 */

import type {
  CRDTRoomTraitConfig,
  CRDTRoomEntityDecl,
  CRDTRoomInterestRegionDecl,
  CRDTSyncTier,
} from './CRDTRoomTrait';

import {
  normalizeCenter,
  parseCRDTRoomTraitConfig,
  validateCRDTRoomTraitConfig,
  resolveCRDTRoomTraitConfig,
} from './CRDTRoomTrait';

// =============================================================================
// Types — output config shapes matching Hololand network types
// =============================================================================

/**
 * CRDTRoomConfig shape matching the Hololand network CRDTRoom constructor.
 * We define this locally to avoid a hard dependency on @hololand/network
 * in the HoloScript core package.
 */
export interface CRDTRoomConfigOutput {
  roomId: string;
  roomName: string;
  maxPlayers: number;
  entityThreshold?: number;
  baseSyncRateHz?: number;
  maxBatchSize?: number;
  flushIntervalMs?: number;
  interestManagement?: boolean;
  viewDistance?: number;
  heartbeatIntervalMs?: number;
  presenceTimeoutMs?: number;
  maxChatHistory?: number;
  merkleVerification?: boolean;
  isPrivate?: boolean;
  password?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CRDTRoomManagerConfig subset relevant to the trait handler.
 */
export interface CRDTRoomManagerConfigOutput {
  autoShard: boolean;
  shardThreshold: number;
  minEntitiesPerShard: number;
}

/**
 * Interest region shape matching the CRDTRoom.addInterestRegion() parameter.
 */
export interface InterestRegionOutput {
  id: string;
  center: Vector3;
  radius: number;
  priority: number;
  syncRateHz: number;
}

/**
 * Complete output from the trait handler — everything needed to wire
 * a CRDT room into the Hololand network stack.
 */
export interface CRDTRoomTraitOutput {
  /** Config for CRDTRoom constructor */
  roomConfig: CRDTRoomConfigOutput;
  /** Config for CRDTRoomManager (sharding settings) */
  managerConfig: CRDTRoomManagerConfigOutput;
  /** Interest regions to register after room creation */
  interestRegions: InterestRegionOutput[];
  /** Entity type -> sync tier mappings */
  syncTierMap: Record<string, CRDTSyncTier>;
  /** Persistence settings */
  persistence: {
    enabled: boolean;
    autoSaveIntervalMs: number;
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export class CRDTRoomTraitHandler {
  private config: Required<CRDTRoomTraitConfig>;

  /** Per-entity sync tier overrides from @crdt-room.entity traits */
  private entityOverrides: Map<string, CRDTRoomEntityDecl> = new Map();

  constructor(config: Required<CRDTRoomTraitConfig>) {
    this.config = config;
  }

  // ===========================================================================
  // Config Conversion
  // ===========================================================================

  /**
   * Convert the trait config to a CRDTRoomConfig for CRDTRoom constructor.
   *
   * @param roomId - Unique room identifier (typically derived from scene name)
   * @returns CRDTRoomConfig ready for `new CRDTRoom(client, nodeId, config)`
   */
  toCRDTRoomConfig(roomId: string): CRDTRoomConfigOutput {
    return {
      roomId,
      roomName: this.config.roomName,
      maxPlayers: this.config.maxPlayers,
      entityThreshold: this.config.sharding.entityThreshold,
      baseSyncRateHz: this.config.baseSyncRateHz,
      maxBatchSize: this.config.maxBatchSize,
      flushIntervalMs: this.config.flushIntervalMs,
      interestManagement: this.config.interestManagement,
      viewDistance: this.config.viewDistance,
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
      presenceTimeoutMs: this.config.presenceTimeoutMs,
      maxChatHistory: this.config.maxChatHistory,
      merkleVerification: this.config.merkleVerification,
      isPrivate: this.config.privacy === 'private',
      password: this.config.privacy === 'private' ? this.config.password : undefined,
      metadata: {
        ...this.config.metadata,
        traitSource: '@crdt-room',
        syncTiers: this.config.syncTiers,
      },
    };
  }

  /**
   * Convert sharding config to CRDTRoomManagerConfig subset.
   */
  toCRDTRoomManagerConfig(): CRDTRoomManagerConfigOutput {
    return {
      autoShard: this.config.sharding.enabled,
      shardThreshold: this.config.sharding.entityThreshold ?? 500,
      minEntitiesPerShard: this.config.sharding.minEntitiesPerShard ?? 50,
    };
  }

  /**
   * Convert interest region declarations to the output format.
   */
  toInterestRegions(): InterestRegionOutput[] {
    return this.config.interestRegions.map((region) => ({
      id: region.id,
      center: normalizeCenter(region.center),
      radius: region.radius,
      priority: region.priority,
      syncRateHz: region.syncRateHz,
    }));
  }

  /**
   * Get the complete output: room config, manager config, regions, and tiers.
   *
   * @param roomId - Unique room identifier
   */
  toOutput(roomId: string): CRDTRoomTraitOutput {
    return {
      roomConfig: this.toCRDTRoomConfig(roomId),
      managerConfig: this.toCRDTRoomManagerConfig(),
      interestRegions: this.toInterestRegions(),
      syncTierMap: { ...this.config.syncTiers },
      persistence: {
        enabled: this.config.persistence.enabled,
        autoSaveIntervalMs: this.config.persistence.autoSaveIntervalMs ?? 30_000,
      },
    };
  }

  // ===========================================================================
  // Runtime Integration — Apply to CRDTRoom/Manager instances
  // ===========================================================================

  /**
   * Apply interest regions from trait config to a CRDTRoom instance.
   *
   * @param room - Any object with an `addInterestRegion` method matching CRDTRoom
   */
  applyInterestRegions(room: {
    addInterestRegion(region: Omit<InterestRegionOutput, 'entities'>): void;
  }): void {
    for (const region of this.toInterestRegions()) {
      room.addInterestRegion(region);
    }
  }

  /**
   * Get the sync tier for a given entity type.
   *
   * Resolution order:
   *   1. Per-entity override from @crdt-room.entity trait
   *   2. Type-based tier from syncTiers config
   *   3. Default "normal"
   */
  getEntitySyncTier(entityId: string, entityType: string): CRDTSyncTier {
    // Check per-entity override first
    const override = this.entityOverrides.get(entityId);
    if (override) return override.syncTier;

    // Check type-based tier
    const typeTier = this.config.syncTiers[entityType];
    if (typeTier) return typeTier;

    // Default
    return 'normal';
  }

  /**
   * Register a per-entity sync tier override (from @crdt-room.entity trait).
   */
  registerEntityOverride(entityId: string, decl: CRDTRoomEntityDecl): void {
    this.entityOverrides.set(entityId, decl);
  }

  /**
   * Get all registered entity overrides.
   */
  getEntityOverrides(): Map<string, CRDTRoomEntityDecl> {
    return new Map(this.entityOverrides);
  }

  // ===========================================================================
  // Accessors
  // ===========================================================================

  /** Get the underlying resolved trait config */
  getConfig(): Required<CRDTRoomTraitConfig> {
    return { ...this.config };
  }

  /** Check if persistence is enabled */
  isPersistenceEnabled(): boolean {
    return this.config.persistence.enabled;
  }

  /** Check if sharding is enabled */
  isShardingEnabled(): boolean {
    return this.config.sharding.enabled;
  }

  /** Get the room name from config */
  getRoomName(): string {
    return this.config.roomName;
  }

  /** Get max players */
  getMaxPlayers(): number {
    return this.config.maxPlayers;
  }

  /** Get the sync tier map (entity type -> tier) */
  getSyncTierMap(): Record<string, CRDTSyncTier> {
    return { ...this.config.syncTiers };
  }

  /** Get interest region declarations */
  getInterestRegionDecls(): CRDTRoomInterestRegionDecl[] {
    return [...this.config.interestRegions];
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a CRDTRoomTraitHandler from raw .hsplus trait config.
 * Convenience function that combines parse -> validate -> resolve -> handler.
 */
export function createCRDTRoomTraitHandler(
  rawConfig: Record<string, unknown>
): CRDTRoomTraitHandler {
  const parsed = parseCRDTRoomTraitConfig(rawConfig);
  validateCRDTRoomTraitConfig(parsed);
  const resolved = resolveCRDTRoomTraitConfig(parsed);
  return new CRDTRoomTraitHandler(resolved);
}

export default CRDTRoomTraitHandler;
