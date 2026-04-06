/**
 * Spatial Context Provider
 * Sprint 4 Priority 4 - Spatial Context Awareness
 *
 * Manages spatial context for agents, providing real-time updates about
 * nearby entities, regions, and visibility.
 */

import { EventEmitter } from 'events';
import {
  Vector3,
  SpatialContext,
  SpatialEntity,
  Region,
  SightLine,
  SpatialEvent,
  SpatialAwarenessConfig,
  DEFAULT_SPATIAL_CONFIG,
  distance,
  distanceSquared,
  isPointInBox,
  isPointInSphere,
  normalize,
  subtract,
  BoundingBox,
  BoundingSphere,
} from './SpatialTypes';
import { SpatialQuery, QueryResult, SpatialQueryExecutor } from './SpatialQuery';

// =============================================================================
// AGENT STATE
// =============================================================================

/**
 * Tracked state for a single agent
 */
interface AgentState {
  id: string;
  position: Vector3;
  velocity?: Vector3;
  config: SpatialAwarenessConfig;
  lastContext: SpatialContext | null;
  trackedEntities: Map<string, SpatialEntity>; // Cache entity data for exit events
  currentRegions: Set<string>;
  subscriptions: Map<string, RegionSubscription>;
}

/**
 * Region subscription
 */
interface RegionSubscription {
  regionId: string;
  callback: (event: SpatialEvent) => void;
}

// =============================================================================
// SPATIAL CONTEXT PROVIDER
// =============================================================================

/**
 * Events emitted by the spatial context provider
 */
export interface SpatialContextProviderEvents {
  'entity:entered': (agentId: string, event: SpatialEvent) => void;
  'entity:exited': (agentId: string, event: SpatialEvent) => void;
  'region:entered': (agentId: string, event: SpatialEvent) => void;
  'region:exited': (agentId: string, event: SpatialEvent) => void;
  'visibility:changed': (agentId: string, event: SpatialEvent) => void;
  'context:updated': (agentId: string, context: SpatialContext) => void;
}

/**
 * Provides spatial context to agents
 */
export class SpatialContextProvider extends EventEmitter {
  private agents: Map<string, AgentState> = new Map();
  private entities: Map<string, SpatialEntity> = new Map();
  private regions: Map<string, Region> = new Map();
  private queryExecutor: SpatialQueryExecutor;
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor() {
    super();
    this.queryExecutor = new SpatialQueryExecutor();
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Start the spatial context provider
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Find minimum update interval across all agents
    const minInterval = this.getMinUpdateInterval();
    if (minInterval > 0) {
      this.updateInterval = setInterval(() => this.update(), minInterval);
    }
  }

  /**
   * Stop the spatial context provider
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Manual update (for testing or custom update loops)
   */
  update(): void {
    const now = Date.now();

    for (const [agentId, state] of this.agents) {
      this.updateAgentContext(agentId, state, now);
    }
  }

  // ===========================================================================
  // AGENT REGISTRATION
  // ===========================================================================

  /**
   * Register an agent for spatial awareness
   */
  registerAgent(
    agentId: string,
    position: Vector3,
    config: Partial<SpatialAwarenessConfig> = {}
  ): void {
    const fullConfig = { ...DEFAULT_SPATIAL_CONFIG, ...config };

    const state: AgentState = {
      id: agentId,
      position,
      config: fullConfig,
      lastContext: null,
      trackedEntities: new Map(),
      currentRegions: new Set(),
      subscriptions: new Map(),
    };

    this.agents.set(agentId, state);

    // Restart update loop to accommodate new agent's update rate
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * Update agent position
   */
  updateAgentPosition(agentId: string, position: Vector3, velocity?: Vector3): void {
    const state = this.agents.get(agentId);
    if (!state) return;

    state.position = position;
    state.velocity = velocity;
  }

  /**
   * Get agent's current spatial context
   */
  getContext(agentId: string): SpatialContext | null {
    const state = this.agents.get(agentId);
    return state?.lastContext || null;
  }

  // ===========================================================================
  // ENTITY MANAGEMENT
  // ===========================================================================

  /**
   * Add or update an entity
   */
  setEntity(entity: SpatialEntity): void {
    this.entities.set(entity.id, entity);
    this.rebuildQueryIndex();
  }

  /**
   * Remove an entity
   */
  removeEntity(entityId: string): void {
    this.entities.delete(entityId);
    this.rebuildQueryIndex();
  }

  /**
   * Batch update entities
   */
  setEntities(entities: SpatialEntity[]): void {
    this.entities.clear();
    for (const entity of entities) {
      this.entities.set(entity.id, entity);
    }
    this.rebuildQueryIndex();
  }

  /**
   * Get all entities
   */
  getEntities(): SpatialEntity[] {
    return Array.from(this.entities.values());
  }

  // ===========================================================================
  // REGION MANAGEMENT
  // ===========================================================================

  /**
   * Add or update a region
   */
  setRegion(region: Region): void {
    this.regions.set(region.id, region);
    this.queryExecutor.updateRegions(Array.from(this.regions.values()));
  }

  /**
   * Remove a region
   */
  removeRegion(regionId: string): void {
    this.regions.delete(regionId);
    this.queryExecutor.updateRegions(Array.from(this.regions.values()));
  }

  /**
   * Subscribe to region events for an agent
   */
  subscribeToRegion(
    agentId: string,
    regionId: string,
    callback: (event: SpatialEvent) => void
  ): void {
    const state = this.agents.get(agentId);
    if (!state) return;

    state.subscriptions.set(regionId, { regionId, callback });
  }

  /**
   * Unsubscribe from region events
   */
  unsubscribeFromRegion(agentId: string, regionId: string): void {
    const state = this.agents.get(agentId);
    if (!state) return;

    state.subscriptions.delete(regionId);
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Execute a spatial query
   */
  query(query: SpatialQuery): QueryResult[] {
    return this.queryExecutor.execute(query);
  }

  /**
   * Find nearest entities to position
   */
  findNearest(from: Vector3, count: number = 1, typeFilter?: string[]): QueryResult[] {
    return this.query({
      type: 'nearest',
      from,
      count,
      entityTypeFilter: typeFilter,
    });
  }

  /**
   * Find entities within radius
   */
  findWithin(from: Vector3, radius: number, typeFilter?: string[]): QueryResult[] {
    return this.query({
      type: 'within',
      from,
      radius,
      entityTypeFilter: typeFilter,
    });
  }

  /**
   * Find visible entities from position
   */
  findVisible(
    from: Vector3,
    direction?: Vector3,
    fov?: number,
    maxDistance?: number
  ): QueryResult[] {
    return this.query({
      type: 'visible',
      from,
      direction,
      fov,
      maxDistance,
    });
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Update context for a single agent
   */
  private updateAgentContext(agentId: string, state: AgentState, now: number): void {
    const { config, position } = state;

    // Get nearby entities
    const nearbyEntities = this.findEntitiesInRadius(position, config.perceptionRadius);

    // Filter by type if configured
    const filteredEntities =
      config.entityTypeFilter.length > 0
        ? nearbyEntities.filter((e) => config.entityTypeFilter.includes(e.type))
        : nearbyEntities;

    // Check for entity enter/exit events
    this.checkEntityEvents(agentId, state, filteredEntities, now);

    // Get current regions
    const currentRegions = this.findRegionsContaining(position);

    // Check for region enter/exit events
    this.checkRegionEvents(agentId, state, currentRegions, now);

    // Compute sight lines if enabled
    const sightLines: SightLine[] = config.computeSightLines
      ? this.computeSightLines(position, filteredEntities)
      : [];

    // Build context
    const context: SpatialContext = {
      agentPosition: position,
      agentVelocity: state.velocity,
      nearbyEntities: filteredEntities,
      currentRegions,
      allRegions: Array.from(this.regions.values()),
      sightLines,
      timestamp: now,
      updateRate: config.updateRate,
    };

    state.lastContext = context;

    this.emit('context:updated', agentId, context);
  }

  /**
   * Find entities within radius of position
   */
  private findEntitiesInRadius(position: Vector3, radius: number): SpatialEntity[] {
    const radiusSq = radius * radius;
    return Array.from(this.entities.values()).filter(
      (e) => distanceSquared(position, e.position) <= radiusSq
    );
  }

  /**
   * Find regions containing position
   */
  private findRegionsContaining(position: Vector3): Region[] {
    return Array.from(this.regions.values()).filter((r) => this.isInRegion(position, r));
  }

  /**
   * Check if position is in region
   */
  private isInRegion(position: Vector3, region: Region): boolean {
    if ('radius' in region.bounds) {
      return isPointInSphere(position, region.bounds as BoundingSphere);
    }
    return isPointInBox(position, region.bounds as BoundingBox);
  }

  /**
   * Check for entity enter/exit events
   */
  private checkEntityEvents(
    agentId: string,
    state: AgentState,
    currentEntities: SpatialEntity[],
    now: number
  ): void {
    const currentIds = new Set(currentEntities.map((e) => e.id));

    // Check for new entities (entered)
    for (const entity of currentEntities) {
      if (!state.trackedEntities.has(entity.id)) {
        const event: SpatialEvent = {
          type: 'entity_entered',
          entity,
          distance: distance(state.position, entity.position),
          timestamp: now,
        };
        this.emit('entity:entered', agentId, event);
      }
    }

    // Check for removed entities (exited) - use cached entity data
    for (const [entityId, cachedEntity] of state.trackedEntities) {
      if (!currentIds.has(entityId)) {
        const event: SpatialEvent = {
          type: 'entity_exited',
          entity: cachedEntity,
          timestamp: now,
        };
        this.emit('entity:exited', agentId, event);
      }
    }

    // Update tracked entities map with current entities
    const newTrackedEntities = new Map<string, SpatialEntity>();
    for (const entity of currentEntities) {
      newTrackedEntities.set(entity.id, entity);
    }
    state.trackedEntities = newTrackedEntities;
  }

  /**
   * Check for region enter/exit events
   */
  private checkRegionEvents(
    agentId: string,
    state: AgentState,
    currentRegions: Region[],
    now: number
  ): void {
    const currentIds = new Set(currentRegions.map((r) => r.id));

    // Check for new regions (entered)
    for (const region of currentRegions) {
      if (!state.currentRegions.has(region.id)) {
        const event: SpatialEvent = {
          type: 'region_entered',
          region,
          timestamp: now,
        };
        this.emit('region:entered', agentId, event);

        // Call subscription callback if exists
        const sub = state.subscriptions.get(region.id);
        if (sub) {
          sub.callback(event);
        }
      }
    }

    // Check for removed regions (exited)
    for (const regionId of state.currentRegions) {
      if (!currentIds.has(regionId)) {
        const region = this.regions.get(regionId);
        if (region) {
          const event: SpatialEvent = {
            type: 'region_exited',
            region,
            timestamp: now,
          };
          this.emit('region:exited', agentId, event);

          // Call subscription callback if exists
          const sub = state.subscriptions.get(regionId);
          if (sub) {
            sub.callback(event);
          }
        }
      }
    }

    state.currentRegions = currentIds;
  }

  /**
   * Compute sight lines to entities
   */
  private computeSightLines(from: Vector3, entities: SpatialEntity[]): SightLine[] {
    const allEntities = Array.from(this.entities.values());

    return entities.map((target) => {
      const dist = distance(from, target.position);
      const blocked = this.isLineBlocked(from, target.position, allEntities, target.id);

      return {
        from,
        to: target.position,
        blocked: blocked.blocked,
        blockingEntity: blocked.blockerId,
        distance: dist,
      };
    });
  }

  /**
   * Check if line between two points is blocked
   */
  private isLineBlocked(
    from: Vector3,
    to: Vector3,
    entities: SpatialEntity[],
    excludeId: string
  ): { blocked: boolean; blockerId?: string } {
    const dir = normalize(subtract(to, from));
    const maxDist = distance(from, to);

    for (const entity of entities) {
      if (entity.id === excludeId) continue;

      // Simple sphere intersection
      const radius = this.getEntityRadius(entity);
      const toEntity = subtract(entity.position, from);
      const projection = this.dot3(toEntity, dir);

      if (projection < 0 || projection > maxDist) continue;

      const closest = {
        x: from.x + dir.x * projection,
        y: from.y + dir.y * projection,
        z: from.z + dir.z * projection,
      };

      const distToLine = distance(closest, entity.position);
      if (distToLine < radius) {
        return { blocked: true, blockerId: entity.id };
      }
    }

    return { blocked: false };
  }

  /**
   * Get entity radius
   */
  private getEntityRadius(entity: SpatialEntity): number {
    if (!entity.bounds) return 0.5;
    if ('radius' in entity.bounds) {
      return (entity.bounds as BoundingSphere).radius;
    }
    const box = entity.bounds as BoundingBox;
    const dx = box.max.x - box.min.x;
    const dy = box.max.y - box.min.y;
    const dz = box.max.z - box.min.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
  }

  /**
   * Dot product
   */
  private dot3(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  /**
   * Rebuild the query executor index
   */
  private rebuildQueryIndex(): void {
    this.queryExecutor.updateEntities(Array.from(this.entities.values()));
  }

  /**
   * Get minimum update interval
   */
  private getMinUpdateInterval(): number {
    let minRate = 0;
    for (const state of this.agents.values()) {
      if (state.config.updateRate > minRate) {
        minRate = state.config.updateRate;
      }
    }
    return minRate > 0 ? 1000 / minRate : 0;
  }
}
