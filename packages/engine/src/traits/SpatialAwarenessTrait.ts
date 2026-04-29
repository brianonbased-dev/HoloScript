/**
 * Spatial Awareness Trait
 * Sprint 4 Priority 4 - Spatial Context Awareness
 *
 * HoloScript trait that enables entities to be aware of their spatial
 * surroundings, including nearby entities, regions, and visibility.
 */

import { EventEmitter } from 'events';
import type {
  Vector3,
  SpatialContext,
  SpatialEntity,
  Region,
  SpatialEvent,
  SpatialAwarenessConfig,
  QueryResult,
} from '@holoscript/engine/spatial';
import { SpatialContextProvider, DEFAULT_SPATIAL_CONFIG } from '@holoscript/engine/spatial';

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
 * Default trait configuration
 */
export const DEFAULT_TRAIT_CONFIG: SpatialAwarenessTraitConfig = {
  ...DEFAULT_SPATIAL_CONFIG,
  initialPosition: [0, 0, 0 ],
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
  private config: SpatialAwarenessTraitConfig;
  private provider: SpatialContextProvider;
  private ownsProvider: boolean = false;
  private position: Vector3;
  private velocity: Vector3 = [0, 0, 0 ];
  private isActive: boolean = false;
  private lastContext: SpatialContext | null = null;

  // Cached queries
  private visibleEntities: Map<string, boolean> = new Map();

  constructor(id: string, config: Partial<SpatialAwarenessTraitConfig> = {}) {
    super();
    this.id = id;
    this.config = { ...DEFAULT_TRAIT_CONFIG, ...config };
    this.position = this.config.initialPosition || [0, 0, 0 ];

    // Use shared provider or create own
    if (this.config.sharedProvider) {
      this.provider = this.config.sharedProvider;
      this.ownsProvider = false;
    } else {
      this.provider = new SpatialContextProvider();
      this.ownsProvider = true;
    }

    // Setup event forwarding
    this.setupEventHandlers();

    // Auto-start if configured
    if (this.config.autoStart) {
      this.start();
    }
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Start spatial awareness
   */
  start(): void {
    if (this.isActive) return;

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
    return [...this.position] as Vector3;
  }

  /**
   * Set position
   */
  setPosition(position: Vector3): void {
    this.position = position;
    if (this.isActive) {
      this.provider.updateAgentPosition(this.id, position, this.velocity);
    }
  }

  /**
   * Get current velocity
   */
  getVelocity(): Vector3 {
    return [...this.velocity] as Vector3;
  }

  /**
   * Set velocity
   */
  setVelocity(velocity: Vector3): void {
    this.velocity = velocity;
    if (this.isActive) {
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
    ] as Vector3);
  }

  // ===========================================================================
  // CONTEXT ACCESS
  // ===========================================================================

  /**
   * Get current spatial context
   */
  getContext(): SpatialContext | null {
    return this.lastContext || this.provider.getContext(this.id);
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
    const results = this.provider.findNearest(this.position, 1, typeFilter);
    return results[0] || null;
  }

  /**
   * Find all entities within radius
   */
  findWithin(radius: number, typeFilter?: string[]): QueryResult[] {
    return this.provider.findWithin(this.position, radius, typeFilter);
  }

  /**
   * Find visible entities
   */
  findVisible(direction?: Vector3, fov?: number, maxDistance?: number): QueryResult[] {
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
    this.provider.setEntity(entity);
  }

  /**
   * Unregister an entity
   */
  unregisterEntity(entityId: string): void {
    this.provider.removeEntity(entityId);
  }

  /**
   * Batch register entities
   */
  registerEntities(entities: SpatialEntity[]): void {
    this.provider.setEntities(entities);
  }

  // ===========================================================================
  // REGION MANAGEMENT
  // ===========================================================================

  /**
   * Register a region
   */
  registerRegion(region: Region): void {
    this.provider.setRegion(region);
  }

  /**
   * Unregister a region
   */
  unregisterRegion(regionId: string): void {
    this.provider.removeRegion(regionId);
  }

  /**
   * Subscribe to region events
   */
  watchRegion(regionId: string, callback: (event: SpatialEvent) => void): void {
    this.provider.subscribeToRegion(this.id, regionId, callback);
  }

  /**
   * Unsubscribe from region events
   */
  unwatchRegion(regionId: string): void {
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
    if (this.isActive) {
      this.provider.unregisterAgent(this.id);
      this.provider.registerAgent(this.id, this.position, this.config);
    }
  }

  /**
   * Get perception radius
   */
  getPerceptionRadius(): number {
    return this.config.perceptionRadius;
  }

  /**
   * Set entity type filter
   */
  setEntityTypeFilter(types: string[]): void {
    this.config.entityTypeFilter = types;
    if (this.isActive) {
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
    this.provider.on('entity:entered', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'entity_entered') {
        this.emit('entity:entered', event.entity, event.distance);
      }
    });

    this.provider.on('entity:exited', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'entity_exited') {
        this.emit('entity:exited', event.entity);
      }
    });

    this.provider.on('region:entered', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'region_entered') {
        this.emit('region:entered', event.region, event.previousRegion);
      }
    });

    this.provider.on('region:exited', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'region_exited') {
        this.emit('region:exited', event.region);
      }
    });

    this.provider.on('visibility:changed', (agentId: string, event: SpatialEvent) => {
      if (agentId !== this.id) return;
      if (event.type === 'visibility_changed') {
        this.visibleEntities.set(event.entityId, event.visible);
        this.emit('visibility:changed', event.entityId, event.visible);
      }
    });

    this.provider.on('context:updated', (agentId: string, context: SpatialContext) => {
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
 * Create a shared spatial context provider for multiple agents
 */
export function createSharedSpatialProvider(): SpatialContextProvider {
  return new SpatialContextProvider();
}

// ── Handler (delegates to SpatialAwarenessTrait) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitInstanceDelegate,
  TraitEvent,
} from '@holoscript/core';

export const spatialAwarenessHandler: TraitHandler = {
  name: 'spatial_awareness',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    const instance = new SpatialAwarenessTrait(
      node.id || 'spatial-awareness',
      (config as Partial<SpatialAwarenessTraitConfig>) || {}
    );
    node.__spatial_awareness_instance = instance;
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
    if (typeof instance.onUpdate === 'function') instance.onUpdate(ctx, dt);
  },
};
