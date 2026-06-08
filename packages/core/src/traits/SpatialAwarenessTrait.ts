/**
 * Spatial Awareness Trait
 * Sprint 4 Priority 4 - Spatial Context Awareness
 *
 * HoloScript trait that enables entities to be aware of their spatial
 * surroundings, including nearby entities, regions, and visibility.
 */

import { EventEmitter } from 'events';
// IMPORTANT: `@holoscript/engine/spatial` is an OPTIONAL peer dependency. It must
// NOT be statically value-imported, or `import '@holoscript/core'` crashes cold
// for consumers that do not have the engine installed. All symbols below are
// type-only; the runtime values (`SpatialContextProvider`, `DEFAULT_SPATIAL_CONFIG`)
// are lazy-loaded via `await import('@holoscript/engine/spatial')` inside
// `ensureInitialized()` and `createSharedSpatialProvider()`.
import type {
  Vector3,
  SpatialContext,
  SpatialEntity,
  Region,
  SpatialEvent,
  SpatialAwarenessConfig,
  QueryResult,
  SpatialContextProvider,
} from '@holoscript/engine/spatial';

/**
 * Module-scoped cache for the lazily-imported optional engine module. Populated
 * once on first `ensureInitialized()` / `createSharedSpatialProvider()` call.
 */
let _spatial: typeof import('@holoscript/engine/spatial') | null = null;

// =============================================================================
// TRAIT CONFIGURATION
// =============================================================================

/**
 * Configuration for the spatial awareness trait
 */
export interface SpatialAwarenessTraitConfig extends SpatialAwarenessConfig {
  /** Initial position */
  initialPosition?: Vector3;

  /** Auto-start spatial awareness */
  autoStart?: boolean;

  /** Shared context provider (for multi-agent scenarios) */
  sharedProvider?: SpatialContextProvider;
}

/**
 * Default trait configuration (trait-local fields ONLY).
 *
 * The spatial defaults (`DEFAULT_SPATIAL_CONFIG`) are intentionally NOT spread
 * here — that value lives in the optional `@holoscript/engine/spatial` peer and
 * spreading it at module load would crash a cold `import '@holoscript/core'`.
 * The spatial defaults are merged lazily inside `ensureInitialized()` once the
 * engine module is dynamically imported.
 *
 * Typed as `Partial<...>` because the spatial fields are filled in at init time
 * rather than at module load.
 */
export const DEFAULT_TRAIT_CONFIG: Partial<SpatialAwarenessTraitConfig> = {
  initialPosition: [0, 0, 0] as [number, number, number],
  autoStart: true,
};

// =============================================================================
// TRAIT EVENTS
// =============================================================================

/**
 * Events emitted by the spatial awareness trait
 */
export interface SpatialAwarenessTraitEvents {
  /** Entity entered perception radius */
  'entity:entered': (entity: SpatialEntity, distance: number) => void;

  /** Entity exited perception radius */
  'entity:exited': (entity: SpatialEntity) => void;

  /** Entered a region */
  'region:entered': (region: Region, previousRegion?: Region) => void;

  /** Exited a region */
  'region:exited': (region: Region) => void;

  /** Visibility to entity changed */
  'visibility:changed': (entityId: string, visible: boolean) => void;

  /** Context updated */
  'context:updated': (context: SpatialContext) => void;
}

// =============================================================================
// SPATIAL AWARENESS TRAIT
// =============================================================================

/**
 * Trait that provides spatial awareness to HoloScript entities
 *
 * @example
 * ```holoscript
 * agent#patrol_bot {
 *   @spatial_awareness(
 *     updateRate: 30hz,
 *     perceptionRadius: 10m
 *   )
 *
 *   @on_entity_entered(entity) {
 *     if (entity.type == "visitor") {
 *       initiate_greeting(entity)
 *     }
 *   }
 * }
 * ```
 */
export class SpatialAwarenessTrait extends EventEmitter {
  private id: string;
  private config: Partial<SpatialAwarenessTraitConfig>;
  /**
   * The underlying spatial provider. `null` until `ensureInitialized()` has run
   * (it lazy-imports the optional engine peer to construct it). All sync methods
   * that touch `this.provider` null-guard and no-op until initialization, since
   * the trait is not "active" until `start()` / `ensureInitialized()` completes.
   */
  private provider: SpatialContextProvider | null = null;
  private ownsProvider: boolean = false;
  /** True once `ensureInitialized()` has constructed the provider + wired events. */
  private initialized: boolean = false;
  /** In-flight initialization promise so concurrent `ensureInitialized()` calls share one import. */
  private initPromise: Promise<void> | null = null;
  private position: Vector3;
  private velocity: Vector3 = [0, 0, 0];
  private isActive: boolean = false;
  private lastContext: SpatialContext | null = null;

  // Cached queries
  private visibleEntities: Map<string, boolean> = new Map();

  constructor(id: string, config: Partial<SpatialAwarenessTraitConfig> = {}) {
    super();
    this.id = id;
    // NOTE: spatial defaults are NOT merged here (the constructor cannot be async
    // and the defaults live in the optional engine peer). They are merged inside
    // ensureInitialized(). This merge only applies the trait-local defaults.
    this.config = { ...DEFAULT_TRAIT_CONFIG, ...config };
    this.position = this.config.initialPosition || [0, 0, 0];

    // Provider construction is DEFERRED to ensureInitialized() because it requires
    // the optional engine peer to be dynamically imported. We only record whether
    // a shared provider was supplied; the actual `this.provider` assignment happens
    // (synchronously, after the dynamic import resolves) in ensureInitialized().
    this.ownsProvider = !this.config.sharedProvider;

    // Event forwarding and auto-start are also deferred to ensureInitialized():
    // both depend on `this.provider`, which does not exist until the engine module
    // has loaded. Consumers that need the trait active should `await trait.start()`.
    if (this.config.autoStart) {
      // Fire-and-forget: start() is async and idempotent. The trait becomes active
      // once the engine module resolves. The .catch keeps a missing optional peer
      // from surfacing as an unhandled rejection — callers that need to observe the
      // failure (or guarantee readiness) should `await trait.start()` explicitly
      // (the handler's onAttach does exactly this).
      void this.start().catch(() => {
        /* swallow: autoStart is best-effort; explicit start() reports errors */
      });
    }
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Lazily load the optional `@holoscript/engine/spatial` peer, construct the
   * provider, merge in the spatial defaults, and wire event forwarding.
   *
   * This is the single place the optional engine module is dynamically imported,
   * so a cold `import '@holoscript/core'` never touches it. Safe to call multiple
   * times — the import + construction happen exactly once (guarded by `initPromise`
   * and `this.initialized`).
   *
   * @throws if `@holoscript/engine/spatial` is not installed (the optional peer).
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      _spatial ??= await import('@holoscript/engine/spatial');

      // Merge the spatial defaults that we could not spread at module load.
      // Existing (caller-supplied) config values win over the defaults.
      this.config = { ..._spatial.DEFAULT_SPATIAL_CONFIG, ...this.config };

      // Construct (or adopt) the provider now that the engine module is loaded.
      this.provider = this.config.sharedProvider ?? new _spatial.SpatialContextProvider();

      // Wire event forwarding now that `this.provider` exists.
      this.setupEventHandlers();

      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Start spatial awareness.
   *
   * Now async: it first awaits `ensureInitialized()` (which lazy-imports the
   * optional engine peer and constructs the provider), then registers the agent.
   */
  async start(): Promise<void> {
    if (this.isActive) return;

    await this.ensureInitialized();
    // Re-check after the await: a concurrent start() may have completed
    // registration while this call was suspended on ensureInitialized().
    if (this.isActive) return;
    // After ensureInitialized() resolves, this.provider is guaranteed non-null.
    /* istanbul ignore next */
    if (!this.provider) return;

    this.provider.registerAgent(this.id, this.position, this.config);

    if (this.ownsProvider) {
      this.provider.start();
    }

    this.isActive = true;
  }

  /**
   * Stop spatial awareness
   */
  stop(): void {
    if (!this.isActive) return;
    if (!this.provider) {
      this.isActive = false;
      return;
    }

    this.provider.unregisterAgent(this.id);

    if (this.ownsProvider) {
      this.provider.stop();
    }

    this.isActive = false;
  }

  /**
   * Dispose of the trait
   */
  dispose(): void {
    this.stop();
    this.removeAllListeners();
  }

  // ===========================================================================
  // POSITION & MOVEMENT
  // ===========================================================================

  /**
   * Get current position
   */
  getPosition(): Vector3 {
    return [this.position[0], this.position[1], this.position[2]];
  }

  /**
   * Set position
   */
  setPosition(position: Vector3): void {
    this.position = position;
    // isActive can only be true after ensureInitialized() set this.provider,
    // but null-guard for type-narrowing and defensive safety.
    if (this.isActive && this.provider) {
      this.provider.updateAgentPosition(this.id, position, this.velocity);
    }
  }

  /**
   * Get current velocity
   */
  getVelocity(): Vector3 {
    return [this.velocity[0], this.velocity[1], this.velocity[2]];
  }

  /**
   * Set velocity
   */
  setVelocity(velocity: Vector3): void {
    this.velocity = velocity;
    if (this.isActive && this.provider) {
      this.provider.updateAgentPosition(this.id, this.position, velocity);
    }
  }

  /**
   * Move by delta
   */
  move(delta: Vector3): void {
    this.setPosition([
      this.position[0] + delta[0],
      this.position[1] + delta[1],
      this.position[2] + delta[2],
    ]);
  }

  // ===========================================================================
  // CONTEXT ACCESS
  // ===========================================================================

  /**
   * Get current spatial context
   */
  getContext(): SpatialContext | null {
    if (this.lastContext) return this.lastContext;
    // Provider not yet initialized → no context available yet.
    if (!this.provider) return null;
    return this.provider.getContext(this.id);
  }

  /**
   * Get nearby entities
   */
  getNearbyEntities(): SpatialEntity[] {
    const context = this.getContext();
    return context?.nearbyEntities || [];
  }

  /**
   * Get current regions
   */
  getCurrentRegions(): Region[] {
    const context = this.getContext();
    return context?.currentRegions || [];
  }

  /**
   * Check if in a specific region
   */
  isInRegion(regionId: string): boolean {
    const regions = this.getCurrentRegions();
    return regions.some((r) => r.id === regionId);
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Find nearest entity
   */
  findNearest(typeFilter?: string[]): QueryResult | null {
    if (!this.provider) return null;
    const results = this.provider.findNearest(this.position, 1, typeFilter);
    return results[0] || null;
  }

  /**
   * Find all entities within radius
   */
  findWithin(radius: number, typeFilter?: string[]): QueryResult[] {
    if (!this.provider) return [];
    return this.provider.findWithin(this.position, radius, typeFilter);
  }

  /**
   * Find visible entities
   */
  findVisible(direction?: Vector3, fov?: number, maxDistance?: number): QueryResult[] {
    if (!this.provider) return [];
    return this.provider.findVisible(this.position, direction, fov, maxDistance);
  }

  /**
   * Check if entity is visible
   */
  isEntityVisible(entityId: string): boolean {
    return this.visibleEntities.get(entityId) || false;
  }

  /**
   * Get distance to entity
   */
  getDistanceTo(entityId: string): number | null {
    const entities = this.getNearbyEntities();
    const entity = entities.find((e) => e.id === entityId);
    if (!entity) return null;

    const dx = entity.position[0] - this.position[0];
    const dy = entity.position[1] - this.position[1];
    const dz = entity.position[2] - this.position[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ===========================================================================
  // ENTITY MANAGEMENT
  // ===========================================================================

  /**
   * Register an entity for tracking
   */
  registerEntity(entity: SpatialEntity): void {
    if (!this.provider) return;
    this.provider.setEntity(entity);
  }

  /**
   * Unregister an entity
   */
  unregisterEntity(entityId: string): void {
    if (!this.provider) return;
    this.provider.removeEntity(entityId);
  }

  /**
   * Batch register entities
   */
  registerEntities(entities: SpatialEntity[]): void {
    if (!this.provider) return;
    this.provider.setEntities(entities);
  }

  // ===========================================================================
  // REGION MANAGEMENT
  // ===========================================================================

  /**
   * Register a region
   */
  registerRegion(region: Region): void {
    if (!this.provider) return;
    this.provider.setRegion(region);
  }

  /**
   * Unregister a region
   */
  unregisterRegion(regionId: string): void {
    if (!this.provider) return;
    this.provider.removeRegion(regionId);
  }

  /**
   * Subscribe to region events
   */
  watchRegion(regionId: string, callback: (event: SpatialEvent) => void): void {
    if (!this.provider) return;
    this.provider.subscribeToRegion(this.id, regionId, callback);
  }

  /**
   * Unsubscribe from region events
   */
  unwatchRegion(regionId: string): void {
    if (!this.provider) return;
    this.provider.unsubscribeFromRegion(this.id, regionId);
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  /**
   * Update perception radius
   */
  setPerceptionRadius(radius: number): void {
    this.config.perceptionRadius = radius;
    // Re-register with new config
    if (this.isActive && this.provider) {
      this.provider.unregisterAgent(this.id);
      this.provider.registerAgent(this.id, this.position, this.config);
    }
  }

  /**
   * Get perception radius
   *
   * Returns 0 if the spatial defaults have not yet been merged (i.e. before
   * `ensureInitialized()` ran and no explicit value was supplied in config).
   */
  getPerceptionRadius(): number {
    return this.config.perceptionRadius ?? 0;
  }

  /**
   * Set entity type filter
   */
  setEntityTypeFilter(types: string[]): void {
    this.config.entityTypeFilter = types;
    if (this.isActive && this.provider) {
      this.provider.unregisterAgent(this.id);
      this.provider.registerAgent(this.id, this.position, this.config);
    }
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Setup event handlers from provider
   */
  private setupEventHandlers(): void {
    // Only called from ensureInitialized() after this.provider is assigned, but
    // narrow for the type checker and guard defensively. Bind to a local const so
    // narrowing holds across all the .on() calls (member narrowing can be reset
    // by intervening method calls).
    const provider = this.provider;
    if (!provider) return;

    provider.on('entity:entered', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'entity_entered') {
        this.emit('entity:entered', event.entity, event.distance);
      }
    });

    provider.on('entity:exited', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'entity_exited') {
        this.emit('entity:exited', event.entity);
      }
    });

    provider.on('region:entered', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'region_entered') {
        this.emit('region:entered', event.region, event.previousRegion);
      }
    });

    provider.on('region:exited', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'region_exited') {
        this.emit('region:exited', event.region);
      }
    });

    provider.on('visibility:changed', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'visibility_changed') {
        this.visibleEntities.set(event.entityId, event.visible);
        this.emit('visibility:changed', event.entityId, event.visible);
      }
    });

    provider.on('context:updated', (agentId: string, context: SpatialContext) => {
      if (agentId !== this.id) return;
      this.lastContext = context;
      this.emit('context:updated', context);
    });
  }
}

// =============================================================================
// TRAIT FACTORY
// =============================================================================

/**
 * Create a spatial awareness trait for an entity
 */
export function createSpatialAwarenessTrait(
  id: string,
  config?: Partial<SpatialAwarenessTraitConfig>
): SpatialAwarenessTrait {
  return new SpatialAwarenessTrait(id, config);
}

/**
 * Create a shared spatial context provider for multiple agents.
 *
 * Now async: the provider class lives in the optional `@holoscript/engine/spatial`
 * peer, which is lazy-imported here so a cold `import '@holoscript/core'` never
 * loads it.
 */
export async function createSharedSpatialProvider(): Promise<SpatialContextProvider> {
  _spatial ??= await import('@holoscript/engine/spatial');
  return new _spatial.SpatialContextProvider();
}

// ── Handler (delegates to SpatialAwarenessTrait) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitInstanceDelegate,
  TraitEvent,
} from './TraitTypes';

export const spatialAwarenessHandler = {
  name: 'spatial_awareness',
  defaultConfig: {},
  async onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): Promise<void> {
    const instance = new SpatialAwarenessTrait(
      node.id || 'spatial_awareness',
      config as Partial<SpatialAwarenessTraitConfig>
    );
    node.__spatial_awareness_instance = instance;
    // The constructor only fire-and-forgets start() when autoStart is set. Await
    // start() here so the provider (lazy-loaded from the optional engine peer) is
    // ready before onAttach resolves and downstream code touches the trait.
    await instance.start();
    ctx.emit('spatial_awareness_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__spatial_awareness_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('spatial_awareness_detached', { node });
    delete node.__spatial_awareness_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__spatial_awareness_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'spatial_awareness_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('spatial_awareness_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__spatial_awareness_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler<unknown>;
