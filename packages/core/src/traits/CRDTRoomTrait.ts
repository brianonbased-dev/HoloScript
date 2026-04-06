/**
 * @holoscript/core CRDT Room Trait
 *
 * Enables declarative CRDT-backed multiplayer room configuration directly
 * from .hsplus scene files. Parses room declarations, entity sync tiers,
 * interest regions, and shard thresholds from trait properties, then
 * auto-configures a CRDTRoom via CRDTRoomManager.
 *
 * @version 1.0.0
 *
 * @example
 * ```hsplus
 * scene "BattleArena" {
 *   @crdt-room {
 *     roomName: "Battle Arena Alpha",
 *     maxPlayers: 32,
 *     baseSyncRateHz: 20,
 *     interestManagement: true,
 *     viewDistance: 150,
 *
 *     syncTiers: {
 *       players: "critical",
 *       projectiles: "high",
 *       environment: "low",
 *       decorations: "dormant"
 *     },
 *
 *     interestRegions: [
 *       { id: "spawn-a", center: [0, 0, 50], radius: 30, priority: 0, syncRateHz: 40 },
 *       { id: "spawn-b", center: [0, 0, -50], radius: 30, priority: 0, syncRateHz: 40 },
 *       { id: "mid-field", center: [0, 0, 0], radius: 60, priority: 1, syncRateHz: 20 }
 *     ],
 *
 *     sharding: {
 *       enabled: true,
 *       entityThreshold: 500,
 *       minEntitiesPerShard: 50
 *     },
 *
 *     persistence: {
 *       enabled: true,
 *       autoSaveIntervalMs: 30000
 *     },
 *
 *     privacy: "public",
 *     heartbeatIntervalMs: 5000,
 *     presenceTimeoutMs: 15000,
 *     maxChatHistory: 200
 *   }
 * }
 *
 * object "Player" {
 *   @networked { mode: "owner", syncRate: 20 }
 *   @crdt-room.entity { syncTier: "critical" }
 * }
 *
 * object "Tree" {
 *   @crdt-room.entity { syncTier: "dormant" }
 * }
 * ```
 */

// =============================================================================
// TYPES — Parsed trait configuration
// =============================================================================

/** Sync tier for entity update frequency */
export type CRDTSyncTier = 'critical' | 'high' | 'normal' | 'low' | 'dormant';

/** Interest region declaration from .hsplus */
export interface CRDTRoomInterestRegionDecl {
  /** Unique region identifier */
  id: string;
  /** Center position as [x, y, z] tuple or {x, y, z} object */
  center: [number, number, number] | { x: number; y: number; z: number };
  /** Radius of the interest region */
  radius: number;
  /** Priority level: 0 = critical, 1 = high, 2 = normal, 3 = low */
  priority: number;
  /** Sync rate override for entities in this region (Hz) */
  syncRateHz: number;
}

/** Sharding configuration from .hsplus */
export interface CRDTRoomShardingDecl {
  /** Enable automatic spatial sharding */
  enabled: boolean;
  /** Entity count threshold to trigger sharding */
  entityThreshold?: number;
  /** Minimum entities per shard to prevent over-splitting */
  minEntitiesPerShard?: number;
}

/** Persistence configuration from .hsplus */
export interface CRDTRoomPersistenceDecl {
  /** Enable room state persistence */
  enabled: boolean;
  /** Auto-save interval in milliseconds */
  autoSaveIntervalMs?: number;
}

/** Entity-level sync tier assignment from @crdt-room.entity */
export interface CRDTRoomEntityDecl {
  /** Sync tier for this entity type */
  syncTier: CRDTSyncTier;
  /** Optional interest region this entity belongs to */
  region?: string;
}

/**
 * Full @crdt-room trait configuration parsed from .hsplus scene files.
 *
 * This is the declarative schema that scene authors write. The
 * CRDTRoomTraitHandler converts this into CRDTRoomConfig + CRDTRoomManagerConfig
 * at runtime.
 */
export interface CRDTRoomTraitConfig {
  // --- Room Identity ---
  /** Human-readable room name */
  roomName?: string;
  /** Maximum concurrent players */
  maxPlayers?: number;

  // --- Sync Configuration ---
  /** Base sync rate in Hz for normal-priority entities */
  baseSyncRateHz?: number;
  /** Maximum delta batch size before forced flush */
  maxBatchSize?: number;
  /** Delta flush interval in ms */
  flushIntervalMs?: number;

  // --- Interest Management ---
  /** Enable interest-based spatial filtering */
  interestManagement?: boolean;
  /** View distance for interest filtering */
  viewDistance?: number;
  /** Declared interest regions */
  interestRegions?: CRDTRoomInterestRegionDecl[];

  // --- Entity Sync Tiers ---
  /** Map of entityType -> sync tier for bulk assignment */
  syncTiers?: Record<string, CRDTSyncTier>;

  // --- Sharding ---
  /** Spatial sharding configuration */
  sharding?: CRDTRoomShardingDecl;

  // --- Persistence ---
  /** Room state persistence configuration */
  persistence?: CRDTRoomPersistenceDecl;

  // --- Privacy & Security ---
  /** Room privacy: "public" | "private" */
  privacy?: 'public' | 'private';
  /** Room password (required if privacy is "private") */
  password?: string;

  // --- Presence ---
  /** Heartbeat interval for presence detection (ms) */
  heartbeatIntervalMs?: number;
  /** Time after which a player is considered stale (ms) */
  presenceTimeoutMs?: number;

  // --- Chat ---
  /** Maximum chat history entries retained */
  maxChatHistory?: number;

  // --- Advanced ---
  /** Enable Merkle tree integrity verification */
  merkleVerification?: boolean;
  /** Custom room metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// TRAIT DEFAULTS
// =============================================================================

/** Default configuration values for @crdt-room */
export const CRDT_ROOM_TRAIT_DEFAULTS: Required<
  Omit<CRDTRoomTraitConfig, 'password' | 'metadata' | 'syncTiers' | 'interestRegions'>
> & {
  syncTiers: Record<string, CRDTSyncTier>;
  interestRegions: CRDTRoomInterestRegionDecl[];
  password: string;
  metadata: Record<string, unknown>;
} = {
  roomName: 'Untitled Room',
  maxPlayers: 50,
  baseSyncRateHz: 20,
  maxBatchSize: 50,
  flushIntervalMs: 50,
  interestManagement: true,
  viewDistance: 100,
  interestRegions: [],
  syncTiers: {},
  sharding: {
    enabled: true,
    entityThreshold: 500,
    minEntitiesPerShard: 50,
  },
  persistence: {
    enabled: false,
    autoSaveIntervalMs: 30_000,
  },
  privacy: 'public',
  password: '',
  heartbeatIntervalMs: 5_000,
  presenceTimeoutMs: 15_000,
  maxChatHistory: 200,
  merkleVerification: false,
  metadata: {},
};

// =============================================================================
// VALIDATION
// =============================================================================

/** Validation error for @crdt-room trait configuration */
export class CRDTRoomTraitValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly reason: string
  ) {
    super(`@crdt-room validation error in "${field}": ${reason}`);
    this.name = 'CRDTRoomTraitValidationError';
  }
}

/**
 * Validate a @crdt-room trait configuration.
 * Throws CRDTRoomTraitValidationError for invalid values.
 */
export function validateCRDTRoomTraitConfig(config: CRDTRoomTraitConfig): void {
  if (config.maxPlayers !== undefined) {
    if (
      !Number.isInteger(config.maxPlayers) ||
      config.maxPlayers < 1 ||
      config.maxPlayers > 10_000
    ) {
      throw new CRDTRoomTraitValidationError(
        'maxPlayers',
        'Must be an integer between 1 and 10000'
      );
    }
  }

  if (config.baseSyncRateHz !== undefined) {
    if (config.baseSyncRateHz < 1 || config.baseSyncRateHz > 120) {
      throw new CRDTRoomTraitValidationError('baseSyncRateHz', 'Must be between 1 and 120 Hz');
    }
  }

  if (config.viewDistance !== undefined) {
    if (config.viewDistance <= 0) {
      throw new CRDTRoomTraitValidationError('viewDistance', 'Must be a positive number');
    }
  }

  if (config.heartbeatIntervalMs !== undefined) {
    if (config.heartbeatIntervalMs < 500 || config.heartbeatIntervalMs > 60_000) {
      throw new CRDTRoomTraitValidationError(
        'heartbeatIntervalMs',
        'Must be between 500 and 60000 ms'
      );
    }
  }

  if (config.presenceTimeoutMs !== undefined) {
    if (config.presenceTimeoutMs < 1_000) {
      throw new CRDTRoomTraitValidationError('presenceTimeoutMs', 'Must be at least 1000 ms');
    }
    if (
      config.heartbeatIntervalMs !== undefined &&
      config.presenceTimeoutMs < config.heartbeatIntervalMs * 2
    ) {
      throw new CRDTRoomTraitValidationError(
        'presenceTimeoutMs',
        'Must be at least 2x the heartbeatIntervalMs'
      );
    }
  }

  if (config.maxChatHistory !== undefined) {
    if (!Number.isInteger(config.maxChatHistory) || config.maxChatHistory < 0) {
      throw new CRDTRoomTraitValidationError('maxChatHistory', 'Must be a non-negative integer');
    }
  }

  if (config.privacy === 'private' && !config.password) {
    throw new CRDTRoomTraitValidationError(
      'password',
      'Password is required when privacy is "private"'
    );
  }

  // Validate sync tiers
  const validTiers: CRDTSyncTier[] = ['critical', 'high', 'normal', 'low', 'dormant'];
  if (config.syncTiers) {
    for (const [entityType, tier] of Object.entries(config.syncTiers)) {
      if (!validTiers.includes(tier)) {
        throw new CRDTRoomTraitValidationError(
          `syncTiers.${entityType}`,
          `Invalid sync tier "${tier}". Must be one of: ${validTiers.join(', ')}`
        );
      }
    }
  }

  // Validate interest regions
  if (config.interestRegions) {
    const regionIds = new Set<string>();
    for (const region of config.interestRegions) {
      if (!region.id) {
        throw new CRDTRoomTraitValidationError('interestRegions', 'Each region must have an "id"');
      }
      if (regionIds.has(region.id)) {
        throw new CRDTRoomTraitValidationError(
          'interestRegions',
          `Duplicate region id: "${region.id}"`
        );
      }
      regionIds.add(region.id);

      if (region.radius <= 0) {
        throw new CRDTRoomTraitValidationError(
          `interestRegions.${region.id}.radius`,
          'Must be a positive number'
        );
      }
      if (region.priority < 0 || region.priority > 3) {
        throw new CRDTRoomTraitValidationError(
          `interestRegions.${region.id}.priority`,
          'Must be 0 (critical), 1 (high), 2 (normal), or 3 (low)'
        );
      }
      if (region.syncRateHz < 1 || region.syncRateHz > 120) {
        throw new CRDTRoomTraitValidationError(
          `interestRegions.${region.id}.syncRateHz`,
          'Must be between 1 and 120 Hz'
        );
      }
    }
  }

  // Validate sharding
  if (config.sharding) {
    if (config.sharding.entityThreshold !== undefined) {
      if (
        !Number.isInteger(config.sharding.entityThreshold) ||
        config.sharding.entityThreshold < 10
      ) {
        throw new CRDTRoomTraitValidationError(
          'sharding.entityThreshold',
          'Must be an integer >= 10'
        );
      }
    }
    if (config.sharding.minEntitiesPerShard !== undefined) {
      if (
        !Number.isInteger(config.sharding.minEntitiesPerShard) ||
        config.sharding.minEntitiesPerShard < 1
      ) {
        throw new CRDTRoomTraitValidationError(
          'sharding.minEntitiesPerShard',
          'Must be a positive integer'
        );
      }
    }
  }
}

// =============================================================================
// PARSING — Convert raw trait config to normalized form
// =============================================================================

/**
 * Normalize a center value from [x, y, z] tuple or {x, y, z} object
 * to the standard {x, y, z} format expected by CRDTRoom.
 */
export function normalizeCenter(
  center: [number, number, number] | { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  if (Array.isArray(center)) {
    return { x: center[0], y: center[1], z: center[2] };
  }
  return center;
}

/**
 * Parse and normalize raw @crdt-room trait config from the AST.
 *
 * Merges defaults, validates, and returns a fully resolved config ready
 * for CRDTRoomTraitHandler.
 */
export function parseCRDTRoomTraitConfig(raw: Record<string, unknown>): CRDTRoomTraitConfig {
  const config: CRDTRoomTraitConfig = {};

  // --- Simple string/number/boolean fields ---
  if (raw.roomName !== undefined) config.roomName = String(raw.roomName);
  if (raw.maxPlayers !== undefined) config.maxPlayers = Number(raw.maxPlayers);
  if (raw.baseSyncRateHz !== undefined) config.baseSyncRateHz = Number(raw.baseSyncRateHz);
  if (raw.maxBatchSize !== undefined) config.maxBatchSize = Number(raw.maxBatchSize);
  if (raw.flushIntervalMs !== undefined) config.flushIntervalMs = Number(raw.flushIntervalMs);
  if (raw.interestManagement !== undefined)
    config.interestManagement = Boolean(raw.interestManagement);
  if (raw.viewDistance !== undefined) config.viewDistance = Number(raw.viewDistance);
  if (raw.heartbeatIntervalMs !== undefined)
    config.heartbeatIntervalMs = Number(raw.heartbeatIntervalMs);
  if (raw.presenceTimeoutMs !== undefined) config.presenceTimeoutMs = Number(raw.presenceTimeoutMs);
  if (raw.maxChatHistory !== undefined) config.maxChatHistory = Number(raw.maxChatHistory);
  if (raw.merkleVerification !== undefined)
    config.merkleVerification = Boolean(raw.merkleVerification);

  // --- Privacy ---
  if (raw.privacy !== undefined) {
    const p = String(raw.privacy);
    if (p === 'public' || p === 'private') {
      config.privacy = p;
    }
  }
  if (raw.password !== undefined) config.password = String(raw.password);

  // --- Sync tiers ---
  if (raw.syncTiers && typeof raw.syncTiers === 'object' && !Array.isArray(raw.syncTiers)) {
    config.syncTiers = {} as Record<string, CRDTSyncTier>;
    for (const [key, value] of Object.entries(raw.syncTiers as Record<string, unknown>)) {
      config.syncTiers[key] = String(value) as CRDTSyncTier;
    }
  }

  // --- Interest regions ---
  if (Array.isArray(raw.interestRegions)) {
    config.interestRegions = (raw.interestRegions as unknown[]).map((r) => {
      const region = r as Record<string, unknown>;
      return {
        id: String(region.id),
        center: region.center as [number, number, number] | { x: number; y: number; z: number },
        radius: Number(region.radius),
        priority: Number(region.priority ?? 2),
        syncRateHz: Number(region.syncRateHz ?? 20),
      };
    });
  }

  // --- Sharding ---
  if (raw.sharding && typeof raw.sharding === 'object') {
    const s = raw.sharding as Record<string, unknown>;
    config.sharding = {
      enabled: s.enabled !== undefined ? Boolean(s.enabled) : true,
      entityThreshold: s.entityThreshold !== undefined ? Number(s.entityThreshold) : undefined,
      minEntitiesPerShard:
        s.minEntitiesPerShard !== undefined ? Number(s.minEntitiesPerShard) : undefined,
    };
  }

  // --- Persistence ---
  if (raw.persistence && typeof raw.persistence === 'object') {
    const p = raw.persistence as Record<string, unknown>;
    config.persistence = {
      enabled: p.enabled !== undefined ? Boolean(p.enabled) : false,
      autoSaveIntervalMs:
        p.autoSaveIntervalMs !== undefined ? Number(p.autoSaveIntervalMs) : undefined,
    };
  }

  // --- Metadata ---
  if (raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)) {
    config.metadata = raw.metadata as Record<string, unknown>;
  }

  return config;
}

/**
 * Parse a @crdt-room.entity trait config for per-object sync tier assignment.
 */
export function parseCRDTRoomEntityConfig(raw: Record<string, unknown>): CRDTRoomEntityDecl {
  return {
    syncTier: String(raw.syncTier || 'normal') as CRDTSyncTier,
    region: raw.region !== undefined ? String(raw.region) : undefined,
  };
}

// =============================================================================
// RESOLVE — Merge defaults with parsed config
// =============================================================================

/**
 * Resolve a parsed CRDTRoomTraitConfig by applying defaults.
 * Returns a fully populated config suitable for CRDTRoomTraitHandler.
 */
export function resolveCRDTRoomTraitConfig(
  parsed: CRDTRoomTraitConfig
): Required<CRDTRoomTraitConfig> {
  return {
    roomName: parsed.roomName ?? CRDT_ROOM_TRAIT_DEFAULTS.roomName,
    maxPlayers: parsed.maxPlayers ?? CRDT_ROOM_TRAIT_DEFAULTS.maxPlayers,
    baseSyncRateHz: parsed.baseSyncRateHz ?? CRDT_ROOM_TRAIT_DEFAULTS.baseSyncRateHz,
    maxBatchSize: parsed.maxBatchSize ?? CRDT_ROOM_TRAIT_DEFAULTS.maxBatchSize,
    flushIntervalMs: parsed.flushIntervalMs ?? CRDT_ROOM_TRAIT_DEFAULTS.flushIntervalMs,
    interestManagement: parsed.interestManagement ?? CRDT_ROOM_TRAIT_DEFAULTS.interestManagement,
    viewDistance: parsed.viewDistance ?? CRDT_ROOM_TRAIT_DEFAULTS.viewDistance,
    interestRegions: parsed.interestRegions ?? CRDT_ROOM_TRAIT_DEFAULTS.interestRegions,
    syncTiers: parsed.syncTiers ?? CRDT_ROOM_TRAIT_DEFAULTS.syncTiers,
    sharding: parsed.sharding ?? CRDT_ROOM_TRAIT_DEFAULTS.sharding,
    persistence: parsed.persistence ?? CRDT_ROOM_TRAIT_DEFAULTS.persistence,
    privacy: parsed.privacy ?? CRDT_ROOM_TRAIT_DEFAULTS.privacy,
    password: parsed.password ?? CRDT_ROOM_TRAIT_DEFAULTS.password,
    heartbeatIntervalMs: parsed.heartbeatIntervalMs ?? CRDT_ROOM_TRAIT_DEFAULTS.heartbeatIntervalMs,
    presenceTimeoutMs: parsed.presenceTimeoutMs ?? CRDT_ROOM_TRAIT_DEFAULTS.presenceTimeoutMs,
    maxChatHistory: parsed.maxChatHistory ?? CRDT_ROOM_TRAIT_DEFAULTS.maxChatHistory,
    merkleVerification: parsed.merkleVerification ?? CRDT_ROOM_TRAIT_DEFAULTS.merkleVerification,
    metadata: parsed.metadata ?? CRDT_ROOM_TRAIT_DEFAULTS.metadata,
  };
}

// =============================================================================
// FACTORY — Convenience creation
// =============================================================================

/**
 * HoloScript+ @crdt-room trait factory.
 *
 * Parses raw trait config from the AST, validates it, and returns
 * a fully resolved configuration ready for CRDTRoomTraitHandler.
 */
export function createCRDTRoomTraitConfig(
  rawConfig: Record<string, unknown>
): Required<CRDTRoomTraitConfig> {
  const parsed = parseCRDTRoomTraitConfig(rawConfig);
  validateCRDTRoomTraitConfig(parsed);
  return resolveCRDTRoomTraitConfig(parsed);
}

export default {
  parseCRDTRoomTraitConfig,
  parseCRDTRoomEntityConfig,
  validateCRDTRoomTraitConfig,
  resolveCRDTRoomTraitConfig,
  createCRDTRoomTraitConfig,
  normalizeCenter,
  CRDT_ROOM_TRAIT_DEFAULTS,
};

// ── Handler (delegates to CRDTRoomTraitValidationError) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const cRDTRoomHandler = {
  name: 'c_r_d_t_room',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    const instance = new CRDTRoomTraitValidationError('config', 'Handler instantiation');
    node.__c_r_d_t_room_instance = instance;
    ctx.emit('c_r_d_t_room_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__c_r_d_t_room_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('c_r_d_t_room_detached', { node });
    delete node.__c_r_d_t_room_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__c_r_d_t_room_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'c_r_d_t_room_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('c_r_d_t_room_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__c_r_d_t_room_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
