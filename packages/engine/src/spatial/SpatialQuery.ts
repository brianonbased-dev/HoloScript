/**
 * Spatial Query System
 * Sprint 4 Priority 4 - Spatial Context Awareness
 *
 * Provides efficient spatial queries for finding entities based on
 * distance, visibility, reachability, and region containment.
 */

import {
  Vector3,
  BoundingBox,
  BoundingSphere,
  SpatialEntity,
  Region,
  SightLine,
  distance,
  isPointInBox,
  isPointInSphere,
  normalize,
  subtract,
  scale,
  add,
  dot,
} from './SpatialTypes';

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Types of spatial queries
 */
export type SpatialQueryType =
  | 'nearest'
  | 'within'
  | 'visible'
  | 'reachable'
  | 'in_region'
  | 'by_type'
  | 'raycast';

/**
 * Base query interface
 */
export interface SpatialQueryBase {
  type: SpatialQueryType;
  from: Vector3;
  entityTypeFilter?: string[];
  maxResults?: number;
}

/**
 * Find nearest entities
 */
export interface NearestQuery extends SpatialQueryBase {
  type: 'nearest';
  count?: number;
}

/**
 * Find entities within radius
 */
export interface WithinQuery extends SpatialQueryBase {
  type: 'within';
  radius: number;
  includePartial?: boolean;
}

/**
 * Find visible entities
 */
export interface VisibleQuery extends SpatialQueryBase {
  type: 'visible';
  direction?: Vector3;
  fov?: number; // Field of view in degrees
  maxDistance?: number;
}

/**
 * Find reachable entities (pathfinding)
 */
export interface ReachableQuery extends SpatialQueryBase {
  type: 'reachable';
  maxDistance?: number;
  obstacles?: SpatialEntity[];
}

/**
 * Find entities in a region
 */
export interface InRegionQuery extends SpatialQueryBase {
  type: 'in_region';
  region: Region;
}

/**
 * Find entities by type
 */
export interface ByTypeQuery extends SpatialQueryBase {
  type: 'by_type';
  entityTypes: string[];
  radius?: number;
}

/**
 * Raycast query
 */
export interface RaycastQuery extends SpatialQueryBase {
  type: 'raycast';
  direction: Vector3;
  maxDistance: number;
  hitFirst?: boolean;
}

/**
 * Union of all query types
 */
export type SpatialQuery =
  | NearestQuery
  | WithinQuery
  | VisibleQuery
  | ReachableQuery
  | InRegionQuery
  | ByTypeQuery
  | RaycastQuery;

// =============================================================================
// QUERY RESULTS
// =============================================================================

/**
 * Single query result with distance
 */
export interface QueryResult {
  entity: SpatialEntity;
  distance: number;
  direction?: Vector3;
  sightLine?: SightLine;
}

/**
 * Raycast hit result
 */
export interface RaycastHit {
  entity: SpatialEntity;
  point: Vector3;
  distance: number;
  normal?: Vector3;
}

// =============================================================================
// SPATIAL QUERY EXECUTOR
// =============================================================================

/**
 * Executes spatial queries against a set of entities
 */
export class SpatialQueryExecutor {
  private entities: Map<string, SpatialEntity> = new Map();
  private regions: Map<string, Region> = new Map();
  private spatialIndex: SpatialIndex;

  constructor() {
    this.spatialIndex = new SpatialIndex();
  }

  /**
   * Update the entity set
   */
  updateEntities(entities: SpatialEntity[]): void {
    this.entities.clear();
    for (const entity of entities) {
      this.entities.set(entity.id, entity);
    }
    this.spatialIndex.rebuild(entities);
  }

  /**
   * Update regions
   */
  updateRegions(regions: Region[]): void {
    this.regions.clear();
    for (const region of regions) {
      this.regions.set(region.id, region);
    }
  }

  /**
   * Execute a spatial query
   */
  execute(query: SpatialQuery): QueryResult[] {
    // Apply entity type filter if specified
    let candidates = Array.from(this.entities.values());
    if (query.entityTypeFilter && query.entityTypeFilter.length > 0) {
      candidates = candidates.filter((e) => query.entityTypeFilter!.includes(e.type));
    }

    let results: QueryResult[];

    switch (query.type) {
      case 'nearest':
        results = this.executeNearest(query, candidates);
        break;
      case 'within':
        results = this.executeWithin(query, candidates);
        break;
      case 'visible':
        results = this.executeVisible(query, candidates);
        break;
      case 'reachable':
        results = this.executeReachable(query, candidates);
        break;
      case 'in_region':
        results = this.executeInRegion(query, candidates);
        break;
      case 'by_type':
        results = this.executeByType(query, candidates);
        break;
      case 'raycast':
        results = this.executeRaycast(query, candidates);
        break;
      default:
        results = [];
    }

    // Apply max results limit
    if (query.maxResults && results.length > query.maxResults) {
      results = results.slice(0, query.maxResults);
    }

    return results;
  }

  /**
   * Find nearest entities
   */
  private executeNearest(query: NearestQuery, candidates: SpatialEntity[]): QueryResult[] {
    const results: QueryResult[] = candidates.map((entity) => ({
      entity,
      distance: distance(query.from, entity.position),
      direction: normalize(subtract(entity.position, query.from)),
    }));

    results.sort((a, b) => a.distance - b.distance);

    const count = query.count || 1;
    return results.slice(0, count);
  }

  /**
   * Find entities within radius
   */
  private executeWithin(query: WithinQuery, candidates: SpatialEntity[]): QueryResult[] {
    const _radiusSq = query.radius * query.radius;

    return candidates
      .map((entity) => {
        const dist = distance(query.from, entity.position);
        return {
          entity,
          distance: dist,
          direction: normalize(subtract(entity.position, query.from)),
        };
      })
      .filter((r) => {
        if (query.includePartial && r.entity.bounds) {
          // Include if any part is within radius
          return r.distance - this.getEntityRadius(r.entity) <= query.radius;
        }
        return r.distance <= query.radius;
      })
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Find visible entities
   */
  private executeVisible(query: VisibleQuery, candidates: SpatialEntity[]): QueryResult[] {
    const results: QueryResult[] = [];
    const maxDist = query.maxDistance || Infinity;

    for (const entity of candidates) {
      const dir = subtract(entity.position, query.from);
      const dist = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);

      if (dist > maxDist) continue;
      if (dist === 0) continue;

      // Check FOV if direction specified
      if (query.direction && query.fov !== undefined) {
        const normalizedDir = normalize(dir);
        const dotProduct = dot(normalize(query.direction), normalizedDir);
        const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI);
        if (angle > query.fov / 2) continue;
      }

      // Check line of sight
      const sightLine = this.checkSightLine(query.from, entity.position, candidates, entity.id);

      if (!sightLine.blocked) {
        results.push({
          entity,
          distance: dist,
          direction: normalize(dir),
          sightLine,
        });
      }
    }

    return results.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Find reachable entities (simplified - no full pathfinding)
   */
  private executeReachable(query: ReachableQuery, candidates: SpatialEntity[]): QueryResult[] {
    const maxDist = query.maxDistance || Infinity;
    const obstacles = query.obstacles || [];

    return candidates
      .map((entity) => ({
        entity,
        distance: distance(query.from, entity.position),
        direction: normalize(subtract(entity.position, query.from)),
      }))
      .filter((r) => {
        if (r.distance > maxDist) return false;

        // Simple obstacle check - ray to entity doesn't hit obstacles
        const sight = this.checkSightLine(query.from, r.entity.position, obstacles, r.entity.id);
        return !sight.blocked;
      })
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Find entities in a region
   */
  private executeInRegion(query: InRegionQuery, candidates: SpatialEntity[]): QueryResult[] {
    return candidates
      .filter((entity) => this.isInRegion(entity.position, query.region))
      .map((entity) => ({
        entity,
        distance: distance(query.from, entity.position),
        direction: normalize(subtract(entity.position, query.from)),
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Find entities by type
   */
  private executeByType(query: ByTypeQuery, candidates: SpatialEntity[]): QueryResult[] {
    let filtered = candidates.filter((e) => query.entityTypes.includes(e.type));

    if (query.radius !== undefined) {
      filtered = filtered.filter((e) => distance(query.from, e.position) <= query.radius!);
    }

    return filtered
      .map((entity) => ({
        entity,
        distance: distance(query.from, entity.position),
        direction: normalize(subtract(entity.position, query.from)),
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Execute raycast
   */
  private executeRaycast(query: RaycastQuery, candidates: SpatialEntity[]): QueryResult[] {
    const results: QueryResult[] = [];
    const dir = normalize(query.direction);

    for (const entity of candidates) {
      const hit = this.raycastEntity(query.from, dir, entity, query.maxDistance);
      if (hit) {
        results.push({
          entity,
          distance: hit.distance,
          direction: dir,
        });
      }
    }

    results.sort((a, b) => a.distance - b.distance);

    if (query.hitFirst && results.length > 0) {
      return [results[0]];
    }

    return results;
  }

  /**
   * Check line of sight between two points
   */
  private checkSightLine(
    from: Vector3,
    to: Vector3,
    entities: SpatialEntity[],
    excludeId?: string
  ): SightLine {
    const dir = subtract(to, from);
    const dist = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    const normalizedDir = dist > 0 ? scale(dir, 1 / dist) : { x: 0, y: 0, z: 0 };

    for (const entity of entities) {
      if (entity.id === excludeId) continue;

      const hit = this.raycastEntity(from, normalizedDir, entity, dist);
      if (hit && hit.distance < dist - 0.001) {
        return {
          from,
          to,
          blocked: true,
          blockingEntity: entity.id,
          distance: dist,
        };
      }
    }

    return { from, to, blocked: false, distance: dist };
  }

  /**
   * Raycast against a single entity
   */
  private raycastEntity(
    origin: Vector3,
    direction: Vector3,
    entity: SpatialEntity,
    maxDistance: number
  ): RaycastHit | null {
    // Use bounding sphere approximation
    const radius = this.getEntityRadius(entity);
    const center = entity.position;

    // Ray-sphere intersection
    const oc = subtract(origin, center);
    const a = dot(direction, direction);
    const b = 2 * dot(oc, direction);
    const c = dot(oc, oc) - radius * radius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return null;

    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (t < 0 || t > maxDistance) return null;

    const point = add(origin, scale(direction, t));

    return {
      entity,
      point,
      distance: t,
      normal: normalize(subtract(point, center)),
    };
  }

  /**
   * Get approximate radius of an entity
   */
  private getEntityRadius(entity: SpatialEntity): number {
    if (!entity.bounds) return 0.5; // Default radius

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
   * Check if point is in region
   */
  private isInRegion(point: Vector3, region: Region): boolean {
    if ('radius' in region.bounds) {
      return isPointInSphere(point, region.bounds as BoundingSphere);
    }
    return isPointInBox(point, region.bounds as BoundingBox);
  }
}

// =============================================================================
// SPATIAL INDEX (Simple grid-based)
// =============================================================================

/**
 * Simple spatial index for fast queries
 */
class SpatialIndex {
  private cellSize: number = 10;
  private cells: Map<string, SpatialEntity[]> = new Map();

  /**
   * Rebuild the index with new entities
   */
  rebuild(entities: SpatialEntity[]): void {
    this.cells.clear();

    for (const entity of entities) {
      const cellKey = this.getCellKey(entity.position);
      const cell = this.cells.get(cellKey) || [];
      cell.push(entity);
      this.cells.set(cellKey, cell);
    }
  }

  /**
   * Get entities in neighboring cells
   */
  getNeighbors(position: Vector3, radius: number): SpatialEntity[] {
    const results: SpatialEntity[] = [];
    const cellRadius = Math.ceil(radius / this.cellSize);

    const cx = Math.floor(position.x / this.cellSize);
    const cy = Math.floor(position.y / this.cellSize);
    const cz = Math.floor(position.z / this.cellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dz = -cellRadius; dz <= cellRadius; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = this.cells.get(key);
          if (cell) {
            results.push(...cell);
          }
        }
      }
    }

    return results;
  }

  private getCellKey(position: Vector3): string {
    const cx = Math.floor(position.x / this.cellSize);
    const cy = Math.floor(position.y / this.cellSize);
    const cz = Math.floor(position.z / this.cellSize);
    return `${cx},${cy},${cz}`;
  }
}
